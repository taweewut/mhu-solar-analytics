import { ChevronLeft, ChevronRight } from "@/components/Icons";
import { KpiGrid } from "@/components/Kpis";
import { Sankey } from "@/components/Sankey";
import { PageTitle } from "@/components/ui";
import { defaultPick, PERIOD_KEYS, PERIODS, periodView } from "@/lib/energy";
import { describeGap, gapInMonth } from "@/lib/gaps";
import { useHome, type Caps } from "@/lib/home";
import { MONTH_ABBR } from "@/lib/format";
import { overviewKpis } from "@/lib/kpis";
import { useWidth } from "@/lib/layout";
import type { Model } from "@/lib/model";
import { dataMonths } from "@/lib/monthDays";
import { useSettings } from "@/lib/settings";
import type { DailyRow, FiveMinRow, Period } from "@/lib/types";
import { useMemo, useState } from "react";

interface Props {
  mobile: boolean;
  fiveMin: FiveMinRow[];
  daily: DailyRow[];
  model: Model;
  caps: Caps;
}

function PeriodControl({ period, onChange, mobile, live }: { period: Period; onChange: (p: Period) => void; mobile: boolean; live: boolean }) {
  const name = mobile ? "period-m" : "period-d";
  return (
    <div className="seg" role="radiogroup" aria-label="Period" style={mobile ? { display: "grid", gridTemplateColumns: "repeat(4, 1fr)" } : undefined}>
      {PERIOD_KEYS.map((k) => (
        <label key={k} className="seg-opt" style={mobile ? { justifyContent: "flex-start" } : { padding: "8px 16px", gap: 8 }}>
          <input type="radio" name={name} checked={k === period} onChange={() => onChange(k)} />
          {/* Without 5-minute data "Today" is really the latest day in the daily report. */}
          {k === "today" && !live ? "Latest day" : PERIODS[k].label}
          {!mobile && <span style={{ fontSize: 11, opacity: 0.75 }}>{k === "today" && !live ? "ล่าสุด" : PERIODS[k].th}</span>}
        </label>
      ))}
    </div>
  );
}

/** ‹ [Sep 2026 ▾] › — which month (or year) the Month / Year period shows. */
function PickControl({ options, value, onChange, label, fmt, stretch }: { options: string[]; value: string; onChange: (v: string) => void; label: string; fmt: (v: string) => string; stretch?: boolean }) {
  const i = options.indexOf(value);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button className="btn btn-secondary btn-icon" aria-label={`Previous ${label}`} disabled={i <= 0} onClick={() => onChange(options[i - 1])}>
        <ChevronLeft />
      </button>
      <select className="input" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: stretch ? undefined : 130, flex: stretch ? 1 : undefined, minHeight: 36 }}>
        {options.map((o) => (
          <option key={o} value={o}>
            {fmt(o)}
          </option>
        ))}
      </select>
      <button className="btn btn-secondary btn-icon" aria-label={`Next ${label}`} disabled={i < 0 || i >= options.length - 1} onClick={() => onChange(options[i + 1])}>
        <ChevronRight />
      </button>
    </div>
  );
}

