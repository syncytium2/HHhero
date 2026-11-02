// The 1952 screen's claims, held to the model and to the paper. Every sentence the guide says about a
// trace is checked here, as the notes are in views.test.ts.
import { describe, expect, it } from "vitest";
import {
  clampStep, eqn11, FIG3_DATA, FIGURES, fromPaperV, guideRig, modelAt, paperI, paperV, REST, shock, spikeHeight,
  START_RIG, stepToText, TABLE4, textToStep,
} from "./paper1952.ts";

describe("the paper's sign convention", () => {
  it("V is the displacement from rest, depolarization negative; current inward positive", () => {
    expect(paperV(REST)).toBe(0);
    expect(paperV(REST + 25)).toBe(-25);
    expect(fromPaperV(-25)).toBe(REST + 25);
    // the paper's VNa is -115 mV, VK +12 mV (Table 3) for the port's ENa +50, EK -77
    expect(paperV(50)).toBe(-115);
    expect(paperV(-77)).toBe(12);
    expect(paperI(-3)).toBe(3);
  });
  it("a step typed in either convention is the same depolarization", () => {
    for (const d of [6, 25, 109]) {
      expect(textToStep("clamp", stepToText("clamp", d, "1952"), "1952")).toBeCloseTo(d, 12);
      expect(textToStep("clamp", stepToText("clamp", d, "modern"), "modern")).toBeCloseTo(d, 12);
    }
    expect(stepToText("clamp", 25, "1952")).toBe(-25);
    expect(stepToText("clamp", 25, "modern")).toBe(-40);
    expect(stepToText("shock", 15, "1952")).toBe(15);
  });
});

describe("Fig. 3: the traced points", () => {
  it("has the twelve curves of Table 1, each with points, each near its own eqn. (11) curve", () => {
    expect(FIG3_DATA.map((c) => c.depolarization)).toEqual([109, 100, 88, 76, 63, 51, 38, 32, 26, 19, 10, 6]);
    for (const c of FIG3_DATA) {
      expect(c.points.length).toBeGreaterThanOrEqual(10);
      const err = c.points.reduce((s, [t, g]) => s + Math.abs(g - eqn11(t, c.gKinf, c.tauN)), 0) / c.points.length;
      // the curves were fitted to these points: a mistraced point or a wrong curve shows as a large mean gap
      expect(err).toBeLessThan(0.6);
    }
  });
});

describe("Fig. 3: what the guide says", () => {
  const md = modelAt(6.3);
  it("at 25 mV the sodium current comes first and inward, the potassium current later and outward", () => {
    const s = clampStep(md, 25, 11);
    let iNaPk = 0, tNa = 0, iKmax = 0, tK = 0;
    for (let i = 0; i < s.t.length; i++) {
      if (s.iNa[i] < iNaPk) { iNaPk = s.iNa[i]; tNa = s.t[i]; }
      if (s.iK[i] > iKmax) { iKmax = s.iK[i]; tK = s.t[i]; }
    }
    expect(iNaPk).toBeLessThan(0);
    expect(iKmax).toBeGreaterThan(0);
    expect(tK).toBeGreaterThan(tNa * 3);
  });
  it("gK starts slowly, then faster (an S-shaped delay), and rises faster and higher the larger the step", () => {
    const s = clampStep(md, 25, 11);
    const at = (t: number) => s.gK[Math.round(t / 0.02)];
    // S-shaped: the first 0.1 ms rises at well under the steepest rate (about half), which comes after 0.5 ms
    const early = (at(0.1) - at(0)) / 0.1;
    let steepest = 0, tSteep = 0;
    for (let i = 1; i < s.t.length; i++) { const r = (s.gK[i] - s.gK[i - 1]) / 0.02; if (r > steepest) { steepest = r; tSteep = s.t[i]; } }
    expect(early).toBeLessThan(steepest * 0.6);
    expect(tSteep).toBeGreaterThan(0.5);
    const big = clampStep(md, 109, 11), small = clampStep(md, 26, 11);
    expect(big.gK[big.gK.length - 1]).toBeGreaterThan(small.gK[small.gK.length - 1]);
    const half = (x: typeof s) => { const f = x.gK[x.gK.length - 1]; return x.t[x.gK.findIndex((g) => g >= f / 2)]; };
    expect(half(big)).toBeLessThan(half(small));
  });
  it("the model's ḡK makes its large-step curves higher than axon 17's", () => {
    for (const d of [109, 100, 88, 76]) {
      const s = clampStep(md, d, 11);
      const paper = FIG3_DATA.find((c) => c.depolarization === d)!;
      expect(s.gK[s.gK.length - 1]).toBeGreaterThan(paper.gKinf);
    }
  });
});

