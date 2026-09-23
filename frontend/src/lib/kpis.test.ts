import { describe, expect, it } from "vitest";
import { PROJECT_DAILY } from "@/lib/__fixtures__/project";
import { overviewKpis, type OverviewInput } from "@/lib/kpis";
import { buildSavings } from "@/lib/tariff";
import type { Bill, Home } from "@/lib/types";

const HOME = {
  id: "momhome", name: "MomHome", utility: "PEA", kwp: 7.44, battery: { kwh: 16, label: "" },
  inverter: { brand: "Solis", model: null, sn: null, ratedW: 10000 }, exportRate: 0, meterNetsExport: false,
  tariff: { service: 38.22, tiers: [[150, 3.2484], [250, 4.2218], [null, 4.4217]], touOn: null, touOff: null },
} as unknown as Home;
const bill = (date: string, units: number, amount: number): Bill => ({
  bill_date: date, year: +date.slice(0, 4), month: +date.slice(5, 7), units, amount_thb: amount,
  on_peak_units: null, off_peak_units: null, on_peak_thb: null, off_peak_thb: null,
});
const BILLS = [bill("2026-03-31", 461, 2013.59), bill("2026-04-30", 173, 669.61), bill("2026-05-31", 51, 212.47)];
const savings = buildSavings({ bills: BILLS, daily: PROJECT_DAILY, ft: [], commissioned: "2026-03-29" });
const input = (period: OverviewInput["period"], pick: string): OverviewInput => ({
  fiveMin: [], daily: PROJECT_DAILY, asOf: "2026-09-23", savings, rate: 4.34, home: HOME, period, pick,
});
const tile = (ks: ReturnType<typeof overviewKpis>, label: string) => ks.find((k) => k.label.startsWith(label))!;

describe("Overview tiles follow the selected period", () => {
  it("Month: the picked month's solar, self-sufficiency, bill saving, battery and grid", () => {
    const k = overviewKpis(input("month", "2026-04"));
    expect(tile(k, "Solar").label).toBe("Solar · Apr 2026");
    expect(tile(k, "Solar").value).toBe("819");
    expect(tile(k, "Self-sufficiency").value).toBe(String(Math.round((1 - 49.3 / 765) * 100))); // 94
    const apr = savings.bills.find((b) => b.key === "2026-04")!;
    expect(tile(k, "Saved").value).toBe("฿" + Math.round(apr.saved).toLocaleString("en-US"));
    expect(tile(k, "From battery").value).toBe("398");
    expect(tile(k, "From battery").sub).toBe("25 cycles · round-trip 93 %");
    expect(tile(k, "Grid import").value).toBe("49.3");
  });

  it("Month without a bill says so instead of inventing a saving", () => {
    expect(tile(overviewKpis(input("month", "2026-07")), "Saved").value).toBe("—");
    expect(tile(overviewKpis(input("month", "2026-03")), "Saved").sub).toMatch(/before solar/);
  });

  it("Year sums its bills; Lifetime shows the average per bill", () => {
    const y = overviewKpis(input("year", "2026"));
    expect(tile(y, "Solar")).toMatchObject({ value: "4.03", unit: "MWh" }); // 4,029 kWh
    // The year's bills + September's estimate (no bill yet).
    const total = savings.post.reduce((a, b) => a + b.saved, 0) + savings.current!.saved;
    expect(tile(y, "Saved")).toMatchObject({ value: "฿" + Math.round(total).toLocaleString("en-US"), unit: "est." });
    expect(tile(y, "Saved").sub).toBe("2 PEA bills + Sep est.");
    const life = overviewKpis(input("life", ""));
    expect(tile(life, "Average saving").value).toBe("฿" + Math.round(savings.avgMonthly).toLocaleString("en-US"));
  });

  it("every tile explains itself", () => {
    for (const p of ["today", "month", "year", "life"] as const) {
      const ks = overviewKpis(input(p, p === "month" ? "2026-04" : p === "year" ? "2026" : ""));
      expect(ks).toHaveLength(6);
      expect(ks.every((k) => k.info && k.info.length > 0)).toBe(true);
    }
  });
});
