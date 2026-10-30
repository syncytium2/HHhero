/**
 * The Hodgkin–Huxley gates, written as data so that either formulation can
 * be edited: α/β (the rates, as Hodgkin & Huxley 1952 wrote them) or x∞/τ
 * (the steady state and time constant, as most later models are written).
 *
 * The conversion between the two is exact in both directions, for any curves:
 *
 *     x∞ = α / (α + β)        τ = 1 / (φ (α + β))
 *     α  = x∞ / τ             β = (1 − x∞) / τ      (at temperature, φ included)
 *
 * so the view a student edits in never changes the model. One model, two
 * sets of controls. Each view keeps its own edits, applied in a fixed order:
 * the α/β constants, then the conversion, then the x∞/τ edits.
 *
 * Modern sign convention: V in mV, rest −65 mV, depolarization positive, as
 * NEURON's hh.mod writes the 1952 equations. Units: mV, ms, 1/ms.
 */

// ---------------------------------------------------------------- rate forms

/**
 * The three shapes Hodgkin & Huxley used for a rate (p. 519), with x = −(V − v0):
 *   linoid   A · x / (exp(x/k) − 1)      (α_m, α_n)
 *   exp      A · exp(x/k)                (β_m, α_h, β_n)
 *   sigmoid  A / (exp(x/k) + 1)          (β_h)
 */
export type RateKind = "linoid" | "exp" | "sigmoid";

export interface Rate {
  kind: RateKind;
  /** scale, 1/ms (the linoid's A is per mV: A·x is a rate) */
  A: number;
  /** voltage the form is centred on, mV */
  v0: number;
  /** voltage scale, mV (positive) */
  k: number;
}

/** x / (exp(x/y) − 1), with the removable singularity at x = 0 handled (hh.mod's vtrap). */
export function vtrap(x: number, y: number): number {
  return Math.abs(x / y) < 1e-6 ? y * (1 - x / y / 2) : x / (Math.exp(x / y) - 1);
}

/** hh2's Exp(): underflow-safe exp. */
function Exp(x: number): number {
  return x < -100 ? 0 : Math.exp(x);
}

/** A rate at V, 1/ms, at 6.3 °C. Written so the stock constants give hh.mod's numbers to the bit. */
export function rate(r: Rate, v: number): number {
  switch (r.kind) {
    case "linoid":
      return r.A * vtrap(-(v - r.v0), r.k);
    case "exp":
      return r.A * Exp(-(v - r.v0) / r.k);
    case "sigmoid":
      return r.A / (Exp(-(v - r.v0) / r.k) + 1);
  }
}

/** One line for the screen: the form with its constants. */
export function rateFormula(name: string, r: Rate): string {
  const sh = (v0: number) => (v0 === 0 ? "V" : v0 < 0 ? `V + ${fmt(-v0)}` : `V − ${fmt(v0)}`);
  const x = `−(${sh(r.v0)})`;
  switch (r.kind) {
    case "linoid":
      return `${name} = ${fmt(r.A)} · x / (e^(x/${fmt(r.k)}) − 1),  x = ${x}`;
    case "exp":
      return `${name} = ${fmt(r.A)} · e^(${x}/${fmt(r.k)})`;
    case "sigmoid":
      return `${name} = ${fmt(r.A)} / (e^(${x}/${fmt(r.k)}) + 1)`;
  }
}

export function fmt(x: number): string {
  if (x === 0) return "0";
  const a = Math.abs(x);
  const s = a >= 100 ? x.toFixed(0) : a >= 10 ? x.toFixed(1) : a >= 1 ? x.toFixed(2) : a >= 0.01 ? x.toFixed(3) : x.toPrecision(2);
  return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "").replace("-", "−");
}

// ---------------------------------------------------------------- the stock gates

export type GateId = "m" | "h" | "n";
export const GATE_IDS: GateId[] = ["m", "h", "n"];

/**
 * Hodgkin & Huxley 1952, Eqs. 12, 13, 20, 21, 23, 24 (p. 519), in the modern
 * sign: Vm = −(V + 65). lit/notes/hodgkin1952.md has both forms side by side.
 */
