import { useMemo, useState } from "react";
import { DayNightBar } from "@/components/DayNight";
import { WeatherStrip } from "@/components/Weather";
import type { WeatherHour } from "@/lib/weather";
import { AxisLabel, Dot } from "@/components/ui";
import type { Daylight } from "@/lib/battery";
import { dayChart, kw2, nearestIndex } from "@/lib/dayChart";
import type { Reading } from "@/lib/energy";
import { dmy, hm } from "@/lib/format";
import { COLORS } from "@/lib/sankey";

interface Props {
  P: Reading[];
  date: string;
  width: number;
  height: number;
  /** Draw the future block + NOW marker (the selected day is today and still in progress). */
  live: boolean;
  /** Sun / moon bar above the plot (lib/battery daylight). */
  daylight?: Daylight | null;
  /** Hourly site weather for the day (lib/weather); drawn under the sun / moon bar. */
  weather?: WeatherHour[];
}

/** 5-min power chart (1d): PV / battery ± / grid areas, load line, SOC on the right axis. */
export function DayPowerChart({ P, date, width, height, live, daylight, weather }: Props) {
  const g = useMemo(() => (width > 0 ? dayChart(P, width, height) : null), [P, width, height]);
  const [hi, setHi] = useState<number | null>(null);
  if (!g) return <div style={{ height }} />;
  const h = hi != null ? P[hi] : null;
  const showNow = live && g.lastT < 1435;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHi(nearestIndex(P, g, ((e.clientX - r.left) / r.width) * g.W));
  };
  const hx = h ? g.X(h.t) : 0;
  const rows = h
    ? [
        { label: "Solar PV", val: kw2(h.pv), color: COLORS.pv },
        { label: h.bat < 0 ? "Battery discharge" : "Battery charge", val: kw2(Math.abs(h.bat)), color: COLORS.bat },
        { label: "Grid import", val: kw2(h.grid), color: COLORS.grid },
        { label: "Home load", val: kw2(h.load), color: COLORS.load },
        { label: "SOC", val: `${h.soc} %`, color: COLORS.loss },
      ]
    : [];

  return (
    <div>
      {daylight && <DayNightBar d={daylight} left={g.pl} width={g.xr - g.pl} />}
      {weather && weather.some((x) => x.cond) && (
        <WeatherStrip hours={weather} left={g.pl} width={g.xr - g.pl} rise={daylight?.rise} set={daylight?.set} lastT={live && g.lastT < 1435 ? g.lastT : null} />
      )}
      <div style={{ position: "relative" }}>
        <svg
          width={g.W}
          height={g.H}
          style={{ display: "block", overflow: "visible", touchAction: "pan-y" }}
          onMouseMove={onMove}
          onMouseLeave={() => setHi(null)}
          onTouchStart={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setHi(nearestIndex(P, g, ((e.touches[0].clientX - r.left) / r.width) * g.W));
          }}
          role="img"
          aria-label={`Power on ${dmy(date)}`}
        >
          {g.yTicks.map((t) => (
            <line key={t.label} x1={g.pl} x2={g.xr} y1={t.y} y2={t.y} stroke="var(--color-text)" strokeOpacity={t.zero ? 0 : 0.1} strokeWidth={1} />
          ))}
          {g.xTicks.map((t) => (
            <line key={t.label} x1={t.x} x2={t.x} y1={g.pt} y2={g.yb} stroke="var(--color-text)" strokeOpacity={0.08} />
          ))}
          <path d={g.pvArea} fill={COLORS.pv} fillOpacity={0.55} />
          <path d={g.pvLine} fill="none" stroke={COLORS.pv} strokeWidth={1.5} />
          <path d={g.batArea} fill={COLORS.bat} fillOpacity={0.45} />
          <path d={g.gridArea} fill={COLORS.grid} fillOpacity={0.8} />
          <path d={g.loadLine} fill="none" stroke={COLORS.load} strokeWidth={2} />
          {/* SOC is told apart by colour (ink) and weight, not dash: dash means "estimated". */}
          <path d={g.socLine} fill="none" stroke="var(--color-text)" strokeWidth={1.25} strokeOpacity={0.85} />
          <line x1={g.pl} x2={g.xr} y1={g.y0} y2={g.y0} stroke="var(--color-text)" strokeWidth={2} />
          {/* Last-reading marker: 2px accent, 3px overshoot; after it the day stays empty ground. */}
          {showNow && <line x1={g.nowX} x2={g.nowX} y1={g.pt - 3} y2={g.yb + 3} stroke="var(--color-accent)" strokeWidth={2} />}
          {h && (
            <>
              <line x1={hx} x2={hx} y1={g.pt} y2={g.yb} stroke="var(--color-text)" strokeWidth={1} />
              <circle cx={hx} cy={g.Y(h.pv)} r={4} fill={COLORS.pv} />
              <circle cx={hx} cy={g.Y(h.load)} r={4} fill={COLORS.load} />
              <circle cx={hx} cy={g.Y(h.bat)} r={4} fill={COLORS.bat} />
            </>
          )}
        </svg>
        {g.yTicks.map((t) => (
          <AxisLabel key={t.label} x={g.pl - 8} y={t.y} anchor="end">
            {t.label}
          </AxisLabel>
        ))}
        {g.socTicks.map((t) => (
          <AxisLabel key={t.label} x={g.xr + 8} y={t.y}>
            {t.label}
          </AxisLabel>
        ))}
        {g.xTicks.map((t) => (
          <AxisLabel key={t.label} x={t.x} y={g.H - 10} anchor="middle">
            {t.label}
          </AxisLabel>
        ))}
        {showNow && (
          <div className="abs" style={{ left: g.nowX + 6, top: g.H - DAY_NOW_OFFSET, transform: "translateY(-50%)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-accent)" }}>{hm(g.lastT)}</span>
          </div>
        )}
        {h && (
          <div className="abs" style={{ top: 24, left: hx > g.W - 240 ? hx - 196 : hx + 14, zIndex: 2 }}>
            <div className="tooltip" style={{ gap: 3, padding: "12px 14px", fontSize: 12, minWidth: 170 }}>
              <span style={{ fontWeight: 800, fontSize: 13 }}>
                {hm(h.t)} · {dmy(date)}
              </span>
              {rows.map((r) => (
                <span key={r.label} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Dot color={r.color} />
                  <span style={{ marginRight: "auto" }}>{r.label}</span>
                  <span style={{ fontWeight: 600 }}>{r.val}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// NOW label sits 12px above the plot bottom (pb 30 + 12).
const DAY_NOW_OFFSET = 42;
