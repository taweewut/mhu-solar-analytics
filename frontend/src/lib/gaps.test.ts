import { describe, expect, it } from "vitest";
import { describeGap, gapInMonth, gapOn } from "@/lib/gaps";

const GAPS = [{ from: "2025-10-31", to: "2026-02-15", reason: "Inverter offline (no cloud connection)" }];

describe("data gaps", () => {
  it("finds the gap for a day and for a month", () => {
    expect(gapOn(GAPS, "2025-10-30")).toBeUndefined();
    expect(gapOn(GAPS, "2025-10-31")?.reason).toMatch(/offline/);
    expect(gapOn(GAPS, "2026-02-15")).toBeDefined();
    expect(gapOn(GAPS, "2026-02-16")).toBeUndefined();
    expect(gapInMonth(GAPS, "2025-10")).toBeDefined(); // the last day of October
    expect(gapInMonth(GAPS, "2025-12")).toBeDefined();
    expect(gapInMonth(GAPS, "2026-03")).toBeUndefined();
    expect(gapOn(undefined, "2025-12-01")).toBeUndefined();
  });

  it("describes a gap with its dates", () => {
    expect(describeGap(GAPS[0])).toBe("Inverter offline (no cloud connection) 31/10/2025 – 15/02/2026");
  });
});
