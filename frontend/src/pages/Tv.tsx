import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHome } from "@/lib/home";
import type { Model } from "@/lib/model";
import type { FeedKind } from "@/lib/status";
import type { Scenario } from "@/lib/tvFixtures";
import { BATTERY_SUB, CARD, CLOCK_SUFFIX, DEFAULT_HOME_NAME, SAVE, STRIP, UNIT } from "@/lib/tvCopy";
import { HOLD, tvModel, type Line, type TvModel, type TvScreen } from "@/lib/tvModel";
import { paletteClass, type TvTheme } from "@/lib/tvTheme";
import type { DailyRow, FiveMinRow, WeatherRow } from "@/lib/types";
import { HeroBattery, Ic, Sprite } from "@/tv/Sprite";
import "@/tv/tv.css";

// TV mode (#/<home>/tv): a Thai-only living-room view for two viewers over 80, on an LG webOS
// TV (Chrome 79) — design in docs/tv-design. By day three screens cross-fade (ตอนนี้ 60 s ·
// แดดวันนี้ 45 s · ประหยัดค่าไฟ 30 s), in the dark palette from sunset to 21:30; from 21:30 to
// sunrise one dimmed night screen stays. The battery column never moves. ◀ ▶ on the remote step
// the screens; nothing else takes input. Every number and sentence comes from lib/tvModel.
//
//   ?s=600          hold every screen 600 s (default: the design's 60 · 45 · 30)
//   ?theme=light    force the day rotation (dark = evening, night = the night screen)
//   ?at=12:20       freeze the clock (HH:MM on the data's last day, or YYYY-MM-DDTHH:MM)
//   ?savings=0      leave the savings screen out
//   ?demo=rainy     an invented state (lib/tvFixtures), only in a VITE_TV_DEMO=1 build

const DEMO = import.meta.env.VITE_TV_DEMO === "1";

