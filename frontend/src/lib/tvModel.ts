// TV mode's numbers and sentences (docs/tv-design), worked out from the data with no React, so
// the choice of every sentence is tested (tvModel.test.ts). pages/Tv.tsx only lays it out.

import { daylight } from "@/lib/battery";
import { dayTotals, integrateKwh, readingsFor, type Reading } from "@/lib/energy";
import { estimatesPv } from "@/lib/estimate";
import { hm, minuteOfDay } from "@/lib/format";
import type { FeedKind } from "@/lib/status";
import type { SavingsModel } from "@/lib/tariff";
import {
  ALERT, BATTERY_SUB, BATTERY_WORD, CARD, KW, MONTH_TH, SAVE, SAY, STRIP, thaiDate, thaiDayMonth, thaiMonthYear,
} from "@/lib/tvCopy";
import { batteryFill, batteryWord, tvPeriod, type TvPeriod, type TvTheme } from "@/lib/tvTheme";
import type { DailyRow, FiveMinRow, WeatherRow } from "@/lib/types";
import { rainSpells, weatherDay, type Sky, type WeatherHour } from "@/lib/weather";

/**
 * The newest reading is normally up to ~25 min old: the poller fetches every 15 min and
 * SolisCloud posts each 5-min reading a few minutes late. The design's "15 min without a
 * reading" is counted on top of that, so the band doesn't flash on and off between polls.
 */
export const TV_STALE_MIN = 45;

/** Seconds each screen holds (review §1). */
export const HOLD = { now: 60, sun: 45, save: 30 } as const;
export type TvScreen = keyof typeof HOLD;

/** Hours on the hour strip: 06–18. */
export const STRIP_HOURS = Array.from({ length: 13 }, (_, i) => i + 6);
/** Hourly solar that fills a bar (หน่วย). */
export const BAR_MAX = 6;

export type Icon = "sun" | "suncloud" | "cloud" | "rain" | "storm" | "moon" | "panel" | "house" | "pole" | "coin" | "alert";

/** Text with numbers set apart (the view sets `{ b }` in Archivo). */
export type Seg = string | { b: string };
export type Line = Seg[];

export interface StripHour {
  h: number;
  icon: Icon | null;
  /** Forecast hour: icon and rain faded. */
  forecast: boolean;
  /** Rain in mm, only on wet hours. */
  rain: string | null;
  /** Solar made that hour (หน่วย), null for hours not reached yet. */
  kwh: number | null;
  /** Bar height, % of BAR_MAX. */
  pct: number;
  /** The hour in progress (striped bar). */
  part: boolean;
  /** Number printed on the bar: peak and current hour only. */
  label: string | null;
  /** Battery % at the end of the hour. */
  soc: number | null;
}

export interface SaveRow {
  icon: Icon;
  lead: string;
  b: string;
  tail: string;
  note: string;
}

export interface TvModel {
  period: TvPeriod;
  /** "12:20" */
  clock: string;
  /** "วันพุธที่ 23 กันยายน 2569" */
  date: string;
  alert: { kind: "stale" | "offline"; head: string; note: string } | null;
  battery: {
    soc: number | null;
    word: string;
    sub: string;
    charging: boolean;
    low: boolean;
    fill: { y: number; height: number };
  };
  now: {
    solar: { value: string; sub: Line };
    grid: { value: string; sub: Line };
    weather: { icon: Icon; head: string; note: string };
  };
  strip: { hours: StripHour[]; lines: [Line, Line] };
  save: { total: string; rows: SaveRow[]; basis: string } | null;
  night: { icon: Icon; date: string; head: string; note: string };
  /** Screens in rotation order (the night period shows only the night screen). */
  screens: TvScreen[];
}

export interface TvInput {
  fiveMin: FiveMinRow[];
  daily: DailyRow[];
  weather: WeatherRow[];
  savings: SavingsModel | null;
  /** Battery capacity (kWh) for the "lasts till morning" estimate. */
  capacityKwh: number;
  kwp: number;
  now: Date;
  theme?: TvTheme;
  /** The header feed state (lib/status); paused and offline also raise the band. */
  feed?: FeedKind | null;
  showSavings?: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Local calendar date of a Date: "2026-09-23". */
export const isoDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso: string, n: number): string => {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const at = (s: string) => new Date(s.replace(" ", "T"));

const kw = (w: number) => (Math.abs(w) / 1000).toFixed(1);
const one = (v: number) => v.toFixed(1);
/** Today's หน่วย: "0" when nothing, else one decimal. */
const units = (v: number) => (v < 0.05 ? "0" : one(v));
const baht = (v: number) => Math.round(v).toLocaleString("en-US");
const WET: Sky[] = ["drizzle", "rain", "storm"];

export function skyIcon(sky: Sky): Icon {
  if (sky === "clear" || sky === "mostly") return "sun";
  if (sky === "partly") return "suncloud";
  if (sky === "cloudy" || sky === "fog") return "cloud";
  if (sky === "storm") return "storm";
  return "rain";
}

/** p-th percentile (nearest rank). */
const percentile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(p * s.length) - 1)];
};

