import { createContext, useContext, useState } from "react";
import type { TrendMode } from "@/lib/trends";

/** Per day | Total switch on Trends; shared so it also drives the Battery charge/discharge bars. */
const TrendModeContext = createContext<{ mode: TrendMode; setMode: (m: TrendMode) => void } | null>(null);

export function TrendModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<TrendMode>("day");
  return <TrendModeContext.Provider value={{ mode, setMode }}>{children}</TrendModeContext.Provider>;
}

export function useTrendMode() {
  const ctx = useContext(TrendModeContext);
  if (!ctx) throw new Error("useTrendMode outside TrendModeProvider");
  return ctx;
}
