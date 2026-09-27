# TV mode: design handoff · ทีวีของคุณพ่อคุณแม่

**For:** a Claude Design session to redesign the living-room TV view of the Home Solar dashboard.
**Viewers:** the owner's parents, both over 80, who read Thai.
**Screen:** LG webOS TV, 1920×1080. **Code:** `frontend/src/pages/Tv.tsx`.
**Updated:** 27/09/2026.

The parents should be able to see, from the sofa and in a few seconds, whether the sun is doing its
job, how full the battery is, and why today is different from yesterday. The current view was
built from the desktop dashboard's parts and doesn't do that yet.

Every screenshot and sketch uses the repo's **invented sample data** (`sample_data/`), never the
real homes' figures. The clock is frozen at 12:20 on the sample day, Wednesday 23/09/2026.

---

## 1. Who's watching

The owner's mother and father, both over 80, at home all day. They read Thai; English on screen is
noise to them. They know electricity in **หน่วย** (units), the word on every PEA and MEA bill, not in
kW or kWh. They won't press buttons, so the TV has to explain itself.

Four questions they actually ask, which the screen should answer at a glance:

| They ask | Meaning |
|---|---|
| **วันนี้แดดดีไหม** | Is it a good sun day? Why is the output lower than yesterday? |
| **แบตเหลือเท่าไร** | How full is the battery? Will it last the night? |
| **ต้องซื้อไฟไหม** | Are we buying electricity from the utility right now? |
| **ประหยัดไปเท่าไร** | How much has the solar saved us? |

The rest of the family (the owner, grandchildren, guests) sees it too, but the parents come first.
Where the two conflict, design for the parents.

## 2. Direction sketches

Two rough frames to show the intent: pictures, very large numbers, the battery as the hero, and the
weather explaining the day. They're a starting point, not the design; please improve on them.

### Sketch A · ตอนนี้ (right now)

![Sketch A](tv/sketch-a-now.png)

- **Battery:** it sits in the middle and is the biggest thing on screen. Its level is drawn as a
  picture and said in words ("แบตเต็มแล้ว").
- **Side cards:** the big numbers are today's หน่วย; power right now is the small line under them.
- **Weather band:** it doesn't just say "rain". It says what the rain means for the panels and the
  battery.

### Sketch B · แดดวันนี้ (today's sun, hour by hour)

![Sketch B](tv/sketch-b-sun-by-hour.png)

Each hour shows the weather above the solar it produced, so "cloudy means less" is visible without
reading.
- **Faded icons:** the forecast for the rest of the day.
- **The striped bar:** the hour still in progress.
- **The battery row:** the charge climbing while the sun is good.
- **Numbers on bars:** only the peak and the current hour.

## 3. Design rules for 80+ eyes

These are proposals. Adjust them if you have a better answer, but keep the intent.

- **Size (at 1080p):** key numbers at least **180 px** tall, labels at least **48 px**, nothing
  under **36 px**. If something can't be that big, it doesn't belong on the TV.
- **Thai typeface:** use a **looped Thai face** (หัวกลม), such as *IBM Plex Sans Thai Looped*, which
  is on Google Fonts. Older Thai readers learned on looped letters and read them more easily than
  loopless ones. Big numerals can stay Archivo.
- **Contrast:** at least 7:1 for anything that matters. No grey text for real information; grey is
  for decoration only.
- **Pictures first:** every figure gets a picture (sun or cloud, solar panel, battery, house, power
  pole, coin). Words confirm the picture; they don't replace it. Never rely on colour alone.
- **Battery is the hero:** a large battery drawing filled to the level, with the % and a word
  ("เต็ม", "เหลือมาก", "เหลือน้อย"). Keep it in the same place on every screen.
- **Units they know:**
  - Energy in **หน่วย** (1 หน่วย = 1 kWh, as on the bill).
  - Power right now in กิโลวัตต์, smaller, or as a simple level.
  - Money in บาท.
  - No abbreviations like kWh, SOC or PV.
- **Thai dates and times:** "วันพุธที่ 23 กันยายน 2569" (Buddhist year) and "12:20 น." Arabic numerals
  are fine and easier to read at a distance than Thai numerals.
