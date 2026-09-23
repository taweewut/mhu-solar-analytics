import { useMemo } from "react";
import { GroupedBarChart } from "@/components/GroupedBarChart";
import { KpiGrid, type Kpi } from "@/components/Kpis";
import { withInfo } from "@/lib/kpis";
import { PageTitle } from "@/components/ui";
import { GridRow, Legend, Section } from "@/components/ui2";
import { equivalentCycles, roundTrip, socFill, socHeatmap, sunriseReading, tempFill, tempHeatmap, type TempRow } from "@/lib/battery";
import { bmsSince } from "@/lib/health";
import type { BarGroup } from "@/lib/charts";
import { readingsFor, sumDaily } from "@/lib/energy";
import { dm, dmy, energyText, hm, minuteOfDay } from "@/lib/format";
import { useWidth } from "@/lib/layout";
import type { Model } from "@/lib/model";
import { COLORS } from "@/lib/sankey";
import { useHome } from "@/lib/home";
import { useTrendMode } from "@/lib/trendMode";
import { monthSlots } from "@/lib/trends";
import type { BmsRow, DailyRow, FiveMinRow } from "@/lib/types";

const DISCHARGED = "color-mix(in srgb, #3fa66a 45%, var(--color-bg))";
const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)} %`);

export function Battery({ mobile, fiveMin, daily, bms, model }: { mobile: boolean; fiveMin: FiveMinRow[]; daily: DailyRow[]; bms: BmsRow[]; model: Model }) {
  const { mode } = useTrendMode();
  const { home } = useHome();
  // This page is only offered for homes with a battery (lib/home routeAvailable).
  const battery = home.battery ?? { kwh: 1, label: "" };
  const per = mode === "day";
  const today = model.dates.at(-1) ?? model.asOf;
  const P = useMemo(() => readingsFor(fiveMin, today), [fiveMin, today]);
  const heat = useMemo(() => socHeatmap(fiveMin, today, 14), [fiveMin, today]);
  const tempHeat = useMemo(() => tempHeatmap(bms, today, 14), [bms, today]);
  const bmsFrom = useMemo(() => bmsSince(bms), [bms]);
  const lastBms = useMemo(() => bms.reduce<BmsRow | null>((a, r) => (!a || r.time > a.time ? r : a), null), [bms]);
  const slots = useMemo(() => monthSlots(daily), [daily]);
  const life = useMemo(() => sumDaily(daily), [daily]);
  const [barsRef, barsW] = useWidth<HTMLDivElement>();
  const pad = mobile ? 20 : 48;

  const last = P.at(-1);
  const rise = sunriseReading(P);
  const cycles = equivalentCycles(life.discharge, battery.kwh);
  const months = Math.round((Date.parse(model.asOf) - Date.parse(model.commissioned)) / 86_400_000 / 30.44);
  const kpis: Kpi[] = withInfo([
    { label: "SOC now", th: "ระดับแบตตอนนี้", value: last ? String(last.soc) : "—", unit: "%", sub: last ? `at ${hm(last.t)}` : "no 5-min data" },
    { label: "SOC at sunrise", th: "ระดับแบตตอนเช้า", value: rise ? String(rise.soc) : "—", unit: "%", sub: rise ? `first PV > 50 W at ${hm(rise.t)}` : "no PV > 50 W yet" },
    { label: "State of health", th: "สุขภาพแบต (SOH)", value: last?.soh != null ? String(Math.round(last.soh)) : "—", unit: "%", sub: `BMS reading · ${months} months in` },
    {
      label: "Equivalent cycles",
      th: "รอบเทียบเท่า",
      value: String(Math.round(cycles)),
      sub: `${(daily.length ? cycles / daily.length : 0).toFixed(2)} per day · ${energyText(life.discharge)} out`,
    },
    { label: "Round-trip", th: "ประสิทธิภาพไป-กลับ", value: pct(roundTrip(life.discharge, life.charge)).replace(" %", ""), unit: "%", sub: "lifetime discharge ÷ charge" },
  ], [
      ["Battery state of charge at the latest 5-minute reading."],
      ["State of charge when the sun came up: at the first reading with PV above 50 W.", "It shows how close the battery gets to empty overnight — a low number means the battery barely covers the night."],
      ["State of health: remaining capacity compared with new, reported by the battery's BMS.", "LiFePO4 typically loses 1–3 % a year."],
      [`Total discharged ÷ ${battery.kwh} kWh: how many times the battery has been fully emptied, in effect.`, "LiFePO4 is typically rated for 4,000–6,000 cycles."],
      ["Energy out ÷ energy in since switch-on (discharge ÷ charge).", "The rest is lost converting and storing it; around 90 % is normal for LiFePO4 plus the inverter."],
    ]);

  const groups = useMemo(
    () =>
      slots.map<BarGroup>((m) => {
        const d = m.data;
        const div = d && per ? d.days : 1;
        return {
          label: m.label,
          sub: d ? `${d.days} days` : "",
          top: d ? pct(roundTrip(d.fromBat, d.toBat)) : undefined,
          vals: d ? [{ v: d.toBat / div, color: COLORS.bat }, { v: d.fromBat / div, color: DISCHARGED }] : null,
        };
      }),
    [slots, per],
  );
  const barFmt = useMemo(() => (per ? (v: number) => v.toFixed(0) : (v: number) => Math.round(v).toLocaleString("en-US")), [per]);

  const loaded = heat.filter((r) => r.loaded);
  const heatNote =
    (loaded.length === 1
      ? `Only ${dmy(loaded[0].date)} is loaded. Earlier rows fill in when the daily 5-min backfill runs. `
      : loaded.length < heat.length
        ? `${loaded.length} of ${heat.length} days loaded; hatched days fill in when the 5-min backfill runs. `
        : "") + "Look for the morning low point: how close the battery gets to empty before sunrise.";

  return (
    <>
      <div style={{ padding: `${mobile ? 16 : 28}px ${pad}px 0` }}>
        <PageTitle mobile={mobile} title="Battery" sub={`แบตเตอรี่ · ${battery.label} · ≈${battery.kwh} kWh`} />
      </div>
      <KpiGrid plain mobile={mobile} items={kpis} style={{ margin: mobile ? "16px 0 0" : `20px ${pad}px 0` }} />

      <Section
        style={{ margin: `28px ${pad}px 0` }}
        en="State of charge by hour"
        th="ระดับแบตเตอรี่รายชั่วโมง · last 14 days"
        extra={
          <>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              0 %
              <span style={{ width: mobile ? 80 : 160, height: 10, background: "linear-gradient(90deg, color-mix(in srgb, #3fa66a 6%, var(--color-bg)), #3fa66a)" }} />
              100 %
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span className="hatch" style={{ width: 14, height: 10, border: "1px solid var(--color-divider)" }} />
              Not loaded yet
            </span>
          </>
        }
        note={heatNote}
      >
        <div className="heatmap" role="table" aria-label="Hourly mean state of charge, last 14 days">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="muted" style={{ fontSize: 10 }}>
              {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
            </span>
          ))}
          {heat.map((r) => (
            <HeatRowView key={r.date} row={r} mobile={mobile} />
          ))}
        </div>
      </Section>

      <Section
        style={{ margin: `28px ${pad}px 0` }}
        en="Battery temperature by hour"
        th="อุณหภูมิแบตเตอรี่รายชั่วโมง (BMS) · last 14 days"
        extra={
          <>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              20 °C
              <span style={{ width: mobile ? 80 : 160, height: 10, background: `linear-gradient(90deg, ${tempFill(20)}, ${tempFill(45)})` }} />
              45 °C
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span className="hatch" style={{ width: 14, height: 10, border: "1px solid var(--color-divider)" }} />
              Not logged
            </span>
          </>
        }
        note={
          (lastBms?.temp_max_c != null
            ? `Now ${lastBms.temp_min_c ?? "—"}–${lastBms.temp_max_c} °C (coolest–warmest sensor) at ${hm(minuteOfDay(lastBms.time))}. `
            : "") +
          `Warmest BMS sensor each hour, sampled every 15 min${bmsFrom ? ` since ${dmy(bmsFrom)}` : ""}. The BMS reading is live-only, so earlier days stay hatched. Compare with the SOC rows above: a pack that heats up while charging or discharging hard is working near its limits. LiFePO4 usually charges within 0–45 °C (check the datasheet).`
        }
      >
        <div className="heatmap" role="table" aria-label="Hourly warmest battery temperature, last 14 days">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="muted" style={{ fontSize: 10 }}>
              {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
            </span>
          ))}
          {tempHeat.map((r) => (
            <TempRowView key={r.date} row={r} mobile={mobile} />
          ))}
        </div>
      </Section>

      <div className="split" style={{ margin: `28px ${pad}px 0` }}>
        <Section
          en="Charge and discharge"
          th={`ชาร์จ · จ่ายไฟ · ${per ? "kWh / day" : "kWh / month"} · label = round-trip %`}
          extra={
            <>
              <Legend color={COLORS.bat}>Charged</Legend>
              <Legend color={DISCHARGED}>Discharged</Legend>
            </>
          }
        >
          <div ref={barsRef} className={mobile ? "hscroll" : undefined}>
            <GroupedBarChart label="Battery charge and discharge per month" width={mobile ? Math.max(barsW, slots.length * 80 + 70) : 768} height={300} groups={groups} fmt={barFmt} />
          </div>
        </Section>
        <Section en="Cycles and efficiency" th="รอบการใช้งาน · ประสิทธิภาพ" note={`Cycles = discharge ÷ ${battery.kwh} kWh. Round-trip = discharge ÷ charge per month; partial months include SOC carry-over.`}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 14 }}>
            <GridRow head cols="1fr 1fr 1fr">
              <span>Month</span>
              <span style={{ textAlign: "right" }}>Cycles</span>
              <span style={{ textAlign: "right" }}>Round-trip</span>
            </GridRow>
            {slots.map((m) => {
              const partial = m.data && (m.firstDay! > 1 || m.lastDay! < m.daysInMonth) ? ` (${m.firstDay}–${m.lastDay})` : "";
              return (
                <GridRow key={m.key} cols="1fr 1fr 1fr">
                  <span style={{ fontWeight: 600 }}>
                    {m.label}
                    {partial}
                  </span>
                  <span style={{ textAlign: "right" }}>{m.data ? equivalentCycles(m.data.fromBat, battery.kwh).toFixed(1) : "—"}</span>
                  <span style={{ textAlign: "right" }}>{m.data ? pct(roundTrip(m.data.fromBat, m.data.toBat)) : <span className="muted">not loaded</span>}</span>
                </GridRow>
              );
            })}
          </div>
        </Section>
      </div>
    </>
  );
}

function HeatRowView({ row, mobile }: { row: ReturnType<typeof socHeatmap>[number]; mobile: boolean }) {
  const day = dm(row.date);
  return (
    <>
      <span style={{ fontSize: mobile ? 11 : 12, fontWeight: 600, alignSelf: "center", whiteSpace: "nowrap" }}>
        {row.today ? (mobile ? "Today" : `${day} · today`) : day}
      </span>
      {row.cells.map((c, h) => {
        const hh = `${String(h).padStart(2, "0")}:00`;
        if (c.kind === "soc")
          return (
            <div key={h} className="heat-cell" title={`${day} ${hh} · SOC ${c.soc} %`} style={{ background: socFill(c.soc), color: c.soc > 60 ? "#0f2d1b" : "var(--color-text)" }}>
              <span style={{ fontSize: 10, fontWeight: 600 }}>{h % 3 === 0 ? c.soc : ""}</span>
            </div>
          );
        if (c.kind === "future") return <div key={h} className="heat-cell" title={`${day} ${hh} · later today`} style={{ background: "var(--color-surface)" }} />;
        return <div key={h} className="heat-cell hatch" title={row.loaded ? `${day} ${hh} · no readings` : `${day} · not loaded`} />;
      })}
    </>
  );
}

function TempRowView({ row, mobile }: { row: TempRow; mobile: boolean }) {
  const day = dm(row.date);
  return (
    <>
      <span style={{ fontSize: mobile ? 11 : 12, fontWeight: 600, alignSelf: "center", whiteSpace: "nowrap" }}>
        {row.today ? (mobile ? "Today" : `${day} · today`) : day}
      </span>
      {row.cells.map((c, h) => {
        const hh = `${String(h).padStart(2, "0")}:00`;
        if (c.kind === "temp")
          return (
            <div key={h} className="heat-cell" title={`${day} ${hh} · warmest ${c.c} °C`} style={{ background: tempFill(c.c), color: c.c > 36 ? "#3a1a05" : "var(--color-text)" }}>
              <span style={{ fontSize: 10, fontWeight: 600 }}>{h % 3 === 0 ? Math.round(c.c) : ""}</span>
            </div>
          );
        if (c.kind === "future") return <div key={h} className="heat-cell" title={`${day} ${hh} · later today`} style={{ background: "var(--color-surface)" }} />;
        return <div key={h} className="heat-cell hatch" title={row.loaded ? `${day} ${hh} · no sample` : `${day} · not logged`} />;
      })}
    </>
  );
}
