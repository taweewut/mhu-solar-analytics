import { describe, expect, it } from "vitest";
import { coverRange, groupBars, lineChart, niceStep } from "@/lib/charts";

describe("niceStep", () => {
  it("rounds up to 1 / 2 / 5 × 10ⁿ", () => {
    expect(niceStep(6.8)).toBe(10);
    expect(niceStep(4.2)).toBe(5);
    expect(niceStep(1.5)).toBe(2);
    expect(niceStep(0.41)).toBe(0.5);
    expect(niceStep(0)).toBe(1);
  });
});

describe("groupBars", () => {
  const groups = [
    { label: "Mar", sub: "3 days", top: "25.7", vals: [{ v: 25.7, color: "a" }, { v: 23.7, color: "b" }] },
    { label: "Apr", vals: null },
    { label: "May", vals: [{ v: 24.7, color: "a" }, { v: 22, color: "b" }] },
  ];
  const g = groupBars({ width: 600, height: 300, groups, fmt: String, right: { min: 90, max: 100, ticks: [90, 95, 100], vals: [96, 93, 95], fmt: (v) => `${v} %` } });

  it("uses ~4 nice ticks from 0", () => {
    expect(g.yTicks.map((t) => t.label)).toEqual(["0", "10", "20", "30"]);
  });

  it("draws bars max 28px wide with 3px gaps, and a hatched slot for a group without data", () => {
    expect(g.rects).toHaveLength(4);
    expect(g.rects[0].w).toBeLessThanOrEqual(28);
    expect(g.rects[1].x - (g.rects[0].x + g.rects[0].w)).toBeCloseTo(3);
    expect(g.missing).toHaveLength(1);
    expect(g.xlabels[1]).toMatchObject({ label: "Apr", sub: "not loaded" });
  });

  it("breaks the right-axis line at groups without data", () => {
    expect(g.dots).toHaveLength(2);
    expect(g.line.match(/M/g)).toHaveLength(2);
    expect(g.rTicks.map((t) => t.label)).toEqual(["90 %", "95 %", "100 %"]);
    expect(g.tops.map((t) => t.label)).toEqual(["25.7"]); // right-axis values unlabelled unless asked
  });
});

describe("lineChart", () => {
  it("marks each point of a dots series, skipping blanks (a lone 15-min sample stays visible)", () => {
    const g = lineChart({
      width: 616, height: 212, ymin: 0, ymax: 40, step: 10, fmt: String,
      series: [{ pts: [[720, 32], [735, null]], color: "c", dots: true }, { pts: [[720, 20]], color: "d" }],
    });
    expect(g.marks).toEqual([{ x: 56 + 0.5 * 548, y: 12 + (8 / 40) * 172, color: "c" }]);
  });

  it("maps 00–24 h, breaks at nulls and marks now", () => {
    const g = lineChart({ width: 1184, height: 260, series: [{ pts: [[0, 1], [60, null], [120, 2]], color: "x" }], ymin: 0, ymax: 4, step: 1, fmt: String, nowT: 738 });
    expect(g.paths[0].d.match(/M/g)).toHaveLength(2);
    expect(g.xTicks).toHaveLength(9);
    expect(g.nowX).toBeCloseTo(56 + (738 / 1440) * (1184 - 68));
    expect(lineChart({ width: 1184, height: 260, series: [], ymin: 0, ymax: 1, step: 1, fmt: String }).nowX).toBeNull();
  });

  it("coverRange keeps 40–60 °C unless the data leaves it", () => {
    expect(coverRange([44.5, 56.2], 40, 60, 5)).toEqual([40, 60]);
    expect(coverRange([38, 61], 40, 60, 5)).toEqual([35, 65]);
  });
});

describe("groupBars missing label", () => {
  it("says why a group is hatched when told", () => {
    const g = groupBars({ width: 400, height: 200, fmt: String, groups: [{ label: "Oct", vals: null, missingLabel: "split ≠ units" }, { label: "Nov", vals: null }] });
    expect(g.xlabels.map((x) => x.sub)).toEqual(["split ≠ units", "not loaded"]);
  });
});

describe("groupBars: data states and label density (design review)", () => {
  const g = (n: number, extra: Partial<import("@/lib/charts").BarGroup> = {}) =>
    Array.from({ length: n }, (_, i) => ({ label: `M${i}`, top: "x", vals: [{ v: 10, color: "a" }, { v: 0, color: "b" }], ...extra }));

  it("labels above bars only up to 7 groups; a partial group's label is dimmed", () => {
    expect(groupBars({ width: 800, height: 300, groups: g(7, { partial: true }), fmt: String }).tops).toHaveLength(7);
    expect(groupBars({ width: 800, height: 300, groups: g(7, { partial: true }), fmt: String }).tops[0].dim).toBe(true);
    expect(groupBars({ width: 800, height: 300, groups: g(12), fmt: String }).tops).toHaveLength(0);
  });

  it("a 0 value is a stub marker, not a bar; null stays absent; every group has a slot", () => {
    const geo = groupBars({ width: 800, height: 300, groups: [...g(2), { label: "gap", vals: null }], fmt: String });
    expect(geo.zeros).toHaveLength(2);
    expect(geo.rects).toHaveLength(2);
    expect(geo.slots).toHaveLength(3);
    expect(geo.missing).toHaveLength(1);
  });
});
