// Test fixtures from the design handoff: design/data/day.json (23/09/2026, 5-min, to 12:18)
// and the monthly figures in project.md §2.

import type { DailyRow, FiveMinRow } from "@/lib/types";
import day from "./day.json";

const pad = (n: number) => String(n).padStart(2, "0");

/** day.json rows: [minuteOfDay, mppt1W, mppt2W, batteryW, gridW, gridLoadW, backupLoadW, soc, tempC, mppt1V, mppt2V]. */
export const DAY_ROWS: FiveMinRow[] = (day as number[][]).map((r) => ({
  time: `2026-09-23 ${pad(Math.floor(r[0] / 60))}:${pad(r[0] % 60)}:36`,
  working_state: "Normal",
  alarm_code: "",
  pv_w: r[1] + r[2],
  mppt1_w: r[1],
  mppt2_w: r[2],
  mppt1_v: r[9],
  mppt2_v: r[10],
  battery_w: r[3],
  grid_w: r[4],
  grid_load_w: r[5],
  backup_load_w: r[6],
  soc_pct: r[7],
  soh_pct: 99,
  temp_c: r[8],
  gen_w: 0,
  smart_w: 0,
  ac_coupled_w: 0,
  today_yield_kwh: null,
  today_to_battery_kwh: null,
  today_from_battery_kwh: null,
  today_from_grid_kwh: null,
  today_grid_load_kwh: null,
  today_backup_load_kwh: null,
  total_grid_load_kwh: null,
  total_backup_load_kwh: null,
}));

/** project.md §2: month, PV, from grid, to battery, from battery, load, days. */
export const PROJECT_MONTHS = [
  ["2026-03", 77, 2.8, 35, 35, 71, 3],
  ["2026-04", 819, 49.3, 428, 398, 765, 30],
  ["2026-05", 766, 32.2, 395, 349, 681, 31],
  ["2026-06", 718, 14.7, 357, 324, 628, 30],
  ["2026-07", 625, 12.0, 337, 318, 548, 31],
  ["2026-08", 591, 13.4, 324, 310, 520, 31],
  ["2026-09", 433, 15.9, 241, 193, 354, 23],
] as const;

/**
 * Daily rows whose monthly sums equal §2: the month's totals on its last day, zeros on the rest
 * (so day counts and month sums both match the report). March starts on 29/03 (commissioning).
 */
export const PROJECT_DAILY: DailyRow[] = PROJECT_MONTHS.flatMap(([key, pv, grid, toB, fromB, load, days]) => {
  const start = key === "2026-03" ? 29 : 1;
  return Array.from({ length: days }, (_, i) => {
    const lastDay = i === days - 1;
    return {
      date: `${key}-${pad(start + i)}`,
      yield_kwh: lastDay ? pv : 0,
      from_grid_kwh: lastDay ? grid : 0,
      to_battery_kwh: lastDay ? toB : 0,
      from_battery_kwh: lastDay ? fromB : 0,
      load_kwh: lastDay ? load : 0,
      to_grid_kwh: 0,
      generation_kwh: lastDay ? pv : 0,
      gen_kwh: 0,
      smart_load_kwh: 0,
      ac_coupled_kwh: 0,
    };
  });
});
