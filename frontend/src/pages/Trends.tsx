import { useMemo, useState } from "react";
import { GroupedBarChart } from "@/components/GroupedBarChart";
import { KpiGrid, type Kpi } from "@/components/Kpis";
import { withInfo } from "@/lib/kpis";
import { MonthDayBreakdown } from "@/components/MonthDayBreakdown";
import { PageTitle } from "@/components/ui";
import { EstLegend, Legend, Section, Seg } from "@/components/ui2";
import type { BarGroup, RightAxis } from "@/lib/charts";
import { dm, dmy, energy, energyText, MONTH_ABBR } from "@/lib/format";
import { useWidth } from "@/lib/layout";
import type { Model } from "@/lib/model";
import { COLORS } from "@/lib/sankey";
import { describeGap, gapInMonth } from "@/lib/gaps";
import { useHome } from "@/lib/home";
import { useTrendMode } from "@/lib/trendMode";
import {
  monthSelfSufficiency,
  monthSlots,
  partialMonthsNote,
  specificYield,
  specificYieldPerDay,
  trendSummary,
  type TrendMode,
} from "@/lib/trends";
import type { DailyRow } from "@/lib/types";

export const MODES: [TrendMode, string, string][] = [
  ["day", "Per day", "ต่อวัน"],
  ["total", "Total", "รวม"],
];

const f1 = (v: number) => v.toFixed(1);
const f2 = (v: number) => v.toFixed(2);
const int = (v: number) => Math.round(v).toLocaleString("en-US");
/** A month is drawn as estimated (dashed) when most of its days are estimates; the x label
 *  still counts any estimated days ("1 d est."). */
const mostlyEst = (m: { estDays: number; days: number }) => m.estDays * 2 >= m.days;
/** Same for PV, which is only estimated on days it wasn't measured. */
const mostlyPvEst = (m: { pvEstDays: number; days: number }) => m.pvEstDays * 2 >= m.days;

/** Months the monthly charts show at once; longer histories get a range picker. */
const MAX_MONTHS = 12;

