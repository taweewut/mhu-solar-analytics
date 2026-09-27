// Invented days for the TV's states (docs/tv-design §3–§4): a sunny noon, the evening, the
// night, before sunrise, a low battery by night and by day, a rainy day, stale and offline
// data. Used by tvModel.test.ts, and by a demo build (VITE_TV_DEMO=1, #/momhome/tv?demo=<name>)
// to screenshot every state. A small energy balance makes the rows: the sun charges the
// battery, the battery carries the house down to its reserve, then the grid does.

import type { FeedKind } from "@/lib/status";
import type { DailyRow, FiveMinRow, WeatherRow } from "@/lib/types";

export interface Scenario {
  now: Date;
  fiveMin: FiveMinRow[];
  weather: WeatherRow[];
  daily: DailyRow[];
  feed?: FeedKind;
}

interface Day {
  date: string;
  /** Solar per clock hour, หน่วย (index = hour). */
  pv: Partial<Record<number, number>>;
  /** Hourly weather: [WMO code, rain mm]. */
  sky: Partial<Record<number, [number, number]>>;
}

const CAP = 16;
const pad = (n: number) => String(n).padStart(2, "0");
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Home load (W): quiet at night, busier by day, cooking and fans in the evening. */
const loadW = (m: number) => (m < 6 * 60 ? 400 : m < 17 * 60 ? 600 : m < 21 * 60 ? 1500 : 400);

/** 5-min rows from midnight of `days[0]` to `toMin` on the last day, the battery carried over. */
function synth(days: Day[], toMin: number, soc0: number, reserve = 14): FiveMinRow[] {
  const rows: FiveMinRow[] = [];
  let soc = soc0;
  days.forEach((d, di) => {
    const end = di === days.length - 1 ? toMin : 24 * 60;
    const tot = { pv: 0, chg: 0, dis: 0, imp: 0, load: 0 };
    for (let m = 0; m < end; m += 5) {
      const h = Math.floor(m / 60);
      const sun = (d.pv[h] ?? 0) * 1000;
      const load = loadW(m);
      let charge = 0;
      let dis = 0;
      let imp = 0;
      if (sun >= load) {
        charge = soc < 100 ? Math.min(sun - load, 6000) : 0;
      } else {
        dis = soc > reserve ? load - sun : 0;
        imp = load - sun - dis;
      }
      soc = Math.min(100, Math.max(reserve, soc + ((charge - dis) * 5) / 60 / 1000 / CAP * 100));
      const k = 5 / 60 / 1000;
      tot.pv += sun * k;
      tot.chg += charge * k;
      tot.dis += dis * k;
      tot.imp += imp * k;
      tot.load += load * k;
      rows.push({
        time: `${d.date} ${pad(h)}:${pad(m % 60)}:00`,
        working_state: "Normal",
        alarm_code: "",
        pv_w: Math.round(sun),
        mppt1_w: Math.round(sun * 0.55),
        mppt2_w: Math.round(sun * 0.45),
        mppt1_v: null,
        mppt2_v: null,
        battery_w: Math.round(charge - dis),
        grid_w: Math.round(sun > load ? sun - load - charge : -imp), // + export, − import
        grid_load_w: 0,
        backup_load_w: load,
        soc_pct: Math.round(soc),
        soh_pct: 99,
        temp_c: 40,
        gen_w: 0,
        smart_w: 0,
        ac_coupled_w: 0,
        today_yield_kwh: r1(tot.pv),
        today_to_battery_kwh: r1(tot.chg),
        today_from_battery_kwh: r1(tot.dis),
        today_from_grid_kwh: r1(tot.imp),
        today_grid_load_kwh: 0,
        today_backup_load_kwh: r1(tot.load),
        total_grid_load_kwh: 210,
        total_backup_load_kwh: 3400,
      });
    }
  });
  return rows;
}

