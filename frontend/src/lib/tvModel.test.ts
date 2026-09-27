import { describe, expect, it } from "vitest";
import type { SavingsModel } from "@/lib/tariff";
import { SCENARIOS, type ScenarioName } from "@/lib/tvFixtures";
import { dayShare, nightLoadKw, sunnyDayKwh, tvModel, TV_STALE_MIN, type Line } from "@/lib/tvModel";

const run = (name: ScenarioName, savings: SavingsModel | null = null) =>
  tvModel({ ...SCENARIOS[name](), savings, capacityKwh: 16, kwp: 7.44 });
const WJ = /\u2060/g; // the word joiner inside กิโลวัตต์
const text = (l: Line) => l.map((s) => (typeof s === "string" ? s : s.b)).join("").replace(WJ, "");
const plain = (s: string) => s.replace(WJ, "");

describe("TV model · day (12:20, battery full, rain forecast 14:00–17:00)", () => {
  const m = run("noon");

  it("is the light rotation with the clock and a Thai date", () => {
    expect(m.period).toBe("day");
    expect(m.clock).toBe("12:20");
    expect(m.date).toBe("วันพุธที่ 23 กันยายน 2569");
    expect(m.alert).toBeNull();
    expect(m.screens).toEqual(["now", "sun"]); // no bills → no savings screen
  });

  it("battery: full since the morning", () => {
    expect(m.battery.soc).toBe(100);
    expect(m.battery.word).toBe("แบตเต็มแล้ว");
    expect(plain(m.battery.sub)).toMatch(/^เต็มตั้งแต่ \d\d:\d\d น\.$/);
  });

  it("cards: today in หน่วย, the grid state as a word", () => {
    expect(text(m.now.solar.sub)).toBe("ตอนนี้ผลิตอยู่ 5.7 กิโลวัตต์");
    expect(m.now.grid.value).toBe("0");
    expect(text(m.now.grid.sub)).toBe("ตอนนี้ไม่ได้ซื้อไฟ · วันนี้ยังไม่ต้องซื้อไฟ");
  });

  it("weather: the rain later, and why not to worry", () => {
    expect(m.now.weather.icon).toBe("rain");
    expect(m.now.weather.head).toBe("บ่ายนี้ฝนจะตก ช่วง 14:00–17:00 น.");
    expect(m.now.weather.note).toBe("ช่วงฝนตก แผงจะผลิตไฟได้น้อยลง แต่แบตเต็มแล้ว ไม่ต้องห่วง");
  });

  it("hour strip: bars to 6 หน่วย, the hour in progress striped, forecast faded", () => {
    const h = (n: number) => m.strip.hours.find((x) => x.h === n)!;
    expect(m.strip.hours.map((x) => x.h)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(h(11)).toMatchObject({ pct: 90, label: "5.4", part: false, forecast: false, soc: 100 });
    expect(h(12)).toMatchObject({ part: true, label: "1.9" });
    expect(h(10).label).toBeNull(); // numbers only on the peak and the current hour
    expect(h(13)).toMatchObject({ forecast: true, kwh: null, pct: 0, soc: null });
    expect(h(14)).toMatchObject({ icon: "rain", rain: "1.7", forecast: true });
    expect(h(9).rain).toBeNull(); // dry hours leave the rain row empty
    expect(text(m.strip.lines[0])).toMatch(/^ผลิตแล้ว \d+\.\d หน่วย · วันแดดดีได้ 28 · บ้านใช้ไป \d+\.\d$/);
    expect(text(m.strip.lines[1])).toMatch(/^แบตเต็มตอน \d\d:\d\d น\. · บ่ายฝนตก ผลิตได้น้อยลง$/);
  });
});

describe("TV model · evening and night", () => {
  it("after sunset: dark rotation, the finished day, the battery carrying the house", () => {
    const m = run("evening");
    expect(m.period).toBe("evening");
    expect(m.battery.word).toBe("แบตเหลือมาก");
    expect(plain(m.battery.sub)).toBe("ใช้ไฟจากแบต 1.5 กิโลวัตต์");
    expect(text(m.now.solar.sub)).toBe("หมดแดดแล้ว · บ้านใช้ไฟจากแบต");
    expect(text(m.now.grid.sub)).toBe("ตอนนี้ไม่ได้ซื้อไฟ · วันนี้บ้านใช้ไฟจากแดดทั้งหมด");
    expect(m.now.weather).toMatchObject({ icon: "moon", head: "วันนี้แดดดี ผลิตได้ 29 หน่วย" });
    // Judged on last night's use, not the 1.5 kW cooking peak.
    expect(m.now.weather.note).toBe("แบตเต็มตั้งแต่เช้า คืนนี้พอใช้ถึงเช้า ไม่ต้องซื้อไฟ");
    expect(m.strip.hours.some((h) => h.forecast || h.part)).toBe(false);
  });

  it("21:30 → sunrise: one night screen", () => {
    const m = run("night");
    expect(m.period).toBe("night");
    expect(m.screens).toEqual([]);
    expect(m.night).toEqual({
      icon: "moon",
      date: "คืนวันพุธที่ 23 กันยายน 2569",
      head: "กลางคืน บ้านใช้ไฟจากแบต",
      note: "แบตน่าจะพอใช้ถึงเช้า · ไม่ต้องซื้อไฟ",
    });
    expect(plain(m.battery.sub)).toBe("ใช้ไฟจากแบต 0.4 กิโลวัตต์");
  });

  it("before sunrise: the sunrise line and yesterday's solar", () => {
    const m = run("dawn");
    expect(m.period).toBe("night");
    expect(m.night.date).toBe("เช้าวันพฤหัสบดีที่ 24 กันยายน 2569");
    expect(m.night.head).toBe("ยังไม่มีแดด บ้านใช้ไฟจากแบต");
    expect(m.night.note).toBe("แผงจะเริ่มผลิตไฟประมาณ 06:00 น. · เมื่อวานผลิตได้ 29 หน่วย");
    expect(m.battery.word).toBe("แบตเหลือปานกลาง");
    expect(plain(m.battery.sub)).toBe("พอใช้ถึงเช้า");
  });

  it("battery low at night: on the grid, nothing to do", () => {
    const m = run("lowNight");
    expect(m.night.date).toBe("คืนวันพุธที่ 23 กันยายน 2569"); // after midnight, still that night
    expect(m.night.icon).toBe("pole");
    expect(m.night.head).toBe("แบตเหลือน้อย บ้านใช้ไฟจากการไฟฟ้า");
    expect(m.night.note).toBe("ไม่มีอะไรต้องทำ · พอมีแดด แผงจะชาร์จแบตให้เอง");
    expect(m.battery.word).toBe("แบตเหลือน้อย");
    expect(m.battery.low).toBe(true);
    expect(plain(m.battery.sub)).toMatch(/^ตอนนี้ซื้อไฟ \d\.\d กิโลวัตต์$/);
  });
});

describe("TV model · a low battery and a rainy day", () => {
  it("low battery on a rainy morning: buying for now, the sun will charge it", () => {
    const m = run("lowDay");
    expect(m.period).toBe("day");
    expect(plain(m.battery.sub)).toBe("บ้านใช้ไฟจากการไฟฟ้า");
    expect(text(m.now.grid.sub)).toBe("ตอนนี้กำลังซื้อไฟ 0.2 กิโลวัตต์");
    expect(m.now.weather.head).toBe("เช้านี้ฝนตก แผงผลิตไฟได้น้อย");
    expect(m.now.weather.note).toBe("แบตเหลือน้อย บ้านจะใช้ไฟจากการไฟฟ้าไปก่อน · สายๆ แดดออก แผงจะชาร์จแบตต่อ");
  });

  it("raining now on a poor day: how far below a sunny day, and tonight is fine", () => {
    const m = run("rainy");
    expect(m.now.weather.icon).toBe("rain");
    expect(m.now.weather.head).toBe("ตอนนี้ฝนตก แผงผลิตไฟได้น้อย แบตชาร์จช้าลง");
    expect(m.now.weather.note).toBe("วันนี้เมฆเยอะ ผลิตได้ 10 หน่วย (วันแดดดีได้ 28 หน่วย) · แบตยังพอใช้คืนนี้");
    expect(m.battery.charging).toBe(true);
    expect(plain(m.battery.sub)).toMatch(/^ชาร์จช้าๆ \d\.\d กิโลวัตต์$/);
    expect(text(m.strip.lines[1])).toBe("แบตชาร์จช้า · ฝนตกทั้งวัน ผลิตไฟได้น้อย");
    expect(m.strip.hours.find((h) => h.h === 13)).toMatchObject({ icon: "storm", rain: "6.5" });
  });

  it("heavy rain is shown in whole mm so it fits the hour column", () => {
    const s = SCENARIOS.rainy();
    const weather = s.weather.map((w) => (w.time.endsWith("13:00") ? { ...w, rain_mm: 26.5 } : w.time.endsWith("12:00") ? { ...w, rain_mm: 9.96 } : w));
    const m = tvModel({ ...s, weather, savings: null, capacityKwh: 16, kwp: 7.44 });
    expect(m.strip.hours.find((h) => h.h === 13)!.rain).toBe("27");
    expect(m.strip.hours.find((h) => h.h === 12)!.rain).toBe("10");
  });
});

describe("TV model · data not updating", () => {
  it(`stale after ${TV_STALE_MIN} min: the band, and every figure says when it's from`, () => {
    const m = run("stale");
    expect(m.alert).toEqual({
      kind: "stale",
      head: "ข้อมูลไม่อัปเดตตั้งแต่ 09:15 น.",
      note: "ตัวเลขบนจอเป็นของเมื่อ 09:15 น. · ระบบโซลาร์ยังทำงานตามปกติ",
    });
    expect(m.clock).toBe("12:20"); // the clock stays live
    expect(plain(m.battery.sub)).toBe("เมื่อ 09:15 น.");
    expect(text(m.now.solar.sub)).toBe("เมื่อ 09:15 น. ผลิตอยู่ 3.7 กิโลวัตต์");
    expect(text(m.now.grid.sub)).toBe("เมื่อ 09:15 น. ไม่ได้ซื้อไฟ");
  });

  it("a recent reading is not stale", () => {
    const s = SCENARIOS.noon();
    const at = (hhmm: string) => new Date(`2026-09-23T${hhmm}:00`);
    expect(tvModel({ ...s, now: at("12:55"), savings: null, capacityKwh: 16, kwp: 7.44 }).alert).toBeNull();
    expect(tvModel({ ...s, now: at("13:05"), savings: null, capacityKwh: 16, kwp: 7.44 }).alert?.kind).toBe("stale");
    expect(tvModel({ ...s, feed: "paused", savings: null, capacityKwh: 16, kwp: 7.44 }).alert?.kind).toBe("stale");
  });

  it("inverter offline at night: the offline wording", () => {
    const m = run("offline");
    expect(m.period).toBe("night");
    expect(m.alert?.kind).toBe("offline");
    expect(m.alert?.head).toBe("เครื่องไม่ส่งข้อมูล ตั้งแต่ 21:05 น.");
    expect(m.alert?.note).toBe("ตัวเลขบนจอเป็นของเมื่อ 21:05 น. · ถ้าไฟในบ้านยังติด ไม่ต้องทำอะไร");
    expect(m.night.note).toBe("ข้อมูลล่าสุดเมื่อ 21:05 น.");
  });
});

describe("TV model · savings screen", () => {
  const bill = (month: number, amount: number, saved: number) => ({ key: `2026-0${month}`, year: 2026, month, amount, saved });
  const savings = {
    post: [bill(4, 620, 1200), bill(5, 638, 1300), bill(6, 592, 1500), bill(7, 588, 1600), bill(8, 564, 1700)],
    baseline: bill(3, 1906.79, 0),
    cumTotal: 18714.4,
    current: { saved: 1829.2 },
    reduction: 1 - 564 / 1906.79,
  } as unknown as SavingsModel;

  it("saved so far, this month, and the bill against before solar", () => {
    const m = run("noon", savings);
    expect(m.screens).toEqual(["now", "sun", "save"]);
    expect(m.save).toEqual({
      total: "18,714",
      rows: [
        { icon: "house", lead: "เดือนนี้ประหยัดได้ประมาณ", b: "1,829", tail: " บาท", note: "ยังไม่ครบเดือน รอบิลจากการไฟฟ้า" },
        { icon: "pole", lead: "ค่าไฟลดลง", b: "70%", tail: " จากก่อนติดโซลาร์", note: "จาก 1,907 บาท เหลือ 564 บาท ต่อเดือน" },
      ],
      basis: "คิดจากบิลการไฟฟ้า 5 เดือน เมษายน–สิงหาคม 2569 เทียบกับค่าไฟถ้าไม่มีโซลาร์",
    });
  });

  it("showSavings off takes it out of the rotation", () => {
    const m = tvModel({ ...SCENARIOS.noon(), savings, capacityKwh: 16, kwp: 7.44, showSavings: false });
    expect(m.save).toBeNull();
    expect(m.screens).toEqual(["now", "sun"]);
  });
});

describe("TV model · helpers", () => {
  it("a good sunny day is the 90th percentile of the last 30 days", () => {
    expect(sunnyDayKwh(SCENARIOS.noon().daily, "2026-09-23")).toBe(28.2);
    expect(sunnyDayKwh([], "2026-09-23")).toBeNull();
  });

  it("the share of a day's solar made by a time of day", () => {
    expect(dayShare(360, 360, 1080)).toBe(0);
    expect(dayShare(720, 360, 1080)).toBeCloseTo(0.5);
    expect(dayShare(1100, 360, 1080)).toBe(1);
  });

  it("last night's load over the same hours, or null without a full record", () => {
    const s = SCENARIOS.night();
    // 23:40 → 06:00 yesterday: 0.4 kW all night.
    expect(nightLoadKw(s.fiveMin, s.now, 6.3)).toBeCloseTo(0.4);
    expect(nightLoadKw(SCENARIOS.rainy().fiveMin, SCENARIOS.rainy().now, 15)).toBeNull();
  });
});
