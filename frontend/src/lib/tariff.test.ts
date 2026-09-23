import { describe, expect, it } from "vitest";
import {
  backSolveFt, buildSavings, energyCharge, ftFor, monthlyTotals, payback, peaBill, touWithoutSolar,
} from "@/lib/tariff";
import type { Bill, DailyRow, FtRate } from "@/lib/types";

const bill = (date: string, units: number, amount: number): Bill => ({
  bill_date: date, year: +date.slice(0, 4), month: +date.slice(5, 7), units, amount_thb: amount,
  on_peak_units: null, off_peak_units: null, on_peak_thb: null, off_peak_thb: null,
});

/** One synthetic daily row per month carrying the whole month's totals. */
const day = (date: string, pv: number, grid: number, toB: number, fromB: number, load: number): DailyRow => ({
  date, yield_kwh: pv, from_grid_kwh: grid, to_battery_kwh: toB, from_battery_kwh: fromB, load_kwh: load,
  to_grid_kwh: 0, generation_kwh: pv, gen_kwh: 0, smart_load_kwh: 0, ac_coupled_kwh: 0,
});

// project.md §2 monthly totals and PEA Log bills.
const DAILY = [
  day("2026-03-31", 77, 2.8, 35, 35, 71),
  day("2026-04-30", 819, 49.3, 428, 398, 765),
  day("2026-05-31", 766, 32.2, 395, 349, 681),
  day("2026-06-30", 718, 14.7, 357, 324, 628),
  day("2026-07-31", 625, 12.0, 337, 318, 548),
  day("2026-08-31", 591, 13.4, 324, 310, 520),
  day("2026-09-23", 433, 15.9, 241, 193, 354),
];
const BILLS = [
  bill("2026-03-31", 461, 2013.59), bill("2026-04-30", 173, 669.61), bill("2026-05-31", 51, 212.47),
  bill("2026-06-30", 50, 208.82), bill("2026-07-31", 39, 168.67), bill("2026-08-31", 38, 165.03),
];

describe("tariff", () => {
  it("applies the Type 1.2 tiers progressively", () => {
    expect(energyCharge(100)).toBeCloseTo(324.84, 6);
    expect(energyCharge(150)).toBeCloseTo(487.26, 6);
    expect(energyCharge(400)).toBeCloseTo(487.26 + 1055.45, 6);
    expect(energyCharge(461)).toBeCloseTo(487.26 + 1055.45 + 61 * 4.4217, 6);
    expect(energyCharge(-5)).toBe(0);
  });

  it("back-solves Ft ≈ 0.0677 from the Mar 2026 baseline bill and round-trips", () => {
    const ft = backSolveFt(2013.59, 461);
    expect(ft).toBeCloseTo(0.0677, 4);
    expect(peaBill(461, ft)).toBeCloseTo(2013.59, 8);
  });

  it("adds service, Ft and VAT", () => {
    expect(peaBill(0, 0.1)).toBeCloseTo(38.22 * 1.07, 8);
    expect(peaBill(100, 0.1)).toBeCloseTo((324.84 + 38.22 + 10) * 1.07, 8);
  });

  it("looks Ft up in the history table, falling back when a month is missing", () => {
    const table: FtRate[] = [{ year: 2026, month: 5, type: 1, ft_rate: 0.1623 }];
    expect(ftFor(table, 2026, 5, 0.05)).toBe(0.1623);
    expect(ftFor(table, 2026, 6, 0.05)).toBe(0.05);
  });
});

