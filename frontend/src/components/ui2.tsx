// Pieces shared by the v2 pages (Trends / Battery / Health).

import { SectionTitle } from "@/components/ui";

/** A 2px-ruled section with a title row (title left, legend / extras right). */
export function Section({
  en,
  th,
  extra,
  note,
  style,
  children,
}: {
  en: string;
  th: string;
  extra?: React.ReactNode;
  note?: React.ReactNode;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <section style={{ borderTop: "2px solid var(--color-divider)", paddingTop: 20, display: "flex", flexDirection: "column", gap: 12, minWidth: 0, ...style }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "8px 16px", flexWrap: "wrap" }}>
        <div style={{ marginRight: "auto" }}>
          <SectionTitle en={en} th={th} />
        </div>
        {extra}
      </div>
      {children}
      {note && (
        <span className="muted" style={{ fontSize: 11 }}>
          {note}
        </span>
      )}
    </section>
  );
}

/** Legend swatch for estimated bars (lighter fill, dashed outline). */
export function EstLegend({ children = "Estimated" }: { children?: React.ReactNode }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      <span style={{ width: 14, height: 10, background: "color-mix(in srgb, var(--color-text) 15%, transparent)", border: "1.5px dashed var(--color-text)" }} />
      {children}
    </span>
  );
}

/** Small "est." marker for estimated figures. */
export const EstTag = ({ title }: { title?: string }) => (
  <span className="tag tag-neutral" title={title} style={{ marginLeft: 6, padding: "1px 6px", fontSize: 10, border: "1px dashed var(--color-divider)" }}>
    est.
  </span>
);

export function Legend({ color, line, dashed, children }: { color: string; line?: boolean; dashed?: boolean; children: React.ReactNode }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      {line ? (
        <span style={{ width: 14, height: 0, borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }} />
      ) : (
        <span style={{ width: 14, height: 10, background: color }} />
      )}
      {children}
    </span>
  );
}

/** Segmented control with EN label + small TH label (desktop 1c style). */
export function Seg<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: [T, string, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map(([k, en, th]) => (
        <label key={k} className="seg-opt" style={{ padding: "8px 16px", gap: 8 }}>
          <input type="radio" name={name} checked={k === value} onChange={() => onChange(k)} />
          {en}
          <span style={{ fontSize: 11, opacity: 0.75 }}>{th}</span>
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
