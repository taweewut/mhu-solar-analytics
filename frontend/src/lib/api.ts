// Data client. Two interchangeable sources behind one typed surface:
//   • static (default) — fetch data/homes.json and data/<home>/*.csv and parse them here;
//   • api — the momsolar FastAPI (`VITE_API_BASE_URL`), which serves the same rows as JSON.
// Everything downstream (lib/energy, lib/sankey, lib/tariff) is identical for both.

import { parseBills, parseBms, parseDaily, parseFiveMin, parseFt } from "@/lib/csv";
import type { Bill, BmsRow, DailyRow, FetchStatus, FiveMinRow, Freshness, FtRate, Home } from "@/lib/types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "";
const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

export const dataSource: "api" | "static" = API_BASE ? "api" : "static";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail || `HTTP ${res.status}`);
  }
  return res;
}

const getJson = async <T>(path: string): Promise<T> => (await request(`${API_BASE}${path}`)).json() as Promise<T>;

/** A static data file; a missing optional file (no 5-min data, no Ft table) is empty, not an error. */
async function getFile(file: string): Promise<string | null> {
  const res = await fetch(`${DATA_BASE}${file}`, { cache: "no-cache" });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, `${file}: ${res.statusText}`);
  const text = await res.text();
  // Vite's dev server answers unknown paths with index.html — treat that as missing too.
  return text.trimStart().startsWith("<") ? null : text;
}

// Last parse per file, by ETag: the dashboard re-checks the data every few minutes, and an
// unchanged 5 MB CSV should cost a 304, not a re-parse and a re-render.
const parsed = new Map<string, { tag: string; rows: unknown[] }>();

async function getCsv<T>(file: string, parse: (text: string) => T[]): Promise<T[]> {
  const res = await fetch(`${DATA_BASE}${file}`, { cache: "no-cache" });
  if (res.status === 404) return [];
  if (!res.ok) throw new ApiError(res.status, `${file}: ${res.statusText}`);
  const tag = res.headers.get("etag") ?? res.headers.get("last-modified");
  const hit = tag ? parsed.get(file) : undefined;
  if (hit && hit.tag === tag) return hit.rows as T[];
  const text = await res.text();
  // Vite's dev server answers unknown paths with index.html — treat that as missing too.
  if (text.trimStart().startsWith("<")) return [];
  const rows = parse(text);
  if (tag) parsed.set(file, { tag, rows });
  return rows;
}

const home = (id: string) => encodeURIComponent(id);

export const data = {
  homes: async (): Promise<Home[]> => {
    if (dataSource === "api") return getJson("/homes");
    const text = await getFile("homes.json");
    if (text == null) throw new ApiError(404, "data/homes.json is missing");
    return JSON.parse(text) as Home[];
  },
  fiveMin: (id: string): Promise<FiveMinRow[]> =>
    dataSource === "api" ? getJson(`/homes/${home(id)}/5min`) : getCsv(`${home(id)}/5min.csv`, parseFiveMin),
  daily: (id: string): Promise<DailyRow[]> =>
    dataSource === "api" ? getJson(`/homes/${home(id)}/daily`) : getCsv(`${home(id)}/daily.csv`, parseDaily),
  bills: (id: string): Promise<Bill[]> =>
    dataSource === "api" ? getJson(`/homes/${home(id)}/bills`) : getCsv(`${home(id)}/bills.csv`, parseBills),
  /** Battery BMS samples; empty for a home that doesn't log them. */
  bms: (id: string): Promise<BmsRow[]> =>
    dataSource === "api" ? getJson(`/homes/${home(id)}/bms`) : getCsv(`${home(id)}/bms.csv`, parseBms),
  ft: (): Promise<FtRate[]> => (dataSource === "api" ? getJson("/ft-rates") : getCsv("ft_rates.csv", parseFt)),
  /** The last scheduled API fetch (static data only; null when there is none). */
  fetchStatus: async (id: string): Promise<FetchStatus | null> => {
    if (dataSource === "api") return null;
    const text = await getFile(`${home(id)}/fetch_status.json`);
    return text == null ? null : (JSON.parse(text) as FetchStatus);
  },
  freshness: (id: string): Promise<Freshness> => getJson(`/homes/${home(id)}/freshness`),
  refresh: async (): Promise<{ status: string }> => (await request(`${API_BASE}/refresh`, { method: "POST" })).json(),
};
