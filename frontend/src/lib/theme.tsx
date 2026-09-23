import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Theme: follows the system until the viewer picks one; the choice is kept in localStorage
 * and applied as `data-theme` on <html> (index.html re-applies it before first paint).
 */
export type Theme = "light" | "dark";

const KEY = "momsolar_theme";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

const systemTheme = (): Theme =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";

function savedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === "dark" || t === "light" ? t : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<Theme | null>(savedTheme);
  const [system, setSystem] = useState<Theme>(systemTheme);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const on = () => setSystem(mq.matches ? "dark" : "light");
    mq?.addEventListener("change", on);
    return () => mq?.removeEventListener("change", on);
  }, []);

  const theme = saved ?? system;
  useEffect(() => {
    if (saved) document.documentElement.dataset.theme = saved;
    else delete document.documentElement.dataset.theme;
  }, [saved]);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: still switch for this visit */
    }
    setSaved(next);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}
