// Energy accounting: day readings, day totals and per-period Sankey flows (project.md §5).
//
//   Self-sufficiency = 1 − grid import / load
//   Solar direct use (PV → Home) = load − battery discharge − grid import
//
// Solis doesn't split battery charging by source; with zero export and a self-use EMS the
// grid → battery flow is taken as 0 (drawn as the dashed zero link).

import { isEstimated } from "@/lib/estimate";
import type { Flows } from "@/lib/sankey";
import { dm, dmy, hm, minuteOfDay } from "@/lib/format";
import type { DailyRow, FiveMinRow, Period } from "@/lib/types";

/** One 5-min reading in the units the charts use (W, %, minutes after midnight). */
export interface Reading {
  t: number;
  pv: number;
  mppt1: number;
  mppt2: number;
  bat: number; // + charge, − discharge
  grid: number; // import, ≥ 0
  load: number;
  gridLoad: number;
  backupLoad: number;
  soc: number;
  soh: number | null;
  temp: number;
}

export function readingsFor(rows: FiveMinRow[], date: string): Reading[] {
  return rows
    .filter((r) => r.time.startsWith(date))
    .map((r) => {
      const mppt1 = r.mppt1_w ?? 0;
      const mppt2 = r.mppt2_w ?? 0;
      const gridLoad = r.grid_load_w ?? 0;
      const backupLoad = r.backup_load_w ?? 0;
      return {
        t: minuteOfDay(r.time),
        pv: r.pv_w ?? mppt1 + mppt2,
        mppt1,
        mppt2,
        bat: r.battery_w ?? 0,
        grid: Math.abs(r.grid_w ?? 0),
        load: gridLoad + backupLoad,
        gridLoad,
        backupLoad,
        soc: r.soc_pct ?? 0,
        soh: r.soh_pct,
        temp: r.temp_c ?? 0,
      };
    });
}

/**
 * kWh from 5-min power samples: each reading covers the minutes since the previous one
 * (5 for the first; gaps capped at 15 min so a missing hour isn't filled in).
 */
export function integrateKwh(P: Reading[], f: (p: Reading) => number): number {
  let e = 0;
  for (let i = 0; i < P.length; i++) {
    const dt = i ? P[i].t - P[i - 1].t : 5;
    e += (f(P[i]) * Math.min(dt, 15)) / 60 / 1000;
  }
  return e;
}

export interface DayTotals {
  date: string;
  /** Minute of the last reading. */
  lastT: number;
  count: number;
  pv: number;
  load: number;
  gridLoad: number;
  backupLoad: number;
  charge: number;
  discharge: number;
  gridImport: number;
  /** Solis 5-min data has no export counter (zero-export home). */
  export?: number;
}

/**
 * kWh totals for one day. Uses the inverter's own "Today …" counters from the last reading
 * (what SolisCloud reports); integrates the 5-min power only when a counter is missing.
 */
export function dayTotals(rows: FiveMinRow[], date: string): DayTotals | null {
  const day = rows.filter((r) => r.time.startsWith(date));
  if (!day.length) return null;
  const last = day[day.length - 1];
  const P = readingsFor(day, date);
  const pick = (v: number | null, f: (p: Reading) => number) => (v != null ? v : integrateKwh(P, f));
  const gridLoad = pick(last.today_grid_load_kwh, (p) => p.gridLoad);
  const backupLoad = pick(last.today_backup_load_kwh, (p) => p.backupLoad);
  return {
    date,
    lastT: minuteOfDay(last.time),
    count: day.length,
    pv: pick(last.today_yield_kwh, (p) => p.pv),
    gridLoad,
    backupLoad,
    load: gridLoad + backupLoad,
    charge: pick(last.today_to_battery_kwh, (p) => Math.max(p.bat, 0)),
    discharge: pick(last.today_from_battery_kwh, (p) => Math.max(-p.bat, 0)),
    gridImport: pick(last.today_from_grid_kwh, (p) => p.grid),
  };
}

export interface EnergyTotals {
  pv: number;
  load: number;
  charge: number;
  discharge: number;
  gridImport: number;
  /** PV sent to the grid (0 for a zero-export home). */
  export?: number;
}

