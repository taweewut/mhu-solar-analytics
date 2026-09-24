import { describe, expect, it } from "vitest";
import { condition, dailyWeather, daySummary, weatherDay } from "@/lib/weather";
import type { WeatherRow } from "@/lib/types";

const w = (h: number, code: number, rain = 0): WeatherRow => ({ time: `2026-09-23 ${String(h).padStart(2, "0")}:00`, code, cloud_pct: null, rain_mm: rain, radiation_wm2: null });

describe("weather", () => {
  it("maps WMO codes to a few sky conditions", () => {
    expect([0, 1, 2, 3, 45, 53, 61, 81, 95].map((c) => condition(c).sky)).toEqual(["clear", "mostly", "partly", "cloudy", "fog", "drizzle", "rain", "rain", "storm"]);
  });

  it("gives 24 hours for the date, missing hours as null (never guessed)", () => {
    const day = weatherDay([w(10, 3), w(11, 61, 1.2)], "2026-09-23");
    expect(day).toHaveLength(24);
    expect(day[10].cond?.sky).toBe("cloudy");
    expect(day[9]).toEqual({ h: 9, row: null, cond: null });
  });

  it("summarises the daylight hours and the day's rain", () => {
    const sunny = weatherDay([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((h) => w(h, h < 15 ? 1 : 3)), "2026-09-23");
    expect(daySummary(sunny)?.en).toBe("Mostly sunny");
    const wet = weatherDay([w(8, 3), w(14, 61, 1.5), w(15, 63, 2.3), w(22, 61, 0.5)], "2026-09-23");
    expect(daySummary(wet)).toEqual({ en: "Rainy · 4.3 mm rain", th: "มีฝน · ฝน 4.3 มม.", rainMm: 4.3, sky: "rain" });
    expect(daySummary(weatherDay([w(14, 95, 3)], "2026-09-23"))?.en).toBe("Thunderstorms · 3 mm rain");
    expect(daySummary(weatherDay([], "2026-09-23"))).toBeNull();
  });
});

describe("daily weather for the Day-by-day table", () => {
  it("summarises each requested date that has weather, and skips the rest", () => {
    const rows = [w(9, 0), w(10, 0), w(12, 1), { ...w(10, 61, 5), time: "2026-09-22 10:00" }, { ...w(11, 63, 4), time: "2026-09-22 11:00" }];
    const m = dailyWeather(rows, ["2026-09-23", "2026-09-22", "2026-09-21"]);
    expect(m.get("2026-09-23")?.sky).toBe("clear");
    expect(m.get("2026-09-22")).toMatchObject({ sky: "rain", rainMm: 9 });
    expect(m.has("2026-09-21")).toBe(false);
  });
});
