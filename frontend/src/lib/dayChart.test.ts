import { describe, expect, it } from "vitest";
import { dayChart, dayStats, nearestIndex } from "@/lib/dayChart";
import type { Reading } from "@/lib/energy";

const r = (t: number, o: Partial<Reading> = {}): Reading => ({
  t, pv: 0, mppt1: 0, mppt2: 0, bat: 0, grid: 0, load: 300, gridLoad: 0, backupLoad: 300, soc: 50, soh: 99, temp: 40, ...o,
});
const P = [r(3, { bat: -410, soc: 62 }), r(390, { pv: 60, soc: 41 }), r(630, { pv: 6090, bat: 3300, soc: 90 }), r(683, { soc: 100, temp: 56.2 }), r(738, { soc: 100 })];

describe("dayChart", () => {
  const g = dayChart(P, 1184, 340)!;

  it("uses whole-kW axis bounds around PV, load and battery", () => {
    expect(g.yTicks.map((t) => t.label)).toEqual(["-1 kW", "0 kW", "1 kW", "2 kW", "3 kW", "4 kW", "5 kW", "6 kW", "7 kW"]);
    expect(g.yTicks.find((t) => t.zero)!.y).toBeCloseTo(g.y0);
  });

  it("maps 00:00–24:00 onto the plot and marks now at the last reading", () => {
    expect(g.X(0)).toBe(56);
    expect(g.X(1440)).toBe(1184 - 56);
    expect(g.nowX).toBeCloseTo(g.X(738));
    expect(g.xTicks).toHaveLength(9);
    expect(dayChart(P, 350, 280)!.xTicks.map((t) => t.label)).toEqual(["00:00", "06:00", "12:00", "18:00", "24:00"]);
  });

  it("finds the nearest reading and ignores the future", () => {
    expect(nearestIndex(P, g, g.X(640))).toBe(2);
    expect(nearestIndex(P, g, g.X(900))).toBeNull();
    expect(nearestIndex(P, g, 10)).toBeNull();
  });

  it("returns null without readings", () => {
    expect(dayChart([], 1184, 340)).toBeNull();
  });
});

describe("dayStats", () => {
  it("finds sunrise (PV > 50 W), SOC low, first full, peak PV and max temp", () => {
    const s = dayStats(P)!;
    expect(s.sunrise.t).toBe(390);
    expect(s.low.soc).toBe(41);
    expect(s.full!.t).toBe(683);
    expect(s.peak.pv).toBe(6090);
    expect(s.tempMax).toBe(56.2);
  });
});
