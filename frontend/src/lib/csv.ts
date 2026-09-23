// Minimal RFC-4180 CSV reader + the header maps from the processed CSVs (project.md §3,
// src/momsolar/schema.py) onto the typed rows in lib/types.ts. bills.csv has the same
// columns for PEA and MEA homes.

import type { Bill, BmsRow, DailyRow, FiveMinRow, FtRate } from "@/lib/types";

/** Parse CSV text into rows of cells. Handles quotes, escaped quotes, CRLF and a BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}

const num = (v: string | undefined): number | null => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Map each CSV record through a header → field table; text fields stay strings. */
function mapRecords<T>(text: string, fields: Record<string, string>, textFields: string[]): T[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const idx = Object.entries(fields).map(([col, key]) => [header.indexOf(col), key] as const);
  return body.map((cells) => {
    const out: Record<string, unknown> = {};
    for (const [i, key] of idx) {
      const raw = i >= 0 ? cells[i] : undefined;
      out[key] = textFields.includes(key) ? (raw ?? "") : num(raw);
    }
    return out as T;
  });
}

export const FIVE_MIN_FIELDS: Record<string, keyof FiveMinRow> = {
  Time: "time",
  "Working State": "working_state",
  "Alarm Code": "alarm_code",
  "PV(W)": "pv_w",
  "MPPT1(W)": "mppt1_w",
  "MPPT2(W)": "mppt2_w",
  "MPPT1(V)": "mppt1_v",
  "MPPT2(V)": "mppt2_v",
  "Battery(W)": "battery_w",
  "Grid(W)": "grid_w",
  "Grid Load(W)": "grid_load_w",
  "Backup Load(W)": "backup_load_w",
  "SOC(%)": "soc_pct",
  "SOH(%)": "soh_pct",
  "Temp(C)": "temp_c",
  "GEN(W)": "gen_w",
  "Smart(W)": "smart_w",
  "AC Coupled(W)": "ac_coupled_w",
  "Today Yield(kWh)": "today_yield_kwh",
  "Today Energy to Battery(kWh)": "today_to_battery_kwh",
  "Today Energy from Battery(kWh)": "today_from_battery_kwh",
  "Today Energy from Grid(kWh)": "today_from_grid_kwh",
  "Today Grid Load(kWh)": "today_grid_load_kwh",
  "Today Backup Load(kWh)": "today_backup_load_kwh",
  "Total Grid Load(kWh)": "total_grid_load_kwh",
  "Total Backup Load(kWh)": "total_backup_load_kwh",
};

export const DAILY_FIELDS: Record<string, keyof DailyRow> = {
  Time: "date",
  "Today Yield(kWh)": "yield_kwh",
  "Energy to Grid(kWh)": "to_grid_kwh",
  "Energy from Grid(kWh)": "from_grid_kwh",
  "Energy to Battery(kWh)": "to_battery_kwh",
  "Energy from Battery(kWh)": "from_battery_kwh",
  "Load Consumption(kWh)": "load_kwh",
  "Generation(kWh)": "generation_kwh",
  "GEN(kWh)": "gen_kwh",
  "Smart Load(kWh)": "smart_load_kwh",
  "AC Coupled(kWh)": "ac_coupled_kwh",
};

export const BILL_FIELDS: Record<string, keyof Bill> = {
  "Month Year": "bill_date",
  Year: "year",
  "Usage Month": "month",
  "On Peak unit": "on_peak_units",
  "Off Peak unit": "off_peak_units",
  หน่วย: "units",
  OnPeak: "on_peak_thb",
  OffPeak: "off_peak_thb",
  จำนวนเงิน: "amount_thb",
};

export const BMS_FIELDS: Record<string, keyof BmsRow> = {
  Time: "time",
  "Battery Temp Min(C)": "temp_min_c",
  "Battery Temp Max(C)": "temp_max_c",
  "Cell Min(V)": "cell_min_v",
  "Cell Max(V)": "cell_max_v",
  "SOC(%)": "soc_pct",
};

export const FT_FIELDS: Record<string, keyof FtRate> = {
  year: "year",
  month: "month",
  type: "type",
  ft_rate: "ft_rate",
};

export const parseFiveMin = (text: string) =>
  mapRecords<FiveMinRow>(text, FIVE_MIN_FIELDS, ["time", "working_state", "alarm_code"]);
export const parseBms = (text: string) => mapRecords<BmsRow>(text, BMS_FIELDS, ["time"]);
export const parseDaily = (text: string) => mapRecords<DailyRow>(text, DAILY_FIELDS, ["date"]);
export const parseBills = (text: string) =>
  mapRecords<Bill>(text, BILL_FIELDS, ["bill_date"]).filter(
    (b) => b.bill_date && b.units != null && b.amount_thb != null,
  );
export const parseFt = (text: string) =>
  mapRecords<FtRate>(text, FT_FIELDS, []).filter((r) => r.ft_rate != null);

/** Serialise rows to CSV text (quotes cells that need it). */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

/** Save CSV text as a file in the browser (UTF-8 BOM so Excel reads the Thai text). */
export function downloadCsv(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
