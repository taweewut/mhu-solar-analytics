import { useMemo, useState } from "react";
import { DateNav } from "@/components/DateNav";
import { DayLineChart } from "@/components/DayLineChart";
import { Check, ChevronDown, TriangleAlert } from "@/components/Icons";
import { KpiGrid, type Kpi } from "@/components/Kpis";
import { PageTitle } from "@/components/ui";
import { Legend, LegendRow, Section, StateRow, WarnTag } from "@/components/ui2";
import { daylight } from "@/lib/battery";
import { coverRange, type LineSeries } from "@/lib/charts";
import { readingsFor } from "@/lib/energy";
import { dm, dmy, hm, minuteOfDay, weekday } from "@/lib/format";
import { navigate } from "@/lib/router";
import { bmsDay, bmsSince, completenessFor, completenessShade, healthDay, healthHistory, SPARSE_MIN, stateLog, stringRatio, type HealthHistoryRow } from "@/lib/health";
import { useHome } from "@/lib/home";
import { withInfo } from "@/lib/kpis";
import { useWidth } from "@/lib/layout";
import type { Model } from "@/lib/model";
import { COLORS } from "@/lib/sankey";
import type { BmsRow, FiveMinRow } from "@/lib/types";

// Health (2c), per the design review (23/09/2026, mock 3f): status first, then string balance
// and inverter temperature; the BMS as a value block until it has enough samples; MPPT power /
// voltage (and, on mobile, data completeness) under "More detail".

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const kw = (v: number) => `${v / 1000} kW`;
const volts = (v: number) => `${Math.round(v)} V`;
const deg = (v: number) => `${v} °C`;
const pctFmt = (v: number) => `${v} %`;
const cellV = (v: number) => `${v.toFixed(2)} V`;
// Second series of a pair: told apart by colour and weight — never dashed (dash = estimated).
const MPPT2 = "var(--color-text)";
const BAT_2 = "color-mix(in srgb, #3fa66a 50%, var(--color-bg))";

