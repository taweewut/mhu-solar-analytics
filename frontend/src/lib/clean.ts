// Data-quality rules applied when a home's data loads.

import type { DailyRow, Home } from "@/lib/types";

const blankDay = (date: string): DailyRow => ({
  date, yield_kwh: null, to_grid_kwh: null, from_grid_kwh: null, to_battery_kwh: null, from_battery_kwh: null,
  load_kwh: null, generation_kwh: null, gen_kwh: null, smart_load_kwh: null, ac_coupled_kwh: null,
});

/**
 * One row per calendar day from switch-on to the last report day: days the reports don't cover
 * (MhuHome: installed 20/09/2020, reports start 23/09) become blank rows — missing, not 0 — so
 * they count as "not loaded" and can be estimated.
 */
export function padDays(daily: DailyRow[], installed?: string): DailyRow[] {
  if (!daily.length) return daily;
  const start = installed && installed < daily[0].date ? installed : daily[0].date;
  const have = new Map(daily.map((d) => [d.date, d]));
  const out: DailyRow[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const end = daily[daily.length - 1].date;
  for (let iso = start; iso <= end; d.setUTCDate(d.getUTCDate() + 1), iso = d.toISOString().slice(0, 10)) {
    out.push(have.get(iso) ?? blankDay(iso));
  }
  return out;
}

const noMeter = (d: DailyRow): DailyRow => ({ ...d, from_grid_kwh: null, to_grid_kwh: null, load_kwh: null });

/**
 * Meter values that can't be trusted become missing (never 0), keeping the day's PV:
 *
 * - load without grid import (MhuHome, 22 days of May and all of Jun–Aug 2021): self-use
 *   would read as the whole load;
 * - a day showing 0 import in a home without a battery: it draws from the grid every night,
 *   so the meter wasn't reading.
 */
export function cleanDaily(daily: DailyRow[], home: Pick<Home, "battery">): DailyRow[] {
  return daily.map((d) => {
    if (d.load_kwh != null && d.from_grid_kwh == null) return noMeter(d);
    if (!home.battery && d.from_grid_kwh === 0 && (d.load_kwh ?? 0) > 0) return noMeter(d);
    return d;
  });
}
