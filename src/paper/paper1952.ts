/**
 * The model paper's experiments: Hodgkin & Huxley 1952, J Physiol 117:500.
 *
 * The 1952 screen (src/ui/Retro.tsx) re-runs figures from the paper on the
 * same model as the rest of the app. This file is its pure part: the paper's
 * sign convention, the two ways the paper drives the membrane (a voltage-clamp
 * step, and a sudden displacement of V with the gates at rest, its "shock"),
 * and the figures, each with a guided walk and a challenge.
 *
 * Steps are kept as depolarizations (mV, positive depolarizes): the paper's own
 * words ("a depolarization of 25 mV"), and the same in either convention. Only
 * what is drawn and typed follows the convention toggle.
 */
import { buildModel, stockParams, type Model } from "../core/model.ts";
import { clampFamily, freeRun, settle, type ClampSweep, type FreeSweep } from "../core/sim.ts";
import fig3 from "./hh1952_fig3.json";

export type Signs = "1952" | "modern";

/** the resting potential the port uses for the paper's V = 0 */
export const REST = -65;
/** The paper's V: the displacement from rest, depolarization negative (p. 505). */
export const paperV = (vm: number) => REST - vm;
export const fromPaperV = (V: number) => REST - V;
/** The paper's current: inward positive (eqn. 26 in its V). */
export const paperI = (i: number) => -i;

const DT = 0.01;

export function modelAt(celsius: number): Model {
  return buildModel({ ...stockParams(), celsius });
}

/** a voltage-clamp step of `depol` mV from rest, `ms` long, starting at t = 0 */
export function clampStep(md: Model, depol: number, ms: number): ClampSweep {
  const v = REST + depol;
  return clampFamily(md, { hold: REST, from: v, to: v, by: 1, pre: 0, dur: ms, dtOut: 0.02 })[0];
}

/**
 * The paper's membrane action potential (p. 522): eqn. 26 with no applied
 * current, from V displaced by `depol` mV with the gates still at rest, as an
 * instantaneous shock leaves them. The charge is C·ΔV: 1 mV is 1 mµcoulomb/cm².
 */
export function shock(md: Model, depol: number, ms: number): FreeSweep {
  const rest = settle(md, 0, 50, DT);
  return freeRun(md, { amp: 0, start: 0, dur: 0, sweep: ms, hold: 0 }, { ...rest, v: rest.v + depol }, DT, 2);
}

/** height of a spike above rest, mV; null if V never rose 50 mV above rest after the shock */
export function spikeHeight(r: FreeSweep): number | null {
  let mx = -Infinity;
  for (let i = 5; i < r.v.length; i++) mx = Math.max(mx, r.v[i]);
  const h = mx - REST;
  return h > 50 ? h : null;
}

// ------------------------------------------------------------------ the rig

export type ApTrace = "gNa" | "gK" | "m" | "h" | "n";
export interface Rig {
  kind: "clamp" | "shock";
  /** depolarizations, mV */
  steps: number[];
  celsius: number;
  /** clamp: current or conductance, and which channels */
  q: "i" | "g";
  na: boolean;
  k: boolean;
  /** shock: what is drawn under V */
  ap: ApTrace[];
  /** how long each sweep runs, ms */
  ms: number;
}

export const START_RIG: Rig = { kind: "clamp", steps: [25], celsius: 6.3, q: "i", na: true, k: true, ap: [], ms: 12 };

/** a step as it is shown and typed: the paper's V, or the modern Vm; a shock is its size either way */
export function stepToText(kind: Rig["kind"], d: number, signs: Signs): number {
  if (kind === "shock") return d;
  return signs === "1952" ? paperV(REST + d) : REST + d;
}
export function textToStep(kind: Rig["kind"], x: number, signs: Signs): number {
  if (kind === "shock") return x;
  return signs === "1952" ? -x : x - REST;
}

// ------------------------------------------------------------------ the figures

export interface GuideStep {
  text: string;
  /** the rig for this step (merged over the figure's) */
  rig?: Partial<Rig>;
  /** show the paper's data over the model */
  paper?: boolean;
}

export interface Check {
  ok: boolean;
  /** what is still missing, in words */
  hint: string;
}

