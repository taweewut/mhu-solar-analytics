import { describe, expect, it } from "vitest";
import { DAY_ROWS } from "@/lib/__fixtures__/project";
import { hm } from "@/lib/format";
import { bmsDay, bmsSince, completeness, completenessFor, completenessShade, expectedReadings, healthDay, healthHistory, healthSummary, stateLog, stringRatio, windowStart, type HealthHistoryRow } from "@/lib/health";
import type { BmsRow } from "@/lib/types";

describe("data completeness = readings ÷ expected", () => {
  it("expects one reading per 5 min from first to last while the day is in progress", () => {
    expect(expectedReadings(3, 738, true)).toBe(148); // day.json: 00:03 → 12:18
    expect(expectedReadings(3, 738, false)).toBe(288); // a finished day
  });

  it("day.json: 148 of 148 so far = 100 %", () => {
    expect(completenessFor(DAY_ROWS, "2026-09-23", true)).toEqual({ date: "2026-09-23", received: 148, expected: 148, pct: 100 });
  });

  it("a finished day counts against 288, and a missing day is not loaded (null), not 0 %", () => {
    expect(completenessFor(DAY_ROWS, "2026-09-23", false).pct).toBe(51); // 148 / 288
    expect(completenessFor(DAY_ROWS, "2026-09-22", false).pct).toBeNull();
    expect(completeness(300, 288)).toBe(100);
    expect(completeness(0, 0)).toBe(0);
  });
});

describe("health KPIs from day.json", () => {
  const h = healthDay(DAY_ROWS, "2026-09-23")!;

  it("peak PV 6.09 kW at 10:38 = 61 % of 10 kW", () => {
    expect(h.peakW).toBe(6088); // MPPT1 + MPPT2
    expect((h.peakW / 1000).toFixed(2)).toBe("6.09");
    expect(hm(h.peakT)).toBe("10:38");
    expect(Math.round(h.peakW / 100)).toBe(61);
  });

  it("inverter temp max 56.2 °C at 12:18", () => {
    expect(h.tempMax).toBe(56.2);
    expect(hm(h.tempMaxT)).toBe("12:18");
  });

  it("MPPT energy 7.3 / 7.2 kWh, MPPT2 / MPPT1 = 99 %", () => {
    expect(h.mppt1Kwh.toFixed(1)).toBe("7.3");
    expect(h.mppt2Kwh.toFixed(1)).toBe("7.2");
    expect(Math.round((h.mppt2Kwh / h.mppt1Kwh) * 100)).toBe(99);
  });

  it("working state Normal on 100 % of readings, no alarms", () => {
    expect(h).toMatchObject({ state: "Normal", stateShare: 1, alarms: 0, readings: 148 });
  });
});

describe("state / alarm log", () => {
  it("is one row while nothing changes", () => {
    expect(stateLog(DAY_ROWS)).toEqual([{ from: "00:03", to: "12:18", state: "Normal", code: "", readings: 148 }]);
  });

  it("adds a row whenever Working State or Alarm Code changes", () => {
    const rows = DAY_ROWS.slice(0, 6).map((r, i) => ({
      ...r,
      working_state: i === 2 || i === 3 ? "Fault" : "Normal",
      alarm_code: i === 3 ? "1010" : i === 5 ? " " : "",
    }));
    expect(stateLog(rows).map((r) => [r.state, r.code, r.readings])).toEqual([
      ["Normal", "", 2],
      ["Fault", "", 1],
      ["Fault", "1010", 1],
      ["Normal", "", 2], // a blank code (Solis writes " ") is "no alarm"
    ]);
  });
});

describe("battery BMS log", () => {
  const b = (time: string, o: Partial<BmsRow> = {}): BmsRow => ({
    time, temp_min_c: 31, temp_max_c: 32, cell_min_v: 3.278, cell_max_v: 3.282, soc_pct: 65, ...o,
  });
  const rows = [
    b("2026-09-23 12:15:00", { temp_max_c: 34, cell_min_v: 3.3, cell_max_v: 3.312 }),
    b("2026-09-23 12:00:00"),
    b("2026-09-23 12:30:00", { temp_min_c: null, temp_max_c: null }),
    b("2026-09-22 23:45:00"),
  ];

  it("one day's samples, sorted, with blanks kept as gaps (never 0)", () => {
    const d = bmsDay(rows, "2026-09-23")!;
    expect(d.samples).toBe(3);
    expect(d.tempMax).toEqual([[720, 32], [735, 34], [750, null]]);
    expect(d.hottest).toEqual({ t: 735, c: 34 });
  });

  it("cell spread = max − min cell voltage, in mV: latest and largest", () => {
    const d = bmsDay(rows, "2026-09-23")!;
    expect([d.spreadMv, d.maxSpreadMv]).toEqual([4, 12]);
  });

  it("a day before logging started has no data, and the log start is its first sample", () => {
    expect(bmsDay(rows, "2026-09-01")).toBeNull();
    expect(bmsSince(rows)).toBe("2026-09-22");
    expect(bmsSince([])).toBeNull();
  });
});

