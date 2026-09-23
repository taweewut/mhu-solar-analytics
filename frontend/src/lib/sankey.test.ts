import { describe, expect, it } from "vitest";
import { layoutSankey, linkOpacity, linksFor, linkTip, nodeLinkOpacity, nodeTip, zeroLegend, type Flows } from "@/lib/sankey";

// Sample flows from the design handoff (README "Sample flows").
const TODAY: Flows = { pvHome: 2.6, pvBat: 10.7, pvLoss: 1.3, batHome: 4.6, stored: 6.1, gridHome: 0.1, gridBat: 0, sub: "Backup 7.2 · Grid-load 0.1" };
const MONTH: Flows = { pvHome: 145.1, pvBat: 241, pvLoss: 46.9, batHome: 193, batLoss: 48, gridHome: 15.9, gridBat: 0 };
const LIFE: Flows = { pvHome: 1500, pvBat: 2117, pvLoss: 411, batHome: 1927, batLoss: 190, gridHome: 140, gridBat: 0, sub: "Backup 94 % · Grid-load 6 %" };

const node = (l: ReturnType<typeof layoutSankey>, k: string) => l.nodes.find((n) => n.key === k)!;

describe("linksFor", () => {
  it("uses Stored for a day and battery Losses for a period", () => {
    expect(linksFor(TODAY).map((l) => `${l.s}>${l.t}`)).toEqual([
      "pv>home", "pv>bat", "pv>loss", "grid>home", "grid>bat", "bat>home", "bat>stored",
    ]);
    expect(linksFor(MONTH).at(-1)).toMatchObject({ s: "bat", t: "loss", v: 48, loss: true });
  });

  it("drops loss links when losses are hidden", () => {
    const keys = linksFor(MONTH, false).map((l) => `${l.s}>${l.t}`);
    expect(keys).not.toContain("pv>loss");
    expect(keys).not.toContain("bat>loss");
    expect(keys).toHaveLength(5);
  });
});

describe("layoutSankey", () => {
  it("scales by k = min((H−gap)/col0, (H−gap·(n−1))/col2)", () => {
    const H = 400, gap = 26;
    const l = layoutSankey(LIFE, { width: 1184, height: H });
    const col0 = 1500 + 2117 + 411 + 140; // PV + Grid
    const col2 = 1500 + 1927 + 140 + 411 + 190; // Home + Losses
    expect(l.scale).toBeCloseTo(Math.min((H - gap) / col0, (H - gap) / col2), 10);
    expect(l.energyIn).toBeCloseTo(col0);
  });

  it("puts PV top-left, Grid bottom-left, Battery centre, sinks right", () => {
    const l = layoutSankey(MONTH, { width: 1184, height: 400 });
    const pv = node(l, "pv"), grid = node(l, "grid"), bat = node(l, "bat"), home = node(l, "home"), loss = node(l, "loss");
    expect([pv.x, pv.y]).toEqual([0, 0]);
    expect(grid.x).toBe(0);
    expect(grid.y + grid.h).toBeCloseTo(400);
    expect(bat.x).toBe(1184 / 2 - 7);
    expect(bat.y).toBeCloseTo(145.1 * l.scale + 26);
    expect([home.x, home.y]).toEqual([1170, 0]);
    expect(loss.y + loss.h).toBeCloseTo(400); // stacked from the bottom
    expect(home.anchor).toBe("end");
    expect(pv.anchor).toBe("start");
  });

  it("uses compact node width and gap on mobile", () => {
    const l = layoutSankey(TODAY, { width: 350, height: 290, compact: true });
    expect(node(l, "pv").w).toBe(10);
    // Losses sit at the bottom, Stored 18px above them.
    const stored = node(l, "stored"), loss = node(l, "loss");
    expect(loss.y + loss.h).toBeCloseTo(290);
    expect(stored.y + stored.h).toBeCloseTo(loss.y - 18);
  });

  it("stacks ribbons in link order at the source and by PV < Battery < Grid at the target", () => {
    const l = layoutSankey(TODAY, { width: 1184, height: 400 });
    const byKey = Object.fromEntries(l.links.map((x) => [`${x.s}>${x.t}`, x]));
    // At PV: home, then bat, then loss.
    expect(byKey["pv>bat"].ys).toBeCloseTo(byKey["pv>home"].ys + byKey["pv>home"].w);
    expect(byKey["pv>loss"].ys).toBeCloseTo(byKey["pv>bat"].ys + byKey["pv>bat"].w);
    // At Home: PV first, then Battery, then Grid (even though grid>home comes earlier in link order).
    expect(byKey["bat>home"].yt).toBeCloseTo(byKey["pv>home"].yt + byKey["pv>home"].w);
    expect(byKey["grid>home"].yt).toBeCloseTo(byKey["bat>home"].yt + byKey["bat>home"].w);
  });

  it("draws zero-value links as a centreline, not a ribbon", () => {
    const l = layoutSankey(TODAY, { width: 1184, height: 400 });
    expect(l.zeros.map((z) => `${z.s}>${z.t}`)).toEqual(["grid>bat"]);
    expect(l.links.some((x) => x.s === "grid" && x.t === "bat")).toBe(false);
    expect(l.zeros[0].d).not.toContain("Z");
  });

  it("gives tiny flows a visible minimum: nodes ≥ 2px, ribbons ≥ 1.5px", () => {
    const l = layoutSankey(LIFE, { width: 1184, height: 400 });
    expect(node(l, "grid").h).toBeGreaterThanOrEqual(2);
    const tiny = layoutSankey({ ...TODAY, gridHome: 0.001 }, { width: 350, height: 290, compact: true });
    expect(tiny.links.find((x) => x.s === "grid")!.w).toBe(1.5);
  });

  it("labels nodes with energy (MWh from 1,000 kWh), Thai name and the Home split", () => {
    const l = layoutSankey(LIFE, { width: 1184, height: 400 });
    expect(node(l, "pv")).toMatchObject({ name: "Solar PV", th: "แสงอาทิตย์", val: "4.03 MWh" });
    expect(node(l, "home")).toMatchObject({ val: "3.57 MWh", sub: "Backup 94 % · Grid-load 6 %" });
    expect(node(l, "grid").val).toBe("140 kWh");
    expect(node(l, "bat").sub).toBe("");
  });

  it("omits empty sinks", () => {
    const l = layoutSankey(MONTH, { width: 1184, height: 400, showLosses: false });
    expect(l.nodes.map((n) => n.key)).toEqual(["pv", "grid", "bat", "home"]);
  });
});

