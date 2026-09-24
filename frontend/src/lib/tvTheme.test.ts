import { describe, expect, it } from "vitest";
import { tvIsLight } from "@/pages/Tv";

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
});
