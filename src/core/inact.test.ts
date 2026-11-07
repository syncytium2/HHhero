/**
 * The inactivation protocol: hold, a family of prepulses, one fixed test
 * step. The note under its h–V plot (src/core/notes.ts, inactNote) is tested
 * in src/core/views.test.ts; this file holds the protocol's mechanics.
 */
import { describe, expect, it } from "vitest";
import { buildModel, stockParams } from "./model.ts";
import { availability, clampFamily, clampLength, clampTimes, COARSE_MS, DEFAULT_CLAMP, DEFAULT_INACT, FINE_MS, lastStepAt } from "./sim.ts";

const md = buildModel(stockParams());

describe("the inactivation protocol", () => {
  const fam = clampFamily(md, DEFAULT_INACT);
  const iTest = fam[0].t.indexOf(lastStepAt(DEFAULT_INACT));

  it("samples every dtOut where things move fast, coarser late in a prepulse, and lands on every step", () => {
    const t = clampTimes(DEFAULT_INACT), c = DEFAULT_INACT;
    for (const at of [0, c.pre, c.pre + FINE_MS, c.pre + c.cond, clampLength(c)]) expect(t.some((x) => Math.abs(x - at) < 1e-9)).toBe(true);
    expect(t[t.length - 1]).toBeCloseTo(clampLength(c), 9);
    expect(iTest).toBeGreaterThan(0);
    for (let i = 1; i < t.length; i++) {
      const d = t[i] - t[i - 1], x = t[i];
      expect(d).toBeGreaterThan(0);
      if (x <= c.pre + FINE_MS + 1e-9 || x > c.pre + c.cond + 1e-9) expect(d).toBeCloseTo(c.dtOut, 9);
      else expect(d).toBeLessThanOrEqual(COARSE_MS + 1e-9);
    }
    // the step family's sampling is untouched: every dtOut
    expect(Array.from(clampTimes(DEFAULT_CLAMP))).toEqual(Array.from({ length: Math.round(clampLength(DEFAULT_CLAMP) / DEFAULT_CLAMP.dtOut) + 1 }, (_, i) => i * DEFAULT_CLAMP.dtOut));
    // a long prepulse stays a few thousand points
    expect(clampTimes({ ...c, cond: 500 }).length).toBeLessThan(2500);
  });

  it("through the prepulse, each gate is the exact relaxation from rest at hold toward the prepulse", () => {
    const g = md.g, c = DEFAULT_INACT;
    for (const s of fam)
      for (let i = 0; i <= iTest; i++) {
        const ts = s.t[i] - c.pre;
        for (const id of ["m", "h", "n"] as const) {
          const x0 = g[id].inf(c.hold);
          const want = ts <= 0 ? x0 : g[id].inf(s.v) + (x0 - g[id].inf(s.v)) * Math.exp(-ts / g[id].tau(s.v));
          expect(s[id][i]).toBeCloseTo(want, 12);
        }
      }
  });

  it("the gates carry on from the prepulse into the test step, and relax to the test potential", () => {
    const g = md.g, v = DEFAULT_INACT.test;
    for (const s of fam) {
      const h0 = s.h[iTest], t0 = s.t[iTest];
      for (const i of [iTest + 1, iTest + 50, s.t.length - 1]) {
        const ts = s.t[i] - t0;
        expect(s.h[i]).toBeCloseTo(g.h.inf(v) + (h0 - g.h.inf(v)) * Math.exp(-ts / g.h.tau(v)), 12);
      }
    }
  });

  it("the sweep is hold, prepulse, test, and its peak is read in the test step alone", () => {
    expect(clampLength(DEFAULT_INACT)).toBe(DEFAULT_INACT.pre + DEFAULT_INACT.cond + DEFAULT_INACT.dur);
    // the depolarized prepulses open sodium channels too; that transient is not the test step's peak
    const last = fam[fam.length - 1];
    let prePeak = 0;
    for (let i = 0; i <= iTest; i++) prePeak = Math.max(prePeak, last.gNa[i]);
    expect(prePeak).toBeGreaterThan(last.gNaPeak);
    for (const s of fam) {
      let pk = 0;
      for (let i = iTest + 1; i < s.t.length; i++) pk = Math.max(pk, s.gNa[i]);
      expect(s.gNaPeak).toBe(pk);
    }
  });

  it("availability is each peak over the largest, and all zero with no sodium conductance", () => {
    const a = availability(fam);
    expect(Math.max(...a)).toBe(1);
    for (const x of a) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1); }
    // from hyperpolarized prepulses to depolarized ones, fewer channels are left to open
    for (let j = 1; j < a.length; j++) expect(a[j]).toBeLessThanOrEqual(a[j - 1]);
    expect(availability(clampFamily(buildModel({ ...stockParams(), gNa: 0 }), DEFAULT_INACT))).toEqual(a.map(() => 0));
  });

  it("peak gNa over the largest equals peak INa over the largest: one test potential, one driving force", () => {
    const a = availability(fam), top = Math.max(...fam.map((s) => Math.abs(s.iNaPeak)));
    fam.forEach((s, j) => expect(Math.abs(s.iNaPeak) / top).toBeCloseTo(a[j], 12));
  });

  it("the default prepulse is more than five of h's slowest τ at 6.3 °C", () => {
    let slow = 0;
    for (let v = -150; v <= 50; v += 0.1) slow = Math.max(slow, md.g.h.tau(v));
    expect(DEFAULT_INACT.cond).toBeGreaterThan(5 * slow);
  });

  it("h∞ is near zero at the default test potential", () => {
    expect(md.g.h.inf(DEFAULT_INACT.test)).toBeLessThan(0.005);
  });
});
