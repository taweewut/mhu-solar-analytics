import { useMemo } from "react";
import { KpiGrid } from "@/components/Kpis";
import { BillChart, CumulativeChart } from "@/components/SavingsCharts";
import { TouAnalysis } from "@/components/TouAnalysis";
import { PageTitle, SectionTitle, Swatch } from "@/components/ui";
import { dmy, MONTH_ABBR, thb } from "@/lib/format";
import { savingsKpis } from "@/lib/kpis";
import { useWidth } from "@/lib/layout";
import type { Model } from "@/lib/model";
import { COLORS } from "@/lib/sankey";
import { describeGap, gapInMonth } from "@/lib/gaps";
import { useHome } from "@/lib/home";
import { useSettings } from "@/lib/settings";
import { payback } from "@/lib/tariff";
import type { Bill, DailyRow } from "@/lib/types";

const RIGHT = new Set([1, 2, 4, 5, 6, 7]);
/** Bills in the bar chart; the table below always lists every bill. */
const CHART_BILLS = 12;

export function Savings({ mobile, model, bills, daily }: { mobile: boolean; model: Model; bills: Bill[]; daily: DailyRow[] }) {
  const s = model.savings;
  const { home } = useHome();
  const { costFor, setDialogOpen } = useSettings();
  const { cost, placeholder } = costFor(home);
  const [cumRef, cumW] = useWidth<HTMLDivElement>();
  const kpis = useMemo(() => savingsKpis(s, home.utility), [s, home.utility]);
  const pay = payback(s.cumTotal, s.avgMonthly, cost, model.commissioned);
  const pad = mobile ? 20 : 48;
  const u = home.utility;
  const meter = home.inverter.brand;
  const reconHead = ["Bill month", `${u} units`, home.meterNetsExport ? `${meter} import − export` : `${meter} import`, "Meter gap", "Actual bill", "Without solar", "Saved", "฿ / unit"];
  const years = new Set(s.bills.map((b) => b.year)).size > 1;
  // Years of history: the baseline and the latest bills; the table keeps them all.
  const chartBills = s.bills.length > CHART_BILLS ? [...(s.baseline ? [s.baseline] : []), ...s.post.slice(-(CHART_BILLS - 1))] : s.bills;

  const fts = [...new Set(s.post.map((b) => b.ft))].sort((a, b) => a - b);
  const ftList = fts.length > 4 ? `${fts[0].toFixed(4)} to ${fts.at(-1)!.toFixed(4)}` : fts.map((f) => f.toFixed(4)).join(" / ");
  const ftText = s.ftFromTable
    ? `Ft × units at each bill month's rate from the Ft history table (${ftList} ฿/unit)`
    : `Ft ${s.ftBackSolved.toFixed(4)} ฿/unit`;
  const firstPost = s.post[0];
  const t = home.tariff;
  const touBills = s.post.filter((b) => b.tou);
  const note =
    `Without-solar estimate = ${u} Type 1.2 tiers (${t.tiers.map((x) => x[1]).join(" / ")} ฿) on (${meter} load + meter gap) + ฿${t.service} service + ${ftText} + VAT 7 %.` +
    (s.ftFromTable ? "" : " Ft back-solved from the pre-solar bill until the Ft history table is connected.") +
    (touBills.length && t.touOn != null
      ? ` TOU bills (${MONTH_ABBR[touBills[0].month - 1]} ${touBills[0].year} →): actual bill + solar used at home × ${t.touOn} ฿ on weekdays / ${t.touOff} ฿ at weekends + Ft, + VAT (daily data can't split hours, so weekday solar counts as on-peak).`
      : "") +
    (home.meterNetsExport
      ? ` The ${u} meter netted exports (billed units ≈ import − export), so each exported kWh cancelled an imported one at the retail rate; the estimate adds export back.`
      : home.exportRate > 0
        ? ` Export earns ${home.exportRate} ฿/kWh.`
        : " Export earns nothing.") +
    (s.bills.some((b) => b.noData) ? " Bills for months without inverter meter data (\"no solar data\", \"inverter offline\") are left out of the savings — the solar still worked then, so the real saving is higher." : "") +
    (home.dataGaps ?? []).map((g) => ` ${describeGap(g)}.`).join("") +
    (s.bills.some((b) => b.estDays)
      ? ` Bills marked est. use estimated solar for the outage days (the same month a year earlier), so their saving is an estimate too.`
      : "") +
    (firstPost ? ` ${MONTH_ABBR[firstPost.month - 1]}${years ? ` ${firstPost.year}` : ""} gap includes pre-solar days in the billing cycle.` : "");

  return (
    <>
      <div style={{ padding: `${mobile ? 16 : 28}px ${pad}px 0` }}>
        <PageTitle mobile={mobile} title="Savings" sub={`ประหยัดได้ · actual ${u} bills vs. estimated bill without solar`} />
      </div>
      <KpiGrid items={kpis} large mobile={mobile} style={{ margin: mobile ? "16px 0 0" : `20px ${pad}px 0` }} />

      <div className="split" style={{ margin: `28px ${pad}px 0` }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px 16px", flexWrap: "wrap" }}>
            <div style={{ marginRight: "auto" }}>
              <SectionTitle en="Bill per month" th={`ค่าไฟรายเดือน · THB incl. VAT${chartBills.length < s.bills.length ? ` · latest ${chartBills.length} of ${s.bills.length} bills` : ""}`} />
            </div>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}><Swatch color={COLORS.grid} />Actual {u} bill</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span style={{ width: 14, height: 10, border: "1.5px solid var(--color-text)", background: `repeating-linear-gradient(45deg,transparent 0 3px,${COLORS.loss} 3px 5px)` }} />
              Without solar (est.)
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}><Swatch color={COLORS.before} />Before solar</span>
          </div>
          <div className={mobile ? "hscroll" : undefined}>
            <BillChart bills={chartBills} utility={u} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SectionTitle en="Cumulative saved" th="ประหยัดสะสม" />
          <div ref={cumRef}>
            <CumulativeChart s={s} width={mobile ? cumW : Math.min(cumW, 352)} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "2px solid var(--color-divider)", paddingTop: 14, marginTop: 4 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 16, marginRight: "auto" }}>Payback · คืนทุน</span>
              <span className="tnum" style={{ fontWeight: 800, fontSize: 16 }}>{(pay.pct * 100).toFixed(1)} %</span>
            </div>
            <div style={{ height: 14, background: "var(--color-surface)", border: "1px solid var(--color-divider)", position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pay.pct * 100}%`, background: "var(--color-text)" }} />
            </div>
            <div className="muted-72" style={{ display: "flex", gap: 8, fontSize: 12 }}>
              <span style={{ marginRight: "auto" }}>
                {thb(s.cumTotal)} of {thb(cost)}
              </span>
              <span>Projected {pay.date ? dmy(pay.date) : "—"}</span>
            </div>
            {placeholder && (
              <button className="tag tag-accent tag-button" style={{ alignSelf: "flex-start" }} onClick={() => setDialogOpen(true)}>
                System cost is a placeholder · set it in Settings
              </button>
            )}
          </div>
        </div>
      </div>

      <TouAnalysis bills={bills} daily={daily} mobile={mobile} style={{ margin: `32px ${pad}px 0` }} />

      <div style={{ margin: `32px ${pad}px 0`, borderTop: "2px solid var(--color-divider)", paddingTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: mobile ? "stretch" : "flex-end", gap: mobile ? 8 : 16, flexDirection: mobile ? "column" : "row" }}>
          <div style={{ marginRight: "auto" }}>
            <SectionTitle en="Bill reconciliation" th={`กระทบยอด · ${u} meter vs. ${meter} grid import`} />
          </div>
          <span className="muted-72" style={{ fontSize: 12, maxWidth: 460 }}>
            {u} bill is the truth for cost; {meter} is the truth for energy. The gap is billing-cycle offset plus loads the {meter} meter can't see.
          </span>
        </div>
        <div className="hscroll">
          <div style={{ display: "flex", flexDirection: "column", fontSize: 14 }}>
            <div className="recon-row muted" style={{ borderBottom: "2px solid var(--color-divider)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 65%, transparent)" }}>
              {reconHead.map((h, i) => (
                <span key={h} style={{ textAlign: RIGHT.has(i) ? "right" : undefined }}>{h}</span>
              ))}
            </div>
            {s.bills.map((b) => (
              <div key={b.key} className="recon-row tnum" style={{ borderBottom: "1px solid var(--color-divider)" }}>
                <span style={{ fontWeight: 600 }}>
                  {MONTH_ABBR[b.month - 1]} {b.year}
                  {b.pre ? " · baseline" : ""}
                </span>
                <span style={{ textAlign: "right" }}>{b.units}</span>
                <span style={{ textAlign: "right" }}>
                  {b.siteDays === 0 ? "—" : b.pre ? `${b.siteImport.toFixed(1)} (${b.siteDays} days)` : b.siteImport.toFixed(1)}
                </span>
                <span>
                  <span className={b.pre || b.noData || b.gap <= 40 ? "tag tag-neutral" : "tag tag-accent"}>
                    {b.pre ? "pre-solar" : b.noData ? (gapInMonth(home.dataGaps, b.key) ? "inverter offline" : "no solar data") : `${b.gap >= 0 ? "+" : "−"}${Math.abs(b.gap).toFixed(1)} kWh`}
                  </span>
                  {b.estDays > 0 && (
                    <span className="tag tag-neutral" style={{ marginLeft: 4, border: "1px dashed var(--color-divider)" }} title={`${b.estDays} days of this month are outage estimates`}>
                      est.
                    </span>
                  )}
                  {b.tou && (
                    <span className="tag tag-neutral" style={{ marginLeft: 4 }} title="Billed on a TOU meter">
                      TOU
                    </span>
                  )}
                </span>
                <span style={{ textAlign: "right" }}>{thb(b.amount)}</span>
                <span style={{ textAlign: "right" }}>{b.pre || b.noData ? "—" : thb(b.withoutSolar)}</span>
                <span style={{ textAlign: "right", fontWeight: 800 }}>{b.pre || b.noData ? "—" : thb(b.saved)}</span>
                <span style={{ textAlign: "right" }}>{b.perUnit.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
        <span className="muted" style={{ fontSize: 11 }}>{note}</span>
      </div>
    </>
  );
}
