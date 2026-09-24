import { useEffect, useMemo, useState } from "react";
import { DayPowerChart } from "@/components/DayPowerChart";
import { Sankey } from "@/components/Sankey";
import { SkyIcon } from "@/components/Weather";
import { daylight } from "@/lib/battery";
import { dayTotals, daySplit, flowsFrom, readingsFor, selfSufficiency } from "@/lib/energy";
import { dmy, hm, thb } from "@/lib/format";
import { useHome } from "@/lib/home";
import { savingsKpis } from "@/lib/kpis";
import { useWidth } from "@/lib/layout";
import type { Model } from "@/lib/model";
import { COLORS } from "@/lib/sankey";
import { useSettings } from "@/lib/settings";
import type { FeedState } from "@/lib/status";
import { payback } from "@/lib/tariff";
import type { FiveMinRow, WeatherRow } from "@/lib/types";
import { daySummary, rainSpells, weatherDay, type DaySummary, type RainSpell } from "@/lib/weather";

// TV mode (#/<home>/tv): a full-screen, no-touch dashboard for a living-room TV (LG webOS).
// Four slides rotate every 20 s (◀ ▶ on the remote step them); data refreshes on its own.
// TV browsers run an older Chromium, so this page uses only plain colours (no color-mix()),
// grid layout (no flex gap) and sizes in vw so it fills any TV resolution.

// Two palettes in plain colours (TV browsers lack color-mix()): light by day, dark by night.
const DARK = {
  "--color-bg": "#1b1a19",
  "--color-surface": "#272524",
  "--color-text": "#f1efee",
  "--color-divider": "rgba(241,239,238,0.3)",
  "--color-accent": "#ff563c",
  "--muted": "rgba(241,239,238,0.72)",
  "--muted-72": "rgba(241,239,238,0.72)",
  "--sun": "rgba(233,168,37,0.58)",
  "--night": "rgba(241,239,238,0.13)",
  "--hatch": "repeating-linear-gradient(45deg, transparent 0 4px, rgba(241,239,238,0.22) 4px 6px)",
  "--ramp-base": "#2d2b2b",
  "--tv-dot-off": "rgba(241,239,238,0.25)",
} as React.CSSProperties;
const LIGHT = {
  "--color-bg": "#f3f2f2",
  "--color-surface": "#eae9e9",
  "--color-text": "#201e1d",
  "--color-divider": "rgba(32,30,29,0.4)",
  "--color-accent": "#ec3013",
  "--muted": "rgba(32,30,29,0.72)",
  "--muted-72": "rgba(32,30,29,0.72)",
  "--sun": "rgba(233,168,37,0.42)",
  "--night": "rgba(32,30,29,0.09)",
  "--hatch": "repeating-linear-gradient(45deg, transparent 0 4px, rgba(32,30,29,0.14) 4px 6px)",
  "--ramp-base": "#f3f2f2",
  "--tv-dot-off": "rgba(32,30,29,0.2)",
} as React.CSSProperties;

export type TvTheme = "auto" | "light" | "dark";

/** Light between sunrise and sunset (minutes of day), dark otherwise — or a forced theme. */
export function tvIsLight(theme: TvTheme, minute: number, rise = 360, set = 1080): boolean {
  if (theme !== "auto") return theme === "light";
  return minute >= rise && minute < set;
}

const MUTED = "var(--muted)";
const RULE = "2px solid var(--color-divider)";
const SLIDES = ["now", "day", "flow", "savings"] as const;
type Slide = (typeof SLIDES)[number];
const TITLES: Record<Slide, [string, string]> = {
  now: ["Right now", "ตอนนี้"],
  day: ["Today", "วันนี้"],
  flow: ["Energy flow today", "การไหลของพลังงานวันนี้"],
  savings: ["Savings", "ประหยัดได้"],
};

const kw = (w: number) => (Math.abs(w) / 1000).toFixed(1);