- **Say why, in one sentence:** the weather explains the day ("เมฆมาก แผงผลิตไฟได้น้อยลง"). Use
  short, calm, reassuring sentences, and a clear warning only when something needs attention.
- **Few screens, slow pace:** two or three screens at most, 30–60 s each, or one main screen that
  stays. Slow cross-fades only; no flashing or sliding.
- **No analysis charts:** no multi-line power charts, no Sankey diagrams, no second axis. At most one
  simple bar row, as in Sketch B.
- **Night:** after sunset, dark, dimmer and simpler: the time, the battery, and
  "กลางคืน บ้านใช้ไฟจากแบต". No glare in a dark room.
- **English:** none on the main view. If the family wants English for guests, it goes in one small
  line at the edge, never next to the numbers.

**Illustrations needed:** one flat, bold set, readable across a room, in the product's series
colours. Deliver as SVG: the TV draws SVG well, but colour emoji may be missing from its fonts.

| Picture | Thai | Meaning |
|---|---|---|
| Sun | แดดจัด | Sunny |
| Sun with cloud | มีเมฆบางส่วน | Partly cloudy |
| Cloud | เมฆมาก | Cloudy |
| Rain cloud (and storm) | ฝนตก | Rain |
| Moon | กลางคืน | Night |
| Solar panel | แผงโซลาร์ | Solar panels |
| Battery at its level (full, half, low, charging) | แบตเตอรี่ | Battery |
| House | บ้าน | Home |
| Power pole | การไฟฟ้า (กฟภ. / กฟน.) | Utility grid |
| Coin | ประหยัด | Money saved |

## 4. Plain-Thai wording

These are suggested sentences, chosen by the app from the data. Claude Design can refine the
wording; the left column is what the code can detect today.

| When the data says | Show | Meaning |
|---|---|---|
| Sunny now, solar high | แดดดี แผงผลิตไฟได้เต็มที่ | Good sun, panels at full output |
| Cloudy now, solar lower than usual for the hour | เมฆมาก แผงผลิตไฟได้น้อยลง | Cloudy, panels make less |
| Rain forecast later today | บ่ายนี้ฝนจะตก ช่วง 14:00–17:00 น. | Rain expected 2–5 pm |
| Today's solar well below a normal sunny day | วันนี้เมฆเยอะ ผลิตได้ 12 หน่วย (วันแดดดีได้ 28 หน่วย) | Cloudy day: 12 units (a sunny day gives 28) |
| Battery charging from the sun | แดดกำลังชาร์จแบต | The sun is charging the battery |
| Battery at 100 % | แบตเต็มแล้ว | Battery full |
| After sunset, battery supplying the house | กลางคืน บ้านใช้ไฟจากแบต | At night the house runs on the battery |
| Battery below 20 % | แบตเหลือน้อย บ้านจะใช้ไฟจากการไฟฟ้า | Battery low; the house will use grid power |
| No grid import today | วันนี้ยังไม่ต้องซื้อไฟ | No electricity bought today |
| Everything from the sun today | วันนี้บ้านใช้ไฟจากแดดทั้งหมด | The house ran on sunshine all day |
| Savings | ประหยัดค่าไฟไปแล้ว 18,714 บาท | Saved 18,714 baht on electricity so far |
| Data not updating (stale or offline) | ข้อมูลไม่อัปเดตตั้งแต่ 09:15 น. | No new data since 09:15; must look clearly different from normal |

## 5. The current design

Four slides share one frame: a header (home name, English title with the Thai after it, clock, date,
data status), a body, and slide dots.

| Slide | Light | Dark |
|---|---|---|
| 1 · Right now · ตอนนี้ | ![](tv/tv-1080p-light-1-now.png) | ![](tv/tv-1080p-dark-1-now.png) |
| 2 · Today · วันนี้ (5-minute power chart) | ![](tv/tv-1080p-light-2-day.png) | ![](tv/tv-1080p-dark-2-day.png) |
| 3 · Energy flow today · การไหลของพลังงานวันนี้ (Sankey) | ![](tv/tv-1080p-light-3-flow.png) | ![](tv/tv-1080p-dark-3-flow.png) |
| 4 · Savings · ประหยัดได้ | ![](tv/tv-1080p-light-4-savings.png) | ![](tv/tv-1080p-dark-4-savings.png) |