function weatherRows(days: Day[]): WeatherRow[] {
  return days.flatMap((d) =>
    Array.from({ length: 24 }, (_, h) => {
      const [code, rain] = d.sky[h] ?? [1, 0];
      return { time: `${d.date} ${pad(h)}:00`, code, cloud_pct: code >= 3 ? 95 : code === 2 ? 45 : 15, rain_mm: rain, radiation_wm2: null };
    }),
  );
}

/** 30 days before 23/09/2026 — average ≈ 24 หน่วย, a good sunny day (90th percentile) 28. */
const PAST = [23.0, 28.2, 19.4, 23.8, 27.3, 19.0, 26.9, 26.4, 25.9, 27.2, 27.7, 27.4, 17.4, 24.6, 28.6,
  23.2, 25.8, 23.4, 13.9, 20.4, 26.8, 27.4, 27.9, 28.6, 22.2, 22.7, 23.4, 20.4, 28.2, 21.1];
const DAILY: DailyRow[] = PAST.map((y, n) => {
  const t = new Date(Date.UTC(2026, 7, 24 + n));
  return {
    date: t.toISOString().slice(0, 10), yield_kwh: y, to_grid_kwh: 0, from_grid_kwh: 0, to_battery_kwh: null,
    from_battery_kwh: null, load_kwh: null, generation_kwh: null, gen_kwh: null, smart_load_kwh: null, ac_coupled_kwh: null,
  };
});

/** Wednesday 23/09: sun all morning, cloud from 11:00, rain 14:00–17:00, sun again at 17:00. */
const WED: Day = {
  date: "2026-09-23",
  pv: { 6: 0.2, 7: 1.2, 8: 2.5, 9: 3.7, 10: 4.8, 11: 5.4, 12: 3.1, 13: 2.4, 14: 1.1, 15: 0.9, 16: 1.8, 17: 1.3, 18: 0.3 },
  sky: { 6: [0, 0], 7: [0, 0], 8: [2, 0], 9: [2, 0], 10: [2, 0], 11: [3, 0], 12: [3, 0], 13: [3, 0], 14: [61, 1.7], 15: [61, 1.8], 16: [61, 2.0], 17: [1, 0], 18: [1, 0] },
};
/** Tuesday 22/09, a sunny day before: sunrise / sunset and last night's use come from it. */
const TUE: Day = { ...WED, date: "2026-09-22", sky: {} };
/** The same morning while it's still bright at 12:20 (the hour in progress runs at 5.7 kW). */
const WED_NOON: Day = { ...WED, pv: { ...WED.pv, 12: 5.7 } };
/** A wet Wednesday: little sun, and a heavy evening drains the battery overnight. */
const WED_WET: Day = {
  date: "2026-09-23",
  pv: { 6: 0.1, 7: 0.5, 8: 1.0, 9: 1.3, 10: 1.6, 11: 1.9, 12: 1.2, 13: 0.6, 14: 0.7, 15: 0.4, 16: 0.8, 17: 0.3, 18: 0.1 },
  sky: { 6: [3, 0], 7: [3, 0], 8: [61, 1.2], 9: [61, 2.0], 10: [3, 0], 11: [3, 0], 12: [61, 1.1], 13: [63, 3.2], 14: [61, 1.4], 15: [3, 0], 16: [3, 0], 17: [3, 0], 18: [3, 0] },
};
/** Thursday 24/09: rain until 09:00, sun from the early afternoon. */
const THU: Day = {
  date: "2026-09-24",
  pv: { 6: 0.1, 7: 0.4, 8: 1.0, 9: 1.8, 10: 3.2, 11: 4.5, 12: 5.2, 13: 5.0, 14: 4.1, 15: 3.0, 16: 1.9, 17: 0.9, 18: 0.2 },
  sky: { 6: [61, 0.8], 7: [61, 1.6], 8: [61, 1.1], 9: [3, 0], 10: [3, 0], 11: [2, 0], 12: [1, 0], 13: [0, 0], 14: [0, 0], 15: [1, 0], 16: [1, 0], 17: [1, 0], 18: [1, 0] },
};
/** Friday 25/09: cloud and rain all day. */
const FRI: Day = {
  date: "2026-09-25",
  pv: { 6: 0.1, 7: 0.6, 8: 1.1, 9: 1.4, 10: 1.9, 11: 2.6, 12: 1.2, 13: 0.5, 14: 0.7, 15: 0.4, 16: 0.5, 17: 0.3, 18: 0.1 },
  sky: { 6: [3, 0], 7: [3, 0], 8: [61, 2.1], 9: [61, 3.4], 10: [3, 0], 11: [2, 0], 12: [61, 1.2], 13: [95, 6.5], 14: [63, 4.0], 15: [61, 2.2], 16: [61, 1.5], 17: [3, 0], 18: [3, 0] },
};

