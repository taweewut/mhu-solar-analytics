import { Moon, Sun } from "@/components/Icons";
import type { Daylight } from "@/lib/battery";
import { hm } from "@/lib/format";

// Sun / moon strip (design review 3b §2): a 6px band over any time-of-day axis — night ink 9 %
// (dark: #f1efee 13 %), day #e9a825 42 % (dark 58 %) — with the sunrise / sunset times on the
// band edges. No behaviour words: the strip shows the sun, the data shows what the battery did.

export const sunTitle = (d: Daylight) =>
  `Sun up ${hm(d.rise)}–${hm(d.set)} (${d.days === 1 ? "this day" : `median of ${d.days} days`}; first and last PV > 50 W)`;

/** The strip itself, filling its (relative) container's width = the plot's x-range. */
function Strip({ d, compact }: { d: Daylight; compact?: boolean }) {
  const pct = (t: number) => `${(t / 1440) * 100}%`;
  const label: React.CSSProperties = {
    position: "absolute",
    bottom: compact ? 8 : 9,
    display: "flex",
    alignItems: "center",
    gap: 3,
    fontSize: compact ? 10 : 11,
    fontVariantNumeric: "tabular-nums",
    color: "var(--muted-72)",
    whiteSpace: "nowrap",
  };
  return (
    <div title={sunTitle(d)} style={{ position: "relative", height: compact ? 20 : 22 }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 6, background: "var(--night)" }} />
      <div style={{ position: "absolute", left: pct(d.rise), width: pct(d.set - d.rise), bottom: 0, height: 6, background: "var(--sun)" }} />
      <span style={{ ...label, left: pct(d.rise) }}>
        {!compact && <Sun size={11} />}
        {hm(d.rise)}
      </span>
      <span style={{ ...label, right: `${(1 - d.set / 1440) * 100}%` }}>
        {hm(d.set)}
        {!compact && <Moon size={11} />}
      </span>
    </div>
  );
}

/** Over a 24-h line chart's plot area: `left` = the plot's left edge, `width` = its width. */
export function DayNightBar({ d, left, width, compact }: { d: Daylight; left: number; width: number; compact?: boolean }) {
  return (
    <div style={{ marginLeft: left, width, marginBottom: 4 }}>
      <Strip d={d} compact={compact ?? width < 400} />
    </div>
  );
}

/** A row of the `.heatmap` grid (label column + the 24 hour columns). */
export function DayNightStrip({ d, mobile }: { d: Daylight | null; mobile: boolean }) {
  if (!d) return null;
  return (
    <>
      <span />
      <div style={{ gridColumn: "2 / -1", marginBottom: 2 }}>
        <Strip d={d} compact={mobile} />
      </div>
    </>
  );
}