/** A good sunny day (90th percentile of the last 30 measured days before `date`), หน่วย. */
export function sunnyDayKwh(daily: DailyRow[], date: string): number | null {
  const from = addDays(date, -30);
  const days = daily.filter((d) => d.date >= from && d.date < date && d.yield_kwh != null && !estimatesPv(d));
  return days.length >= 7 ? percentile(days.map((d) => d.yield_kwh!), 0.9) : null;
}

/** Share of a clear day's solar made by minute `m` (a sine-shaped day from rise to set). */
export const dayShare = (m: number, rise: number, set: number): number =>
  m <= rise ? 0 : m >= set ? 1 : (1 - Math.cos((Math.PI * (m - rise)) / (set - rise))) / 2;

/** Clear-sky power at minute `m` as a share of kWp (a sine arch, peak 0.75 × kWp). */
const clearSkyW = (m: number, rise: number, set: number, kwp: number): number =>
  m <= rise || m >= set ? 0 : 750 * kwp * Math.sin((Math.PI * (m - rise)) / (set - rise));

/** Solar per clock hour (หน่วย) and the battery % at the end of each hour. */
function hourly(P: Reading[]): { kwh: (number | null)[]; soc: (number | null)[] } {
  const kwh: (number | null)[] = Array(24).fill(null);
  const soc: (number | null)[] = Array(24).fill(null);
  for (let h = 0; h < 24; h++) {
    const r = P.filter((p) => Math.floor(p.t / 60) === h);
    if (!r.length) continue;
    kwh[h] = integrateKwh(r, (p) => p.pv);
    soc[h] = r[r.length - 1].soc;
  }
  return { kwh, soc };
}

/**
 * Mean home load (kW) over the same stretch 24 h earlier — from this time yesterday until
 * yesterday's equivalent of the coming sunrise — or null when under 80 % of it has readings.
 */
export function nightLoadKw(rows: FiveMinRow[], now: Date, hours: number): number | null {
  if (hours <= 0) return null;
  const from = now.getTime() - 24 * 3_600_000;
  const to = from + hours * 3_600_000;
  const P = rows
    .filter((r) => {
      const t = at(r.time).getTime();
      return t >= from && t < to;
    })
    .map((r) => (r.grid_load_w ?? 0) + (r.backup_load_w ?? 0));
  if (P.length < 0.8 * hours * 12) return null;
  return P.reduce((a, w) => a + w, 0) / P.length / 1000;
}

