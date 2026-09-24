// Row shapes shared by both data sources. Field names are the API's snake_case
// (src/momsolar/api/schemas.py); lib/csv.ts maps the CSV headers onto the same names.

export interface FiveMinRow {
  time: string; // "2026-09-23 00:03:36", local UTC+7
  working_state: string;
  alarm_code: string; // "" when no alarm
  pv_w: number | null;
  mppt1_w: number | null;
  mppt2_w: number | null;
  mppt1_v: number | null;
  mppt2_v: number | null;
  battery_w: number | null; // − = discharging
  grid_w: number | null; // − = importing
  grid_load_w: number | null;
  backup_load_w: number | null;
  soc_pct: number | null;
  soh_pct: number | null;
  temp_c: number | null;
  gen_w: number | null;
  smart_w: number | null;
  ac_coupled_w: number | null;
  today_yield_kwh: number | null;
  today_to_battery_kwh: number | null;
  today_from_battery_kwh: number | null;
  today_from_grid_kwh: number | null;
  today_grid_load_kwh: number | null;
  today_backup_load_kwh: number | null;
  total_grid_load_kwh: number | null;
  total_backup_load_kwh: number | null;
}

export interface DailyRow {
  date: string; // "2026-09-23"
  yield_kwh: number | null;
  to_grid_kwh: number | null;
  from_grid_kwh: number | null;
  to_battery_kwh: number | null;
  from_battery_kwh: number | null;
  load_kwh: number | null;
  generation_kwh: number | null;
  gen_kwh: number | null;
  smart_load_kwh: number | null;
  ac_coupled_kwh: number | null;
}

/** One home from data/homes.json (edited by hand). */
export interface Home {
  id: string;
  name: string; // "MomHome"
  subtitle: string; // desktop nav: "Solis · 7.44 kWp · 16 kWh"
  subtitleShort: string; // mobile header
  /** Switch-on date "YYYY-MM-DD"; the first data row if absent (the reports can start later). */
  installed?: string;
  kwp: number;
  battery: { kwh: number; label: string } | null;
  inverter: { brand: string; model: string | null; sn: string | null; ratedW: number | null };
  utility: "PEA" | "MEA";
  tariff: Tariff;
  /** THB paid per exported kWh (0 = export earns nothing). */
  exportRate: number;
  /**
   * The utility meter nets exports (billed units ≈ import − export), so each exported kWh
   * cancels an imported one at the retail rate. MhuHome's MEA meter did until 2024.
   */
  meterNetsExport: boolean;
  /** System cost (capex, THB) for payback; the viewer can override it in Settings. */
  systemCost: number;
  /** true while systemCost is a stand-in figure (payback shows a "placeholder" tag). */
  systemCostPlaceholder?: boolean;
  /** Known stretches without monitoring data, and why (e.g. the inverter lost its cloud link). */
  dataGaps?: DataGap[];
}

export interface DataGap {
  from: string; // "YYYY-MM-DD", inclusive
  to: string;
  reason: string;
  reasonTh?: string;
}

/** Residential tariff: progressive tiers (null = no upper bound), service charge, TOU rates. */
export interface Tariff {
  service: number;
  tiers: [number | null, number][];
  touOn: number | null;
  touOff: number | null;
}

export interface Bill {
  bill_date: string; // "Month Year": the bill date
  year: number; // usage year / month — what bills are matched on
  month: number;
  on_peak_units: number | null;
  off_peak_units: number | null;
  units: number;
  on_peak_thb: number | null;
  off_peak_thb: number | null;
  amount_thb: number;
}

/** One hour of site weather (Open-Meteo, data/<home>/weather.csv). */
export interface WeatherRow {
  time: string; // "2026-09-23 10:00", local hour start
  code: number | null; // WMO weather code
  cloud_pct: number | null;
  rain_mm: number | null;
  radiation_wm2: number | null;
}

/** The last scheduled SolisCloud fetch (data/<home>/fetch_status.json). */
export interface FetchStatus {
  checked: string; // "2026-09-23 22:32:57", local
  latest: string | null; // newest 5-min reading
  /** Set when the daily API budget paused the 5-min fetch. */
  paused: { reason: string; detail: string; until: string } | null;
}

/** A battery BMS sample (SolisCloud inverterDetail snapshot, logged every 15 min). */
export interface BmsRow {
  time: string; // the inverter's reading time, local UTC+7
  temp_min_c: number | null;
  temp_max_c: number | null;
  cell_min_v: number | null;
  cell_max_v: number | null;
  soc_pct: number | null;
}

export interface FtRate {
  year: number;
  month: number;
  type: number;
  ft_rate: number; // THB per unit
}

export interface Freshness {
  home: string;
  latest_reading: string | null;
  latest_day: string | null;
  last_bill: string | null;
  dates: string[];
  refreshing: boolean;
}

export type Period = "today" | "month" | "year" | "life";
