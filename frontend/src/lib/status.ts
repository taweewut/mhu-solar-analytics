// Header status chip (design review 3b §3): always the live data feed, never page-specific.
// Four states by severity, carried by icon and words (no green / amber — those are energy colours):
// Live → Paused (API daily limit) → Stale (> 26 h without new data) → Offline (inverter says so).

import { dm, dmy } from "@/lib/format";
import type { FetchStatus } from "@/lib/types";

export type FeedKind = "live" | "paused" | "stale" | "offline";

export interface FeedState {
  kind: FeedKind;
  /** Desktop chip text, e.g. "Paused · last 21:58 · back 07:00". */
  line: string;
  /** Mobile chip text (icon + time), e.g. "21:58". */
  short: string;
  /** Popover lines: source · last reading · last / next fetch. */
  detail: string[];
}

const STALE_HOURS = 26;
const POLL_MINUTES = 15;

/** "2026-09-23 21:58:49" (site local time) → Date. */
const at = (s: string) => new Date(s.replace(" ", "T"));
const hhmm = (s: string) => s.slice(11, 16);

export interface FeedInput {
  /** Newest 5-min reading, or null for a daily-only home. */
  lastReading: string | null;
  /** Newest day with data (YYYY-MM-DD). */
  lastDay: string;
  /** Working State of the newest 5-min reading. */
  lastState?: string | null;
  fetch?: FetchStatus | null;
  /** Where the data comes from, e.g. "SolisCloud API every 15 min". */
  source: string;
  now: Date;
}

export function feedStatus({ lastReading, lastDay, lastState, fetch, source, now }: FeedInput): FeedState {
  const latest = lastReading ?? `${lastDay} 23:59:59`;
  const ageH = (now.getTime() - at(latest).getTime()) / 3_600_000;
  const lastText = lastReading ? `${dmy(lastReading)} ${hhmm(lastReading)}` : dmy(lastDay);
  const detail = [source, `Last reading ${lastText}`];
  if (fetch?.checked) {
    detail.push(`Last fetch ${hhmm(fetch.checked)}`);
    if (!fetch.paused) {
      const next = new Date(at(fetch.checked).getTime() + POLL_MINUTES * 60_000);
      detail.push(`Next fetch ≈ ${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`);
    }
  }

  if (lastReading && lastState && /offline/i.test(lastState)) {
    return { kind: "offline", line: `Inverter offline since ${hhmm(lastReading)}`, short: hhmm(lastReading), detail };
  }
  if (ageH > STALE_HOURS) {
    const days = Math.floor(ageH / 24);
    const age = days >= 2 ? `${days} days old` : `${Math.round(ageH)} h old`;
    return { kind: "stale", line: `Data to ${dm(latest)} · ${age}`, short: dm(latest), detail };
  }
  if (fetch?.paused && at(fetch.paused.until) > now) {
    const back = fetch.paused.until.slice(11, 16);
    return {
      kind: "paused",
      line: `Paused · last ${hhmm(latest)} · back ${back}`,
      short: hhmm(latest),
      detail: [...detail, `Paused by the SolisCloud ${fetch.paused.reason}; new readings resume ${back}.`],
    };
  }
  return { kind: "live", line: `Live · ${hhmm(latest)}`, short: hhmm(latest), detail };
}
