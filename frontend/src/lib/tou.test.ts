import { describe, expect, it } from "vitest";
import { breakEvenShare, exportStop, touAnalysis, touRow } from "@/lib/tou";
import type { Bill, DailyRow, Tariff } from "@/lib/types";

const MEA: Tariff = { service: 24.62, tiers: [[150, 3.2484], [250, 4.2218], [null, 4.4217]], touOn: 5.7982, touOff: 2.6369 };
const bill = (year: number, month: number, on: number | null, off: number | null, units: number, amount: number): Bill => ({
  bill_date: `${year}-${String(month + 1).padStart(2, "0")}-08`, year, month, units, amount_thb: amount,
  on_peak_units: on, off_peak_units: off, on_peak_thb: null, off_peak_thb: null,
});
const day = (date: string, load: number, imp: number, exp = 0): DailyRow => ({
  date, yield_kwh: 10, from_grid_kwh: imp, to_grid_kwh: exp, load_kwh: load, to_battery_kwh: null,
  from_battery_kwh: null, generation_kwh: 10, gen_kwh: null, smart_load_kwh: null, ac_coupled_kwh: null,
});

describe("TOU vs the normal tariff (MEA Log, Mar 2025: 141 on-peak + 372 off-peak = 513 units)", () => {
  const r = touRow(bill(2025, 3, 141, 372, 513, 2115.36), MEA)!;

  it("prices both tariffs like the sheet does", () => {
    expect(r.touEnergy).toBeCloseTo(817.55 + 980.93, 1); // OnPeak ฿ + OffPeak ฿ in the log
    expect(r.normalEnergy).toBeCloseTo(2042.36, 2); // the sheet's ค่าไฟจากการคำนวณ
    expect(r.saved).toBeCloseTo((2042.36 - 1798.48) * 1.07, 1); // ≈ ฿261 cheaper on TOU
  });

  it("finds the on-peak share where both cost the same", () => {
    expect(r.onShare).toBeCloseTo(141 / 513, 8); // 27.5 %
    expect(r.breakEven).toBeCloseTo((2042.36 - 513 * 2.6369) / (513 * (5.7982 - 2.6369)), 4); // 42.5 %
    const on = r.breakEven * 513;
    expect(on * 5.7982 + (513 - on) * 2.6369).toBeCloseTo(r.normalEnergy, 6);
    expect(breakEvenShare(0, MEA)).toBe(0);
  });
});

describe("touAnalysis", () => {
  const bills = [
    bill(2025, 2, null, null, 307, 1377.55), // normal meter: not a TOU row
    bill(2025, 3, 141, 372, 513, 2115.36),
    bill(2025, 9, 112, 286, 398, 1595.09),
    bill(2025, 10, 112, 286, 378, 1591.72), // split copied from Sep: 398 ≠ 378
  ];
  // Weekday (Wed 05/03) and weekend (Sat 08/03) solar self-use: 10 and 8 kWh.
  const daily = [day("2025-03-05", 12, 2), day("2025-03-08", 10, 2)];
  const s = touAnalysis(bills, daily, MEA)!;

  it("keeps TOU months only and flags a split that doesn't add up", () => {
    expect(s.rows.map((r) => [r.key, r.valid])).toEqual([["2025-03", true], ["2025-09", true], ["2025-10", false]]);
    expect(s.valid).toHaveLength(2);
    expect(s.onShare).toBeCloseTo((141 + 112) / (513 + 398), 8);
    expect(s.saved).toBeCloseTo(s.valid[0].saved + s.valid[1].saved, 8);
    expect(s.touRate).toBeLessThan(s.normalRate);
  });

  it("estimates the on-peak share without solar from weekday self-use", () => {
    expect(s.valid[0].onShareNoSolar).toBeCloseTo((141 + 10) / (513 + 18), 8);
    expect(s.valid[1].onShareNoSolar).toBeNull(); // no meter data for Sep here
    expect(s.onShareNoSolar).toBeCloseTo((141 + 10) / (513 + 18), 8);
  });

  it("returns null for a home that never had TOU", () => {
    expect(touAnalysis([bills[0]], [], MEA)).toBeNull();
  });
});

describe("exportStop", () => {
  it("finds the last month with export and the average before it", () => {
    const d = [day("2024-10-15", 20, 5, 300), day("2024-11-15", 20, 5, 260), day("2024-12-02", 20, 5, 47), day("2025-01-15", 20, 5, 0), day("2025-02-15", 20, 5, 0)];
    expect(exportStop(d)).toEqual({ lastMonth: "2024-12", avgBefore: 280 });
    expect(exportStop([day("2024-10-15", 20, 5, 300)])).toBeNull(); // still exporting
  });
});
