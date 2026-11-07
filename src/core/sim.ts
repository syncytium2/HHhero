/**
 * Two experiments on the model, both without an electrode: what no rig can
 * record, labeled as such in the app.
 *
 * Voltage clamp, ideal: at a fixed voltage each gate relaxes exactly as an
 * exponential, x(t) = x∞ + (x₀ − x∞) e^(−t/τ), so a step family is a formula,
 * not an integration, and redraws as fast as a slider moves.
 *
 * Current clamp: NEURON's default fixed-step scheme, as gaba_excites runs it
 * (src/core/simulate.ts there): V by backward Euler with the conductances
 * frozen over the step, then each gate relaxed exactly at the new V
 * (Rush–Larsen). src/core/hh.test.ts holds it to NEURON's spike times.
 */

import { powi, restingV, type Model } from "./model.ts";

// ---------------------------------------------------------------- voltage clamp

export interface ClampProtocol {
  /**
   * "steps": hold, then a family of test steps (activation).
   * "inact": hold, then a family of conditioning prepulses, then one fixed
   * test step; the peak INa at the test step against the prepulse is the
   * steady-state inactivation (h∞) curve, as Hodgkin & Huxley 1952c measured it.
   */
  kind: "steps" | "inact";
  /** holding potential, mV */
  hold: number;
  /** the family: first and last potential, and the spacing, mV (the steps, or the prepulses) */
  from: number;
  to: number;
  by: number;
  /** time at hold before the family's step, ms */
  pre: number;
  /** "inact" only: the prepulse's length, ms, and the test potential, mV */
  cond: number;
  test: number;
  /** the last step's length (the step, or the test step), ms */
  dur: number;
  /** sample interval, ms */
  dtOut: number;
}

export const DEFAULT_CLAMP: ClampProtocol = { kind: "steps", hold: -65, from: -55, to: 45, by: 10, pre: 1, cond: 0, test: 0, dur: 10, dtOut: 0.02 };

/**
 * The prepulses run long enough for h to settle (50 ms is more than five of
 * its slowest τ at 6.3 °C), and the test step goes to 0 mV, where h∞ is near
 * zero, so the test step's peak INa is set by h at the end of the prepulse.
 */
export const DEFAULT_INACT: ClampProtocol = { kind: "inact", hold: -65, from: -125, to: -25, by: 10, pre: 1, cond: 50, test: 0, dur: 10, dtOut: 0.02 };

export interface ClampSweep {
  /** the family's potential: the step, or the prepulse */
  v: number;
  t: Float64Array;
  /** µA/cm², outward positive */
  iNa: Float64Array;
  iK: Float64Array;
  /** mS/cm² */
  gNa: Float64Array;
  gK: Float64Array;
  m: Float64Array;
  h: Float64Array;
  n: Float64Array;
  /** during the last step (the step, or the test step): the largest-magnitude INa (its sign kept) and the largest gNa; IK at its end */
  iNaPeak: number;
  gNaPeak: number;
  iKEnd: number;
}