export const selfSufficiency = (t: Pick<EnergyTotals, "load" | "gridImport">): number =>
  t.load > 0 ? 1 - t.gridImport / t.load : 0;

/**
 * Sankey flows from energy totals. `mode: "stored"` (a single day) shows the battery's net
 * gain as Stored; `"loss"` (a longer period) shows charge − discharge as battery losses.
 */
export function flowsFrom(t: EnergyTotals, mode: "stored" | "loss", sub?: string, battery = true): Flows {
  const gridBat = 0;
  const pvHome = Math.max(0, t.load - t.discharge - t.gridImport);
  const pvBat = Math.max(0, t.charge - gridBat);
  const pvExport = t.export ?? 0;
  const net = Math.max(0, t.charge - t.discharge);
  return {
    pvHome,
    pvBat,
    pvExport,
    pvLoss: Math.max(0, t.pv - pvHome - pvBat - pvExport),
    gridHome: t.gridImport,
    gridBat,
    batHome: t.discharge,
    ...(mode === "stored" ? { stored: net } : { batLoss: net }),
    sub,
    battery,
  };
}

/**
 * Energy totals over days that have both PV and meter values, so the flows balance; a day
 * missing either (not loaded, or no meter) is left out rather than read as 0.
 */
export function sumDaily(rows: DailyRow[]): EnergyTotals {
  return rows.filter((d) => d.yield_kwh != null && d.load_kwh != null).reduce(
    (a, d) => ({
      pv: a.pv + (d.yield_kwh ?? 0),
      load: a.load + (d.load_kwh ?? 0),
      charge: a.charge + (d.to_battery_kwh ?? 0),
      discharge: a.discharge + (d.from_battery_kwh ?? 0),
      gridImport: a.gridImport + (d.from_grid_kwh ?? 0),
      export: (a.export ?? 0) + (d.to_grid_kwh ?? 0),
    }),
    { pv: 0, load: 0, charge: 0, discharge: 0, gridImport: 0, export: 0 } as EnergyTotals,
  );
}

export const PERIODS: Record<Period, { label: string; th: string; en: string; thp: string }> = {
  today: { label: "Today", th: "วันนี้", en: "today", thp: "วันนี้" },
  month: { label: "Month", th: "เดือนนี้", en: "this month", thp: "เดือนนี้" },
  year: { label: "Year", th: "ปีนี้", en: "in {year}", thp: "ปีนี้" },
  life: { label: "Lifetime", th: "ทั้งหมด", en: "since switch-on", thp: "ตั้งแต่ติดตั้ง" },
};
export const PERIOD_KEYS = Object.keys(PERIODS) as Period[];

export interface PeriodView {
  period: Period;
  flows: Flows;
  totals: EnergyTotals;
  /** Self-sufficiency, rounded %. */
  ss: number;
  /** No day in the period has PV + meter values (e.g. an inverter outage): nothing to draw. */
  empty: boolean;
  /** Days in the period filled with outage estimates. */
  estDays: number;
  range: string;
  captionEn: string;
  captionTh: string;
}

/** Latest date with 5-min data ("today" for the dashboard), else the last daily row. */
export function asOfDate(fiveMin: FiveMinRow[], daily: DailyRow[]): string {
  const a = fiveMin.at(-1)?.time.slice(0, 10) ?? "";
  const b = daily.at(-1)?.date ?? "";
  return a > b ? a : b || a;
}

/** Home-label split for a single day: "Backup 7.2 · Grid-load 0.1". */
export const daySplit = (d: DayTotals): string =>
  `Backup ${d.backupLoad.toFixed(1)} · Grid-load ${d.gridLoad.toFixed(1)}`;

/** Lifetime split from the inverter's lifetime counters: "Backup 94 % · Grid-load 6 %". */
export function lifetimeSplit(fiveMin: FiveMinRow[]): string | undefined {
  const last = fiveMin.at(-1);
  const g = last?.total_grid_load_kwh;
  const b = last?.total_backup_load_kwh;
  if (g == null || b == null || g + b <= 0) return undefined;
  const bp = Math.round((b / (g + b)) * 100);
  return `Backup ${bp} % · Grid-load ${100 - bp} %`;
}