Also in `tv/`:
- `tv-720p-light-*.png`: the same layout at 1280×720. Many TV browsers report a smaller viewport.
- `app-overview-desktop.png` and `app-day-desktop.png`: the desktop app, showing the product's
  design language (flat, 2 px rules, heavy numerals).

## 6. What's wrong with it

Most important first, for these viewers.

1. **English first, jargon everywhere.** Titles and labels lead in English, with the Thai small and
   grey. The units are kW and kWh. Terms like "self-sufficiency" and "payback %" mean nothing to the
   parents.
2. **Too small to read from the sofa.**
   - Chart axis labels and hour ticks: 11 px.
   - Flow diagram labels: 12–15 px.
   - Weather icons: 14 px, and their rain figures 9 px.
   - Footnotes: about 26 px, and grey.

   Only the tile values, titles and clock work at a distance.
3. **Charts made for analysis.**
   - The Today slide is a 5-minute power chart with several series and two axes.
   - The flow slide is a Sankey diagram with dotted zero paths.

   Neither can be read by an 80-year-old in a few seconds.
4. **The battery is one tile of four.** It's the figure the parents care about most, but it's a
   number in a row, with no picture of how full it is.
5. **Weather doesn't explain anything.** It lists conditions ("Cloudy", "5.5 mm rain") but never
   connects them to why the panels made less or the battery didn't fill.
6. **Confusing numbers.** In the sample, the grid tile shows 0.3 kW now, while today's import is
   0.0 kWh and the headline says 100 % from the sun. It's correct, but it reads as a contradiction.
7. **Space isn't used.** The bottom third of "Right now" is empty while the text that matters is
   small.
8. **Data freshness is a tiny grey line.** A TV showing morning data at night looks the same as a
   live one.
9. **TV edges and screen care.**
   - Side padding is about 3 %; TVs that overscan can crop 5 %.
   - The header and clock never move, which is a burn-in risk if the set is OLED.
   - Night mode is dark but full brightness.
10. **MhuHome has no TV view.** TV mode needs 5-minute data. MhuHome has daily data up to yesterday,
    which could support a simpler view if the family wants it.

## 7. TV browser constraints

LG webOS runs an **old Chromium, about version 79**. The build compiles JavaScript down to that
version, but CSS isn't compiled, so the design must avoid:

| Avoid | Arrived in | Use instead |
|---|---|---|
| `color-mix()` | Chrome 111 | Plain hex or rgba, one palette for light and one for dark |
| `gap` on flexbox | Chrome 84 | CSS grid with `gap` (grid gap works) |
| `aspect-ratio` | Chrome 88 | Fixed sizes, or the padding-top trick |
| `inset` shorthand | Chrome 87 | `top` / `right` / `bottom` / `left` |
| `:is()`, `:where()`, `:has()`, container queries, CSS nesting | Chrome 88+ | Plain selectors, and `vw` units for sizing |

- **Fine to use:** CSS variables, grid, `clamp()`, SVG (inline or as files), `vw`/`vh` units, Google
  Fonts (including the looped Thai face), and slow `opacity` fades. Keep animation light, because TV
  processors are slow.
- **The sketches** use container units and `aspect-ratio` only so they fit the web page. The TV build
  has to use `vw` instead.
- **No input** beyond ◀ ▶ on the remote. Nothing can depend on hover.
- **Series colours are fixed across the whole app:**

  | Series | Colour |
  |---|---|
  | Solar | `#e9a825` |
  | Battery | `#3fa66a` |
  | Grid | `#3a7bd5` |
  | Home | `#8b5cc7` |
  | Losses | `#9b9797` |

  They're checked for colour-blind viewers, so pair every colour with a picture or a word.
- **Current TV palettes:**

  | Token | Light (day) | Dark (night) |
  |---|---|---|
  | Background | `#f3f2f2` | `#1b1a19` |
  | Surface | `#eae9e9` | `#272524` |
  | Text | `#201e1d` | `#f1efee` |
  | Accent | `#ec3013` | `#ff563c` |

## 8. Data you can use

All of this is already computed in the app. Example values are from the sample data.

