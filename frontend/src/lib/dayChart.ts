// Day view power chart geometry (README screen 1d): PV area, signed battery area, grid area,
// load line and SOC line on a 00:00–24:00 axis. Pure — the component only draws the result.

import type { Reading } from "@/lib/energy";

export const DAY_PAD = { l: 56, r: 56, t: 16, b: 30 };

export interface DayChartGeometry {
  W: number;
  H: number;
  pl: number;
  pt: number;
  xr: number;
  yb: number;
  ih: number;
  iw: number;
  y0: number;
  nowX: number;
  lastT: number;
  yTicks: { y: number; label: string; zero: boolean }[];
  socTicks: { y: number; label: string }[];
  xTicks: { x: number; label: string }[];
  pvArea: string;
  pvLine: string;
  batArea: string;
  gridArea: string;
  loadLine: string;
  socLine: string;
  X: (t: number) => number;
  Y: (w: number) => number;
  S: (s: number) => number;
}

export function dayChart(P: Reading[], W: number, H: number): DayChartGeometry | null {
  if (!P.length) return null;
  const { l: pl, r: pr, t: pt, b: pb } = DAY_PAD;
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const maxW = Math.max(1000, Math.ceil(Math.max(...P.map((p) => Math.max(p.pv, p.load, p.bat))) / 1000) * 1000);
  const minW = Math.min(0, Math.floor(Math.min(...P.map((p) => p.bat)) / 1000) * 1000);
  const X = (t: number) => pl + (t / 1440) * iw;
  const Y = (w: number) => pt + ((maxW - w) / (maxW - minW)) * ih;
  const S = (s: number) => pt + ((100 - s) / 100) * ih;
  const line = (f: (p: Reading) => number, fy: (v: number) => number) =>
    P.map((p, i) => (i ? "L" : "M") + X(p.t).toFixed(1) + "," + fy(f(p)).toFixed(1)).join("");
  const area = (f: (p: Reading) => number) =>
    "M" + X(P[0].t) + "," + Y(0) + P.map((p) => "L" + X(p.t).toFixed(1) + "," + Y(f(p)).toFixed(1)).join("") +
    "L" + X(P[P.length - 1].t) + "," + Y(0) + "Z";
  const last = P[P.length - 1];

  const yTicks = [];
  for (let w = minW; w <= maxW; w += 1000) yTicks.push({ y: Y(w), label: `${w / 1000} kW`, zero: w === 0 });

  return {
    W,
    H,
    pl,
    pt,
    xr: W - pr,
    yb: pt + ih,
    ih,
    iw,
    y0: Y(0),
    nowX: X(last.t),
    lastT: last.t,
    yTicks,
    socTicks: [0, 25, 50, 75, 100].map((s) => ({ y: S(s), label: `${s} %` })),
    // Every 3 h; every 6 h when the plot is too narrow for nine labels (mobile).
    xTicks: (iw < 600 ? [0, 6, 12, 18, 24] : [0, 3, 6, 9, 12, 15, 18, 21, 24]).map((h) => ({
      x: X(h * 60),
      label: `${String(h).padStart(2, "0")}:00`,
    })),
    pvArea: area((p) => p.pv),
    pvLine: line((p) => p.pv, Y),
    batArea: area((p) => p.bat),
    gridArea: area((p) => p.grid),
    loadLine: line((p) => p.load, Y),
    socLine: line((p) => p.soc, S),
    X,
    Y,
    S,
  };
}

/** Index of the reading nearest to chart x (in chart units), or null outside the data. */
export function nearestIndex(P: Reading[], g: DayChartGeometry, x: number): number | null {
  const t = ((x - g.pl) / g.iw) * 1440;
  if (t < 0 || t > g.lastT + 5) return null;
  let bi = 0;
  let bd = Infinity;
  P.forEach((p, i) => {
    const d = Math.abs(p.t - t);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  return bi;
}

export interface DayStats {
  sunrise: Reading;
  low: Reading;
  full: Reading | undefined;
  peak: Reading;
  tempMax: number;
  last: Reading;
}

/** SOC at sunrise (first PV > 50 W), SOC low, first full, peak PV, max inverter temp. */
export function dayStats(P: Reading[]): DayStats | null {
  if (!P.length) return null;
  return {
    sunrise: P.find((p) => p.pv > 50) ?? P[0],
    low: P.reduce((a, b) => (b.soc < a.soc ? b : a)),
    full: P.find((p) => p.soc >= 100),
    peak: P.reduce((a, b) => (b.pv > a.pv ? b : a)),
    tempMax: Math.max(...P.map((p) => p.temp)),
    last: P[P.length - 1],
  };
}

export const kw2 = (w: number): string => (w / 1000).toFixed(2) + " kW";
