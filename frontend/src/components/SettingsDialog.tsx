import { useEffect, useState } from "react";
import { useHome } from "@/lib/home";
import { DEFAULTS, useSettings } from "@/lib/settings";

/** The design's "Tweaks": effective rate, show losses, and this home's system cost. */
export function SettingsDialog() {
  const { home } = useHome();
  const { settings, update, costFor, setCost: saveCost, dialogOpen, setDialogOpen } = useSettings();
  const [rate, setRate] = useState(String(settings.effectiveRate));
  const [cost, setCost] = useState(String(costFor(home).cost));
  const [losses, setLosses] = useState(settings.showLosses);
  const [estimate, setEstimate] = useState(settings.estimateGaps);

  useEffect(() => {
    if (!dialogOpen) return;
    setRate(String(settings.effectiveRate));
    setCost(String(costFor(home).cost));
    setLosses(settings.showLosses);
    setEstimate(settings.estimateGaps);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDialogOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogOpen, settings, setDialogOpen, costFor, home]);

  if (!dialogOpen) return null;
  const r = Number(rate), c = Number(cost);
  const valid = Number.isFinite(r) && r > 0 && r < 20 && Number.isFinite(c) && c > 0;

  return (
    <div className="dialog-backdrop" style={{ zIndex: 20 }} onClick={() => setDialogOpen(false)}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          update({ effectiveRate: r, showLosses: losses, estimateGaps: estimate });
          // Keep the homes.json placeholder until the viewer actually changes it.
          if (Math.round(c) !== costFor(home).cost || !costFor(home).placeholder) saveCost(home, Math.round(c));
          setDialogOpen(false);
        }}
      >
        <div id="settings-title" className="dialog-title">Settings · ตั้งค่า</div>
        <div className="settings-grid">
          <div className="field">
            <label htmlFor="rate">Effective rate (฿/kWh) — values Sankey flows in the tooltip</label>
            <input id="rate" className="input" type="number" step="0.01" min="0" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cost">{home.name} system cost (฿) — for payback</label>
            <input id="cost" className="input" type="number" step="1000" min="0" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <label className="check">
            <input type="checkbox" checked={losses} onChange={(e) => setLosses(e.target.checked)} />
            Show losses in the Sankey
          </label>
          {!home.battery && (
            <label className="check">
              <input type="checkbox" checked={estimate} onChange={(e) => setEstimate(e.target.checked)} />
              Fill {home.name}'s missing inverter data with estimates (grid import from the {home.utility} bills, marked est.)
            </label>
          )}
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginRight: "auto" }}
            onClick={() => {
              setRate(String(DEFAULTS.effectiveRate));
              setCost(String(home.systemCost));
              saveCost(home, null);
              setLosses(DEFAULTS.showLosses);
              setEstimate(DEFAULTS.estimateGaps);
            }}
          >
            Reset
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setDialogOpen(false)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!valid}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