**MomHome (a reading every 5 minutes):**

| Data | Example |
|---|---|
| Battery level now, and whether it's charging, supplying the house or resting | 100 %, charging |
| Time the battery first reached 100 % today | 10:52 |
| Battery level at each hour of the day | 39 → 44 → 56 → 76 → 100 % |
| Power now (kW): solar, home, from the grid | 5.7 · 0.4 · 0.3 |
| Today so far (หน่วย): solar made, home used, bought from the grid | 19.8 · 7.3 · 0.0 |
| Solar made in each hour (หน่วย), from the 5-minute series | 0.2, 1.2, 2.5, 3.7, 4.8, 5.4 (06:00–11:00) |
| A normal day for comparison: the 30-day average, or a good sunny day (90th percentile) | 24 · 28 หน่วย |
| Sunrise and sunset, from the panels' own first and last output | Drives day/night mode |
| Data status: live, paused, stale or offline | Live, last reading 12:17 |

**Other data:**
- **Weather** (Open-Meteo model for the site, hourly; the rest of today is a forecast):
  - The condition: sunny, partly cloudy, cloudy, fog, drizzle, rain or storm.
  - Cloud %, rain in mm, and sunlight strength.
  - A day summary, and the rain spells (e.g. 14:00–17:00).
- **Savings** (from the utility bills):
  - Saved so far: ฿18,714.
  - This month so far: ฿1,829, estimated until the bill arrives.
  - Bill compared with before solar: −70 %.
- **Both homes, daily:** solar, home use and grid import per day in หน่วย, with estimated and missing
  days flagged. MhuHome has only this, up to yesterday.
- **Not fetched yet, but easy to add:** tomorrow's weather forecast (the weather source offers it),
  for a "พรุ่งนี้แดดดี" line in the evening.
- **Not available:** per-appliance use, a solar production forecast, and live data for MhuHome.

## 9. Questions for the owner

1. ~~Language~~ **Answered:** Thai. The viewers are the parents, 80+, who prefer Thai.
2. **The TV:** which model and size, how far away is the sofa, and is it OLED (burn-in)?
3. **Which homes:** MomHome only, or both homes?
4. **Money on screen:** show savings in baht, or keep money off the TV?
5. **Night:** a dim screen with only the time and battery, or the full view?
6. **Home name:** what do the parents call the house? The sketches use "บ้านคุณแม่" as a placeholder.

## 10. What to hand back

- **Screens:** 1920×1080 mockups of each screen you propose, for day and night, plus one frame at
  1280×720 to show the scaling.
- **Illustrations:** the SVG set from section 3: weather, panel, battery at several levels, house,
  power pole and coin.
- **Type and space:** the TV type scale in px at 1080p (Thai and numerals), and the safe-area
  margins.
- **Thai copy:** final wording for every label and for the sentences in section 4.
- **States:**
  - Before sunrise.
  - Night, running on the battery.
  - Battery low.
  - A rainy day.
  - Data stale, or the inverter offline.
- **Rotation:** which screens, their order and timing, and the transition.

The easiest format to build from is static HTML/CSS mocks or annotated frames. Claude Code will port
them into `frontend/src/pages/Tv.tsx`, within the constraints in section 7.

---

### Appendix · code map (for whoever implements)

- **`pages/Tv.tsx`:** the whole TV mode: slides, tiles, weather line, the two palettes, and the
  day/night switch `tvIsLight` (tested in `lib/tvTheme.test.ts`).
- **Numbers:**
  - `lib/energy.ts`: `readingsFor`, `dayTotals`, `selfSufficiency`
  - `lib/battery.ts`: `daylight`
  - `lib/weather.ts`: `weatherDay`, `daySummary`, `rainSpells`
  - `lib/kpis.ts`: `savingsKpis`, and the time the battery became full
  - `lib/dayReport.ts`: the 30-day comparison
  - `lib/status.ts`: `feedStatus`
- **Run it with sample data:**
  1. `cd frontend && npm run build`
  2. Copy `dist/` to a folder, with `sample_data/` as its `data/`.
  3. Serve that folder and open `#/momhome/tv?s=600&theme=light`.
  4. Fix the clock near 12:20 on 23/09/2026.
