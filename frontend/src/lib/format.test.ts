import { describe, expect, it } from "vitest";
import { energy, energyText } from "@/lib/format";

describe("energy: kWh below 1,000, MWh from 1,000", () => {
  it("keeps kWh for everyday amounts", () => {
    expect(energy(0.1)).toEqual({ value: "0.1", unit: "kWh" });
    expect(energy(49.3)).toEqual({ value: "49.3", unit: "kWh" });
    expect(energy(819)).toEqual({ value: "819", unit: "kWh" });
    expect(energy(999.4)).toEqual({ value: "999", unit: "kWh" });
  });

  it("switches to MWh with 3 significant figures", () => {
    expect(energy(1000)).toEqual({ value: "1.00", unit: "MWh" });
    expect(energy(1928)).toEqual({ value: "1.93", unit: "MWh" });
    expect(energy(4032)).toEqual({ value: "4.03", unit: "MWh" });
    expect(energy(29122)).toEqual({ value: "29.1", unit: "MWh" });
    expect(energy(150107)).toEqual({ value: "150", unit: "MWh" });
    expect(energyText(13586)).toBe("13.6 MWh");
    expect(energyText(140.3)).toBe("140 kWh");
  });
});