describe("Fig. 12 and Table 4: membrane action potentials at 6 °C", () => {
  const md = modelAt(6);
  it("90, 15 and 7 mV fire, at the heights of Table 4; 6 mV does not", () => {
    for (const row of TABLE4) {
      const h = spikeHeight(shock(md, row.depol, 6));
      expect(h).not.toBeNull();
      expect(Math.abs(h! - row.height)).toBeLessThan(0.5);
    }
    expect(spikeHeight(shock(md, 6, 6))).toBeNull();
  });
  it("the spike comes later the smaller the shock: well under 1 ms, about 1 ms, more than 3 ms", () => {
    const tPeak = (d: number) => { const r = shock(md, d, 6); let k = 5; for (let i = 5; i < r.v.length; i++) if (r.v[i] > r.v[k]) k = i; return r.t[k]; };
    expect(tPeak(90)).toBeLessThan(0.5);
    expect(tPeak(15)).toBeGreaterThan(0.8);
    expect(tPeak(15)).toBeLessThan(1.5);
    expect(tPeak(7)).toBeGreaterThan(3);
  });
  it("each step of the walk that names a shock shows it as the newest, smallest trace, and none smaller", () => {
    const f = FIGURES.find((x) => x.id === "fig12")!;
    f.guide.forEach((g, k) => {
      const m = /^(?:A )?(\d+) mV/.exec(g.text);
      if (!m) return;
      expect(Math.min(...guideRig(f, k).steps), `step text: ${g.text.slice(0, 20)}`).toBe(Number(m[1]));
    });
  });
});

describe("Fig. 19: gK and h after the spike", () => {
  it("gK stays raised after the spike and h falls, then both come back by 20 ms", () => {
    const r = shock(modelAt(6), 15, 20);
    const i = (t: number) => Math.round(t / 0.02);
    const h0 = r.h[0], gK0 = r.gK[0];
    let hMin = 1, gKmax = 0;
    for (let k = 0; k < r.t.length; k++) { hMin = Math.min(hMin, r.h[k]); gKmax = Math.max(gKmax, r.gK[k]); }
    expect(hMin).toBeLessThan(h0 / 3);
    // at 5 ms, after the spike: gK still several times rest, h still well down
    expect(r.gK[i(5)]).toBeGreaterThan(gK0 * 3);
    expect(r.h[i(5)]).toBeLessThan(h0 * 0.8);
    // by 20 ms, both near rest
    expect(r.gK[i(19.9)]).toBeLessThan(gKmax * 0.1);
    expect(r.h[i(19.9)]).toBeGreaterThan(h0 * 0.8);
  });
});

describe("the challenges", () => {
  it("each figure's own rig passes its check, and the starting rig does not", () => {
    for (const f of FIGURES) {
      expect(f.check(f.rig).ok, f.id).toBe(true);
      expect(f.check(START_RIG).ok, f.id).toBe(false);
      // the last guide step leaves the rig as the figure
      expect(f.check(guideRig(f, f.guide.length - 1)).ok, f.id).toBe(true);
    }
  });
});
