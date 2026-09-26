import { describe, expect, it } from "vitest";
import { AVG_MIN_DAYS, dayReport, reportDates } from "@/lib/dayReport";
import type { EstimatedRow } from "@/lib/estimate";
import type { DailyRow } from "@/lib/types";

const day = (date: string, pv: number | null, imp: number | null, exp: number | null, load: number | null): DailyRow => ({
  date, yield_kwh: pv, from_grid_kwh: imp, to_grid_kwh: exp, load_kwh: load, to_battery_kwh: null,
  from_battery_kwh: null, generation_kwh: pv, gen_kwh: null, smart_load_kwh: null, ac_coupled_kwh: null,
});
/** `n` consecutive days ending the day before 2026-09-25, each with `pv` kWh. */
const before = (n: number, pv: number): DailyRow[] =>
  Array.from({ length: n }, (_, i) => day(`2026-09-${String(24 - i).padStart(2, "0")}`, pv, 10, 0, 10 + pv)).reverse();

describe("dayReport", () => {
  it("builds totals, flows and ratios for a metered day", () => {
    const rows = [...before(10, 8), day("2026-09-25", 4, 9, 1, 12)];
    const r = dayReport(rows, "2026-09-25", 5, false)!;
    expect(r.metered).toBe(true);
    expect(r.totals).toMatchObject({ pv: 4, load: 12, gridImport: 9, export: 1 });
    expect(r.ss).toBe(25); // 1 − 9 / 12
    expect(r.selfUse).toBe(75); // (4 − 1) / 4
    expect(r.specific).toBeCloseTo(0.8, 8);
    expect(r.flows).toMatchObject({ pvHome: 3, pvExport: 1, gridHome: 9, battery: false });
    expect(r.avg).toBe(8);
    expect(r.vsAvg).toBe(-50);
    expect(r.estimated).toBe(false);
  });

  it("keeps PV but draws no flows when the meter had no reading", () => {
    const r = dayReport([day("2026-09-25", 6, null, null, null)], "2026-09-25", 5, false)!;
    expect(r.metered).toBe(false);
    expect(r.flows).toBeNull();
    expect(r.ss).toBeNull();
    expect(r.totals.pv).toBe(6);
  });

  it("returns null for a day without PV (not loaded, or an outage)", () => {
    const rows = [day("2026-09-24", null, null, null, null)];
    expect(dayReport(rows, "2026-09-24", 5, false)).toBeNull();
    expect(dayReport(rows, "2026-09-23", 5, false)).toBeNull();
  });

  it("compares with the 30-day mean of measured PV only, and needs enough of those days", () => {
    const estimatedPv = (r: DailyRow): EstimatedRow => ({ ...r, yield_kwh: 100, estimated: true, estimatedParts: "pv+meter" });
    const few = before(AVG_MIN_DAYS - 1, 8);
    const padded = [...before(20, 0).map(estimatedPv).slice(0, 20 - few.length), ...few];
    expect(dayReport([...padded, day("2026-09-25", 4, 9, 0, 13)], "2026-09-25", 5, false)!.avg).toBeNull();
    const enough = [...before(AVG_MIN_DAYS, 8), day("2026-09-25", 4, 9, 0, 13)];
    expect(dayReport(enough, "2026-09-25", 5, false)!.avg).toBe(8);
  });

  it("marks a day filled by the outage estimates", () => {
    const e: EstimatedRow = { ...day("2026-09-25", 5, 10, 0, 15), estimated: true, estimatedParts: "meter" };
    expect(dayReport([e], "2026-09-25", 5, false)!.estimated).toBe(true);
  });
});

describe("reportDates", () => {
  it("lists days with a PV value, oldest first", () => {
    const rows = [day("2026-09-25", 4, 1, 0, 5), day("2026-09-23", null, null, null, null), day("2026-09-22", 3, 1, 0, 4)];
    expect(reportDates(rows)).toEqual(["2026-09-22", "2026-09-25"]);
  });
});
