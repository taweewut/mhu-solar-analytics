// One day from the inverter's daily report, for the Day page of a home without 5-minute data
// (MhuHome: one row per day from the FusionSolar email, the newest being yesterday).

import { estimatesPv, isEstimated } from "@/lib/estimate";
import { flowsFrom, selfSufficiency, sumDaily, type EnergyTotals } from "@/lib/energy";
import type { Flows } from "@/lib/sankey";
import type { DailyRow } from "@/lib/types";

/** Days of measured PV before a day that its "vs 30-day average" compares against. */
export const AVG_WINDOW = 30;
/** Fewer measured days than this in the window (e.g. after an outage): no comparison. */
export const AVG_MIN_DAYS = 7;

export interface DayReport {
  row: DailyRow;
  /** The day's energy; load / import / export are 0 when the meter had no reading. */
  totals: EnergyTotals;
  /** The day has meter values (load and grid import), so the flows balance. */
  metered: boolean;
  /** Sankey flows; null without meter values (PV alone can't be split). */
  flows: Flows | null;
  /** Self-sufficiency %, rounded; null without meter values. */
  ss: number | null;
  /** Share of the day's solar used at home (not exported) %, rounded; null with no PV. */
  selfUse: number | null;
  /** Specific yield, kWh per kWp. */
  specific: number;
  /** Mean PV of the measured days in the 30 days before; null with too few of them. */
  avg: number | null;
  /** PV vs that mean, %, rounded; null when there's no mean. */
  vsAvg: number | null;
  /** Filled by the outage estimates (Settings), not measured. */
  estimated: boolean;
}

/** Days the Day page can show: every day with a PV value (measured or estimated), oldest first. */
export const reportDates = (daily: DailyRow[]): string[] =>
  daily.filter((d) => d.yield_kwh != null).map((d) => d.date).sort();

/** `iso` shifted by `n` days. */
const addDays = (iso: string, n: number): string => {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

/** The report for `date`, or null when that day has no PV value (not loaded / an outage). */
export function dayReport(daily: DailyRow[], date: string, kwp: number, battery: boolean): DayReport | null {
  const row = daily.find((d) => d.date === date);
  if (!row || row.yield_kwh == null) return null;
  const metered = row.load_kwh != null && row.from_grid_kwh != null;
  const pv = row.yield_kwh;
  const totals: EnergyTotals = metered
    ? sumDaily([row])
    : { pv, load: 0, charge: 0, discharge: 0, gridImport: 0, export: row.to_grid_kwh ?? 0 };

  const from = addDays(date, -AVG_WINDOW);
  const window = daily.filter((d) => d.date >= from && d.date < date && d.yield_kwh != null && !estimatesPv(d));
  const avg = window.length >= AVG_MIN_DAYS ? window.reduce((a, d) => a + d.yield_kwh!, 0) / window.length : null;

  return {
    row,
    totals,
    metered,
    flows: metered ? flowsFrom(totals, "stored", undefined, battery) : null,
    ss: metered ? Math.round(selfSufficiency(totals) * 100) : null,
    selfUse: pv > 0 ? Math.round(((pv - (totals.export ?? 0)) / pv) * 100) : null,
    specific: kwp > 0 ? pv / kwp : 0,
    avg,
    vsAvg: avg ? Math.round((pv / avg - 1) * 100) : null,
    estimated: isEstimated(row),
  };
}