export interface PaperK {
  curve: string;
  depolarization: number;
  gKinf: number;
  tauN: number;
  points: [number, number][];
}

export interface Figure {
  id: string;
  num: number;
  page: number;
  title: string;
  /** what the paper shows, in a sentence, for the challenge */
  ask: string;
  rig: Rig;
  guide: GuideStep[];
  check: (r: Rig) => Check;
  /** the paper's measured points (Fig. 3), or its Table 4 (Fig. 12) */
  paper?: "fig3" | "table4";
}

export const FIG3_DATA = fig3.curves as PaperK[];
export const FIG3_GK0 = 0.24;
/** eqn. (11): the paper's fitted rise of gK, with Table 1's final value and time constant */
export function eqn11(t: number, gInf: number, tau: number): number {
  const a = Math.pow(gInf, 0.25), b = Math.pow(FIG3_GK0, 0.25);
  return Math.pow(a - (a - b) * Math.exp(-t / tau), 4);
}

/** Table 4 (p. 527), membrane rows at 6.3 °C: the spike height above rest for each initial depolarization */
export const TABLE4 = [
  { depol: 90, height: 108.5 },
  { depol: 15, height: 105.4 },
  { depol: 7, height: 102.1 },
];

const near = (have: number[], want: number[], tol: number) => want.filter((w) => !have.some((h) => Math.abs(h - w) <= tol));
const words = (xs: number[]) => xs.map((x) => `${x}`).join(", ");

const FIG3_DEPOLS = FIG3_DATA.map((c) => c.depolarization).sort((a, b) => a - b);

