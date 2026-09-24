import { describe, expect, it } from "vitest";
import { feedStatus } from "@/lib/status";

const base = { lastDay: "2026-09-23", source: "SolisCloud API every 15 min" };
const now = new Date("2026-09-23T22:40:00");

describe("status chip: always the live feed, four states by severity", () => {
  it("live: the newest reading's time", () => {
    const s = feedStatus({ ...base, lastReading: "2026-09-23 22:33:49", fetch: { checked: "2026-09-23 22:37:39", latest: null, paused: null }, now });
    expect([s.kind, s.line, s.short]).toEqual(["live", "Live · 22:33", "22:33"]);
    expect(s.detail).toContain("Next fetch ≈ 22:52");
  });

  it("paused by the API limit until 07:00", () => {
    const paused = { reason: "daily API limit", detail: "", until: "2026-09-24 07:00" };
    const s = feedStatus({ ...base, lastReading: "2026-09-23 21:58:49", fetch: { checked: "2026-09-23 22:37:39", latest: null, paused }, now });
    expect([s.kind, s.line, s.short]).toEqual(["paused", "Paused · last 21:58 · back 07:00", "21:58"]);
  });

  it("stale after 26 h: a daily-only home 23 days behind", () => {
    const s = feedStatus({ ...base, lastReading: null, lastDay: "2026-08-31", now });
    expect([s.kind, s.line, s.short]).toEqual(["stale", "Data to 31/08 · 22 days old", "31/08"]);
  });

  it("offline when the inverter's own state says so, above everything else", () => {
    const s = feedStatus({ ...base, lastReading: "2026-09-23 21:58:49", lastState: "Offline", now });
    expect([s.kind, s.line]).toEqual(["offline", "Inverter offline since 21:58"]);
  });
});
