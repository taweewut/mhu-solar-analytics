// KPI tiles for Overview (1a–1c) and Savings (1e), built from the dataset + savings model.

import type { Kpi } from "@/components/Kpis";
import { equivalentCycles, roundTrip } from "@/lib/battery";
import { gapInMonth } from "@/lib/gaps";
import { dayTotals, PERIODS, readingsFor, selfSufficiency, sumDaily } from "@/lib/energy";
import { dm, energy, hm, MONTH_ABBR, MONTH_FULL, spark, thb } from "@/lib/format";
import { COLORS } from "@/lib/sankey";
import { monthlyTotals, type BillRow, type SavingsModel } from "@/lib/tariff";
import type { DailyRow, FiveMinRow, Home, Period } from "@/lib/types";

const thb2 = (v: number) => "฿" + v.toFixed(2);
/** "Apr", or "Jun 2025" when the months shown span more than one year. */
const monthName = (m: { year: number; month: number }, all: { year: number }[]) =>
  MONTH_ABBR[m.month - 1] + (new Set(all.map((x) => x.year)).size > 1 ? ` ${m.year}` : "");

export interface OverviewInput {
  fiveMin: FiveMinRow[];
  daily: DailyRow[];
  asOf: string;
  savings: SavingsModel;
  rate: number;
  home: Home;
  period: Period;
  /** Month ("YYYY-MM") or year ("YYYY") picked for Month / Year. */
  pick: string;
}

/** The six Overview tiles for the selected period (the design's "today" set for Today). */
export function overviewKpis(i: OverviewInput): Kpi[] {
  return i.period === "today"
    ? withInfo(todayKpis(i.fiveMin, i.daily, i.asOf, i.savings, i.rate, i.home), todayInfo(i))
    : periodKpis(i);
}

/** Attach hover explanations to tiles, in order. */
export const withInfo = (kpis: Kpi[], info: string[][]): Kpi[] => kpis.map((k, n) => ({ ...k, info: info[n] }));

const SS_INFO = "Self-sufficiency = 1 − grid import ÷ home load: the share of the home's electricity that didn't come from the grid (solar used directly + solar stored in the battery).";

function todayInfo({ fiveMin, home, rate, savings }: OverviewInput): string[][] {
  const live = fiveMin.length > 0;
  const src = live ? "the inverter's own day counters at the latest 5-minute reading" : "the latest day in the inverter's daily report";
  return [
    [`What the panels produced ${live ? "today" : "on the latest day"}, from ${src}.`, "Sparkline and note: average kWh per day in each of the last months."],
    [SS_INFO, "The note compares it with the whole time since switch-on; the sparkline shows each month."],
    savings.current
      ? [
          "Estimated saving for this month so far — the bill isn't in yet.",
          `= the ${home.utility} bill for (home load + the usual meter gap) − the bill for (grid import + meter gap), at this month's Ft. The final figure comes with the bill.`,
        ]
      : [`Saving on the latest ${home.utility} bill: estimated bill without solar − the actual bill. See Savings for the method.`],
    [`Sum over every ${home.utility} bill since switch-on of (estimated bill without solar − actual bill). See Savings for the method.`],
    home.battery
      ? ["Battery state of charge at the latest 5-minute reading.", "Full since = first reading at 100 % today. SOH = battery health reported by the battery's BMS."]
      : ["Solar sent to the grid on the latest day.", "The note: share of all solar produced since switch-on that the home used itself."],
    [
      `Electricity bought from ${home.utility} ${live ? "today" : "on the latest day"}, measured by the inverter's meter.`,
      `≈ ฿ = kWh × the effective rate in Settings (${rate.toFixed(2)} ฿/kWh). avg = this month's kWh per day.`,
    ],
  ];
}

/** Rows of the daily report in a period (Month / Year by `pick`, Lifetime = all). */
const periodRows = (daily: DailyRow[], period: Period, pick: string) => (period === "life" ? daily : daily.filter((d) => d.date.startsWith(pick)));

