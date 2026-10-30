/**
 * The reference the tests hold this app to: gaba_excites' squid-axon gates,
 * copied verbatim from src/core/channels.ts at commit 25d74e3
 * (github.com/syncytium2/gaba_excites), where they are checked against
 * NEURON's hh.mod and against the 1952 paper. Used only by tests. Do not
 * edit; if gaba_excites changes these, copy them again and say so in
 * docs/process.md.
 */

export function vtrap(x: number, y: number): number {
  return Math.abs(x / y) < 1e-6 ? y * (1 - x / y / 2) : x / (Math.exp(x / y) - 1);
}
function Exp(x: number): number {
  return x < -100 ? 0 : Math.exp(x);
}
interface Rates {
  inf: number;
  tau: number;
}
export function hhPhi(celsius: number): number {
  return Math.pow(3, (celsius - 6.3) / 10);
}
function hhRates(a: number, b: number, phi: number): Rates {
  return { inf: a / (a + b), tau: 1 / (phi * (a + b)) };
}
export function hhM(v: number, phi: number): Rates {
  return hhRates(0.1 * vtrap(-(v + 40), 10), 4 * Exp(-(v + 65) / 18), phi);
}
export function hhH(v: number, phi: number): Rates {
  return hhRates(0.07 * Exp(-(v + 65) / 20), 1 / (Exp(-(v + 35) / 10) + 1), phi);
}
export function hhN(v: number, phi: number): Rates {
  return hhRates(0.01 * vtrap(-(v + 55), 10), 0.125 * Exp(-(v + 65) / 80), phi);
}
