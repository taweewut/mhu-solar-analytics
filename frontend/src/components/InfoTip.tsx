import { useEffect, useId, useRef, useState } from "react";
import { Info } from "@/components/Icons";

const FINE = typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

/**
 * Info tooltip (design review 3b §4): a 14px info icon after a label with a 44×44 hit area.
 * Hover opens it after 150 ms on a mouse, tap toggles it on touch; Esc or a tap outside closes.
 * The popover anchors to the nearest positioned ancestor (the KPI tile), below it, flush left
 * or right. Content order: what it is · the formula with its numbers · the source.
 */
export function InfoTip({ title, lines, source, alignRight }: { title: string; lines: string[]; source?: string; alignRight?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const timer = useRef<number>();

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !btn.current?.parentElement?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);

  const hover = (on: boolean) => {
    if (!FINE) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(on), on ? 150 : 100);
  };

  return (
    <span style={{ display: "contents" }} onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
      <button
        ref={btn}
        type="button"
        className="info-btn"
        aria-label={`About ${title}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <Info size={14} />
      </button>
      {open && (
        <span id={id} role="tooltip" className="popover" style={{ top: "calc(100% + 6px)", [alignRight ? "right" : "left"]: 0 }}>
          <span style={{ fontWeight: 700 }}>{title}</span>
          {lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
          {source && <span className="src">{source}</span>}
        </span>
      )}
    </span>
  );
}
