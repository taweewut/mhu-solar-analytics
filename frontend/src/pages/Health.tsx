import { useMemo } from "react";
import { DayLineChart } from "@/components/DayLineChart";
import { KpiGrid, type Kpi } from "@/components/Kpis";
import { withInfo } from "@/lib/kpis";
import { PageTitle } from "@/components/ui";
import { GridRow, Legend, Section } from "@/components/ui2";
import { coverRange, type LineSeries } from "@/lib/charts";
import { readingsFor } from "@/lib/energy";
import { dm, dmy, hm, minuteOfDay } from "@/lib/format";
import { completenessFor, healthDay, stateLog } from "@/lib/health";
import { useWidth } from "@/lib/layout";
import type { Model } from "@/lib/model";
import { COLORS } from "@/lib/sankey";
import { useHome } from "@/lib/home";
import type { FiveMinRow } from "@/lib/types";

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const kw = (v: number) => `${v / 1000} kW`;
const volts = (v: number) => `${Math.round(v)} V`;
const deg = (v: number) => `${v} °C`;

export function Health({ mobile, fiveMin, model }: { mobile: boolean; fiveMin: FiveMinRow[]; model: Model }) {
  const { home } = useHome();
  const inv = home.inverter;
  const today = model.dates.at(-1) ?? model.asOf;
  const P = useMemo(() => readingsFor(fiveMin, today), [fiveMin, today]);
  const h = useMemo(() => healthDay(fiveMin, today), [fiveMin, today]);
  const dayRows = useMemo(() => fiveMin.filter((r) => r.time.startsWith(today)), [fiveMin, today]);
  const log = useMemo(() => stateLog(dayRows), [dayRows]);
  const last = P.at(-1);
  // The latest day is still in progress until its 23:55 reading arrives.
  const live = last != null && last.t < 1435;
  const nowT = live ? last!.t : null;
  const days = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)).map((d) => completenessFor(fiveMin, d, live && d === today)),
    [fiveMin, today, live],
  );
  const todayC = days[days.length - 1];
  const [mainRef, mainW] = useWidth<HTMLDivElement>();
  const [pairRef, pairW] = useWidth<HTMLDivElement>();
  const pad = mobile ? 20 : 48;
  const halfW = mobile ? pairW : (pairW - 32) / 2;

  const charts = useMemo(() => {
    const pmax = Math.max(1000, Math.ceil(Math.max(0, ...P.map((p) => Math.max(p.mppt1, p.mppt2))) / 1000) * 1000);
    const vRows = dayRows.map((r) => [r.mppt1_v, r.mppt2_v]).flat().filter((v): v is number => v != null);
    const vmax = Math.max(100, Math.ceil(Math.max(0, ...vRows) / 100) * 100);
    const temps = P.map((p) => p.temp);
    const [tmin, tmax] = coverRange(temps, 40, 60, 5);
    const at = (f: (r: FiveMinRow) => number | null) => dayRows.map((r) => [minuteOfDay(r.time), f(r)] as [number, number | null]);
    return {
      power: {
        ymax: pmax,
        series: [
          { pts: P.map((p) => [p.t, p.mppt1]), color: COLORS.pv, w: 2 },
          { pts: P.map((p) => [p.t, p.mppt2]), color: COLORS.pv, w: 2, dash: "5 4" },
        ] as LineSeries[],
      },
      volt: {
        ymax: vmax,
        series: [
          { pts: at((r) => r.mppt1_v), color: COLORS.pv },
          { pts: at((r) => r.mppt2_v), color: COLORS.pv, dash: "5 4" },
        ] as LineSeries[],
      },
      temp: { ymin: tmin, ymax: tmax, series: [{ pts: P.map((p) => [p.t, p.temp]), color: "var(--color-text)" }] as LineSeries[] },
    };
  }, [P, dayRows]);

  if (!h) {
    return (
      <div style={{ padding: `${mobile ? 16 : 28}px ${pad}px 0` }}>
        <PageTitle mobile={mobile} title="Health" sub="สุขภาพระบบ · no 5-minute data loaded" />
      </div>
    );
  }

  const peakPct = inv.ratedW ? (h.peakW / inv.ratedW) * 100 : null;
  const kpis: Kpi[] = withInfo([
    { label: "Working state", th: "สถานะ", value: h.state, sub: `${Math.round(h.stateShare * 100)} % of readings today` },
    {
      label: "Alarms",
      th: "แจ้งเตือน",
      value: String(h.alarms),
      sub: h.alarms ? `code${h.alarmCodes.length > 1 ? "s" : ""} ${h.alarmCodes.join(", ")}` : "no alarm codes in export",
    },
    {
      label: peakPct != null ? "Peak PV vs rated" : "Peak PV",
      th: "กำลังสูงสุด",
      value: (h.peakW / 1000).toFixed(2),
      unit: "kW",
      sub:
        peakPct != null
          ? `${Math.round(peakPct)} % of ${inv.ratedW! / 1000} kW at ${hm(h.peakT)} · ${peakPct >= 95 ? "near clipping" : "no clipping"}`
          : `at ${hm(h.peakT)} · rated power not in homes.json`,
    },
    { label: "Inverter temp max", th: "อุณหภูมิอินเวอร์เตอร์", value: h.tempMax.toFixed(1), unit: "°C", sub: `at ${hm(h.tempMaxT)}` },
    {
      label: "Data today",
      th: "ความครบถ้วน",
      value: String(todayC.pct ?? "—"),
      unit: "%",
      sub: `${todayC.received} of ${todayC.expected} readings expected${live ? " so far" : ""}`,
    },
  ], [
      ["The inverter's reported state in its 5-minute readings today, and the share of readings in that state.", "Any change of state or alarm (e.g. Fault) shows in the log below."],
      ["Readings today with an alarm code. The codes and when they happened are in the log below; look them up in the inverter manual."],
      ["Highest total PV power (MPPT1 + MPPT2) in a 5-minute reading today.", peakPct != null ? "Near 95 % of the inverter's rated power it starts to clip (cap) output on bright days." : "Add ratedW to homes.json to compare with the inverter's rating."],
      ["Highest internal temperature the inverter reported today.", "Sustained readings above about 60 °C at midday reduce efficiency and lifespan; check ventilation."],
      ["5-minute readings received ÷ readings expected (one every 5 minutes; 288 for a full day).", "Below 100 % means the logger missed readings (Wi-Fi or cloud outage)."],
    ]);
  const balance =
    `Energy today · MPPT1 ${h.mppt1Kwh.toFixed(1)} kWh · MPPT2 ${h.mppt2Kwh.toFixed(1)} kWh` +
    (h.mppt1Kwh > 0 ? ` · MPPT2 / MPPT1 = ${Math.round((h.mppt2Kwh / h.mppt1Kwh) * 100)} %` : "") +
    ". A persistent drop in one string (shading, soiling, a failed connector) shows up here first.";

  return (
    <>
      <div style={{ padding: `${mobile ? 16 : 28}px ${pad}px 0` }}>
        <PageTitle mobile={mobile} title="Health" sub={["สุขภาพระบบ", [inv.brand, inv.model].filter(Boolean).join(" "), inv.sn && `SN ${inv.sn}`, live ? "today" : dmy(today)].filter(Boolean).join(" · ")} />
      </div>
      <KpiGrid plain mobile={mobile} items={kpis} style={{ margin: mobile ? "16px 0 0" : `20px ${pad}px 0` }} />

      <Section
        style={{ margin: `28px ${pad}px 0` }}
        en="MPPT1 vs MPPT2 power"
        th={`กำลังไฟแต่ละสตริง · ${dmy(today)}`}
        extra={
          <>
            <Legend color={COLORS.pv} line>MPPT1</Legend>
            <Legend color={COLORS.pv} line dashed>MPPT2</Legend>
          </>
        }
        note={balance}
      >
        <div ref={mainRef}>
          <DayLineChart label="MPPT1 and MPPT2 power" width={mainW} height={260} series={charts.power.series} ymin={0} ymax={charts.power.ymax} step={1000} fmt={kw} nowT={nowT} />
        </div>
      </Section>

      <div ref={pairRef} className="pair" style={{ margin: `28px ${pad}px 0` }}>
        <Section en="MPPT voltage" th="แรงดันแต่ละสตริง · V" note="MPPT1 solid, MPPT2 dashed. Night readings (~22 V) are standby.">
          <DayLineChart label="MPPT voltage" width={halfW} height={220} series={charts.volt.series} ymin={0} ymax={charts.volt.ymax} step={charts.volt.ymax / 4} fmt={volts} nowT={nowT} />
        </Section>
        <Section en="Inverter temperature" th="อุณหภูมิภายในอินเวอร์เตอร์ · °C" note="Internal ambient sensor. Watch for sustained readings above 60 °C at midday.">
          <DayLineChart label="Inverter temperature" width={halfW} height={220} series={charts.temp.series} ymin={charts.temp.ymin} ymax={charts.temp.ymax} step={5} fmt={deg} nowT={nowT} />
        </Section>
      </div>

      <div className="pair" style={{ margin: `28px ${pad}px 0` }}>
        <Section en="Working state and alarms" th="สถานะการทำงาน · แจ้งเตือน" note="A new row appears whenever Working State or Alarm Code changes between 5-min readings.">
          <div style={{ display: "flex", flexDirection: "column", fontSize: 14 }}>
            <GridRow head cols="1.3fr 1fr 0.8fr 1fr">
              <span>Time</span>
              <span>State</span>
              <span>Alarm code</span>
              <span style={{ textAlign: "right" }}>Readings</span>
            </GridRow>
            {log.map((r) => (
              <GridRow key={r.from + r.state + r.code} cols="1.3fr 1fr 0.8fr 1fr">
                <span style={{ fontWeight: 600 }}>
                  {r.from} – {r.to}
                </span>
                <span>
                  <span className={r.state === "Normal" ? "tag tag-neutral" : "tag tag-accent"} style={{ gap: 6 }}>
                    <span style={{ width: 6, height: 6, background: r.state === "Normal" ? COLORS.bat : "var(--color-accent)" }} />
                    {r.state}
                  </span>
                </span>
                <span>{r.code || "—"}</span>
                <span style={{ textAlign: "right" }}>{r.readings}</span>
              </GridRow>
            ))}
          </div>
        </Section>
        <Section en="Data completeness" th="ความครบถ้วนของข้อมูล · readings received ÷ expected (288/day)" note="Today counts against readings expected up to the last upload. Hatched = day not loaded yet.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 2 }}>
            {days.map((d) => (
              <div
                key={d.date}
                className={d.pct == null ? "hatch" : undefined}
                title={d.pct == null ? `${dm(d.date)} · not loaded` : `${dm(d.date)} · ${d.received} of ${d.expected} readings`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  padding: mobile ? "6px 4px" : "8px 10px",
                  minHeight: 56,
                  background: d.pct == null ? undefined : "color-mix(in srgb, #3fa66a 30%, var(--color-bg))",
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 600 }}>{dm(d.date)}</span>
                <span className="tnum" style={{ fontSize: mobile ? 13 : 15, fontWeight: 800 }}>{d.pct == null ? "—" : `${d.pct} %`}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
