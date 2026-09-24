import { InfoTip } from "@/components/InfoTip";

export interface Kpi {
  label: string;
  th: string;
  value: string;
  unit?: string;
  color?: string;
  spark?: string;
  sub: string;
  /** What the figure means and how it's worked out — the info tooltip after the label. */
  info?: string[];
  /** Where the number comes from (last line of the tooltip). */
  source?: string;
  /** Show the value dimmed (e.g. a projection on a placeholder cost). */
  dim?: boolean;
}

/**
 * KPI strip. `mobile`: 2 columns, 26px values (1a/1b); desktop: one row, 32px values (1c);
 * `large`: 36px values without sparklines (Savings 1e); `plain`: 32px without sparklines (2a–2c).
 * A tile with `info` gets an info icon after its label (review 3b §4): hover on a mouse, tap on
 * touch. Thai sub-labels are 12/16 at ink 72 % (review 3h).
 */
export function KpiGrid({ items, mobile, large, plain, style }: { items: Kpi[]; mobile?: boolean; large?: boolean; plain?: boolean; style?: React.CSSProperties }) {
  const cols = mobile ? 2 : items.length;
  return (
    <div className="kpis" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, ...style }}>
      {items.map((k, i) => (
        <div
          key={k.label}
          className="kpi"
          // An odd count on two mobile columns: the last tile spans the row instead of leaving a gap.
          style={{
            position: "relative",
            padding: mobile ? "14px 16px 12px 20px" : "16px 16px 14px",
            gridColumn: mobile && items.length % 2 && i === items.length - 1 ? "1 / -1" : undefined,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
            {k.label}
            {k.info && <InfoTip title={k.label} lines={k.info} source={k.source} alignRight={i % cols >= cols / 2} />}
          </span>
          <span className="th-sub">{k.th}</span>
          <span
            className="tnum"
            style={{ fontWeight: 800, fontSize: large ? 36 : mobile ? 26 : 32, lineHeight: 1.15, marginTop: mobile ? 6 : 8, letterSpacing: "-0.02em", opacity: k.dim ? 0.6 : 1 }}
          >
            {k.value}
            {k.unit && <span style={{ fontSize: mobile ? 13 : 14, fontWeight: 600, marginLeft: mobile ? 3 : 4 }}>{k.unit}</span>}
          </span>
          {!large && !plain && (
            <svg width="140" height="24" viewBox="0 0 140 24" style={{ display: "block", marginTop: mobile ? 4 : 8, overflow: "visible", maxWidth: "100%" }} aria-hidden="true">
              {k.spark && <path d={k.spark} fill="none" stroke={k.color} strokeWidth={2} />}
            </svg>
          )}
          <span className="caption">{k.sub}</span>
        </div>
      ))}
    </div>
  );
}
