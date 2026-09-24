import { dm } from "@/lib/format";

/**
 * One value per day over a window (Health summary): a line with gaps for days without data,
 * an optional shaded band (e.g. ±5 %) and reference line (e.g. 60 °C, dotted). Text is HTML.
 */
export function DailyTrend({
  label,
  points,
  width,
  height = 160,
  ymin,
  ymax,
  step,
  fmt,
  color,
  band,
  refLine,
}: {
  label: string;
  points: { date: string; v: number | null }[];
  width: number;
  height?: number;
  ymin: number;
  ymax: number;
  step: number;
  fmt: (v: number) => string;
  color: string;
  band?: [number, number];
  refLine?: number;
}) {
  if (width <= 0 || !points.length) return <div style={{ height }} />;
  const pl = 44, pr = 8, pt = 8, pb = 22;
  const iw = width - pl - pr, ih = height - pt - pb;
  const X = (i: number) => pl + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const Y = (v: number) => pt + ((ymax - Math.max(ymin, Math.min(ymax, v))) / (ymax - ymin)) * ih;
  let d = "";
  let pen = false;
  points.forEach((p, i) => {
    if (p.v == null) {
      pen = false;
      return;
    }
    d += (pen ? "L" : "M") + X(i).toFixed(1) + "," + Y(p.v).toFixed(1);
    pen = true;
  });
  const ticks: number[] = [];
  for (let v = ymin; v <= ymax + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const xl = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div style={{ position: "relative", width }}>
      <svg width={width} height={height} style={{ display: "block", overflow: "visible" }} role="img" aria-label={label}>
        {ticks.map((v) => (
          <line key={v} x1={pl} x2={width - pr} y1={Y(v)} y2={Y(v)} stroke="var(--color-text)" strokeOpacity={0.1} />
        ))}
        {band && <rect x={pl} y={Y(band[1])} width={iw} height={Y(band[0]) - Y(band[1])} fill="var(--color-text)" fillOpacity={0.08} />}
        {refLine != null && <line x1={pl} x2={width - pr} y1={Y(refLine)} y2={Y(refLine)} stroke="var(--color-text)" strokeOpacity={0.45} strokeDasharray="1 3" />}
        <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
        {points.length <= 45 &&
          points.map((p, i) => (p.v == null ? null : <rect key={p.date} x={X(i) - 1.5} y={Y(p.v) - 1.5} width={3} height={3} fill={color} />))}
        <line x1={pl} x2={width - pr} y1={pt + ih} y2={pt + ih} stroke="var(--color-text)" strokeWidth={1} />
      </svg>
      {ticks.map((v) => (
        <span key={v} className="abs muted-72" style={{ left: pl - 6, top: Y(v), transform: "translate(-100%,-50%)", fontSize: 10 }}>
          {fmt(v)}
        </span>
      ))}
      {xl.map((i) => (
        <span key={i} className="abs muted-72" style={{ left: X(i), top: height - 10, transform: i === 0 ? "translateY(-50%)" : i === points.length - 1 ? "translate(-100%,-50%)" : "translate(-50%,-50%)", fontSize: 10 }}>
          {dm(points[i].date)}
        </span>
      ))}
    </div>
  );
}
