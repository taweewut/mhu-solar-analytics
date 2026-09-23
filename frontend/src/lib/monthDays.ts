// Day-by-day breakdown of one month from solis_daily.csv (the inverter monthly report).

import { roundTrip } from "@/lib/battery";
import { estimatesPv, isEstimated } from "@/lib/estimate";
import { specificYieldPerDay } from "@/lib/trends";
import type { DailyRow } from "@/lib/types";

export interface DayRow {
  date: string;
  day: number;
  weekday: string; // "Mon"
  /** Meter values estimated (see lib/estimate). */
  est: boolean;
  /** PV estimated too. */
  pvEst: boolean;
  /** null = no PV value for this day (not loaded / before switch-on). */
  data: {
    pv: number;
    /** Meter values; null on a day the report has PV but no meter readings. */
    load: number | null;
    grid: number | null;
    toBat: number;
    fromBat: number;
    export: number | null;
    /** Self-sufficiency %, null when the day has no load. */
    ss: number | null;
    /** kWh / kWp. */
    sy: number;
    /** Round-trip %, null when nothing was charged. */
    rt: number | null;
  } | null;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

function metrics(pv: number, load: number | null, grid: number | null, toBat: number, fromBat: number, exp: number | null, days: number, kwp: number) {
  const rt = roundTrip(fromBat, toBat);
  return {
    pv,
    load,
    grid,
    toBat,
    fromBat,
    export: exp,
    ss: load != null && load > 0 ? (1 - (grid ?? 0) / load) * 100 : null,
    sy: specificYieldPerDay(pv, days, kwp),
    rt: rt == null ? null : rt * 100,
  };
}

/**
 * Every calendar day of `month` ("2026-09") up to the last day with data in that month, so a
 * month in progress stops at "today" rather than showing future days as missing.
 */
export function monthDays(daily: DailyRow[], month: string, kwp: number, installed?: string): DayRow[] {
  // A day without a PV value isn't loaded (FusionSolar leaves the whole row blank) — it's
  // listed, hatched, but a month the report doesn't cover at all isn't.
  const inReport = daily.filter((d) => d.date.startsWith(month));
  if (!inReport.length) return [];
  const rows = new Map(inReport.filter((d) => d.yield_kwh != null).map((d) => [d.date, d]));
  const [y, m] = month.split("-").map(Number);
  const inMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastData = Math.max(...inReport.map((d) => +d.date.slice(8, 10)));
  const lastDaily = daily.at(-1)?.date ?? "";
  // A month that is still in progress ends at its last loaded day.
  const end = lastDaily.startsWith(month) ? lastData : inMonth;
  // The switch-on month starts at switch-on: earlier days aren't missing data, just before solar.
  const startDay = installed?.startsWith(month) ? +installed.slice(8, 10) : 1;
  return Array.from({ length: end - startDay + 1 }, (_, k) => {
    const i = k + startDay - 1;
    const date = `${month}-${pad(i + 1)}`;
    const d = rows.get(date);
    return {
      date,
      day: i + 1,
      weekday: WD[new Date(Date.UTC(y, m - 1, i + 1)).getUTCDay()],
      est: d ? isEstimated(d) : false,
      pvEst: d ? estimatesPv(d) : false,
      data: d
        ? d.load_kwh != null
          ? metrics(d.yield_kwh ?? 0, d.load_kwh, d.from_grid_kwh ?? 0, d.to_battery_kwh ?? 0, d.from_battery_kwh ?? 0, d.to_grid_kwh ?? 0, 1, kwp)
          : metrics(d.yield_kwh ?? 0, null, null, d.to_battery_kwh ?? 0, d.from_battery_kwh ?? 0, null, 1, kwp)
        : null,
    };
  });
}

/**
 * Totals for the loaded days of the month (specific yield per day averaged). Meter values sum
 * only the days that have them, and are null if none do.
 */
export function monthTotal(days: DayRow[], kwp: number) {
  const loaded = days.filter((d) => d.data).map((d) => d.data!);
  const metered = loaded.filter((x) => x.load != null);
  const s = (xs: typeof loaded, f: (x: (typeof loaded)[number]) => number) => xs.reduce((a, x) => a + f(x), 0);
  const m = metered.length > 0;
  return {
    days: loaded.length,
    meterDays: metered.length,
    ...metrics(
      s(loaded, (x) => x.pv),
      m ? s(metered, (x) => x.load!) : null,
      m ? s(metered, (x) => x.grid ?? 0) : null,
      s(loaded, (x) => x.toBat),
      s(loaded, (x) => x.fromBat),
      m ? s(metered, (x) => x.export ?? 0) : null,
      loaded.length,
      kwp,
    ),
  };
}

/** Months that have daily data, oldest first ("2026-03", …). */
export const dataMonths = (daily: DailyRow[]): string[] => [...new Set(daily.map((d) => d.date.slice(0, 7)))].sort();
