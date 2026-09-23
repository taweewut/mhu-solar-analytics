import { describe, expect, it } from "vitest";
import { PROJECT_DAILY } from "@/lib/__fixtures__/project";
import { monthSelfSufficiency, monthSlots, partialMonthsNote, specificYield, specificYieldPerDay, trendSummary } from "@/lib/trends";

describe("specific yield = PV kWh ÷ 7.44 kWp", () => {
  it("lifetime 4,028 kWh → 541 kWh/kWp", () => {
    expect(Math.round(specificYield(4028, 7.44))).toBe(541);
    expect(specificYield(5000, 5)).toBe(1000); // MhuHome's 5 kWp
  });

  it("per day, per month (project.md §2): Apr 3.67, Sep 2.53, Mar 3.45", () => {
    expect(specificYieldPerDay(819, 30, 7.44).toFixed(2)).toBe("3.67");
    expect(specificYieldPerDay(433, 23, 7.44).toFixed(2)).toBe("2.53");
    expect(specificYieldPerDay(77, 3, 7.44).toFixed(2)).toBe("3.45");
    expect(specificYieldPerDay(10, 0, 7.44)).toBe(0);
  });
});

describe("trend summary (project.md §2)", () => {
  const s = trendSummary(PROJECT_DAILY);

  it("totals PV, grid and days", () => {
    expect(s.pv).toBe(4029); // the §2 rows sum to 4,029 (table total shows 4,028)
    expect(s.grid).toBeCloseTo(140.3, 6);
    expect(s.days).toBe(179);
    expect((s.grid / s.days).toFixed(1)).toBe("0.8");
  });

  it("finds the best month and the lowest / highest self-sufficiency", () => {
    expect(s.best?.key).toBe("2026-04");
    expect(s.lowest?.key).toBe("2026-04");
    expect(monthSelfSufficiency(s.lowest!)!.toFixed(1)).toBe("93.6");
    expect(s.highest?.key).toBe("2026-07");
    expect(monthSelfSufficiency(s.highest!)!.toFixed(1)).toBe("97.8");
  });
});

describe("month slots", () => {
  it("lists every calendar month and notes the partial ones", () => {
    const slots = monthSlots(PROJECT_DAILY);
    expect(slots.map((m) => m.label)).toEqual(["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"]);
    expect(slots[0]).toMatchObject({ firstDay: 29, lastDay: 31 });
    expect(partialMonthsNote(slots)).toBe("Mar = 3 days (live from 29/03). Sep = 1–23/09.");
  });

  it("keeps a month with no rows as a null (not loaded) slot", () => {
    const gap = PROJECT_DAILY.filter((d) => !d.date.startsWith("2026-06"));
    const slots = monthSlots(gap);
    expect(slots.find((m) => m.key === "2026-06")).toMatchObject({ data: null, firstDay: null });
    expect(partialMonthsNote(slots)).toMatch(/Hatched months have no daily data loaded\.$/);
  });
});
