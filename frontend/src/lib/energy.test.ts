import { describe, expect, it } from "vitest";
import { asOfDate, dayTotals, flowsFrom, lifetimeSplit, periodView, readingsFor, selfSufficiency } from "@/lib/energy";
import type { DailyRow, FiveMinRow } from "@/lib/types";

const row = (time: string, o: Partial<FiveMinRow> = {}): FiveMinRow => ({
  time, working_state: "Normal", alarm_code: "", pv_w: 0, mppt1_w: 0, mppt2_w: 0, mppt1_v: 0, mppt2_v: 0,
  battery_w: 0, grid_w: 0, grid_load_w: 0, backup_load_w: 0, soc_pct: 50, soh_pct: 99, temp_c: 40,
  gen_w: 0, smart_w: 0, ac_coupled_w: 0, today_yield_kwh: null, today_to_battery_kwh: null,
  today_from_battery_kwh: null, today_from_grid_kwh: null, today_grid_load_kwh: null,
  today_backup_load_kwh: null, total_grid_load_kwh: null, total_backup_load_kwh: null, ...o,
});

const daily = (date: string, pv: number, grid: number, toB: number, fromB: number, load: number): DailyRow => ({
  date, yield_kwh: pv, from_grid_kwh: grid, to_battery_kwh: toB, from_battery_kwh: fromB, load_kwh: load,
  to_grid_kwh: 0, generation_kwh: pv, gen_kwh: 0, smart_load_kwh: 0, ac_coupled_kwh: 0,
});

// Last reading of 23/09/2026 with the inverter's day counters (the real export).
const LAST = row("2026-09-23 12:18:49", {
  pv_w: 1449, battery_w: 0, backup_load_w: 1370, soc_pct: 100,
  today_yield_kwh: 14.6, today_to_battery_kwh: 10.7, today_from_battery_kwh: 4.6,
  today_from_grid_kwh: 0.1, today_grid_load_kwh: 0.1, today_backup_load_kwh: 7.2,
  total_grid_load_kwh: 213, total_backup_load_kwh: 3452,
});
const FIVE = [row("2026-09-23 00:03:36", { battery_w: -410, backup_load_w: 360, grid_w: -48, soc_pct: 62 }), LAST];

describe("readings", () => {
  it("converts to chart units: minute of day, grid import ≥ 0, load = both ports", () => {
    const [p] = readingsFor(FIVE, "2026-09-23");
    expect(p).toMatchObject({ t: 3, bat: -410, grid: 48, load: 360, soc: 62 });
  });
});

describe("dayTotals", () => {
  it("prefers the inverter's Today counters", () => {
    expect(dayTotals(FIVE, "2026-09-23")).toMatchObject({
      pv: 14.6, charge: 10.7, discharge: 4.6, gridImport: 0.1, load: 7.3, lastT: 738, count: 2,
    });
  });

  it("takes each counter's highest value: the inverter zeroes them just before midnight", () => {
    const rows = [
      row("2026-09-22 23:53:36", { today_yield_kwh: 13.6, today_from_battery_kwh: 9.4 }),
      row("2026-09-22 23:58:36", { today_yield_kwh: 0, today_from_battery_kwh: 0 }),
    ];
    expect(dayTotals(rows, "2026-09-22")).toMatchObject({ pv: 13.6, discharge: 9.4, lastT: 1438 });
  });

  it("integrates 5-min power when counters are missing", () => {
    const rows = [0, 5, 10].map((m) => row(`2026-09-22 10:${String(m).padStart(2, "0")}:00`, { pv_w: 1200 }));
    expect(dayTotals(rows, "2026-09-22")!.pv).toBeCloseTo(0.3, 8); // 3 × 1.2 kW × 5 min
  });

  it("returns null for a day with no readings", () => {
    expect(dayTotals(FIVE, "2026-09-22")).toBeNull();
  });
});

describe("flows", () => {
  it("reproduces the design's Today flows", () => {
    const f = flowsFrom({ pv: 14.6, load: 7.3, charge: 10.7, discharge: 4.6, gridImport: 0.1 }, "stored");
    expect(f.pvHome).toBeCloseTo(2.6, 8);
    expect(f.pvBat).toBeCloseTo(10.7, 8);
    expect(f.pvLoss).toBeCloseTo(1.3, 8);
    expect(f.batHome).toBeCloseTo(4.6, 8);
    expect(f.stored).toBeCloseTo(6.1, 8);
    expect(f.batLoss).toBeUndefined();
    expect(f.gridBat).toBe(0);
  });

  it("reproduces the design's Month flows", () => {
    const f = flowsFrom({ pv: 433, load: 354, charge: 241, discharge: 193, gridImport: 15.9 }, "loss");
    expect(f.pvHome).toBeCloseTo(145.1, 8);
    expect(f.pvLoss).toBeCloseTo(46.9, 8);
    expect(f.batLoss).toBeCloseTo(48, 8);
  });

  it("computes self-sufficiency as 1 − import / load", () => {
    expect(selfSufficiency({ load: 3567, gridImport: 140 })).toBeCloseTo(0.9608, 4);
    expect(selfSufficiency({ load: 0, gridImport: 0 })).toBe(0);
  });

  it("splits lifetime load by port from the lifetime counters", () => {
    expect(lifetimeSplit(FIVE)).toBe("Backup 94 % · Grid-load 6 %");
  });
});

