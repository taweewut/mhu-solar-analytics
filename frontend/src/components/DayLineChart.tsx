import { useMemo } from "react";
import { DayNightBar } from "@/components/DayNight";
import type { Daylight } from "@/lib/battery";
import { lineChart, type LineChartInput } from "@/lib/charts";

/**
 * 24-hour line chart (2c): 00–24 h axis, series told apart by colour or weight, a 2px accent
 * marker at the last reading of an in-progress day, and an optional sun / moon strip above.
 * All text is HTML overlaid on the SVG.
 */
export function DayLineChart(props: LineChartInput & { label: string; daylight?: Daylight | null }) {
  const { label, width, height, series, ymin, ymax, step, fmt, nowT, daylight, bands, refs } = props;
  const g = useMemo(
    () => (width > 0 ? lineChart({ width, height, series, ymin, ymax, step, fmt, nowT, bands, refs }) : null),
    [width, height, series, ymin, ymax, step, fmt, nowT, bands, refs],
  );
  if (!g) return <div style={{ height }} />;
  const future = g.nowX != null && g.nowX < g.xr - 1;

  return (
    <div>
      {daylight && <DayNightBar d={daylight} left={g.pl} width={g.xr - g.pl} />}
      <div style={{ position: "relative" }}>
        <svg width={g.W} height={g.H} style={{ display: "block", overflow: "visible" }} role="img" aria-label={label}>
          {g.yTicks.map((t) => (
            <line key={t.label} x1={g.pl} x2={g.xr} y1={t.y} y2={t.y} stroke="var(--color-text)" strokeOpacity={0.1} />
          ))}
          {g.xTicks.map((t) => (
            <line key={t.label} x1={t.x} x2={t.x} y1={g.pt} y2={g.yb} stroke="var(--color-text)" strokeOpacity={0.08} />
          ))}
          {g.bandRects.map((b, i) => (
            <rect key={`b${i}`} x={g.pl} y={b.y} width={g.xr - g.pl} height={b.h} fill="var(--color-text)" fillOpacity={0.08} />
          ))}
          {g.refLines.map((r, i) => (
            <line key={`r${i}`} x1={g.pl} x2={g.xr} y1={r.y} y2={r.y} stroke="var(--color-text)" strokeOpacity={r.dotted ? 0.45 : 0.3} strokeDasharray={r.dotted ? "1 3" : undefined} />
          ))}
          {g.paths.map((p, i) => (
            <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={p.w} strokeDasharray={p.dash} />
          ))}
          {g.marks.map((m, i) => (
            <circle key={`m${i}`} cx={m.x} cy={m.y} r={2} fill={m.color} />
          ))}
          <line x1={g.pl} x2={g.xr} y1={g.yb} y2={g.yb} stroke="var(--color-text)" strokeWidth={2} />
          {/* Last-reading marker (review 3b §1): 2px accent with a 3px overshoot; the rest of the
              day stays empty ground, never filled grey. */}
          {future && <line x1={g.nowX!} x2={g.nowX!} y1={g.pt - 3} y2={g.yb + 3} stroke="var(--color-accent)" strokeWidth={2} />}
        </svg>
        {g.yTicks.map((t) => (
          <div key={t.label} className="abs" style={{ left: t.x, top: t.y, transform: "translate(-100%,-50%)" }}>
            <span className="muted" style={{ fontSize: 11 }}>{t.label}</span>
          </div>
        ))}
        {g.xTicks.map((t) => (
          <div key={t.label} className="abs" style={{ left: t.x, top: t.y, transform: "translate(-50%,-50%)" }}>
            <span className="muted" style={{ fontSize: 11 }}>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
