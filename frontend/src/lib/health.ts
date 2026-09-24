// Health (2c): working state, alarms, peak PV, temperature, data completeness, MPPT balance,
// and the battery BMS log (temperature, cell voltages).

import { integrateKwh, readingsFor, type Reading } from "@/lib/energy";
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
  /** The newest sample with its readings. */
  latest: BmsRow;
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
    latest: day[day.length - 1],
  };
}

/** "23/09/2026"-style first logged date, for "logged since …" notes. */
export const bmsSince = (rows: BmsRow[]): string | null =>
  rows.length ? rows.reduce((a, r) => (r.time < a ? r.time : a), rows[0].time).slice(0, 10) : null;

/** A series needs this many samples in its window (6 h at 15 min) before it's drawn as a chart;
 *  below that it's a value block (review 3b §5 "sparse series"). */
export const SPARSE_MIN = 24;

/**
 * String balance (review 3f): MPPT2 ÷ MPPT1 in % for readings with PV above 400 W (at low
 * light the ratio is noise); null elsewhere, which breaks the line.
 */
export function stringRatio(P: Reading[]): [number, number | null][] {
  return P.map((p) => [p.t, p.mppt1 + p.mppt2 > 400 && p.mppt1 > 0 ? (p.mppt2 / p.mppt1) * 100 : null]);
}

/** Completeness cell shade (review: ink ramp, not battery green): 100 % → 28 %, ≥ 95 % → 16 %, else 8 %. */
export const completenessShade = (pct: number): string =>
  `color-mix(in srgb, var(--color-text) ${pct >= 100 ? 28 : pct >= 95 ? 16 : 8}%, transparent)`;

export interface HealthHistoryRow {
  date: string;
  /** No alarms and a Normal working state all day. */
  ok: boolean;
  state: string;
  alarms: number;
  /** MPPT2 ÷ MPPT1 energy, % (null without PV). */
  balance: number | null;
  peakW: number;
  tempMax: number;
  /** Data completeness %, against 288 (or so far, for the day in progress). */
  pct: number;
  /** Warmest BMS reading that day (null before battery logging started). */
  batMax: number | null;
  /** Battery state of health at the day's last reading (null without a battery / reading). */
  soh: number | null;
  alarmCodes: string[];
}

/**
 * One health line per day with 5-minute data, newest first (the Health page's history table).
 * `latest` is the day in progress, whose completeness counts only up to its last reading.
 */
export function healthHistory(rows: FiveMinRow[], bms: BmsRow[], dates: string[], latest: string, live: boolean): HealthHistoryRow[] {
  const byDay = new Map<string, FiveMinRow[]>();
  for (const r of rows) {
    const d = r.time.slice(0, 10);
    const list = byDay.get(d);
    if (list) list.push(r);
    else byDay.set(d, [r]);
  }
  const batMax = new Map<string, number>();
  for (const b of bms) {
    const d = b.time.slice(0, 10);
    if (b.temp_max_c != null) batMax.set(d, Math.max(batMax.get(d) ?? -Infinity, b.temp_max_c));
  }
  return [...dates]
    .reverse()
    .map((date) => {
      const day = byDay.get(date) ?? [];
      const h = healthDay(day, date);
      if (!h) return null;
      const c = completenessFor(day, date, live && date === latest);
      return {
        date,
        ok: h.alarms === 0 && /normal/i.test(h.state) && h.stateShare === 1,
        state: h.state,
        alarms: h.alarms,
        balance: h.mppt1Kwh > 0 ? Math.round((h.mppt2Kwh / h.mppt1Kwh) * 100) : null,
        peakW: h.peakW,
        tempMax: h.tempMax,
        pct: c.pct ?? 0,
        batMax: batMax.get(date) ?? null,
        soh: [...day].reverse().find((r) => r.soh_pct != null)?.soh_pct ?? null,
        alarmCodes: h.alarmCodes,
      };
    })
    .filter((r): r is HealthHistoryRow => r != null);
}

export type HealthWindow = "1m" | "3m" | "6m" | "all";

