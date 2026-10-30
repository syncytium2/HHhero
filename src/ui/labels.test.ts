import { describe, expect, it } from "vitest";
import { spreadLabels } from "./labels.ts";

describe("spreadLabels", () => {
  it("leaves labels that do not overlap where they are", () => {
    expect(spreadLabels([10, 40, 80], 12, 0, 100)).toEqual([10, 40, 80]);
  });

  it("separates labels that collide by at least the gap, keeping their order", () => {
    const out = spreadLabels([50, 50, 51], 12, 0, 100);
    const sorted = [...out].sort((a, b) => a - b);
    for (let k = 1; k < sorted.length; k++) expect(sorted[k] - sorted[k - 1]).toBeGreaterThanOrEqual(12 - 1e-9);
    expect(out[2]).toBeGreaterThan(out[0]);
  });

  it("stays inside the plot when labels pile up at the bottom", () => {
    const out = spreadLabels([98, 99, 100, 100], 12, 0, 100);
    for (const y of out) {
      expect(y).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
    }
    const sorted = [...out].sort((a, b) => a - b);
    for (let k = 1; k < sorted.length; k++) expect(sorted[k] - sorted[k - 1]).toBeGreaterThanOrEqual(12 - 1e-9);
  });
});
