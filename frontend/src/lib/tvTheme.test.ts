import { describe, expect, it } from "vitest";
import { batteryFill, batteryWord, NIGHT_FROM, tvIsLight, tvPeriod } from "@/lib/tvTheme";

describe("TV theme", () => {
  it("auto = light from sunrise to sunset, dark otherwise", () => {
    expect(tvIsLight("auto", 12 * 60, 378, 1074)).toBe(true);
    expect(tvIsLight("auto", 6 * 60, 378, 1074)).toBe(false); // 06:00, before 06:18
    expect(tvIsLight("auto", 18 * 60, 378, 1074)).toBe(false); // after 17:54
    expect(tvIsLight("auto", 12 * 60)).toBe(true); // no sun data: 06:00–18:00
  });

  it("a forced theme wins", () => {
    expect(tvIsLight("dark", 12 * 60)).toBe(false);
    expect(tvIsLight("light", 23 * 60)).toBe(true);
  });

  it("sunset → 21:30 is the evening rotation, 21:30 → sunrise the night screen", () => {
    expect(NIGHT_FROM).toBe(21 * 60 + 30);
    expect(tvPeriod("auto", 18 * 60, 378, 1074)).toBe("evening");
    expect(tvPeriod("auto", 21 * 60 + 29, 378, 1074)).toBe("evening");
    expect(tvPeriod("auto", 21 * 60 + 30, 378, 1074)).toBe("night");
    expect(tvPeriod("auto", 23 * 60 + 40, 378, 1074)).toBe("night");
    expect(tvPeriod("auto", 3 * 60, 378, 1074)).toBe("night"); // after midnight
    expect(tvPeriod("auto", 377, 378, 1074)).toBe("night"); // a minute before sunrise
    expect(tvPeriod("auto", 378, 378, 1074)).toBe("day");
    expect(tvPeriod("night", 12 * 60)).toBe("night");
    expect(tvPeriod("dark", 3 * 60)).toBe("evening");
  });

  it("four battery words: ≥ 97 full · 60–96 high · 20–59 mid · < 20 low", () => {
    expect(batteryWord(100)).toBe("full");
    expect(batteryWord(97)).toBe("full");
    expect(batteryWord(96)).toBe("high");
    expect(batteryWord(60)).toBe("high");
    expect(batteryWord(59)).toBe("mid");
    expect(batteryWord(20)).toBe("mid");
    expect(batteryWord(19)).toBe("low");
    expect(batteryWord(0)).toBe("low");
  });

  it("the hero battery's fill: y = 56 + 336 × (1 − level), height = 336 × level", () => {
    expect(batteryFill(100)).toEqual({ y: 56, height: 336 });
    expect(batteryFill(86)).toEqual({ y: 103, height: 289 });
    expect(batteryFill(14)).toEqual({ y: 345, height: 47 });
    expect(batteryFill(0)).toEqual({ y: 392, height: 0 });
    expect(batteryFill(120)).toEqual({ y: 56, height: 336 });
  });
});