export const STOCK_RATES: Record<GateId, { alpha: Rate; beta: Rate }> = {
  m: { alpha: { kind: "linoid", A: 0.1, v0: -40, k: 10 }, beta: { kind: "exp", A: 4, v0: -65, k: 18 } },
  h: { alpha: { kind: "exp", A: 0.07, v0: -65, k: 20 }, beta: { kind: "sigmoid", A: 1, v0: -35, k: 10 } },
  n: { alpha: { kind: "linoid", A: 0.01, v0: -55, k: 10 }, beta: { kind: "exp", A: 0.125, v0: -65, k: 80 } },
};

// ---------------------------------------------------------------- the x∞/τ edits

/**
 * Edits made in the x∞/τ view, on top of whatever the α/β constants give:
 *   x∞'(V) = x∞(V½ + (V − V½ − dHalf) / slope)    V½ = where x∞ crosses 0.5
 *   τ'(V)  = tauScale · τ(V − tauShift)
 * so dHalf moves the midpoint, slope > 1 steepens about it, and the τ curve
 * scales and slides on its own.
 */
export interface InfTauEdit {
  dHalf: number;
  slope: number;
  tauScale: number;
  tauShift: number;
}

export const NO_EDIT: InfTauEdit = { dHalf: 0, slope: 1, tauScale: 1, tauShift: 0 };

export function infEdited(e: InfTauEdit): boolean {
  return e.dHalf !== 0 || e.slope !== 1;
}
export function tauEdited(e: InfTauEdit): boolean {
  return e.tauScale !== 1 || e.tauShift !== 0;
}

export interface GateParams {
  alpha: Rate;
  beta: Rate;
  it: InfTauEdit;
}

export function stockGate(id: GateId): GateParams {
  return { alpha: { ...STOCK_RATES[id].alpha }, beta: { ...STOCK_RATES[id].beta }, it: { ...NO_EDIT } };
}

export function rateEdited(p: GateParams, id: GateId): boolean {
  const s = STOCK_RATES[id];
  const same = (a: Rate, b: Rate) => a.A === b.A && a.v0 === b.v0 && a.k === b.k;
  return !same(p.alpha, s.alpha) || !same(p.beta, s.beta);
}

/** Q10 of 3 from 6.3 °C (p. 519; φ on p. 523), as hh.mod writes it. */
export function phiAt(celsius: number): number {
  return Math.pow(3, (celsius - 6.3) / 10);
}

/** A gate ready to run: its final curves, at the temperature it was built for. */
export interface Gate {
  inf(v: number): number;
  /** ms */
  tau(v: number): number;
  /** 1/ms, at temperature: x∞/τ */
  alpha(v: number): number;
  /** 1/ms, at temperature: (1 − x∞)/τ */
  beta(v: number): number;
  /** where x∞ crosses 0.5 before the x∞/τ edits, mV (the slope edit pivots here) */
  vHalfBase: number;
}

/** Where f crosses 0.5 in [−150, 100] mV, by bisection; NaN if it does not. */
export function halfPoint(f: (v: number) => number): number {
  let lo = -150, hi = 100;
  const flo = f(lo) - 0.5, fhi = f(hi) - 0.5;
  if (!(flo * fhi < 0)) return NaN;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if ((f(mid) - 0.5) * flo > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function buildGate(p: GateParams, celsius: number): Gate {
  const phi = phiAt(celsius);
  const { alpha, beta, it } = p;
  // the α/β view's result: exactly hh.mod's arithmetic, a/(a+b) and 1/(φ(a+b))
  const inf0 = (v: number) => {
    const a = rate(alpha, v), b = rate(beta, v);
    return a / (a + b);
  };
  const tau0 = (v: number) => 1 / (phi * (rate(alpha, v) + rate(beta, v)));
  const vh = halfPoint(inf0);
  const pivot = Number.isFinite(vh) ? vh : -40;
  // at no edit the curves are returned untouched, so the defaults are the stock model to the bit
  const inf = infEdited(it) ? (v: number) => inf0(pivot + (v - pivot - it.dHalf) / it.slope) : inf0;
  const tau = tauEdited(it) ? (v: number) => it.tauScale * tau0(v - it.tauShift) : tau0;
  return {
    inf,
    tau,
    alpha: (v) => inf(v) / tau(v),
    beta: (v) => (1 - inf(v)) / tau(v),
    vHalfBase: vh,
  };
}
