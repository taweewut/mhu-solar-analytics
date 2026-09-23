import { Moon, Sun } from "@/components/Icons";
import type { Daylight } from "@/lib/battery";
import { hm } from "@/lib/format";
import { COLORS } from "@/lib/sankey";

// Sun / moon bands: when PV is up (the battery charges) and when the house runs on the
// battery. Shared by the Battery heatmaps (hour columns) and the 24-h line charts (minutes).

export const SUN_BG = `color-mix(in srgb, ${COLORS.pv} 20%, var(--color-bg))`;
export const MOON = "#5b6ea8";
export const MOON_BG = `color-mix(in srgb, ${MOON} 16%, var(--color-bg))`;

export const sunTitle = (d: Daylight) => `Sun up ${hm(d.rise)}–${hm(d.set)} (median of ${d.days} days): PV charges the battery`;
export const MOON_TITLE = "Night: the battery discharges to run the house";

export function BandIcon({ sun }: { sun: boolean }) {
  return <span style={{ display: "flex", color: sun ? COLORS.pv : MOON }}>{sun ? <Sun size={14} /> : <Moon size={13} />}</span>;
}

const bandStyle = (sun: boolean, height: number): React.CSSProperties => ({
  height,
  background: sun ? SUN_BG : MOON_BG,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
});

/**
 * Minute-accurate sun / moon bar over a 24-h line chart's plot area (`left` = the plot's left
 * edge, `width` = its width): night 00:00 → sunrise, day sunrise → sunset, night → 24:00.
 */
export function DayNightBar({ d, left, width, height = 18 }: { d: Daylight; left: number; width: number; height?: number }) {
  const x = (t: number) => (t / 1440) * width;
  const bands: [number, number, boolean][] = [
    [0, d.rise, false],
    [d.rise, d.set, true],
    [d.set, 1440, false],
  ];
  return (
    <div style={{ position: "relative", marginLeft: left, width, height, marginBottom: 4 }}>
      {bands.map(([from, to, sun]) =>
        to > from ? (
          <div
            key={from}
            title={sun ? sunTitle(d) : MOON_TITLE}
            style={{ ...bandStyle(sun, height), position: "absolute", left: x(from), width: x(to) - x(from) - (to < 1440 ? 1 : 0) }}
          >
            <BandIcon sun={sun} />
            {sun && x(to) - x(from) > 130 && <span>{`${hm(d.rise)}–${hm(d.set)}`}</span>}
          </div>
        ) : null,
      )}
    </div>
  );
}

/** Hour-column version for the Battery heatmaps (a row of the `.heatmap` grid). */
export function DayNightStrip({ d, mobile }: { d: Daylight | null; mobile: boolean }) {
  if (!d) return null;
  const h = mobile ? 20 : 24;
  const band = (from: number, to: number, sun: boolean) => {
    if (to <= from) return null;
    const wide = !mobile && to - from >= 4;
    return (
      <div key={`${sun}${from}`} title={sun ? sunTitle(d) : MOON_TITLE} style={{ ...bandStyle(sun, h), gridColumn: `${from + 2} / ${to + 2}` }}>
        <BandIcon sun={sun} />
        {wide && <span>{sun ? `${hm(d.rise)}–${hm(d.set)} · charging` : "discharging"}</span>}
      </div>
    );
  };
  return (
    <>
      <span />
      {band(0, d.fromHour, false)}
      {band(d.fromHour, d.toHour, true)}
      {band(d.toHour, 24, false)}
    </>
  );
}