function periodKpis({ daily, asOf, savings: s, rate, home, period, pick }: OverviewInput): Kpi[] {
  const rows = periodRows(daily, period, pick).filter((d) => d.yield_kwh != null);
  const t = sumDaily(rows); // days with PV + meter values, so the flows balance
  const days = rows.length;
  const meterDays = rows.filter((d) => d.load_kwh != null).length;
  // Solar over the same days as the diagram above, so the two always agree; days with solar
  // but no meter readings are left out here (Trends counts every day).
  const pvAll = t.pv;
  const soloDays = days - meterDays;
  const gap = period === "month" ? gapInMonth(home.dataGaps, pick) : undefined;
  const gapNote = gap ? gap.reason.toLowerCase() : undefined;
  const current = period === "life" || (period === "month" ? pick === asOf.slice(0, 7) : pick === asOf.slice(0, 4));
  const mNo = +pick.slice(5, 7);
  // "this month" / "Apr 2026"; "2026"; "lifetime".
  const when = period === "life" ? "lifetime" : period === "year" ? pick : current ? "this month" : `${MONTH_ABBR[mNo - 1]} ${pick.slice(0, 4)}`;
  const whenTh = period === "life" ? "ทั้งหมด" : current ? PERIODS[period].thp : period === "month" ? `${MONTH_ABBR[mNo - 1]} ${pick.slice(0, 4)}` : pick;
  const label = (en: string) => `${en} · ${when}`;
  // Sparklines: one point per day for a month, one per month for a year or the lifetime.
  const byDay = period === "month";
  const months = monthlyTotals(rows);
  const series = (perDay: (d: DailyRow) => number | null, perMonth: (m: (typeof months)[number]) => number | null) =>
    spark((byDay ? rows.map(perDay) : months.map(perMonth)).filter((v): v is number => v != null && Number.isFinite(v)));
  const avg = (v: number, n: number) => (n ? (v / n).toFixed(1) : "—");
  // value + unit together: kWh below 1,000, MWh above; "—" when no day has data (an outage).
  const en = (v: number): { value: string; unit?: string } => (meterDays ? energy(v) : { value: "—" });
  const ss = t.load > 0 ? Math.round(selfSufficiency(t) * 100) : null;
  const life = sumDaily(daily);

  // Saving for the period: the month's bill (or this month's estimate), the year's bills, or
  // the average per bill for the lifetime (the lifetime total is the next tile).
  let saved: Kpi;
  if (period === "month") {
    const b = s.bills.find((x) => x.key === pick);
    const est = s.current?.key === pick ? s.current : null;
    saved =
      b && !b.pre && !b.noData
        ? {
            label: label("Saved"), th: `ประหยัด ${whenTh}`, value: thb(b.saved), unit: b.estDays ? "est." : undefined, color: COLORS.bat,
            spark: "",
            sub: `${home.utility} bill ${thb(b.amount)} vs ${thb(b.withoutSolar)} without solar`,
            info: [`Saving on the ${MONTH_ABBR[b.month - 1]} ${b.year} ${home.utility} bill: estimated bill without solar − the actual bill. See Savings for the method.`],
          }
        : est
          ? {
              label: label("Saved"), th: `ประหยัด ${whenTh}`, value: thb(est.saved), unit: "est.", color: COLORS.bat, spark: "",
              sub: `${MONTH_ABBR[est.month - 1]} ${+est.firstDay.slice(8)}–${+est.lastDay.slice(8)} · bill not in yet`,
              info: ["Estimated saving for the month so far — the bill isn't in yet.", `= the bill for (home load + the usual meter gap) − the bill for (grid import + meter gap), at this month's Ft.`],
            }
          : {
              label: label("Saved"), th: `ประหยัด ${whenTh}`, value: "—", color: COLORS.bat, spark: "",
              sub: b?.pre ? "before solar (baseline bill)" : b?.noData ? (gapNote ?? "no solar data for this bill") : "no bill for this month",
              info: ["Saving = estimated bill without solar − the actual bill, for the bill of this usage month."],
            };
  } else if (period === "year") {
    const bills = s.post.filter((b) => b.year === +pick);
    const est = s.current && s.current.year === +pick ? s.current : null;
    const total = bills.reduce((a, b) => a + b.saved, 0) + (est?.saved ?? 0);
    saved = {
      label: label("Saved"), th: `ประหยัด ${whenTh}`, value: thb(total), unit: est ? "est." : undefined, color: COLORS.bat,
      spark: spark(bills.map((b) => b.saved)),
      sub: `${bills.length} ${home.utility} bills${est ? ` + ${MONTH_ABBR[est.month - 1]} est.` : ""}`,
      info: [
        `Sum of (estimated bill without solar − actual bill) over the ${home.utility} bills for usage months in ${pick}.`,
        ...(est ? [`Includes ${MONTH_ABBR[est.month - 1]}'s estimate, as its bill isn't in yet.`] : []),
      ],
    };
  } else {
    saved = {
      label: "Average saving", th: "ประหยัดเฉลี่ยต่อเดือน", value: thb(s.avgMonthly), color: COLORS.bat,
      spark: spark(s.post.map((b) => b.saved)),
      sub: `per ${home.utility} bill, ${s.post.length} bills`,
      info: ["Total saved ÷ the number of bills since switch-on. The sparkline shows each bill's saving."],
    };
  }

  let run = 0;
  const cum = s.post.map((b) => (run += b.saved));
  const batteryOrExport: Kpi = home.battery
    ? (() => {
        const rt = roundTrip(t.discharge, t.charge);
        return {
          label: label("From battery"), th: `แบตจ่ายไฟ ${whenTh}`, ...en(t.discharge), color: COLORS.bat,
          spark: series((d) => d.from_battery_kwh, (m) => (m.days ? m.fromBat / m.days : null)),
          sub: `${equivalentCycles(t.discharge, home.battery!.kwh).toFixed(t.discharge / home.battery!.kwh >= 10 ? 0 : 1)} cycles · round-trip ${rt == null ? "—" : Math.round(rt * 100)} %`,
          info: [
            "Energy the battery supplied to the home in the period.",
            `Cycles = discharge ÷ ${home.battery!.kwh} kWh (one full battery = one cycle). Round-trip = discharge ÷ charge; it can read high or low over a short period because charge carries over.`,
          ],
        };
      })()
    : {
        label: label("Exported"), th: `ส่งไฟคืนกริด ${whenTh}`, ...en(t.export ?? 0), color: COLORS.grid,
        spark: series((d) => d.to_grid_kwh, (m) => (m.meterDays ? m.export / m.meterDays : null)),
        sub: t.pv > 0 ? `${Math.round((1 - (t.export ?? 0) / t.pv) * 100)} % of solar used at home` : (gapNote ?? ""),
        info: [
          "Solar sent to the grid when the house couldn't use it.",
          home.meterNetsExport ? `While the ${home.utility} meter netted exports (until 2024), each exported kWh cancelled an imported one on the bill.` : "Export earns nothing here.",
        ],
      };

  return [
    {
      label: label("Solar"), th: `ผลิตไฟ ${whenTh}`, ...en(pvAll), color: COLORS.pv,
      spark: series((d) => d.yield_kwh, (m) => m.pv / m.days),
      sub: meterDays ? `avg ${avg(pvAll, meterDays)} kWh/day · ${meterDays} days` : (gapNote ?? "no data for this period"),
      info: [
        "What the panels produced in the period (sum of the inverter's daily report).",
        ...(soloDays
          ? [`Counts the ${meterDays} days with meter readings, like the diagram; ${soloDays} days with solar only are left out here (Trends includes them).`]
          : []),
        byDay ? "Sparkline: each day." : "Sparkline: average kWh per day, each month.",
      ],
    },
    {
      label: label("Self-sufficiency"), th: `พึ่งพาตัวเอง ${whenTh}`, value: ss == null ? "—" : String(ss), unit: ss == null ? undefined : "%", color: COLORS.load,
      spark: series((d) => (d.load_kwh ? 1 - (d.from_grid_kwh ?? 0) / d.load_kwh : null), (m) => (m.meterDays && m.load ? 1 - m.grid / m.load : null)),
      sub: period === "life" ? `${meterDays} days with meter data` : `lifetime ${Math.round(selfSufficiency(life) * 100)} %`,
      info: [SS_INFO, meterDays < days ? `Over the ${meterDays} days that have meter readings (${days - meterDays} days have solar only).` : "Sparkline: " + (byDay ? "each day." : "each month.")],
    },
    saved,
    {
      label: "Saved lifetime", th: "ประหยัดสะสม", value: thb(s.cumTotal), color: COLORS.bat, spark: spark([0, ...cum]),
      sub: `Across ${s.post.length} ${home.utility} bills`,
      info: [`Sum over every ${home.utility} bill since switch-on of (estimated bill without solar − actual bill). The same whatever period is selected.`],
    },
    batteryOrExport,
    {
      label: label("Grid import"), th: `ซื้อไฟ ${home.utility} ${whenTh}`, ...en(t.gridImport), color: COLORS.grid,
      spark: series((d) => d.from_grid_kwh, (m) => (m.meterDays ? m.grid / m.meterDays : null)),
      sub: meterDays ? `≈ ${thb(t.gridImport * rate)} · avg ${avg(t.gridImport, meterDays)} kWh/day` : (gapNote ?? "no data for this period"),
      info: [
        `Electricity bought from ${home.utility} in the period, measured by the inverter's meter.`,
        `≈ ฿ = kWh × the effective rate in Settings (${rate.toFixed(2)} ฿/kWh). The actual bill is on Savings.`,
      ],
    },
  ];
}

