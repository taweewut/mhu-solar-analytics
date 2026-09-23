// Shared chart geometry (README v2 "Shared chart helpers"): grouped bars with an optional
// right-axis line, and a 24-hour line chart. Pure — components draw the SVG and overlay all
// text as HTML at the positions computed here.

/** "Nice" step: 1, 2 or 5 × 10ⁿ, the smallest one ≥ v. */
export function niceStep(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export interface BarValue {
  /** null = not measured for this group (no bar, never a 0 bar). */
  v: number | null;
  color: string;
  /** An estimate (outage fill): drawn lighter with a dashed outline. */
  est?: boolean;
}

export interface BarGroup {
  label: string;
  sub?: string;
  /** Label above the tallest bar of the group. */
  top?: string;
  /** null = no data for this group: drawn as a hatched "not loaded" slot, never as zero. */
  vals: BarValue[] | null;
  /** Why a hatched group has no bars (default "not loaded"). */
  missingLabel?: string;
}

export interface RightAxis {
  min: number;
  max: number;
  ticks: number[];
  /** One value per group; null leaves a gap in the line. */
  vals: (number | null)[];
  fmt: (v: number) => string;
  /** Print each value next to its marker. */
  labels?: boolean;
}

export interface GroupBarsInput {
  width: number;
  height: number;
  groups: BarGroup[];
  fmt: (v: number) => string;
  ticks?: number;
  right?: RightAxis;
  /** Space either side of each group's bars (10 in the design; smaller for 30 daily groups). */
  inset?: number;
}

export interface Pos {
  x: number;
  y: number;
}

export interface GroupBarsGeometry {
  W: number;
  H: number;
  pl: number;
  pt: number;
  xr: number;
  yb: number;
  rects: { x: number; y: number; w: number; h: number; color: string; est?: boolean }[];
  missing: { x: number; y: number; w: number; h: number }[];
  yTicks: (Pos & { label: string })[];
  rTicks: (Pos & { label: string })[];
  tops: (Pos & { label: string })[];
  xlabels: (Pos & { label: string; sub: string })[];
  line: string;
  dots: Pos[];
}

export function groupBars({ width: W, height: H, groups, fmt, ticks = 4, right, inset = 10 }: GroupBarsInput): GroupBarsGeometry {
  const pl = 56;
  const pr = right ? 48 : 8;
  const pt = 28;
  const pb = 40;
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const all = groups.flatMap((g) => g.vals?.map((v) => v.v).filter((v): v is number => v != null) ?? []);
  const mx = all.length ? Math.max(...all) : 0;
  const step = niceStep(mx / ticks);
  const ymax = Math.max(step, Math.ceil(mx / step - 1e-9) * step);
  const Y = (v: number) => pt + (1 - v / ymax) * ih;
  const gw = iw / Math.max(groups.length, 1);
  const nb = groups.find((g) => g.vals)?.vals!.length ?? 1;
  const bw = Math.max(2, Math.min(28, (gw - 2 * inset) / nb - 3));
  const slot = nb * (bw + 3) - 3;

  const rects: GroupBarsGeometry["rects"] = [];
  const missing: GroupBarsGeometry["missing"] = [];
  const tops: GroupBarsGeometry["tops"] = [];
  const xlabels: GroupBarsGeometry["xlabels"] = [];
  groups.forEach((g, i) => {
    const x0 = pl + gw * i + inset;
    if (g.vals) {
      g.vals.forEach((v, j) => v.v != null && rects.push({ x: x0 + j * (bw + 3), y: Y(v.v), w: bw, h: Y(0) - Y(v.v), color: v.color, est: v.est }));
      if (g.top) tops.push({ label: g.top, x: x0, y: Y(Math.max(0, ...g.vals.map((v) => v.v ?? 0))) - 10 });
    } else {
      missing.push({ x: x0, y: pt, w: slot, h: ih });
    }
    xlabels.push({ label: g.label, sub: g.vals ? (g.sub ?? "") : (g.missingLabel ?? "not loaded"), x: x0, y: H - 34 });
  });

  const yTicks: GroupBarsGeometry["yTicks"] = [];
  for (let v = 0; v <= ymax + 1e-9; v += step) yTicks.push({ x: pl - 8, y: Y(v), label: fmt(v) });

  let line = "";
  const dots: Pos[] = [];
  const rTicks: GroupBarsGeometry["rTicks"] = [];
  if (right) {
    const R = (v: number) => pt + ((right.max - v) / (right.max - right.min)) * ih;
    let pen = false;
    right.vals.forEach((v, i) => {
      if (v == null || !groups[i]?.vals) {
        pen = false;
        return;
      }
      const p = { x: pl + gw * i + inset + (nb * (bw + 3)) / 2, y: R(v) };
      line += (pen ? "L" : "M") + p.x.toFixed(1) + "," + p.y.toFixed(1);
      pen = true;
      dots.push(p);
      if (right.labels) tops.push({ label: right.fmt(v), x: p.x + 6, y: p.y - 12 });
    });
    right.ticks.forEach((v) => rTicks.push({ x: W - pr + 8, y: R(v), label: right.fmt(v) }));
  }
  return { W, H, pl, pt, xr: W - pr, yb: Y(0), rects, missing, yTicks, rTicks, tops, xlabels, line, dots };
}

export interface LineSeries {
  /** [minute of day, value]; a null value breaks the line. */
  pts: [number, number | null][];
  color: string;
  w?: number;
  dash?: string;
  /** Mark each point: for sparse samples (every 15 min), where a lone point has no line. */
  dots?: boolean;
}

export interface LineChartInput {
  width: number;
  height: number;
  series: LineSeries[];
  ymin: number;
  ymax: number;
  step: number;
  fmt: (v: number) => string;
  /** Minute of the latest reading when the day is still in progress: shades the rest of the day. */
  nowT?: number | null;
}

export interface LineChartGeometry {
  W: number;
  H: number;
  pl: number;
  pt: number;
  ih: number;
  xr: number;
  yb: number;
  paths: { d: string; color: string; w: number; dash?: string }[];
  /** Point markers of `dots` series. */
  marks: { x: number; y: number; color: string }[];
  yTicks: (Pos & { label: string })[];
  xTicks: (Pos & { label: string })[];
  nowX: number | null;
}

export function lineChart({ width: W, height: H, series, ymin, ymax, step, fmt, nowT }: LineChartInput): LineChartGeometry {
  const pl = 56;
  const pr = 12;
  const pt = 12;
  const pb = 28;
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const X = (t: number) => pl + (t / 1440) * iw;
  const Y = (v: number) => pt + ((ymax - v) / (ymax - ymin)) * ih;
  const paths = series.map((s) => {
    let d = "";
    let pen = false;
    for (const [t, v] of s.pts) {
      if (v == null) {
        pen = false;
        continue;
      }
      d += (pen ? "L" : "M") + X(t).toFixed(1) + "," + Y(v).toFixed(1);
      pen = true;
    }
    return { d, color: s.color, w: s.w ?? 2, dash: s.dash };
  });
  const marks = series.flatMap((s) =>
    s.dots ? s.pts.flatMap(([t, v]) => (v == null ? [] : [{ x: X(t), y: Y(v), color: s.color }])) : [],
  );
  const yTicks: LineChartGeometry["yTicks"] = [];
  for (let v = ymin; v <= ymax + 1e-9; v += step) yTicks.push({ x: pl - 8, y: Y(v), label: fmt(v) });
  // Every 3 h; every 6 h when the plot is too narrow for nine labels (mobile).
  const hours = iw < 400 ? [0, 6, 12, 18, 24] : [0, 3, 6, 9, 12, 15, 18, 21, 24];
  const xTicks = hours.map((h) => ({ x: X(h * 60), y: H - 10, label: `${String(h).padStart(2, "0")}:00` }));
  return { W, H, pl, pt, ih, xr: W - pr, yb: pt + ih, paths, marks, yTicks, xTicks, nowX: nowT != null ? X(nowT) : null };
}

/** Axis bounds that cover `vals` in whole `step`s, never narrower than [lo, hi]. */
export function coverRange(vals: number[], lo: number, hi: number, step: number): [number, number] {
  if (!vals.length) return [lo, hi];
  return [Math.min(lo, Math.floor(Math.min(...vals) / step) * step), Math.max(hi, Math.ceil(Math.max(...vals) / step) * step)];
}
