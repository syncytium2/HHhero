import { describe, expect, it } from "vitest";
import { clampView, isFull, pinchView, selectView, wheelView, type Range } from "./zoom.ts";

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

describe("desktop zoom", () => {
  it("a mouse drag zooms to the dragged window, either direction", () => {
    expect(selectView(FULL, FULL, 0.25, 0.5, 0.5)).toEqual([10, 20]);
    expect(selectView(FULL, FULL, 0.5, 0.25, 0.5)).toEqual([10, 20]);
    const v = selectView([10, 20], FULL, 0, 0.5, 0.5);
    expect(v[0]).toBeCloseTo(10, 12);
    expect(v[1]).toBeCloseTo(15, 12);
  });

  it("a drag narrower than the minimum span zooms to the minimum, centered on it", () => {
    const v = selectView(FULL, FULL, 0.5, 0.5001, 0.5);
    expect(v[1] - v[0]).toBeCloseTo(0.5, 12);
    expect((v[0] + v[1]) / 2).toBeCloseTo(20.002, 9);
  });

  it("wheel up zooms in about the pointer, wheel down zooms out, sideways pans", () => {
    const zin = wheelView(FULL, FULL, 0.25, 0, -100, false, 300, 0.5);
    expect(zin[1] - zin[0]).toBeLessThan(40);
    expect(zin[0] + 0.25 * (zin[1] - zin[0])).toBeCloseTo(10, 9);
    const zout = wheelView([10, 20], FULL, 0.5, 0, 100, false, 300, 0.5);
    expect(zout[1] - zout[0]).toBeGreaterThan(10);
    const pan = wheelView([10, 20], FULL, 0.5, 30, 0, false, 300, 0.5);
    expect(pan[0]).toBeCloseTo(11, 12);
    expect(pan[1]).toBeCloseTo(21, 12);
  });

  it("a trackpad pinch (wheel with ctrl) zooms even when it carries some sideways motion", () => {
    const v = wheelView(FULL, FULL, 0.5, 5, -10, true, 300, 0.5);
    expect(v[1] - v[0]).toBeLessThan(40);
  });
});
