// Trends (2a): calendar-month totals from solis_daily.csv, per day or per month.

import { MONTH_ABBR } from "@/lib/format";
import { monthlyTotals, type MonthTotals } from "@/lib/tariff";
import type { DailyRow } from "@/lib/types";

export type TrendMode = "day" | "total";

export interface MonthSlot {
  key: string; // "2026-09"
  year: number;
  month: number;
  label: string; // "Sep"
  daysInMonth: number;
  /** null = no daily rows for this month (a gap in the data): drawn as "not loaded". */
  data: MonthTotals | null;
  firstDay: number | null;
  lastDay: number | null;
}

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Every calendar month from the first daily row to the last, including empty ones. */
export function monthSlots(daily: DailyRow[]): MonthSlot[] {
  if (!daily.length) return [];
  const totals = new Map(monthlyTotals(daily).map((m) => [m.key, m]));
  const first = daily[0].date;
  const last = daily[daily.length - 1].date;
  const slots: MonthSlot[] = [];
  let y = +first.slice(0, 4);
  let m = +first.slice(5, 7);
  const endKey = last.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const days = daily.filter((d) => d.date.startsWith(key)).map((d) => +d.date.slice(8, 10));
    slots.push({
      key,
      year: y,
      month: m,
      label: MONTH_ABBR[m - 1],
      daysInMonth: daysIn(y, m),
      data: totals.get(key) ?? null,
      firstDay: days.length ? Math.min(...days) : null,
      lastDay: days.length ? Math.max(...days) : null,
    });
    if (key >= endKey) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return slots;
}

/** kWh per kWp — the array's output normalised by its size (the home's kWp). */
export const specificYield = (pvKwh: number, kwp: number): number => pvKwh / kwp;

/** kWh per kWp per day. */
export const specificYieldPerDay = (pvKwh: number, days: number, kwp: number): number =>
  days > 0 ? pvKwh / days / kwp : 0;

/** Self-sufficiency of a month, %; null without meter data. */
export const monthSelfSufficiency = (m: MonthTotals): number | null =>
  m.meterDays > 0 && m.load > 0 ? (1 - m.grid / m.load) * 100 : null;

export interface TrendSummary {
  pv: number;
  grid: number;
  load: number;
  days: number;
  /** Days with meter readings: grid and load are summed over these. */
  meterDays: number;
  best: MonthTotals | null;
  lowest: MonthTotals | null;
  highest: MonthTotals | null;
}

export function trendSummary(daily: DailyRow[]): TrendSummary {
  const months = monthlyTotals(daily);
  const sum = months.reduce(
    (a, m) => ({ pv: a.pv + m.pv, grid: a.grid + m.grid, load: a.load + m.load, days: a.days + m.days, meterDays: a.meterDays + m.meterDays }),
    { pv: 0, grid: 0, load: 0, days: 0, meterDays: 0 },
  );
  const by = (f: (m: MonthTotals) => number | null, dir: 1 | -1) => {
    const ok = months.filter((m) => f(m) != null);
    return ok.length ? ok.reduce((a, b) => (dir * (f(b)! - f(a)!) > 0 ? b : a)) : null;
  };
  return {
    ...sum,
    best: by((m) => m.pv, 1),
    lowest: by(monthSelfSufficiency, -1),
    highest: by(monthSelfSufficiency, 1),
  };
}

/** Footnote naming the partial months, e.g. "Mar = 3 days (live from 29/03). Sep = 1–23/09." */
export function partialMonthsNote(slots: MonthSlot[]): string {
  const parts: string[] = [];
  const pad = (n: number) => String(n).padStart(2, "0");
  const first = slots[0];
  const last = slots[slots.length - 1];
  if (first?.data && first.firstDay != null && first.firstDay > 1) {
    parts.push(`${first.label} = ${first.data.days} days (live from ${pad(first.firstDay)}/${pad(first.month)}).`);
  }
  if (last && last !== first && last.data && last.lastDay != null && last.lastDay < last.daysInMonth) {
    parts.push(`${last.label} = ${last.firstDay}–${last.lastDay}/${pad(last.month)}.`);
  }
  if (slots.some((s) => !s.data)) parts.push("Hatched months have no daily data loaded.");
  return parts.join(" ");
}
