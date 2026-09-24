import { useState } from "react";
import { AxisLabel } from "@/components/ui";
import { niceStep } from "@/lib/charts";
import { MONTH_ABBR, thb } from "@/lib/format";
import { COLORS } from "@/lib/sankey";
import type { BillRow, SavingsModel } from "@/lib/tariff";

/**
 * Bill per month (1e, revised by the design review): per bill month the estimated bill without
 * solar as a dashed ink outline (an estimate, never the "no data" hatch) and the actual bill as a
 * solid bar. No labels above bars: a "Saved" value strip under the axis, est. tags under the
 * months. Fits a 350px phone. Tap / hover a month for its numbers.
 */
export function BillChart({ bills, utility, width = 768, height = 260, mobile }: { bills: BillRow[]; utility: string; width?: number; height?: number; mobile?: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  const W = width, H = height, pl = mobile ? 30 : 56, pr = 4, pt = 12, pb = 6;
  const iw = W - pl - pr, ih = H - pt - pb;
  if (!bills.length) return <div className="state muted">No {utility} bills yet — add them to the {utility} Log and run scripts/refresh_all.sh.</div>;
  if (W <= 0) return <div style={{ height }} />;
  const ymax = Math.max(1000, Math.ceil(Math.max(...bills.map((b) => Math.max(b.amount, b.withoutSolar))) / 1000) * 1000);
  const Y = (v: number) => pt + (1 - v / ymax) * ih;
  const gw = iw / bills.length;
  const bw = Math.max(6, Math.min(30, (gw - 8) / 2));
  const years = new Set(bills.map((b) => b.year)).size > 1;
  const cf = (b: BillRow) => !b.pre && !b.noData;
  const groups = bills.map((b, i) => {
    const x0 = pl + gw * i + (gw - (bw * 2 + 1)) / 2;
    return { b, x0, cx: pl + gw * i + gw / 2, aX: b.pre ? x0 + (bw + 1) / 2 : x0 + bw + 1 };
  });
  const yTicks: number[] = [];
  for (let v = 0; v <= ymax; v += 1000) yTicks.push(v);
  const k = (v: number) => (v / 1000).toFixed(1);
  const detail = (b: BillRow) =>
    `${MONTH_ABBR[b.month - 1]} ${b.year} · bill ${thb(b.amount)}` + (cf(b) ? ` · without solar ≈ ${thb(b.withoutSolar)} · saved ${thb(b.saved)}${b.estDays ? " (est.)" : ""}` : b.pre ? " · before solar" : " · no solar data");

  return (
    <div>
      <div style={{ position: "relative", width: W }}>
        <svg width={W} height={H} style={{ display: "block", overflow: "visible" }} role="img" aria-label={`${utility} bill per month, actual vs without solar`}>
          {yTicks.map((v) => (
            <line key={v} x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke="var(--color-text)" strokeOpacity={0.1} />
          ))}
          {groups.map((g) => (
            <g key={g.b.key} onClick={() => setPicked(detail(g.b))} style={{ cursor: "pointer" }}>
              <rect x={pl + gw * groups.indexOf(g)} y={pt} width={gw} height={ih} fill="transparent" />
              {cf(g.b) && (
                <path
                  d={`M${g.x0 + 0.75},${Y(0)}V${Y(g.b.withoutSolar) + 0.75}H${g.x0 + bw - 0.75}V${Y(0)}`}
                  fill="none"
                  stroke="var(--color-text)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              )}
              <rect x={g.aX} y={Y(g.b.amount)} width={bw} height={Y(0) - Y(g.b.amount)} fill={g.b.pre ? COLORS.before : COLORS.grid} />
              <title>{detail(g.b)}</title>
            </g>
          ))}
          <line x1={pl} x2={W - pr} y1={Y(0)} y2={Y(0)} stroke="var(--color-text)" strokeWidth={mobile ? 1 : 2} />
        </svg>
        {yTicks.map((v) => (
          <AxisLabel key={v} x={pl - 6} y={Y(v)} anchor="end">
            {mobile ? `${v / 1000}k` : `฿${v / 1000}k`}
          </AxisLabel>
        ))}
      </div>
      {/* Month labels (+ est. tags), then the Saved strip — one cell per bill. */}
      <div style={{ position: "relative", width: W, height: mobile ? 30 : 34, marginTop: 4 }}>
        {groups.map((g) => (
          <div key={g.b.key} style={{ position: "absolute", left: pl + gw * groups.indexOf(g), width: gw, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, lineHeight: 1.2 }}>
            <span style={{ fontSize: mobile ? 10 : 12, fontWeight: 600, whiteSpace: "nowrap" }}>
              {mobile ? MONTH_ABBR[g.b.month - 1][0] : `${MONTH_ABBR[g.b.month - 1]}${years ? ` ${String(g.b.year).slice(2)}` : ""}`}
            </span>
            {g.b.estDays > 0 && cf(g.b) ? (
              <span className="tag-est" style={{ fontSize: mobile ? 8 : 10, padding: "0 2px", lineHeight: "12px" }}>
                est.
              </span>
            ) : (
              !mobile && (
                <span className="muted-72" style={{ fontSize: 10 }}>
                  {g.b.units} u
                </span>
              )
            )}
          </div>
        ))}
      </div>
      <div style={{ position: "relative", width: W, height: 18, marginTop: 4, paddingTop: 4, borderTop: "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)" }}>
        <span style={{ position: "absolute", left: 0, top: 5, fontSize: 10, fontWeight: 700 }}>Saved</span>
        {groups.map((g) => (
          <span key={g.b.key} className="tnum" style={{ position: "absolute", left: pl + gw * groups.indexOf(g), width: gw, top: 5, textAlign: "center", fontSize: 10, whiteSpace: "nowrap" }}>
            {cf(g.b) ? (mobile ? k(g.b.saved) : thb(g.b.saved)) : "—"}
          </span>
        ))}
      </div>
      {mobile && bills.length > 1 && (
        <div className="muted-72" style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 4, paddingLeft: pl }}>
          <span>{`${MONTH_ABBR[bills[0].month - 1]} ${bills[0].year}`}</span>
          <span>฿k · tap a month for the bill</span>
          <span>{`${MONTH_ABBR[bills[bills.length - 1].month - 1]} ${bills[bills.length - 1].year}`}</span>
        </div>
      )}
      {picked && (
        <div className="caption" style={{ marginTop: 6, color: "var(--color-text)", fontWeight: 600 }}>
          {picked}
        </div>
      )}
    </div>
  );
}

/** Cumulative saved (1e): running total per bill, current month estimated as a dashed step. */
export function CumulativeChart({ s, width, height = 200 }: { s: SavingsModel; width: number; height?: number }) {
  if (width <= 0) return <div style={{ height }} />;
  const W = width, H = height, pl = 48, pr = 12, pt = 12, pb = 26;
  let run = 0;
  const pts = s.post.map((b, i) => ({ i, v: (run += b.saved), m: MONTH_ABBR[b.month - 1] }));
  const est = s.current ? { i: pts.length, v: s.cumTotal + s.current.saved, m: `${MONTH_ABBR[s.current.month - 1]}*` } : null;
  const all = est ? [...pts, est] : pts;
  if (!pts.length) return <div className="state muted">Savings start with the first bill after switch-on.</div>;
  // ~4 gridlines at a nice step (฿5k for MomHome's first year, ฿20k for six years of MhuHome).
  const step = Math.max(5000, niceStep(Math.max(...all.map((p) => p.v)) / 4));
  const top = Math.ceil(Math.max(...all.map((p) => p.v)) / step) * step || step;
  const X = (i: number) => pl + (i / Math.max(all.length - 1, 1)) * (W - pl - pr);
  // Years of monthly points: mark each January (as the year) plus the ends, no squares.
  const many = all.length > 24;
  const showLabel = (p: { i: number }, k: number) => !many || k === all.length - 1 || s.post[p.i]?.month === 1;
  const labelOf = (p: { i: number; m: string }) => (many && s.post[p.i]?.month === 1 ? String(s.post[p.i].year) : p.m);
  const Y = (v: number) => pt + (1 - v / top) * (H - pt - pb);
  const line = pts.map((p, i) => (i ? "L" : "M") + X(p.i) + "," + Y(p.v)).join("");
  const area = `${line}L${X(pts[pts.length - 1].i)},${Y(0)}L${X(0)},${Y(0)}Z`;
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);

  return (
    <div style={{ position: "relative" }}>
      <svg width={W} height={H} style={{ display: "block", overflow: "visible" }} role="img" aria-label="Cumulative savings">
        {ticks.map((v) => (
          <line key={v} x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke="var(--color-text)" strokeOpacity={0.1} />
        ))}
        <path d={area} fill="var(--color-text)" fillOpacity={0.08} />
        <path d={line} fill="none" stroke="var(--color-text)" strokeWidth={2.5} />
        {est && (
          <path d={`M${X(pts.length - 1)},${Y(s.cumTotal)}L${X(est.i)},${Y(est.v)}`} fill="none" stroke="var(--color-text)" strokeWidth={2} strokeDasharray="4 4" />
        )}
        {!many &&
          all.map((p) => (
            <rect key={p.i} x={X(p.i) - 3} y={Y(p.v) - 3} width={6} height={6} fill="var(--color-text)">
              <title>{`${p.m} ${thb(p.v)}`}</title>
            </rect>
          ))}
        <line x1={pl} x2={W - pr} y1={Y(0)} y2={Y(0)} stroke="var(--color-text)" strokeWidth={2} />
      </svg>
      {ticks.map((v) => (
        <AxisLabel key={v} x={pl - 8} y={Y(v)} anchor="end">
          ฿{v / 1000}k
        </AxisLabel>
      ))}
      {all.map(
        (p, k) =>
          showLabel(p, k) && (
            <AxisLabel key={p.i} x={X(p.i)} y={H - 10} anchor="middle">
              {labelOf(p)}
            </AxisLabel>
          ),
      )}
    </div>
  );
}