describe("hover", () => {
  it("formats the tooltip with % of energy in and THB value", () => {
    const l = layoutSankey(TODAY, { width: 1184, height: 400 });
    const link = l.links.find((x) => x.s === "pv" && x.t === "bat")!;
    const tip = linkTip(l, link, 4.34);
    expect(tip.title).toBe("Solar PV → Battery");
    expect(tip.kwh).toBe("10.7 kWh");
    expect(tip.pct).toBe(((10.7 / 14.7) * 100).toFixed(1) + " % of energy in");
    expect(tip.thb).toBe("≈ ฿46 at 4.34 ฿/kWh");
    expect(tip.left).toBeGreaterThanOrEqual(0);
    expect(tip.left).toBeLessThanOrEqual(1184 - 210);
  });

  it("highlights the hovered ribbon and dims the rest", () => {
    expect(linkOpacity(2, null)).toBe(0.55);
    expect(linkOpacity(2, 2)).toBe(0.95);
    expect(linkOpacity(1, 2)).toBe(0.15);
  });
});

describe("a home without a battery that exports", () => {
  // MhuHome, a day in 2021: 16.2 kWh PV, 11.9 exported, 7.3 imported, 11.6 used.
  const F: Flows = { pvHome: 4.3, pvBat: 0, pvLoss: 0, gridHome: 7.3, gridBat: 0, batHome: 0, batLoss: 0, pvExport: 11.9, battery: false };
  const l = layoutSankey(F, { width: 1184, height: 400, gridName: "Grid · MEA" });

  it("has no battery node or links, and an Export sink", () => {
    expect(l.nodes.map((n) => n.key)).toEqual(["pv", "grid", "home", "export"]);
    expect([...l.links, ...l.zeros].some((x) => x.s === "bat" || x.t === "bat")).toBe(false);
    expect(node(l, "export")).toMatchObject({ name: "Export", th: "ส่งไฟคืนกริด", val: "11.9 kWh" });
    const exp = node(l, "export");
    expect(exp.y + exp.h).toBeCloseTo(400); // stacked from the bottom
  });

  it("names the grid after the utility", () => {
    expect(node(l, "grid").name).toBe("Grid · MEA");
    const link = l.links.find((x) => x.s === "grid")!;
    expect(linkTip(l, link, 4).title).toBe("Grid · MEA → Home load");
  });

  it("leaves Export out when nothing was exported", () => {
    const none = layoutSankey({ ...F, pvExport: 0, pvHome: 16.2 }, { width: 1184, height: 400 });
    expect(none.nodes.map((n) => n.key)).toEqual(["pv", "grid", "home"]);
  });
});

describe("node explanations", () => {
  it("names Losses & inverter use and splits it into the solar and battery parts", () => {
    const l = layoutSankey(MONTH, { width: 1184, height: 400 });
    const loss = node(l, "loss");
    expect(loss.name).toBe("Losses & inverter use");
    expect(loss.th).toBe("สูญเสีย/ใช้ในระบบ");
    const tip = nodeTip(l, loss);
    expect(tip.value).toBe("94.9 kWh");
    expect(tip.lines.join(" ")).toMatch(/From solar 46\.9 kWh/);
    expect(tip.lines.join(" ")).toMatch(/From the battery 48\.0 kWh/);
    expect(tip.left).toBeGreaterThanOrEqual(0);
    expect(tip.left).toBeLessThanOrEqual(1184 - 280);
  });

  it("explains every node and highlights its own flows", () => {
    const l = layoutSankey(TODAY, { width: 350, height: 290, compact: true });
    for (const n of l.nodes) expect(nodeTip(l, n).lines.length).toBeGreaterThan(0);
    const pvHome = l.links.find((x) => x.s === "pv" && x.t === "home")!;
    expect(nodeLinkOpacity(pvHome, "home")).toBe(0.95);
    expect(nodeLinkOpacity(pvHome, "bat")).toBe(0.15);
  });
});

describe("dashed-line legend", () => {
  it("names the 0 kWh paths and why Grid → Battery is always 0", () => {
    const text = zeroLegend(layoutSankey(TODAY, { width: 1184, height: 400 }))!;
    expect(text).toBe("Dashed line = 0 kWh: Grid → Battery (the inverter doesn't report grid charging separately, so it's shown as 0).");
  });

  it("lists every zero path, and is null when nothing is dashed", () => {
    const noGrid = zeroLegend(layoutSankey({ ...MONTH, gridHome: 0 }, { width: 1184, height: 400 }))!;
    expect(noGrid).toMatch(/nothing flowed: Grid → Home, and Grid → Battery \(/);
    const F: Flows = { pvHome: 4.3, pvBat: 0, pvLoss: 0, gridHome: 7.3, gridBat: 0, batHome: 0, batLoss: 0, pvExport: 11.9, battery: false };
    expect(zeroLegend(layoutSankey(F, { width: 1184, height: 400 }))).toBeNull();
  });
});
