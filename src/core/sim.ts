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
  /** holding potential, mV */
  hold: number;
  /** first and last test potential, and the spacing, mV */
  from: number;
  to: number;
  by: number;
  /** time at hold before the step, and the step's length, ms */
  pre: number;
  dur: number;
  /** sample interval, ms */
  dtOut: number;
}

export const DEFAULT_CLAMP: ClampProtocol = { hold: -65, from: -55, to: 45, by: 10, pre: 1, dur: 10, dtOut: 0.02 };

export interface ClampSweep {
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
  /** the largest-magnitude INa during the step (its sign kept), and IK at the end of the step */
  iNaPeak: number;
  iKEnd: number;
}

export function testPotentials(c: ClampProtocol): number[] {
  const out: number[] = [];
  for (let v = c.from; v <= c.to + 1e-9; v += c.by) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export function clampFamily(md: Model, c: ClampProtocol): ClampSweep[] {
  const { p, g } = md;
  const n = Math.round((c.pre + c.dur) / c.dtOut) + 1;
  const x0 = { m: g.m.inf(c.hold), h: g.h.inf(c.hold), n: g.n.inf(c.hold) };
  return testPotentials(c).map((v) => {
    const inf = { m: g.m.inf(v), h: g.h.inf(v), n: g.n.inf(v) };
    const tau = { m: g.m.tau(v), h: g.h.tau(v), n: g.n.tau(v) };
    const sw: ClampSweep = {
      v,
      t: new Float64Array(n), iNa: new Float64Array(n), iK: new Float64Array(n),
      gNa: new Float64Array(n), gK: new Float64Array(n),
      m: new Float64Array(n), h: new Float64Array(n), n: new Float64Array(n),
      iNaPeak: 0, iKEnd: 0,
    };
    for (let i = 0; i < n; i++) {
      const t = i * c.dtOut;
      const on = t > c.pre;
      const ts = t - c.pre;
      const vm = on ? v : c.hold;
      const m = on ? inf.m + (x0.m - inf.m) * Math.exp(-ts / tau.m) : x0.m;
      const h = on ? inf.h + (x0.h - inf.h) * Math.exp(-ts / tau.h) : x0.h;
      const nn = on ? inf.n + (x0.n - inf.n) * Math.exp(-ts / tau.n) : x0.n;
      const gna = p.gNa * md.openNa(m, h);
      const gk = p.gK * md.openK(nn);
      sw.t[i] = t; sw.m[i] = m; sw.h[i] = h; sw.n[i] = nn;
      sw.gNa[i] = gna; sw.gK[i] = gk;
      sw.iNa[i] = gna * (vm - p.eNa);
      sw.iK[i] = gk * (vm - p.eK);
      if (on && Math.abs(sw.iNa[i]) > Math.abs(sw.iNaPeak)) sw.iNaPeak = sw.iNa[i];
    }
    sw.iKEnd = sw.iK[n - 1];
    return sw;
  });
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
