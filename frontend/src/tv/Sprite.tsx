// The TV's illustration set (docs/tv-design §6): one hidden SVG sprite, 100×100 viewBoxes, flat,
// square ends, no gradients. Ink parts use currentColor so they follow the palette; the series
// colours are fixed. Mounted once by pages/Tv.tsx; <Ic name="sun" /> draws one.

import type { Icon } from "@/lib/tvModel";

export function Sprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
      <symbol id="i-sun" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="20" fill="#e9a825" />
        <g stroke="#e9a825" strokeWidth="8">
          <line x1="50" y1="6" x2="50" y2="22" /><line x1="50" y1="78" x2="50" y2="94" /><line x1="6" y1="50" x2="22" y2="50" /><line x1="78" y1="50" x2="94" y2="50" />
          <line x1="19" y1="19" x2="30" y2="30" /><line x1="70" y1="70" x2="81" y2="81" /><line x1="19" y1="81" x2="30" y2="70" /><line x1="70" y1="30" x2="81" y2="19" />
        </g>
      </symbol>
      <symbol id="i-suncloud" viewBox="0 0 100 100">
        <circle cx="38" cy="36" r="15" fill="#e9a825" />
        <g stroke="#e9a825" strokeWidth="6">
          <line x1="38" y1="6" x2="38" y2="16" /><line x1="8" y1="36" x2="18" y2="36" /><line x1="17" y1="15" x2="24" y2="22" /><line x1="59" y1="15" x2="52" y2="22" /><line x1="17" y1="57" x2="24" y2="50" />
        </g>
        <g fill="#9b9797"><circle cx="42" cy="72" r="14" /><circle cx="60" cy="62" r="20" /><circle cx="78" cy="72" r="14" /><rect x="42" y="72" width="36" height="14" /></g>
      </symbol>
      <symbol id="i-cloud" viewBox="0 0 100 100">
        <g fill="#6f6b69"><circle cx="32" cy="62" r="17" /><circle cx="54" cy="50" r="24" /><circle cx="76" cy="62" r="17" /><rect x="32" y="62" width="44" height="17" /></g>
      </symbol>
      <symbol id="i-rain" viewBox="0 0 100 100">
        <g fill="#6f6b69"><circle cx="32" cy="50" r="15" /><circle cx="52" cy="40" r="21" /><circle cx="72" cy="50" r="15" /><rect x="32" y="50" width="40" height="15" /></g>
        <g stroke="#3a7bd5" strokeWidth="7"><line x1="36" y1="72" x2="30" y2="94" /><line x1="54" y1="72" x2="48" y2="94" /><line x1="72" y1="72" x2="66" y2="94" /></g>
      </symbol>
      <symbol id="i-storm" viewBox="0 0 100 100">
        <g fill="#4f4b49"><circle cx="32" cy="48" r="15" /><circle cx="52" cy="38" r="21" /><circle cx="72" cy="48" r="15" /><rect x="32" y="48" width="40" height="15" /></g>
        <polygon points="58,58 40,82 52,82 44,100 66,72 54,72 62,58" fill="#e9a825" />
      </symbol>
      <symbol id="i-moon" viewBox="0 0 100 100">
        {/* The review's path traced the same circle twice (no area); this is the crescent it meant. */}
        <path d="M66 10A40 40 0 1 0 66 90A46 46 0 0 1 66 10Z" fill="#e5c76b" />
      </symbol>
      <symbol id="i-panel" viewBox="0 0 100 100">
        <circle cx="78" cy="20" r="9" fill="#e9a825" />
        <g stroke="#e9a825" strokeWidth="4"><line x1="78" y1="2" x2="78" y2="7" /><line x1="60" y1="20" x2="65" y2="20" /><line x1="91" y1="20" x2="96" y2="20" /><line x1="65" y1="7" x2="69" y2="11" /><line x1="91" y1="7" x2="87" y2="11" /></g>
        <polygon points="14,38 70,38 84,76 2,76" fill="#2f4a66" />
        <g stroke="#f3f2f2" strokeWidth="3"><line x1="8" y1="57" x2="77" y2="57" /><line x1="33" y1="38" x2="30" y2="76" /><line x1="52" y1="38" x2="57" y2="76" /></g>
        <rect x="40" y="76" width="8" height="14" fill="#2f4a66" /><rect x="26" y="90" width="36" height="6" fill="#2f4a66" />
      </symbol>
      <symbol id="i-house" viewBox="0 0 100 100">
        <polygon points="50,8 4,50 96,50" fill="#8b5cc7" /><rect x="16" y="50" width="68" height="44" fill="#8b5cc7" /><rect x="42" y="64" width="16" height="30" fill="#f3f2f2" />
      </symbol>
      <symbol id="i-pole" viewBox="0 0 100 100">
        <g fill="#3a7bd5">
          <rect x="46" y="10" width="8" height="88" /><rect x="12" y="20" width="76" height="8" /><rect x="22" y="38" width="56" height="8" /><rect x="16" y="12" width="6" height="8" />
          <rect x="78" y="12" width="6" height="8" /><rect x="26" y="30" width="6" height="8" /><rect x="68" y="30" width="6" height="8" />
        </g>
        <g stroke="#3a7bd5" strokeWidth="3"><line x1="0" y1="6" x2="19" y2="12" /><line x1="81" y1="12" x2="100" y2="6" /></g>
      </symbol>
      <symbol id="i-coin" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="44" fill="#e9a825" /><circle cx="50" cy="50" r="33" fill="none" stroke="#201e1d" strokeWidth="4" />
        <text x="50" y="66" textAnchor="middle" fontFamily="IBM Plex Sans Thai Looped" fontWeight="700" fontSize="44" fill="#201e1d">฿</text>
      </symbol>
      <symbol id="i-alert" viewBox="0 0 100 100">
        <rect x="6" y="6" width="88" height="88" fill="#ec3013" /><rect x="44" y="22" width="12" height="36" fill="#f3f2f2" /><rect x="44" y="66" width="12" height="12" fill="#f3f2f2" />
      </symbol>
    </svg>
  );
}

export function Ic({ name, className = "tv-ic" }: { name: Icon; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/** The hero battery (viewBox 0 0 240 416), filled to the level; the bolt while charging. */
export function HeroBattery({ fill, low, charging }: { fill: { y: number; height: number }; low: boolean; charging: boolean }) {
  // The bolt is light over the fill; where it sticks out above a lower fill it's outlined in ink.
  const over = fill.y <= 150;
  const clear = fill.y >= 304;
  return (
    <svg viewBox="0 0 240 416" aria-hidden="true">
      <rect x="84" y="0" width="72" height="32" fill="currentColor" />
      <rect x="7" y="39" width="226" height="370" fill="none" stroke="currentColor" strokeWidth="14" />
      <rect x="24" y={fill.y} width="192" height={fill.height} className={low ? "tv-bat-fill low" : "tv-bat-fill"} />
      {charging && (
        <polygon
          points="134,150 88,244 118,244 104,304 154,206 124,206"
          fill={clear ? "currentColor" : "#f3f2f2"}
          stroke={over || clear ? "none" : "currentColor"}
          strokeWidth="5"
        />
      )}
    </svg>
  );
}
