import { describe, expect, it } from "vitest";
import { buildModel, stockParams } from "./model.ts";
import { DEFAULT_CLAMP, DEFAULT_STIM, fires, testPotentials, niceStep, pulseThreshold, settle, thresholdLadder } from "./sim.ts";

const DT = 0.01;
const md = buildModel(stockParams());
const stim = { ...DEFAULT_STIM, sweep: 40 };
const from = settle(md, stim.hold, 50, DT);

describe("stepping up to threshold", () => {
  const thr = pulseThreshold(md, stim, from, DT)!;

  it("the stock cell has a threshold for the stock pulse, and it is the edge between firing and not", () => {
    expect(thr).toBeGreaterThan(0);
    expect(thr).toBeLessThan(DEFAULT_STIM.amp); // the stock pulse fires the cell
    expect(fires(md, { ...stim, amp: thr * 1.001 }, from, DT)).toBe(true);
    expect(fires(md, { ...stim, amp: thr * 0.999 }, from, DT)).toBe(false);
  });

  it("the ladder climbs in even, round steps, every one below threshold silent, then fires just over it", () => {
    const L = thresholdLadder(thr, stim.amp);
    const even = L.filter((s) => !s.role);
    expect(even.length).toBeGreaterThanOrEqual(4);
    const d = even[0].amp;
    expect(niceStep(d)).toBeCloseTo(d, 12);
    even.forEach((s, k) => expect(s.amp).toBeCloseTo((k + 1) * d, 12));
    for (let k = 1; k < L.length; k++) expect(L[k].amp).toBeGreaterThan(L[k - 1].amp);
    for (const s of L) expect(fires(md, { ...stim, amp: s.amp }, from, DT)).toBe(s.role === "over" || s.role === "strong");
  });

  it("no threshold when the cell cannot fire, however hard the pulse pushes V past −20 mV", () => {
    const dead = buildModel({ ...stockParams(), gNa: 0 });
    expect(pulseThreshold(dead, stim, settle(dead, 0, 50, DT), DT)).toBeNull();
    expect(thresholdLadder(null, 20).map((s) => s.amp)).toEqual([5, 10, 15, 20]);
  });

  it("round steps: 1, 2, 2.5 or 5 times a power of ten", () => {
    expect(niceStep(0.7)).toBeCloseTo(0.5, 12);
    expect(niceStep(1.3)).toBe(1);
    expect(niceStep(2.2)).toBe(2);
    expect(niceStep(3)).toBe(2.5);
    expect(niceStep(97)).toBe(50);
  });
});

describe("an edited clamp family", () => {
  it("runs from the first step to the last, by the step size, and is never empty", () => {
    expect(testPotentials({ ...DEFAULT_CLAMP, from: -80, to: -20, by: 20 })).toEqual([-80, -60, -40, -20]);
    expect(testPotentials({ ...DEFAULT_CLAMP, from: -30, to: -30, by: 10 })).toEqual([-30]);
    expect(testPotentials({ ...DEFAULT_CLAMP, from: -60, to: 0, by: 25 })).toEqual([-60, -35, -10]);
  });
});
