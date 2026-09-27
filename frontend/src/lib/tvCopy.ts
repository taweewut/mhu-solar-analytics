// Every Thai string on the TV (docs/tv-design/tv-design-review.html §8), keyed by condition.
// The TV is Thai-only: energy in หน่วย (1 หน่วย = 1 kWh, as on the bill), power in กิโลวัตต์,
// money in บาท, Buddhist-era years, Arabic numerals, times as "12:20 น.".

import type { BatteryWord } from "@/lib/tvTheme";

/** Placeholder until homes.json gives the home a Thai name (`nameTh`). */
export const DEFAULT_HOME_NAME = "บ้านคุณแม่";

const WEEKDAY = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export const MONTH_TH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** "2026-09-23" → "วันพุธที่ 23 กันยายน 2569" (prefix "คืน" / "เช้า" for the night screen). */
export function thaiDate(iso: string, prefix: "" | "คืน" | "เช้า" = ""): string {
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7);
  const d = +iso.slice(8, 10);
  const wd = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${prefix}วัน${wd}ที่ ${d} ${MONTH_TH[m - 1]} ${y + 543}`;
}

/** "2026-09-22" → "22 กันยายน" (a stale band older than today). */
export const thaiDayMonth = (iso: string): string => `${+iso.slice(8, 10)} ${MONTH_TH[+iso.slice(5, 7) - 1]}`;

/** Month + Buddhist year: "สิงหาคม 2569". */
export const thaiMonthYear = (year: number, month: number): string => `${MONTH_TH[month - 1]} ${year + 543}`;

export const UNIT = "หน่วย";
/** กิโลวัตต์ with a word joiner: Thai line breaking would otherwise split it as กิโล|วัตต์. */
export const KW = "กิโล\u2060วัตต์";
export const BAHT = "บาท";
export const CLOCK_SUFFIX = "น.";

export const BATTERY_WORD: Record<BatteryWord, string> = {
  full: "แบตเต็มแล้ว",
  high: "แบตเหลือมาก",
  mid: "แบตเหลือปานกลาง",
  low: "แบตเหลือน้อย",
};

/** Battery sub-line: one at a time, ≤ ~22 Thai characters so it fits 520 px at 40 px. */
export const BATTERY_SUB = {
  fullSince: (t: string) => `เต็มตั้งแต่ ${t} น.`,
  charging: "แดดกำลังชาร์จแบต",
  chargingSlow: (kw: string) => `ชาร์จช้าๆ ${kw} ${KW}`,
  supplying: (kw: string) => `ใช้ไฟจากแบต ${kw} ${KW}`,
  fromGrid: "บ้านใช้ไฟจากการไฟฟ้า",
  buying: (kw: string) => `ตอนนี้ซื้อไฟ ${kw} ${KW}`,
  lastsTillMorning: "พอใช้ถึงเช้า",
  resting: "แบตพัก",
  asOf: (t: string) => `เมื่อ ${t} น.`,
};

/** Screen 1 cards. Values in <b> are passed separately so the view can set them in Archivo. */
export const CARD = {
  solarLabel: "วันนี้แผงผลิตไฟได้",
  gridLabel: "วันนี้ซื้อไฟจากการไฟฟ้า",
  producingNow: "ตอนนี้ผลิตอยู่", // + <b>5.7</b> กิโลวัตต์
  producingAt: (t: string) => `เมื่อ ${t} น. ผลิตอยู่`, // stale
  at: (t: string) => `เมื่อ ${t} น.`,
  notProducing: "ตอนนี้แผงไม่ได้ผลิตไฟ",
  sunCharging: "แดดกำลังชาร์จแบต",
  sunChargingSlow: "แดดกำลังชาร์จแบตช้าๆ",
  sunDone: "หมดแดดแล้ว",
  houseOnBattery: "บ้านใช้ไฟจากแบต",
  houseOnGrid: "บ้านใช้ไฟจากการไฟฟ้า",
  notBuying: "ตอนนี้ไม่ได้ซื้อไฟ",
  buyingNow: "ตอนนี้กำลังซื้อไฟ", // + <b>0.3</b> กิโลวัตต์
  notBuyingAt: (t: string) => `เมื่อ ${t} น. ไม่ได้ซื้อไฟ`,
  buyingAt: (t: string) => `เมื่อ ${t} น. กำลังซื้อไฟ`,
  noImportYet: "วันนี้ยังไม่ต้องซื้อไฟ",
  allFromSun: "วันนี้บ้านใช้ไฟจากแดดทั้งหมด",
};

/** Part of the day a rain spell starts in: เช้านี้ / บ่ายนี้ / เย็นนี้. */
export const partOfDay = (hour: number): string => (hour < 12 ? "เช้านี้" : hour < 16 ? "บ่ายนี้" : "เย็นนี้");
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Weather band and night sentences (headline · second line). */
export const SAY = {
  sunny: "แดดดี แผงผลิตไฟได้เต็มที่",
  partly: "มีเมฆบางส่วน แผงยังผลิตไฟได้ดี",
  cloudy: "เมฆมาก แผงผลิตไฟได้น้อยลง",
  chargingSlower: "แบตชาร์จช้ากว่าปกติ",
  rainingNow: (hour: number, charging: boolean) =>
    `${hour < 11 ? "เช้านี้" : "ตอนนี้"}ฝนตก แผงผลิตไฟได้น้อย${charging ? " แบตชาร์จช้าลง" : ""}`,
  rainLater: (from: number, to: number) => `${partOfDay(from)}ฝนจะตก ช่วง ${hh(from)}–${hh(to)} น.`,
  rainLaterFull: "ช่วงฝนตก แผงจะผลิตไฟได้น้อยลง แต่แบตเต็มแล้ว ไม่ต้องห่วง",
  rainLaterNotFull: "ช่วงฝนตก แผงจะผลิตไฟได้น้อยลง แบตอาจไม่เต็มวันนี้",
  dayBelow: (kwh: number, sunny: number) => `วันนี้เมฆเยอะ ผลิตได้ ${kwh} หน่วย (วันแดดดีได้ ${sunny} หน่วย)`,
  dayGood: (kwh: number) => `วันนี้แดดดี ผลิตได้ ${kwh} หน่วย`,
  lastsTonight: "แบตยังพอใช้คืนนี้",
  full: "แบตเต็มแล้ว",
  fullSince: (t: string) => `เต็มตั้งแต่ ${t} น.`,
  sunCharging: "แดดกำลังชาร์จแบต",
  lowDay: "แบตเหลือน้อย บ้านจะใช้ไฟจากการไฟฟ้าไปก่อน",
  sunLaterCharges: (hour: number) => `${hour < 12 ? "สายๆ " : partOfDay(hour).replace("นี้", "")}แดดออก แผงจะชาร์จแบตต่อ`,
  // Evening (sunset → 21:30), screen 1
  fullSinceMorning: "แบตเต็มตั้งแต่เช้า",
  fullSinceAfternoon: "แบตเต็มตั้งแต่บ่าย",
  tonightEnough: "คืนนี้พอใช้ถึงเช้า ไม่ต้องซื้อไฟ",
  tonightShort: "คืนนี้แบตอาจไม่พอถึงเช้า",
  // Night (21:30 → sunrise)
  nightOnBattery: "กลางคืน บ้านใช้ไฟจากแบต",
  nightEnough: "แบตน่าจะพอใช้ถึงเช้า · ไม่ต้องซื้อไฟ",
  nightShort: "แบตอาจไม่พอถึงเช้า บ้านจะใช้ไฟจากการไฟฟ้า",
  nightLow: "แบตเหลือน้อย บ้านใช้ไฟจากการไฟฟ้า",
  nightLowCalm: "ไม่มีอะไรต้องทำ · พอมีแดด แผงจะชาร์จแบตให้เอง",
  dawn: "ยังไม่มีแดด บ้านใช้ไฟจากแบต",
  dawnSun: (t: string) => `แผงจะเริ่มผลิตไฟประมาณ ${t} น.`,
  yesterday: (kwh: number) => `เมื่อวานผลิตได้ ${kwh} หน่วย`,
  lastReading: (t: string) => `ข้อมูลล่าสุดเมื่อ ${t} น.`,
};

/** Screen 2 · แดดวันนี้. */
export const STRIP = {
  title: "แดดวันนี้ กับไฟที่แผงผลิตได้",
  legend: "แดดดี ผลิตไฟได้มาก · เมฆหรือฝน ผลิตไฟได้น้อย",
  rowSky: "อากาศ",
  rowRain: "ฝน (มม.)",
  rowSolar: ["ผลิตไฟ", "(หน่วย)"] as const,
  rowHour: "เวลา",
  rowBattery: "แบต (%)",
  made: "ผลิตแล้ว", // day; + <b>19.8</b> หน่วย
  madeDone: "ผลิตได้", // evening
  sunnyDay: "วันแดดดีได้", // + <b>28</b>
  homeUsed: "บ้านใช้ไป", // + <b>7.3</b>
  fullAt: "แบตเต็มตอน", // + <b>10:52</b> น.
  fullSince: "แบตเต็มตั้งแต่", // evening
  chargingSlow: "แบตชาร์จช้า",
  rainLater: (from: number) => `${partOfDay(from).replace("นี้", "")}ฝนตก ผลิตได้น้อยลง`,
  rainyDay: "ฝนตกทั้งวัน ผลิตไฟได้น้อย",
  rainNow: "ฝนตก ผลิตไฟได้น้อย",
  partlyLine: "มีเมฆบางส่วน ผลิตไฟได้ดี",
  cloudyDay: "เมฆมาก ผลิตไฟได้น้อยลง",
  sunnyDayLine: "แดดดี ผลิตไฟได้มาก",
  sunDone: "หมดแดดแล้ว ใช้ไฟจากแบต",
  sunDoneGrid: "หมดแดดแล้ว ใช้ไฟจากการไฟฟ้า",
};

/** Screen 3 · ประหยัดค่าไฟ. */
export const SAVE = {
  title: "ตั้งแต่ติดโซลาร์ ประหยัดค่าไฟไปแล้ว",
  month: "เดือนนี้ประหยัดได้ประมาณ", // + <b>1,829</b> บาท
  monthNote: "ยังไม่ครบเดือน รอบิลจากการไฟฟ้า",
  lastBill: (month: string) => `บิลเดือน${month} ประหยัดได้`, // + <b>…</b> บาท
  lastBillNote: "จากบิลการไฟฟ้า",
  reduced: "ค่าไฟลดลง", // + <b>70%</b> จากก่อนติดโซลาร์
  reducedTail: "จากก่อนติดโซลาร์",
  reducedFromTo: (from: string, to: string) => `จาก ${from} บาท เหลือ ${to} บาท ต่อเดือน`,
  basis: (n: number, span: string) => `คิดจากบิลการไฟฟ้า ${n} เดือน ${span} เทียบกับค่าไฟถ้าไม่มีโซลาร์`,
};

/** The black band while the data isn't updating. */
export const ALERT = {
  stale: (since: string) => `ข้อมูลไม่อัปเดตตั้งแต่ ${since} น.`,
  offline: (since: string) => `เครื่องไม่ส่งข้อมูล ตั้งแต่ ${since} น.`,
  staleNote: (t: string) => `ตัวเลขบนจอเป็นของเมื่อ ${t} น. · ระบบโซลาร์ยังทำงานตามปกติ`,
  offlineNote: (t: string) => `ตัวเลขบนจอเป็นของเมื่อ ${t} น. · ถ้าไฟในบ้านยังติด ไม่ต้องทำอะไร`,
};
