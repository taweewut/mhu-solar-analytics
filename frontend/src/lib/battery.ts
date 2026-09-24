// Battery (2b): SOC KPIs, the day × hour SOC and BMS-temperature heatmaps, cycles and
// round-trip efficiency.

import { readingsFor, type Reading } from "@/lib/energy";
import { minuteOfDay } from "@/lib/format";
import type { BmsRow, FiveMinRow } from "@/lib/types";

/** First reading with PV > 50 W — "SOC at sunrise" is its SOC. null if the sun never came up. */
export const sunriseReading = (P: Reading[]): Reading | null => P.find((p) => p.pv > 50) ?? null;

/** Equivalent full cycles = discharge ÷ usable capacity (the home's battery kWh). */
export const equivalentCycles = (dischargeKwh: number, capacityKwh: number): number => dischargeKwh / capacityKwh;

/** Round-trip efficiency = discharge ÷ charge (a ratio; null when nothing was charged). */
export const roundTrip = (dischargeKwh: number, chargeKwh: number): number | null =>
  chargeKwh > 0 ? dischargeKwh / chargeKwh : null;

/** Mean SOC per clock hour (rounded), null for hours without readings. */
export function hourlySoc(P: Reading[]): (number | null)[] {
  return Array.from({ length: 24 }, (_, h) => {
    const r = P.filter((p) => Math.floor(p.t / 60) === h);
    return r.length ? Math.round(r.reduce((a, p) => a + p.soc, 0) / r.length) : null;
  });
}

export type HeatCell =
  | { kind: "soc"; soc: number }
  | { kind: "future" } // later today
  | { kind: "missing" }; // no readings for that hour / day not loaded

export interface HeatRow {
  date: string;
  today: boolean;
  loaded: boolean;
  cells: HeatCell[];
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Last `days` days ending at `today`, newest first. */
export function socHeatmap(rows: FiveMinRow[], today: string, days = 14): HeatRow[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, -i);
    const P = readingsFor(rows, date);
    const isToday = date === today;
    const lastHour = P.length ? Math.floor(P[P.length - 1].t / 60) : -1;
    const cells: HeatCell[] = hourlySoc(P).map((soc, h) => {
      if (soc != null) return { kind: "soc", soc };
      if (isToday && h > lastHour) return { kind: "future" };
      return { kind: "missing" };
    });
    return { date, today: isToday, loaded: P.length > 0, cells };
  });
}

export interface Daylight {
  /** Median minute of day of the first / last reading with PV > 50 W. */
  rise: number;
  set: number;
  /** Days it's based on. */
  days: number;
  /** Heatmap columns: night [0, fromHour), day [fromHour, toHour), night [toHour, 24). */
  fromHour: number;
  toHour: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/**
 * When the sun is up (the battery charges) over the last `days` days: the median sunrise and
 * sunset seen in the data — first and last reading with PV > 50 W — not an almanac. An hour
 * column counts as day when most of it is between them. Today counts only once past sunset.
 */
export function daylight(rows: FiveMinRow[], today: string, days = 14): Daylight | null {
  const rise: number[] = [];
  const set: number[] = [];
  for (let i = 0; i < days; i++) {
    const P = readingsFor(rows, addDays(today, -i));
    const lit = P.filter((p) => p.pv > 50);
    if (!lit.length || P[P.length - 1].pv > 50) continue; // no sun, or the day isn't over yet
    rise.push(lit[0].t);
    set.push(lit[lit.length - 1].t);
  }
  if (!rise.length) return null;
  const r = median(rise);
  const st = median(set);
  return { rise: r, set: st, days: rise.length, fromHour: Math.round(r / 60), toHour: Math.round(st / 60) };
}

/** SOC fill (alias of socCell, used by the legend ramp). */
export const socFill = (soc: number): string => socCell(soc);

export type TempCell =
  | { kind: "temp"; c: number }
  | { kind: "future" } // after the last sample today
  | { kind: "before" } // before logging started: not tracked yet (not a gap, never hatched)
  | { kind: "missing" }; // logging was running but no sample arrived: no data

export interface TempRow {
  date: string;
  today: boolean;
  /** On or after the day logging started. */
  tracked: boolean;
  loaded: boolean;
  cells: TempCell[];
}

/**
 * Warmest BMS sensor per clock hour, last `days` days ending at `today`, newest first. The
 * BMS log is forward-only (a live reading sampled every 15 min): hours before its first
 * sample are "before" (not tracked yet), and only hours after it can be missing.
 */
export function tempHeatmap(rows: BmsRow[], today: string, days = 14): TempRow[] {
  const start = rows.reduce<string | null>((a, r) => (a == null || r.time < a ? r.time : a), null);
  const startDay = start?.slice(0, 10) ?? "9999-99-99";
  const startHour = start ? Math.floor(minuteOfDay(start) / 60) : 24;
  const byDay = new Map<string, BmsRow[]>();
  for (const r of rows) {
    const d = r.time.slice(0, 10);
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, -i);
    const day = byDay.get(date) ?? [];
    const isToday = date === today;
    const lastHour = day.length ? Math.max(...day.map((r) => Math.floor(minuteOfDay(r.time) / 60))) : -1;
    const cells: TempCell[] = Array.from({ length: 24 }, (_, h) => {
      if (date < startDay || (date === startDay && h < startHour)) return { kind: "before" };
      const vals = day
        .filter((r) => Math.floor(minuteOfDay(r.time) / 60) === h && r.temp_max_c != null)
        .map((r) => r.temp_max_c!);
      if (vals.length) return { kind: "temp", c: Math.max(...vals) };
      if (isToday && h > lastHour) return { kind: "future" };
      return { kind: "missing" };
    });
    return { date, today: isToday, tracked: date >= startDay, loaded: day.length > 0, cells };
  });
}

/** The loaded days with the lowest SOC (their hourly minimum), lowest first: the caption's examples. */
export function lowestDays(rows: HeatRow[], n = 2): { date: string; low: number }[] {
  return rows
    .map((r) => ({ date: r.date, low: Math.min(...r.cells.map((c) => (c.kind === "soc" ? c.soc : Infinity))) }))
    .filter((r) => Number.isFinite(r.low))
    .sort((a, b) => a.low - b.low)
    .slice(0, n);
}

/** SOC heatmap fill (review 3h): #3fa66a at 12 + 0.88·SOC %, over the ramp base (never the ground in dark). */
export const socCell = (soc: number): string => `color-mix(in srgb, #3fa66a ${Math.round(12 + 0.88 * soc)}%, var(--ramp-base))`;

/** Temperature fill (the one non-energy ramp): 20 °C → 45 °C into #e07a3a, from 12 % over the ramp base. */
export const tempFill = (c: number): string =>
  `color-mix(in srgb, #e07a3a ${Math.round(12 + 0.88 * Math.min(100, Math.max(0, ((c - 20) / 25) * 100)))}%, var(--ramp-base))`;
