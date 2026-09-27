# Prompt for the Claude Code session

Paste everything below the line into Claude Code, run from the repo root
(`/Users/taweewut/dev/electric_solar/mhu-solar-analytics`).

---

Rebuild the TV view `frontend/src/pages/Tv.tsx` from the design review in
`docs/tv-design/tv-design-review.html`. Open that file in a browser first (it is a
single self-contained page; the frames are 1920×1080 screens shown at 50 %) and read
`docs/tv-design/TV-DESIGN-HANDOFF.md` for the data sources and TV limits.
Then read the CSS in the review's `<style>` block: every `.tv-*` rule is meant to be
ported as-is; only the values and structure change, not the look.

## What to build

A Thai-only living-room TV view for two viewers over 80. Four screens share one frame:
a header (home name + Thai date left, clock right, 2 px rule) and a body with a
1094 px left column, a 2 px vertical rule and a fixed 520 px battery column on the right.
The battery column is identical on every screen, day and night.

1. **ตอนนี้** (60 s): two cards on the left (solar today in หน่วย with power now; grid
   bought today in หน่วย with the state as a word), weather band at the bottom.
2. **แดดวันนี้** (45 s): hour strip 06–18: weather icon row, rain row (mm, Archivo 36, #1f4f96 light / #8fb8ee dark, filled on wet hours only, faded for forecast hours), solar bar row (หน่วย, max
   6 = 100 % height, striped bar = hour in progress, faded icons = forecast, numbers only
   on the peak hour and the current hour), hour row, battery-% row. Two summary lines.
3. **ประหยัดค่าไฟ** (30 s, in the rotation; keep a `showSavings` flag, default on).
4. **Night** (21:30 → sunrise, stays): moon, 260 px clock, date, one sentence, battery.

Palettes: `.tv` light, `.tv.dark` (sunset → 21:30), `.tv.dark.night` (dimmed; 21:30 →
sunrise). `.tv.stale` adds the black alert band above the header and desaturates the body.
The rotation, states and every sentence are in §1, §4 and §8 of the review; the type
scale and safe area in §7; the SVG sprite is the hidden `<svg>` at the top of the file
(copy it to `frontend/src/tv/sprite.svg` or inline it once in Tv.tsx).

## Rules that must survive the port

- Sizing: every CSS length is `calc(var(--u) * N)`, N = px at 1080p. Set
  `--u: 0.0520833vw` on `.tv` (the review uses `--u: .5px` only to show frames at 50 %).
  Do not convert to rem/px.
- Chrome 79 (LG webOS): no `gap` on flex (grid `grid-gap` is fine), no `aspect-ratio`,
  no `inset`, no `color-mix()`, no `:is/:where/:has`, no container queries, no nesting.
  Plain hex only; one palette per class.
- Fonts: IBM Plex Sans Thai Looped 400/700 for Thai, Archivo 700/800 for numerals and
  the clock. Load from Google Fonts. Nothing under 36 px at 1080p. Thai line-height ≥ 1.2.
- Contrast ≥ 7:1 for any real text. Series colours (#e9a825 #3fa66a #3a7bd5 #8b5cc7)
  appear only inside the SVG pictures, the solar bars and the battery fill. The
  battery-row text uses #1a5c36 on light, #6fcf95 on dark.
- Battery hero: viewBox 0 0 240 416; fill rect `y = 56 + 336 × (1 − level)`,
  `height = 336 × level`; bolt polygon shown while charging; fill #ec3013 (light) /
  #d2452e (night) under 20 %; #2f7d50 fill in night palette.
- Battery words: ≥ 97 แบตเต็มแล้ว · 60–96 แบตเหลือมาก · 20–59 แบตเหลือปานกลาง ·
  < 20 แบตเหลือน้อย.
- Grid card shows the state as a word (ตอนนี้ไม่ได้ซื้อไฟ / ตอนนี้กำลังซื้อไฟ 0.3 กิโลวัตต์)
  so "0.3 kW now" and "0 หน่วย today" never read as a contradiction.
- Transitions: two stacked frames, `transition: opacity 2s ease-in-out`. No sliding.
- OLED: keep the `tvdrift` keyframes on `.tv-safe` (±10 px over 600 s, transform only).
- Safe area: 96 px left/right, 64 px top/bottom at 1080p. No slide dots. Remote ◀ ▶
  still jumps between screens; no other input.
- No English on the main view. Thai dates with Buddhist year, Arabic numerals, "12:20 น.".

## Data wiring (see the handoff appendix for the functions)

- `lib/energy.ts` readingsFor / dayTotals → solar, home, grid today in หน่วย and power now.
- `lib/battery.ts` daylight → sunrise/sunset from first/last panel output → palette and
  the night screen; `lib/kpis.ts` → time the battery became full.
- Hourly solar and hourly battery % from the 5-minute series; `lib/dayReport.ts` → the
  30-day / sunny-day comparison (24 · 28 หน่วย).
- `lib/weather.ts` weatherDay / daySummary / rainSpells → icon per hour (forecast hours
  faded) and the sentence, chosen by the table in §8.
- `lib/status.ts` feedStatus → `.stale` after 15 min without a reading, `offline` text
  variant when the inverter stops sending.
- `lib/kpis.ts` savingsKpis → screen 3.
- Night line: hours = level × capacity ÷ home load now; if hours > hoursToSunrise + 2 show
  "แบตน่าจะพอใช้ถึงเช้า", else "แบตอาจไม่พอถึงเช้า บ้านจะใช้ไฟจากการไฟฟ้า".

## Deliver

- `Tv.tsx` rewritten, plus a `tvCopy.ts` holding every Thai string from §8 keyed by
  condition, and `tvTheme.ts` extended for the three palettes (keep `tvIsLight` tests
  passing; add tests for the 21:30 night switch and the four battery words).
- Run with sample data (`#/momhome/tv?s=600&theme=light`, clock 12:20 on 23/09/2026) and
  compare each screen with the review frames. Also check `?s=600` at a 1280×720 viewport.
- Screenshot every state in §3–§4 into `docs/tv-design/build/` so the design can be
  compared side by side.
