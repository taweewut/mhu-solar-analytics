import { useMemo } from "react";
import { GroupedBarChart } from "@/components/GroupedBarChart";
import { KpiGrid, type Kpi } from "@/components/Kpis";
import { GridRow, Legend, Section } from "@/components/ui2";
import type { BarGroup, RightAxis } from "@/lib/charts";
import { MONTH_ABBR, thb } from "@/lib/format";
import { useHome } from "@/lib/home";
import { useWidth } from "@/lib/layout";
import { COLORS } from "@/lib/sankey";
import { exportStop, touAnalysis } from "@/lib/tou";
import type { Bill, DailyRow } from "@/lib/types";

const OFF_PEAK = "color-mix(in srgb, #3a7bd5 40%, var(--color-bg))";
const pct = (v: number | null, dp = 1) => (v == null ? "—" : `${(v * 100).toFixed(dp)} %`);
const signedThb = (v: number) => `${v >= 0 ? "+" : "−"}${thb(Math.abs(v))}`;
const COLS = "1.1fr 0.7fr 0.7fr 0.8fr 0.8fr 0.9fr 0.9fr 0.9fr 0.9fr";

/**
 * TOU meter impact (homes billed on on-peak / off-peak units): each TOU bill against the normal
 * progressive tariff for the same units, the on-peak share against its break-even share, and
 * what the share would have been without solar. Renders nothing for a home that never had TOU.
 */
