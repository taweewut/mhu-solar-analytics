// Energy-flow Sankey layout (README "Sankey spec"). Pure geometry, no React: takes a set of
// flows in kWh and a box, returns node rects, ribbon paths and label anchors.
//
// Columns: sources on the left (PV top, Grid bottom-aligned), Battery in the centre (omitted
// for a home without one), sinks on the right (Home at top; Export / Stored / Losses stacked
// up from the bottom).

import { energyText, thb } from "@/lib/format";

export const COLORS = {
  pv: "#e9a825",
  bat: "#3fa66a",
  grid: "#3a7bd5",
  load: "#8b5cc7",
  loss: "#9b9797",
  before: "#605d5d",
} as const;

export type NodeKey = "pv" | "grid" | "bat" | "home" | "export" | "loss" | "stored";

export const NODE_NAMES: Record<NodeKey, [en: string, th: string]> = {
  pv: ["Solar PV", "แสงอาทิตย์"],
  grid: ["Grid · PEA", "การไฟฟ้า"],
  bat: ["Battery", "แบตเตอรี่"],
  home: ["Home load", "บ้าน"],
  export: ["Export", "ส่งไฟคืนกริด"],
  loss: ["Losses & inverter use", "สูญเสีย/ใช้ในระบบ"],
  stored: ["Stored", "เก็บในแบต"],
};

export const NODE_COLORS: Record<NodeKey, string> = {
  pv: COLORS.pv,
  grid: COLORS.grid,
  bat: COLORS.bat,
  home: COLORS.load,
  export: COLORS.grid,
  loss: COLORS.loss,
  stored: COLORS.bat,
};

/** kWh along each link. `stored` (net SOC gain, "Today") replaces `batLoss` when present. */
export interface Flows {
  pvHome: number;
  pvBat: number;
  pvLoss: number;
  gridHome: number;
  gridBat: number;
  batHome: number;
  batLoss?: number;
  stored?: number;
  /** PV sent to the grid (homes that export). */
  pvExport?: number;
  /** false for a home without a battery: no battery node or links. */
  battery?: boolean;
  /** Extra line under the Home label, e.g. "Backup 7.2 · Grid-load 0.1". */
  sub?: string;
}

export interface SankeyOptions {
  width: number;
  height: number;
  /** Mobile: 10px nodes, 18px gaps, tighter labels. */
  compact?: boolean;
  showLosses?: boolean;
  /** Label for the grid node: "Grid · PEA" (default) / "Grid · MEA". */
  gridName?: string;
}

export interface LinkSpec {
  s: NodeKey;
  t: NodeKey;
  v: number;
  loss?: boolean;
}

export interface LaidLink extends LinkSpec {
  /** Index into the link list (stable hover key). */
  i: number;
  /** Ribbon thickness in px (0 for zero-value links). */
  w: number;
  ys: number;
  yt: number;
  x1: number;
  x2: number;
  c1: string;
  c2: string;
  /** Filled ribbon path, or for a zero-value link the dashed centreline. */
  d: string;
  /** Ribbon midpoint, for tooltip placement. */
  mx: number;
  my: number;
}

export interface LaidNode {
  key: NodeKey;
  x: number;
  y: number;
  w: number;
  h: number;
  v: number;
  color: string;
  name: string;
  th: string;
  val: string;
  sub: string;
  /** Label anchor (top-left of the text block, or top-right when anchor = "end"). */
  lx: number;
  ly: number;
  anchor: "start" | "end";
}

export interface SankeyLayout {
  width: number;
  height: number;
  nodes: LaidNode[];
  links: LaidLink[];
  zeros: LaidLink[];
  /** Total energy in (PV + Grid) — the denominator for "% of energy in". */
  energyIn: number;
  scale: number;
  names: Record<NodeKey, [en: string, th: string]>;
}

/** The link list for a set of flows, in draw order. */
export function linksFor(f: Flows, showLosses = true): LinkSpec[] {
  const today = f.stored != null;
  const bat = f.battery !== false;
  const links: (LinkSpec | false)[] = [
    { s: "pv", t: "home", v: f.pvHome },
    bat && { s: "pv", t: "bat", v: f.pvBat },
    (f.pvExport ?? 0) > 0 && { s: "pv", t: "export", v: f.pvExport! },
    { s: "pv", t: "loss", v: f.pvLoss, loss: true },
    { s: "grid", t: "home", v: f.gridHome },
    bat && { s: "grid", t: "bat", v: f.gridBat },
    bat && { s: "bat", t: "home", v: f.batHome },
    bat && (today ? { s: "bat", t: "stored", v: f.stored ?? 0 } : { s: "bat", t: "loss", v: f.batLoss ?? 0, loss: true }),
  ];
  return links.filter((l): l is LinkSpec => !!l && (showLosses || !l.loss));
}

const SOURCE_RANK: Partial<Record<NodeKey, number>> = { pv: 0, bat: 1, grid: 2 };