export function testPotentials(c: ClampProtocol): number[] {
  const out: number[] = [];
  for (let v = c.from; v <= c.to + 1e-9; v += c.by) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** When the last step (the step, or the test step) begins, ms. */
export function lastStepAt(c: ClampProtocol): number {
  return c.kind === "inact" ? c.pre + c.cond : c.pre;
}

/** The sweep's length, ms. */
export function clampLength(c: ClampProtocol): number {
  return lastStepAt(c) + c.dur;
}

/** The command voltage as segments: each from its start time, ms, at a voltage, mV. */
export function clampSegments(c: ClampProtocol, v: number): { t0: number; v: number }[] {
  return c.kind === "inact"
    ? [{ t0: 0, v: c.hold }, { t0: c.pre, v }, { t0: c.pre + c.cond, v: c.test }]
    : [{ t0: 0, v: c.hold }, { t0: c.pre, v }];
}

/** Past this long into a prepulse, the inactivation protocol samples every COARSE_MS: m has long settled, and h and n are slow. */
export const FINE_MS = 5, COARSE_MS = 0.5;

/**
 * The sample times, ms. The step family: every dtOut. The inactivation
 * protocol: every dtOut, except a prepulse past its first FINE_MS, which is
 * sampled about every COARSE_MS (ending exactly at the test step), so a long
 * prepulse stays a few thousand points.
 */
export function clampTimes(c: ClampProtocol): Float64Array {
  if (c.kind !== "inact") return Float64Array.from({ length: Math.round(clampLength(c) / c.dtOut) + 1 }, (_, i) => i * c.dtOut);
  const t: number[] = [];
  const fine = (t0: number, ms: number) => { const k = Math.round(ms / c.dtOut); for (let i = 1; i <= k; i++) t.push(t0 + i * c.dtOut); };
  t.push(0);
  fine(0, c.pre);
  const f = Math.min(FINE_MS, c.cond);
  fine(c.pre, f);
  const rest = c.cond - f, nc = Math.ceil(rest / COARSE_MS - 1e-9);
  for (let i = 1; i <= nc; i++) t.push(i === nc ? c.pre + c.cond : c.pre + f + (i * rest) / nc);
  fine(c.pre + c.cond, c.dur);
  return Float64Array.from(t);
}

export function clampFamily(md: Model, c: ClampProtocol): ClampSweep[] {
  const { p, g } = md;
  const times = clampTimes(c);
  const n = times.length;
  const tLast = lastStepAt(c);
  return testPotentials(c).map((v) => {
    const sw: ClampSweep = {
      v,
      t: new Float64Array(n), iNa: new Float64Array(n), iK: new Float64Array(n),
      gNa: new Float64Array(n), gK: new Float64Array(n),
      m: new Float64Array(n), h: new Float64Array(n), n: new Float64Array(n),
      iNaPeak: 0, gNaPeak: 0, iKEnd: 0,
    };
    // each segment relaxes every gate exactly from where the one before left it; the first starts at rest at hold
    const seg = clampSegments(c, v).map((s) => ({
      ...s,
      inf: { m: g.m.inf(s.v), h: g.h.inf(s.v), n: g.n.inf(s.v) },
      tau: { m: g.m.tau(s.v), h: g.h.tau(s.v), n: g.n.tau(s.v) },
      x0: { m: 0, h: 0, n: 0 },
    }));
    seg[0].x0 = { ...seg[0].inf };
    for (let j = 1; j < seg.length; j++) {
      const a = seg[j - 1], dt = seg[j].t0 - a.t0;
      const at = (id: "m" | "h" | "n") => a.inf[id] + (a.x0[id] - a.inf[id]) * Math.exp(-dt / a.tau[id]);
      seg[j].x0 = { m: at("m"), h: at("h"), n: at("n") };
    }
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = times[i];
      // a sample exactly at a step's time still belongs to the segment before it
      while (j + 1 < seg.length && t > seg[j + 1].t0) j++;
      const s = seg[j], ts = t - s.t0;
      const relax = (id: "m" | "h" | "n") => (j === 0 ? s.x0[id] : s.inf[id] + (s.x0[id] - s.inf[id]) * Math.exp(-ts / s.tau[id]));
      const m = relax("m"), h = relax("h"), nn = relax("n");
      const gna = p.gNa * md.openNa(m, h);
      const gk = p.gK * md.openK(nn);
      sw.t[i] = t; sw.m[i] = m; sw.h[i] = h; sw.n[i] = nn;
      sw.gNa[i] = gna; sw.gK[i] = gk;
      sw.iNa[i] = gna * (s.v - p.eNa);
      sw.iK[i] = gk * (s.v - p.eK);
      if (t > tLast) {
        if (Math.abs(sw.iNa[i]) > Math.abs(sw.iNaPeak)) sw.iNaPeak = sw.iNa[i];
        if (gna > sw.gNaPeak) sw.gNaPeak = gna;
      }
    }
    sw.iKEnd = sw.iK[n - 1];
    return sw;
  });
}

/**
 * Inactivation: each sweep's peak gNa at the test step divided by the
 * family's largest (0 when no sweep has any). At a fixed test potential the
 * driving force is the same in every sweep, so this is also peak INa over the
 * largest peak INa.
 */
