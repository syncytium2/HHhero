/**
 * A protocol as an electrophysiologist writes one: a list of epochs, each a
 * level held for a duration, and a number of sweeps. Each epoch can change
 * from sweep to sweep, by a fixed amount in level and in duration (pClamp's
 * "delta level" and "delta duration"). The first epoch is the hold: the cell
 * starts each sweep settled there.
 *
 * One protocol, two modes. In voltage clamp a level is a command potential
 * (mV) and the clamp is ideal, so each gate relaxes exactly as an exponential
 * within an epoch and a sweep is a formula. In current clamp a level is an
 * injected current (µA/cm², positive depolarizes) and the membrane is
 * integrated as freeRun integrates it.
 *
 * With five epochs this covers the 1952 experiments: a step family, the
 * conditioning step before a test step, two pulses with a varied gap, tails,
 * two shocks, and release from a hyperpolarizing hold (anode break).
 */
import type { Model } from "./model.ts";
import { COARSE_MS, FINE_MS, runInjected, settle, spikeTimes, type ClampSweep, type FreeSweep, type State } from "./sim.ts";

export type Mode = "v" | "i";

export interface Epoch {
  /** mV in voltage clamp, µA/cm² in current clamp */
  level: number;
  /** added to the level at each sweep */
  dLevel: number;
  /** ms */
  dur: number;
  /** added to the duration at each sweep */
  dDur: number;
}

export interface Protocol {
  mode: Mode;
  epochs: Epoch[];
  sweeps: number;
  /** the epoch the I–V (or its like) measures: peak INa in it, IK at its end */
  measure: number;
}

export const MAX_EPOCHS = 5;
export const MAX_SWEEPS = 20;
export const LETTERS = "ABCDE";

const tidy = (x: number) => Math.round(x * 1e6) / 1e6;

/** epoch `e` as sweep `k` (from 0) plays it */
export function epochIn(e: Epoch, k: number): { level: number; dur: number } {
  return { level: tidy(e.level + k * e.dLevel), dur: Math.max(0, tidy(e.dur + k * e.dDur)) };
}
export function sweepEpochs(p: Protocol, k: number) {
  return p.epochs.map((e) => epochIn(e, k));
}
export function sweepLength(p: Protocol, k: number): number {
  return sweepEpochs(p, k).reduce((s, e) => s + e.dur, 0);
}
export function longestSweep(p: Protocol): number {
  let mx = 0;
  for (let k = 0; k < p.sweeps; k++) mx = Math.max(mx, sweepLength(p, k));
  return mx;
}

/** what changes from sweep to sweep: the first epoch whose level changes, else whose duration does */
export type Swept = { what: "level" | "dur"; epoch: number } | null;
export function swept(p: Protocol): Swept {
  if (p.sweeps < 2) return null;
  const l = p.epochs.findIndex((e) => e.dLevel !== 0);
  if (l >= 0) return { what: "level", epoch: l };
  const d = p.epochs.findIndex((e) => e.dDur !== 0);
  return d >= 0 ? { what: "dur", epoch: d } : null;
}
/** the swept quantity in sweep k (the sweep's number, from 1, when nothing changes) */
export function sweptValue(p: Protocol, k: number): number {
  const s = swept(p);
  if (!s) return k + 1;
  const e = epochIn(p.epochs[s.epoch], k);
  return s.what === "level" ? e.level : e.dur;
}

/** the command (or injected current) of sweep k as a polyline, for the protocol strip */
export function commandLine(p: Protocol, k: number): { x: number[]; y: number[] } {
  const x: number[] = [], y: number[] = [];
  let t = 0;
  for (const e of sweepEpochs(p, k)) {
    x.push(t, t + e.dur);
    y.push(e.level, e.level);
    t += e.dur;
  }
  return { x, y };
}

/** which epoch of sweep k holds time t (an epoch owns its end, the first owns t = 0) */
export function epochAtTime(p: Protocol, k: number, t: number): number {
  let end = 0;
  const eps = sweepEpochs(p, k);
  for (let j = 0; j < eps.length; j++) {
    end += eps[j].dur;
    if (t <= end) return j;
  }
  return eps.length - 1;
}

// ---------------------------------------------------------------- voltage clamp

export interface ProtoClampSweep extends ClampSweep {
  /** which sweep, from 0, and its swept value */
  k: number;
  x: number;
  /** the conductances read as the currents are: peak gNa in the measured epoch, gK at its end */
  gNaPeak: number;
  gKEnd: number;
}

