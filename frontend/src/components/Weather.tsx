import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSun, Moon, Sun } from "@/components/Icons";
import type { Sky, WeatherHour } from "@/lib/weather";

const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Lucide icon for a sky condition; clear / partly at night use the moon. */
export function SkyIcon({ sky, night, size = 14 }: { sky: Sky; night?: boolean; size?: number }) {
  if (sky === "clear" || sky === "mostly") return night ? <Moon size={size - 1} /> : <Sun size={size} />;
  if (sky === "partly") return night ? <CloudMoon size={size} /> : <CloudSun size={size} />;
  if (sky === "cloudy") return <Cloud size={size} />;
  if (sky === "fog") return <CloudFog size={size} />;
  if (sky === "drizzle") return <CloudDrizzle size={size} />;
  if (sky === "storm") return <CloudLightning size={size} />;
  return <CloudRain size={size} />;
}

/**
 * Hourly weather row over a 24-h chart's plot area (`left` / `width` = the plot's x-range): one
 * icon per hour (every 2 h when compact), rain mm under wet hours, hours after the last reading
 * dimmed as a forecast. Icons in ink — weather isn't an energy series. Hover / title for details.
 */
export function WeatherStrip({ hours, left, width, rise = 360, set = 1080, lastT, compact }: { hours: WeatherHour[]; left: number; width: number; rise?: number; set?: number; lastT?: number | null; compact?: boolean }) {
  const small = compact ?? width < 500;
  const step = small ? 2 : 1;
  const cell = width / 24;
  return (
    <div style={{ position: "relative", marginLeft: left, width, height: small ? 18 : 30, marginBottom: 2 }} aria-label="Hourly weather">
      {hours.map((x) => {
        if (!x.cond || x.h % step) return null;
        const mid = x.h * 60 + 30;
        const forecast = lastT != null && x.h * 60 > lastT;
        const rain = x.row?.rain_mm ?? 0;
        const title =
          `${pad(x.h)} · ${x.cond.en} (${x.cond.th})` +
          (x.row?.cloud_pct != null ? ` · cloud ${x.row.cloud_pct} %` : "") +
          (rain ? ` · rain ${rain} mm` : "") +
          (x.row?.radiation_wm2 != null ? ` · sun ${x.row.radiation_wm2} W/m²` : "") +
          (forecast ? " · forecast" : "");
        return (
          <div
            key={x.h}
            title={title}
            style={{ position: "absolute", left: (x.h + step / 2) * cell, top: 0, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, color: "var(--muted-72)", opacity: forecast ? 0.45 : 1 }}
          >
            <SkyIcon sky={x.cond.sky} night={mid < rise || mid > set} size={small ? 12 : 14} />
            {!small && rain >= 0.5 && (
              <span className="tnum" style={{ fontSize: 9, lineHeight: 1 }}>
                {rain < 10 ? rain.toFixed(1) : Math.round(rain)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
