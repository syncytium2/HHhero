/**
 * The one-line notes the app shows when an edit has a simple meaning in the
 * other view. Each claim made here is tested in src/core/views.test.ts.
 */

import { fmt, infEdited, STOCK_RATES, tauEdited, type GateId, type GateParams } from "./rates.ts";

export type View = "ab" | "it";

export function noteFor(view: View, id: GateId, p: GateParams): string | null {
  const s = STOCK_RATES[id];
  if (view === "ab") {
    const ra = p.alpha.A / s.alpha.A, rb = p.beta.A / s.beta.A;
    const da = p.alpha.v0 - s.alpha.v0, db = p.beta.v0 - s.beta.v0;
    const kSame = p.alpha.k === s.alpha.k && p.beta.k === s.beta.k;
    const aStock = ra === 1 && da === 0 && p.alpha.k === s.alpha.k;
    const bStock = rb === 1 && db === 0 && p.beta.k === s.beta.k;
    if (aStock && bStock) return null;
    if (kSame && da === 0 && db === 0 && Math.abs(ra - rb) < 1e-9)
      return `Both rates ×${fmt(ra)}: ${id}∞ is unchanged and τ is divided by ${fmt(ra)}. Temperature does exactly this to every gate.`;
    if (kSame && ra === 1 && rb === 1 && Math.abs(da - db) < 1e-9)
      return `Both rates shifted ${fmt(da)} mV: ${id}∞ and τ slide together by ${fmt(da)} mV.`;
    if (aStock !== bStock)
      return `One rate moved, and both ${id}∞ and τ changed. Each α or β constant, moved alone, moves both curves.`;
    return null;
  }
  const iE = infEdited(p.it), tE = tauEdited(p.it);
  if (iE && !tE) return `${id}∞ moved and τ did not. No single α or β constant can do that: each one moves both.`;
  if (tE && !iE && p.it.tauShift === 0)
    return `τ ×${fmt(p.it.tauScale)} with ${id}∞ unchanged: the same as scaling α and β together by ${fmt(1 / p.it.tauScale)}.`;
  if (tE && !iE) return `τ changed and ${id}∞ did not.`;
  return null;
}
