// Estimates for missing inverter data, anchored to the utility bills. Every day after
// switch-on whose PV or meter values are missing is filled and marked `estimated: true`; the raw
// CSVs are never changed, and Settings can turn estimates off.
//
//   PV      measured value if there is one; otherwise the daily average of the same month a
//           year earlier (else that month in another year).
//   Export  0 while the home was on zero export (no export in the real days around it);
//           otherwise PV × the share of PV exported in the reference month.
//   Import  from the bill: the month's billed units, minus what its real days already
//           imported, spread evenly over the missing days. While the meter netted exports
//           (billed units ≈ import − export) the day's estimated export is added back. With no
//           bill for the month — or the switch-on month, whose bill also covers pre-solar days —
//           the reference month's daily import.
//   Load    PV − export + import, so the day balances like the inverter's own report.
//
// Only homes without a battery are filled: a battery's charge / discharge can't be recovered
// from a bill.

import type { Bill, DailyRow, Home } from "@/lib/types";

export interface EstimatedRow extends DailyRow {
  estimated?: true;
  /** What was estimated: PV and meter values, or only the meter values (PV was measured). */
  estimatedParts?: "pv+meter" | "meter";
  /** Month the PV / export shares came from ("2024-11"). */
  estimatedFrom?: string;
  /** Grid import was taken from this month's bill. */
  importFromBill?: boolean;
}

const complete = (d: DailyRow) => d.yield_kwh != null && d.load_kwh != null && d.from_grid_kwh != null;

interface MonthAvg {
  pv: number;
  grid: number;
  export: number;
}

/** Per-day averages of one month over complete days (null if none). */
function monthAverage(daily: DailyRow[], month: string): MonthAvg | null {
  const days = daily.filter((d) => d.date.startsWith(month) && complete(d));
  if (!days.length) return null;
  const avg = (f: (d: DailyRow) => number) => days.reduce((a, d) => a + f(d), 0) / days.length;
  return { pv: avg((d) => d.yield_kwh!), grid: avg((d) => d.from_grid_kwh!), export: avg((d) => d.to_grid_kwh ?? 0) };
}

/** Reference month for `month`: a year earlier, else the nearest other year with complete days. */
function reference(daily: DailyRow[], month: string): { month: string; avg: MonthAvg } | null {
  const [y, m] = [+month.slice(0, 4), month.slice(5, 7)];
  const years = [...new Set(daily.map((d) => +d.date.slice(0, 4)))]
    .filter((yr) => yr !== y)
    .sort((a, b) => (a === y - 1 ? -1 : b === y - 1 ? 1 : Math.abs(a - y) - Math.abs(b - y) || b - a));
  for (const yr of years) {
    const key = `${yr}-${m}`;
    const avg = monthAverage(daily, key);
    if (avg) return { month: key, avg };
  }
  return null;
}

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** True if the real days within 30 days either side of `date` show no export at all. */
function zeroExportAround(daily: DailyRow[], date: string): boolean {
  const [from, to] = [shift(date, -30), shift(date, 30)];
  const near = daily.filter((d) => d.date >= from && d.date <= to && d.to_grid_kwh != null && complete(d));
  if (near.length) return near.every((d) => (d.to_grid_kwh ?? 0) === 0);
  // Deep inside a long outage: the nearest real days on each side.
  const before = daily.filter((d) => d.date < date && complete(d) && d.to_grid_kwh != null).at(-1);
  const after = daily.find((d) => d.date > date && complete(d) && d.to_grid_kwh != null);
  return [before, after].filter(Boolean).every((d) => (d!.to_grid_kwh ?? 0) === 0);
}

export interface FillOptions {
  bills: Bill[];
  /** The utility meter netted exports (billed units ≈ import − export). */
  meterNetsExport?: boolean;
  /** Switch-on date: days from here are filled, and a bill whose month began before it (so it
   *  also covers pre-solar days) isn't used for import. */
  installed?: string;
}

