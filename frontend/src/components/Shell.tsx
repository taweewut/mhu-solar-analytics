import { useEffect, useRef, useState } from "react";
import { Activity, BarChart3, BatteryMedium, Clock, LayoutDashboard, Moon, Pause, Settings, Sun, TriangleAlert, Wallet } from "@/components/Icons";
import type { FeedState } from "@/lib/status";
import { routeAvailable, useHome, type Caps } from "@/lib/home";
import { href, navigate, type Route } from "@/lib/router";
import { useSettings } from "@/lib/settings";
import { useTheme } from "@/lib/theme";

export const NAV: { route: Route; label: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { route: "overview", label: "Overview", icon: LayoutDashboard },
  { route: "day", label: "Day", icon: Clock },
  { route: "trends", label: "Trends", icon: BarChart3 },
  { route: "battery", label: "Battery", icon: BatteryMedium },
  { route: "savings", label: "Savings", icon: Wallet },
  { route: "health", label: "Health", icon: Activity },
];

/**
 * "MomHome Solar ▾" — the home switcher. A native <select> sits invisibly over the name, so
 * it's one tap on a phone and keeps the design's type; with one home it's plain text.
 */
function HomeSwitch({ size, route }: { size: number; route: Route }) {
  const { home, homes } = useHome();
  const label = `${home.name} Solar`;
  if (homes.length < 2) return <>{label}</>;
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4 }}>
      {label}
      <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
      <select
        aria-label="Home"
        value={home.id}
        // Stay on the same page when the other home has it; Overview otherwise.
        onChange={(e) => navigate(route, undefined, e.target.value)}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", font: "inherit" }}
      >
        {homes.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name} — {h.subtitleShort}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * Status chip (review 3b §3): the live feed in four states, carried by icon and words, ink only.
 * Desktop shows the full line; mobile shows icon + time in a 44px chip. Tap / click opens the
 * details (source · last reading · last / next fetch).
 */
function StatusChip({ feed, mobile }: { feed: FeedState; mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);
  const icon =
    feed.kind === "live" ? (
      <span style={{ width: 6, height: 6, background: "currentColor", flex: "none" }} />
    ) : feed.kind === "paused" ? (
      <Pause size={12} />
    ) : feed.kind === "stale" ? (
      <Clock size={12} />
    ) : (
      <TriangleAlert size={12} />
    );
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" className={`chip chip-${feed.kind}`} aria-expanded={open} aria-label={`Data status: ${feed.line}`} onClick={() => setOpen((o) => !o)}>
        {icon}
        {mobile ? feed.short : feed.line}
      </button>
      {open && (
        <span role="dialog" className="popover" style={{ top: "calc(100% + 6px)", right: 0 }}>
          <span style={{ fontWeight: 700 }}>{feed.line}</span>
          {feed.detail.map((l) => (
            <span key={l} className="src">
              {l}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

function ThemeButton() {
  const { theme, toggle } = useTheme();
  return (
    <button className="btn btn-secondary btn-icon" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={toggle}>
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}

function SettingsButton() {
  const { setDialogOpen } = useSettings();
  return (
    <button className="btn btn-secondary btn-icon" aria-label="Settings" onClick={() => setDialogOpen(true)}>
      <Settings />
    </button>
  );
}

/** Desktop nav (1c/1d/1e). */
export function TopNav({ route, feed, caps }: { route: Route; feed: FeedState | null; caps: Caps }) {
  const { home } = useHome();
  return (
    <nav className="nav" style={{ padding: "16px 48px", gap: 28 }}>
      <span className="nav-brand" style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <HomeSwitch size={18} route={route} />
        <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
          {home.subtitle}
        </span>
      </span>
      {NAV.filter((n) => routeAvailable(n.route, caps)).map((n) => (
        <a key={n.route} href={href(n.route)} aria-current={n.route === route ? "page" : undefined}>
          {n.label}
        </a>
      ))}
      {feed && <StatusChip feed={feed} />}
      <span className="nav-tools" style={{ marginLeft: -12 }}>
        <SettingsButton />
        <ThemeButton />
      </span>
    </nav>
  );
}

/** Mobile header (1a/1b). */
export function MobileHeader({ feed, route }: { feed: FeedState | null; route: Route }) {
  const { home } = useHome();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 10px 20px", borderBottom: "2px solid var(--color-divider)" }}>
      <div style={{ display: "flex", flexDirection: "column", marginRight: "auto", minWidth: 0 }}>
        <span style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.2 }}>
          <HomeSwitch size={18} route={route} />
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          {home.subtitleShort}
        </span>
      </div>
      {feed && <StatusChip feed={feed} mobile />}
      <SettingsButton />
      <ThemeButton />
    </div>
  );
}

/** Mobile bottom tab bar (1a/1b). */
export function TabBar({ route, caps }: { route: Route; caps: Caps }) {
  const items = NAV.filter((n) => routeAvailable(n.route, caps));
  return (
    <nav className="tabbar" aria-label="Sections" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((n) => (
        <a key={n.route} className="tab" href={href(n.route)} aria-current={n.route === route ? "page" : undefined}>
          <n.icon size={20} />
          <span>{n.label}</span>
        </a>
      ))}
    </nav>
  );
}
