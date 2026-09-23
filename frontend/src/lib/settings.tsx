import { createContext, useCallback, useContext, useState } from "react";
import type { Home } from "@/lib/types";

/**
 * Viewer settings from the design's "Tweaks": effective rate for the Sankey ฿ tooltip, whether
 * the Sankey shows losses, and each home's system cost for payback (default from homes.json).
 * Overrides persist per browser.
 */
export interface Settings {
  effectiveRate: number; // ฿/kWh
  showLosses: boolean;
  /** System cost (฿) per home id, once the viewer has set it. */
  systemCosts: Record<string, number>;
  /** Fill missing inverter data with estimates anchored to the bills, marked "est.". */
  estimateGaps: boolean;
}

const envNum = (v: unknown, d: number) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : d);

export const DEFAULTS: Settings = {
  effectiveRate: envNum(import.meta.env.VITE_EFFECTIVE_RATE, 4.34),
  showLosses: true,
  systemCosts: {},
  estimateGaps: true,
};

const KEY = "momsolar_settings";

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    // v1 stored a single systemCost (MomHome was the only home).
    const legacy = typeof saved.systemCost === "number" ? { momhome: saved.systemCost } : {};
    return { ...DEFAULTS, ...saved, systemCosts: { ...legacy, ...(saved.systemCosts ?? {}) } };
  } catch {
    return DEFAULTS;
  }
}

interface SettingsState {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  /** A home's system cost, and whether it's still the homes.json placeholder. */
  costFor: (home: Home) => { cost: number; placeholder: boolean };
  setCost: (home: Home, cost: number | null) => void;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
}

const SettingsContext = createContext<SettingsState | null>(null);

function persist(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* not persisted in private mode */
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);
  const [dialogOpen, setDialogOpen] = useState(false);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      persist(next);
      return next;
    });
  }, []);
  const costFor = useCallback(
    (home: Home) => {
      const own = settings.systemCosts[home.id];
      return own != null ? { cost: own, placeholder: false } : { cost: home.systemCost, placeholder: home.systemCostPlaceholder ?? true };
    },
    [settings.systemCosts],
  );
  const setCost = useCallback(
    (home: Home, cost: number | null) => {
      const systemCosts = { ...settings.systemCosts };
      if (cost == null) delete systemCosts[home.id];
      else systemCosts[home.id] = cost;
      update({ systemCosts });
    },
    [settings.systemCosts, update],
  );
  return (
    <SettingsContext.Provider value={{ settings, update, costFor, setCost, dialogOpen, setDialogOpen }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings outside SettingsProvider");
  return ctx;
}
