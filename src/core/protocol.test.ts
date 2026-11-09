// The protocol builder: its stock protocols are the old ones to the bit, an epoch is exact in voltage clamp,
// and what each preset says it shows, it shows.
import { describe, expect, it } from "vitest";
import { buildModel, stockParams } from "./model.ts";
import { clampFamily, DEFAULT_CLAMP, DEFAULT_INACT, DEFAULT_STIM, freeRun, settle, spikeTimes } from "./sim.ts";
import {
  DEFAULT_I, DEFAULT_V, I_PRESETS, iclamp, inactShaped, longestSweep, pulseEpoch, swept, sweptValue, V_PRESETS, vclamp, withPulse,
  type Protocol,
} from "./protocol.ts";

const md = buildModel(stockParams());
const DT = 0.01;
const preset = (list: typeof V_PRESETS, id: string) => list.find((p) => p.id === id)!.p;
const spikes = (r: { t: Float64Array; v: Float64Array }, after = 0) => spikeTimes(r.t, r.v).filter((t) => t >= after);

describe("the stock protocols are the old ones", () => {
  it("voltage clamp: the default is the old step family, to the bit", () => {
    const a = clampFamily(md, DEFAULT_CLAMP), b = vclamp(md, DEFAULT_V);
    expect(b.length).toBe(a.length);
    a.forEach((s, k) => {
      expect(b[k].v).toBe(s.v);
      expect(b[k].x).toBe(s.v);
      expect(b[k].iNaPeak).toBe(s.iNaPeak);
      expect(b[k].iKEnd).toBe(s.iKEnd);
      for (const f of ["t", "iNa", "iK", "gNa", "gK", "m", "h", "n"] as const) expect(Array.from(b[k][f])).toEqual(Array.from(s[f]));
    });
  });
  it("current clamp: the default is the old pulse, to the bit", () => {
    const old = freeRun(md, { ...DEFAULT_STIM, sweep: 40 }, settle(md, DEFAULT_STIM.hold, 50, DT), DT, 5);
    const r = iclamp(md, DEFAULT_I, DT, 5)[0];
    expect(longestSweep(DEFAULT_I)).toBe(40);
    for (const f of ["t", "v", "iNa", "iK", "m", "h", "n", "iStim"] as const) expect(Array.from(r[f])).toEqual(Array.from(old[f]));
  });
});

describe("voltage clamp across epochs", () => {
  it("an epoch split in two at the same level changes nothing", () => {
    const one: Protocol = { mode: "v", epochs: [{ level: -65, dLevel: 0, dur: 1, dDur: 0 }, { level: -20, dLevel: 0, dur: 8, dDur: 0 }], sweeps: 1, measure: 1 };
    const two: Protocol = { ...one, epochs: [one.epochs[0], { ...one.epochs[1], dur: 3 }, { ...one.epochs[1], dur: 5 }] };
    const a = vclamp(md, one)[0], b = vclamp(md, two)[0];
    for (let i = 0; i < a.t.length; i++) {
      expect(b.h[i]).toBeCloseTo(a.h[i], 12);
      expect(b.iNa[i]).toBeCloseTo(a.iNa[i], 9);
    }
  });
  it("what changes from sweep to sweep: a level, else a duration, else nothing", () => {
    expect(swept(DEFAULT_V)).toEqual({ what: "level", epoch: 1 });
    expect(swept(preset(V_PRESETS, "recovery"))).toEqual({ what: "dur", epoch: 2 });
    expect(swept(DEFAULT_I)).toBeNull();
    expect(sweptValue(preset(V_PRESETS, "recovery"), 3)).toBe(8);
  });
});