export function Trends({ mobile, daily, model }: { mobile: boolean; daily: DailyRow[]; model: Model }) {
  const { mode, setMode } = useTrendMode();
  const { home } = useHome();
  const kwp = home.kwp;
  const per = mode === "day";
  const [mainRef, mainW] = useWidth<HTMLDivElement>();
  const [pairRef, pairW] = useWidth<HTMLDivElement>();
  const allSlots = useMemo(() => monthSlots(daily), [daily]);
  // Years of history: "Last 12 months" or one calendar year at a time.
  const years = useMemo(() => [...new Set(allSlots.map((m) => String(m.year)))].reverse(), [allSlots]);
  const [range, setRange] = useState("last12");
  const long = allSlots.length > MAX_MONTHS;
  const slots = useMemo(
    () => (!long ? allSlots : range === "last12" ? allSlots.slice(-MAX_MONTHS) : allSlots.filter((m) => String(m.year) === range)),
    [allSlots, long, range],
  );
  const s = useMemo(() => trendSummary(daily), [daily]);
  const pad = mobile ? 20 : 48;

  const kpis: Kpi[] = withInfo([
    {
      label: "Solar produced",
      th: "ผลิตไฟสะสม",
      ...energy(s.pv),
      sub: s.best ? `Best month ${MONTH_ABBR[s.best.month - 1]} · ${int(s.best.pv)} kWh` : "",
    },
    {
      label: "Specific yield",
      th: "ผลผลิตจำเพาะ",
      value: int(specificYield(s.pv, kwp)),
      unit: "kWh/kWp",
      sub: `${f2(specificYieldPerDay(s.pv, s.days, kwp))} kWh/kWp per day avg`,
    },
    {
      label: "Self-sufficiency",
      th: "พึ่งพาตัวเอง",
      value: String(Math.round(s.load > 0 ? (1 - s.grid / s.load) * 100 : 0)),
      unit: "%",
      sub:
        s.lowest && s.highest
          ? `Lowest ${MONTH_ABBR[s.lowest.month - 1]} ${f1(monthSelfSufficiency(s.lowest)!)} % · highest ${MONTH_ABBR[s.highest.month - 1]} ${f1(monthSelfSufficiency(s.highest)!)} %`
          : "",
    },
    {
      label: "Grid import",
      th: `ซื้อไฟ ${home.utility}`,
      value: s.meterDays ? f1(s.grid / s.meterDays) : "—",
      unit: "kWh/day",
      sub: `${energyText(s.grid)} since ${dmy(model.commissioned)}`,
    },
  ], [
      ["All the solar the panels produced since switch-on (sum of the inverter's daily report).", "Best month = the month with the most kWh in total."],
      [`Solar produced ÷ the array size (${kwp} kWp): kWh per kWp. It compares output independent of system size.`, "Per day avg ÷ days with data; a healthy Thai rooftop gives roughly 3.5–4.5 kWh/kWp/day in the dry season, less in the rains."],
      ["1 − grid import ÷ home load since switch-on: the share of the home's electricity that didn't come from the grid.", "Lowest / highest = the months with the lowest and highest share."],
      [`Average electricity bought from ${home.utility} per day, measured by the inverter's meter (days with meter readings).`, `Your ${home.utility} bill can differ by the meter gap — see Savings.`],
    ]);

  const main = useMemo(() => {
    const div = (days: number) => (per ? days : 1);
    const fk = per ? f1 : int;
    // Load and grid come from the meter, which can be missing for days that have PV: per day
    // they're averaged over metered days, and a month with no meter data has no bars for them.
    const meter = (m: NonNullable<(typeof slots)[number]["data"]>, v: number) => (m.meterDays ? v / div(m.meterDays) : null);
    const groups: BarGroup[] = slots.map((m) => ({
      label: m.label,
      sub: m.data ? (m.data.estDays ? `${m.data.estDays} d est.` : `${m.data.days} days`) : "",
      missingLabel: gapInMonth(home.dataGaps, m.key) ? "offline" : undefined,
      top: m.data ? fk(m.data.pv / div(m.data.days)) : undefined,
      vals: m.data
        ? [
            { v: m.data.pv / div(m.data.days), color: COLORS.pv, est: mostlyPvEst(m.data) },
            { v: meter(m.data, m.data.load), color: COLORS.load, est: mostlyEst(m.data) },
            { v: meter(m.data, m.data.grid), color: COLORS.grid, est: mostlyEst(m.data) },
          ]
        : null,
    }));
    const ss = slots.map((m) => (m.data ? monthSelfSufficiency(m.data) : null));
    // 90–100 % in the design; wider (10-point ticks) for a home that relies on the grid more.
    const lo = Math.min(90, ...ss.filter((v): v is number => v != null));
    const step = lo < 80 ? 10 : 5;
    const lowest = Math.floor(lo / step) * step;
    const ticks: number[] = [];
    for (let v = lowest; v <= 100; v += step) ticks.push(v);
    const right: RightAxis = { min: lowest, max: 100, ticks, vals: ss, fmt: (v) => `${v} %` };
    return { groups, right, fmt: fk };
  }, [slots, per, home.dataGaps]);

  const pair = useMemo(
    () => ({
      sy: slots.map<BarGroup>((m) => ({
        label: m.label,
        missingLabel: gapInMonth(home.dataGaps, m.key) ? "offline" : undefined,
        sub: m.data ? `${m.data.days} days` : "",
        top: m.data ? f2(specificYieldPerDay(m.data.pv, m.data.days, kwp)) : undefined,
        vals: m.data ? [{ v: specificYieldPerDay(m.data.pv, m.data.days, kwp), color: COLORS.pv, est: mostlyPvEst(m.data) }] : null,
      })),
      gi: slots.map<BarGroup>((m) => ({
        label: m.label,
        missingLabel: gapInMonth(home.dataGaps, m.key) ? "offline" : undefined,
        sub: m.data ? `${m.data.days} days` : "",
        top: m.data?.meterDays ? f2(m.data.grid / m.data.meterDays) : undefined,
        vals: m.data?.meterDays ? [{ v: m.data.grid / m.data.meterDays, color: COLORS.grid, est: mostlyEst(m.data) }] : null,
      })),
    }),
    [slots, kwp, home.dataGaps],
  );

  const shownGaps = (home.dataGaps ?? []).filter((g) => slots.some((m) => gapInMonth([g], m.key)));
  const estMonths = slots.filter((m) => m.data?.estDays);
  const estTotal = estMonths.reduce((a, m) => a + (m.data?.estDays ?? 0), 0);
  const note = [
    partialMonthsNote(slots),
    ...shownGaps.map((g) => `${describeGap(g)}${estMonths.length ? "." : ": no data for that stretch — the panels kept working."}`),
    estMonths.length
      ? `${estTotal} days with missing inverter data are estimated ("d est."; dashed when most of a month): grid import from the ${home.utility} bills, missing PV from the same month a year earlier. Switch off in Settings.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  // On a phone the month groups need ~90px each; scroll sideways rather than squash them.
  const mainWidth = mobile ? Math.max(mainW, slots.length * 90 + 110) : mainW;
  const pairWidth = mobile ? Math.max(pairW, slots.length * 60 + 70) : pairW;

  return (
    <>
      <div style={{ padding: `${mobile ? 16 : 28}px ${pad}px 0`, display: "flex", alignItems: mobile ? "stretch" : "flex-end", gap: mobile ? 12 : 24, flexDirection: mobile ? "column" : "row" }}>
        <PageTitle
          mobile={mobile}
          title="Trends"
          sub={`แนวโน้ม · monthly · ${long ? dmy(model.commissioned) : dm(model.commissioned)} – ${dmy(model.asOf)}`}
        />
        {long && (
          <select className="input" aria-label="Months shown" value={range} onChange={(e) => setRange(e.target.value)} style={{ width: mobile ? "100%" : 170, minHeight: 36 }}>
            <option value="last12">Last 12 months</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
        <Seg name="tr-mode" value={mode} options={MODES} onChange={setMode} />
      </div>
      <KpiGrid plain mobile={mobile} items={kpis} style={{ margin: mobile ? "16px 0 0" : `20px ${pad}px 0` }} />

      <Section
        style={{ margin: `28px ${pad}px 0` }}
        en="Solar, load and grid"
        th={`ผลิต · ใช้ · ซื้อไฟ · ${per ? "kWh / day" : "kWh / month"}`}
        extra={
          <>
            <Legend color={COLORS.pv}>Solar PV</Legend>
            <Legend color={COLORS.load}>Home load</Legend>
            <Legend color={COLORS.grid}>Grid import</Legend>
            <Legend color="var(--color-text)" line>
              Self-sufficiency % (right)
            </Legend>
            {estMonths.length > 0 && <EstLegend />}
          </>
        }
        note={`${note}${note ? " " : ""}Use "Per day" to compare months fairly.`}
      >
        <div ref={mainRef} className={mobile ? "hscroll" : undefined}>
          <GroupedBarChart label="Solar, load and grid import per month" width={mainWidth} height={mobile ? 300 : 340} groups={main.groups} fmt={main.fmt} right={main.right} />
        </div>
      </Section>

      <div ref={pairRef} className="pair" style={{ margin: `28px ${pad}px 0` }}>
        <Section en="Specific yield" th={`kWh ต่อ kWp ต่อวัน · ${kwp} kWp array`} note="Lower in the rainy season (May–Oct). Compare against the same month in other years.">
          <div className={mobile ? "hscroll" : undefined}>
            <GroupedBarChart label="Specific yield per month" width={mobile ? pairWidth : (pairW - 32) / 2} height={240} groups={pair.sy} fmt={f1} />
          </div>
        </Section>
        <Section en="Grid import per day" th={`ซื้อไฟจาก ${home.utility} ต่อวัน · kWh`} note={`${home.inverter.brand} meter only. ${home.utility} bills run higher by the meter gap (see Savings).`}>
          <div className={mobile ? "hscroll" : undefined}>
            <GroupedBarChart label="Grid import per day, per month" width={mobile ? pairWidth : (pairW - 32) / 2} height={240} groups={pair.gi} fmt={f1} />
          </div>
        </Section>
      </div>

      <MonthDayBreakdown daily={daily} fiveMinDates={model.dates} mobile={mobile} style={{ margin: `28px ${pad}px 0` }} />
    </>
  );
}