/** Fill every missing day after switch-on (see the file note). Unchanged for battery homes. */
export function fillMissing(daily: DailyRow[], home: Pick<Home, "battery">, opts: FillOptions): EstimatedRow[] {
  if (home.battery || !daily.length) return daily;
  const first = opts.installed ?? daily.find((d) => d.yield_kwh != null)?.date;
  if (!first) return daily;
  const missing = (d: DailyRow) => d.date >= first && !complete(d);
  const billFor = new Map(opts.bills.map((b) => [`${b.year}-${String(b.month).padStart(2, "0")}`, b]));
  const refs = new Map<string, ReturnType<typeof reference>>();
  const ref = (month: string) => {
    if (!refs.has(month)) refs.set(month, reference(daily, month));
    return refs.get(month)!;
  };

  // Pass 1: PV and export for each missing day.
  const partial = daily.map((d): EstimatedRow => {
    if (!missing(d)) return d;
    const r = ref(d.date.slice(0, 7));
    const noExport = zeroExportAround(daily, d.date);
    let pv = d.yield_kwh;
    if (pv == null) {
      if (!r) return d; // nothing to estimate PV from: stays missing
      pv = Math.max(0, noExport ? r.avg.pv - r.avg.export : r.avg.pv);
    }
    const exportShare = r && r.avg.pv > 0 ? r.avg.export / r.avg.pv : 0;
    return {
      ...d,
      yield_kwh: pv,
      generation_kwh: d.generation_kwh ?? pv,
      to_grid_kwh: noExport ? 0 : pv * exportShare,
      from_grid_kwh: null,
      load_kwh: null,
      estimated: true,
      estimatedParts: d.yield_kwh == null ? "pv+meter" : "meter",
      estimatedFrom: r?.month,
    };
  });

  // Pass 2: grid import from each month's bill, then load.
  const byMonth = new Map<string, EstimatedRow[]>();
  for (const d of partial) if (d.estimated) byMonth.set(d.date.slice(0, 7), [...(byMonth.get(d.date.slice(0, 7)) ?? []), d]);
  const importFor = new Map<string, { perDay: number; fromBill: boolean }>();
  for (const [month, est] of byMonth) {
    // A bill that also covers days before switch-on can't say what the solar days imported.
    const bill = opts.installed && opts.installed > `${month}-01` ? undefined : billFor.get(month);
    if (bill) {
      const real = partial.filter((d) => d.date.startsWith(month) && !d.estimated && complete(d));
      const net = (d: DailyRow) => (d.from_grid_kwh ?? 0) - (opts.meterNetsExport ? (d.to_grid_kwh ?? 0) : 0);
      const residual = bill.units - real.reduce((a, d) => a + net(d), 0);
      importFor.set(month, { perDay: residual / est.length, fromBill: true });
    } else {
      importFor.set(month, { perDay: ref(month)?.avg.grid ?? 0, fromBill: false });
    }
  }
  return partial.map((d) => {
    if (!d.estimated) return d;
    const { perDay, fromBill } = importFor.get(d.date.slice(0, 7))!;
    const exp = d.to_grid_kwh ?? 0;
    // Netting: the bill counted import − export, so this day's own export is added back.
    const imp = Math.max(0, perDay + (fromBill && opts.meterNetsExport ? exp : 0));
    return { ...d, from_grid_kwh: imp, load_kwh: d.yield_kwh! - exp + imp, importFromBill: fromBill };
  });
}

export const isEstimated = (d: DailyRow): boolean => (d as EstimatedRow).estimated === true;

/** The day's PV is an estimate too (not just its meter values). */
export const estimatesPv = (d: DailyRow): boolean => (d as EstimatedRow).estimatedParts === "pv+meter";

/** A short description of how a day was estimated, for its "est." marker. */
export function estimateNote(d: DailyRow, utility: string): string {
  const e = d as EstimatedRow;
  if (!e.estimated) return "";
  const from = e.estimatedFrom ? `${e.estimatedFrom.slice(5)}/${e.estimatedFrom.slice(0, 4)}` : "another year";
  const imp = e.importFromBill ? `grid import from the ${utility} bill` : `grid import from ${from}`;
  return e.estimatedParts === "meter" ? `PV measured; export and ${imp} estimated` : `PV estimated from ${from}'s daily average; ${imp}`;
}
