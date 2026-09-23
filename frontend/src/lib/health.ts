// Health (2c): working state, alarms, peak PV, temperature, data completeness, MPPT balance,
// and the battery BMS log (temperature, cell voltages).

import { integrateKwh, readingsFor } from "@/lib/energy";
import { hm, minuteOfDay } from "@/lib/format";
import { READINGS_PER_DAY } from "@/lib/system";
import type { BmsRow, FiveMinRow } from "@/lib/types";

/**
 * Readings expected for a day. A finished day expects 288; the day in progress expects one
 * every 5 minutes from its first reading to its last ((last − first) / 5 + 1).
 */
export function expectedReadings(firstT: number, lastT: number, inProgress: boolean): number {
  return inProgress ? Math.floor((lastT - firstT) / 5) + 1 : READINGS_PER_DAY;
}

/** Data completeness %, capped at 100. */
export const completeness = (received: number, expected: number): number =>
  expected > 0 ? Math.min(100, Math.round((received / expected) * 100)) : 0;

export interface DayCompleteness {
  date: string;
  received: number;
  expected: number;
  pct: number | null; // null = day not loaded
}

export function completenessFor(rows: FiveMinRow[], date: string, inProgress: boolean): DayCompleteness {
  const day = rows.filter((r) => r.time.startsWith(date));
  if (!day.length) return { date, received: 0, expected: READINGS_PER_DAY, pct: null };
  const expected = expectedReadings(minuteOfDay(day[0].time), minuteOfDay(day[day.length - 1].time), inProgress);
  return { date, received: day.length, expected, pct: completeness(day.length, expected) };
}

export interface LogRow {
  from: string;
  to: string;
  state: string;
  code: string; // "" = no alarm
  readings: number;
}

/** One row per run of identical (Working State, Alarm Code); a change starts a new row. */
export function stateLog(rows: FiveMinRow[]): LogRow[] {
  const out: LogRow[] = [];
  for (const r of rows) {
    const state = r.working_state || "—";
    const code = (r.alarm_code ?? "").trim();
    const t = hm(minuteOfDay(r.time));
    const cur = out[out.length - 1];
    if (cur && cur.state === state && cur.code === code) {
      cur.to = t;
      cur.readings += 1;
    } else out.push({ from: t, to: t, state, code, readings: 1 });
  }
  return out;
}

export interface HealthDay {
  readings: number;
  /** Most common working state and its share of readings (0..1). */
  state: string;
  stateShare: number;
  alarms: number;
  alarmCodes: string[];
  peakW: number;
  peakT: number;
  tempMax: number;
  tempMaxT: number;
  mppt1Kwh: number;
  mppt2Kwh: number;
}

export function healthDay(rows: FiveMinRow[], date: string): HealthDay | null {
  const day = rows.filter((r) => r.time.startsWith(date));
  const P = readingsFor(rows, date);
  if (!P.length) return null;
  const counts = new Map<string, number>();
  day.forEach((r) => counts.set(r.working_state || "—", (counts.get(r.working_state || "—") ?? 0) + 1));
  const [state, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const alarmRows = day.filter((r) => (r.alarm_code ?? "").trim() !== "");
  const peak = P.reduce((a, b) => (b.pv > a.pv ? b : a));
  const hot = P.reduce((a, b) => (b.temp > a.temp ? b : a));
  return {
    readings: day.length,
    state,
    stateShare: n / day.length,
    alarms: alarmRows.length,
    alarmCodes: [...new Set(alarmRows.map((r) => r.alarm_code.trim()))],
    peakW: peak.pv,
    peakT: peak.t,
    tempMax: hot.temp,
    tempMaxT: hot.t,
    mppt1Kwh: integrateKwh(P, (p) => p.mppt1),
    mppt2Kwh: integrateKwh(P, (p) => p.mppt2),
  };
}

export interface BmsDay {
  /** Samples that day, oldest first. */
  samples: number;
  /** [minute of day, value] per sample; null where the BMS sent nothing. */
  tempMin: [number, number | null][];
  tempMax: [number, number | null][];
  cellMin: [number, number | null][];
  cellMax: [number, number | null][];
  /** Warmest reading that day and when. */
  hottest: { t: number; c: number } | null;
  /** Latest cell spread (max − min) in mV: a growing spread = cells drifting out of balance. */
  spreadMv: number | null;
  /** Largest cell spread that day, mV. */
  maxSpreadMv: number | null;
}

/**
 * One day of battery BMS samples. The BMS reading is a live snapshot (no history), logged
 * every 15 min from the SolisCloud API, so it only exists from the day logging started.
 */
export function bmsDay(rows: BmsRow[], date: string): BmsDay | null {
  const day = rows.filter((r) => r.time.startsWith(date)).sort((a, b) => a.time.localeCompare(b.time));
  if (!day.length) return null;
  const at = (f: (r: BmsRow) => number | null) => day.map((r) => [minuteOfDay(r.time), f(r)] as [number, number | null]);
  let hottest: BmsDay["hottest"] = null;
  for (const r of day) {
    if (r.temp_max_c != null && (!hottest || r.temp_max_c > hottest.c)) hottest = { t: minuteOfDay(r.time), c: r.temp_max_c };
  }
  const spreads = day
    .filter((r) => r.cell_min_v != null && r.cell_max_v != null)
    .map((r) => Math.round((r.cell_max_v! - r.cell_min_v!) * 1000));
  return {
    samples: day.length,
    tempMin: at((r) => r.temp_min_c),
    tempMax: at((r) => r.temp_max_c),
    cellMin: at((r) => r.cell_min_v),
    cellMax: at((r) => r.cell_max_v),
    hottest,
    spreadMv: spreads.at(-1) ?? null,
    maxSpreadMv: spreads.length ? Math.max(...spreads) : null,
  };
}

/** "23/09/2026"-style first logged date, for "logged since …" notes. */
export const bmsSince = (rows: BmsRow[]): string | null =>
  rows.length ? rows.reduce((a, r) => (r.time < a ? r.time : a), rows[0].time).slice(0, 10) : null;
