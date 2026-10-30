/**
 * The model against NEURON and against the paper.
 *
 * src/core/oracle/neuron_hh.json is NEURON 9.0.2 running its built-in hh
 * mechanism (tools/neuron_oracle_hh.py says how to regenerate it), copied
 * from gaba_excites at 25d74e3. That file's currents are pA on a 10 000 µm²
 * patch, so 100 pA is 1 µA/cm².
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildModel, restingV, stockParams } from "./model.ts";
import { clampFamily, DEFAULT_CLAMP, freeRun, settle, spikeTimes } from "./sim.ts";
import { buildGate, rate, STOCK_RATES, stockGate } from "./rates.ts";

interface Oracle {
  dt: number; settle: number; stepOn: number; stepDur: number; sweep: number;
  sweeps: { celsius: number; hold: number; amp: number; spikes: number[]; vStart: number }[];
}
const oracle = JSON.parse(readFileSync(new URL("./oracle/neuron_hh.json", import.meta.url), "utf8")) as Oracle;

// Worst spike-time error allowed, ms: two integration steps.
const TOL = 0.02;

describe("current clamp vs NEURON's hh mechanism (21 sweeps, 0 to 280 spikes, 6.3 and 18.5 °C)", () => {
  for (const o of oracle.sweeps) {
    it(`${o.celsius} °C, ${o.amp / 100} µA/cm²: same spike count, every spike within ${TOL} ms`, () => {
      const md = buildModel({ ...stockParams(), celsius: o.celsius });
      const st = settle(md, o.hold / 100, oracle.settle, oracle.dt);
      expect(st.v).toBeCloseTo(o.vStart, 2);
      const sw = freeRun(md, { amp: o.amp / 100, start: oracle.stepOn, dur: oracle.stepDur, sweep: oracle.sweep, hold: o.hold / 100 }, st, oracle.dt);
      const got = spikeTimes(sw.t, sw.v);
      expect(got.length).toBe(o.spikes.length);
      for (let i = 0; i < got.length; i++) expect(Math.abs(got[i] - o.spikes[i])).toBeLessThan(TOL);
    });
  }
});

// Hodgkin & Huxley 1952, p. 519, in its own sign (V = displacement from rest, depolarization negative).
// lit/notes/hodgkin1952.md has the transcription; Vm = −(V + 65).
const paper = {
  an: (V: number) => (Math.abs(V + 10) < 1e-9 ? 0.1 : (0.01 * (V + 10)) / (Math.exp((V + 10) / 10) - 1)),
  bn: (V: number) => 0.125 * Math.exp(V / 80),
  am: (V: number) => (Math.abs(V + 25) < 1e-9 ? 1 : (0.1 * (V + 25)) / (Math.exp((V + 25) / 10) - 1)),
  bm: (V: number) => 4 * Math.exp(V / 18),
  ah: (V: number) => 0.07 * Math.exp(V / 20),
  bh: (V: number) => 1 / (Math.exp((V + 30) / 10) + 1),
};

describe("the stock rates are the paper's (Eqs. 12, 13, 20, 21, 23, 24)", () => {
  it("every rate matches at every voltage, after Vm = −(V + 65)", () => {
    for (let vm = -120; vm <= 40; vm += 3.7) {
      const V = -(vm + 65);
      expect(rate(STOCK_RATES.m.alpha, vm)).toBeCloseTo(paper.am(V), 12);
      expect(rate(STOCK_RATES.m.beta, vm)).toBeCloseTo(paper.bm(V), 12);
      expect(rate(STOCK_RATES.h.alpha, vm)).toBeCloseTo(paper.ah(V), 12);
      expect(rate(STOCK_RATES.h.beta, vm)).toBeCloseTo(paper.bh(V), 12);
      expect(rate(STOCK_RATES.n.alpha, vm)).toBeCloseTo(paper.an(V), 12);
      expect(rate(STOCK_RATES.n.beta, vm)).toBeCloseTo(paper.bn(V), 12);
    }
  });

  it("Table 3: ḡNa 120, ḡK 36, ḡl 0.3 mS/cm², C 1 µF/cm², V_Na −115, V_K +12, V_l −10.613 mV", () => {
    const p = stockParams();
    expect([p.gNa, p.gK, p.gL, p.cm]).toEqual([120, 36, 0.3, 1]);
    expect(p.eNa).toBe(-(-115) - 65);
    expect(p.eK).toBe(-12 - 65);
    expect(p.eL).toBeCloseTo(-(-10.613) - 65, 12);
    expect([p.pm, p.ph, p.pn]).toEqual([3, 1, 4]);
  });

  it("rests at −65 mV", () => {
    expect(restingV(buildModel(stockParams()))).toBeCloseTo(-65, 2);
  });
});

describe("the ideal clamp is a formula; it agrees with integrating the gates", () => {
  it("each gate in the step family equals Rush–Larsen steps at the same fixed voltage", () => {
    const md = buildModel(stockParams());
    const fam = clampFamily(md, { ...DEFAULT_CLAMP, dtOut: 0.01 });
    for (const sw of fam) {
      let m = md.g.m.inf(DEFAULT_CLAMP.hold), n = md.g.n.inf(DEFAULT_CLAMP.hold);
      const i0 = Math.round(DEFAULT_CLAMP.pre / 0.01);
      for (let i = i0 + 1; i < sw.t.length; i++) {
        m = md.g.m.inf(sw.v) + (m - md.g.m.inf(sw.v)) * Math.exp(-0.01 / md.g.m.tau(sw.v));
        n = md.g.n.inf(sw.v) + (n - md.g.n.inf(sw.v)) * Math.exp(-0.01 / md.g.n.tau(sw.v));
        expect(sw.m[i]).toBeCloseTo(m, 9);
        expect(sw.n[i]).toBeCloseTo(n, 9);
      }
    }
  });

  it("which view an edit was made in does not matter: the same curves give the same currents", () => {
    // τ × 0.5 in the x∞/τ view is α and β × 2 in the α/β view
    const a = stockParams();
    a.gates.h = { ...stockGate("h"), it: { dHalf: 0, slope: 1, tauScale: 0.5, tauShift: 0 } };
    const b = stockParams();
    b.gates.h = { ...stockGate("h"), alpha: { ...STOCK_RATES.h.alpha, A: STOCK_RATES.h.alpha.A * 2 }, beta: { ...STOCK_RATES.h.beta, A: STOCK_RATES.h.beta.A * 2 } };
    const fa = clampFamily(buildModel(a), DEFAULT_CLAMP), fb = clampFamily(buildModel(b), DEFAULT_CLAMP);
    for (let k = 0; k < fa.length; k++) for (let i = 0; i < fa[k].iNa.length; i++) expect(fa[k].iNa[i]).toBeCloseTo(fb[k].iNa[i], 8);
    expect(buildGate(a.gates.h, 6.3).tau(-30)).toBeCloseTo(buildGate(b.gates.h, 6.3).tau(-30), 12);
  });
});
