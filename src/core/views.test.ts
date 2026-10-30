/**
 * The contract of the switch: the two views are one model. At no edit both
 * are the stock HH model to the bit; the conversion round-trips; and every
 * equivalence the app's notes state is true.
 */
import { describe, expect, it } from "vitest";
import { buildGate, GATE_IDS, NO_EDIT, phiAt, rate, STOCK_RATES, stockGate, type GateParams, type Rate } from "./rates.ts";
import { hhH, hhM, hhN, hhPhi } from "./reference.ts";
import { noteFor } from "./notes.ts";

const REF = { m: hhM, h: hhH, n: hhN };
const VS: number[] = [];
for (let v = -150; v <= 100; v += 0.37) VS.push(v);
VS.push(-40, -55, -65, -35, -25); // the removable singularities and the centres

describe("at no edit, both views are gaba_excites' (NEURON-checked) HH gates to the bit", () => {
  for (const celsius of [0, 6.3, 18.5, 30])
    for (const id of GATE_IDS)
      it(`${id} at ${celsius} °C: x∞ and τ identical at every voltage`, () => {
        const g = buildGate(stockGate(id), celsius);
        const phi = hhPhi(celsius);
        for (const v of VS) {
          const r = REF[id](v, phi);
          expect(g.inf(v)).toBe(r.inf);
          expect(g.tau(v)).toBe(r.tau);
        }
      });
});

describe("the conversion is exact both ways", () => {
  it("α/β → x∞/τ → α/β returns the rates (at temperature) to 1e-12", () => {
    for (const celsius of [6.3, 20])
      for (const id of GATE_IDS) {
        const g = buildGate(stockGate(id), celsius);
        const phi = phiAt(celsius);
        for (const v of VS) {
          const a = phi * rate(STOCK_RATES[id].alpha, v), b = phi * rate(STOCK_RATES[id].beta, v);
          expect(Math.abs(g.alpha(v) - a)).toBeLessThan(1e-12 * Math.max(1, a));
          expect(Math.abs(g.beta(v) - b)).toBeLessThan(1e-12 * Math.max(1, b));
        }
      }
  });

  it("x∞/τ edits come back as α = x∞/τ and β = (1 − x∞)/τ, never negative", () => {
    const p: GateParams = { ...stockGate("n"), it: { dHalf: 12, slope: 1.7, tauScale: 0.3, tauShift: -9 } };
    const g = buildGate(p, 6.3);
    for (const v of VS) {
      expect(g.alpha(v)).toBeGreaterThanOrEqual(0);
      expect(g.beta(v)).toBeGreaterThanOrEqual(0);
      expect(g.alpha(v) / (g.alpha(v) + g.beta(v))).toBeCloseTo(g.inf(v), 12);
      expect(1 / (g.alpha(v) + g.beta(v))).toBeCloseTo(g.tau(v), 10);
    }
  });
});

const close = (a: number, b: number, rel = 1e-12) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-300);
const withRates = (id: "m" | "h" | "n", fa: (r: Rate) => Rate, fb: (r: Rate) => Rate): GateParams => ({
  alpha: fa({ ...STOCK_RATES[id].alpha }), beta: fb({ ...STOCK_RATES[id].beta }), it: { ...NO_EDIT },
});

describe("what the notes claim", () => {
  it("both rates × c: x∞ unchanged, τ divided by c (and that is what temperature does)", () => {
    for (const id of GATE_IDS) {
      const c = 2.5;
      const g0 = buildGate(stockGate(id), 6.3);
      const g = buildGate(withRates(id, (r) => ({ ...r, A: r.A * c }), (r) => ({ ...r, A: r.A * c })), 6.3);
      const warm = buildGate(stockGate(id), 6.3 + 10 * Math.log(c) / Math.log(3));
      for (const v of VS) {
        expect(close(g.inf(v), g0.inf(v), 1e-12)).toBe(true);
        expect(close(g.tau(v), g0.tau(v) / c, 1e-12)).toBe(true);
        expect(close(warm.tau(v), g.tau(v), 1e-10)).toBe(true);
      }
      expect(noteFor("ab", id, withRates(id, (r) => ({ ...r, A: r.A * c }), (r) => ({ ...r, A: r.A * c })))).toMatch(/unchanged/);
    }
  });

  it("both rates shifted by Δ: x∞ and τ slide together by Δ", () => {
    for (const id of GATE_IDS) {
      const d = 7;
      const g0 = buildGate(stockGate(id), 6.3);
      const g = buildGate(withRates(id, (r) => ({ ...r, v0: r.v0 + d }), (r) => ({ ...r, v0: r.v0 + d })), 6.3);
      for (const v of VS) {
        expect(g.inf(v + d)).toBeCloseTo(g0.inf(v), 12);
        expect(close(g.tau(v + d), g0.tau(v), 1e-9)).toBe(true);
      }
    }
  });

  it("each α or β constant, moved alone, moves both x∞ and τ", () => {
    for (const id of GATE_IDS)
      for (const which of ["alpha", "beta"] as const)
        for (const key of ["A", "v0", "k"] as const) {
          const p = stockGate(id);
          p[which] = { ...p[which], [key]: p[which][key] * 1.3 + (key === "v0" ? 5 : 0) };
          const g0 = buildGate(stockGate(id), 6.3), g = buildGate(p, 6.3);
          const dInf = Math.max(...VS.map((v) => Math.abs(g.inf(v) - g0.inf(v))));
          const dTau = Math.max(...VS.map((v) => Math.abs(g.tau(v) - g0.tau(v)) / g0.tau(v)));
          expect(dInf, `${id} ${which}.${key}: x∞`).toBeGreaterThan(1e-3);
          expect(dTau, `${id} ${which}.${key}: τ`).toBeGreaterThan(1e-3);
        }
  });

  it("an x∞ edit leaves τ alone, and a τ edit leaves x∞ alone", () => {
    for (const id of GATE_IDS) {
      const g0 = buildGate(stockGate(id), 6.3);
      const gi = buildGate({ ...stockGate(id), it: { ...NO_EDIT, dHalf: 10, slope: 1.5 } }, 6.3);
      const gt = buildGate({ ...stockGate(id), it: { ...NO_EDIT, tauScale: 3, tauShift: -8 } }, 6.3);
      for (const v of VS) {
        expect(gi.tau(v)).toBe(g0.tau(v));
        expect(gt.inf(v)).toBe(g0.inf(v));
      }
      expect(Math.abs(gi.inf(g0.vHalfBase + 10) - 0.5)).toBeLessThan(1e-9);
    }
  });

  it("τ × c with x∞ unchanged is the same model as α and β × 1/c", () => {
    for (const id of GATE_IDS) {
      const c = 0.4;
      const gt = buildGate({ ...stockGate(id), it: { ...NO_EDIT, tauScale: c } }, 6.3);
      const gr = buildGate(withRates(id, (r) => ({ ...r, A: r.A / c }), (r) => ({ ...r, A: r.A / c })), 6.3);
      for (const v of VS) {
        expect(gt.inf(v)).toBeCloseTo(gr.inf(v), 12);
        expect(close(gt.tau(v), gr.tau(v), 1e-12)).toBe(true);
      }
      expect(noteFor("it", id, { ...stockGate(id), it: { ...NO_EDIT, tauScale: c } })).toMatch(/same as scaling/);
    }
  });

  it("no note at no edit", () => {
    for (const id of GATE_IDS) {
      expect(noteFor("ab", id, stockGate(id))).toBeNull();
      expect(noteFor("it", id, stockGate(id))).toBeNull();
    }
  });
});