/** In place of the diagram for a period with no data (e.g. an inverter outage), with the reason. */
function NoData({ height, period, pick }: { height: number; period: Period; pick: string }) {
  const { home } = useHome();
  const gap = period === "month" ? gapInMonth(home.dataGaps, pick) : period === "year" ? home.dataGaps?.find((g) => g.from.startsWith(pick) || g.to.startsWith(pick)) : undefined;
  return (
    <div className="hatch" style={{ height, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--color-divider)" }}>
      <div style={{ background: "var(--color-bg)", padding: "12px 16px", textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>No data for this period</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {gap ? `${describeGap(gap)} — the panels kept working, but no readings reached the cloud.` : "The inverter report has no values for these days."}
        </div>
        {gap?.reasonTh && (
          <div className="muted" style={{ fontSize: 12 }}>
            {gap.reasonTh}
          </div>
        )}
      </div>
    </div>
  );
}

const monthLabel = (k: string) => `${MONTH_ABBR[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;

export function Overview({ mobile, fiveMin, daily, model, caps }: Props) {
  const { home } = useHome();
  const [period, setPeriod] = useState<Period>("today");
  const [picks, setPicks] = useState<Partial<Record<Period, string>>>({});
  const { settings } = useSettings();
  const [ref, width] = useWidth<HTMLDivElement>();
  const months = useMemo(() => dataMonths(daily), [daily]);
  const years = useMemo(() => [...new Set(months.map((m) => m.slice(0, 4)))], [months]);
  // Month always offers a picker; Year only once there is more than one year of data.
  const options = period === "month" ? months : period === "year" && years.length > 1 ? years : null;
  const pick = picks[period] ?? defaultPick(period, model.asOf);
  const view = useMemo(
    () => periodView(period, fiveMin, daily, pick, { battery: caps.battery }),
    [period, fiveMin, daily, pick, caps.battery],
  );
  const picker = options && (
    <PickControl
      stretch={mobile}
      options={options}
      value={pick}
      label={period === "month" ? "month" : "year"}
      fmt={period === "month" ? monthLabel : (y) => y}
      onChange={(v) => setPicks((p) => ({ ...p, [period]: v }))}
    />
  );
  const kpis = useMemo(
    () => overviewKpis({ fiveMin, daily, asOf: model.asOf, savings: model.savings, rate: settings.effectiveRate, home, period, pick }),
    [fiveMin, daily, model, settings.effectiveRate, home, period, pick],
  );

  if (mobile) {
    return (
      <>
        <div style={{ padding: "16px 20px 0", display: "flex", flexDirection: "column", gap: 12 }}>
          <PageTitle mobile title="Energy flow" sub={`การไหลของพลังงาน · ${view.range}${view.estDays ? ` · incl. ${view.estDays} est. days` : ""}`} />
          <PeriodControl mobile live={caps.fiveMin} period={period} onChange={setPeriod} />
          {picker}
          <div ref={ref} style={{ marginTop: 4 }}>
            {view.empty ? <NoData height={290} period={period} pick={pick} /> : <Sankey flows={view.flows} width={width} height={290} variant="mobile" />}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "12px 0 4px", borderTop: "2px solid var(--color-divider)" }}>
            <span style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.25, textWrap: "pretty" } as React.CSSProperties}>{view.captionEn}</span>
            <span className="muted-72" style={{ fontSize: 13 }}>
              {view.captionTh}
            </span>
          </div>
        </div>
        <KpiGrid mobile items={kpis} style={{ marginTop: 12 }} />
      </>
    );
  }

  return (
    <>
      <div style={{ padding: "28px 48px 0", display: "flex", alignItems: "flex-end", gap: 24 }}>
        <PageTitle title="Energy flow" sub={`การไหลของพลังงาน · ${view.range}${view.estDays ? ` · incl. ${view.estDays} estimated days` : ""}`} />
        {picker}
        <PeriodControl mobile={false} live={caps.fiveMin} period={period} onChange={setPeriod} />
      </div>
      <div style={{ margin: "20px 48px 0", paddingTop: 24, borderTop: "2px solid var(--color-divider)" }}>
        <div ref={ref}>
          {view.empty ? <NoData height={400} period={period} pick={pick} /> : <Sankey flows={view.flows} width={width} height={400} variant="desktop" />}
        </div>
      </div>
      <div style={{ margin: "24px 48px 0", paddingTop: 16, borderTop: "2px solid var(--color-divider)", display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 24, lineHeight: 1.2 }}>{view.captionEn}</span>
        <span className="muted-72" style={{ fontSize: 16 }}>
          {view.captionTh}
        </span>
      </div>
      <KpiGrid items={kpis} style={{ margin: "24px 48px 0" }} />
    </>
  );
}
