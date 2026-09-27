// TV mode (docs/tv-design): which palette and screen set the time of day gets, and the battery
// words. Three palettes: light by day, dark from sunset to 21:30, dimmed night until sunrise.

export type TvTheme = "auto" | "light" | "dark" | "night";

/** day: light rotation · evening: dark rotation · night: the one dimmed screen that stays. */
export type TvPeriod = "day" | "evening" | "night";

/** 21:30, when the evening rotation gives way to the night screen. */
export const NIGHT_FROM = 21 * 60 + 30;

/** Light between sunrise and sunset (minutes of day), dark otherwise — or a forced theme. */
export function tvIsLight(theme: TvTheme, minute: number, rise = 360, set = 1080): boolean {
  return tvPeriod(theme, minute, rise, set) === "day";
}

/**
 * Sunrise → sunset: day. Sunset → 21:30: evening. 21:30 → sunrise: night. A forced theme wins
 * (light = the day rotation, dark = the evening rotation, night = the night screen).
 */
export function tvPeriod(theme: TvTheme, minute: number, rise = 360, set = 1080): TvPeriod {
  if (theme === "light") return "day";
  if (theme === "dark") return "evening";
  if (theme === "night") return "night";
  if (minute >= rise && minute < set) return "day";
  if (minute >= set && minute < NIGHT_FROM) return "evening";
  return "night";
}

/** The palette classes on `.tv`. */
export const paletteClass = (p: TvPeriod): string => (p === "day" ? "" : p === "evening" ? "dark" : "dark night");

export type BatteryWord = "full" | "high" | "mid" | "low";

/** ≥ 97 full · 60–96 high · 20–59 mid · < 20 low. */
export function batteryWord(soc: number): BatteryWord {
  if (soc >= 97) return "full";
  if (soc >= 60) return "high";
  if (soc >= 20) return "mid";
  return "low";
}

/** The hero battery's fill rect (viewBox 0 0 240 416): y = 56 + 336 × (1 − level). */
export function batteryFill(soc: number): { y: number; height: number } {
  const level = Math.min(1, Math.max(0, soc / 100));
  const height = Math.round(336 * level);
  return { y: 56 + 336 - height, height };
}