export function Health({ mobile, fiveMin, bms, model, date: requested }: { mobile: boolean; fiveMin: FiveMinRow[]; bms: BmsRow[]; model: Model; date?: string | null }) {
  const { home } = useHome();
  const inv = home.inverter;
  // Any day with 5-minute data (?d=YYYY-MM-DD); the latest by default.
  const latest = model.dates.at(-1) ?? model.asOf;
  const today = requested && model.dates.includes(requested) ? requested : latest;
  const go = (d: string) => navigate("health", d === latest ? undefined : { d });
  const P = useMemo(() => readingsFor(fiveMin, today), [fiveMin, today]);
  const h = useMemo(() => healthDay(fiveMin, today), [fiveMin, today]);
  const dayRows = useMemo(() => fiveMin.filter((r) => r.time.startsWith(today)), [fiveMin, today]);
  const log = useMemo(() => stateLog(dayRows), [dayRows]);
  const b = useMemo(() => bmsDay(bms, today), [bms, today]);
  const sun = useMemo(() => daylight(fiveMin, today, 14), [fiveMin, today]);
  const bmsFrom = useMemo(() => bmsSince(bms), [bms]);
  const bmsStart = useMemo(() => bms.reduce<string | null>((a, r) => (a == null || r.time < a ? r.time : a), null), [bms]);
  const last = P.at(-1);
  // The latest day is still in progress until its 23:55 reading arrives.
  const live = today === latest && last != null && last.t < 1435;
  const liveLatest = (() => {
    const lp = fiveMin.at(-1);
    return lp != null && minuteOfDay(lp.time) < 1435;
  })();
  const history = useMemo(() => healthHistory(fiveMin, bms, model.dates, latest, liveLatest), [fiveMin, bms, model.dates, latest, liveLatest]);
  const nowT = live ? last!.t : null;
  // A BMS sample can be newer than the last 5-min reading.
  const bmsNowT = nowT != null && b ? Math.max(nowT, ...b.tempMax.map(([t]) => t)) : nowT;
  const days = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)).map((d) => completenessFor(fiveMin, d, live && d === today)),
    [fiveMin, today, live],
  );
  const todayC = days[days.length - 1];
  const [pairRef, pairW] = useWidth<HTMLDivElement>();
  const [moreRef, moreW] = useWidth<HTMLDivElement>();
  const pad = mobile ? 20 : 48;
  const halfW = mobile ? pairW : (pairW - 32) / 2;
  const moreHalf = mobile ? moreW : (moreW - 32) / 2;

  const charts = useMemo(() => {
    const pmax = Math.max(1000, Math.ceil(Math.max(0, ...P.map((p) => Math.max(p.mppt1, p.mppt2))) / 1000) * 1000);
    const vRows = dayRows.map((r) => [r.mppt1_v, r.mppt2_v]).flat().filter((v): v is number => v != null);
    const vmax = Math.max(100, Math.ceil(Math.max(0, ...vRows) / 100) * 100);
    const [tmin, tmax] = coverRange(P.map((p) => p.temp), 35, 60, 5);
    const at = (f: (r: FiveMinRow) => number | null) => dayRows.map((r) => [minuteOfDay(r.time), f(r)] as [number, number | null]);
    const ratio = stringRatio(P).map(([t, v]) => [t, v == null ? null : Math.max(80, Math.min(120, v))] as [number, number | null]);
    return {
      ratio: [{ pts: ratio, color: COLORS.pv, w: 2 }] as LineSeries[],
      power: {
        ymax: pmax,
        series: [
          { pts: P.map((p) => [p.t, p.mppt1]), color: COLORS.pv, w: 2 },
          { pts: P.map((p) => [p.t, p.mppt2]), color: MPPT2, w: 1.25 },
        ] as LineSeries[],
      },
      volt: {
        ymax: vmax,
        series: [
          { pts: at((r) => r.mppt1_v), color: COLORS.pv, w: 2 },
          { pts: at((r) => r.mppt2_v), color: MPPT2, w: 1.25 },
        ] as LineSeries[],
      },
      temp: { ymin: tmin, ymax: tmax, series: [{ pts: P.map((p) => [p.t, p.temp]), color: "var(--color-text)", w: 1.5 }] as LineSeries[] },
    };
  }, [P, dayRows]);

  const batCharts = useMemo(() => {
    if (!b || b.samples < SPARSE_MIN) return null;
    const vals = (pts: [number, number | null][]) => pts.map(([, v]) => v).filter((v): v is number => v != null);
    const [tmin, tmax] = coverRange([...vals(b.tempMin), ...vals(b.tempMax)], 25, 40, 5);
    const [cmin, cmax] = coverRange([...vals(b.cellMin), ...vals(b.cellMax)], 3.25, 3.35, 0.05);
    return {
      temp: { ymin: tmin, ymax: tmax, series: [{ pts: b.tempMax, color: COLORS.bat, w: 2 }, { pts: b.tempMin, color: BAT_2, w: 1.5 }] as LineSeries[] },
      cell: { ymin: cmin, ymax: cmax, series: [{ pts: b.cellMax, color: COLORS.bat, w: 2 }, { pts: b.cellMin, color: BAT_2, w: 1.5 }] as LineSeries[] },
    };
  }, [b]);

  if (!h) {
    return (
      <div style={{ padding: `${mobile ? 20 : 32}px ${pad}px 0` }}>
        <PageTitle mobile={mobile} title="Health" sub="สุขภาพระบบ · no 5-minute data loaded" />
      </div>
    );
  }

  const ok = h.alarms === 0 && /normal/i.test(h.state);
  const balancePct = h.mppt1Kwh > 0 ? Math.round((h.mppt2Kwh / h.mppt1Kwh) * 100) : null;
  const peakPct = inv.ratedW ? (h.peakW / inv.ratedW) * 100 : null;
  const range = dayRows.length ? `${dayRows[0].time.slice(11, 16)}–${dayRows[dayRows.length - 1].time.slice(11, 16)}` : "";
  const kpis: Kpi[] = withInfo(
    [
      { label: "String balance", th: "สมดุลสตริง", value: balancePct != null ? String(balancePct) : "—", unit: "%", sub: `MPPT2 ÷ MPPT1 ${today === latest ? "today" : dm(today)}` },
      {
        label: "Peak PV",
        th: "กำลังสูงสุด",
        value: (h.peakW / 1000).toFixed(2),
        unit: "kW",
        sub: peakPct != null ? `${hm(h.peakT)} · ${Math.round(peakPct)} % of ${inv.ratedW! / 1000} kW${peakPct >= 95 ? " · near clipping" : ""}` : `at ${hm(h.peakT)}`,
      },
      { label: "Inverter temp max", th: "อุณหภูมิสูงสุด", value: h.tempMax.toFixed(1), unit: "°C", sub: `at ${hm(h.tempMaxT)}` },
      { label: today === latest ? "Data today" : `Data ${dm(today)}`, th: "ความครบถ้วน", value: String(todayC.pct ?? "—"), unit: "%", sub: `${todayC.received} of ${todayC.expected} readings` },
    ],
    [
      ["Energy from string 2 (MPPT2) ÷ string 1 (MPPT1) today. Two equal strings sit near 100 %.", `MPPT1 ${h.mppt1Kwh.toFixed(1)} kWh · MPPT2 ${h.mppt2Kwh.toFixed(1)} kWh`],
      ["Highest total PV power (MPPT1 + MPPT2) in a 5-minute reading today.", peakPct != null ? "Near 95 % of the inverter's rated power it starts to clip (cap) output on bright days." : "Add ratedW to homes.json to compare with the inverter's rating."],
      ["Highest internal temperature the inverter reported today.", "Sustained readings above about 60 °C at midday reduce efficiency and lifespan; check ventilation."],
      ["5-minute readings received ÷ readings expected (one every 5 minutes; 288 for a full day).", "Below 100 % means the logger missed readings (Wi-Fi or cloud outage)."],
    ],
  );
  kpis[3].source = `${home.inverter.brand} 5-minute readings`;

  const lastText = nowT != null ? hm(nowT) : null;
  const completeness = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 1 }}>
      {days.map((d) => (
        <div
          key={d.date}
          className={d.pct == null ? "hatch" : undefined}
          title={d.pct == null ? `${dm(d.date)} · no data` : `${dm(d.date)} · ${d.received} of ${d.expected} readings`}
          style={{ display: "flex", flexDirection: "column", gap: 2, padding: mobile ? "6px 4px" : "8px 10px", minHeight: 52, background: d.pct == null ? undefined : completenessShade(d.pct) }}
        >
          <span style={{ fontSize: 11, fontWeight: 600 }}>{dm(d.date)}</span>
          <span className="tnum" style={{ fontSize: mobile ? 13 : 15, fontWeight: 800 }}>
            {d.pct == null ? "—" : `${d.pct} %`}
          </span>
        </div>
      ))}
    </div>
  );
  const lowDay = days.filter((d) => d.pct != null).reduce<(typeof days)[number] | null>((a, d) => (!a || d.pct! < a.pct! ? d : a), null);

  return (
    <>
      <div style={{ padding: `${mobile ? 20 : 32}px ${pad}px 0`, display: "flex", alignItems: mobile ? "stretch" : "flex-end", gap: mobile ? 12 : 24, flexDirection: mobile ? "column" : "row" }}>
        <div style={{ display: "flex", flexDirection: "column", marginRight: "auto" }}>
          <PageTitle
            mobile={mobile}
            title={today === latest ? "Health" : `Health · ${weekday(today)} ${dmy(today)}`}
            sub={["สุขภาพระบบ", [inv.brand, inv.model].filter(Boolean).join(" "), !mobile && inv.sn && `SN ${inv.sn}`, today === latest && (live ? "today" : dmy(today))].filter(Boolean).join(" · ")}
          />
          {mobile && inv.sn && (
            <span className="muted-72" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
              SN {inv.sn}
            </span>
          )}
        </div>
        <DateNav date={today} dates={model.dates} latest={latest} onGo={go} />
      </div>

      {/* Status summary: the family's question ("is it working?") first. */}
      <div style={{ margin: mobile ? "16px 0 0" : `24px ${pad}px 0`, borderTop: "2px solid var(--color-divider)", borderBottom: "2px solid var(--color-divider)", padding: "16px 20px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span style={{ display: "inline-flex", width: 32, height: 32, alignItems: "center", justifyContent: "center", background: "var(--color-text)", color: "var(--color-bg)", flex: "none" }}>
          {ok ? <Check size={18} /> : <TriangleAlert size={18} />}
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 22, lineHeight: "26px", fontWeight: 800 }}>{ok ? "Working normally" : `Needs a look · ${h.state}`}</span>
          <span className="th-sub">{ok ? "ทำงานปกติ" : "ควรตรวจสอบ"}</span>
          <span className="tnum" style={{ fontSize: 13, marginTop: 4 }}>
            {h.alarms} alarm{h.alarms === 1 ? "" : "s"}
            {h.alarmCodes.length ? ` (${h.alarmCodes.join(", ")})` : ""} · {todayC.received} of {todayC.expected} readings · {range}
          </span>
        </div>
      </div>
      <KpiGrid plain mobile={mobile} items={kpis} style={{ margin: mobile ? 0 : `0 ${pad}px`, borderTop: 0 }} />

      <div ref={pairRef} className="pair" style={{ margin: `${mobile ? 24 : 32}px ${pad}px 0` }}>
        <Section
          rule={false}
          en="String balance"
          th="สมดุลสตริง · MPPT2 ÷ MPPT1 while PV > 400 W"
          extra={
            <>
              <LegendRow>
                <Legend color={COLORS.pv} line>
                  Ratio
                </Legend>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <span style={{ width: 16, height: 10, background: "color-mix(in srgb, var(--color-text) 8%, transparent)" }} />
                  ±5 % normal
                </span>
              </LegendRow>
              <StateRow last={lastText} />
            </>
          }
          note={`Today MPPT1 ${h.mppt1Kwh.toFixed(1)} kWh · MPPT2 ${h.mppt2Kwh.toFixed(1)} kWh. If the line leaves the band for days, check that string for shade, dirt or a loose connector.`}
        >
          <DayLineChart daylight={sun} label="String balance, MPPT2 ÷ MPPT1" width={halfW} height={mobile ? 150 : 200} series={charts.ratio} ymin={80} ymax={120} step={20} fmt={pctFmt} nowT={nowT} bands={[{ lo: 95, hi: 105 }]} refs={[{ v: 100 }]} />
        </Section>
        <Section rule={mobile} en="Inverter temperature" th="อุณหภูมิอินเวอร์เตอร์ · °C · watch > 60 °C at midday" extra={<StateRow last={lastText} />}>
          <DayLineChart daylight={sun} label="Inverter temperature" width={halfW} height={mobile ? 130 : 200} series={charts.temp.series} ymin={charts.temp.ymin} ymax={charts.temp.ymax} step={5} fmt={deg} nowT={nowT} refs={[{ v: 60, dotted: true }]} />
        </Section>
      </div>

      {home.battery &&
        (batCharts ? (
          <div className="pair" style={{ margin: `${mobile ? 24 : 32}px ${pad}px 0` }}>
            <Section
              en="Battery temperature"
              th={`อุณหภูมิแบตเตอรี่ (BMS) · every 15 min${bmsFrom ? ` since ${dm(bmsFrom)}` : ""}`}
              extra={
                <LegendRow>
                  <Legend color={COLORS.bat} line>Warmest</Legend>
                  <Legend color={BAT_2} line weight={1.5}>Coolest</Legend>
                </LegendRow>
              }
              note={`${b!.hottest ? `Max ${b!.hottest.c} °C at ${hm(b!.hottest.t)}. ` : ""}LiFePO4 usually charges within 0–45 °C (check the datasheet); a pack much warmer than the room points to a hard-working or poorly ventilated battery.`}
            >
              <DayLineChart daylight={sun} label="Battery temperature" width={halfW} height={200} series={batCharts.temp.series} ymin={batCharts.temp.ymin} ymax={batCharts.temp.ymax} step={5} fmt={deg} nowT={bmsNowT} />
            </Section>
            <Section
              en="Battery cell voltage"
              th="แรงดันเซลล์สูงสุด/ต่ำสุด · V"
              extra={
                <LegendRow>
                  <Legend color={COLORS.bat} line>Highest cell</Legend>
                  <Legend color={BAT_2} line weight={1.5}>Lowest cell</Legend>
                </LegendRow>
              }
              note={`Cell spread ${b!.spreadMv ?? "—"} mV now, ${b!.maxSpreadMv ?? "—"} mV at most today. A spread that keeps growing, especially near full or empty, means the cells are drifting out of balance.`}
            >
              <DayLineChart daylight={sun} label="Battery cell voltage" width={halfW} height={200} series={batCharts.cell.series} ymin={batCharts.cell.ymin} ymax={batCharts.cell.ymax} step={0.05} fmt={cellV} nowT={bmsNowT} />
            </Section>
          </div>
        ) : (
          <Section
            style={{ margin: `${mobile ? 24 : 32}px ${pad}px 0` }}
            en="Battery (BMS)"
            th={bmsStart ? `แบตเตอรี่ · every 15 min since ${dm(bmsStart)} ${bmsStart.slice(11, 16)}` : "แบตเตอรี่ · logged every 15 min"}
            note={
              b
                ? `${b.samples} of ${SPARSE_MIN} samples. The charts appear after about 6 h of readings.`
                : bmsStart && today < bmsStart.slice(0, 10)
                  ? `Not tracked on this day: battery logging started ${dm(bmsStart)} ${bmsStart.slice(11, 16)} (the BMS reading is live-only, with no history).`
                  : today === latest
                    ? "No BMS samples today yet. The scheduled SolisCloud fetch logs one every 15 min."
                    : "No BMS samples on this day."
            }
          >
            {b && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--color-divider)", borderTop: "1px solid var(--color-text)", borderBottom: "1px solid var(--color-text)" }}>
                <Sparse
                  label="Temperature"
                  value={b.latest.temp_max_c != null ? String(b.latest.temp_max_c) : "—"}
                  unit="°C"
                  sub={`coolest ${b.latest.temp_min_c ?? "—"} °C · ${b.latest.time.slice(11, 16)}`}
                  samples={b.samples}
                  left
                />
                <Sparse
                  label="Cell spread"
                  value={b.spreadMv != null ? String(b.spreadMv) : "—"}
                  unit="mV"
                  sub={b.latest.cell_min_v != null && b.latest.cell_max_v != null ? `≈${((b.latest.cell_min_v + b.latest.cell_max_v) / 2).toFixed(2)} V · max today ${b.maxSpreadMv} mV` : "no cell readings"}
                  samples={b.samples}
                />
              </div>
            )}
          </Section>
        ))}

      <div className="pair" style={{ margin: `${mobile ? 24 : 32}px ${pad}px 0` }}>
        <Section en="State and alarms" th="สถานะการทำงาน · แจ้งเตือน" note={mobile ? undefined : "A new row appears whenever Working State or Alarm Code changes between 5-min readings."}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 13, borderTop: "1px solid var(--color-text)" }}>
            {log.map((r) => (
              <div key={r.from + r.state + r.code} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, borderBottom: "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)" }}>
                <span className="tnum" style={{ fontWeight: 600 }}>
                  {r.from}–{r.to}
                </span>
                <span className="tag-state">
                  {/normal/i.test(r.state) ? <Check size={10} /> : <TriangleAlert size={10} />}
                  {r.state}
                </span>
                <span className="muted-72" style={{ marginLeft: "auto" }}>
                  {r.code || "no code"} · {r.readings} readings
                </span>
              </div>
            ))}
          </div>
        </Section>
        {!mobile && (
          <Section en="Data completeness" th="ความครบถ้วนของข้อมูล · readings received ÷ expected (288/day)" note="Today counts against readings expected up to the last upload. Hatched = no data that day.">
            {completeness}
          </Section>
        )}
      </div>

      <HealthHistory rows={history} selected={today} onPick={go} mobile={mobile} ratedW={inv.ratedW} pad={pad} battery={!!home.battery} />

      <div ref={moreRef} style={{ margin: `${mobile ? 24 : 32}px ${pad}px 0`, borderTop: "2px solid var(--color-divider)" }}>
        <span className="muted-72" style={{ display: "block", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", padding: "12px 0 4px" }}>
          More detail
        </span>
        <details className="more">
          <summary>
            MPPT power and voltage<span className="meta">2 charts</span>
            <ChevronDown size={16} />
          </summary>
          <div className="pair" style={{ padding: "16px 0 8px" }}>
            <Section
              rule={false}
              en="MPPT1 vs MPPT2 power"
              th={`กำลังไฟแต่ละสตริง · ${dmy(today)}`}
              extra={
                <LegendRow>
                  <Legend color={COLORS.pv} line>MPPT1</Legend>
                  <Legend color={MPPT2} line weight={1.25}>MPPT2</Legend>
                </LegendRow>
              }
            >
              <DayLineChart daylight={sun} label="MPPT1 and MPPT2 power" width={moreHalf} height={200} series={charts.power.series} ymin={0} ymax={charts.power.ymax} step={1000} fmt={kw} nowT={nowT} />
            </Section>
            <Section rule={mobile} en="MPPT voltage" th="แรงดันแต่ละสตริง · V" note="Night readings (~22 V) are standby.">
              <DayLineChart daylight={sun} label="MPPT voltage" width={moreHalf} height={200} series={charts.volt.series} ymin={0} ymax={charts.volt.ymax} step={charts.volt.ymax / 4} fmt={volts} nowT={nowT} />
            </Section>
          </div>
        </details>
        {mobile && (
          <details className="more">
            <summary>
              Data completeness
              <span className="meta">{lowDay ? `14 days · low ${lowDay.pct} % (${dm(lowDay.date)})` : "14 days"}</span>
              <ChevronDown size={16} />
            </summary>
            <div style={{ padding: "12px 0 8px" }}>{completeness}</div>
          </details>
        )}
      </div>
    </>
  );
}