export const HEALTH_WINDOWS: [HealthWindow, string, string][] = [
  ["1m", "1M", "1 เดือน"],
  ["3m", "3M", "3 เดือน"],
  ["6m", "6M", "6 เดือน"],
  ["all", "Since start", "ทั้งหมด"],
];

const shiftMonths = (iso: string, m: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - m);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** First day of a window ending at `latest` (inclusive), never before `first` (switch-on). */
export function windowStart(w: HealthWindow, latest: string, first: string): string {
  if (w === "all") return first;
  const from = shiftMonths(latest, w === "1m" ? 1 : w === "3m" ? 3 : 6);
  return from < first ? first : from;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

export interface HealthSummary {
  from: string;
  to: string;
  /** Calendar days in the window, and how many have 5-minute data. */
  days: number;
  loaded: number;
  normal: number;
  alarms: number;
  alarmCodes: string[];
  /** Mean completeness over the calendar days (a day without data counts 0 %). */
  dataPct: number;
  lowDataDays: number;
  balanceAvg: number | null;
  balanceMin: number | null;
  balanceMax: number | null;
  balanceOut: number;
  hottest: { date: string; c: number } | null;
  hotDays: number;
  tempAvg: number | null;
  peak: { date: string; w: number } | null;
  clipDays: number;
  batMax: { date: string; c: number } | null;
  sohStart: { date: string; v: number } | null;
  sohEnd: { date: string; v: number } | null;
}

/**
 * Roll the daily health lines (healthHistory, newest first) up over a window: normal days,
 * data completeness, string balance, inverter heat, peak PV, battery. Thresholds as in the
 * history table: balance 95–105 %, inverter 60 °C, data 95 %, clipping at 95 % of rated.
 */
export function healthSummary(history: HealthHistoryRow[], from: string, to: string, ratedW: number | null): HealthSummary {
  const rows = history.filter((r) => r.date >= from && r.date <= to);
  const days = daysBetween(from, to);
  const bal = rows.map((r) => r.balance).filter((v): v is number => v != null);
  const byMax = <T>(xs: T[], f: (x: T) => number) => xs.reduce<T | null>((a, x) => (a == null || f(x) > f(a) ? x : a), null);
  const hot = byMax(rows, (r) => r.tempMax);
  const pk = byMax(rows, (r) => r.peakW);
  const bat = byMax(rows.filter((r) => r.batMax != null), (r) => r.batMax!);
  const soh = rows.filter((r) => r.soh != null);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : null);
  return {
    from,
    to,
    days,
    loaded: rows.length,
    normal: rows.filter((r) => r.ok).length,
    alarms: rows.reduce((a, r) => a + r.alarms, 0),
    alarmCodes: [...new Set(rows.flatMap((r) => r.alarmCodes))],
    dataPct: Math.round(rows.reduce((a, r) => a + r.pct, 0) / Math.max(days, 1)),
    lowDataDays: rows.filter((r) => r.pct < 95).length,
    balanceAvg: bal.length ? Math.round(mean(bal)!) : null,
    balanceMin: bal.length ? Math.min(...bal) : null,
    balanceMax: bal.length ? Math.max(...bal) : null,
    balanceOut: bal.filter((v) => v < 95 || v > 105).length,
    hottest: hot ? { date: hot.date, c: hot.tempMax } : null,
    hotDays: rows.filter((r) => r.tempMax >= 60).length,
    tempAvg: rows.length ? Math.round(mean(rows.map((r) => r.tempMax))! * 10) / 10 : null,
    peak: pk ? { date: pk.date, w: pk.peakW } : null,
    clipDays: ratedW ? rows.filter((r) => r.peakW >= 0.95 * ratedW).length : 0,
    batMax: bat ? { date: bat.date, c: bat.batMax! } : null,
    sohStart: soh.length ? { date: soh[soh.length - 1].date, v: soh[soh.length - 1].soh! } : null,
    sohEnd: soh.length ? { date: soh[0].date, v: soh[0].soh! } : null,
  };
}
