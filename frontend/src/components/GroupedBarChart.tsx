import { useId, useMemo } from "react";
import { groupBars, type GroupBarsInput } from "@/lib/charts";

/**
 * Grouped bars (2a/2b): one group per month, optional right-axis line with square markers,
 * labels above groups and a two-line x label. Groups with `vals: null` render hatched
 * ("not loaded"). All text is HTML overlaid on the SVG.
 */
export function GroupedBarChart(props: GroupBarsInput & { label: string }) {
  const { label, width, height, groups, fmt, ticks, right, inset } = props;
  const hatch = useId().replace(/:/g, "");
  const g = useMemo(
    () => (width > 0 ? groupBars({ width, height, groups, fmt, ticks, right, inset }) : null),
    [width, height, groups, fmt, ticks, right, inset],
  );
  if (!g) return <div style={{ height }} />;

  return (
    <div style={{ position: "relative", width: g.W }}>
      <svg width={g.W} height={g.H} style={{ display: "block", overflow: "visible" }} role="img" aria-label={label}>
        <defs>
          <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="1" y1="0" x2="1" y2="6" stroke="var(--color-text)" strokeOpacity={0.12} strokeWidth={2} />
          </pattern>
        </defs>
        {g.yTicks.map((t) => (
          <line key={t.label} x1={g.pl} x2={g.xr} y1={t.y} y2={t.y} stroke="var(--color-text)" strokeOpacity={0.1} />
        ))}
        {g.missing.map((m) => (
          <rect key={m.x} x={m.x} y={m.y} width={m.w} height={m.h} fill={`url(#${hatch})`} />
        ))}
        {g.rects.map((r, i) =>
          r.est ? (
            // Estimated (outage fill): lighter fill, dashed outline in the series colour.
            <rect key={i} x={r.x + 0.75} y={r.y + 0.75} width={Math.max(0, r.w - 1.5)} height={Math.max(0, r.h - 1.5)} fill={r.color} fillOpacity={0.35} stroke={r.color} strokeWidth={1.5} strokeDasharray="3 2" />
          ) : (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.color} />
          ),
        )}
        {g.line && <path d={g.line} fill="none" stroke="var(--color-text)" strokeWidth={2} />}
        {g.dots.map((d, i) => (
          <rect key={i} x={d.x - 3.5} y={d.y - 3.5} width={7} height={7} fill="var(--color-text)" />
        ))}
        <line x1={g.pl} x2={g.xr} y1={g.yb} y2={g.yb} stroke="var(--color-text)" strokeWidth={2} />
      </svg>
      {g.yTicks.map((t) => (
        <div key={t.label} className="abs" style={{ left: t.x, top: t.y, transform: "translate(-100%,-50%)" }}>
          <span className="muted" style={{ fontSize: 11 }}>{t.label}</span>
        </div>
      ))}
      {g.rTicks.map((t) => (
        <div key={t.label} className="abs" style={{ left: t.x, top: t.y, transform: "translateY(-50%)" }}>
          <span className="muted" style={{ fontSize: 11 }}>{t.label}</span>
        </div>
      ))}
      {g.tops.map((t, i) => (
        <div key={i} className="abs" style={{ left: t.x, top: t.y, transform: "translateY(-50%)" }}>
          <span className="tnum" style={{ fontSize: 11, fontWeight: 600 }}>{t.label}</span>
        </div>
      ))}
      {g.xlabels.map((t) => (
        <div key={t.x} className="abs" style={{ left: t.x, top: t.y }}>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{t.label}</span>
            <span className="muted" style={{ fontSize: 10 }}>{t.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