/** Sparse series (review 3b §5): latest value, range / time, one 6px square per sample. */
function Sparse({ label, value, unit, sub, samples, left }: { label: string; value: string; unit: string; sub: string; samples: number; left?: boolean }) {
  return (
    <div style={{ background: "var(--color-bg)", padding: left ? "10px 12px 10px 0" : "10px 0 10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
      <span className="tnum" style={{ fontSize: 28, lineHeight: "32px", fontWeight: 800 }}>
        {value}
        <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 3 }}>{unit}</span>
      </span>
      <span className="muted-72" style={{ fontSize: 11 }}>
        {sub}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
        {Array.from({ length: samples }, (_, i) => (
          <span key={i} style={{ width: 6, height: 6, background: COLORS.bat }} />
        ))}
      </div>
    </div>
  );
}

const HIST_ROWS = 30;

/**
 * Health history (one line per day with 5-minute data, newest first): status, alarms, string
 * balance, peak PV, inverter max, data completeness and — once logged — battery max. Values
 * outside the normal band get a warning tag. Tap / click a day to open it above.
 */
function HealthHistory({ rows, selected, onPick, mobile, ratedW, pad, battery }: { rows: HealthHistoryRow[]; selected: string; onPick: (d: string) => void; mobile: boolean; ratedW: number | null; pad: number; battery: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, HIST_ROWS);
  const issues = rows.filter((r) => !r.ok).length;
  const bal = (r: HealthHistoryRow) => (r.balance == null ? "—" : r.balance < 95 || r.balance > 105 ? <WarnTag>{r.balance} %</WarnTag> : `${r.balance} %`);
  const temp = (r: HealthHistoryRow) => (r.tempMax >= 60 ? <WarnTag>{r.tempMax.toFixed(1)} °C</WarnTag> : `${r.tempMax.toFixed(1)} °C`);
  const data = (r: HealthHistoryRow) => (r.pct < 95 ? <WarnTag>{r.pct} %</WarnTag> : `${r.pct} %`);
  const peak = (r: HealthHistoryRow) => `${(r.peakW / 1000).toFixed(2)} kW${ratedW && r.peakW >= 0.95 * ratedW ? " · clip" : ""}`;
  const status = (r: HealthHistoryRow) => (
    <span className="tag-state">
      {r.ok ? <Check size={10} /> : <TriangleAlert size={10} />}
      {r.ok ? "Normal" : r.alarms ? `${r.alarms} alarm${r.alarms === 1 ? "" : "s"}` : r.state}
    </span>
  );
  const cols = `1.2fr 1fr 0.9fr 1.1fr 0.9fr 0.8fr${battery ? " 0.8fr" : ""}`;
  const selStyle = (d: string): React.CSSProperties => (d === selected ? { background: "color-mix(in srgb, var(--color-text) 7%, transparent)" } : {});

  return (
    <Section
      style={{ margin: `${mobile ? 24 : 32}px ${pad}px 0` }}
      en="Health history"
      th={`ประวัติสุขภาพระบบ · ${rows.length} days with 5-minute data · ${issues ? `${issues} with a state change or alarm` : "all normal"}`}
      note="Tap a day to open it above. Tags mark values outside the usual range: string balance outside 95–105 %, inverter at 60 °C or more, data under 95 %."
    >
      {mobile ? (
        <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--color-text)" }}>
          {shown.map((r) => (
            <button
              key={r.date}
              type="button"
              className="mrow"
              onClick={() => onPick(r.date)}
              style={{ ...selStyle(r.date), background: selStyle(r.date).background ?? "none", border: 0, borderBottom: "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)", font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" }}
            >
              <span className="mrow-line">
                <span style={{ fontSize: 14, fontWeight: 600 }}>{`${weekday(r.date).slice(0, 3)} ${dm(r.date)}`}</span>
                {status(r)}
                <span className="mrow-num" style={{ fontSize: 13 }}>
                  {bal(r)}
                </span>
              </span>
              <span className="caption">
                Peak {peak(r)} · inverter {r.tempMax.toFixed(1)} °C · data {r.pct} %{r.batMax != null ? ` · battery ${r.batMax} °C` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", fontSize: 14 }}>
          <div className="tnum" style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "8px 8px", borderBottom: "1px solid var(--color-text)", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-72)" }}>
            <span>Date</span>
            <span>Status</span>
            <span style={{ textAlign: "right" }}>String balance</span>
            <span style={{ textAlign: "right" }}>Peak PV</span>
            <span style={{ textAlign: "right" }}>Inverter max</span>
            <span style={{ textAlign: "right" }}>Data</span>
            {battery && <span style={{ textAlign: "right" }}>Battery max</span>}
          </div>
          {shown.map((r) => (
            <button
              key={r.date}
              type="button"
              onClick={() => onPick(r.date)}
              className="tnum"
              style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: "7px 8px", border: 0, borderBottom: "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)", background: "none", font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer", ...selStyle(r.date) }}
            >
              <span style={{ fontWeight: r.date === selected ? 800 : 600 }}>{`${weekday(r.date).slice(0, 3)} ${dmy(r.date)}`}</span>
              <span>{status(r)}</span>
              <span style={{ textAlign: "right" }}>{bal(r)}</span>
              <span style={{ textAlign: "right" }}>{peak(r)}</span>
              <span style={{ textAlign: "right" }}>{temp(r)}</span>
              <span style={{ textAlign: "right" }}>{data(r)}</span>
              {battery && <span style={{ textAlign: "right" }}>{r.batMax != null ? `${r.batMax} °C` : <span className="muted-72">not logged</span>}</span>}
            </button>
          ))}
        </div>
      )}
      {rows.length > HIST_ROWS && (
        <button type="button" className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => setAll((a) => !a)}>
          {all ? `Show the last ${HIST_ROWS} days` : `Show all ${rows.length} days`}
        </button>
      )}
    </Section>
  );
}
