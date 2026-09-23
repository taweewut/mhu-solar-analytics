// Battery (2b): SOC KPIs, the day × hour SOC heatmap, cycles and round-trip efficiency.

import { readingsFor, type Reading } from "@/lib/energy";
import type { FiveMinRow } from "@/lib/types";

/** First reading with PV > 50 W — "SOC at sunrise" is its SOC. null if the sun never came up. */
export const sunriseReading = (P: Reading[]): Reading | null => P.find((p) => p.pv > 50) ?? null;

/** Equivalent full cycles = discharge ÷ usable capacity (the home's battery kWh). */
export const equivalentCycles = (dischargeKwh: number, capacityKwh: number): number => dischargeKwh / capacityKwh;

/** Round-trip efficiency = discharge ÷ charge (a ratio; null when nothing was charged). */
export const roundTrip = (dischargeKwh: number, chargeKwh: number): number | null =>
  chargeKwh > 0 ? dischargeKwh / chargeKwh : null;

/** Mean SOC per clock hour (rounded), null for hours without readings. */
export function hourlySoc(P: Reading[]): (number | null)[] {
  return Array.from({ length: 24 }, (_, h) => {
    const r = P.filter((p) => Math.floor(p.t / 60) === h);
    return r.length ? Math.round(r.reduce((a, p) => a + p.soc, 0) / r.length) : null;
  });
}

export type HeatCell =
  | { kind: "soc"; soc: number }
  | { kind: "future" } // later today
  | { kind: "missing" }; // no readings for that hour / day not loaded

export interface HeatRow {
  date: string;
  today: boolean;
  loaded: boolean;
  cells: HeatCell[];
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Last `days` days ending at `today`, newest first. */
export function socHeatmap(rows: FiveMinRow[], today: string, days = 14): HeatRow[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, -i);
    const P = readingsFor(rows, date);
    const isToday = date === today;
    const lastHour = P.length ? Math.floor(P[P.length - 1].t / 60) : -1;
    const cells: HeatCell[] = hourlySoc(P).map((soc, h) => {
      if (soc != null) return { kind: "soc", soc };
      if (isToday && h > lastHour) return { kind: "future" };
      return { kind: "missing" };
    });
    return { date, today: isToday, loaded: P.length > 0, cells };
  });
}

/** Heatmap fill: green mixed into the background by SOC %, with a 6 % floor so 0 % stays visible. */
export const socFill = (soc: number): string => `color-mix(in srgb, #3fa66a ${Math.max(6, soc)}%, var(--color-bg))`;