describe("string balance and completeness shading (design review 3f)", () => {
  const r = (t: number, mppt1: number, mppt2: number) => ({ t, pv: mppt1 + mppt2, mppt1, mppt2 }) as import("@/lib/energy").Reading;

  it("MPPT2 ÷ MPPT1 in %, only while PV is above 400 W", () => {
    expect(stringRatio([r(600, 100, 99), r(700, 1000, 990), r(710, 0, 500)])).toEqual([[600, null], [700, 99], [710, null]]);
  });

  it("completeness uses an ink ramp, never battery green", () => {
    expect(completenessShade(100)).toContain("28%");
    expect(completenessShade(96)).toContain("16%");
    expect(completenessShade(80)).toContain("8%");
  });
});

describe("health history (one line per day, newest first)", () => {
  it("summarises each day with 5-min data; battery max only where the BMS was logged", () => {
    const yesterday = DAY_ROWS.map((r) => ({ ...r, time: r.time.replace("2026-09-23", "2026-09-22") }));
    const bms: BmsRow[] = [{ time: "2026-09-23 10:00:00", temp_min_c: 30, temp_max_c: 32, cell_min_v: null, cell_max_v: null, soc_pct: null }];
    const hist = healthHistory([...yesterday, ...DAY_ROWS], bms, ["2026-09-22", "2026-09-23"], "2026-09-23", true);
    expect(hist.map((r) => r.date)).toEqual(["2026-09-23", "2026-09-22"]);
    expect(hist[0]).toMatchObject({ ok: true, alarms: 0, pct: 100, batMax: 32 });
    expect(hist[1]).toMatchObject({ pct: 51, batMax: null }); // a finished day counts against 288
    expect(hist[0].balance).toBeGreaterThan(90);
  });
});

describe("health summary over 1M / 3M / 6M / since start", () => {
  it("windows end at the latest day and never start before switch-on", () => {
    expect(windowStart("1m", "2026-09-24", "2026-03-29")).toBe("2026-08-25");
    expect(windowStart("6m", "2026-09-24", "2026-03-29")).toBe("2026-03-29");
    expect(windowStart("all", "2026-09-24", "2026-03-29")).toBe("2026-03-29");
  });

  const day = (date: string, o: Partial<HealthHistoryRow> = {}): HealthHistoryRow => ({
    date, ok: true, state: "Normal", alarms: 0, balance: 99, peakW: 6000, tempMax: 55, pct: 100, batMax: null, soh: 99, alarmCodes: [], ...o,
  });
  const hist = [
    day("2026-09-24", { batMax: 32, soh: 98 }),
    day("2026-09-23", { tempMax: 64.3, balance: 93, pct: 90 }),
    day("2026-09-21", { ok: false, alarms: 2, alarmCodes: ["1015"], peakW: 9600 }),
    day("2026-08-01", { tempMax: 70 }),
  ];

  it("rolls up the days in the window; a day without data counts as 0 % data", () => {
    const s = healthSummary(hist, "2026-09-21", "2026-09-24", 10000);
    expect([s.days, s.loaded, s.normal, s.alarms, s.alarmCodes]).toEqual([4, 3, 2, 2, ["1015"]]);
    expect([s.dataPct, s.lowDataDays]).toEqual([73, 1]); // (100 + 90 + 100 + 0) / 4
    expect([s.balanceMin, s.balanceMax, s.balanceOut]).toEqual([93, 99, 1]);
    expect(s.hottest).toEqual({ date: "2026-09-23", c: 64.3 });
    expect([s.hotDays, s.clipDays]).toEqual([1, 1]);
    expect(s.batMax).toEqual({ date: "2026-09-24", c: 32 });
    expect([s.sohStart?.v, s.sohEnd?.v]).toEqual([99, 98]);
  });
});
