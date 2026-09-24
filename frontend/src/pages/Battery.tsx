import { useMemo, useState } from "react";
import { DayNightStrip } from "@/components/DayNight";
import { GroupedBarChart } from "@/components/GroupedBarChart";
import { KpiGrid, type Kpi } from "@/components/Kpis";
import { PageTitle } from "@/components/ui";
import { GridRow, Legend, LegendRow, Section, StateRow } from "@/components/ui2";
import {
  daylight,
  equivalentCycles,
  lowestDays,
  roundTrip,
  socCell,
  socHeatmap,
  sunriseReading,
  tempFill,
  tempHeatmap,
  type Daylight,
  type HeatRow,
  type TempRow,
} from "@/lib/battery";
import type { BarGroup } from "@/lib/charts";
import { readingsFor, sumDaily } from "@/lib/energy";
import { dm, energyText, hm, minuteOfDay } from "@/lib/format";
import { useHome } from "@/lib/home";
import { withInfo } from "@/lib/kpis";
import { useWidth } from "@/lib/layout";
import type { Model } from "@/lib/model";
import { COLORS } from "@/lib/sankey";
import { useTrendMode } from "@/lib/trendMode";
import { monthSlots } from "@/lib/trends";
import type { BmsRow, DailyRow, FiveMinRow } from "@/lib/types";

// Battery (2b), per the design review (23/09/2026, mocks 3c desktop / 3d–3e mobile).

