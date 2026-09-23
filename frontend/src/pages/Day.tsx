import { useMemo } from "react";
import { DayPowerChart } from "@/components/DayPowerChart";
import { daylight } from "@/lib/battery";
import { Calendar, ChevronLeft, ChevronRight } from "@/components/Icons";
import { Sankey } from "@/components/Sankey";
import { Dot, PageTitle, SectionTitle, Swatch } from "@/components/ui";
import { dayStats, kw2 } from "@/lib/dayChart";
import { dayTotals, daySplit, flowsFrom, readingsFor } from "@/lib/energy";
import { dmy, hm, weekday } from "@/lib/format";
import { useWidth } from "@/lib/layout";
import type { Model } from "@/lib/model";
import { navigate } from "@/lib/router";
import { COLORS } from "@/lib/sankey";
import type { FiveMinRow } from "@/lib/types";

interface Props {
  mobile: boolean;
  fiveMin: FiveMinRow[];
  model: Model;
  date: string | null;
}

export function Day({ mobile, fiveMin, model, date: requested }: Props) {
  const today = model.dates.at(-1) ?? model.asOf;
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;
  const isToday = date === today;
  const go = (d: string) => navigate("day", d === today ? undefined : { d });

  const P = useMemo(() => readingsFor(fiveMin, date), [fiveMin, date]);
  // That day's own sunrise / sunset once it's over; while it's in progress (or had no sun),
  // the median of the 14 days before it.
  const sun = useMemo(() => daylight(fiveMin, date, 1) ?? daylight(fiveMin, date, 14), [fiveMin, date]);
  const totals = useMemo(() => dayTotals(fiveMin, date), [fiveMin, date]);
  const stats = useMemo(() => dayStats(P), [P]);
  const flows = useMemo(() => (totals ? flowsFrom(totals, "stored", daySplit(totals)) : null), [totals]);
  const [chartRef, chartW] = useWidth<HTMLDivElement>();
  const [skRef, skW] = useWidth<HTMLDivElement>();

  const pad = mobile ? 20 : 48;
  // Prev / next step between days that have 5-min data.
  const prev = model.dates.filter((d) => d < date).at(-1);
  const upTo = totals ? hm(totals.lastT) : "";

  const kwhv = (v: number) => `${v.toFixed(1)} kWh`;
  const rows =
    totals && stats
      ? [
          { label: "Solar PV · ผลิตได้", val: kwhv(totals.pv), color: COLORS.pv },
          { label: "Home load · ใช้ในบ้าน", val: kwhv(totals.load), color: COLORS.load },
          { label: "Backup / Grid-load port", val: `${totals.backupLoad.toFixed(1)} / ${totals.gridLoad.toFixed(1)} kWh`, color: COLORS.load },
          { label: "Battery charge · ชาร์จ", val: kwhv(totals.charge), color: COLORS.bat },
          { label: "Battery discharge · จ่าย", val: kwhv(totals.discharge), color: COLORS.bat },
          { label: "Grid import · ซื้อไฟ", val: kwhv(totals.gridImport), color: COLORS.grid },
          { label: `SOC at sunrise · ${hm(stats.sunrise.t)}`, val: `${stats.sunrise.soc} %`, color: COLORS.bat },
          {
            label: `SOC low · ${hm(stats.low.t)}${stats.full ? ` → full ${hm(stats.full.t)}` : ""}`,
            val: `${stats.low.soc} → ${stats.last.soc} %`,
            color: COLORS.bat,
          },
          { label: `Peak PV · ${hm(stats.peak.t)}`, val: kw2(stats.peak.pv), color: COLORS.pv },
          { label: "Inverter temp max", val: `${stats.tempMax.toFixed(1)} °C`, color: COLORS.loss },
        ]
      : [];

  return (
    <>
      <div style={{ padding: `${mobile ? 16 : 28}px ${pad}px 0`, display: "flex", alignItems: mobile ? "stretch" : "flex-end", gap: mobile ? 12 : 24, flexDirection: mobile ? "column" : "row" }}>
        <PageTitle
          mobile={mobile}
          title={`Day · ${weekday(date)} ${dmy(date)}`}
          sub={totals ? `รายวัน · 5-minute data · ${totals.count} readings to ${upTo}` : "รายวัน · 5-minute data · no readings"}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-secondary btn-icon" aria-label="Previous day" disabled={!prev} onClick={() => prev && go(prev)}>
            <ChevronLeft />
          </button>
          <label className="input date-field" style={{ display: "flex", alignItems: "center", gap: 8, width: 170, minHeight: 36 }}>
            <Calendar />
            {dmy(date)}
            <input
              type="date"
              aria-label="Date"
              value={date}
              min={model.dates[0]}
              max={today}
              onChange={(e) => e.target.value && go(e.target.value)}
            />
          </label>
          <button className="btn btn-secondary btn-icon" aria-label="Next day" disabled={date >= today} onClick={() => go(model.dates.find((d) => d > date) ?? today)}>
            <ChevronRight />
          </button>
          <button className="btn btn-primary" onClick={() => go(today)}>
            Today
          </button>
        </div>
      </div>

      <div style={{ margin: `20px ${pad}px 0`, borderTop: "2px solid var(--color-divider)", paddingTop: 16, display: "flex", gap: mobile ? "8px 16px" : 24, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
        <span style={{ fontWeight: 800 }}>Power · กำลังไฟ</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Swatch color={COLORS.pv} />Solar PV</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Swatch color={COLORS.bat} />Battery (+ charge / − discharge)</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Swatch color={COLORS.grid} />Grid import</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Swatch color={COLORS.load} h={3} />Home load</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, borderTop: "2px dashed var(--color-text)" }} />SOC % (right axis)</span>
      </div>

      <div ref={chartRef} style={{ margin: `8px ${pad}px 0` }}>
        {P.length ? (
          <DayPowerChart P={P} date={date} width={chartW} height={mobile ? 280 : 340} live={isToday} daylight={sun} />
        ) : (
          <div className="state muted">No 5-minute data for {dmy(date)}. Export the inverter history for that day and run fetch_solis_day.py.</div>
        )}
      </div>

      {totals && flows && (
        <div className="split" style={{ margin: `28px ${pad}px 0`, borderTop: "2px solid var(--color-divider)", paddingTop: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <SectionTitle
              en={isToday ? "Flow so far today" : `Flow on ${dmy(date)}`}
              th={`${isToday ? "การไหลของพลังงานวันนี้" : "การไหลของพลังงาน"} · 00:00–${upTo}`}
            />
            <div ref={skRef}>
              <Sankey flows={flows} width={skW} height={mobile ? 290 : 300} variant={mobile ? "mobile" : "day"} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionTitle en="Day totals" th={isToday ? "สรุปวันนี้" : "สรุปรายวัน"} />
            <div style={{ display: "flex", flexDirection: "column", borderTop: "2px solid var(--color-divider)" }}>
              {rows.map((r) => (
                <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 14 }}>
                  <Dot color={r.color} />
                  <span style={{ marginRight: "auto" }}>{r.label}</span>
                  <span className="tnum" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