function todayKpis(fiveMin: FiveMinRow[], daily: DailyRow[], asOf: string, s: SavingsModel, rate: number, home: Home): Kpi[] {
  const months = monthlyTotals(daily);
  // Months after the commissioning month (+ the current one), as the mockup's sparklines;
  // the latest 12 for a home with years of history.
  const post = months.slice(1).slice(-12);
  const today = dayTotals(fiveMin, asOf);
  const todaySum = today ?? { ...sumDaily(daily.filter((d) => d.date === asOf)), lastT: 0 };
  // Without 5-minute data "today" is the latest day in the daily report: say which day.
  const live = today != null;
  const dayLabel = live ? "today" : `· ${dm(asOf)}`;
  const P = readingsFor(fiveMin, asOf);
  const life = sumDaily(daily);
  const cur = months.at(-1);

  const firstAvg = post[0] ? post[0].pv / post[0].days : 0;
  const lastAvg = post.at(-1) ? post.at(-1)!.pv / post.at(-1)!.days : 0;

  let run = 0;
  const cum = s.post.map((b) => (run += b.saved));

  const last = P.at(-1);
  const full = P.find((p) => p.soc >= 100);
  const low = P.length ? P.reduce((a, b) => (b.soc < a.soc ? b : a)) : undefined;
  const soh = last?.soh != null ? ` · SOH ${Math.round(last.soh)} %` : "";

  const savedThisMonth: Kpi = s.current
    ? {
        label: "Saved this month",
        th: "ประหยัดเดือนนี้",
        value: thb(s.current.saved),
        unit: "est.",
        color: COLORS.bat,
        spark: spark(post.filter((m) => m.meterDays).map((m) => m.load)),
        sub: `${MONTH_ABBR[s.current.month - 1]} ${+s.current.firstDay.slice(8)}–${+s.current.lastDay.slice(8)} · bill not in yet`,
      }
    : {
        label: "Saved last bill",
        th: "ประหยัดบิลล่าสุด",
        value: thb(s.post.at(-1)?.saved ?? 0),
        color: COLORS.bat,
        spark: spark(s.post.map((b) => b.saved)),
        sub: s.post.length ? `${MONTH_ABBR[s.post.at(-1)!.month - 1]} ${home.utility} bill` : `No ${home.utility} bill yet`,
      };

  const exportTotal = life.export ?? 0;
  const batteryOrExport: Kpi = home.battery
    ? {
        label: "Battery now",
        th: "แบตเตอรี่ตอนนี้",
        value: last ? String(Math.round(last.soc)) : "—",
        unit: "%",
        color: COLORS.bat,
        spark: spark(P.filter((_, i) => i % 3 === 0).map((p) => p.soc)),
        sub: full ? `Full since ${hm(full.t)}${soh}` : low ? `Low ${low.soc} % at ${hm(low.t)}${soh}` : soh.slice(3),
      }
    : {
        label: live ? "Exported today" : `Exported ${dayLabel}`,
        th: "ส่งไฟคืนกริด",
        value: (todaySum.export ?? 0).toFixed(1),
        unit: "kWh",
        color: COLORS.grid,
        spark: spark(post.filter((m) => m.meterDays).map((m) => m.export / m.meterDays)),
        sub: life.pv > 0 ? `Lifetime ${Math.round((1 - exportTotal / life.pv) * 100)} % of solar used at home` : "",
      };

  return [
    {
      label: live ? "Today's solar" : `Solar ${dayLabel}`,
      th: live ? "ผลิตไฟวันนี้" : "ผลิตไฟล่าสุด",
      value: todaySum.pv.toFixed(1),
      unit: "kWh",
      color: COLORS.pv,
      spark: spark(post.map((m) => m.pv / m.days)),
      sub: post.length
        ? `Daily avg ${monthName(post[0], post)} → ${monthName(post.at(-1)!, post)}: ${Math.round(firstAvg)} → ${Math.round(lastAvg)}`
        : "",
    },
    {
      label: "Self-sufficiency",
      th: "พึ่งพาตัวเอง",
      value: String(Math.round(selfSufficiency(todaySum) * 100)),
      unit: "%",
      color: COLORS.load,
      spark: spark(post.filter((m) => m.meterDays && m.load).map((m) => 1 - m.grid / m.load)),
      sub: `${live ? "Today" : dm(asOf)} · lifetime ${Math.round(selfSufficiency(life) * 100)} %`,
    },
    savedThisMonth,
    {
      label: "Saved lifetime",
      th: "ประหยัดสะสม",
      value: thb(s.cumTotal),
      color: COLORS.bat,
      spark: spark([0, ...cum]),
      sub: `Across ${s.post.length} ${home.utility} bills`,
    },
    batteryOrExport,
    {
      label: live ? "Grid import today" : `Grid import ${dayLabel}`,
      th: `ซื้อไฟ ${home.utility} ${live ? "วันนี้" : "ล่าสุด"}`,
      value: todaySum.gridImport.toFixed(1),
      unit: "kWh",
      color: COLORS.grid,
      spark: spark(post.filter((m) => m.meterDays).map((m) => m.grid / m.meterDays)),
      sub: `≈ ${thb2(todaySum.gridImport * rate)} · avg ${cur?.meterDays ? (cur.grid / cur.meterDays).toFixed(1) : "—"} kWh/day`,
    },
  ];
}