describe("periodView", () => {
  const DAILY = [daily("2026-03-29", 16, 0.4, 6, 9, 16), daily("2026-09-01", 17, 0.27, 8, 9, 15), daily("2026-09-23", 14.1, 0.11, 10, 4, 7)];

  it("uses the latest 5-min day as today", () => {
    expect(asOfDate(FIVE, DAILY)).toBe("2026-09-23");
    const v = periodView("today", FIVE, DAILY);
    expect(v.range).toBe("23/09/2026 · 00:00–12:18");
    expect(v.ss).toBe(99);
    expect(v.captionEn).toBe("99 % of your home ran on the sun today");
    expect(v.captionTh).toBe("บ้านใช้ไฟจากแสงอาทิตย์ 99 % วันนี้");
    expect(v.flows.sub).toBe("Backup 7.2 · Grid-load 0.1");
  });

  it("shows a chosen past month with its own range and caption", () => {
    const rows = [...DAILY, daily("2026-08-01", 18, 0.28, 8, 11, 19), daily("2026-08-31", 15, 0.23, 9, 8, 13)].sort((a, b) => a.date.localeCompare(b.date));
    const aug = periodView("month", FIVE, rows, "2026-08");
    expect(aug.range).toBe("01/08 – 31/08/2026");
    expect(aug.totals.pv).toBe(33);
    expect(aug.totals.gridImport).toBeCloseTo(0.51, 8);
    expect(aug.captionEn).toBe(`${aug.ss} % of your home ran on the sun in August 2026`);
    expect(aug.captionTh).toBe(`บ้านใช้ไฟจากแสงอาทิตย์ ${aug.ss} % ในเดือนสิงหาคม 2569`);
    expect(aug.flows.sub).toBeUndefined();
    // The current month keeps "this month".
    expect(periodView("month", FIVE, rows, "2026-09").captionEn).toMatch(/this month$/);
  });

  it("labels month, year and lifetime ranges", () => {
    expect(periodView("month", FIVE, DAILY).range).toBe("01/09 – 23/09/2026");
    expect(periodView("month", FIVE, DAILY).flows.sub).toBeUndefined();
    const y = periodView("year", FIVE, DAILY);
    expect(y.range).toBe("2026 · live since 29/03/2026");
    expect(y.captionEn).toMatch(/in 2026$/);
    expect(y.flows.sub).toBe("Backup 94 % · Grid-load 6 %");
    expect(periodView("life", FIVE, DAILY).range).toBe("29/03/2026 – 23/09/2026");
  });
});

describe("a home without 5-minute data or a battery (MhuHome)", () => {
  const HUAWEI = [
    { ...daily("2021-05-01", 16.2, 7.3, 0, 0, 11.6), to_grid_kwh: 11.9, to_battery_kwh: null, from_battery_kwh: null },
    { ...daily("2021-05-02", 10, 9, 0, 0, 15), to_grid_kwh: 4, to_battery_kwh: null, from_battery_kwh: null },
  ];

  it("shows the latest day of the daily report as 'today', and says which day", () => {
    const v = periodView("today", [], HUAWEI, undefined, { battery: false });
    expect(v.range).toBe("02/05/2021 · daily report");
    expect(v.captionEn).toBe(`${v.ss} % of your home ran on the sun on 02/05/2021`);
    expect(v.captionTh).toBe(`บ้านใช้ไฟจากแสงอาทิตย์ ${v.ss} % วันที่ 02/05/2021`);
  });

  it("splits PV into home use and export, with no battery flows", () => {
    const f = periodView("life", [], HUAWEI, undefined, { battery: false }).flows;
    expect(f.battery).toBe(false);
    expect(f.pvExport).toBeCloseTo(15.9, 8);
    expect(f.pvHome).toBeCloseTo(26.6 - 16.3, 8); // load − import
    expect(f.gridHome).toBeCloseTo(16.3, 8);
    expect(f.pvLoss).toBeCloseTo(26.2 - 10.3 - 15.9, 8);
  });
});

describe("a period with no data (inverter offline)", () => {
  const blank = (date: string) => ({ ...daily(date, 0, 0, 0, 0, 0), yield_kwh: null, from_grid_kwh: null, load_kwh: null, to_grid_kwh: null });
  const rows = [daily("2025-10-30", 5.4, 8, 0, 0, 13.4), blank("2025-12-01"), blank("2025-12-02"), daily("2026-02-17", 9.1, 15.5, 0, 0, 24.6)];

  it("says 'No data' instead of 0 %", () => {
    const v = periodView("month", [], rows, "2025-12", { battery: false });
    expect(v.empty).toBe(true);
    expect(v.captionEn).toBe("No data in December 2025");
    expect(v.captionTh).toBe("ไม่มีข้อมูลในเดือนธันวาคม 2568");
    expect(periodView("month", [], rows, "2025-10", { battery: false }).empty).toBe(false);
  });
});
