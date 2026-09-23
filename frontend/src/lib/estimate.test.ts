import { describe, expect, it } from "vitest";
import { estimateNote, fillMissing, isEstimated, type EstimatedRow } from "@/lib/estimate";
import type { Bill, DailyRow } from "@/lib/types";

const day = (date: string, pv: number | null, imp: number | null, exp: number | null, load: number | null): DailyRow => ({
  date, yield_kwh: pv, from_grid_kwh: imp, to_grid_kwh: exp, load_kwh: load, to_battery_kwh: null,
  from_battery_kwh: null, generation_kwh: pv, gen_kwh: null, smart_load_kwh: null, ac_coupled_kwh: null,
});
const blank = (date: string) => day(date, null, null, null, null);
const bill = (year: number, month: number, units: number): Bill => ({
  bill_date: `${year}-${String(month + 1).padStart(2, "0")}-08`, year, month, units, amount_thb: 1000,
  on_peak_units: null, off_peak_units: null, on_peak_thb: null, off_peak_thb: null,
});
const NO_BATTERY = { battery: null };
const est = (rows: EstimatedRow[], date: string) => rows.find((d) => d.date === date)!;

// Nov 2024, exporting: PV 12/day, export 4/day, import 10/day.
const NOV24 = [day("2024-11-10", 14, 9, 5, 18), day("2024-11-11", 10, 11, 3, 18)];
// Oct 2025: zero export already.
const OCT25 = [day("2025-10-29", 7, 14, 0, 21), day("2025-10-30", 5, 8, 0, 13)];

describe("fillMissing: a PV outage in a zero-export period", () => {
  // Nov 2025: 1st real (import 12), 2nd and 3rd blank; the bill says 300 units for November.
  const rows = [...NOV24, ...OCT25, day("2025-11-01", 6, 12, 0, 18), blank("2025-11-02"), blank("2025-11-03")];
  const out = fillMissing(rows, NO_BATTERY, { bills: [bill(2025, 11, 300)] });

  it("estimates PV from the same month a year earlier, without its export", () => {
    const d = est(out, "2025-11-02");
    expect(isEstimated(d)).toBe(true);
    expect(d).toMatchObject({ estimatedParts: "pv+meter", estimatedFrom: "2024-11", yield_kwh: 12 - 4, to_grid_kwh: 0 });
  });

  it("takes grid import from the bill: billed units − the real days' import, spread over the missing days", () => {
    const [a, b] = [est(out, "2025-11-02"), est(out, "2025-11-03")];
    expect(a.from_grid_kwh).toBeCloseTo((300 - 12) / 2, 8);
    expect(a.importFromBill).toBe(true);
    expect(a.from_grid_kwh! + b.from_grid_kwh! + 12).toBeCloseTo(300, 8); // the month adds up to the bill
    expect(a.load_kwh).toBeCloseTo(a.yield_kwh! - a.to_grid_kwh! + a.from_grid_kwh!, 8); // balanced
    expect(est(out, "2025-11-01")).toEqual(rows.find((d) => d.date === "2025-11-01")); // real day untouched
  });
});

describe("fillMissing: PV measured, meter missing, while exporting with a netting meter (MhuHome 2021)", () => {
  // Jun 2022 reference: PV 20, export 8 (40 %), import 6.
  const JUN22 = [day("2022-06-10", 20, 6, 8, 18)];
  const MAY21 = [day("2021-05-31", 18, 7, 6, 19)]; // exporting around the gap
  const rows = [...MAY21, day("2021-06-01", 15, null, null, 26), day("2021-06-02", 10, null, null, null), ...JUN22];
  const out = fillMissing(rows, NO_BATTERY, { bills: [bill(2021, 6, 20)], meterNetsExport: true });

  it("keeps the measured PV and estimates export from the reference month's share", () => {
    const d = est(out, "2021-06-01");
    expect(d).toMatchObject({ estimatedParts: "meter", yield_kwh: 15, estimatedFrom: "2022-06" });
    expect(d.to_grid_kwh).toBeCloseTo(15 * 0.4, 8);
  });

  it("matches the netted bill: Σ(import − export) = billed units", () => {
    const [a, b] = [est(out, "2021-06-01"), est(out, "2021-06-02")];
    expect(a.from_grid_kwh! - a.to_grid_kwh! + (b.from_grid_kwh! - b.to_grid_kwh!)).toBeCloseTo(20, 8);
    expect(estimateNote(a, "MEA")).toBe("PV measured; export and grid import from the MEA bill estimated");
  });
});

describe("fillMissing leaves alone", () => {
  it("battery homes, days before switch-on, and days with nothing to estimate from", () => {
    const rows = [blank("2020-09-01"), day("2020-09-23", 8, 9, 0, 17), blank("2020-09-24")];
    expect(fillMissing(rows, { battery: { kwh: 16, label: "" } }, { bills: [] })).toBe(rows);
    const out = fillMissing(rows, NO_BATTERY, { bills: [] });
    expect(isEstimated(out[0])).toBe(false); // before the first PV
    expect(out[2]).toEqual(rows[2]); // no other September to take PV from
  });

  it("uses the reference month's import when there's no bill", () => {
    const rows = [...NOV24, ...OCT25, blank("2025-11-02")];
    expect(est(fillMissing(rows, NO_BATTERY, { bills: [] }), "2025-11-02")).toMatchObject({ from_grid_kwh: 10, importFromBill: false });
  });
});

describe("fillMissing from the install date", () => {
  it("fills the days before the reports start, but not from a bill that also covers pre-solar days", () => {
    // Installed 20/09/2020, reports from 23/09. Sep 2021 is the reference (PV 16, export 5, import 9).
    const rows = [blank("2020-09-20"), day("2020-09-23", 8, 9, 0.2, 17), day("2021-09-10", 16, 9, 5, 20)];
    const out = fillMissing(rows, NO_BATTERY, { bills: [bill(2020, 9, 796)], meterNetsExport: true, installed: "2020-09-20" });
    const d = est(out, "2020-09-20");
    expect(d).toMatchObject({ estimated: true, yield_kwh: 16, estimatedFrom: "2021-09", importFromBill: false });
    expect(d.from_grid_kwh).toBe(9); // the reference month's, not 796 units − 9
  });
});
