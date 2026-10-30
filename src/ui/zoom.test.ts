import { describe, expect, it } from "vitest";
import { clampView, isFull, pinchView, type Range } from "./zoom.ts";

const FULL: Range = [0, 40];

describe("horizontal zoom", () => {
  it("spreading the fingers to twice their distance halves the span, about the midpoint", () => {
    const v = pinchView(FULL, FULL, 0.5, 0.5, 2, 0.5);
    expect(v[0]).toBeCloseTo(10, 12);
    expect(v[1]).toBeCloseTo(30, 12);
  });

  it("the point under the fingers stays under the fingers", () => {
    // fingers centered at 25% of the width (10 ms), pinched out 4x
    const v = pinchView(FULL, FULL, 0.25, 0.25, 4, 0.5);
    expect(v[0] + 0.25 * (v[1] - v[0])).toBeCloseTo(10, 12);
    expect(v[1] - v[0]).toBeCloseTo(10, 12);
  });

  it("a one-finger drag (ratio 1) pans, and stops at the ends", () => {
    const v = pinchView([10, 20], FULL, 0.5, 0.25, 1, 0.5);
    expect(v[0]).toBeCloseTo(12.5, 12);
    expect(v[1]).toBeCloseTo(22.5, 12);
    const end = pinchView([30, 40], FULL, 0.5, 0, 1, 0.5);
    expect(end).toEqual([30, 40]);
  });

  it("never zooms out past the full range or in past the minimum span", () => {
    expect(pinchView([10, 20], FULL, 0.5, 0.5, 0.01, 0.5)).toEqual([0, 40]);
    const v = pinchView(FULL, FULL, 0.5, 0.5, 1000, 0.5);
    expect(v[1] - v[0]).toBeCloseTo(0.5, 12);
    expect(clampView([-5, 5], FULL, 0.5)).toEqual([0, 10]);
    expect(isFull(clampView([-5, 50], FULL, 0.5), FULL)).toBe(true);
  });
});
