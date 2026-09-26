import { Calendar, ChevronLeft, ChevronRight } from "@/components/Icons";
import { dmy } from "@/lib/format";

/**
 * ‹ [dd/mm/yyyy] › Today — step between days that have data (Day and Health pages).
 * `dates` = days with data, oldest first; `latest` = the newest of them. `latestLabel` names the
 * jump-to-newest button ("Latest" for a daily report, whose newest day is yesterday).
 */
export function DateNav({ date, dates, latest, onGo, latestLabel = "Today" }: { date: string; dates: string[]; latest: string; onGo: (d: string) => void; latestLabel?: string }) {
  const prev = dates.filter((d) => d < date).at(-1);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button className="btn btn-secondary btn-icon" aria-label="Previous day" disabled={!prev} onClick={() => prev && onGo(prev)}>
        <ChevronLeft />
      </button>
      <label className="input date-field" style={{ display: "flex", alignItems: "center", gap: 8, width: 170, minHeight: 36 }}>
        <Calendar />
        {dmy(date)}
        <input type="date" aria-label="Date" value={date} min={dates[0]} max={latest} onChange={(e) => e.target.value && onGo(e.target.value)} />
      </label>
      <button className="btn btn-secondary btn-icon" aria-label="Next day" disabled={date >= latest} onClick={() => onGo(dates.find((d) => d > date) ?? latest)}>
        <ChevronRight />
      </button>
      <button className="btn btn-primary" onClick={() => onGo(latest)}>
        {latestLabel}
      </button>
    </div>
  );
}
