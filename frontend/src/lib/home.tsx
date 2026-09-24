import { createContext, useContext } from "react";
import type { Route } from "@/lib/router";
import type { Home } from "@/lib/types";

/** What a home's data supports, which decides the pages it gets. */
export interface Caps {
  /** Has 5-minute readings (Solis All-History): Day, Health, SOC heatmap, live "Today". */
  fiveMin: boolean;
  /** Has a battery: Battery page, battery flows. */
  battery: boolean;
}

export const capsFor = (home: Home, fiveMinDates: string[]): Caps => ({
  fiveMin: fiveMinDates.length > 0,
  battery: home.battery != null,
});

/** Pages a home can show; the others are left out of its nav. */
export function routeAvailable(route: Route, caps: Caps): boolean {
  if (route === "day" || route === "health" || route === "tv") return caps.fiveMin;
  if (route === "battery") return caps.battery;
  return true;
}

interface HomeState {
  home: Home;
  homes: Home[];
}

const HomeContext = createContext<HomeState | null>(null);
export const HomeProvider = HomeContext.Provider;

export function useHome(): HomeState {
  const ctx = useContext(HomeContext);
  if (!ctx) throw new Error("useHome outside HomeProvider");
  return ctx;
}
