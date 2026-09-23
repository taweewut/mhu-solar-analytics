import { describe, expect, it } from "vitest";
import { DAY_ROWS } from "@/lib/__fixtures__/project";
import { hm } from "@/lib/format";
import { completeness, completenessFor, expectedReadings, healthDay, stateLog } from "@/lib/health";

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