export function availability(fam: ClampSweep[]): number[] {
  const top = Math.max(0, ...fam.map((s) => s.gNaPeak));
  return fam.map((s) => (top > 0 ? s.gNaPeak / top : 0));
}

// ---------------------------------------------------------------- current clamp

export interface State {
  v: number;
  m: number;
  h: number;
  n: number;
}

/** The steady state at V. */
export function steadyAt(md: Model, v: number): State {
  return { v, m: md.g.m.inf(v), h: md.g.h.inf(v), n: md.g.n.inf(v) };
}

/** One step of dt, in place, with `iInj` µA/cm² injected (inward-going positive: it depolarizes). */
export function step(md: Model, s: State, iInj: number, dt: number): void {
  const { p, g } = md;
  const gna = p.gNa * md.openNa(s.m, s.h);
  const gk = p.gK * powi(s.n, p.pn);
  const G = p.gL + gna + gk;
  const GE = p.gL * p.eL + gna * p.eNa + gk * p.eK;
  const cdt = p.cm / dt;
  const v1 = (cdt * s.v + GE + iInj) / (cdt + G);
  s.v = v1;
  const relax = (x: number, inf: number, tau: number) => inf + (x - inf) * Math.exp(-dt / tau);
  s.m = relax(s.m, g.m.inf(v1), g.m.tau(v1));
  s.h = relax(s.h, g.h.inf(v1), g.h.tau(v1));
  s.n = relax(s.n, g.n.inf(v1), g.n.tau(v1));
}

/** Start at the steady state for `iHold` and run `ms` to let any slow drift finish. */
export function settle(md: Model, iHold: number, ms: number, dt: number): State {
  let v0 = restingV(md, iHold);
  if (!Number.isFinite(v0)) v0 = md.p.eL;
  const s = steadyAt(md, v0);
  const n = Math.round(ms / dt);
  for (let i = 0; i < n; i++) step(md, s, iHold, dt);
  return s;
}

export interface Stimulus {
  /** µA/cm², positive depolarizes */
  amp: number;
  /** onset and duration, ms */
  start: number;
  dur: number;
  /** sweep length, ms */
  sweep: number;
  /** holding current, µA/cm² */
  hold: number;
}

export const DEFAULT_STIM: Stimulus = { amp: 20, start: 5, dur: 0.5, sweep: 40, hold: 0 };

export interface FreeSweep {
  t: Float64Array;
  v: Float64Array;
  iNa: Float64Array;
  iK: Float64Array;
  gNa: Float64Array;
  gK: Float64Array;
  m: Float64Array;
  h: Float64Array;
  n: Float64Array;
  iStim: Float64Array;
}

/**
 * A sweep from a settled state. The current in step i (from t − dt to t,
 * t = i·dt) is the stimulus if start ≤ t < start + dur, as in gaba_excites.
 */
export function freeRun(md: Model, stim: Stimulus, from: State, dt: number, every = 1): FreeSweep {
  const { p } = md;
  const nSteps = Math.round(stim.sweep / dt);
  const nOut = Math.floor(nSteps / every) + 1;
  const iOn = Math.round(stim.start / dt), iOff = Math.round((stim.start + stim.dur) / dt);
  const out: FreeSweep = {
    t: new Float64Array(nOut), v: new Float64Array(nOut), iNa: new Float64Array(nOut), iK: new Float64Array(nOut),
    gNa: new Float64Array(nOut), gK: new Float64Array(nOut), m: new Float64Array(nOut), h: new Float64Array(nOut),
    n: new Float64Array(nOut), iStim: new Float64Array(nOut),
  };
  const s = { ...from };
  const record = (j: number, t: number, i: number) => {
    const gna = p.gNa * md.openNa(s.m, s.h);
    const gk = p.gK * md.openK(s.n);
    out.t[j] = t; out.v[j] = s.v; out.m[j] = s.m; out.h[j] = s.h; out.n[j] = s.n;
    out.gNa[j] = gna; out.gK[j] = gk;
    out.iNa[j] = gna * (s.v - p.eNa); out.iK[j] = gk * (s.v - p.eK);
    out.iStim[j] = i;
  };
  record(0, 0, stim.hold);
  for (let i = 1; i <= nSteps; i++) {
    const iInj = stim.hold + (i >= iOn && i < iOff ? stim.amp : 0);
    step(md, s, iInj, dt);
    if (i % every === 0) record(i / every, i * dt, iInj);
  }
  return out;
}