export function Tv({ fiveMin, model, weather, feed, seconds = 20, theme = "auto" }: { fiveMin: FiveMinRow[]; model: Model; weather: WeatherRow[]; feed: FeedState | null; seconds?: number; theme?: TvTheme }) {
  const { home } = useHome();
  const { costFor } = useSettings();
  const [i, setI] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const [ref, width] = useWidth<HTMLDivElement>();

  // Rotate, tick the clock, step with the remote, and reload every 6 h to pick up new builds.
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % SLIDES.length), seconds * 1000);
    return () => window.clearInterval(t);
  }, [seconds, i]);
  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 30_000);
    const r = window.setTimeout(() => window.location.reload(), 6 * 3600_000);
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((n) => (n + 1) % SLIDES.length);
      if (e.key === "ArrowLeft") setI((n) => (n + SLIDES.length - 1) % SLIDES.length);
    };
    window.addEventListener("keydown", key);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(r);
      window.removeEventListener("keydown", key);
    };
  }, []);

  const date = model.dates[model.dates.length - 1] ?? model.asOf;
  const P = useMemo(() => readingsFor(fiveMin, date), [fiveMin, date]);
  const last = P[P.length - 1];
  const totals = useMemo(() => dayTotals(fiveMin, date), [fiveMin, date]);
  const flows = useMemo(() => (totals ? flowsFrom(totals, "stored", daySplit(totals)) : null), [totals]);
  const sun = useMemo(() => daylight(fiveMin, date, 14), [fiveMin, date]);
  const wx = useMemo(() => weatherDay(weather, date), [weather, date]);
  const wxDay = useMemo(() => daySummary(wx, sun?.rise, sun?.set), [wx, sun]);
  const wxNow = last ? wx[Math.floor(last.t / 60)] : null;
  const spells = useMemo(() => rainSpells(wx), [wx]);
  const ss = totals && totals.load > 0 ? Math.round(selfSufficiency(totals) * 100) : null;
  const savings = useMemo(() => savingsKpis(model.savings, home.utility), [model.savings, home.utility]);
  const { cost, placeholder } = costFor(home);
  const pay = payback(model.savings.cumTotal, model.savings.avgMonthly, cost, model.commissioned);
  const slide = SLIDES[i];
  // Auto theme follows the sun (the same sunrise / sunset as the strip); the clock ticks it over.
  const light = tvIsLight(theme, clock.getHours() * 60 + clock.getMinutes(), sun?.rise, sun?.set);
  const nameTh = home.subtitleShort.split(" · ")[0];

  const tiles: Tile[] =
    slide === "now" && last && totals
      ? [
          { en: "Solar now", th: "โซลาร์ผลิตตอนนี้", value: kw(last.pv), unit: "kW", sub: `today ${totals.pv.toFixed(1)} kWh`, color: COLORS.pv },
          { en: "Home using", th: "บ้านใช้ไฟ", value: kw(last.load), unit: "kW", sub: `today ${totals.load.toFixed(1)} kWh`, color: COLORS.load },
          {
            en: "Battery",
            th: "แบตเตอรี่",
            value: String(last.soc),
            unit: "%",
            sub: last.bat > 50 ? `charging ${kw(last.bat)} kW` : last.bat < -50 ? `supplying ${kw(last.bat)} kW` : "resting",
            color: COLORS.bat,
          },
          { en: "From the grid", th: `ซื้อไฟ ${home.utility}`, value: kw(last.grid), unit: "kW", sub: `today ${totals.gridImport.toFixed(1)} kWh`, color: COLORS.grid },
        ]
      : slide === "savings"
        ? [
            // Saved so far · this month (or last bill) · bill vs before solar · payback: 2 × 2.
            ...[savings[0], savings[3], savings[1]].map((k) => ({ en: k.label, th: k.th, value: k.value, unit: k.unit, sub: k.sub })),
            { en: "Payback", th: "คืนทุน", value: (pay.pct * 100).toFixed(0), unit: "%", sub: `${thb(model.savings.cumTotal)} of ${thb(cost)}${placeholder ? " (estimated cost)" : ""}` },
          ]
        : [];

  return (
    <div
      style={{
        ...(light ? LIGHT : DARK),
        position: "fixed",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        background: "var(--color-bg)",
        color: "var(--color-text)",
        fontSize: "1.25vw",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        padding: "2.2vw 3vw 1.6vw",
        boxSizing: "border-box",
        overflow: "hidden",
        cursor: "none",
      }}
    >
      {/* Header: home + slide title · clock + data status */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "end", borderBottom: RULE, paddingBottom: "1vw" }}>
        <div>
          <div style={{ fontSize: "1.3em", color: MUTED }}>
            {home.name} Solar · {nameTh}
          </div>
          <div style={{ fontSize: "3.2em", fontWeight: 800, lineHeight: 1.1 }}>
            {TITLES[slide][0]} <span style={{ fontSize: "0.5em", fontWeight: 400, color: MUTED }}>{TITLES[slide][1]}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "3.2em", fontWeight: 800, lineHeight: 1 }}>{`${String(clock.getHours()).padStart(2, "0")}:${String(clock.getMinutes()).padStart(2, "0")}`}</div>
          <div style={{ fontSize: "1.1em", color: MUTED, marginTop: "0.3em" }}>
            {dmy(date)} · {feed ? feed.line : ""}
          </div>
        </div>
      </div>

      {/* Body */}
      <div ref={ref} style={{ minHeight: 0, paddingTop: "1.6vw", display: "grid", gridTemplateRows: slide === "now" ? "auto 1fr" : slide === "day" ? "1fr auto auto" : "1fr auto", rowGap: "1.4vw" }}>
        {slide === "now" && (
          <>
            <div style={{ fontSize: "2.2em", fontWeight: 800 }}>
              {ss != null ? `${ss} % of the home ran on the sun today` : "Waiting for today's readings"}
              <div style={{ fontSize: "0.55em", fontWeight: 400, color: MUTED, marginTop: "0.2em" }}>
                {ss != null ? `บ้านใช้ไฟจากแสงอาทิตย์ ${ss} % วันนี้` : ""}
                {wxNow?.cond ? ` · Weather now: ${wxNow.cond.en} (${wxNow.cond.th})` : ""}
                {wxDay ? ` · Today: ${wxDay.en}` : ""}
              </div>
            </div>
            <Tiles tiles={tiles} cols={4} />
          </>
        )}
        {slide === "day" && (
          <>
            {P.length ? (
              <DayPowerChart P={P} date={date} width={width} height={Math.round(window.innerHeight * 0.46)} live daylight={sun} weather={wx} />
            ) : (
              <div style={{ fontSize: "2em", color: MUTED }}>No readings yet today.</div>
            )}
            <Legend
              items={[
                [COLORS.pv, `Solar ${totals ? totals.pv.toFixed(1) : "—"} kWh`],
                [COLORS.load, `Home ${totals ? totals.load.toFixed(1) : "—"} kWh`],
                [COLORS.bat, `Battery ${last ? last.soc : "—"} %`],
                [COLORS.grid, `Grid ${totals ? totals.gridImport.toFixed(1) : "—"} kWh`],
              ]}
            />
            <WeatherLine day={wxDay} now={wxNow?.cond?.th ?? null} spells={spells} />
          </>
        )}
        {slide === "flow" && (
          <>
            {flows ? <Sankey flows={flows} width={width} height={Math.round(window.innerHeight * 0.55)} variant="desktop" plain /> : <div style={{ fontSize: "2em", color: MUTED }}>No readings yet today.</div>}
            <div style={{ fontSize: "1.8em", fontWeight: 800 }}>{ss != null ? `${ss} % from the sun · บ้านใช้ไฟจากแสงอาทิตย์ ${ss} %` : ""}</div>
          </>
        )}
        {slide === "savings" && (
          <>
            <Tiles tiles={tiles} cols={2} />
            <div style={{ fontSize: "1.2em", color: MUTED }}>
              Bills from the {home.utility} Log · estimated bill without solar vs the real bill · updated {last ? hm(last.t) : ""}
            </div>
          </>
        )}
      </div>

      {/* Slide dots */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${SLIDES.length}, 2.4vw)`, columnGap: "0.8vw", justifyContent: "center", paddingTop: "1vw" }}>
        {SLIDES.map((s, n) => (
          <span key={s} style={{ height: "0.5vw", background: n === i ? "var(--color-text)" : "var(--tv-dot-off)" }} />
        ))}
      </div>
    </div>
  );
}

interface Tile {
  en: string;
  th: string;
  value: string;
  unit?: string;
  sub: string;
  color?: string;
}

function Tiles({ tiles, cols }: { tiles: Tile[]; cols: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "2px", background: "var(--color-divider)", borderTop: RULE, borderBottom: RULE, alignSelf: "start" }}>
      {tiles.map((t) => (
        <div key={t.en} style={{ background: "var(--color-bg)", padding: "1.6vw 1.4vw" }}>
          <div style={{ fontSize: "1.5em", fontWeight: 700 }}>
            {t.color && <span style={{ display: "inline-block", width: "0.7em", height: "0.7em", background: t.color, marginRight: "0.4em" }} />}
            {t.en}
          </div>
          <div style={{ fontSize: "1.1em", color: MUTED }}>{t.th}</div>
          <div style={{ fontSize: "5em", fontWeight: 800, lineHeight: 1.1, marginTop: "0.15em", letterSpacing: "-0.02em" }}>
            {t.value}
            {t.unit && <span style={{ fontSize: "0.35em", fontWeight: 600, marginLeft: "0.2em" }}>{t.unit}</span>}
          </div>
          <div style={{ fontSize: "1.2em", color: MUTED, marginTop: "0.3em" }}>{t.sub}</div>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, auto)`, justifyContent: "start", columnGap: "2.5vw", fontSize: "1.6em", fontWeight: 700 }}>
      {items.map(([c, label]) => (
        <span key={label}>
          <span style={{ display: "inline-block", width: "0.7em", height: "0.7em", background: c, marginRight: "0.4em" }} />
          {label}
        </span>
      ))}
    </div>
  );
}

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Today's weather in Thai under the Day chart: summary + now, when it rained, and where the icons come from. */
function WeatherLine({ day, now, spells }: { day: DaySummary | null; now: string | null; spells: RainSpell[] }) {
  if (!day && !now) return null;
  const rain = spells.slice(0, 3).map((s) => `${hh(s.from)}–${hh(s.to)} (${s.mm} มม.)`).join(", ");
  return (
    <div style={{ borderTop: RULE, paddingTop: "0.8vw" }}>
      <div style={{ fontSize: "1.6em", fontWeight: 700 }}>
        {day && (
          <span style={{ display: "inline-block", verticalAlign: "middle", marginRight: "0.4em" }}>
            <SkyIcon sky={day.sky} size={30} />
          </span>
        )}
        {day ? `อากาศวันนี้: ${day.th}` : ""}
        {now ? <span style={{ fontWeight: 400, color: MUTED }}>{`${day ? " · " : ""}ตอนนี้: ${now}`}</span> : null}
      </div>
      <div style={{ fontSize: "1.1em", color: MUTED, marginTop: "0.3em" }}>
        {rain ? `ฝนตกช่วง ${rain} · ` : ""}
        ไอคอนบนกราฟ: แบบจำลองอากาศ Open-Meteo (ไม่ใช่เซนเซอร์ที่บ้าน) · สีจาง = พยากรณ์
      </div>
    </div>
  );
}