/**
 * A protocol that sweeps a prepulse ahead of the epoch it measures: the
 * inactivation shape (prepulses, then one test step). Its I–V becomes h–V.
 */
export function inactShaped(p: Protocol): boolean {
  const s = swept(p);
  return p.mode === "v" && !!s && s.what === "level" && s.epoch > 0 && s.epoch < p.measure;
}

/**
 * A protocol that lengthens a prepulse ahead of the epoch it measures: the
 * time course of inactivation (onset, or recovery). Its peaks fall or rise as
 * h does at the prepulse's potential.
 */
export function onsetShaped(p: Protocol): boolean {
  const s = swept(p);
  return p.mode === "v" && !!s && s.what === "dur" && s.epoch > 0 && s.epoch < p.measure;
}

/**
 * h at the end of the swept epoch, for any length of it: the gates as the
 * epoch begins (sweep 0's history, which a length change does not alter),
 * relaxing exactly toward h∞ at its level with its τh. The model's own
 * time course, for the dashed line over the peaks.
 */
export function hAfter(md: Model, p: Protocol, durs: number[]): number[] {
  const s = swept(p);
  if (!s) return durs.map(() => NaN);
  const eps = sweepEpochs(p, 0);
  const g = md.g.h;
  let h = g.inf(eps[0].level);
  for (let j = 1; j < s.epoch; j++) {
    const v = eps[j].level;
    h = g.inf(v) + (h - g.inf(v)) * Math.exp(-eps[j].dur / g.tau(v));
  }
  const v = eps[s.epoch].level, inf = g.inf(v), tau = g.tau(v);
  return durs.map((d) => inf + (h - inf) * Math.exp(-d / tau));
}

/**
 * The time course of inactivation, drawn on the traces: each sweep's peak at
 * the measured epoch (INa in mA/cm², or gNa with `g`) as a dot where it
 * happens, and an exponential from the first peak to the last with τh at the
 * swept epoch's potential, placed where each length of it puts the peak.
 */
export function timeCourse(md: Model, p: Protocol, fam: ProtoClampSweep[], g = false) {
  const s = swept(p)!;
  const ms = p.measure;
  const startOf = (k: number) => sweepEpochs(p, k).slice(0, ms).reduce((a, e) => a + e.dur, 0);
  const val = (sw: ProtoClampSweep) => (g ? sw.gNaPeak : sw.iNaPeak / 1000);
  const at = (sw: ProtoClampSweep) => {
    const want = g ? sw.gNaPeak : sw.iNaPeak, arr = g ? sw.gNa : sw.iNa, t0 = startOf(sw.k);
    for (let i = 0; i < arr.length; i++) if (sw.t[i] > t0 && arr[i] === want) return sw.t[i];
    return t0;
  };
  const dots = { x: fam.map(at), y: fam.map(val) };
  const tau = md.g.h.tau(sweepEpochs(p, 0)[s.epoch].level);
  const d0 = fam[0].x, d1 = fam[fam.length - 1].x, y0 = dots.y[0], y1 = dots.y[dots.y.length - 1];
  const lag = dots.x[0] - startOf(0);
  const ds = Array.from({ length: 121 }, (_, i) => d0 + ((d1 - d0) * i) / 120);
  // from the first peak toward the last: y1 is where it settles, if the last sweep is long enough to have settled
  const span = 1 - Math.exp(-(d1 - d0) / tau);
  const amp = span > 0 ? (y0 - y1) / span : 0;
  const line = {
    x: ds.map((d) => startOf(0) + (d - d0) + lag),
    y: ds.map((d) => y0 - amp * (1 - Math.exp(-(d - d0) / tau))),
  };
  const lineAt = (d: number) => y0 - amp * (1 - Math.exp(-(d - d0) / tau));
  return { tau, dots, line, lineAt };
}

/**
 * The sample times of sweep k, ms. Every dtOut from 0, as the step family
 * always was, unless some epoch other than the first and the measured one is
 * longer than FINE_MS: then each epoch is sampled from its own start, and
 * such an epoch every dtOut for its first FINE_MS and about every COARSE_MS
 * after (m has settled; h and n are slow), ending exactly at its end. That
 * is sim.ts's clampTimes for the inactivation protocol, so a 500 ms prepulse
 * stays a few thousand points and the Inactivation preset is the 7 Nov
 * protocol to the bit.
 */
