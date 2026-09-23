import { describe, expect, it } from "vitest";
import { DAY_ROWS, PROJECT_DAILY } from "@/lib/__fixtures__/project";
import { equivalentCycles, hourlySoc, roundTrip, socFill, socHeatmap, sunriseReading, tempFill, tempHeatmap } from "@/lib/battery";
import type { BmsRow } from "@/lib/types";
import { readingsFor, sumDaily } from "@/lib/energy";
import { hm } from "@/lib/format";
import { monthlyTotals } from "@/lib/tariff";

const P = readingsFor(DAY_ROWS, "2026-09-23");

describe("SOC at sunrise", () => {
  it("is the SOC at the first reading with PV > 50 W (day.json: 41 % at 06:18)", () => {
    const r = sunriseReading(P)!;
    expect(hm(r.t)).toBe("06:18");
    expect(r.soc).toBe(41);
    expect(r.pv).toBeGreaterThan(50);
    expect(P.filter((p) => p.t < r.t).every((p) => p.pv <= 50)).toBe(true);
  });

  it("is null when PV never passes 50 W", () => {
    expect(sunriseReading(P.filter((p) => p.t < 300))).toBeNull();
  });
});

describe("equivalent cycles = discharge ÷ 16 kWh (project.md §2)", () => {
  const life = sumDaily(PROJECT_DAILY);

  it("lifetime: 1,927 kWh out → 120 cycles, 0.67 per day over 179 days", () => {
    expect(life.discharge).toBe(1927);
    expect(equivalentCycles(life.discharge, 16)).toBeCloseTo(120.44, 2);
    expect(Math.round(equivalentCycles(life.discharge, 16))).toBe(120);
    expect((equivalentCycles(life.discharge, 16) / PROJECT_DAILY.length).toFixed(2)).toBe("0.67");
  });

  it("per month, one decimal", () => {
    const m = Object.fromEntries(monthlyTotals(PROJECT_DAILY).map((x) => [x.key, equivalentCycles(x.fromBat, 16).toFixed(1)]));
    expect(m).toEqual({ "2026-03": "2.2", "2026-04": "24.9", "2026-05": "21.8", "2026-06": "20.3", "2026-07": "19.9", "2026-08": "19.4", "2026-09": "12.1" });
  });
});

describe("round-trip = discharge ÷ charge", () => {
  it("lifetime 1,927 ÷ 2,117 = 91 %", () => {
    const life = sumDaily(PROJECT_DAILY);
    expect(Math.round(roundTrip(life.discharge, life.charge)! * 100)).toBe(91);
  });

  it("per month (Mar 100 %, Apr 93 %, May 88 %, Sep 80 %)", () => {
    const m = Object.fromEntries(monthlyTotals(PROJECT_DAILY).map((x) => [x.key, Math.round(roundTrip(x.fromBat, x.toBat)! * 100)]));
    expect(m).toMatchObject({ "2026-03": 100, "2026-04": 93, "2026-05": 88, "2026-06": 91, "2026-07": 94, "2026-08": 96, "2026-09": 80 });
  });

  it("is undefined (null) with no charge", () => {
    expect(roundTrip(5, 0)).toBeNull();
  });
});

describe("SOC heatmap", () => {
  it("averages SOC per clock hour (day.json 00h → 60, 12h → 100) and leaves later hours empty", () => {
    const h = hourlySoc(P);
    expect(h[0]).toBe(60);
    expect(h[12]).toBe(100);
    expect(h.slice(13).every((v) => v === null)).toBe(true);
  });

  it("marks today's later hours as future and days without data as missing — never zero", () => {
    const rows = socHeatmap(DAY_ROWS, "2026-09-23", 14);
    expect(rows).toHaveLength(14);
    expect(rows[0]).toMatchObject({ date: "2026-09-23", today: true, loaded: true });
    expect(rows[0].cells[0]).toEqual({ kind: "soc", soc: 60 });
    expect(rows[0].cells[13]).toEqual({ kind: "future" });
    expect(rows[13].date).toBe("2026-09-10");
    expect(rows.slice(1).every((r) => !r.loaded && r.cells.every((c) => c.kind === "missing"))).toBe(true);
  });

  it("mixes green by SOC with a 6 % floor", () => {
    expect(socFill(0)).toBe("color-mix(in srgb, #3fa66a 6%, var(--color-bg))");
    expect(socFill(63)).toBe("color-mix(in srgb, #3fa66a 63%, var(--color-bg))");
  });
});

describe("battery temperature heatmap (BMS log, forward-only)", () => {
  const b = (time: string, max: number | null): BmsRow => ({
    time, temp_min_c: max == null ? null : max - 1, temp_max_c: max, cell_min_v: null, cell_max_v: null, soc_pct: null,
  });
  const rows = [b("2026-09-23 10:00:00", 31), b("2026-09-23 10:45:00", 33), b("2026-09-23 12:15:00", null), b("2026-09-22 23:30:00", 30)];
  const heat = tempHeatmap(rows, "2026-09-23", 3);

  it("warmest sensor per hour; blank samples and unlogged hours are missing, not 0", () => {
    expect(heat.map((r) => r.date)).toEqual(["2026-09-23", "2026-09-22", "2026-09-21"]);
    expect(heat[0].cells[10]).toEqual({ kind: "temp", c: 33 });
    expect(heat[0].cells[9]).toEqual({ kind: "missing" });
    expect(heat[0].cells[12]).toEqual({ kind: "missing" }); // sampled, but the BMS sent nothing
    expect(heat[1].cells[23]).toEqual({ kind: "temp", c: 30 });
  });

  it("today's hours after the last sample are later-today; a day before logging isn't loaded", () => {
    expect(heat[0].cells[13]).toEqual({ kind: "future" });
    expect(heat[2]).toMatchObject({ loaded: false, today: false });
    expect(heat[2].cells.every((c) => c.kind === "missing")).toBe(true);
  });

  it("fill runs from faint at 20 °C to full orange at 45 °C", () => {
    expect(tempFill(20)).toContain("#e07b39 6%");
    expect(tempFill(32.5)).toContain("#e07b39 50%");
    expect(tempFill(50)).toContain("#e07b39 100%");
  });
});
