// Utility tariff + savings maths (project.md §5, README "Calculations"), per home.
//
//   Without-solar bill = Type 1.2 tiers on units + service + Ft × units, × 1.07 VAT
//   where units = inverter load − inverter import + billed units (load + the meter gap).
//   When the utility meter nets exports (billed units ≈ import − export), the gap is taken
//   against import − export, i.e. the export is added back: without solar there'd be nothing
//   to cancel imports with.
//   Saved = without-solar bill − actual bill (+ export × the home's export rate, if paid).
//   Payback = system cost ÷ average monthly saving.
//
// On a TOU bill (on/off-peak units logged, MEA since 03/2025) the solar the house used is
// added on top of the actual bill instead: weekday use at the on-peak rate, weekend use at
// off-peak, plus Ft, × VAT. Daily data can't split the hours, so this counts all weekday
// solar as on-peak (09:00–22:00) — a slight overestimate of what solar saves.
//
// Ft comes from the Ft history table; months it doesn't cover fall back to an Ft back-solved
// from the pre-solar baseline bill (what the mockup used before the table was wired).

import { estimatesPv, isEstimated } from "@/lib/estimate";
import type { Bill, DailyRow, FtRate, Tariff } from "@/lib/types";

/** PEA Type 1.2 (residential, > 150 units/month). MEA uses the same tiers, service ฿24.62. */
export const PEA_TARIFF: Tariff = {
  service: 38.22,
  tiers: [
    [150, 3.2484],
    [250, 4.2218],
    [null, 4.4217],
  ],
  touOn: null,
  touOff: null,
};
export const VAT = 1.07;

/** Energy charge for `units` on the progressive tiers (before service, Ft, VAT). */
export function energyCharge(units: number, tariff: Tariff = PEA_TARIFF): number {
  let r = 0;
  let left = Math.max(units, 0);
  for (const [n, p] of tariff.tiers) {
    const q = Math.min(left, n ?? Infinity);
    r += q * p;
    left -= q;
    if (left <= 0) break;
  }
  return r;
}

/** Full bill incl. VAT for `units` at a given Ft (THB/unit). */
export const peaBill = (units: number, ft: number, tariff: Tariff = PEA_TARIFF): number =>
  (energyCharge(units, tariff) + tariff.service + ft * units) * VAT;

/** The Ft that makes `peaBill(units, ft)` equal an actual bill. */
export const backSolveFt = (amount: number, units: number, tariff: Tariff = PEA_TARIFF): number =>
  (amount / VAT - energyCharge(units, tariff) - tariff.service) / units;

/** Solar the house used on a day (load − grid import), split weekday / weekend. */
export function selfUseSplit(days: DailyRow[]): { weekday: number; weekend: number } {
  let weekday = 0;
  let weekend = 0;
  for (const d of days) {
    const sc = Math.max(0, (d.load_kwh ?? 0) - (d.from_grid_kwh ?? 0));
    const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) weekend += sc;
    else weekday += sc;
  }
  return { weekday, weekend };
}

/** Without-solar estimate for a TOU bill: the actual bill + the solar used, priced by TOU. */
export function touWithoutSolar(amount: number, days: DailyRow[], ft: number, tariff: Tariff): number {
  const { weekday, weekend } = selfUseSplit(days);
  return amount + (weekday * (tariff.touOn ?? 0) + weekend * (tariff.touOff ?? 0) + ft * (weekday + weekend)) * VAT;
}

/** Residential Ft for a month, or `fallback` when the table has no row for it. */
export function ftFor(table: FtRate[], year: number, month: number, fallback: number): number {
  const row = table.find((r) => r.year === year && r.month === month && (r.type ?? 1) === 1);
  return row ? row.ft_rate : fallback;
}

export interface MonthTotals {
  key: string; // "2026-09"
  year: number;
  month: number;
  days: number;
  pv: number;
  grid: number;
  toBat: number;
  fromBat: number;
  load: number;
  export: number;
  /** Days with meter readings (import / consumption). load, grid and export sum only these. */
  meterDays: number;
  /** Days filled with an estimate, included in the sums above (meter values estimated). */
  estDays: number;
  /** Of those, days whose PV was estimated too (the rest had measured PV). */
  pvEstDays: number;
}