const local = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00`);
const upTo = (rows: FiveMinRow[], time: string) => rows.filter((r) => r.time <= time);

export const SCENARIOS = {
  /** 12:20, battery full since the morning, rain forecast 14:00–17:00 (the sample day). */
  noon: (): Scenario => ({ now: local("2026-09-23", "12:20"), fiveMin: synth([TUE, WED_NOON], 12 * 60 + 20, 62), weather: weatherRows([TUE, WED]), daily: DAILY }),
  /** 19:05 after sunset, the battery carrying the house. */
  evening: (): Scenario => ({ now: local("2026-09-23", "19:05"), fiveMin: synth([TUE, WED], 19 * 60 + 5, 62), weather: weatherRows([TUE, WED]), daily: DAILY }),
  /** 23:40, running on the battery. */
  night: (): Scenario => ({ now: local("2026-09-23", "23:40"), fiveMin: synth([TUE, WED], 23 * 60 + 40, 62), weather: weatherRows([TUE, WED]), daily: DAILY }),
  /** 05:40, before sunrise, no solar yet today. */
  dawn: (): Scenario => ({ now: local("2026-09-24", "05:40"), fiveMin: synth([TUE, WED, THU], 5 * 60 + 40, 62), weather: weatherRows([TUE, WED, THU]), daily: DAILY }),
  /** 03:10 after a wet day: the battery at its reserve, the house on the grid. */
  lowNight: (): Scenario => ({ now: local("2026-09-24", "03:10"), fiveMin: synth([WED_WET, THU], 3 * 60 + 10, 30), weather: weatherRows([WED_WET, THU]), daily: DAILY }),
  /** 07:30 on a rainy morning after that night: still low, sun later. */
  lowDay: (): Scenario => ({ now: local("2026-09-24", "07:30"), fiveMin: synth([WED_WET, THU], 7 * 60 + 30, 30), weather: weatherRows([WED_WET, THU]), daily: DAILY }),
  /** 14:30 on a rainy day, charging slowly. */
  rainy: (): Scenario => ({ now: local("2026-09-25", "14:30"), fiveMin: synth([FRI], 14 * 60 + 30, 60), weather: weatherRows([FRI]), daily: DAILY }),
  /** 15:10, the same rainy day. */
  rainyLate: (): Scenario => ({ now: local("2026-09-25", "15:10"), fiveMin: synth([FRI], 15 * 60 + 10, 60), weather: weatherRows([FRI]), daily: DAILY }),
  /** 12:20, but the last reading is from 09:15. */
  stale: (): Scenario => ({ now: local("2026-09-23", "12:20"), fiveMin: upTo(synth([TUE, WED_NOON], 12 * 60 + 20, 62), "2026-09-23 09:15:00"), weather: weatherRows([WED]), daily: DAILY }),
  /** 23:40, the inverter stopped sending at 21:05. */
  offline: (): Scenario => {
    const rows = upTo(synth([TUE, WED], 23 * 60 + 40, 62), "2026-09-23 21:05:00");
    rows[rows.length - 1] = { ...rows[rows.length - 1], working_state: "Offline" };
    return { now: local("2026-09-23", "23:40"), fiveMin: rows, weather: weatherRows([WED]), daily: DAILY, feed: "offline" };
  },
};

export type ScenarioName = keyof typeof SCENARIOS;
