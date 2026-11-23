/**
 * The near-threshold inset: Vm on the left axis and net ionic current on the
 * right, over the time around the pulse. Rest on one axis lines up with the
 * baseline current on the other. It floats over the main plots and takes no
 * touches, so their gestures work through it and they are drawn as before.
 */
import { useId } from "react";
import type { InsetScale, InsetSweep } from "../core/protocol.ts";
import { niceStep } from "../core/sim.ts";
import { niceTicks } from "./Plot.tsx";

const W = 168, H = 140, M = { l: 29, r: 27, t: 17, b: 17 };
const num = (v: number) => String(+v.toFixed(Math.abs(v) < 10 ? 1 : 0)).replace("-", "−");

export function ThresholdInset({ sweeps, k, scale }: { sweeps: InsetSweep[]; k: number; scale: InsetScale }) {
  const clip = useId();
  const pw = W - M.l - M.r, ph = H - M.t - M.b;
  const sx = (t: number) => M.l + ((t - scale.t[0]) / (scale.t[1] - scale.t[0])) * pw;
  const sy = (y: number, r: [number, number]) => M.t + (1 - (y - r[0]) / (r[1] - r[0])) * ph;
  const line = (t: ArrayLike<number>, y: ArrayLike<number>, r: [number, number]) => {
    let d = "";
    for (let i = 0; i < t.length; i++) {
      if (t[i] < scale.t[0] || t[i] > scale.t[1]) continue;
      d += `${d ? "L" : "M"}${sx(t[i]).toFixed(1)} ${sy(y[i], r).toFixed(1)}`;
    }
    return d;
  };
  const halfV = (scale.v[1] - scale.v[0]) / 2, halfI = (scale.im[1] - scale.im[0]) / 2;
  // three ticks an axis: the baseline, and a round step either side of it
  const around = (mid: number, half: number) => { const d = niceStep(half); return [mid - d, mid, mid + d]; };
  const vTicks = around(scale.rest, halfV), iTicks = around(scale.im0, halfI);
  const tTicks = niceTicks(scale.t[0], scale.t[1], 3);
  const shown = sweeps.slice(0, k + 1);
  return (
    <div className="threshold-inset">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="near threshold: membrane potential and net ionic current">
        <defs><clipPath id={clip}><rect x={M.l} y={M.t} width={pw} height={ph} /></clipPath></defs>
        <text x={2} y={10} className="inset-label" style={{ fill: "var(--ink)" }}>Vm (mV)</text>
        <text x={W - 2} y={10} className="inset-label" textAnchor="end" style={{ fill: "var(--im)" }}>Im (µA/cm²)</text>
        <line x1={M.l} x2={M.l + pw} y1={sy(scale.rest, scale.v)} y2={sy(scale.rest, scale.v)} className="inset-zero" />
        <rect x={M.l} y={M.t} width={pw} height={ph} className="inset-frame" />
        {vTicks.map((v) => <text key={v} x={M.l - 3} y={sy(v, scale.v) + 3} textAnchor="end" className="inset-tick" style={{ fill: "var(--ink)" }}>{num(v)}</text>)}
        {iTicks.map((v) => <text key={v} x={M.l + pw + 3} y={sy(v, scale.im) + 3} className="inset-tick" style={{ fill: "var(--im)" }}>{num(v)}</text>)}
        {tTicks.map((v) => <text key={v} x={sx(v)} y={H - 6} textAnchor="middle" className="inset-tick">{num(v)}</text>)}
        <text x={W - 2} y={H - 6} textAnchor="end" className="inset-tick">ms</text>
        <g clipPath={`url(#${clip})`} fill="none">
          {shown.map((s, j) => (
            <g key={j} opacity={j < k ? 0.25 : 1} strokeWidth={j < k ? 1 : 1.7}>
              <path className="inset-im" d={line(s.t, s.im, scale.im)} stroke="var(--im)" />
              <path className="inset-v" d={line(s.t, s.v, scale.v)} stroke="var(--ink)" />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