/**
 * Spike times, ms: upward crossings of −20 mV, interpolated between samples,
 * re-armed below −40 mV. The rule tools/neuron_oracle_hh.py applies to NEURON.
 */
export function spikeTimes(t: ArrayLike<number>, v: ArrayLike<number>): number[] {
  const out: number[] = [];
  let armed = v[0] < -20;
  for (let i = 1; i < v.length; i++) {
    if (!armed) {
      if (v[i] < -40) armed = true;
      continue;
    }
    if (v[i - 1] < -20 && v[i] >= -20) {
      armed = false;
      out.push(t[i - 1] + ((-20 - v[i - 1]) / (v[i] - v[i - 1])) * (t[i] - t[i - 1]));
    }
  }
  return out;
}

// ---------------------------------------------------------------- threshold, for stepping through

/**
 * Does this pulse fire the cell, from the settled state `from`? A −20 mV
 * crossing after the pulse starts, carried by the cell's own sodium current:
 * its peak inward INa must exceed the pulse. Without that, a big enough pulse
 * would cross −20 mV on its own, with no channel involved.
 */
export function fires(md: Model, stim: Stimulus, from: State, dt: number): boolean {
  const r = freeRun(md, stim, from, dt, 5);
  if (!spikeTimes(r.t, r.v).some((t) => t >= stim.start)) return false;
  let inward = 0;
  for (let i = 0; i < r.t.length; i++) if (r.t[i] >= stim.start && -r.iNa[i] > inward) inward = -r.iNa[i];
  return inward > Math.abs(stim.amp);
}

/**
 * The smallest pulse amplitude (µA/cm²) that fires the cell, to `rel`, by
 * bisection; the pulse's length and the hold come from `stim`. Null when the
 * cell fires with no pulse (it is already firing) or not even at `maxAmp`.
 */
export function pulseThreshold(md: Model, stim: Stimulus, from: State, dt: number, maxAmp = 2000, rel = 1e-4): number | null {
  if (fires(md, { ...stim, amp: 0 }, from, dt)) return null;
  let hi = Math.max(1, stim.amp);
  while (!fires(md, { ...stim, amp: hi }, from, dt)) {
    hi *= 2;
    if (hi > maxAmp) return null;
  }
  let lo = 0;
  while (hi - lo > rel * hi) {
    const mid = (lo + hi) / 2;
    if (fires(md, { ...stim, amp: mid }, from, dt)) hi = mid;
    else lo = mid;
  }
  return hi;
}

export interface LadderStep {
  amp: number;
  /** a rung placed against the threshold itself */
  role?: "under" | "over" | "strong";
}

/** 1, 2, 2.5 or 5 times a power of ten, the nearest at or below x. */
export function niceStep(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  return (f >= 5 ? 5 : f >= 2.5 ? 2.5 : f >= 2 ? 2 : 1) * p;
}

/**
 * The amplitudes to step through: even, round steps below threshold, then
 * 1% under and 1% over it (all or none), then twice it (a shorter delay).
 * With no threshold, quarters of `amp`.
 */
export function thresholdLadder(thr: number | null, amp: number): LadderStep[] {
  if (thr === null) return [0.25, 0.5, 0.75, 1].map((f) => ({ amp: f * Math.abs(amp || 1) }));
  const d = niceStep(thr / 6);
  const out: LadderStep[] = [];
  for (let k = 1; k * d < 0.97 * thr; k++) out.push({ amp: k * d });
  out.push({ amp: 0.99 * thr, role: "under" }, { amp: 1.01 * thr, role: "over" }, { amp: 2 * thr, role: "strong" });
  return out;
}

/** Your own pulses to step through: `count` of them, from `first`, `by` apart. */
export function evenLadder(first: number, by: number, count: number): LadderStep[] {
  return Array.from({ length: Math.max(1, Math.round(count)) }, (_, j) => ({ amp: first + j * by }));
}
