import { useMemo, useState } from "react";
import { GroupedBarChart } from "@/components/GroupedBarChart";
import { ChevronLeft, ChevronRight } from "@/components/Icons";
import { EstLegend, EstTag, Legend, LegendRow, Section } from "@/components/ui2";
import type { BarGroup } from "@/lib/charts";
import { downloadCsv, toCsv } from "@/lib/csv";
import { dm, MONTH_ABBR, MONTH_FULL } from "@/lib/format";
import { estimateNote, isEstimated, type EstimatedRow } from "@/lib/estimate";
import { describeGap, gapOn } from "@/lib/gaps";
import { useHome } from "@/lib/home";
import { useWidth } from "@/lib/layout";
import { dataMonths, monthDays, monthTotal, type DayRow } from "@/lib/monthDays";
import { href } from "@/lib/router";
import { COLORS } from "@/lib/sankey";
import type { DailyRow, WeatherRow } from "@/lib/types";
import { dailyWeather, type DaySummary } from "@/lib/weather";
import { SkyIcon } from "@/components/Weather";

type DayData = NonNullable<DayRow["data"]>;

const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)} %`);
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;

interface Column {
  head: string;
  csv: string;
  cell: (d: DayData) => string;
  csvCell: (d: DayData) => string;
  width: string;
  title?: (d: DayData) => string;
}

/** Table columns for a home: battery columns only with a battery, Export only if it exports. */
function columnsFor(battery: boolean, exports: boolean): Column[] {
  // null (no meter reading that day) shows as "—", never 0.
  const kwh = (head: string, f: (d: DayData) => number | null, dp = 1): Column => ({
    head,
    csv: `${head} kWh`,
    cell: (d) => f(d)?.toFixed(dp) ?? "—",
    csvCell: (d) => f(d)?.toFixed(dp) ?? "",
    width: "0.8fr",
  });
  return [
    kwh("Solar PV", (d) => d.pv),
    kwh("Home load", (d) => d.load),
    kwh("Grid import", (d) => d.grid, 2),
    ...(exports ? [kwh("Export", (d) => d.export)] : []),
    ...(battery
      ? [
          kwh("To battery", (d) => d.toBat),
          kwh("From battery", (d) => d.fromBat),
          {
            // Net energy into the battery. Per day this replaces round-trip, which swings past
            // 100 % because charge carries over between days; round-trip is only shown per month.
            head: "Battery net",
            csv: "Battery net kWh",
            cell: (d: DayData) => signed(d.toBat - d.fromBat),
            csvCell: (d: DayData) => (d.toBat - d.fromBat).toFixed(1),
            width: "0.9fr",
            title: (d: DayData) => `Round-trip ${pct(d.rt)}`,
          },
        ]
      : []),
    { head: "Self-suff.", csv: "Self-sufficiency %", cell: (d) => pct(d.ss), csvCell: (d) => d.ss?.toFixed(1) ?? "", width: "0.8fr" },
    { head: "kWh/kWp", csv: "Specific yield kWh/kWp", cell: (d) => d.sy.toFixed(2), csvCell: (d) => d.sy.toFixed(2), width: "0.9fr" },
  ];
}

/**
 * One month, day by day, from the inverter's daily report: daily bars with the
 * self-sufficiency line, and a table with a month total that can be saved as CSV.
 */
export function MonthDayBreakdown({ daily, dayDates, mobile, style, weather = [] }: { daily: DailyRow[]; dayDates: string[]; mobile: boolean; style?: React.CSSProperties; weather?: WeatherRow[] }) {
  const { home } = useHome();
  const months = useMemo(() => dataMonths(daily), [daily]);
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked && months.includes(picked) ? picked : (months.at(-1) ?? "");
  const idx = months.indexOf(month);
  const days = useMemo(() => monthDays(daily, month, home.kwp, home.installed), [daily, month, home.kwp, home.installed]);
  const total = useMemo(() => monthTotal(days, home.kwp), [days, home.kwp]);
  const [ref, width] = useWidth<HTMLDivElement>();
  // Days the Day view can show (5-minute days; every reported day for a daily-only home).
  const linked = useMemo(() => new Set(dayDates), [dayDates]);
  const exports = useMemo(() => daily.some((d) => (d.to_grid_kwh ?? 0) > 0), [daily]);
  const cols = useMemo(() => columnsFor(home.battery != null, exports), [home.battery, exports]);
  // The day's weather at the site (Open-Meteo): an icon under each day's bars, a table column.
  const wmap = useMemo(() => dailyWeather(weather, days.map((d) => d.date)), [weather, days]);
  const hasWx = wmap.size > 0;
  const monthRain = Math.round([...wmap.values()].reduce((a, x) => a + x.rainMm, 0) * 10) / 10;
  const grid = `1.1fr ${hasWx ? "0.9fr " : ""}${cols.map((c) => c.width).join(" ")}`;
  const [y, m] = month.split("-").map(Number);
  const name = `${MONTH_FULL[m - 1]} ${y}`;

  const chart = useMemo(() => {
    // A phone labels every 5th day; the bars still fit the screen.
    const groups: BarGroup[] = days.map((d) => ({
      label: !mobile || d.day % 5 === 1 ? String(d.day) : "",
      sub: mobile ? "" : d.weekday.slice(0, 2),
      missingLabel: gapOn(home.dataGaps, d.date) ? "offline" : undefined,
      vals: d.data
        ? [
            { v: d.data.pv, color: COLORS.pv, est: d.pvEst },
            { v: d.data.load, color: COLORS.load, est: d.est },
            { v: d.data.grid, color: COLORS.grid, est: d.est },
          ]
        : null,
    }));
    // Self-sufficiency strip, 0–100 % (values printed on desktop; fill only on a phone).
    const ss = days.map((d) => d.data?.ss ?? null);
    const strip = { label: mobile ? "Self" : "Self-suff.", vals: ss, fmt: (v: number) => (mobile ? "" : String(Math.round(v))), fill: (v: number) => v / 100 };
    return { groups, strip };
  }, [days, home.dataGaps, mobile]);

  const save = () => {
    const wx = (date: string) => (hasWx ? [wmap.get(date)?.en.split(" · ")[0] ?? "", wmap.get(date)?.rainMm.toFixed(1) ?? ""] : []);
    const rows = days.map((d) => [d.date, ...wx(d.date), ...cols.map((c) => (d.data ? c.csvCell(d.data) : "")), d.est ? "yes" : ""]);
    rows.push([`Total ${month} (${total.days} days)`, ...(hasWx ? ["", monthRain.toFixed(1)] : []), ...cols.map((c) => c.csvCell(total)), estCount ? `${estCount} days` : ""]);
    const head = ["Date", ...(hasWx ? ["Weather", "Rain mm"] : []), ...cols.map((c) => c.csv), "Estimated"];
    downloadCsv(`${home.id}-solar-${month}-daily.csv`, toCsv(head, rows));
  };

  const estCount = days.filter((d) => d.est).length;
  const estRows = daily.filter((d) => d.date.startsWith(month) && isEstimated(d));
  const pvEstimated = estRows.some((d) => (d as EstimatedRow).estimatedParts === "pv+meter");
  if (!month) return null;
  const chartW = width;
  const portal = home.inverter.brand === "Solis" ? "SolisCloud" : home.inverter.brand === "Huawei" ? "FusionSolar" : home.inverter.brand;

  return (
    <Section
      style={style}
      en="Day by day"
      th={`รายวัน · ${name} · kWh / day · inverter daily report`}
      extra={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-secondary btn-icon" aria-label="Previous month" disabled={idx <= 0} onClick={() => setPicked(months[idx - 1])}>
            <ChevronLeft />
          </button>
          <select className="input" aria-label="Month" value={month} onChange={(e) => setPicked(e.target.value)} style={{ width: 150, minHeight: 36 }}>
            {months.map((k) => (
              <option key={k} value={k}>
                {MONTH_ABBR[+k.slice(5) - 1]} {k.slice(0, 4)}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary btn-icon" aria-label="Next month" disabled={idx >= months.length - 1} onClick={() => setPicked(months[idx + 1])}>
            <ChevronRight />
          </button>
          <button className="btn btn-secondary" onClick={save}>
            Download CSV
          </button>
        </div>
      }
      note={
        `From the inverter's daily report (one row per day, kWh as rounded by ${portal}).` +
        (home.battery
          ? ` Battery net = charged − discharged; charge carries over between days, so round-trip is only shown per month (${name}: ${pct(total.rt)}, see Battery).`
          : "") +
        (dayDates.length ? " Underlined days link to the Day view." : "") +
        (estCount
          ? ` ${estCount} days are estimates (est., dashed bars): grid import from the ${home.utility} bill for the month${pvEstimated ? "; missing PV from the same month a year earlier" : "; PV was measured"}. Hover an est. tag for the details.`
          : "") +
        " Hatched = no data for that day." +
        (home.dataGaps ?? [])
          .filter((g) => g.from.slice(0, 7) <= month && g.to.slice(0, 7) >= month)
          .map((g) => ` ${describeGap(g)}: the panels kept working, but no data reached the cloud.`)
          .join("")
      }
    >
      <LegendRow>
        <Legend color={COLORS.pv}>Solar PV</Legend>
        <Legend color={COLORS.load}>Home load</Legend>
        <Legend color={COLORS.grid}>Grid import</Legend>
        {estCount > 0 && <EstLegend />}
        <span className="muted-72" style={{ fontSize: 11 }}>
          Self-sufficiency: strip under the bars, 0–100 %
        </span>
      </LegendRow>
      <div ref={ref}>
        <GroupedBarChart
          label={`Solar, load and grid per day, ${name}`}
          width={chartW}
          height={mobile ? 220 : 280}
          groups={chart.groups}
          fmt={(v) => v.toFixed(0)}
          strip={chart.strip}
          inset={mobile ? 1 : 3}
          icons={hasWx ? days.map((d) => wxIcon(wmap.get(d.date), mobile ? 10 : 13)) : undefined}
        />
      </div>
      {mobile && (
        <MobileDays days={days} total={total} month={m} estCount={estCount} linked={linked} daily={daily} wmap={wmap} monthRain={monthRain} />
      )}

      {!mobile && (
      <div className="hscroll">
        <div style={{ display: "flex", flexDirection: "column", fontSize: 14, minWidth: 110 + cols.length * 85 }}>
          <div className="table-head" style={{ display: "grid", gridTemplateColumns: grid, gap: 8, padding: "8px 0" }}>
            <span>Date</span>
            {hasWx && <span>Weather</span>}
            {cols.map((c) => (
              <span key={c.head} style={{ textAlign: "right" }}>
                {c.head}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const label = `${d.weekday} ${dm(d.date)}`;
            return (
              <div key={d.date} className={`tnum${d.data ? "" : " hatch"}`} style={{ display: "grid", gridTemplateColumns: grid, gap: 8, padding: "6px 0", borderBottom: "1px solid var(--color-divider)" }}>
                <span style={{ fontWeight: 600 }}>
                  {linked.has(d.date) ? <a href={href("day", { d: d.date })}>{label}</a> : label}
                  {d.est && <EstTag title={`Estimated: ${estimateNote(daily.find((x) => x.date === d.date)!, home.utility)}`} />}
                </span>
                {hasWx && <WxCell s={wmap.get(d.date)} />}
                {d.data ? (
                  cols.map((c) => (
                    <span key={c.head} style={{ textAlign: "right" }} title={c.title?.(d.data!)}>
                      {c.cell(d.data!)}
                    </span>
                  ))
                ) : (
                  <span className="muted" style={{ gridColumn: "2 / -1" }}>
                    {gapOn(home.dataGaps, d.date)?.reason.toLowerCase() ?? "not loaded"}
                  </span>
                )}
              </div>
            );
          })}
          <div className="tnum" style={{ display: "grid", gridTemplateColumns: grid, gap: 8, padding: "10px 0", borderBottom: "2px solid var(--color-divider)", fontWeight: 800 }}>
            <span>
              {MONTH_ABBR[m - 1]} · {total.days} days
              {estCount > 0 && <EstTag title={`${estCount} estimated days`} />}
            </span>
            {hasWx && <span>{monthRain >= 0.2 ? `${monthRain} mm` : ""}</span>}
            {cols.map((c) => (
              <span key={c.head} style={{ textAlign: "right" }} title={c.title?.(total)}>
                {c.cell(total)}
              </span>
            ))}
          </div>
        </div>
      </div>
      )}
    </Section>
  );
}

