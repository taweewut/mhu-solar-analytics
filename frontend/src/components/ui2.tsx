// Pieces shared by the v2 pages (Trends / Battery / Health).

import { TriangleAlert } from "@/components/Icons";
import { SectionTitle } from "@/components/ui";

/**
 * A 2px-ruled section with the chart header (review 3b §2): title block left, legend right
 * (wraps under the title on narrow screens). `rule={false}` for a section that directly follows
 * a KPI row, which already ends in a 2px rule (review: no double rules).
 */
export function Section({
  en,
  th,
  extra,
  note,
  rule = true,
  style,
  children,
}: {
  en: string;
  th: string;
  extra?: React.ReactNode;
  note?: React.ReactNode;
  rule?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <section style={{ borderTop: rule ? "2px solid var(--color-divider)" : undefined, paddingTop: rule ? 18 : 0, display: "flex", flexDirection: "column", gap: 12, minWidth: 0, ...style }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px 24px", flexWrap: "wrap" }}>
        <div style={{ marginRight: "auto" }}>
          <SectionTitle en={en} th={th} />
        </div>
        {extra && <div className="sec-legend">{extra}</div>}
      </div>
      {children}
      {note && <span className="caption">{note}</span>}
    </section>
  );
}

/** A legend row (series at 12px) inside a chart header. */
export const LegendRow = ({ children }: { children: React.ReactNode }) => (
  <div className="legend-row">{children}</div>
);

/** The data states actually present in a chart (review 3b §1), as an 11px legend row. */
export function StateRow({ est, noData, zero, after, last }: { est?: string | boolean; noData?: boolean; zero?: boolean; after?: boolean; last?: string | null }) {
  const item = (swatch: React.ReactNode, label: string) => (
    <span key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {swatch}
      {label}
    </span>
  );
  const items = [
    est && item(<span style={{ width: 16, height: 10, boxSizing: "border-box", border: "1.5px dashed var(--color-text)" }} />, typeof est === "string" ? est : "Estimated"),
    noData && item(<span className="hatch" style={{ width: 16, height: 10 }} />, "No data"),
    zero && item(<span style={{ width: 16, borderTop: "1px dotted color-mix(in srgb, var(--color-text) 50%, transparent)" }} />, "0 kWh"),
    after && item(<span style={{ width: 16, height: 10, boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--color-text) 20%, transparent)" }} />, "After last reading"),
    last && item(<span style={{ width: 2, height: 12, background: "var(--color-accent)" }} />, `Last reading ${last}`),
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="legend-row muted-72" style={{ fontSize: 11 }}>
      {items}
    </div>
  );
}

/**
 * Legend swatch for estimates (review 3b §1): dashed 1.5px outline with a 35 % fill in the series
 * colour; a counterfactual ("without solar") is outline only.
 */
export function EstLegend({ children = "Estimated", color = "var(--color-text)", outline }: { children?: React.ReactNode; color?: string; outline?: boolean }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      <span style={{ width: 10, height: 10, boxSizing: "border-box", border: `1.5px dashed ${color}`, background: outline ? undefined : `color-mix(in srgb, ${color} 35%, transparent)` }} />
      {children}
    </span>
  );
}

/** "est." tag: 10px 600 with a 1px dashed ink border. */
export const EstTag = ({ title, style }: { title?: string; style?: React.CSSProperties }) => (
  <span className="tag-est" title={title} style={{ marginLeft: 6, ...style }}>
    est.
  </span>
);

/** Warning tag: ink outline + triangle-alert (never accent red, which is for active / NOW). */
export const WarnTag = ({ children, title }: { children: React.ReactNode; title?: string }) => (
  <span className="tag-warn" title={title}>
    <TriangleAlert size={9} />
    {children}
  </span>
);

/** Series legend item: 10×10 swatch for bars/areas, 16×2 for lines (colour or weight, never dash). */
export function Legend({ color, line, weight = 2, children }: { color: string; line?: boolean; weight?: number; children: React.ReactNode }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      {line ? <span style={{ width: 16, height: weight, background: color }} /> : <span style={{ width: 10, height: 10, background: color }} />}
      {children}
    </span>
  );
}

/** Segmented control: English with the Thai under it at 11px (review 3h); Thai dropped on mobile. */
export function Seg<T extends string>({ name, value, options, onChange, mobile }: { name: string; value: T; options: [T, string, string][]; onChange: (v: T) => void; mobile?: boolean }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map(([k, en, th]) => (
        <label key={k} className="seg-opt" style={{ padding: mobile ? "10px 14px" : "6px 16px", flexDirection: "column", alignItems: "flex-start", gap: 0, lineHeight: 1.25 }}>
          <input type="radio" name={name} checked={k === value} onChange={() => onChange(k)} />
          <span>{en}</span>
          {!mobile && <span style={{ fontSize: 11, opacity: 0.8 }}>{th}</span>}
        </label>
      ))}
    </div>
  );
}

/** Table header / row on a CSS grid, as in the 2b / 2c tables. */
export function GridRow({ cols, head, children }: { cols: string; head?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={head ? "table-head" : "tnum"}
      style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "8px 0", alignItems: "center", borderBottom: head ? undefined : "1px solid var(--color-divider)" }}
    >
      {children}
    </div>
  );
}
