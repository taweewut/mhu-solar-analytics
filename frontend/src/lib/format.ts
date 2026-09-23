// Display formatters, matching the mockup's helpers.

/** kWh: whole numbers with grouping from 100 up, else one decimal. */
export const kwh = (v: number): string =>
  Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1);

/**
 * Energy with a unit that fits its size: kWh below 1,000, MWh from there
 * (4,032 kWh → 4.03 MWh, 29,122 kWh → 29.1 MWh, 150,000 kWh → 150 MWh).
 */
export function energy(kwhValue: number): { value: string; unit: "kWh" | "MWh" } {
  if (Math.abs(kwhValue) < 1000) return { value: kwh(kwhValue), unit: "kWh" };
  const mwh = kwhValue / 1000;
  const dp = Math.abs(mwh) < 10 ? 2 : Math.abs(mwh) < 100 ? 1 : 0;
  return { value: mwh.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }), unit: "MWh" };
}

/** `energy()` as one string: "140 kWh", "4.03 MWh". */
export const energyText = (kwhValue: number): string => {
  const e = energy(kwhValue);
  return `${e.value} ${e.unit}`;
};

export const thb = (v: number): string => "฿" + Math.round(v).toLocaleString("en-US");

const pad = (n: number) => String(n).padStart(2, "0");

/** Minutes after midnight → "HH:MM". */
export const hm = (t: number): string => `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;

/** "2026-09-23…" → "23/09/2026". */
export const dmy = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** "2026-09-23…" → "23/09". */
export const dm = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Weekday of an ISO date, computed in UTC so the host time zone can't shift it. */
export const weekday = (iso: string): string =>
  WEEKDAY[new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay()];

/** Minutes after midnight of an ISO local timestamp "YYYY-MM-DD HH:MM:SS". */
export const minuteOfDay = (time: string): number => +time.slice(11, 13) * 60 + +time.slice(14, 16);

/** 140×24 sparkline path (as in the mockup). */
export function spark(values: number[], w = 140, h = 24): string {
  const vals = values.filter((v) => Number.isFinite(v)); // e.g. a month without meter data
  if (vals.length < 2) return "";
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const r = mx - mn || 1;
  return vals
    .map((v, i) => (i ? "L" : "M") + ((i / (vals.length - 1)) * w).toFixed(1) + "," + (h - 2 - ((v - mn) / r) * (h - 4)).toFixed(1))
    .join("");
}