export function tvModel(i: TvInput): TvModel {
  const now = i.now;
  const today = isoDate(now);
  const minute = now.getHours() * 60 + now.getMinutes();
  const nowHour = now.getHours();

  const lastRow = i.fiveMin.length ? i.fiveMin[i.fiveMin.length - 1] : null;
  const dataDate = lastRow ? lastRow.time.slice(0, 10) : today;
  const P = readingsFor(i.fiveMin, dataDate);
  const last = P.length ? P[P.length - 1] : null;
  const totals = dayTotals(i.fiveMin, dataDate);
  const importW = lastRow ? Math.max(0, -(lastRow.grid_w ?? 0)) : 0;
  const importing = importW > 50;
  const lastT = lastRow ? hm(minuteOfDay(lastRow.time)) : "—";

  // Sunrise / sunset from the panels' own first and last output (the median of recent days);
  // before there's a finished day, today's first output and 18:00.
  const dl = daylight(i.fiveMin, today, 14);
  const firstLit = readingsFor(i.fiveMin, today).find((p) => p.pv > 50);
  const rise = dl?.rise ?? firstLit?.t ?? 360;
  const set = dl?.set ?? 1080;
  const period = tvPeriod(i.theme ?? "auto", minute, rise, set);

  // Data state: the band for a stale feed, with the offline wording when the inverter says so.
  const ageMin = lastRow ? (now.getTime() - at(lastRow.time).getTime()) / 60_000 : Infinity;
  const offline = i.feed === "offline" || (lastRow != null && /offline/i.test(lastRow.working_state));
  // The feed's own "stale" (> 26 h) is covered by the age check, which also follows a frozen clock.
  const stale = offline || i.feed === "paused" || ageMin > TV_STALE_MIN;
  const since = lastRow && dataDate !== today ? `${thaiDayMonth(dataDate)} ${lastT}` : lastT;
  const alert = stale
    ? offline
      ? { kind: "offline" as const, head: ALERT.offline(since), note: ALERT.offlineNote(since) }
      : { kind: "stale" as const, head: ALERT.stale(since), note: ALERT.staleNote(since) }
    : null;

  // Battery.
  const soc = last ? last.soc : null;
  const bat = last?.bat ?? 0;
  const charging = bat > 50;
  const slow = charging && bat < 1000;
  const full = soc != null && soc >= 97;
  const low = soc != null && soc < 20;
  const fullRow = P.find((p) => p.soc >= 100);
  const fullAt = fullRow ? hm(fullRow.t) : null;

  // "Lasts till morning": level × capacity ÷ the home's load, against the hours to sunrise.
  // The load is last night's over the same hours when there's a full record of it (so the
  // evening's cooking peak doesn't read as the whole night), else the load right now.
  const toSunrise = (((rise - minute) % 1440) + 1440) % 1440 / 60;
  const loadKw = nightLoadKw(i.fiveMin, now, toSunrise) ?? (last?.load ?? 0) / 1000;
  const hoursLeft = soc != null && loadKw > 0.05 ? ((soc / 100) * i.capacityKwh) / loadKw : Infinity;
  const enough = soc != null && !low && hoursLeft > toSunrise + 2;
  const dawn = period === "night" && minute < rise && rise - minute <= 90;

  let batSub: string;
  if (stale) batSub = BATTERY_SUB.asOf(since);
  else if (dawn && enough) batSub = BATTERY_SUB.lastsTillMorning;
  else if (full && fullAt && bat > -50) batSub = BATTERY_SUB.fullSince(fullAt);
  else if (charging) batSub = slow ? BATTERY_SUB.chargingSlow(kw(bat)) : BATTERY_SUB.charging;
  else if (importing) batSub = period === "day" ? BATTERY_SUB.fromGrid : BATTERY_SUB.buying(kw(importW));
  else if (bat < -50) batSub = BATTERY_SUB.supplying(kw(bat));
  else batSub = BATTERY_SUB.resting;

  const battery = {
    soc,
    word: soc == null ? "—" : BATTERY_WORD[batteryWord(soc)],
    sub: batSub,
    charging,
    low,
    fill: batteryFill(soc ?? 0),
  };

  // Weather today (the rest of the day is Open-Meteo's forecast).
  const wx: WeatherHour[] = weatherDay(i.weather, today);
  const setHour = Math.ceil(set / 60);
  const hourNow = wx[nowHour];
  const skyNow = hourNow?.cond?.sky ?? null;
  const wetNow = (skyNow != null && WET.includes(skyNow)) || (hourNow?.row?.rain_mm ?? 0) >= 0.5;
  const later = rainSpells(wx).filter((s) => s.from > nowHour && s.from < setHour);
  const rainLater = !wetNow && later.length ? later[0] : null;
  const sunLater = wx.find((x) => x.h > nowHour && x.h < setHour && x.cond && ["clear", "mostly", "partly"].includes(x.cond.sky));

  // Today against a good sunny day, scaled to how much of the day has gone.
  const pv = totals?.pv ?? 0;
  const sunny = sunnyDayKwh(i.daily, dataDate);
  const share = dayShare(Math.min(minute, set), rise, set);
  const below = sunny != null && share >= 0.25 && pv < 0.6 * sunny * share;
  const lowForHour = last != null && last.pv < 0.6 * clearSkyW(last.t, rise, set, i.kwp);

  // Screen 1: the two cards.
  const solarSub: Line = stale
    ? last && last.pv > 50
      ? [`${CARD.producingAt(since)} `, { b: kw(last.pv) }, ` ${KW}`]
      : [`${CARD.at(since)} ${importing ? CARD.houseOnGrid : CARD.houseOnBattery}`]
    : period !== "day"
      ? [`${CARD.sunDone} · ${importing ? CARD.houseOnGrid : CARD.houseOnBattery}`]
      : last && last.pv > 50
        ? [`${CARD.producingNow} `, { b: kw(last.pv) }, ` ${KW}${charging ? ` · ${slow ? CARD.sunChargingSlow : CARD.sunCharging}` : ""}`]
        : [CARD.notProducing];
  const gridToday = totals?.gridImport ?? 0;
  const gridSub: Line = stale
    ? importing
      ? [`${CARD.buyingAt(since)} `, { b: kw(importW) }, ` ${KW}`]
      : [CARD.notBuyingAt(since)]
    : importing
      ? [`${CARD.buyingNow} `, { b: kw(importW) }, ` ${KW}`]
      : [`${CARD.notBuying}${gridToday < 0.05 ? ` · ${period === "day" ? CARD.noImportYet : CARD.allFromSun}` : ""}`];

  // Screen 1: the weather band — what the weather means for the panels and the battery.
  const pvRound = Math.round(pv);
  const sunnyRound = sunny != null ? Math.round(sunny) : null;
  const dayBelow = sunnyRound != null ? SAY.dayBelow(pvRound, sunnyRound) : SAY.cloudy;
  const batteryNote = full
    ? fullAt ? `${SAY.full} · ${SAY.fullSince(fullAt)}` : SAY.full
    : charging
      ? skyNow === "clear" || skyNow === "mostly" ? SAY.sunCharging : SAY.chargingSlower
      : "";
  let weather: TvModel["now"]["weather"];
  if (period !== "day") {
    const fullPart = fullAt ? (fullRow!.t < 12 * 60 ? SAY.fullSinceMorning : SAY.fullSinceAfternoon) : "";
    weather = {
      icon: "moon",
      head: below || (sunny != null && pv < 0.6 * sunny) ? dayBelow : SAY.dayGood(pvRound),
      note: low ? SAY.nightLow : [fullPart, enough ? SAY.tonightEnough : SAY.tonightShort].filter(Boolean).join(" "),
    };
  } else {
    const cloudy = skyNow === "cloudy" || skyNow === "fog" || (skyNow == null && lowForHour);
    const icon: Icon = wetNow || rainLater ? (skyNow === "storm" ? "storm" : "rain") : skyNow ? skyIcon(skyNow) : lowForHour ? "cloud" : "sun";
    const head = wetNow
      ? SAY.rainingNow(minute / 60, charging && !full)
      : rainLater
        ? SAY.rainLater(rainLater.from, rainLater.to)
        : cloudy && lowForHour
          ? SAY.cloudy
          : skyNow === "partly" || skyNow === "cloudy" || skyNow === "fog"
            ? SAY.partly
            : SAY.sunny;
    let note: string;
    if (low && !charging) note = [SAY.lowDay, sunLater ? SAY.sunLaterCharges(sunLater.h) : ""].filter(Boolean).join(" · ");
    else if (wetNow) note = below ? [dayBelow, soc != null && soc >= 60 ? SAY.lastsTonight : ""].filter(Boolean).join(" · ") : batteryNote;
    else if (rainLater) note = full ? SAY.rainLaterFull : SAY.rainLaterNotFull;
    else if (cloudy && lowForHour) note = charging && !full ? SAY.chargingSlower : below ? dayBelow : batteryNote;
    else note = batteryNote || (below ? dayBelow : "");
    weather = { icon, head, note };
  }

  // Screen 2: the hour strip.
  const { kwh, soc: socH } = hourly(P);
  const inDay = period === "day" && dataDate === today;
  const peakH = STRIP_HOURS.reduce<number | null>((a, h) => ((kwh[h] ?? 0) > 0 && (a == null || kwh[h]! > kwh[a]!) ? h : a), null);
  const hours: StripHour[] = STRIP_HOURS.map((h) => {
    const x = wx[h];
    const forecast = inDay && h > nowHour;
    const part = inDay && h === nowHour && kwh[h] != null;
    const v = kwh[h];
    const mm = x?.row?.rain_mm ?? 0;
    return {
      h,
      icon: x?.cond ? skyIcon(x.cond.sky) : null,
      forecast,
      // Whole mm from 10 up: "26.5" is too wide for an hour column at 36 px.
      rain: mm >= 9.95 ? String(Math.round(mm)) : mm >= 0.1 ? one(mm) : null,
      kwh: forecast ? null : v,
      pct: forecast || v == null ? 0 : Math.round(Math.min(1, v / BAR_MAX) * 100),
      part,
      label: !forecast && v != null && (h === peakH || part) ? one(v) : null,
      soc: forecast ? null : socH[h],
    };
  });
  const load = totals?.load ?? 0;
  const line1: Line = [
    `${period === "day" ? STRIP.made : STRIP.madeDone} `,
    { b: one(pv) },
    ` หน่วย`,
    ...(sunnyRound != null ? [` · ${STRIP.sunnyDay} `, { b: String(sunnyRound) }] : []),
    ` · ${STRIP.homeUsed} `,
    { b: one(load) },
  ];
  const wetHours = wx.filter((x) => x.h * 60 + 30 >= rise && x.h <= Math.min(nowHour, setHour) && x.cond && WET.includes(x.cond.sky)).length;
  const batPart: Line = fullAt
    ? [`${period === "day" ? STRIP.fullAt : STRIP.fullSince} `, { b: fullAt }, " น."]
    : slow
      ? [STRIP.chargingSlow]
      : [];
  const wxPart =
    period !== "day"
      ? importing ? STRIP.sunDoneGrid : STRIP.sunDone
      : wetHours >= 3
        ? STRIP.rainyDay
        : wetNow
          ? STRIP.rainNow
          : rainLater
            ? STRIP.rainLater(rainLater.from)
            : below
              ? STRIP.cloudyDay
              : skyNow === "partly" || skyNow === "cloudy" || skyNow === "fog"
                ? STRIP.partlyLine
                : STRIP.sunnyDayLine;
  const line2: Line = batPart.length ? [...batPart, ` · ${wxPart}`] : [wxPart];

  // Screen 3: savings from the utility bills.
  const s = i.savings;
  let save: TvModel["save"] = null;
  if (s && s.post.length && i.showSavings !== false) {
    const first = s.post[0];
    const latest = s.post[s.post.length - 1];
    const rows: SaveRow[] = [];
    if (s.current) rows.push({ icon: "house", lead: SAVE.month, b: baht(s.current.saved), tail: " บาท", note: SAVE.monthNote });
    else rows.push({ icon: "house", lead: SAVE.lastBill(MONTH_TH[latest.month - 1]), b: baht(latest.saved), tail: " บาท", note: SAVE.lastBillNote });
    const pct = s.reduction != null ? Math.round(s.reduction * 100) : null;
    if (pct != null && pct > 0 && s.baseline)
      rows.push({ icon: "pole", lead: SAVE.reduced, b: `${pct}%`, tail: ` ${SAVE.reducedTail}`, note: SAVE.reducedFromTo(baht(s.baseline.amount), baht(latest.amount)) });
    const span =
      first.year === latest.year
        ? `${MONTH_TH[first.month - 1]}–${thaiMonthYear(latest.year, latest.month)}`
        : `${thaiMonthYear(first.year, first.month)}–${thaiMonthYear(latest.year, latest.month)}`;
    save = { total: baht(s.cumTotal), rows, basis: SAVE.basis(s.post.length, s.post.length > 1 ? span : thaiMonthYear(latest.year, latest.month)) };
  }

  // Night screen (21:30 → sunrise).
  const yesterday = addDays(today, -1);
  const yPv = dayTotals(i.fiveMin, yesterday)?.pv ?? i.daily.find((d) => d.date === yesterday)?.yield_kwh ?? null;
  const riseText = hm(Math.round(rise / 10) * 10);
  const nightLow = low || importing;
  const night = {
    icon: (nightLow && !stale ? "pole" : "moon") as Icon,
    date: dawn ? thaiDate(today, "เช้า") : thaiDate(minute < 12 * 60 ? yesterday : today, "คืน"),
    head: nightLow ? SAY.nightLow : dawn ? SAY.dawn : SAY.nightOnBattery,
    note: stale
      ? SAY.lastReading(since)
      : nightLow
        ? SAY.nightLowCalm
        : dawn
          ? [SAY.dawnSun(riseText), yPv != null ? SAY.yesterday(Math.round(yPv)) : ""].filter(Boolean).join(" · ")
          : enough
            ? SAY.nightEnough
            : SAY.nightShort,
  };

  const screens: TvScreen[] = period === "night" ? [] : save ? ["now", "sun", "save"] : ["now", "sun"];
  return {
    period,
    clock: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    date: thaiDate(today),
    alert,
    battery,
    now: { solar: { value: one(pv), sub: solarSub }, grid: { value: units(gridToday), sub: gridSub }, weather },
    strip: { hours, lines: [line1, line2] },
    save,
    night,
    screens,
  };
}
