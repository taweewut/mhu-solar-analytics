import { useMemo } from "react";
import { cleanDaily, padDays } from "@/lib/clean";
import { fillMissing } from "@/lib/estimate";
import { useSettings } from "@/lib/settings";
import { asOfDate } from "@/lib/energy";
import { dmy, hm, minuteOfDay } from "@/lib/format";
import { useDataset } from "@/lib/hooks";
import { buildSavings } from "@/lib/tariff";
import type { Home } from "@/lib/types";

/** A home's loaded dataset + the derived facts every page needs (as-of date, savings). */
export function useModel(home: Home) {
  const raw = useDataset(home.id);
  const { settings } = useSettings();
  const daily = useMemo(() => {
    const clean = cleanDaily(padDays(raw.daily, home.installed), home);
    return settings.estimateGaps
      ? fillMissing(clean, home, { bills: raw.bills, meterNetsExport: home.meterNetsExport, installed: home.installed })
      : clean;
  }, [raw.daily, raw.bills, home, settings.estimateGaps]);
  const ds = { ...raw, daily };
  const derived = useMemo(() => {
    if (!ds.ready) return null;
    const asOf = asOfDate(ds.fiveMin, ds.daily);
    // Switch-on: the install date in homes.json, else the first day of data.
    const commissioned = home.installed ?? ds.daily[0]?.date ?? asOf;
    const lastReading = ds.fiveMin.at(-1)?.time;
    const savings = buildSavings({
      bills: ds.bills,
      daily: ds.daily,
      ft: ds.ft,
      commissioned,
      tariff: home.tariff,
      exportRate: home.exportRate,
      meterNetsExport: home.meterNetsExport,
    });
    const dates = [...new Set(ds.fiveMin.map((r) => r.time.slice(0, 10)))].sort();
    return {
      asOf,
      commissioned,
      savings,
      dates,
      /** "12:18" — time of the latest 5-min reading ("" for a daily-only home). */
      lastTime: lastReading ? hm(minuteOfDay(lastReading)) : "",
      /** "Updated 23/09/2026 12:18 · UTC+7", or "Daily data to 31/08/2026". */
      updated: lastReading ? `Updated ${dmy(lastReading)} ${hm(minuteOfDay(lastReading))} · UTC+7` : `Daily data to ${dmy(asOf)}`,
    };
  }, [ds.ready, ds.fiveMin, ds.daily, ds.bills, ds.ft, home]);
  return { ...ds, model: derived };
}

export type Model = NonNullable<ReturnType<typeof useModel>["model"]>;