export const FIGURES: Figure[] = [
  {
    id: "fig3",
    num: 3,
    page: 508,
    title: "Potassium conductance",
    ask: "Recreate Fig. 3: the rise of potassium conductance during voltage-clamp steps that depolarize the axon by 6, 10, 19, 26, 32, 38, 51, 63, 76, 88, 100 and 109 mV, at 6–7 °C.",
    rig: { ...START_RIG, kind: "clamp", steps: FIG3_DEPOLS, celsius: 6.3, q: "g", na: false, k: true, ms: 11 },
    guide: [
      {
        text: "The question: when the membrane is depolarized, how does its potassium conductance turn on? Hodgkin and Huxley clamped axon 17 at a series of depolarizations and separated the potassium current from the sodium current by replacing the sodium of the sea water with choline.",
        rig: { steps: [25], q: "i", na: true, k: true },
      },
      {
        text: "This is the raw record: one step of 25 mV. The sodium current comes first and inward; the potassium current follows, slower and outward. Their sum is what the amplifier sees.",
        rig: { steps: [25], q: "i", na: true, k: true },
      },
      {
        text: "Take the sodium away and divide the potassium current by its driving force, V − VK: what is left is the potassium conductance. Note how it starts: slowly, then faster, an S-shaped delay.",
        rig: { steps: [25], q: "g", na: false, k: true },
      },
      {
        text: "Now the paper's twelve depolarizations, 6 to 109 mV. The larger the step, the faster and higher the conductance rises. The delay is why the model raises n to the fourth power: four independent particles that must all be in place.",
        rig: { steps: FIG3_DEPOLS, q: "g", na: false, k: true },
      },
      {
        text: "The paper's own points for axon 17 (circles) and its fitted curves (eqn. 11, Table 1), over the model. The shapes agree; the model's curves are higher because its ḡK (36 m.mho/cm²) is the standard axon of Table 3, not axon 17, whose conductance reached about 21 at the largest step.",
        rig: { steps: FIG3_DEPOLS, q: "g", na: false, k: true },
        paper: true,
      },
    ],
    check: (r) => {
      if (r.kind !== "clamp") return { ok: false, hint: "Fig. 3 is a voltage-clamp experiment." };
      if (r.q !== "g" || !r.k) return { ok: false, hint: "The figure plots potassium conductance: show g, with K on." };
      if (r.na) return { ok: false, hint: "Only potassium: the paper removed the sodium current." };
      const miss = near(r.steps, FIG3_DEPOLS, 1);
      if (miss.length) return { ok: false, hint: `Still missing depolarizations of ${words(miss)} mV.` };
      if (r.celsius < 5.5 || r.celsius > 7.5) return { ok: false, hint: "Axon 17 was at 6–7 °C." };
      return { ok: true, hint: "That is Fig. 3. The paper's points and curves are now drawn over yours." };
    },
    paper: "fig3",
  },
  {
    id: "fig12",
    num: 12,
    page: 525,
    title: "Membrane action potentials",
    ask: "Recreate the upper family of Fig. 12: the membrane after sudden depolarizations of 90, 15, 7 and 6 mV, at 6 °C. Which of them fire?",
    rig: { ...START_RIG, kind: "shock", steps: [90, 15, 7, 6], celsius: 6, ap: [], ms: 6 },
    guide: [
      {
        text: "The question: do the equations fitted to voltage-clamp records, with nothing else added, produce an action potential? Here the membrane is displaced suddenly, as a brief shock would, and left alone (eqn. 26, no current applied).",
        rig: { steps: [90] },
      },
      {
        text: "A 90 mV shock: the sodium conductance turns on at once and the spike rises within a fraction of a millisecond.",
        rig: { steps: [90] },
      },
      {
        text: "15 mV: the same spike, later. Below the spike, the membrane sits for about a millisecond while m creeps up.",
        rig: { steps: [90, 15] },
      },
      {
        text: "7 mV: later still, after more than 3 ms, but it fires, and the spike is nearly the same height. All or nothing.",
        rig: { steps: [90, 15, 7] },
      },
      {
        text: "6 mV: no spike. Threshold lies between 6 and 7 mV, as in the paper. These are the paper's own calculations, done by hand; the heights below are its Table 4 against the model here.",
        rig: { steps: [90, 15, 7, 6] },
        paper: true,
      },
    ],
    check: (r) => {
      if (r.kind !== "shock") return { ok: false, hint: "Fig. 12 starts each sweep with a shock: a sudden depolarization, then no current." };
      const miss = near(r.steps, [90, 15, 7, 6], 0.5);
      if (miss.length) return { ok: false, hint: `Still missing shocks of ${words(miss)} mV.` };
      if (r.celsius < 5.5 || r.celsius > 7) return { ok: false, hint: "The paper calculated these at 6 °C." };
      return { ok: true, hint: "That is the upper family of Fig. 12: 7 mV fires, 6 mV does not." };
    },
    paper: "table4",
  },
  {
    id: "fig19",
    num: 19,
    page: 532,
    title: "After the spike: gK and h",
    ask: "Recreate Fig. 19: after a 15 mV shock at 6 °C, show the potassium conductance and the inactivation variable h, which together make the membrane refractory.",
    rig: { ...START_RIG, kind: "shock", steps: [15], celsius: 6, ap: ["gK", "h"], ms: 20 },
    guide: [
      {
        text: "The question: why can a nerve not fire again at once? Fig. 19 follows the calculated 15 mV action potential at 6 °C for 20 ms.",
        rig: { ap: [] },
      },
      {
        text: "The potassium conductance stays raised for many milliseconds after the spike, holding the membrane near the potassium equilibrium potential.",
        rig: { ap: ["gK"] },
      },
      {
        text: "And h, the fraction of sodium channels not inactivated, falls during the spike and recovers only slowly. Until h comes back, a second shock finds few sodium channels to open: the refractory period. Both curves return near the end of the positive phase.",
        rig: { ap: ["gK", "h"] },
      },
    ],
    check: (r) => {
      if (r.kind !== "shock") return { ok: false, hint: "Fig. 19 is a membrane action potential: start it with a shock." };
      if (near(r.steps, [15], 0.5).length) return { ok: false, hint: "The paper used a 15 mV shock." };
      if (!r.ap.includes("gK") || !r.ap.includes("h")) return { ok: false, hint: "Show gK and h under the voltage." };
      if (r.celsius < 5.5 || r.celsius > 7) return { ok: false, hint: "The paper calculated this at 6 °C." };
      if (r.ms < 15) return { ok: false, hint: "Run long enough to see them recover: about 20 ms." };
      return { ok: true, hint: "That is Fig. 19." };
    },
  },
];

/** the rig for guide step `k` of a figure */
export function guideRig(f: Figure, k: number): Rig {
  return { ...f.rig, ...(f.guide[k]?.rig ?? {}) };
}
