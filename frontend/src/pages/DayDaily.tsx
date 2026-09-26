import { useMemo } from "react";
import { DateNav } from "@/components/DateNav";
import { KpiGrid, type Kpi } from "@/components/Kpis";
import { Sankey } from "@/components/Sankey";
import { Dot, PageTitle, SectionTitle } from "@/components/ui";
import { EstTag } from "@/components/ui2";
import { WeatherStrip } from "@/components/Weather";
import { dayReport, reportDates, AVG_WINDOW } from "@/lib/dayReport";
import { estimateNote } from "@/lib/estimate";
import { dmy, kwh, thb, weekday } from "@/lib/format";
import { describeGap, gapOn } from "@/lib/gaps";
import { useHome } from "@/lib/home";
import { useWidth } from "@/lib/layout";
import type { Model } from "@/lib/model";
import { navigate } from "@/lib/router";
import { COLORS, type Flows } from "@/lib/sankey";
import { useSettings } from "@/lib/settings";
import type { DailyRow, WeatherRow } from "@/lib/types";
import { daySummary, weatherDay, type WeatherHour } from "@/lib/weather";

interface Props {
  mobile: boolean;
  /** Cleaned daily rows (with outage estimates when they're on in Settings). */
  daily: DailyRow[];
  model: Model;
  date: string | null;
  /** Hourly site weather (empty for a home without a location). */
  weather?: WeatherRow[];
}

// The measured pieces are their own components: they only mount on days that have them (a day
// without weather or meter values leaves them out), and useWidth measures on mount.

