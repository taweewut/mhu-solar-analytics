// Health (2c): working state, alarms, peak PV, temperature, data completeness, MPPT balance.

import { integrateKwh, readingsFor } from "@/lib/energy";
import { hm, minuteOfDay } from "@/lib/format";
import { READINGS_PER_DAY } from "@/lib/system";
import type { FiveMinRow } from "@/lib/types";

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