describe("what the voltage-clamp presets say", () => {
  it("Inactivation: the test's sodium current falls with the prepulse, as h∞ does", () => {
    const fam = vclamp(md, preset(V_PRESETS, "hinf"));
    const peak = fam.map((s) => -s.iNaPeak);
    for (let k = 1; k < peak.length; k++) expect(peak[k]).toBeLessThan(peak[k - 1]);
    // h at the end of the 50 ms prepulse (t = 51 ms) is h∞ at the prepulse, and the test's peak follows it
    const hEnd = fam.map((s) => s.h[s.t.indexOf(51)]);
    fam.forEach((s, k) => expect(hEnd[k]).toBeCloseTo(md.g.h.inf(s.x), 3));
    peak.forEach((x, k) => expect(x / peak[0]).toBeCloseTo(hEnd[k] / hEnd[0], 1));
  });
  it("Inactivation is the 7 Nov inactivation protocol (sim.ts DEFAULT_INACT), to the bit", () => {
    const a = clampFamily(md, DEFAULT_INACT), b = vclamp(md, preset(V_PRESETS, "hinf"));
    expect(b.length).toBe(a.length);
    a.forEach((s, k) => {
      expect(b[k].x).toBe(s.v);
      expect(b[k].iNaPeak).toBe(s.iNaPeak);
      expect(b[k].gNaPeak).toBe(s.gNaPeak);
      expect(b[k].iKEnd).toBe(s.iKEnd);
      for (const f of ["t", "iNa", "iK", "gNa", "gK", "m", "h", "n"] as const) expect(Array.from(b[k][f])).toEqual(Array.from(s[f]));
    });
    expect(inactShaped(preset(V_PRESETS, "hinf"))).toBe(true);
    expect(inactShaped(DEFAULT_V)).toBe(false);
    expect(inactShaped(preset(V_PRESETS, "tails"))).toBe(false);
  });
  it("Recovery: the second pulse's sodium current grows with the gap, back toward the first's", () => {
    const fam = vclamp(md, preset(V_PRESETS, "recovery"));
    const first = -Math.min(...fam[0].iNa.slice(0, Math.round(3 / 0.02)));
    const second = fam.map((s) => -s.iNaPeak);
    for (let k = 1; k < second.length; k++) expect(second[k]).toBeGreaterThan(second[k - 1]);
    expect(second[0]).toBeLessThan(0.5 * first);
    expect(second[second.length - 1]!).toBeGreaterThan(0.85 * first);
  });
  it("Tails: after the opening step, the sodium current reverses near ENa and the potassium near EK", () => {
    const fam = vclamp(md, preset(V_PRESETS, "tails"));
    const at = (s: (typeof fam)[0], f: "iNa" | "iK") => s[f][Math.round(6.1 / 0.02)];
    const crossing = (f: "iNa" | "iK") => {
      for (let k = 1; k < fam.length; k++) if (Math.sign(at(fam[k], f)) !== Math.sign(at(fam[k - 1], f))) return fam[k].x;
      return NaN;
    };
    expect(Math.abs(crossing("iK") - md.p.eK)).toBeLessThanOrEqual(10);
    // ENa (+50) is past the last tail (0 mV): every sodium tail is inward
    fam.forEach((s) => expect(at(s, "iNa")).toBeLessThan(0));
  });
});

describe("what the current-clamp presets say", () => {
  it("Two pulses: too soon the second fails, later it fires", () => {
    const fam = iclamp(md, preset(I_PRESETS, "two"), DT, 5);
    // the second pulse starts 5.5 ms plus the gap (the swept value) into the sweep
    const second = fam.map((r) => spikes(r, 5.5 + r.x).length);
    const gaps = fam.map((r) => r.x);
    expect(gaps[0]).toBe(4);
    expect(gaps[gaps.length - 1]).toBe(18);
    // fails until about 13 ms, then fires, and keeps firing
    const first = second.indexOf(1);
    expect(gaps[first - 1]).toBe(12);
    expect(gaps[first]).toBe(14);
    expect(second.slice(0, first).every((n) => n === 0)).toBe(true);
    expect(second.slice(first).every((n) => n === 1)).toBe(true);
    // the first pulse always fires
    fam.forEach((r) => expect(spikes(r, 5).filter((t) => t < 5.5 + r.x).length).toBe(1));
  });
  it("Anode break: no spike while held down, one on release", () => {
    const r = iclamp(md, preset(I_PRESETS, "anode"), DT, 5)[0];
    expect(spikes(r).filter((t) => t < 25).length).toBe(0);
    expect(spikes(r, 25).length).toBe(1);
  });
  it("Long step: none, one spike, then a train", () => {
    const n = iclamp(md, preset(I_PRESETS, "train"), DT, 5).map((r) => spikes(r).length);
    expect(n[0]).toBe(0);
    expect(n[1]).toBe(1);
    expect(n[2]).toBeGreaterThan(3);
    expect(n[3]).toBeGreaterThan(3);
  });
});

describe("the threshold ladder on a protocol", () => {
  it("scales the pulse: the epoch furthest from the hold", () => {
    expect(pulseEpoch(DEFAULT_I)).toBe(1);
    expect(pulseEpoch(preset(I_PRESETS, "anode"))).toBe(1);
    const p = withPulse(preset(I_PRESETS, "two"), 7);
    expect(p.sweeps).toBe(1);
    expect(p.epochs[1].level).toBe(7);
  });
});

describe("threshold on a protocol", () => {
  it("is the old threshold for the stock pulse, to the bit", async () => {
    const { pulseThreshold } = await import("./sim.ts");
    const { thresholdP } = await import("./protocol.ts");
    const from = settle(md, 0, 50, DT);
    expect(thresholdP(md, DEFAULT_I, from, DT)).toBe(pulseThreshold(md, { ...DEFAULT_STIM, sweep: 40 }, from, DT));
  });
  it("a hyperpolarizing pulse has a negative threshold: anode break", async () => {
    const { thresholdP, firesP } = await import("./protocol.ts");
    const p = preset(I_PRESETS, "anode"), from = settle(md, 0, 50, DT);
    const thr = thresholdP(md, p, from, DT)!;
    expect(thr).toBeLessThan(0);
    expect(thr).toBeGreaterThan(-10);
    expect(firesP(md, withPulse(p, thr * 1.01), from, DT)).toBe(true);
    expect(firesP(md, withPulse(p, thr * 0.99), from, DT)).toBe(false);
  });
});