export function layoutSankey(f: Flows, opts: SankeyOptions): SankeyLayout {
  const { width: W, height: H, compact = false, showLosses = true, gridName } = opts;
  const names = gridName ? { ...NODE_NAMES, grid: [gridName, NODE_NAMES.grid[1]] as [string, string] } : NODE_NAMES;
  const nw = compact ? 10 : 14;
  const gap = compact ? 18 : 26;
  const L = linksFor(f, showLosses);

  const N = {} as Record<NodeKey, { i: number; o: number; v: number; x: number; y: number; h: number }>;
  (["pv", "grid", "bat", "home", "export", "loss", "stored"] as NodeKey[]).forEach((k) => (N[k] = { i: 0, o: 0, v: 0, x: 0, y: 0, h: 0 }));
  L.forEach((l) => {
    N[l.s].o += l.v;
    N[l.t].i += l.v;
  });
  Object.values(N).forEach((n) => (n.v = Math.max(n.i, n.o)));

  const bat = f.battery !== false;
  // A tiny loss (rounding in a no-battery home's report) isn't worth a node.
  const right = (["home", "export", "stored", "loss"] as NodeKey[]).filter((k) => N[k].v > (k === "loss" && !bat ? 0.05 : 0));
  const col0 = N.pv.v + N.grid.v;
  const col2 = right.reduce((a, k) => a + N[k].v, 0);
  const k = Math.min((H - gap) / (col0 || 1), (H - gap * Math.max(right.length - 1, 0)) / (col2 || 1));
  const hh = (v: number) => Math.max(v * k, 2);
  const set = (n: NodeKey, x: number, y: number) => {
    N[n].x = x;
    N[n].y = y;
    N[n].h = hh(N[n].v);
  };

  set("pv", 0, 0);
  set("grid", 0, 0);
  N.grid.y = H - N.grid.h;
  set("home", W - nw, 0);
  let yb = H;
  (["loss", "stored", "export"] as NodeKey[]).forEach((n) => {
    if (right.includes(n)) {
      set(n, W - nw, 0);
      N[n].y = yb - N[n].h;
      yb = N[n].y - gap;
    }
  });
  if (bat) {
    set("bat", W / 2 - nw / 2, hh(f.pvHome) + gap);
    if (N.bat.y + N.bat.h > H) N.bat.y = H - N.bat.h;
  }

  // Stack ribbons: at the source in link order, at the target by source rank PV < Battery < Grid.
  const so: Partial<Record<NodeKey, number>> = {};
  const to: Partial<Record<NodeKey, number>> = {};
  const laid = L.filter((l) => right.includes(l.t) || l.t === "bat").map((l, i) => {
    const w = l.v > 0 ? Math.max(l.v * k, 1.5) : 0;
    const ys = N[l.s].y + (so[l.s] ?? 0);
    so[l.s] = (so[l.s] ?? 0) + w;
    return { ...l, i, w, ys, yt: 0 };
  });
  [...laid]
    .sort((a, b) => (SOURCE_RANK[a.s] ?? 0) - (SOURCE_RANK[b.s] ?? 0))
    .forEach((l) => {
      l.yt = N[l.t].y + (to[l.t] ?? 0);
      to[l.t] = (to[l.t] ?? 0) + l.w;
    });

  const links: LaidLink[] = [];
  const zeros: LaidLink[] = [];
  laid.forEach((l) => {
    const x1 = N[l.s].x + nw;
    const x0 = N[l.t].x;
    const m = (x1 + x0) / 2;
    const { ys, yt, w } = l;
    const base = { ...l, x1, x2: x0, c1: NODE_COLORS[l.s], c2: NODE_COLORS[l.t], mx: m, my: (ys + yt) / 2 + w / 2 };
    if (!w) {
      // Zero-value link (e.g. grid charging): keep the path visible as a dashed centreline.
      zeros.push({ ...base, d: `M${x1},${ys + 1}C${m},${ys + 1} ${m},${yt} ${x0},${yt}` });
      return;
    }
    links.push({
      ...base,
      d: `M${x1},${ys}C${m},${ys} ${m},${yt} ${x0},${yt}L${x0},${yt + w}C${m},${yt + w} ${m},${ys + w} ${x1},${ys + w}Z`,
    });
  });

  const nodes: LaidNode[] = (["pv", "grid", ...(bat ? ["bat"] : []), ...right] as NodeKey[]).map((key) => {
    const n = N[key];
    const sub = key === "home" && f.sub ? f.sub : "";
    const anchor = n.x >= W - nw ? "end" : "start";
    const lx = n.x === 0 ? nw + 8 : n.x >= W - nw ? W - nw - 8 : n.x + nw + 8;
    const lines = sub ? 3 : 2;
    const lh = compact ? 14 : 17;
    const ly = Math.min(Math.max(n.y + n.h / 2 - ((lines - 1) * lh) / 2 + 4, 14), H - (lines - 1) * lh - 4);
    return {
      key,
      x: n.x,
      y: n.y,
      w: nw,
      h: n.h,
      v: n.v,
      color: NODE_COLORS[key],
      name: names[key][0],
      th: names[key][1],
      val: energyText(n.v),
      sub,
      lx,
      ly: ly - (compact ? 11 : 13),
      anchor,
    };
  });

  return { width: W, height: H, nodes, links, zeros, energyIn: col0, scale: k, names };
}

