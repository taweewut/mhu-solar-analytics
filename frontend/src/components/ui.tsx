// Small shared pieces in the Modernist language.

/** Chart / section title block (review 3b §2): 22/28 800 (20/26 on mobile), sub 12/16 ink 72 %. */
export function SectionTitle({ en, th }: { en: string; th: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className="sec-title">{en}</span>
      <span className="sec-sub">{th}</span>
    </div>
  );
}

export function PageTitle({ title, sub, mobile }: { title: string; sub: string; mobile?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginRight: "auto" }}>
      {mobile ? (
        <span style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.15 }}>{title}</span>
      ) : (
        <h1 style={{ margin: 0, fontSize: 42 }}>{title}</h1>
      )}
      <span className="muted" style={{ fontSize: mobile ? 12 : 14 }}>
        {sub}
      </span>
    </div>
  );
}

export const Swatch = ({ color, h = 10, style }: { color: string; h?: number; style?: React.CSSProperties }) => (
  <span style={{ width: 14, height: h, background: color, flex: "none", ...style }} />
);

export const Dot = ({ color }: { color: string }) => <span style={{ width: 8, height: 8, flex: "none", background: color }} />;

/** Chart axis label, positioned in chart coordinates (mockup `LS` helper). */
export function AxisLabel({ x, y, anchor = "start", children }: { x: number; y: number; anchor?: "start" | "end" | "middle"; children: React.ReactNode }) {
  const transform = anchor === "end" ? "translate(-100%,-50%)" : anchor === "middle" ? "translate(-50%,-50%)" : "translateY(-50%)";
  return (
    <div className="abs" style={{ left: x, top: y, transform }}>
      <span className="muted-72" style={{ fontSize: 11 }}>
        {children}
      </span>
    </div>
  );
}
