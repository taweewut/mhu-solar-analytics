import { describe, expect, it } from "vitest";
import { dataMonths, monthDays, monthTotal } from "@/lib/monthDays";
import type { DailyRow } from "@/lib/types";

const d = (date: string, pv: number, grid: number, toB: number, fromB: number, load: number): DailyRow => ({
  date, yield_kwh: pv, from_grid_kwh: grid, to_battery_kwh: toB, from_battery_kwh: fromB, load_kwh: load,
  to_grid_kwh: 0, generation_kwh: pv, gen_kwh: 0, smart_load_kwh: 0, ac_coupled_kwh: 0,
});

// Real rows from Inverter_Report_2026-08 / the Sep "Inverter History Report".
const DAILY = [
  d("2026-08-01", 18, 0.28, 8, 11, 19),
  d("2026-08-02", 23, 0.24, 12, 12, 20),
  d("2026-08-04", 23, 0.3, 13, 14, 20), // 03/08 missing
  d("2026-09-01", 17, 0.27, 8, 9, 15),
  d("2026-09-05", 27, 5.03, 14, 12, 28),
];

describe("monthDays", () => {
  it("lists every day of a finished month, with missing days as null", () => {
    const aug = monthDays(DAILY, "2026-08", 7.44);
    expect(aug).toHaveLength(31);
    expect(aug[0]).toMatchObject({ date: "2026-08-01", day: 1, weekday: "Sat" });
    expect(aug[2].data).toBeNull(); // 03/08 not in the report
    expect(aug[30].data).toBeNull();
  });

  it("stops a month in progress at its last loaded day", () => {
    expect(monthDays(DAILY, "2026-09", 7.44)).toHaveLength(5);
  });

  it("computes the KPI formulas per day", () => {
    const sep5 = monthDays(DAILY, "2026-09", 7.44)[4].data!;
    expect(sep5.ss).toBeCloseTo((1 - 5.03 / 28) * 100, 8); // self-sufficiency
    expect(sep5.sy).toBeCloseTo(27 / 7.44, 8); // specific yield
    expect(sep5.rt).toBeCloseTo((12 / 14) * 100, 8); // round-trip
  });

  it("totals only the loaded days", () => {
    const t = monthTotal(monthDays(DAILY, "2026-08", 7.44), 7.44);
    expect(t).toMatchObject({ days: 3, pv: 64, load: 59, toBat: 33, fromBat: 37 });
    expect(t.grid).toBeCloseTo(0.82, 8);
    expect(t.sy).toBeCloseTo(64 / 3 / 7.44, 8);
  });

  it("returns nothing for a month without rows, and lists months with data", () => {
    expect(monthDays(DAILY, "2026-07", 7.44)).toEqual([]);
    expect(dataMonths(DAILY)).toEqual(["2026-08", "2026-09"]);
  });
});

describe("the switch-on month", () => {
  it("starts on the install day", () => {
    const rows = [d("2020-09-23", 8.3, 9.5, 0, 0, 17.6), d("2020-09-30", 10.9, 13.8, 0, 0, 17.8)];
    const sep = monthDays(rows, "2020-09", 5, "2020-09-20");
    expect(sep[0]).toMatchObject({ date: "2020-09-20", day: 20, data: null });
    expect(sep).toHaveLength(11); // 20–30 Sep
    expect(monthDays(rows, "2020-09", 5)).toHaveLength(30); // without an install date: the whole month
  });
});

