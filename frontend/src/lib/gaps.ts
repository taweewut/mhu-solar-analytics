// Known data gaps (homes.json "dataGaps"): say why data is missing instead of "not loaded".

import type { DataGap } from "@/lib/types";

/** The gap a day falls in, if any. */
export const gapOn = (gaps: DataGap[] | undefined, date: string): DataGap | undefined =>
  gaps?.find((g) => date >= g.from && date <= g.to);

/** The gap overlapping a month ("YYYY-MM"), if any. */
export const gapInMonth = (gaps: DataGap[] | undefined, month: string): DataGap | undefined =>
  gaps?.find((g) => g.from.slice(0, 7) <= month && g.to.slice(0, 7) >= month);

/** "Inverter offline (no cloud connection) 31/10/2025 – 15/02/2026". */
export const describeGap = (g: DataGap): string => {
  const d = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  return `${g.reason} ${d(g.from)} – ${d(g.to)}`;
};
