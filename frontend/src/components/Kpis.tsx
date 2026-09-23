import { useState } from "react";

export interface Kpi {
  label: string;
  th: string;
  value: string;
  unit?: string;
  color?: string;
  spark?: string;
  sub: string;
  /** What the figure means and how it's worked out — shown on hover / focus / tap. */
  info?: string[];
}

const TIP_WIDTH = 300;

/**
 * KPI strip. `mobile`: 2 columns, 26px values (1a/1b); desktop: one row, 32px values (1c);
 * `large`: 36px values without sparklines (Savings 1e); `plain`: 32px without sparklines (2a–2c).
 * A tile with `info` explains itself on hover (desktop), focus (keyboard) or tap (phone).
 */
export function KpiGrid({ items, mobile, large, plain, style }: { items: Kpi[]; mobile?: boolean; large?: boolean; plain?: boolean; style?: React.CSSProperties }) {
  const cols = mobile ? 2 : items.length;
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="kpis" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, ...style }} onMouseLeave={() => setOpen(null)}>
      {items.map((k, i) => {
        // Tiles in the right half open their tip leftwards so it stays on screen.
        const alignRight = i % cols >= cols / 2;
        const tipId = `kpi-tip-${i}`;
        return (
          <div
            key={k.label}
            className="kpi"
            tabIndex={k.info ? 0 : undefined}
            aria-describedby={k.info && open === i ? tipId : undefined}
            onMouseEnter={() => k.info && setOpen(i)}
            onFocus={() => k.info && setOpen(i)}
            onBlur={() => setOpen(null)}
            onClick={() => k.info && setOpen((o) => (o === i ? null : i))}
            // An odd count on two mobile columns: the last tile spans the row instead of leaving a gap.
            style={{
              position: "relative",
              cursor: k.info ? "help" : undefined,
              padding: mobile ? "14px 20px 12px" : "16px 16px 14px",
              gridColumn: mobile && items.length % 2 && i === items.length - 1 ? "1 / -1" : undefined,
            }}
          >
            <span style={{ fontSize: mobile ? 12 : 13, fontWeight: 600 }}>{k.label}</span>
            <span className="muted" style={{ fontSize: mobile ? 10 : 11 }}>
              {k.th}
            </span>
            <span
              className="tnum"
              style={{ fontWeight: 800, fontSize: large ? 36 : mobile ? 26 : 32, lineHeight: 1.1, marginTop: mobile ? 6 : 10, letterSpacing: "-0.02em" }}
            >
              {k.value}
              {k.unit && <span style={{ fontSize: mobile ? 13 : 14, fontWeight: 600, marginLeft: mobile ? 3 : 4 }}>{k.unit}</span>}
            </span>
            {!large && !plain && (
              <svg width="140" height="24" viewBox="0 0 140 24" style={{ display: "block", marginTop: mobile ? 4 : 8, overflow: "visible", maxWidth: "100%" }} aria-hidden="true">
                {k.spark && <path d={k.spark} fill="none" stroke={k.color} strokeWidth={2} />}
              </svg>
            )}
            <span className="muted" style={{ fontSize: mobile ? 11 : 12 }}>
              {k.sub}
            </span>
            {k.info && open === i && (
              <div
                id={tipId}
                role="tooltip"
                style={{ position: "absolute", top: "calc(100% + 6px)", [alignRight ? "right" : "left"]: 0, width: `min(${TIP_WIDTH}px, 90vw)`, zIndex: 10, pointerEvents: "none" }}
              >
                <div className="tooltip" style={{ padding: "10px 12px", fontSize: 12, gap: 6, lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 800 }}>{k.label}</span>
                  {k.info.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
