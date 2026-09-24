import { useEffect, useState } from "react";

// Hash routing (#/<home>/<page>?d=2026-09-23) so the static build works from any folder or
// host without server rewrites. Links without a home (#/day) open the first home.

export type Route = "overview" | "day" | "trends" | "battery" | "savings" | "health" | "tv";

export const ROUTES: Route[] = ["overview", "day", "trends", "battery", "savings", "health", "tv"];

interface Parsed {
  home: string | null;
  route: Route;
  params: URLSearchParams;
}

export function parseHash(hash: string): Parsed {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const segs = path.split("/").filter(Boolean);
  const isRoute = (s?: string): s is Route => !!s && (ROUTES as string[]).includes(s);
  let home: string | null = null;
  let route: Route = "overview";
  if (isRoute(segs[0])) route = segs[0];
  else if (segs[0]) {
    home = decodeURIComponent(segs[0]);
    if (isRoute(segs[1])) route = segs[1];
  }
  return { home, route, params: new URLSearchParams(query) };
}

// The home currently shown, so links built anywhere stay on it.
let currentHome: string | null = null;

export const href = (route: Route, params?: Record<string, string>, home: string | null = currentHome): string => {
  const base = home ? `#/${encodeURIComponent(home)}/` : "#/";
  const page = route === "overview" ? "" : route;
  return `${base}${page}${params ? "?" + new URLSearchParams(params) : ""}`;
};

export function navigate(route: Route, params?: Record<string, string>, home?: string): void {
  window.location.hash = href(route, params, home ?? currentHome);
}

export function useRoute() {
  const [state, setState] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => {
      setState(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return state;
}

/** Record the home being shown (called by App once the home id is resolved). */
export function setCurrentHome(id: string): void {
  currentHome = id;
}