export function sweepTimes(p: Protocol, k: number, dtOut: number): Float64Array {
  const eps = sweepEpochs(p, k);
  const ms = Math.min(Math.max(0, p.measure), eps.length - 1);
  const coarse = (j: number) => j > 0 && j !== ms && eps[j].dur > FINE_MS;
  if (!eps.some((_, j) => coarse(j))) {
    const T = eps.reduce((s, e) => s + e.dur, 0);
    return Float64Array.from({ length: Math.round(T / dtOut) + 1 }, (_, i) => i * dtOut);
  }
  const t: number[] = [0];
  const fine = (t0: number, d: number) => { const n = Math.round(d / dtOut); for (let i = 1; i <= n; i++) t.push(t0 + i * dtOut); };
  let t0 = 0;
  eps.forEach((e, j) => {
    if (!coarse(j)) fine(t0, e.dur);
    else {
      const f = Math.min(FINE_MS, e.dur);
      fine(t0, f);
      const rest = e.dur - f, nc = Math.ceil(rest / COARSE_MS - 1e-9);
      for (let i = 1; i <= nc; i++) t.push(i === nc ? t0 + e.dur : t0 + f + (i * rest) / nc);
    }
    t0 += e.dur;
  });
  return Float64Array.from(t);
}

/**
 * Voltage clamp, ideal: within an epoch each gate relaxes exactly from where
 * the last epoch left it. `v` on each sweep is the measured epoch's level;
 * iNaPeak and iKEnd are read in that epoch.
 */
export function vclamp(md: Model, p: Protocol, dtOut = 0.02): ProtoClampSweep[] {
  const { g } = md;
  const ms = Math.min(Math.max(0, p.measure), p.epochs.length - 1);
  return Array.from({ length: Math.max(1, p.sweeps) }, (_, k) => {
    const eps = sweepEpochs(p, k);
    const times = sweepTimes(p, k, dtOut);
    const n = times.length;
    // each epoch's level, rates, start time and the gates as it begins
    const ep = eps.map((e) => ({
      v: e.level, dur: e.dur, t0: 0,
      inf: { m: g.m.inf(e.level), h: g.h.inf(e.level), n: g.n.inf(e.level) },
      tau: { m: g.m.tau(e.level), h: g.h.tau(e.level), n: g.n.tau(e.level) },
      x0: { m: 0, h: 0, n: 0 },
    }));
    ep[0].x0 = { ...ep[0].inf };
    for (let j = 1; j < ep.length; j++) {
      const a = ep[j - 1];
      ep[j].t0 = a.t0 + a.dur;
      const r = (id: "m" | "h" | "n") => a.inf[id] + (a.x0[id] - a.inf[id]) * Math.exp(-a.dur / a.tau[id]);
      ep[j].x0 = { m: r("m"), h: r("h"), n: r("n") };
    }
    const sw: ProtoClampSweep = {
      k, x: sweptValue(p, k), v: eps[ms].level,
      t: new Float64Array(n), iNa: new Float64Array(n), iK: new Float64Array(n),
      gNa: new Float64Array(n), gK: new Float64Array(n),
      m: new Float64Array(n), h: new Float64Array(n), n: new Float64Array(n),
      iNaPeak: 0, iKEnd: 0, gNaPeak: 0, gKEnd: 0,
    };
    let j = 0, lastIn = -1;
    for (let i = 0; i < n; i++) {
      const t = times[i];
      while (j < ep.length - 1 && t > ep[j].t0 + ep[j].dur) j++;
      const e = ep[j], ts = t - e.t0;
      const m = e.inf.m + (e.x0.m - e.inf.m) * Math.exp(-ts / e.tau.m);
      const h = e.inf.h + (e.x0.h - e.inf.h) * Math.exp(-ts / e.tau.h);
      const nn = e.inf.n + (e.x0.n - e.inf.n) * Math.exp(-ts / e.tau.n);
      const gna = md.p.gNa * md.openNa(m, h);
      const gk = md.p.gK * md.openK(nn);
      sw.t[i] = t; sw.m[i] = m; sw.h[i] = h; sw.n[i] = nn;
      sw.gNa[i] = gna; sw.gK[i] = gk;
      sw.iNa[i] = gna * (e.v - md.p.eNa);
      sw.iK[i] = gk * (e.v - md.p.eK);
      // the measured epoch, from its first sample after its start (the first epoch from t = 0)
      if (j === ms && (ms === 0 || ts > 0)) {
        if (Math.abs(sw.iNa[i]) > Math.abs(sw.iNaPeak)) sw.iNaPeak = sw.iNa[i];
        if (gna > sw.gNaPeak) sw.gNaPeak = gna;
        lastIn = i;
      }
    }
    sw.iKEnd = lastIn >= 0 ? sw.iK[lastIn] : 0;
    sw.gKEnd = lastIn >= 0 ? sw.gK[lastIn] : 0;
    return sw;
  });
}