describe("buildSavings (no Ft table — the mockup's numbers)", () => {
  const s = buildSavings({ bills: BILLS, daily: DAILY, ft: [], commissioned: "2026-03-29" });
  const FT = backSolveFt(2013.59, 461);

  it("treats the commissioning-month bill as the before-solar baseline", () => {
    expect(s.baseline?.key).toBe("2026-03");
    expect(s.bills[0]).toMatchObject({ pre: true, saved: 0, withoutSolar: 2013.59 });
    expect(s.post.map((b) => b.key)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(s.ftFromTable).toBe(false);
  });

  it("estimates the without-solar bill on load − import + PEA units", () => {
    const aug = s.bills.find((b) => b.key === "2026-08")!;
    expect(aug.gap).toBeCloseTo(38 - 13.4, 8);
    expect(aug.withoutSolar).toBeCloseTo(peaBill(520 - 13.4 + 38, FT), 8);
    expect(aug.saved).toBeCloseTo(aug.withoutSolar - 165.03, 8);
    expect(aug.perUnit).toBeCloseTo(165.03 / 38, 8);
  });

  it("sums savings, averages per month and projects the current month", () => {
    const expected = s.post.reduce((a, b) => a + b.saved, 0);
    expect(s.cumTotal).toBeCloseTo(expected, 8);
    expect(s.avgMonthly).toBeCloseTo(expected / 5, 8);
    // Gap average skips April (its cycle includes pre-solar days).
    const gapAvg = [51 - 32.2, 50 - 14.7, 39 - 12.0, 38 - 13.4].reduce((a, b) => a + b) / 4;
    expect(s.gapAvg).toBeCloseTo(gapAvg, 8);
    expect(s.current?.key).toBe("2026-09");
    expect(s.current?.saved).toBeCloseTo(peaBill(354 - 15.9 + gapAvg, FT) - peaBill(15.9 + gapAvg, FT), 8);
    expect(s.reduction).toBeCloseTo(1 - 165.03 / 2013.59, 8);
    expect(Math.round(s.reduction! * 100)).toBe(92);
  });
});

describe("buildSavings with the Ft history table", () => {
  it("uses each bill month's Ft", () => {
    const ft: FtRate[] = [3, 4, 5, 6, 7, 8, 9].map((m) => ({ year: 2026, month: m, type: 1, ft_rate: m <= 4 ? 0.0972 : 0.1623 }));
    const s = buildSavings({ bills: BILLS, daily: DAILY, ft, commissioned: "2026-03-29" });
    expect(s.ftFromTable).toBe(true);
    const may = s.bills.find((b) => b.key === "2026-05")!;
    expect(may.ft).toBe(0.1623);
    expect(may.withoutSolar).toBeCloseTo(peaBill(681 - 32.2 + 51, 0.1623), 8);
    expect(s.current?.ft).toBe(0.1623);
  });
});

describe("monthlyTotals / payback", () => {
  it("sums daily rows per calendar month", () => {
    const m = monthlyTotals([day("2026-09-01", 17, 0.27, 8, 9, 15), day("2026-09-02", 18.6, 0.39, 10, 7, 14)]);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ key: "2026-09", days: 2, toBat: 18, fromBat: 16, load: 29 });
    expect(m[0].pv).toBeCloseTo(35.6, 8);
  });

  it("projects payback from commissioning + ceil(cost ÷ avg) months", () => {
    const p = payback(6000, 1200, 250000, "2026-03-29");
    expect(p.pct).toBeCloseTo(0.024, 8);
    expect(p.months).toBeCloseTo(208.33, 2);
    expect(p.date).toBe("2043-08-29"); // 209 months after 29/03/2026
    expect(payback(0, 0, 250000, "2026-03-29").date).toBeNull();
    expect(payback(300000, 1, 250000, "2026-03-29").pct).toBe(1);
  });
});

describe("an MEA home (MhuHome): service ฿24.62, bills dated the next month, TOU from 03/2025", () => {
  const MEA = { service: 24.62, tiers: [[150, 3.2484], [250, 4.2218], [null, 4.4217]] as [number | null, number][], touOn: 5.7982, touOff: 2.6369 };
  const mea = (billDate: string, year: number, month: number, units: number, amount: number, on?: number, off?: number): Bill => ({
    bill_date: billDate, year, month, units, amount_thb: amount,
    on_peak_units: on ?? null, off_peak_units: off ?? null, on_peak_thb: null, off_peak_thb: null,
  });
  // A weekday (Wed 05/03/2025) and a weekend day (Sat 08/03/2025) of self-use; import 2 kWh each.
  const days = [day("2025-03-05", 20, 2, 0, 0, 12), day("2025-03-08", 18, 2, 0, 0, 10)];
  const DAILY_MEA = [day("2020-09-23", 8, 9.5, 0, 0, 17.6), day("2021-01-10", 15, 8, 0, 0, 20), ...days];
  const BILLS = [
    mea("2020-10-08", 2020, 9, 700, 3000), // commissioning month: the baseline
    mea("2021-02-08", 2021, 1, 350, 1500), // dated February, for January usage
    mea("2025-04-08", 2025, 3, 513, 2115.36, 141, 372), // TOU
  ];
  const FT: FtRate[] = [
    { year: 2021, month: 1, type: 1, ft_rate: -0.1532 },
    { year: 2025, month: 3, type: 1, ft_rate: 0.3672 },
  ];
  const s = buildSavings({ bills: BILLS, daily: DAILY_MEA, ft: FT, commissioned: "2020-09-23", tariff: MEA });

  it("matches bills by usage month, not bill date", () => {
    expect(s.bills.map((b) => b.key)).toEqual(["2020-09", "2021-01", "2025-03"]);
    expect(s.baseline?.key).toBe("2020-09");
    const jan = s.bills[1];
    expect(jan.siteImport).toBe(8); // January's inverter import, not February's
  });

  it("prices a normal-meter month on the tiers with MEA's service charge", () => {
    const jan = s.bills[1];
    expect(jan.tou).toBe(false);
    expect(jan.withoutSolar).toBeCloseTo(peaBill(20 - 8 + 350, -0.1532, MEA), 8);
    expect(peaBill(0, 0, MEA)).toBeCloseTo(24.62 * 1.07, 8);
  });

  it("prices a TOU month as the bill + weekday solar on-peak + weekend off-peak + Ft, × VAT", () => {
    const tou = s.bills[2];
    expect(tou.tou).toBe(true);
    // Self-use = load − import: weekday 10 kWh, weekend 8 kWh.
    const expected = 2115.36 + (10 * 5.7982 + 8 * 2.6369 + 0.3672 * 18) * 1.07;
    expect(tou.withoutSolar).toBeCloseTo(expected, 8);
    expect(touWithoutSolar(2115.36, days, 0.3672, MEA)).toBeCloseTo(expected, 8);
    expect(tou.saved).toBeCloseTo(expected - 2115.36, 8);
  });

  it("counts export only when the home is paid for it", () => {
    const exporting = [day("2021-01-10", 15, 8, 0, 0, 20)].map((d) => ({ ...d, to_grid_kwh: 5 }));
    const unpaid = buildSavings({ bills: BILLS.slice(0, 2), daily: [DAILY_MEA[0], ...exporting], ft: FT, commissioned: "2020-09-23", tariff: MEA });
    const paid = buildSavings({ bills: BILLS.slice(0, 2), daily: [DAILY_MEA[0], ...exporting], ft: FT, commissioned: "2020-09-23", tariff: MEA, exportRate: 2.2 });
    expect(paid.bills[1].saved - unpaid.bills[1].saved).toBeCloseTo(5 * 2.2, 8);
  });
});