const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const EN_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The month ("YYYY-MM") or year ("YYYY") a period shows by default: the one containing as-of. */
export const defaultPick = (period: Period, asOf: string): string =>
  period === "month" ? asOf.slice(0, 7) : period === "year" ? asOf.slice(0, 4) : "";

/**
 * Sankey flows, range text and caption for a period. `pick` chooses which month ("YYYY-MM")
 * or year ("YYYY") Month / Year show; it defaults to the one containing the latest data.
 */
export interface PeriodOptions {
  /** false for a home without a battery (no battery node in the Sankey). */
  battery?: boolean;
}

export function periodView(period: Period, fiveMin: FiveMinRow[], daily: DailyRow[], pick?: string, opts: PeriodOptions = {}): PeriodView {
  const battery = opts.battery ?? true;
  const asOf = asOfDate(fiveMin, daily);
  const commissioned = daily[0]?.date ?? asOf;
  const sel = pick || defaultPick(period, asOf);
  const current = sel === defaultPick(period, asOf);
  const year = period === "year" ? sel : asOf.slice(0, 4);
  let totals: EnergyTotals;
  let flows: Flows;
  let range: string;

  let live = true;
  let used = 0; // days with PV + meter values behind the figures
  let estDays = 0;
  if (period === "today") {
    const d = dayTotals(fiveMin, asOf);
    if (d) {
      totals = { pv: d.pv, load: d.load, charge: d.charge, discharge: d.discharge, gridImport: d.gridImport };
      used = 1;
      flows = flowsFrom(totals, "stored", daySplit(d), battery);
      range = `${dmy(asOf)} · 00:00–${hm(d.lastT)}`;
    } else {
      // No 5-minute data (e.g. a Huawei home): the latest day in the daily report.
      live = false;
      const day = daily.filter((r) => r.date === asOf);
      used = day.filter((r) => r.yield_kwh != null && r.load_kwh != null).length;
      totals = sumDaily(day);
      flows = flowsFrom(totals, "stored", undefined, battery);
      range = `${dmy(asOf)} · daily report`;
    }
  } else {
    const rows = daily.filter((r) => r.date.startsWith(period === "life" ? "" : sel));
    used = rows.filter((r) => r.yield_kwh != null && r.load_kwh != null).length;
    estDays = rows.filter(isEstimated).length;
    totals = sumDaily(rows);
    const first = rows[0]?.date ?? asOf;
    const last = rows.at(-1)?.date ?? asOf;
    // The inverter's lifetime counters also describe a Year that holds the whole lifetime
    // (the first calendar year); any other month / year has no port split.
    const split =
      period === "life" || (period === "year" && commissioned.startsWith(sel) && asOf.startsWith(sel))
        ? lifetimeSplit(fiveMin)
        : undefined;
    flows = flowsFrom(totals, "loss", split, battery);
    range =
      period === "month"
        ? `${dm(first)} – ${dmy(last)}`
        : period === "year"
          ? current && commissioned.startsWith(year)
            ? `${year} · live since ${dmy(commissioned)}`
            : `${dmy(first)} – ${dmy(last)}`
          : `${dmy(commissioned)} – ${dmy(asOf)}`;
  }

  const ss = Math.round(selfSufficiency(totals) * 100);
  const p = PERIODS[period];
  let en = p.en.replace("{year}", year);
  let th = p.thp;
  if (period === "today" && !live) {
    en = `on ${dmy(asOf)}`;
    th = `วันที่ ${dmy(asOf)}`;
  } else if (period === "month" && !current) {
    const m = +sel.slice(5, 7) - 1;
    en = `in ${EN_MONTHS[m]} ${sel.slice(0, 4)}`;
    th = `ในเดือน${TH_MONTHS[m]} ${+sel.slice(0, 4) + 543}`;
  } else if (period === "year" && !current) {
    th = `ในปี ${+sel + 543}`;
  }
  const empty = used === 0;
  return {
    period,
    flows,
    totals,
    ss,
    empty,
    estDays,
    range,
    captionEn: empty ? `No data ${en}` : `${ss} % of your home ran on the sun ${en}`,
    captionTh: empty ? `ไม่มีข้อมูล${th}` : `บ้านใช้ไฟจากแสงอาทิตย์ ${ss} % ${th}`,
  };
}