/** "12:20" → that time on `day`; "2026-09-23T12:20" as given; else null. */
function parseAt(at: string | null, day: string): Date | null {
  if (!at) return null;
  const s = /^\d\d:\d\d$/.test(at) ? `${day}T${at}` : at;
  const d = new Date(s.length === 16 ? `${s}:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The time, ticking on the minute (or frozen by ?at=). */
function useClock(frozen: Date | null): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (frozen) return;
    let t = 0;
    const tick = () => {
      const d = new Date();
      setNow(d);
      t = window.setTimeout(tick, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50);
    };
    tick();
    return () => window.clearTimeout(t);
  }, [frozen]);
  return frozen ?? now;
}

export interface TvProps {
  fiveMin: FiveMinRow[];
  daily: DailyRow[];
  weather: WeatherRow[];
  model: Model;
  feed: FeedKind | null;
  /** Seconds per screen for every screen (?s=); the design's holds when absent. */
  seconds?: number;
  theme?: TvTheme;
  at?: string | null;
  showSavings?: boolean;
  demo?: string | null;
}

export function Tv(props: TvProps) {
  const { home } = useHome();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  useEffect(() => {
    if (!DEMO || !props.demo) return;
    import("@/lib/tvFixtures").then(({ SCENARIOS }) => {
      const make = SCENARIOS[props.demo as keyof typeof SCENARIOS];
      if (make) setScenario(make());
    });
  }, [props.demo]);

  const fiveMin = scenario?.fiveMin ?? props.fiveMin;
  const lastDay = fiveMin.length ? fiveMin[fiveMin.length - 1].time.slice(0, 10) : props.model.asOf;
  const frozen = useMemo(() => scenario?.now ?? parseAt(props.at ?? null, lastDay), [scenario, props.at, lastDay]);
  const now = useClock(frozen);

  const m = useMemo(
    () =>
      tvModel({
        fiveMin,
        daily: scenario?.daily ?? props.daily,
        weather: scenario?.weather ?? props.weather,
        savings: props.model.savings,
        capacityKwh: home.battery?.kwh ?? 0,
        kwp: home.kwp,
        now,
        theme: props.theme,
        feed: scenario ? scenario.feed ?? null : props.feed,
        showSavings: props.showSavings,
      }),
    // `now` changes once a minute; the data every few minutes.
    [fiveMin, scenario, props.daily, props.weather, props.model.savings, props.theme, props.feed, props.showSavings, home, now],
  );

  // Rotation: two stacked frames; the next screen goes into the hidden one, then they swap.
  const [rot, setRot] = useState<{ slots: [TvScreen, TvScreen]; on: 0 | 1 }>({ slots: ["now", "now"], on: 0 });
  const screens = m.screens;
  // The model is rebuilt every minute (the clock) and on each data refresh, with a new `screens`
  // array each time. `step` reads it through a ref so it stays the same function: when it
  // changed, the hold timer below restarted every minute, and the 60 s ตอนนี้ hold raced the
  // minute tick and never moved on (seen on iPad Safari). The 6-hour reload was reset too.
  const screensRef = useRef(screens);
  screensRef.current = screens;
  const step = useCallback(
    (dir: 1 | -1) =>
      setRot((r) => {
        const list = screensRef.current;
        if (!list.length) return r;
        const i = list.indexOf(r.slots[r.on]);
        const next = list[(((i < 0 ? -dir : i) + dir) % list.length + list.length) % list.length];
        const off = r.on === 0 ? 1 : 0;
        const slots: [TvScreen, TvScreen] = [...r.slots] as [TvScreen, TvScreen];
        slots[off] = next;
        return { slots, on: off };
      }),
    [],
  );
  const current = rot.slots[rot.on];
  useEffect(() => {
    if (screens.length < 2) return;
    const t = window.setTimeout(() => step(1), (props.seconds || HOLD[current]) * 1000);
    return () => window.clearTimeout(t);
  }, [rot, screens.length, current, props.seconds, step]);

  // ◀ ▶ on the remote; reload every 6 h to pick up new builds.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.keyCode === 39) step(1);
      if (e.key === "ArrowLeft" || e.keyCode === 37) step(-1);
    };
    window.addEventListener("keydown", key);
    const r = window.setTimeout(() => window.location.reload(), 6 * 3600_000);
    return () => {
      window.removeEventListener("keydown", key);
      window.clearTimeout(r);
    };
  }, [step]);

  // A screen that dropped out of the rotation (e.g. savings turned off) falls back to the first.
  const shown = (s: TvScreen) => (screens.includes(s) ? s : screens[0] ?? "now");
  const name = home.nameTh ?? DEFAULT_HOME_NAME;
  const cls = ["tv", paletteClass(m.period), m.alert ? "stale" : ""].filter(Boolean).join(" ");

  return (
    <div className={cls} lang="th">
      <Sprite />
      <div className={m.period === "night" ? "tv-safe night" : "tv-safe"}>
        {m.alert && (
          <div className="tv-alert">
            <Ic name="alert" />
            <div>
              <div className="tv-alert-h">{m.alert.head}</div>
              <div className="tv-alert-p">{m.alert.note}</div>
            </div>
          </div>
        )}
        {m.period === "night" ? (
          <>
            {m.alert && <div />}
            <div className="tv-body night">
              <div className="tv-nightL">
                <Ic name={m.night.icon} />
                <Clock time={m.clock} />
                <div className="tv-date">{m.night.date}</div>
                <div className="tv-night-h">{m.night.head}</div>
                <div className="tv-night-p">{m.night.note}</div>
              </div>
              <div className="tv-vrule" />
              <Battery m={m} />
            </div>
          </>
        ) : (
          <>
            <div className="tv-head">
              <div>
                <div className="tv-home">{name}</div>
                <div className="tv-date">{m.date}</div>
              </div>
              <Clock time={m.clock} />
            </div>
            <div className="tv-body">
              <div className="tv-stack">
                {rot.slots.map((s, n) => (
                  <div key={n} className={n === rot.on ? "tv-frame on" : "tv-frame"} aria-hidden={n !== rot.on}>
                    <Screen screen={shown(s)} m={m} />
                  </div>
                ))}
              </div>
              <div className="tv-vrule" />
              <Battery m={m} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Clock({ time }: { time: string }) {
  return (
    <div className="tv-clock">
      {time}
      <small>{CLOCK_SUFFIX}</small>
    </div>
  );
}

/** Text with its numbers in Archivo. */
function Rich({ line }: { line: Line }) {
  return (
    <>
      {line.map((s, n) => (typeof s === "string" ? <span key={n}>{s}</span> : <b key={n}>{s.b}</b>))}
    </>
  );
}

function Battery({ m }: { m: TvModel }) {
  const b = m.battery;
  return (
    <div className="tv-bat">
      <HeroBattery fill={b.fill} low={b.low} charging={b.charging} />
      <div className="tv-bat-num">
        {b.soc ?? "—"}
        <small>%</small>
      </div>
      {/* "แบตเหลือปานกลาง" is wider than the 520 px column at 60 px */}
      <div className={b.word.length > 12 ? "tv-bat-word long" : "tv-bat-word"}>{b.word}</div>
      <div className="tv-bat-sub">{b.sub || BATTERY_SUB.resting}</div>
    </div>
  );
}

function Screen({ screen, m }: { screen: TvScreen; m: TvModel }) {
  if (screen === "sun") return <SunScreen m={m} />;
  if (screen === "save" && m.save) return <SaveScreen save={m.save} />;
  return <NowScreen m={m} />;
}

/** Screen 1 · ตอนนี้: solar today, bought today, and what the weather means. */
function NowScreen({ m }: { m: TvModel }) {
  const { solar, grid, weather } = m.now;
  return (
    <div className="tv-left">
      <div className="tv-cards">
        <Card icon="panel" label={CARD.solarLabel} value={solar.value} sub={solar.sub} />
        <Card icon="pole" label={CARD.gridLabel} value={grid.value} sub={grid.sub} />
      </div>
      <div />
      <div className="tv-weather">
        <Ic name={weather.icon} />
        <div>
          <div className="tv-weather-h">{weather.head}</div>
          {weather.note && <div className="tv-weather-p">{weather.note}</div>}
        </div>
      </div>
    </div>
  );
}

function Card({ icon, label, value, sub }: { icon: "panel" | "pole"; label: string; value: string; sub: Line }) {
  return (
    <div className="tv-card">
      <div className="tv-card-h">
        <Ic name={icon} />
        <div className="tv-label">{label}</div>
      </div>
      <div className="tv-numrow">
        <span className="tv-num">{value}</span>
        <span className="tv-unit">{UNIT}</span>
      </div>
      <div className="tv-sub">
        <Rich line={sub} />
      </div>
    </div>
  );
}

/** Screen 2 · แดดวันนี้: each hour's weather above the solar it made, and the battery under it. */
function SunScreen({ m }: { m: TvModel }) {
  const H = m.strip.hours;
  return (
    <div className="tv-left">
      <div>
        <div className="tv-title">{STRIP.title}</div>
        <div className="tv-subtitle">{STRIP.legend}</div>
        <div className="tv-hours">
          <div className="tv-rl">{STRIP.rowSky}</div>
          {H.map((h) =>
            h.icon ? <Ic key={h.h} name={h.icon} className={h.forecast ? "tv-hi f" : "tv-hi"} /> : <div key={h.h} />,
          )}
          <div className="tv-rl">{STRIP.rowRain}</div>
          {H.map((h) => (
            <div key={h.h} className={h.forecast ? "tv-rn f" : "tv-rn"}>
              {h.rain}
            </div>
          ))}
          <div className="tv-rl">
            {STRIP.rowSolar[0]}
            <br />
            {STRIP.rowSolar[1]}
          </div>
          {H.map((h) => (
            <div key={h.h} className="tv-bar">
              {h.label && <b>{h.label}</b>}
              {h.kwh != null && <i className={h.part ? "part" : undefined} style={{ height: `${h.pct}%` }} />}
            </div>
          ))}
          <div className="tv-rl">{STRIP.rowHour}</div>
          {H.map((h) => (
            <div key={h.h} className="tv-hr">
              {String(h.h).padStart(2, "0")}
            </div>
          ))}
          <div className="tv-rl">{STRIP.rowBattery}</div>
          {H.map((h) => (
            <div key={h.h} className="tv-bv">
              {h.soc}
            </div>
          ))}
        </div>
      </div>
      <div />
      <div className="tv-lines">
        {m.strip.lines.map((l, n) => (
          <div key={n} className="tv-line">
            <Rich line={l} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Screen 3 · ประหยัดค่าไฟ: saved so far, this month, and the bill against before solar. */
function SaveScreen({ save }: { save: NonNullable<TvModel["save"]> }) {
  return (
    <div className="tv-left">
      <div>
        <div className="tv-save-h">
          <Ic name="coin" />
          <div>
            <div className="tv-title">{SAVE.title}</div>
            <div className="tv-numrow">
              <span className="tv-num">{save.total}</span>
              <span className="tv-unit">บาท</span>
            </div>
          </div>
        </div>
        <div className="tv-save-rows">
          {save.rows.map((r) => (
            <div key={r.lead} className="tv-save-row">
              <Ic name={r.icon} />
              <div>
                {r.lead} <b className="tv-num">{r.b}</b>
                {r.tail}
                <br />
                {r.note}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div />
      <div className="tv-lines">
        <div className="tv-line wrap">{save.basis}</div>
      </div>
    </div>
  );
}