/**
 * Mobile day rows (review 3b §5): line 1 = date, est. tag and the day's solar; line 2 = load,
 * grid import and self-sufficiency. Days with 5-minute data link to the Day view.
 */
function MobileDays({ days, total, month, estCount, linked, daily, wmap, monthRain }: { days: DayRow[]; total: ReturnType<typeof monthTotal>; month: number; estCount: number; linked: Set<string>; daily: DailyRow[]; wmap: Map<string, DaySummary>; monthRain: number }) {
  const { home } = useHome();
  return (
    <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--color-text)" }}>
      {[...days].reverse().map((d) => {
        const label = `${d.weekday} ${dm(d.date)}`;
        return (
          <div key={d.date} className={`mrow${d.data ? "" : " hatch"}`}>
            <div className="mrow-line">
              <span style={{ fontSize: 14, fontWeight: 600 }}>{linked.has(d.date) ? <a href={href("day", { d: d.date })}>{label}</a> : label}</span>
              {wmap.get(d.date) && (
                <span className="muted-72" title={wmap.get(d.date)!.en} style={{ display: "inline-flex", alignSelf: "center" }}>
                  <SkyIcon sky={wmap.get(d.date)!.sky} size={13} />
                </span>
              )}
              {d.est && <EstTag style={{ marginLeft: 0 }} title={`Estimated: ${estimateNote(daily.find((x) => x.date === d.date)!, home.utility)}`} />}
              <span className="mrow-num">{d.data?.pv != null ? `${d.data.pv.toFixed(1)} kWh` : "—"}</span>
            </div>
            <span className="caption">
              {d.data
                ? `Load ${d.data.load?.toFixed(1) ?? "—"} · grid ${d.data.grid?.toFixed(2) ?? "—"} kWh · self-suff. ${pct(d.data.ss)}`
                : (gapOn(home.dataGaps, d.date)?.reason.toLowerCase() ?? "no data")}
              {(wmap.get(d.date)?.rainMm ?? 0) >= 0.2 ? ` · rain ${wmap.get(d.date)!.rainMm} mm` : ""}
            </span>
          </div>
        );
      })}
      <div className="mrow" style={{ borderBottom: "2px solid var(--color-divider)" }}>
        <div className="mrow-line">
          <span style={{ fontSize: 14, fontWeight: 800 }}>
            {MONTH_ABBR[month - 1]} · {total.days} days
          </span>
          {estCount > 0 && <EstTag style={{ marginLeft: 0 }} title={`${estCount} estimated days`} />}
          <span className="mrow-num">{total.pv != null ? `${total.pv.toFixed(1)} kWh` : "—"}</span>
        </div>
        <span className="caption">{`Load ${total.load?.toFixed(1) ?? "—"} · grid ${total.grid?.toFixed(2) ?? "—"} kWh · self-suff. ${pct(total.ss)}${monthRain >= 0.2 ? ` · rain ${monthRain} mm` : ""}`}</span>
      </div>
    </div>
  );
}

const wxIcon = (s: DaySummary | undefined, size: number) =>
  s ? (
    <span title={s.en} style={{ display: "inline-flex" }}>
      <SkyIcon sky={s.sky} size={size} />
    </span>
  ) : null;

/** Weather table cell: the day's icon and its rain, the summary on hover. */
function WxCell({ s }: { s?: DaySummary }) {
  if (!s) return <span className="muted-72">—</span>;
  return (
    <span title={s.en} className="muted-72" style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <SkyIcon sky={s.sky} size={14} />
      <span className="tnum" style={{ fontSize: 12 }}>
        {s.rainMm >= 0.2 ? `${s.rainMm} mm` : ""}
      </span>
    </span>
  );
}