// ---------------------------------------------------------------- current clamp

export interface ProtoFreeSweep extends FreeSweep {
  k: number;
  x: number;
}

/**
 * Current clamp: the cell settled at the first epoch's current, then each
 * epoch's current injected in turn. The current in integration step i (from
 * t − dt to t) is that of the epoch whose span holds step i, as freeRun does
 * for a single pulse.
 */
export function iclampSweep(md: Model, p: Protocol, k: number, dt: number, every: number, from?: State): ProtoFreeSweep {
  const eps = sweepEpochs(p, k);
  const bounds: number[] = [];
  let t = 0;
  for (const e of eps) { bounds.push(Math.round(t / dt)); t += e.dur; }
  const nSteps = Math.round(t / dt);
  const st = from ?? settle(md, eps[0].level, 50, dt);
  let j = 0;
  const run = runInjected(md, nSteps, (i) => {
    while (j < eps.length - 1 && i >= bounds[j + 1]) j++;
    return eps[j].level;
  }, eps[0].level, st, dt, every);
  return { ...run, k, x: sweptValue(p, k) };
}

export function iclamp(md: Model, p: Protocol, dt: number, every: number): ProtoFreeSweep[] {
  const settled = new Map<number, State>();
  return Array.from({ length: Math.max(1, p.sweeps) }, (_, k) => {
    const hold = epochIn(p.epochs[0], k).level;
    if (!settled.has(hold)) settled.set(hold, settle(md, hold, 50, dt));
    return iclampSweep(md, p, k, dt, every, settled.get(hold));
  });
}

/**
 * The pulse of a current-clamp protocol: the epoch after the first that
 * departs furthest from the hold. The threshold ladder scales it.
 */
export function pulseEpoch(p: Protocol): number {
  let best = -1, d = 0;
  p.epochs.forEach((e, j) => {
    if (j === 0) return;
    const a = Math.abs(e.level - p.epochs[0].level);
    if (a > d) { d = a; best = j; }
  });
  return best;
}
export function pulseStart(p: Protocol, j: number): number {
  return p.epochs.slice(0, j).reduce((s, e) => s + e.dur, 0);
}
/** the protocol, one sweep, with its pulse set to `amp` above the hold */
export function withPulse(p: Protocol, amp: number): Protocol {
  const j = pulseEpoch(p);
  if (j < 0) return { ...p, sweeps: 1 };
  return {
    ...p, sweeps: 1,
    epochs: p.epochs.map((e, i) => (i === j ? { ...e, level: p.epochs[0].level + amp, dLevel: 0, dDur: 0 } : { ...e, dLevel: 0, dDur: 0 })),
  };
}

// ---------------------------------------------------------------- the stock protocols

const ep = (level: number, dur: number, dLevel = 0, dDur = 0): Epoch => ({ level, dLevel, dur, dDur });

export interface Preset {
  id: string;
  name: string;
  /** one sentence: what it shows */
  text: string;
  p: Protocol;
}

/** voltage clamp; the first is the default and is the old step family to the bit */
export const V_PRESETS: Preset[] = [
  {
    id: "steps", name: "Steps",
    text: "From −65 mV to a family of test potentials: the currents Hodgkin and Huxley separated.",
    p: { mode: "v", epochs: [ep(-65, 1), ep(-55, 10, 10)], sweeps: 11, measure: 1 },
  },
  {
    id: "hinf", name: "Inactivation vs voltage",
    text: "50 ms prepulses from −125 to −25 mV, then every sweep steps to 0 mV: the sodium current left at the test step shows how many channels each prepulse inactivated. h–V plots it over h∞.",
    p: { mode: "v", epochs: [ep(-65, 1), ep(-125, 50, 10), ep(0, 10)], sweeps: 11, measure: 2 },
  },
  {
    id: "onset", name: "Inactivation vs time",
    text: "A prepulse to −57 mV held from 0 to 50 ms, then every sweep steps to −21 mV: the test's sodium current falls as h does at −57 mV, with τh (Hodgkin and Huxley 1952, J Physiol 116:497, Fig. 1).",
    p: { mode: "v", epochs: [ep(-65, 1), ep(-57, 0, 0, 5), ep(-21, 5)], sweeps: 11, measure: 2 },
  },
  {
    id: "recovery", name: "Recovery",
    text: "Two pulses to −21 mV with a growing gap at rest: the second's sodium current comes back as h recovers (116:497, Fig. 6).",
    p: { mode: "v", epochs: [ep(-65, 1), ep(-21, 2), ep(-65, 0.5, 0, 2.5), ep(-21, 4), ep(-65, 1)], sweeps: 12, measure: 3 },
  },
  {
    id: "tails", name: "Tails",
    text: "Open the channels with one step, then return to a family of potentials: the tail currents.",
    p: { mode: "v", epochs: [ep(-65, 1), ep(0, 5), ep(-100, 6, 10)], sweeps: 11, measure: 2 },
  },
];

