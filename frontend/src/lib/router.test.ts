import { describe, expect, it } from "vitest";
import { capsFor, routeAvailable } from "@/lib/home";
import { href, parseHash } from "@/lib/router";
import type { Home } from "@/lib/types";

describe("routes carry the home", () => {
  it("parses #/<home>/<page>?query", () => {
    const r = parseHash("#/mhuhome/trends");
    expect([r.home, r.route]).toEqual(["mhuhome", "trends"]);
    const d = parseHash("#/momhome/day?d=2026-09-23");
    expect([d.home, d.route, d.params.get("d")]).toEqual(["momhome", "day", "2026-09-23"]);
    expect(parseHash("#/mhuhome").route).toBe("overview");
  });

  it("keeps v1 links (no home) working", () => {
    const r = parseHash("#/day?d=2026-09-23");
    expect([r.home, r.route]).toEqual([null, "day"]);
    expect(parseHash("").route).toBe("overview");
  });

  it("builds links for a home", () => {
    expect(href("overview", undefined, "mhuhome")).toBe("#/mhuhome/");
    expect(href("day", { d: "2026-09-23" }, "momhome")).toBe("#/momhome/day?d=2026-09-23");
  });
});

describe("pages follow the home's data", () => {
  const base = { kwp: 5, inverter: { brand: "Huawei", model: null, sn: null, ratedW: null } } as unknown as Home;
  const huawei = { ...base, battery: null } as Home;
  const solis = { ...base, battery: { kwh: 16, label: "" } } as Home;

  it("hides Health / TV without 5-minute data and Battery without a battery; Day always shows", () => {
    const caps = capsFor(huawei, []);
    // Day falls back to the daily report for a home without 5-minute data.
    expect(["overview", "day", "trends", "savings"].every((r) => routeAvailable(r as never, caps))).toBe(true);
    expect(["health", "tv", "battery"].some((r) => routeAvailable(r as never, caps))).toBe(false);
    const full = capsFor(solis, ["2026-09-23"]);
    expect(["day", "health", "battery"].every((r) => routeAvailable(r as never, full))).toBe(true);
  });
});
