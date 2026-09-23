import { useId, useMemo, useState } from "react";
import { useHome } from "@/lib/home";
import { layoutSankey, linkOpacity, linkTip, NODE_TIP_WIDTH, nodeLinkOpacity, nodeTip, zeroLegend, type Flows, type NodeKey } from "@/lib/sankey";
import { useSettings } from "@/lib/settings";

// Type scale per placement: mobile overview (1a/1b), desktop overview (1c), day view (1d).
const VARIANTS = {
  mobile: { name: 12, sub: 10, tipPad: "10px 12px", tipFont: 12, compact: true },
  desktop: { name: 15, sub: 12, tipPad: "12px 14px", tipFont: 13, compact: false },
  day: { name: 13, sub: 11, tipPad: "10px 12px", tipFont: 12, compact: false },
} as const;

interface Props {
  flows: Flows;
  width: number;
  height: number;
  variant: keyof typeof VARIANTS;
}

/** What the pointer is over: a ribbon (kWh / % / ฿ tip) or a node (what it means). */
type Hover = { link: number } | { node: NodeKey } | null;

/** Energy-flow Sankey: SVG ribbons + nodes, HTML labels and tooltips overlaid. */
export function Sankey({ flows, width, height, variant }: Props) {
  const v = VARIANTS[variant];
  const { settings } = useSettings();
  const { home } = useHome();
  const gridName = `Grid · ${home.utility}`;
  const [hov, setHov] = useState<Hover>(null);
  const gid = useId().replace(/:/g, "");
  const layout = useMemo(
    () => (width > 0 ? layoutSankey(flows, { width, height, compact: v.compact, showLosses: settings.showLosses, gridName }) : null),
    [flows, width, height, v.compact, settings.showLosses, gridName],
  );
  if (!layout) return <div style={{ height }} />;
  const hoveredLink = hov && "link" in hov ? layout.links.find((l) => l.i === hov.link) : undefined;
  const hoveredNode = hov && "node" in hov ? layout.nodes.find((n) => n.key === hov.node) : undefined;
  const tip = hoveredLink ? linkTip(layout, hoveredLink, settings.effectiveRate) : null;
  const ntip = hoveredNode ? nodeTip(layout, hoveredNode, home.utility) : null;
  const opacity = (l: (typeof layout.links)[number]) =>
    hoveredNode ? nodeLinkOpacity(l, hoveredNode.key) : linkOpacity(l.i, hoveredLink ? hoveredLink.i : null);
  const zeroText = zeroLegend(layout);
  // Tap on touch screens: same highlight; tapping the same thing again clears it.
  const toggle = (h: NonNullable<Hover>) => setHov((cur) => (JSON.stringify(cur) === JSON.stringify(h) ? null : h));

  return (
    <div style={{ position: "relative" }} onMouseLeave={() => setHov(null)}>
      <svg width={layout.width} height={layout.height} style={{ display: "block", overflow: "visible" }} role="img" aria-label="Energy flow diagram">
        <defs>
          {layout.links.map((l) => (
            <linearGradient key={l.i} id={`${gid}-${l.i}`} gradientUnits="userSpaceOnUse" x1={l.x1} x2={l.x2} y1={0} y2={0}>
              <stop offset="0" stopColor={l.c1} />
              <stop offset="1" stopColor={l.c2} />
            </linearGradient>
          ))}
        </defs>
        {layout.links.map((l) => (
          <path
            key={l.i}
            d={l.d}
            fill={`url(#${gid}-${l.i})`}
            opacity={opacity(l)}
            onMouseEnter={() => setHov({ link: l.i })}
            onMouseLeave={() => setHov(null)}
            onClick={() => toggle({ link: l.i })}
            style={{ cursor: "pointer", transition: "opacity .15s" }}
          />
        ))}
        {layout.zeros.map((z) => (
          <path key={z.i} d={z.d} fill="none" stroke="#3a7bd5" strokeWidth={1.5} strokeDasharray="3 4" />
        ))}
        {layout.nodes.map((n) => (
          <rect
            key={n.key}
            x={n.x}
            y={n.y}
            width={n.w}
            height={n.h}
            fill={n.color}
            onMouseEnter={() => setHov({ node: n.key })}
            onClick={() => toggle({ node: n.key })}
            style={{ cursor: "help" }}
          />
        ))}
      </svg>
      {layout.nodes.map((n) => (
        <div
          key={n.key}
          style={{
            position: "absolute",
            whiteSpace: "nowrap",
            left: n.lx,
            top: n.ly,
            transform: n.anchor === "end" ? "translateX(-100%)" : "none",
            textAlign: n.anchor === "end" ? "right" : "left",
            zIndex: 1,
            cursor: "help",
          }}
          // The label explains its node on hover / focus / tap.
          tabIndex={0}
          aria-label={`${n.name} ${n.val}: what this means`}
          onMouseEnter={() => setHov({ node: n.key })}
          onFocus={() => setHov({ node: n.key })}
          onBlur={() => setHov(null)}
          onClick={() => toggle({ node: n.key })}
        >
          <div className="halo" style={{ display: "flex", flexDirection: "column", fontSize: v.name, lineHeight: 1.3 }}>
            <span>
              <span style={{ fontWeight: 800 }}>{n.name}</span> {n.val}
            </span>
            <span style={{ fontSize: v.sub }}>{n.th}</span>
            {n.sub && <span style={{ fontSize: v.sub }}>{n.sub}</span>}
          </div>
        </div>
      ))}
      {zeroText && (
        <div className="muted" style={{ marginTop: 10, display: "flex", alignItems: "flex-start", gap: 8, fontSize: v.sub + 1, lineHeight: 1.4 }}>
          <span style={{ flex: "none", width: 18, marginTop: "0.7em", borderTop: "2px dashed #3a7bd5" }} />
          <span>{zeroText}</span>
        </div>
      )}
      {tip && (
        <div className="abs" style={{ left: tip.left, top: tip.top, zIndex: 2 }}>
          <div className="tooltip" style={{ padding: v.tipPad, fontSize: v.tipFont }}>
            <span style={{ fontWeight: 800 }}>{tip.title}</span>
            <span>
              {tip.kwh} · {tip.pct}
            </span>
            <span>{tip.thb}</span>
          </div>
        </div>
      )}
      {ntip && (
        <div className="abs" role="tooltip" style={{ left: ntip.left, top: ntip.top, zIndex: 3, width: Math.min(NODE_TIP_WIDTH, layout.width), whiteSpace: "normal" }}>
          <div className="tooltip" style={{ padding: v.tipPad, fontSize: v.tipFont - 1, gap: 6, lineHeight: 1.4 }}>
            <span style={{ fontWeight: 800, fontSize: v.tipFont }}>
              {ntip.title} · {ntip.value}
            </span>
            {ntip.lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