/** current clamp; the first is the default, the old single pulse */
export const I_PRESETS: Preset[] = [
  {
    id: "pulse", name: "Pulse",
    text: "A brief pulse of current, then let the cell go.",
    p: { mode: "i", epochs: [ep(0, 5), ep(20, 0.5), ep(0, 34.5)], sweeps: 1, measure: 1 },
  },
  {
    id: "two", name: "Two pulses",
    text: "A second pulse 4 to 18 ms after the first: until about 13 ms it fails, the refractory period (1952 paper, Fig. 20).",
    p: { mode: "i", epochs: [ep(0, 5), ep(20, 0.5), ep(0, 4, 0, 2), ep(20, 0.5), ep(0, 30)], sweeps: 8, measure: 3 },
  },
  {
    id: "anode", name: "Anode break",
    text: "Hold the cell hyperpolarized, then let go: it fires on release (1952 paper, Fig. 22).",
    p: { mode: "i", epochs: [ep(0, 5), ep(-10, 20), ep(0, 35)], sweeps: 1, measure: 2 },
  },
  {
    id: "train", name: "Long step",
    text: "A long step of current, at rising strengths: none, one spike, then a train.",
    p: { mode: "i", epochs: [ep(0, 5), ep(2, 100, 3), ep(0, 15)], sweeps: 4, measure: 1 },
  },
];

export const DEFAULT_V = V_PRESETS[0].p;
export const DEFAULT_I = I_PRESETS[0].p;

// ---------------------------------------------------------------- threshold, for stepping through

/** the pulse's size above the hold (negative for a hyperpolarizing one), 0 with no pulse */
export function pulseAmp(p: Protocol): number {
  const j = pulseEpoch(p);
  return j < 0 ? 0 : p.epochs[j].level - p.epochs[0].level;
}

/**
 * Does this protocol's pulse fire the cell, from `from`? As fires() in
 * sim.ts: a −20 mV crossing after the pulse starts, carried by the cell's own
 * sodium current, whose inward peak must exceed the pulse.
 */
export function firesP(md: Model, p: Protocol, from: State, dt: number): boolean {
  const r = iclampSweep(md, p, 0, dt, 5, from);
  const j = pulseEpoch(p);
  const start = j < 0 ? 0 : pulseStart(p, j);
  if (!spikeTimes(r.t, r.v).some((t) => t >= start)) return false;
  let inward = 0;
  for (let i = 0; i < r.t.length; i++) if (r.t[i] >= start && -r.iNa[i] > inward) inward = -r.iNa[i];
  return inward > Math.abs(pulseAmp(p));
}

/**
 * The smallest pulse, in the direction of the protocol's own, that fires the
 * cell (µA/cm² from the hold, signed), by bisection as pulseThreshold() does.
 * Null when the cell fires with no pulse, or not even at `maxAmp`.
 */
export function thresholdP(md: Model, p: Protocol, from: State, dt: number, maxAmp = 2000, rel = 1e-4): number | null {
  const sgn = pulseAmp(p) < 0 ? -1 : 1;
  const at = (a: number) => firesP(md, withPulse(p, sgn * a), from, dt);
  if (at(0)) return null;
  let hi = Math.max(1, Math.abs(pulseAmp(p)));
  while (!at(hi)) {
    hi *= 2;
    if (hi > maxAmp) return null;
  }
  let lo = 0;
  while (hi - lo > rel * hi) {
    const mid = (lo + hi) / 2;
    if (at(mid)) hi = mid;
    else lo = mid;
  }
  return sgn * hi;
}