/**
 * Calendar-month sums of the daily inverter report. A day with no PV value isn't loaded and
 * isn't counted; a day with PV but no meter values (e.g. MhuHome, Sep 2021) adds to PV only —
 * missing values are never read as 0.
 */
export function monthlyTotals(daily: DailyRow[]): MonthTotals[] {
  const by = new Map<string, MonthTotals>();
  for (const d of daily) {
    if (d.yield_kwh == null) continue; // day not loaded
    const key = d.date.slice(0, 7);
    let m = by.get(key);
    if (!m) {
      m = { key, year: +key.slice(0, 4), month: +key.slice(5, 7), days: 0, pv: 0, grid: 0, toBat: 0, fromBat: 0, load: 0, export: 0, meterDays: 0, estDays: 0, pvEstDays: 0 };
      by.set(key, m);
    }
    m.days += 1;
    if (isEstimated(d)) {
      m.estDays += 1;
      if (estimatesPv(d)) m.pvEstDays += 1;
    }
    m.pv += d.yield_kwh;
    m.toBat += d.to_battery_kwh ?? 0;
    m.fromBat += d.from_battery_kwh ?? 0;
    if (d.load_kwh != null) {
      m.meterDays += 1;
      m.load += d.load_kwh;
      m.grid += d.from_grid_kwh ?? 0;
      m.export += d.to_grid_kwh ?? 0;
    }
  }
  // A month where every loaded day lacks PV isn't a month of data.
  for (const [k, m] of by) if (!m.days) by.delete(k);
  return [...by.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export interface BillRow {
  key: string; // "2026-08"
  year: number;
  month: number;
  units: number;
  amount: number;
  /** Grid import measured by the inverter's meter in the bill's usage month (kWh), net of
   *  export when the utility meter nets. */
  siteImport: number;
  siteDays: number;
  /** Billed units − inverter-measured import. */
  gap: number;
  /** Billed on a TOU meter (on/off-peak units logged). */
  tou: boolean;
  /** After switch-on but no inverter meter data for the month: no estimate, left out of savings. */
  noData: boolean;
  /** Days of the usage month filled with outage estimates (the saving is partly estimated). */
  estDays: number;
  /** Bill month is at or before commissioning — the "before solar" baseline. */
  pre: boolean;
  ft: number;
  /** Estimated bill without solar (THB). Equals `amount` for the baseline. */
  withoutSolar: number;
  saved: number;
  /** Effective rate, THB per billed unit. */
  perUnit: number;
}

export interface CurrentEstimate {
  key: string;
  year: number;
  month: number;
  days: number;
  firstDay: string;
  lastDay: string;
  saved: number;
  ft: number;
}

export interface SavingsModel {
  bills: BillRow[];
  post: BillRow[];
  baseline: BillRow | null;
  /** Ft back-solved from the baseline bill (fallback for months missing from the Ft table). */
  ftBackSolved: number;
  /** True when every post-solar month's Ft came from the history table. */
  ftFromTable: boolean;
  cumTotal: number;
  avgMonthly: number;
  gapAvg: number;
  /** Month with inverter data but no bill yet (e.g. September so far), estimated. */
  current: CurrentEstimate | null;
  /** 1 − latest bill ÷ baseline bill. */
  reduction: number | null;
}

export interface SavingsInput {
  bills: Bill[];
  daily: DailyRow[];
  ft: FtRate[];
  /** First day of solar data (commissioning), "YYYY-MM-DD". */
  commissioned: string;
  tariff?: Tariff;
  /** THB per exported kWh (0 = export earns nothing). */
  exportRate?: number;
  /** The utility meter nets exports against imports (see Home.meterNetsExport). */
  meterNetsExport?: boolean;
}

const usageKey = (b: Bill) => `${b.year}-${String(b.month).padStart(2, "0")}`;

export function buildSavings({ bills, daily, ft, commissioned, tariff = PEA_TARIFF, exportRate = 0, meterNetsExport = false }: SavingsInput): SavingsModel {
  const months = monthlyTotals(daily);
  const byKey = new Map(months.map((m) => [m.key, m]));
  const commKey = commissioned.slice(0, 7);
  // Bills are matched to solar data by the month the energy was used, not the bill date
  // (an MEA bill dated 08/05 is for April).
  const sorted = [...bills].sort((a, b) => usageKey(a).localeCompare(usageKey(b)));

  const baselineBill = sorted.filter((b) => usageKey(b) <= commKey && !b.on_peak_units).at(-1);
  const ftBackSolved = baselineBill ? backSolveFt(baselineBill.amount_thb, baselineBill.units, tariff) : 0;

  let ftFromTable = true;
  const rows: BillRow[] = sorted.map((b) => {
    const key = usageKey(b);
    const { year, month } = b;
    const m = byKey.get(key);
    // What the utility meter should have seen: import, or import − export when it nets.
    const siteImport = (m?.grid ?? 0) - (meterNetsExport ? (m?.export ?? 0) : 0);
    const pre = key <= commKey;
    const noData = !pre && (!m || m.meterDays === 0);
    const inTable = ft.some((r) => r.year === year && r.month === month);
    const rate = ftFor(ft, year, month, ftBackSolved);
    if (!pre && !inTable) ftFromTable = false;
    const tou = b.on_peak_units != null && b.off_peak_units != null && tariff.touOn != null && tariff.touOff != null;
    const withoutSolar = pre || noData
      ? b.amount_thb
      : tou
        ? touWithoutSolar(b.amount_thb, daily.filter((d) => d.date.startsWith(key)), rate, tariff)
        : peaBill((m?.load ?? 0) - siteImport + b.units, rate, tariff);
    const exportValue = pre || noData ? 0 : (m?.export ?? 0) * exportRate;
    return {
      key,
      year,
      month,
      units: b.units,
      amount: b.amount_thb,
      siteImport,
      siteDays: m?.days ?? 0,
      gap: b.units - siteImport,
      tou,
      noData,
      estDays: m?.estDays ?? 0,
      pre,
      ft: rate,
      withoutSolar,
      saved: pre || noData ? 0 : withoutSolar - b.amount_thb + exportValue,
      perUnit: b.amount_thb / b.units,
    };
  });

  const post = rows.filter((r) => !r.pre && !r.noData);
  const baseline = rows.filter((r) => r.pre).at(-1) ?? null;
  const cumTotal = post.reduce((a, b) => a + b.saved, 0);
  const avgMonthly = post.length ? cumTotal / post.length : 0;
  // The first post-solar bill's cycle still includes pre-solar days, so it's left out.
  const gapSample = post.length > 1 ? post.slice(1) : post;
  const gapAvg = gapSample.length ? gapSample.reduce((a, b) => a + b.gap, 0) / gapSample.length : 0;

  let current: CurrentEstimate | null = null;
  const billed = new Set(rows.map((r) => r.key));
  const last = months.at(-1);
  if (last && last.meterDays > 0 && !billed.has(last.key) && last.key > commKey) {
    const rate = ftFor(ft, last.year, last.month, ftBackSolved);
    const inMonth = daily.filter((d) => d.date.startsWith(last.key)).map((d) => d.date).sort();
    current = {
      key: last.key,
      year: last.year,
      month: last.month,
      days: last.days,
      firstDay: inMonth[0],
      lastDay: inMonth[inMonth.length - 1],
      ft: rate,
      saved: peaBill(last.load - last.grid + gapAvg, rate, tariff) - peaBill(last.grid + gapAvg, rate, tariff) + last.export * exportRate,
    };
  }

  const latest = post.at(-1);
  return {
    bills: rows,
    post,
    baseline,
    ftBackSolved,
    ftFromTable,
    cumTotal,
    avgMonthly,
    gapAvg,
    current,
    reduction: baseline && latest ? 1 - latest.amount / baseline.amount : null,
  };
}

export interface Payback {
  pct: number; // 0..1
  months: number;
  /** Projected payback date "YYYY-MM-DD": commissioning + ceil(months). */
  date: string | null;
}

export function payback(cumTotal: number, avgMonthly: number, systemCost: number, commissioned: string): Payback {
  const pct = systemCost > 0 ? Math.min(1, cumTotal / systemCost) : 0;
  if (avgMonthly <= 0) return { pct, months: Infinity, date: null };
  const months = systemCost / avgMonthly;
  const [y, m, d] = commissioned.split("-").map(Number);
  const when = new Date(Date.UTC(y, m - 1 + Math.ceil(months), d));
  return { pct, months, date: when.toISOString().slice(0, 10) };
}
