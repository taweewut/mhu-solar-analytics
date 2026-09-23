import { describe, expect, it } from "vitest";
import { parseBills, parseCsv, parseDaily, parseFiveMin, parseFt } from "@/lib/csv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF, BOM and blank lines", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n1,\n')).toEqual([
      ["a", "b"], ["x, y", 'say "hi"'], ["1", ""],
    ]);
  });
});

describe("typed parsers", () => {
  it("maps 5-min headers and keeps blanks as null", () => {
    const [r] = parseFiveMin("Time,Working State,PV(W),Battery(W),SOC(%),Today Yield(kWh)\n2026-09-23 12:18:49,Normal,1449,-410,100,\n");
    expect(r).toMatchObject({ time: "2026-09-23 12:18:49", working_state: "Normal", pv_w: 1449, battery_w: -410, soc_pct: 100, today_yield_kwh: null });
    expect(r.grid_w).toBeNull(); // column absent
  });

  it("maps daily, PEA (Thai headers) and Ft", () => {
    expect(parseDaily("Time,Today Yield(kWh),Load Consumption(kWh)\n2026-09-23,14.1,7\n")[0]).toMatchObject({ date: "2026-09-23", yield_kwh: 14.1, load_kwh: 7 });
    const bills = parseBills("Month Year,Year,Usage Month,หน่วย,จำนวนเงิน\n2026-03-31,2026,3,461,2013.59\n2026-04-30,2026,4,,\n");
    expect(bills).toEqual([expect.objectContaining({ bill_date: "2026-03-31", year: 2026, month: 3, units: 461, amount_thb: 2013.59 })]);
    expect(parseFt("year,month,type,ft_rate\n2026,5,1,0.1623\n")).toEqual([{ year: 2026, month: 5, type: 1, ft_rate: 0.1623 }]);
  });
});
