// TOU meter analysis: what each TOU bill cost vs the normal (progressive) tariff for the same
// units, and how the on-peak share compares with the break-even share.
//
//   TOU energy    = on-peak units × on-peak rate + off-peak units × off-peak rate
//   Normal energy = the Type 1.2 tiers on the same total units
//   TOU saving    = (normal − TOU energy) × VAT. Service charge and Ft × units are the same
//                   on both tariffs, so they cancel.
//   Break-even on-peak share = the share at which both cost the same:
//                   (normal energy − units × off-peak) ÷ (units × (on-peak − off-peak))
//   Below it TOU is cheaper; above it the normal tariff would have been.
//
// On-peak = Mon–Fri 09:00–22:00; off-peak = nights, weekends and public holidays.

import { energyCharge, selfUseSplit, VAT } from "@/lib/tariff";
import type { Bill, DailyRow, Tariff } from "@/lib/types";

export interface TouRow {
  key: string; // usage month "2025-03"
  year: number;
  month: number;
  on: number;
  off: number;
  units: number;
  /** on + off = billed units. False for a row with a stale (copied-down) split. */
  valid: boolean;
  onShare: number; // 0..1
  breakEven: number; // 0..1
  touEnergy: number; // THB, before VAT
  normalEnergy: number; // THB, before VAT
  /** (normal − TOU energy) × VAT: positive = TOU was cheaper. */
  saved: number;
  amount: number; // the bill paid, incl. VAT
  /**
   * On-peak share if solar hadn't covered the home's weekday daytime use: (on + weekday solar
   * self-use) ÷ (units + all solar self-use). null without meter data for the month.
   */
  onShareNoSolar: number | null;
}

export interface TouSummary {
  rows: TouRow[];
  valid: TouRow[];
  first: TouRow | null;
  /** Σ on-peak ÷ Σ units over the valid months. */
  onShare: number;
  /** Units-weighted break-even share. */
  breakEven: number;
  saved: number;
  avgSaved: number;
  /** Energy THB per unit (before VAT) on TOU vs on the normal tariff. */
  touRate: number;
  normalRate: number;
  onShareNoSolar: number | null;
}

/** On-peak share at which TOU and the normal tariff cost the same for `units`. */
export function breakEvenShare(units: number, tariff: Tariff): number {
  const on = tariff.touOn ?? 0;
  const off = tariff.touOff ?? 0;
  if (units <= 0 || on <= off) return 0;
  return (energyCharge(units, tariff) - units * off) / (units * (on - off));
}

export function touRow(b: Bill, tariff: Tariff, daily: DailyRow[] = []): TouRow | null {
  if (b.on_peak_units == null || b.off_peak_units == null || tariff.touOn == null || tariff.touOff == null) return null;
  const on = b.on_peak_units;
  const off = b.off_peak_units;
  const units = b.units;
  const key = `${b.year}-${String(b.month).padStart(2, "0")}`;
  const touEnergy = on * tariff.touOn + off * tariff.touOff;
  const normalEnergy = energyCharge(units, tariff);
  const days = daily.filter((d) => d.date.startsWith(key) && d.load_kwh != null && d.from_grid_kwh != null);
  const sc = days.length ? selfUseSplit(days) : null;
  return {
    key,
    year: b.year,
    month: b.month,
    on,
    off,
    units,
    valid: Math.abs(on + off - units) < 0.5,
    onShare: units > 0 ? on / units : 0,
    breakEven: breakEvenShare(units, tariff),
    touEnergy,
    normalEnergy,
    saved: (normalEnergy - touEnergy) * VAT,
    amount: b.amount_thb,
    onShareNoSolar: sc ? (on + sc.weekday) / (units + sc.weekday + sc.weekend) : null,
  };
}

export function touAnalysis(bills: Bill[], daily: DailyRow[], tariff: Tariff): TouSummary | null {
  const rows = bills
    .map((b) => touRow(b, tariff, daily))
    .filter((r): r is TouRow => r != null)
    .sort((a, b) => a.key.localeCompare(b.key));
  if (!rows.length) return null;
  const valid = rows.filter((r) => r.valid);
  const sum = (f: (r: TouRow) => number, rs = valid) => rs.reduce((a, r) => a + f(r), 0);
  const units = sum((r) => r.units);
  const withMeter = valid.filter((r) => r.onShareNoSolar != null);
  const wUnits = sum((r) => r.units, withMeter);
  return {
    rows,
    valid,
    first: rows[0],
    onShare: units ? sum((r) => r.on) / units : 0,
    breakEven: units ? sum((r) => r.breakEven * r.units) / units : 0,
    saved: sum((r) => r.saved),
    avgSaved: valid.length ? sum((r) => r.saved) / valid.length : 0,
    touRate: units ? sum((r) => r.touEnergy) / units : 0,
    normalRate: units ? sum((r) => r.normalEnergy) / units : 0,
    onShareNoSolar: wUnits ? sum((r) => r.onShareNoSolar! * r.units, withMeter) / wUnits : null,
  };
}

/** Month exports stopped: the last month with export > 0 before a run of zero-export months. */
export function exportStop(daily: DailyRow[]): { lastMonth: string; avgBefore: number } | null {
  const byMonth = new Map<string, number>();
  for (const d of daily) if (d.to_grid_kwh != null) byMonth.set(d.date.slice(0, 7), (byMonth.get(d.date.slice(0, 7)) ?? 0) + d.to_grid_kwh);
  const keys = [...byMonth.keys()].sort();
  const lastExport = [...keys].reverse().find((k) => (byMonth.get(k) ?? 0) > 1);
  if (!lastExport || lastExport === keys.at(-1)) return null; // still exporting
  const before = keys.filter((k) => k < lastExport).slice(-12);
  const avgBefore = before.length ? before.reduce((a, k) => a + (byMonth.get(k) ?? 0), 0) / before.length : 0;
  return { lastMonth: lastExport, avgBefore };
}
