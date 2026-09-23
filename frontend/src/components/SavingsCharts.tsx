import { AxisLabel } from "@/components/ui";
import { niceStep } from "@/lib/charts";
import { MONTH_ABBR, thb } from "@/lib/format";
import { COLORS } from "@/lib/sankey";
import type { BillRow, SavingsModel } from "@/lib/tariff";

/** Bill per month (1e): hatched "without solar" bar + solid actual bill per bill month. */
export function BillChart({ bills, utility, width = 768, height = 300 }: { bills: BillRow[]; utility: string; width?: number; height?: number }) {
  const W = width, H = height, pl = 56, pr = 8, pt = 40, pb = 40;
  const iw = W - pl - pr, ih = H - pt - pb;
  if (!bills.length) return <div className="state muted">No {utility} bills yet — add them to the {utility} Log and run scripts/refresh_all.sh.</div>;
  const ymax = Math.max(1000, Math.ceil(Math.max(...bills.map((b) => b.withoutSolar)) / 1000) * 1000);
  const Y = (v: number) => pt + (1 - v / ymax) * ih;
  const gw = iw / bills.length, bw = 30;
  // Past ~8 bills the design's "Saved ฿x" labels collide: drop the word, shrink the type.
  const dense = bills.length > 8;
  const groups = bills.map((b, i) => {
    const cx = pl + gw * i + 18;
    return {
      b,
      cx,
      cfY: b.pre ? Y(0) : Y(b.withoutSolar),
      cfH: b.pre ? 0 : Y(0) - Y(b.withoutSolar),
      aX: b.pre ? cx : cx + bw + 3,
      aY: Y(b.amount),
      aH: Y(0) - Y(b.amount),
      sTop: (b.pre ? Y(b.amount) - 38 : Y(b.withoutSolar) - 22) - 14,
    };
  });
  const yTicks = [];
  for (let v = 0; v <= ymax; v += 1000) yTicks.push(v);

  return (
    <div style={{ position: "relative", width: W }}>
      <svg width={W} height={H} style={{ display: "block", overflow: "visible" }} role="img" aria-label={`${utility} bill per month, actual vs without solar`}>
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={COLORS.loss} strokeWidth={2.5} />
          </pattern>
        </defs>
        {yTicks.map((v) => (
          <line key={v} x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke="var(--color-text)" strokeOpacity={0.1} />
        ))}
        {groups.map((g) => (
          <g key={g.b.key}>
            <rect x={g.cx} y={g.cfY} width={bw} height={g.cfH} fill="url(#hatch)" stroke="var(--color-text)" strokeWidth={g.cfH ? 1.5 : 0} />
            <rect x={g.aX} y={g.aY} width={bw} height={g.aH} fill={g.b.pre ? COLORS.before : COLORS.grid}>
              <title>{`${MONTH_ABBR[g.b.month - 1]} ${g.b.year}: actual ${thb(g.b.amount)}${g.b.pre ? "" : `, without solar ≈ ${thb(g.b.withoutSolar)}`}`}</title>
            </rect>
          </g>
        ))}
        <line x1={pl} x2={W - pr} y1={Y(0)} y2={Y(0)} stroke="var(--color-text)" strokeWidth={2} />
      </svg>
      {yTicks.map((v) => (
        <AxisLabel key={v} x={pl - 8} y={Y(v)} anchor="end">
          ฿{v / 1000}k
        </AxisLabel>
      ))}
      {groups.map((g) => (
        <div key={g.b.key}>
          <div className="abs" style={{ left: g.aX, top: g.aY - 10, transform: "translateY(-50%)" }}>
            <span className="tnum" style={{ fontSize: dense ? 10 : 11, fontWeight: 600 }}>{thb(g.b.amount)}</span>
          </div>
          <div className="abs" style={{ left: g.cx, top: g.sTop }}>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
              <span style={{ fontSize: dense ? 11 : 12, fontWeight: 800 }}>
                {g.b.pre ? "Before solar" : g.b.noData ? "No data" : dense ? thb(g.b.saved) : `Saved ${thb(g.b.saved)}`}
                {g.b.estDays > 0 && !g.b.pre && !g.b.noData ? " est." : ""}
              </span>
              {!g.b.pre && !g.b.noData && (
                <span className="muted-72" style={{ fontSize: 11 }}>
                  −{Math.round((g.b.saved / g.b.withoutSolar) * 100)} %
                </span>
              )}
            </div>
          </div>
          <div className="abs" style={{ left: g.cx, top: H - 34 }}>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                {MONTH_ABBR[g.b.month - 1]} {g.b.year}
              </span>
              <span className="muted-72" style={{ fontSize: 10 }}>
                {g.b.units} units
              </span>
            </div>
          </div>
        </div>
      ))}
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