export interface LinkTip {
  title: string;
  kwh: string;
  pct: string;
  thb: string;
  left: number;
  top: number;
}

/** Tooltip text and position for a hovered ribbon. */
export function linkTip(layout: SankeyLayout, link: LaidLink, rate: number): LinkTip {
  return {
    title: `${layout.names[link.s][0]} → ${layout.names[link.t][0]}`,
    kwh: energyText(link.v),
    pct: ((link.v / (layout.energyIn || 1)) * 100).toFixed(1) + " % of energy in",
    thb: "≈ " + thb(link.v * rate) + " at " + rate.toFixed(2) + " ฿/kWh",
    left: Math.max(0, Math.min(link.mx - 90, layout.width - 210)),
    top: Math.max(0, link.my - 80),
  };
}

/** Ribbon opacity: 0.55 at rest; hovered 0.95, others 0.15. */
export const linkOpacity = (i: number, hovered: number | null): number =>
  hovered == null ? 0.55 : hovered === i ? 0.95 : 0.15;

export const NODE_TIP_WIDTH = 280;

export interface NodeTip {
  title: string;
  value: string;
  /** Explanation paragraphs. */
  lines: string[];
  left: number;
  top: number;
}

/**
 * What a node means, for its hover tooltip. Losses isn't measured — it's the balance — so its
 * tip breaks it down into the solar part and the battery part.
 */
export function nodeTip(layout: SankeyLayout, node: LaidNode, utility = "PEA"): NodeTip {
  const inflow = (s: NodeKey) => [...layout.links, ...layout.zeros].filter((l) => l.s === s && l.t === node.key).reduce((a, l) => a + l.v, 0);
  const hasBattery = layout.nodes.some((n) => n.key === "bat");
  let lines: string[];
  switch (node.key) {
    case "pv":
      lines = [
        "What the panels produced (the inverter's PV yield).",
        hasBattery
          ? "It goes to the home directly, into the battery, out to the grid, or is lost in conversion and running the inverter."
          : "It goes to the home directly, out to the grid, or is lost in conversion and running the inverter.",
      ];
      break;
    case "grid":
      lines = [
        `Electricity bought from ${utility}, as measured by the inverter's meter.`,
        `The ${utility} bill can differ a little (billing cycle, loads the meter can't see) — see Savings › meter gap.`,
      ];
      break;
    case "bat":
      lines = [
        "Left side: energy charged into the battery from solar. Grid charging is 0 here (the dashed line).",
        "Right side: what the battery gave back to the home.",
      ];
      break;
    case "home":
      lines = [
        "Everything the house used: solar direct + battery + grid.",
        ...(node.sub.startsWith("Backup") ? ["Backup / Grid-load = the inverter's two output ports."] : []),
      ];
      break;
    case "export":
      lines = ["Solar sent to the grid when the house (and battery) couldn't use it."];
      break;
    case "stored":
      lines = ["Net charge added to the battery in this period (charged − discharged). It's still in the battery, not lost."];
      break;
    case "loss": {
      const pv = inflow("pv");
      const bat = inflow("bat");
      lines = [
        "Not measured: the balance between what came in and what was used, stored or exported.",
        `From solar ${energyText(pv)} — produced but not accounted as home use, battery charge or export: inverter DC→AC conversion (~3–5 %), the inverter's own running power (~30–50 W, day and night) and rounding in the daily report.`,
        ...(bat > 0
          ? [`From the battery ${energyText(bat)} — charged − discharged: round-trip loss (~5–10 %) plus any charge still held at the end of the period.`]
          : []),
      ];
      break;
    }
  }
  // Beside the label (left of a right-column label, right of a left-column one), kept inside
  // the diagram; on a phone it simply overlaps the middle.
  const tipW = Math.min(NODE_TIP_WIDTH, layout.width);
  const clampX = (x: number) => Math.max(0, Math.min(x, layout.width - tipW));
  return {
    title: `${node.name} · ${node.th}`,
    value: node.val,
    lines,
    left: clampX(node.anchor === "end" ? node.lx - 240 - tipW : node.lx + 180),
    top: Math.max(0, Math.min(node.ly, layout.height - 150)),
  };
}

/** Ribbon opacity while a node is hovered: its own flows stand out. */
export const nodeLinkOpacity = (link: LinkSpec, node: NodeKey): number => (link.s === node || link.t === node ? 0.95 : 0.15);
