// Hourly weather at the site (Open-Meteo model data, not a local sensor) for the Day chart:
// WMO weather codes → a few conditions with EN / TH labels, and a daylight summary for the day.

import type { WeatherRow } from "@/lib/types";

export type Sky = "clear" | "mostly" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "storm";

export interface Condition {
  sky: Sky;
  en: string;
  th: string;
}

const C: Record<Sky, Condition> = {
  clear: { sky: "clear", en: "Clear", th: "ท้องฟ้าแจ่มใส" },
  mostly: { sky: "mostly", en: "Mostly clear", th: "แจ่มใสเป็นส่วนใหญ่" },
  partly: { sky: "partly", en: "Partly cloudy", th: "มีเมฆบางส่วน" },
  cloudy: { sky: "cloudy", en: "Cloudy", th: "เมฆมาก" },
  fog: { sky: "fog", en: "Fog", th: "หมอก" },
  drizzle: { sky: "drizzle", en: "Drizzle", th: "ฝนปรอย" },
  rain: { sky: "rain", en: "Rain", th: "ฝนตก" },
  storm: { sky: "storm", en: "Thunderstorm", th: "พายุฝนฟ้าคะนอง" },
};

/** WMO weather code → condition (0 clear, 1 mainly clear, 2 partly, 3 overcast, 45/48 fog,
 *  51–57 drizzle, 61–67 / 80–82 rain (and any snow code), 95–99 thunderstorm). */
export function condition(code: number): Condition {
  if (code === 0) return C.clear;
  if (code === 1) return C.mostly;
  if (code === 2) return C.partly;
  if (code === 3) return C.cloudy;
  if (code === 45 || code === 48) return C.fog;
  if (code >= 51 && code <= 57) return C.drizzle;
  if (code >= 95) return C.storm;
  return C.rain;
}

export interface WeatherHour {
  h: number;
  row: WeatherRow | null;
  cond: Condition | null;
}

/** The 24 hours of a date (hours with no data are null — never guessed). */
export function weatherDay(rows: WeatherRow[], date: string): WeatherHour[] {
  const by = new Map(rows.filter((r) => r.time.startsWith(date)).map((r) => [Number(r.time.slice(11, 13)), r]));
  return Array.from({ length: 24 }, (_, h) => {
    const row = by.get(h) ?? null;
    return { h, row, cond: row?.code != null ? condition(row.code) : null };
  });
}

/**
 * One line for the day, from the daylight hours (sunrise → sunset, minutes of day):
 * thunderstorms or rain if it rained for 2+ daylight hours, else mostly sunny / partly
 * cloudy / mostly cloudy by the majority — plus the day's total rain.
 */
export interface DaySummary {
  en: string;
  th: string;
  rainMm: number;
  /** The day's icon: storm, rain, clear, cloudy or partly. */
  sky: Sky;
}

export function daySummary(hours: WeatherHour[], rise = 360, set = 1080): DaySummary | null {
  const day = hours.filter((x) => x.cond && x.h * 60 + 30 >= rise && x.h * 60 + 30 <= set);
  if (!day.length) return null;
  const n = (skies: Sky[]) => day.filter((x) => skies.includes(x.cond!.sky)).length;
  const rainMm = Math.round(hours.reduce((a, x) => a + (x.row?.rain_mm ?? 0), 0) * 10) / 10;
  const wet = n(["drizzle", "rain", "storm"]);
  const sunny = n(["clear", "mostly"]);
  const cloudy = n(["cloudy", "fog"]) + wet;
  const base: { en: string; th: string; sky: Sky } =
    n(["storm"]) > 0
      ? { en: "Thunderstorms", th: "มีพายุฝนฟ้าคะนอง", sky: "storm" }
      : wet >= 2
        ? { en: "Rainy", th: "มีฝน", sky: "rain" }
        : sunny >= day.length / 2
          ? { en: "Mostly sunny", th: "แดดดีเป็นส่วนใหญ่", sky: "clear" }
          : cloudy >= day.length / 2
            ? { en: "Mostly cloudy", th: "เมฆมากเป็นส่วนใหญ่", sky: "cloudy" }
            : { en: "Partly cloudy", th: "มีเมฆบางส่วน", sky: "partly" };
  return rainMm >= 0.2 ? { en: `${base.en} · ${rainMm} mm rain`, th: `${base.th} · ฝน ${rainMm} มม.`, rainMm, sky: base.sky } : { ...base, rainMm };
}

/** One summary per date for a set of dates (the Day-by-day table), from one pass over the rows. */
export function dailyWeather(rows: WeatherRow[], dates: string[]): Map<string, DaySummary> {
  const want = new Set(dates);
  const byDay = new Map<string, WeatherRow[]>();
  for (const r of rows) {
    const d = r.time.slice(0, 10);
    if (want.has(d)) byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const out = new Map<string, DaySummary>();
  byDay.forEach((list, d) => {
    const s = daySummary(weatherDay(list, d));
    if (s) out.set(d, s);
  });
  return out;
}