export function savingsKpis(s: SavingsModel, utility: string): Kpi[] {
  const first = s.post[0];
  const latest = s.post.at(-1);
  const base = s.baseline;
  const cur = s.current;
  // Month names get a year once the bills span more than one year.
  const years = new Set([first, latest, base].filter(Boolean).map((b) => (b as BillRow).year)).size > 1;
  const mon = (b: BillRow) => MONTH_ABBR[b.month - 1] + (years ? ` ${b.year}` : "");
  const reduction = s.reduction != null ? Math.round(s.reduction * 100) : null;
  return [
    {
      label: "Saved so far",
      th: "ประหยัดสะสม",
      value: thb(s.cumTotal),
      sub: first && latest ? `Across ${s.post.length} ${utility} bills, ${mon(first)}–${mon(latest)}` : "No bills since solar yet",
      info: [
        `Sum over every ${utility} bill since switch-on of (estimated bill without solar − actual bill).`,
        "Without-solar bill = the tariff applied to what the home used (inverter load + the meter gap) + service + Ft, + VAT. The note under the table gives the exact formula.",
      ],
    },
    {
      label: "Bill vs. before solar",
      th: "ค่าไฟลดลง",
      value: reduction == null ? "—" : reduction >= 0 ? `−${reduction} %` : `+${-reduction} %`,
      sub: base && latest ? `${thb(base.amount)} (${mon(base)}) → ${thb(latest.amount)} (${mon(latest)})` : "Needs a pre-solar bill",
      info: [
        "1 − latest bill ÷ the last bill before solar (the baseline).",
        "A simple before/after comparison: it also moves with the season and with how much the house used, so Saved so far is the fairer measure.",
      ],
    },
    {
      label: "Average saving",
      th: "ประหยัดเฉลี่ยต่อเดือน",
      value: thb(s.avgMonthly),
      sub: first ? `per month since ${MONTH_FULL[first.month - 1]}${years ? ` ${first.year}` : ""}` : "",
      info: ["Saved so far ÷ the number of bills since switch-on. Payback uses this to project the date."],
    },
    cur
      ? {
          label: `${MONTH_FULL[cur.month - 1]} so far`,
          th: "เดือนนี้ (ประมาณการ)",
          value: thb(cur.saved),
          sub: "est. · bill not in yet",
          info: ["Estimated saving for the month so far, before the bill arrives:", "the bill for (home load + the usual meter gap) − the bill for (grid import + meter gap), at this month's Ft."],
        }
      : {
          label: latest ? `Last bill · ${MONTH_ABBR[latest.month - 1]} ${latest.year}` : "Last bill",
          th: "บิลล่าสุด",
          value: latest ? thb(latest.amount) : "—",
          sub: latest ? `saved ${thb(latest.saved)}${latest.estDays ? " (est.)" : ""}` : "no bill since solar yet",
          info: ["The latest bill and what it saved against the estimated bill without solar. Once a new month has inverter data, this card estimates it until the bill arrives."],
        },
  ];
}
