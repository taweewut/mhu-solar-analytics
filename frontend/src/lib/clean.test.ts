import { describe, expect, it } from "vitest";
import { cleanDaily, padDays } from "@/lib/clean";
import type { DailyRow } from "@/lib/types";

const row = (date: string, imp: number | null, load: number | null, exp: number | null = 0): DailyRow => ({
  date, yield_kwh: 15, from_grid_kwh: imp, to_battery_kwh: null, from_battery_kwh: null, load_kwh: load,
  to_grid_kwh: exp, generation_kwh: 15, gen_kwh: null, smart_load_kwh: null, ac_coupled_kwh: null,
});

describe("cleanDaily", () => {
  it("drops meter values on a no-battery day with 0 import (meter not reading, MhuHome Jun 2021)", () => {
    const [off, ok] = cleanDaily([row("2021-06-01", 0, 12), row("2021-06-02", 8, 20)], { battery: null });
    expect(off).toMatchObject({ yield_kwh: 15, from_grid_kwh: null, load_kwh: null, to_grid_kwh: null });
    expect(ok).toMatchObject({ from_grid_kwh: 8, load_kwh: 20 });
  });

  it("keeps a battery home's 0-import day: the battery really can cover the night", () => {
    const d = [row("2026-07-10", 0, 12)];
    expect(cleanDaily(d, { battery: { kwh: 16, label: "" } })).toEqual(d);
  });

  it("drops load that has no grid import beside it (MhuHome 2021), for any home", () => {
    const [d] = cleanDaily([row("2021-03-01", null, 18, 4)], { battery: { kwh: 16, label: "" } });
    expect(d).toMatchObject({ yield_kwh: 15, load_kwh: null, from_grid_kwh: null, to_grid_kwh: null });
  });
});

describe("padDays", () => {
  it("adds blank days from switch-on to the first report day (MhuHome: 20/09 → 23/09/2020)", () => {
    const out = padDays([row("2020-09-23", 9, 17), row("2020-09-25", 10, 15)], "2020-09-20");
    expect(out.map((d) => d.date)).toEqual(["2020-09-20", "2020-09-21", "2020-09-22", "2020-09-23", "2020-09-24", "2020-09-25"]);
    expect(out[0]).toMatchObject({ yield_kwh: null, load_kwh: null }); // missing, not 0
    expect(padDays([row("2020-09-23", 9, 17)])).toHaveLength(1); // no install date: as is
  });
});