/** The day's 24 hours of site weather, one icon per hour, over an hour axis. */
function WeatherHours({ hours, compact }: { hours: WeatherHour[]; compact: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  return (
    <div ref={ref} style={{ marginTop: 12 }}>
      {w > 0 && (
        <>
          <WeatherStrip hours={hours} left={0} width={w} compact={compact} />
          <div style={{ position: "relative", height: 16, borderTop: "1px solid var(--color-divider)" }}>
            {[0, 6, 12, 18, 24].map((h) => (
              <span key={h} className="abs muted-72 tnum" style={{ left: (h / 24) * w, top: 2, transform: h === 0 ? undefined : h === 24 ? "translateX(-100%)" : "translateX(-50%)", fontSize: 10 }}>
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DaySankey({ flows, mobile }: { flows: Flows; mobile: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  return (
    <div ref={ref}>
      <Sankey flows={flows} width={w} height={mobile ? 290 : 300} variant={mobile ? "mobile" : "day"} />
    </div>
  );
}

const SS_INFO ="Self-sufficiency = 1 − grid import ÷ home load: the share of the home's electricity that didn't come from the grid.";
const signedPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)} %`;

/**
 * The Day page for a home without 5-minute data (MhuHome): one day of the inverter's daily
 * report — no power curve, but the day's totals, its energy flow and the site weather. The
 * newest day is yesterday (FusionSolar's month-to-date email, imported each morning).
 */
export function DayDaily({ mobile, daily, model, date: requested, weather = [] }: Props) {
  const { home } = useHome();
  const { settings } = useSettings();
  const dates = useMemo(() => reportDates(daily), [daily]);
  const latest = dates.at(-1) ?? model.asOf;
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : latest;
  const go = (d: string) => navigate("day", d === latest ? undefined : { d });

  const rep = useMemo(() => dayReport(daily, date, home.kwp, home.battery != null), [daily, date, home.kwp, home.battery]);
  const wx = useMemo(() => weatherDay(weather, date), [weather, date]);
  const wxDay = useMemo(() => daySummary(wx), [wx]);
  const hasWx = wx.some((x) => x.cond);
  const gap = gapOn(home.dataGaps, date);

  const pad = mobile ? 20 : 48;
  const portal = `${home.inverter.brand} daily report`;
  const t = rep?.totals;
  const note = rep?.estimated ? estimateNote(rep.row, home.utility) : "";
  const source = rep?.estimated ? `Estimated: ${note}` : `${portal}, ${dmy(date)}`;

  const kpis: Kpi[] =
    rep && t
      ? [
          {
            label: "Solar produced",
            th: "ผลิตได้",
            value: kwh(t.pv),
            unit: "kWh",
            sub: `${rep.specific.toFixed(2)} kWh/kWp` + (rep.vsAvg != null ? ` · ${signedPct(rep.vsAvg)} vs ${AVG_WINDOW}-day avg` : ""),
            info: [
              "What the panels produced on this day, from the inverter's daily report.",
              `kWh/kWp = solar ÷ the system size (${home.kwp} kWp), comparable between systems. ${AVG_WINDOW}-day avg = the mean of the measured days in the ${AVG_WINDOW} days before.`,
            ],
            source,
          },
          {
            label: "Home used",
            th: "ใช้ในบ้าน",
            value: rep.metered ? kwh(t.load) : "—",
            unit: rep.metered ? "kWh" : undefined,
            sub: rep.metered ? `${kwh(Math.max(0, t.load - t.gridImport - t.discharge))} from solar · ${kwh(t.gridImport)} from the grid` : "No meter reading this day",
            info: ["Electricity the home used: solar used directly + grid import, as measured by the inverter's meter."],
            source,
          },
          {
            label: "Grid import",
            th: "ซื้อไฟ",
            value: rep.metered ? kwh(t.gridImport) : "—",
            unit: rep.metered ? "kWh" : undefined,
            sub: rep.metered ? `≈ ${thb(t.gridImport * settings.effectiveRate)} at ${settings.effectiveRate.toFixed(2)} ฿/kWh` : "No meter reading this day",
            info: [
              `Electricity bought from ${home.utility} on this day, measured by the inverter's meter.`,
              `≈ ฿ = kWh × the effective rate in Settings (${settings.effectiveRate.toFixed(2)} ฿/kWh).`,
            ],
            source,
          },
          {
            label: "Self-sufficiency",
            th: "พึ่งพาตัวเอง",
            value: rep.ss != null ? String(rep.ss) : "—",
            unit: rep.ss != null ? "%" : undefined,
            sub: rep.ss != null ? `${rep.ss} % of the home ran on the sun` : "No meter reading this day",
            info: [SS_INFO],
            source,
          },
        ]
      : [];

  const exported = (t?.export ?? 0) > 0;
  const details = rep
    ? [
        ...(wxDay ? [{ label: "Weather · อากาศ", val: wxDay.en, color: "var(--color-text)" }] : []),
        ...(exported ? [{ label: "Export · ส่งไฟคืนกริด", val: `${kwh(t!.export!)} kWh`, color: COLORS.pv }] : []),
        ...(rep.selfUse != null ? [{ label: "Solar used at home · ใช้เอง", val: `${rep.selfUse} %`, color: COLORS.pv }] : []),
        { label: "Specific yield · ต่อ kWp", val: `${rep.specific.toFixed(2)} kWh/kWp`, color: COLORS.pv },
        ...(rep.avg != null
          ? [{ label: `vs ${AVG_WINDOW}-day average · เทียบค่าเฉลี่ย`, val: `${signedPct(rep.vsAvg!)} (avg ${rep.avg.toFixed(1)} kWh)`, color: COLORS.pv }]
          : []),
      ]
    : [];

  return (
    <>
      <div style={{ padding: `${mobile ? 16 : 28}px ${pad}px 0`, display: "flex", alignItems: mobile ? "stretch" : "flex-end", gap: mobile ? 12 : 24, flexDirection: mobile ? "column" : "row" }}>
        <PageTitle mobile={mobile} title={`Day · ${weekday(date)} ${dmy(date)}`} sub={`รายวัน · ${portal} · newest day ${dmy(latest)}`} />
        <DateNav date={date} dates={dates} latest={latest} onGo={go} latestLabel="Latest" />
      </div>

      {!rep ? (
        <div className="hatch" style={{ margin: `20px ${pad}px 0`, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--color-divider)" }}>
          <div style={{ background: "var(--color-bg)", padding: "12px 16px", textAlign: "center", maxWidth: 420 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>No data for {dmy(date)}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {gap ? `${describeGap(gap)}: the panels kept working, but no readings reached the cloud.` : date > latest ? `The newest day in the ${portal} is ${dmy(latest)}.` : `The ${portal} has no values for this day.`}
            </div>
            {gap?.reasonTh && (
              <div className="muted" style={{ fontSize: 12 }}>
                {gap.reasonTh}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {rep.estimated && (
            <div className="caption" style={{ margin: `16px ${pad}px 0`, display: "flex", alignItems: "center", gap: 6 }}>
              <EstTag style={{ marginLeft: 0 }} />
              This day is an estimate ({note}); switch estimates off in Settings.
            </div>
          )}
          <KpiGrid items={kpis} mobile={mobile} plain style={{ margin: `20px ${pad}px 0` }} />

          {hasWx && (
            <div style={{ margin: `28px ${pad}px 0`, borderTop: "2px solid var(--color-divider)", paddingTop: 16 }}>
              <SectionTitle en={wxDay ? `Weather · ${wxDay.en}` : "Weather"} th={wxDay ? `อากาศ · ${wxDay.th}` : "อากาศ"} />
              <WeatherHours hours={wx} compact={mobile} />
              <div className="caption" style={{ marginTop: 6 }}>
                Hourly icons are Open-Meteo model data for the site (≈1 km), not a local sensor. Hover an icon for cloud cover, rain and sunlight.
              </div>
            </div>
          )}

          <div className="split" style={{ margin: `28px ${pad}px 0`, borderTop: "2px solid var(--color-divider)", paddingTop: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <SectionTitle en={`Flow on ${dmy(date)}`} th="การไหลของพลังงาน · ทั้งวัน" />
              {rep.flows ? (
                <DaySankey flows={rep.flows} mobile={mobile} />
              ) : (
                <div className="state muted">No meter reading on {dmy(date)}: the report has solar only, so the flow can't be drawn.</div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <SectionTitle en="Day details" th="รายละเอียดรายวัน" />
              <div style={{ display: "flex", flexDirection: "column", borderTop: "2px solid var(--color-divider)" }}>
                {details.map((r) => (
                  <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 14 }}>
                    <Dot color={r.color} />
                    <span style={{ marginRight: "auto" }}>{r.label}</span>
                    <span className="tnum" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                      {r.val}
                    </span>
                  </div>
                ))}
              </div>
              <div className="caption">This home has no 5-minute data, so the Day view shows the {portal}: one row per day, the newest usually yesterday.</div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