describe("missing inverter data is missing, not zero", () => {
  const blank = (date: string): DailyRow => ({
    date, yield_kwh: null, from_grid_kwh: null, to_battery_kwh: null, from_battery_kwh: null, load_kwh: null,
    to_grid_kwh: null, generation_kwh: null, gen_kwh: null, smart_load_kwh: null, ac_coupled_kwh: null,
  });
  const noMeter = (date: string, pv: number): DailyRow => ({ ...blank(date), yield_kwh: pv, generation_kwh: pv });

  it("skips blank days and sums meter values over metered days only", () => {
    const [m] = monthlyTotals([day("2021-09-01", 14, 8, 0, 0, 20), noMeter("2021-09-02", 20), blank("2021-09-03")]);
    expect(m).toMatchObject({ days: 2, meterDays: 1, pv: 34, load: 20, grid: 8 });
    expect(monthlyTotals([blank("2025-11-01"), blank("2025-11-02")])).toEqual([]);
  });

  it("leaves a bill out of savings when its month has no meter data", () => {
    const bills: Bill[] = [bill("2025-10-31", 400, 1500), bill("2025-11-30", 420, 1600), bill("2025-12-31", 430, 1650)];
    const daily = [day("2025-10-01", 15, 8, 0, 0, 20), day("2025-11-15", 14, 8, 0, 0, 22), blank("2025-12-01")];
    const s = buildSavings({ bills, daily, ft: [], commissioned: "2025-10-01" });
    const dec = s.bills.find((b) => b.key === "2025-12")!;
    expect(dec).toMatchObject({ noData: true, saved: 0, withoutSolar: 1650 });
    expect(s.post.map((b) => b.key)).toEqual(["2025-11"]); // Oct is the baseline, Dec has no data
  });
});

describe("a utility meter that nets exports (MhuHome until 2024)", () => {
  // Jan 2021: Huawei import 415.6, export 142.0, load 452.4; MEA billed 311 ≈ import − export + 37.
  const jan = { ...day("2021-01-31", 400, 415.6, 0, 0, 452.4), to_grid_kwh: 142 };
  const bills = [bill("2020-12-31", 700, 3000), bill("2021-01-31", 311, 1248)];
  const base = { bills, daily: [day("2020-12-31", 0, 0, 0, 0, 0), jan], ft: [], commissioned: "2020-12-01" };

  it("takes the meter gap against import − export and adds the export back to the estimate", () => {
    const netted = buildSavings({ ...base, meterNetsExport: true }).bills[1];
    expect(netted.siteImport).toBeCloseTo(415.6 - 142, 8);
    expect(netted.gap).toBeCloseTo(311 - 273.6, 8);
    const FT = backSolveFt(3000, 700);
    expect(netted.withoutSolar).toBeCloseTo(peaBill(452.4 - 273.6 + 311, FT), 8);
    const plain = buildSavings(base).bills[1];
    expect(plain.withoutSolar).toBeCloseTo(peaBill(452.4 - 415.6 + 311, FT), 8);
    expect(netted.saved).toBeGreaterThan(plain.saved);
  });
});