export function TouAnalysis({ bills, daily, mobile, style }: { bills: Bill[]; daily: DailyRow[]; mobile: boolean; style?: React.CSSProperties }) {
  const { home } = useHome();
  const t = home.tariff;
  const s = useMemo(() => touAnalysis(bills, daily, t), [bills, daily, t]);
  const stop = useMemo(() => exportStop(daily), [daily]);
  const [ref, width] = useWidth<HTMLDivElement>();
  if (!s || !s.first || t.touOn == null || t.touOff == null) return null;

  const mon = (r: { year: number; month: number }) => `${MONTH_ABBR[r.month - 1]} ${r.year}`;
  const since = mon(s.first);
  const invalid = s.rows.filter((r) => !r.valid);
  const cheaper = s.saved >= 0;

  const kpis: Kpi[] = [
    {
      label: "On-peak share",
      th: "สัดส่วนช่วง On-peak",
      value: (s.onShare * 100).toFixed(1),
      unit: "%",
      sub: `break-even ${pct(s.breakEven)}`,
      info: [
        "Share of billed units used on-peak (Mon–Fri 09:00–22:00), across the TOU bills.",
        `Break-even = the share at which TOU and the normal tariff cost the same. Below it TOU is cheaper; above it the normal tariff would be. Yours sits ${((s.breakEven - s.onShare) * 100).toFixed(0)} points below.`,
      ],
    },
    {
      label: cheaper ? "Saved by TOU" : "Extra cost of TOU",
      th: "ผลต่างเทียบอัตราปกติ",
      value: thb(Math.abs(s.saved)),
      sub: `${s.valid.length} bills · avg ${signedThb(s.avgSaved)}/month`,
      info: [
        "Normal-tariff energy charge − TOU energy charge, × VAT, summed over the TOU bills.",
        "Service charge and Ft × units are the same on both tariffs, so they cancel out.",
        ...(invalid.length ? [`${invalid.map(mon).join(" and ")} are left out: their on/off-peak split doesn't add up to the billed units.`] : []),
      ],
    },
    {
      label: "Energy rate",
      th: "ค่าพลังงานต่อหน่วย",
      value: s.touRate.toFixed(2),
      unit: "฿/unit",
      sub: `normal tariff ${s.normalRate.toFixed(2)} ฿/unit`,
      info: [
        `TOU energy charge ÷ units: on-peak ${t.touOn} ฿, off-peak ${t.touOff} ฿, weighted by your split.`,
        "Normal tariff: the progressive tiers (3.2484 / 4.2218 / 4.4217 ฿) on the same units. Before Ft, service and VAT.",
      ],
    },
    {
      label: "On-peak without solar",
      th: "ถ้าไม่มีโซลาร์",
      value: s.onShareNoSolar == null ? "—" : (s.onShareNoSolar * 100).toFixed(1),
      unit: s.onShareNoSolar == null ? undefined : "%",
      sub: s.onShareNoSolar == null ? "needs meter data" : s.onShareNoSolar > s.breakEven ? "above break-even" : "still below break-even",
      info: [
        "Estimated on-peak share if solar hadn't covered the home's daytime use: (on-peak units + weekday solar used at home) ÷ (units + all solar used at home).",
        "Solar produces mostly in on-peak hours on weekdays, which is what keeps your on-peak share low. Daily data can't split hours, so all weekday solar counts as on-peak.",
      ],
    },
  ];

  const groups: BarGroup[] = s.rows.map((r) => ({
    label: MONTH_ABBR[r.month - 1],
    sub: String(r.year),
    missingLabel: "split ≠ units",
    top: r.valid ? signedThb(r.saved) : undefined,
    vals: r.valid
      ? [
          { v: r.on, color: COLORS.grid },
          { v: r.off, color: OFF_PEAK },
        ]
      : null,
  }));
  const shares = s.rows.map((r) => (r.valid ? r.onShare * 100 : null));
  const top = Math.max(60, Math.ceil(Math.max(...s.rows.map((r) => r.breakEven * 100)) / 10) * 10);
  const right: RightAxis = { min: 0, max: top, ticks: [0, 20, 40, top].filter((v, i, a) => a.indexOf(v) === i), vals: shares, fmt: (v) => `${Math.round(v)} %` };
  const chartW = mobile ? Math.max(width, s.rows.length * 64 + 110) : width;

  const noteParts = [
    `On-peak = Mon–Fri 09:00–22:00 (${t.touOn} ฿/unit); off-peak = nights, weekends and public holidays (${t.touOff} ฿/unit). Normal tariff for comparison = the progressive tiers on the same units — it matches the sheet's ค่าไฟจากการคำนวณ column.`,
    stop
      ? `Export stopped after ${MONTH_ABBR[+stop.lastMonth.slice(5) - 1]} ${stop.lastMonth.slice(0, 4)} (about ${Math.round(stop.avgBefore)} kWh/month before).${home.meterNetsExport ? ` The old meter netted exports against imports; the TOU meter bills on-peak and off-peak imports separately, so exported solar would no longer offset the bill — zero export avoids giving it away.` : ""}`
      : "",
    invalid.length ? `${invalid.map(mon).join(" and ")}: the logged on/off-peak units repeat the month before and don't add up to the billed units, so they're left out (hatched).` : "",
  ];

  return (
    <Section
      style={style}
      en="TOU meter"
      th={`มิเตอร์ TOU · on-peak vs off-peak · since ${since}`}
      note={noteParts.filter(Boolean).join(" ")}
    >
      <KpiGrid plain mobile={mobile} items={kpis} style={mobile ? { margin: "0 -20px" } : undefined} />

      <div style={{ display: "flex", alignItems: "flex-end", gap: "8px 16px", flexWrap: "wrap", marginTop: 8 }}>
        <span style={{ fontSize: 12, marginRight: "auto" }} className="muted">
          Units per bill · label = saved by TOU vs the normal tariff (incl. VAT)
        </span>
        <Legend color={COLORS.grid}>On-peak units</Legend>
        <Legend color={OFF_PEAK}>Off-peak units</Legend>
        <Legend color="var(--color-text)" line>
          On-peak share % (right)
        </Legend>
      </div>
      <div ref={ref} className={mobile ? "hscroll" : undefined}>
        <GroupedBarChart label="TOU bills: on-peak and off-peak units, and the on-peak share" width={chartW} height={280} groups={groups} fmt={(v) => v.toFixed(0)} right={right} />
      </div>

      <div className="hscroll">
        <div style={{ display: "flex", flexDirection: "column", fontSize: 14, minWidth: 860 }}>
          <GridRow head cols={COLS}>
            <span>Usage month</span>
            {["On-peak", "Off-peak", "On-peak %", "Break-even", "TOU energy", "Normal energy", "Saved by TOU", "Bill paid"].map((h) => (
              <span key={h} style={{ textAlign: "right" }}>
                {h}
              </span>
            ))}
          </GridRow>
          {s.rows.map((r) => (
            <div key={r.key} className={r.valid ? undefined : "hatch"}>
              <GridRow cols={COLS}>
                <span style={{ fontWeight: 600 }}>{mon(r)}</span>
                <span style={{ textAlign: "right" }}>{r.on}</span>
                <span style={{ textAlign: "right" }}>{r.off}</span>
                {r.valid ? (
                  <>
                    <span style={{ textAlign: "right" }}>{pct(r.onShare)}</span>
                    <span style={{ textAlign: "right" }}>{pct(r.breakEven)}</span>
                    <span style={{ textAlign: "right" }}>{thb(r.touEnergy)}</span>
                    <span style={{ textAlign: "right" }}>{thb(r.normalEnergy)}</span>
                    <span style={{ textAlign: "right", fontWeight: 800 }}>{signedThb(r.saved)}</span>
                  </>
                ) : (
                  <span className="muted" style={{ gridColumn: "4 / 9", textAlign: "right" }}>
                    on + off = {r.on + r.off} ≠ {r.units} billed units
                  </span>
                )}
                <span style={{ textAlign: "right" }}>{thb(r.amount)}</span>
              </GridRow>
            </div>
          ))}
          <GridRow cols={COLS}>
            <span style={{ fontWeight: 800 }}>{s.valid.length} bills</span>
            <span style={{ textAlign: "right", fontWeight: 800 }}>{s.valid.reduce((a, r) => a + r.on, 0)}</span>
            <span style={{ textAlign: "right", fontWeight: 800 }}>{s.valid.reduce((a, r) => a + r.off, 0)}</span>
            <span style={{ textAlign: "right", fontWeight: 800 }}>{pct(s.onShare)}</span>
            <span style={{ textAlign: "right", fontWeight: 800 }}>{pct(s.breakEven)}</span>
            <span style={{ textAlign: "right", fontWeight: 800 }}>{thb(s.valid.reduce((a, r) => a + r.touEnergy, 0))}</span>
            <span style={{ textAlign: "right", fontWeight: 800 }}>{thb(s.valid.reduce((a, r) => a + r.normalEnergy, 0))}</span>
            <span style={{ textAlign: "right", fontWeight: 800 }}>{signedThb(s.saved)}</span>
            <span />
          </GridRow>
        </div>
      </div>
    </Section>
  );
}
