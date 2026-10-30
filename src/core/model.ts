/**
 * The space-clamped squid axon: one patch of membrane, INa = ḡNa m³h (V − ENa),
 * IK = ḡK n⁴ (V − EK), and a leak. Hodgkin & Huxley 1952, Eq. 26 and Table 3
 * (p. 520), in the modern sign: E_Na +50, E_K −77, E_L −54.387 mV (rest −65),
 * ḡNa 120, ḡK 36, ḡL 0.3 mS/cm², C 1 µF/cm². The gate powers are editable,
 * because "why m³ and n⁴" is a question students ask.
 *
 * Units, the paper's: mV, ms, mS/cm², µA/cm², µF/cm² (mS·mV = µA, µA/µF = mV/ms).
 */

import { buildGate, GATE_IDS, stockGate, type Gate, type GateId, type GateParams } from "./rates.ts";

export interface Params {
  gates: Record<GateId, GateParams>;
  gNa: number;
  eNa: number;
  /** power of m in INa */
  pm: number;
  /** power of h in INa */
  ph: number;
  gK: number;
  eK: number;
  /** power of n in IK */
  pn: number;
  gL: number;
  eL: number;
  cm: number;
  celsius: number;
}

export function stockParams(): Params {
  return {
    gates: { m: stockGate("m"), h: stockGate("h"), n: stockGate("n") },
    gNa: 120, eNa: 50, pm: 3, ph: 1,
    gK: 36, eK: -77, pn: 4,
    gL: 0.3, eL: -54.387, cm: 1,
    celsius: 6.3,
  };
}

/** x^p for a small whole p, by repeated multiplication (so m³ is m·m·m, as hh.mod computes it). */
export function powi(x: number, p: number): number {
  let r = 1;
  for (let i = 0; i < p; i++) r *= x;
  return r;
}

export interface Model {
  p: Params;
  g: Record<GateId, Gate>;
  /** open fractions from gate values */
  openNa(m: number, h: number): number;
  openK(n: number): number;
}

export function buildModel(p: Params): Model {
  const g = {} as Record<GateId, Gate>;
  for (const id of GATE_IDS) g[id] = buildGate(p.gates[id], p.celsius);
  return {
    p,
    g,
    openNa: (m, h) => powi(m, p.pm) * powi(h, p.ph),
    openK: (n) => powi(n, p.pn),
  };
}

/** Total ionic current at steady state, µA/cm², outward positive. */
export function iSteady(md: Model, v: number): number {
  const { p, g } = md;
  return (
    p.gNa * md.openNa(g.m.inf(v), g.h.inf(v)) * (v - p.eNa) +
    p.gK * md.openK(g.n.inf(v)) * (v - p.eK) +
    p.gL * (v - p.eL)
  );
}

/**
 * The resting potential under a constant current: the steady state nearest
 * −65 mV, found by scanning outward for a sign change and bisecting it. NaN
 * if there is none in [−150, 100].
 */
export function restingV(md: Model, iInj = 0): number {
  const f = (v: number) => iSteady(md, v) - iInj;
  const bisect = (lo: number, hi: number) => {
    let flo = f(lo);
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      const fm = f(mid);
      if (fm * flo > 0) { lo = mid; flo = fm; } else hi = mid;
    }
    return (lo + hi) / 2;
  };
  for (let d = 0; d <= 250; d += 0.5) {
    for (const [a, b] of [[-65 + d, -65 + d + 0.5], [-65 - d - 0.5, -65 - d]]) {
      if (a < -150 || b > 100) continue;
      if (f(a) === 0) return a;
      if (f(a) * f(b) < 0) return bisect(a, b);
    }
  }
  return NaN;
}