const DISCHARGED = "color-mix(in srgb, #3fa66a 45%, var(--color-bg))";
const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)} %`);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function Battery({
  mobile,
  fiveMin,
  daily,
  bms,
  model,
  paused,
}: {
  mobile: boolean;
  fiveMin: FiveMinRow[];
  daily: DailyRow[];
  bms: BmsRow[];
  model: Model;
  /** The live fetch is paused (daily API limit): "SOC now" says so. */
  paused?: boolean;
}) {
  const { mode } = useTrendMode();
  const { home } = useHome();
  // This page is only offered for homes with a battery (lib/home routeAvailable).
  const battery = home.battery ?? { kwh: 1, label: "" };
  const per = mode === "day";
  const today = model.dates.at(-1) ?? model.asOf;
  const P = useMemo(() => readingsFor(fiveMin, today), [fiveMin, today]);
  const heat = useMemo(() => socHeatmap(fiveMin, today, 14), [fiveMin, today]);
  const tempHeat = useMemo(() => tempHeatmap(bms, today, 14), [bms, today]);
  const sun = useMemo(() => daylight(fiveMin, today, 14), [fiveMin, today]);
  const slots = useMemo(() => monthSlots(daily), [daily]);
  const life = useMemo(() => sumDaily(daily), [daily]);
  const [barsRef, barsW] = useWidth<HTMLDivElement>();
  const pad = mobile ? 20 : 48;

  const last = P.at(-1);
  // The day is in progress until its last reading of the day (23:55) arrives.
  const lastT = last && last.t < 1435 ? last.t : null;
  const rise = sunriseReading(P);
  const cycles = equivalentCycles(life.discharge, battery.kwh);
  const kpis: Kpi[] = withInfo(
    [
      { label: "SOC now", th: "ระดับแบตตอนนี้", value: last ? String(last.soc) : "—", unit: "%", sub: last ? `at ${hm(last.t)}${paused ? " · paused" : ""}` : "no 5-min data" },
      { label: "SOC at sunrise", th: "ระดับแบตตอนเช้า", value: rise ? String(rise.soc) : "—", unit: "%", sub: rise ? `first PV > 50 W at ${hm(rise.t)}` : "no PV > 50 W yet" },
      { label: "State of health", th: "สุขภาพแบต (SOH)", value: last?.soh != null ? String(Math.round(last.soh)) : "—", unit: "%", sub: "BMS reading" },
      {
        label: "Equivalent cycles",
        th: "รอบเทียบเท่า",
        value: String(Math.round(cycles)),
        sub: `${(daily.length ? cycles / daily.length : 0).toFixed(2)} per day · ${energyText(life.discharge)} out`,
      },
      { label: "Round-trip", th: "ประสิทธิภาพไป-กลับ", value: pct(roundTrip(life.discharge, life.charge)).replace(" %", ""), unit: "%", sub: "lifetime discharge ÷ charge" },
    ],
    [
      ["Battery state of charge at the latest 5-minute reading."],
      ["State of charge when the sun came up: at the first reading with PV above 50 W.", "It shows how close the battery gets to empty overnight — a low number means the battery barely covers the night."],
      ["State of health: remaining capacity compared with new, reported by the battery's BMS.", "LiFePO4 typically loses 1–3 % a year."],
      [`Total discharged ÷ ${battery.kwh} kWh: how many times the battery has been fully emptied, in effect.`, "LiFePO4 is typically rated for 4,000–6,000 cycles."],
      [
        "Energy out of the battery ÷ energy put in. 90–95 % is normal for LiFePO4.",
        `discharge ${energyText(life.discharge)} ÷ charge ${energyText(life.charge)}`,
      ],
    ],
  );
  kpis[4].source = "Inverter daily totals";

  // Monthly bars: a partial month (switch-on or the current month) is tagged and its label dimmed.
  const groups = useMemo(
    () =>
      slots.map<BarGroup>((m) => {
        const d = m.data;
        const div = d && per ? d.days : 1;
        const partial = !!d && (m.firstDay! > 1 || m.lastDay! < m.daysInMonth);
        return {
          label: m.label,
          sub: d ? `${d.days} days${partial ? " · partial" : ""}` : "",
          top: d ? pct(roundTrip(d.fromBat, d.toBat)) : undefined,
          partial,
          vals: d ? [{ v: d.toBat / div, color: COLORS.bat }, { v: d.fromBat / div, color: DISCHARGED }] : null,
        };
      }),
    [slots, per],
  );
  const barFmt = useMemo(() => (per ? (v: number) => v.toFixed(0) : (v: number) => Math.round(v).toLocaleString("en-US")), [per]);

  const hasAfter = heat.some((r) => r.today && r.cells.some((c) => c.kind === "future"));
  const hasMissing = heat.some((r) => r.cells.some((c) => c.kind === "missing"));
  const lows = lowestDays(heat);
  const socNote = mobile
    ? "Tap a cell for the hourly value. The daily low comes just before sunrise, in the faintest cells of each row."
    : "The lowest point of each row is just before sunrise." +
      (lows.length === 2 ? ` ${dm(lows[1].date)} and ${dm(lows[0].date)} dropped to ${lows[0].low}–${lows[1].low} %.` : "") +
      (sun ? " Sun times are the 14-day median of first and last PV > 50 W." : "");

  return (
    <>
      <div style={{ padding: `${mobile ? 20 : 32}px ${pad}px 0` }}>
        <PageTitle mobile={mobile} title="Battery" sub={`แบตเตอรี่ · ${battery.label} · ≈${battery.kwh} kWh`} />
      </div>
      <KpiGrid plain mobile={mobile} items={mobile ? kpis.slice(0, 4) : kpis} style={{ margin: mobile ? "16px 0 0" : `24px ${pad}px 0` }} />

      <Section
        rule={false}
        style={{ margin: `${mobile ? 24 : 32}px ${pad}px 0` }}
        en="State of charge by hour"
        th={mobile ? "ระดับแบตเตอรี่รายชั่วโมง · last 14 days" : "ระดับแบตเตอรี่รายชั่วโมง · hourly mean · last 14 days"}
        extra={
          <>
            <LegendRow>
              <Ramp from={socCell(0)} to={socCell(100)} lo="0 %" hi="100 %" mobile={mobile} />
            </LegendRow>
            <StateRow after={hasAfter} last={lastT != null ? hm(lastT) : null} noData={hasMissing} />
          </>
        }
        note={socNote}
      >
        <SocHeatmap rows={heat} sun={sun} lastT={lastT} mobile={mobile} />
      </Section>

      <TempSection rows={tempHeat} bms={bms} sun={sun} lastT={lastT} mobile={mobile} pad={pad} />

      {mobile ? (
        <MonthsList slots={slots} kwh={battery.kwh} pad={pad} />
      ) : (
        <div className="split" style={{ margin: `32px ${pad}px 0` }}>
          <Section
            en="Charge and discharge"
            th={`ชาร์จ · จ่ายไฟ · ${per ? "kWh / day" : "kWh / month"} · label = round-trip`}
            extra={
              <>
                <LegendRow>
                  <Legend color={COLORS.bat}>Charged</Legend>
                  <Legend color={DISCHARGED}>Discharged</Legend>
                </LegendRow>
                <span className="muted-72" style={{ fontSize: 11 }}>
                  Partial month: label at 60 %, carry-over not netted
                </span>
              </>
            }
          >
            <div ref={barsRef}>
              <GroupedBarChart label="Battery charge and discharge per month" width={Math.min(barsW, 768)} height={300} groups={groups} fmt={barFmt} />
            </div>
          </Section>
          <Section en="Cycles and efficiency" th="รอบการใช้งาน · ประสิทธิภาพ" note={`Cycles = discharge ÷ ${battery.kwh} kWh. Round-trip = discharge ÷ charge per month.`}>
            <div style={{ display: "flex", flexDirection: "column", fontSize: 14 }}>
              <GridRow head cols="1fr 1fr 1fr">
                <span>Month</span>
                <span style={{ textAlign: "right" }}>Cycles</span>
                <span style={{ textAlign: "right" }}>Round-trip</span>
              </GridRow>
              {slots.map((m) => {
                const partial = !!m.data && (m.firstDay! > 1 || m.lastDay! < m.daysInMonth);
                return (
                  <GridRow key={m.key} cols="1fr 1fr 1fr">
                    <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      {m.label}
                      {partial && <span className="tag-partial">{`${m.firstDay}–${m.lastDay}`}</span>}
                    </span>
                    <span style={{ textAlign: "right" }}>{m.data ? equivalentCycles(m.data.fromBat, battery.kwh).toFixed(1) : "—"}</span>
                    <span style={{ textAlign: "right", opacity: partial ? 0.6 : 1 }}>{m.data ? pct(roundTrip(m.data.fromBat, m.data.toBat)) : <span className="muted">no data</span>}</span>
                  </GridRow>
                );
              })}
            </div>
          </Section>
        </div>
      )}
    </>
  );
}

/** Legend ramp: 120×10 (72×8 on mobile) between two labels. */
function Ramp({ from, to, lo, hi, mobile }: { from: string; to: string; lo: string; hi: string; mobile?: boolean }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      {lo}
      <span style={{ width: mobile ? 72 : 120, height: mobile ? 8 : 10, background: `linear-gradient(90deg, ${from}, ${to})` }} />
      {hi}
    </span>
  );
}

/** Hour axis: every 3 h on desktop, every 6 h on mobile. */
function HourAxis({ mobile }: { mobile: boolean }) {
  return (
    <>
      <span />
      <div className="heat-axis">
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h}>{h % (mobile ? 6 : 3) === 0 ? String(h).padStart(2, "0") : ""}</span>
        ))}
      </div>
    </>
  );
}

/** Accent last-reading marker across today's row (the only accent use inside charts). */
const LastMark = ({ t }: { t: number }) => <div className="heat-mark" style={{ left: `calc(${(t / 1440) * 100}% - 1px)` }} />;

function SocHeatmap({ rows, sun, lastT, mobile }: { rows: HeatRow[]; sun: Daylight | null; lastT: number | null; mobile: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div>
      <div className="heatmap" role="table" aria-label="Hourly mean state of charge, last 14 days">
        <DayNightStrip d={sun} mobile={mobile} />
        <HourAxis mobile={mobile} />
        {rows.map((r) => {
          const day = dm(r.date);
          return (
            <div key={r.date} style={{ display: "contents" }} role="row">
              <span className="heat-label" style={{ fontWeight: r.today ? 700 : 400 }}>
                {r.today ? (mobile ? "Today" : `${day} · today`) : day}
              </span>
              <div className="heat-row">
                {r.cells.map((c, h) => {
                  if (c.kind === "soc")
                    return (
                      <div
                        key={h}
                        className={`heat-cell${c.soc < 55 ? " low" : ""}`}
                        title={`${day} ${hh(h)} · SOC ${c.soc} %`}
                        onClick={() => setPicked(`${day} ${hh(h)} · SOC ${c.soc} %`)}
                        style={{ background: socCell(c.soc) }}
                      >
                        <span>{h % 3 === 0 ? c.soc : ""}</span>
                      </div>
                    );
                  if (c.kind === "future") return <div key={h} className="heat-cell heat-after" title={`${day} ${hh(h)} · after the last reading`} />;
                  return <div key={h} className="heat-cell hatch" title={r.loaded ? `${day} ${hh(h)} · no data` : `${day} · no data`} />;
                })}
                {r.today && lastT != null && <LastMark t={lastT} />}
              </div>
            </div>
          );
        })}
      </div>
      {mobile && picked && (
        <div className="caption" style={{ marginTop: 6, fontWeight: 600, color: "var(--color-text)" }}>
          {picked}
        </div>
      )}
    </div>
  );
}

/**
 * Battery temperature by hour. The BMS reading is live-only (logged every 15 min from the day
 * the poll was installed) and can't be backfilled, so only logged days get a row — the grid
 * grows one row a day up to 14. Days before logging aren't drawn at all (not an outage).
 */
function TempSection({ rows, bms, sun, lastT, mobile, pad }: { rows: TempRow[]; bms: BmsRow[]; sun: Daylight | null; lastT: number | null; mobile: boolean; pad: number }) {
  const logged = rows.filter((r) => r.tracked);
  const start = bms.reduce<string | null>((a, r) => (a == null || r.time < a ? r.time : a), null);
  const latest = bms.reduce<BmsRow | null>((a, r) => (!a || r.time > a.time ? r : a), null);
  const latestText = latest?.temp_max_c != null ? `${latest.temp_min_c ?? "—"}–${latest.temp_max_c} °C` : "—";
  const showGrid = logged.length > 0 && (!mobile || logged.length >= 2);
  const hasMissing = logged.some((r) => r.cells.some((c) => c.kind === "missing"));
  const hasAfter = logged.some((r) => r.today && r.cells.some((c) => c.kind === "future"));

  const facts = (
    <>
      <Fact label={`Latest${latest ? ` · ${hm(minuteOfDay(latest.time))}` : ""}`} value={latestText} />
      {!mobile && <Fact label="Samples" value={String(bms.length)} />}
      <Fact label={mobile ? "Charge range" : "Charge range (datasheet)"} value="0–45 °C" />
    </>
  );
  const since = start ? `${dm(start)} ${start.slice(11, 16)}` : null;

  return (
    <Section
      style={{ margin: `${mobile ? 24 : 32}px ${pad}px 0` }}
      en={mobile ? "Battery temperature" : "Battery temperature by hour"}
      th={`อุณหภูมิแบตเตอรี่${mobile ? "" : "รายชั่วโมง"} (BMS) · ${mobile ? "" : "warmest sensor · "}${since ? `logged since ${since}` : "not logged yet"}`}
      extra={
        showGrid ? (
          <>
            <LegendRow>
              <Ramp from={tempFill(20)} to={tempFill(45)} lo="20 °C" hi="45 °C" mobile={mobile} />
            </LegendRow>
            <StateRow after={hasAfter} last={hasAfter && lastT != null ? hm(lastT) : null} noData={hasMissing} />
          </>
        ) : undefined
      }
      note={
        !since
          ? "Read live from the battery's BMS every 15 min by the scheduled SolisCloud fetch; nothing has been logged yet."
          : mobile && !showGrid
            ? `Logging started ${since}, so the hour grid appears from tomorrow, one row per day.`
            : "Read live from the battery's BMS every 15 min; there's no history to backfill, so a row is added each day."
      }
    >
      {showGrid && (
        <div className="heatmap" role="table" aria-label="Hourly warmest battery temperature">
          <DayNightStrip d={sun} mobile={mobile} />
          <HourAxis mobile={mobile} />
          {logged.map((r) => {
            const day = dm(r.date);
            const firstLogged = r.cells.findIndex((c) => c.kind !== "before");
            return (
              <div key={r.date} style={{ display: "contents" }} role="row">
                <span className="heat-label" style={{ fontWeight: r.today ? 700 : 400 }}>
                  {r.today ? (mobile ? "Today" : `${day} · today`) : day}
                </span>
                <div className="heat-row">
                  {r.cells.map((c, h) => {
                    if (c.kind === "temp")
                      return (
                        <div key={h} className={`heat-cell${c.c <= 36 ? " low" : ""}`} title={`${day} ${hh(h)} · warmest ${c.c} °C`} style={{ background: tempFill(c.c) }}>
                          <span>{h % 3 === 0 || h === firstLogged ? Math.round(c.c) : ""}</span>
                        </div>
                      );
                    if (c.kind === "before") return <div key={h} className="heat-cell" />;
                    if (c.kind === "future") return <div key={h} className="heat-cell heat-after" title={`${day} ${hh(h)} · after the last reading`} />;
                    return <div key={h} className="heat-cell hatch" title={`${day} ${hh(h)} · no sample`} />;
                  })}
                  {r.today && lastT != null && hasAfter && <LastMark t={lastT} />}
                  {!mobile && firstLogged > 3 && start?.startsWith(r.date) && (
                    <span className="muted-72" style={{ position: "absolute", right: `calc(${((24 - firstLogged) / 24) * 100}% + 8px)`, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: 11, whiteSpace: "nowrap" }}>
                      Logging started {start.slice(11, 16)} →
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!mobile && since && (
        <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr)", marginTop: showGrid ? 8 : 0 }}>
          <span />
          <div style={{ display: "grid", gridTemplateColumns: "auto auto auto minmax(0, 1fr)", gap: 1, background: "var(--color-divider)", borderTop: "1px solid var(--color-text)", borderBottom: "1px solid var(--color-text)" }}>
            {facts}
            <div style={{ background: "var(--color-bg)" }} />
          </div>
        </div>
      )}
      {mobile && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--color-divider)", borderTop: "1px solid var(--color-text)", borderBottom: "1px solid var(--color-text)" }}>
          {facts}
        </div>
      )}
    </Section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--color-bg)", padding: "10px 18px", display: "flex", flexDirection: "column", gap: 2 }}>
      <span className="muted-72" style={{ fontSize: 11 }}>
        {label}
      </span>
      <span className="tnum" style={{ fontSize: 20, fontWeight: 800 }}>
        {value}
      </span>
    </div>
  );
}

/** Mobile "Months": one row per month instead of a bar chart + table (review 3d). */
function MonthsList({ slots, kwh, pad }: { slots: ReturnType<typeof monthSlots>; kwh: number; pad: number }) {
  const rows = slots.filter((m) => m.data);
  const days = (m: (typeof rows)[number]) => m.data!.days;
  const max = Math.max(1, ...rows.map((m) => Math.max(m.data!.toBat, m.data!.fromBat) / days(m)));
  return (
    <Section
      style={{ margin: `24px ${pad}px 0` }}
      en="Months"
      th="ชาร์จ / จ่าย kWh/day · cycles · round-trip"
      extra={
        <LegendRow>
          <Legend color={COLORS.bat}>Charged</Legend>
          <Legend color={DISCHARGED}>Discharged</Legend>
        </LegendRow>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--color-text)" }}>
        {rows.map((m) => {
          const d = m.data!;
          const partial = m.firstDay! > 1 || m.lastDay! < m.daysInMonth;
          return (
            <div key={m.key} style={{ display: "grid", gridTemplateColumns: "52px minmax(0, 1fr) 40px 44px", gap: 10, alignItems: "center", minHeight: 44, borderBottom: "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</span>
                {partial && <span className="muted-72" style={{ fontSize: 10 }}>{`${m.firstDay}–${m.lastDay}`}</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ height: 6, width: `${(d.toBat / days(m) / max) * 100}%`, background: COLORS.bat }} />
                <div style={{ height: 6, width: `${(d.fromBat / days(m) / max) * 100}%`, background: DISCHARGED }} />
              </div>
              <span className="tnum" style={{ fontSize: 13, textAlign: "right" }}>
                {equivalentCycles(d.fromBat, kwh).toFixed(1)}
              </span>
              <span className="tnum" style={{ fontSize: 13, fontWeight: 600, textAlign: "right", opacity: partial ? 0.6 : 1 }}>
                {pct(roundTrip(d.fromBat, d.toBat))}
              </span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
