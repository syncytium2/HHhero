/**
 * A small SVG line plot, sized to its container. No library: curves here are
 * a few hundred points, and owning the drawing keeps touch handling simple.
 * With `onCursor`, a press-and-drag anywhere on the plot moves a vertical
 * cursor (phones have no hover), and the plot claims the gesture so the page
 * does not scroll under the finger.
 */
import { useEffect, useRef, useState, type PointerEvent } from "react";

export interface Series {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  color: string;
  width?: number;
  dash?: string;
  opacity?: number;
  /** drawn at the line's right end */
  label?: string;
}

interface Props {
  height: number;
  series: Series[];
  x: [number, number];
  y?: [number, number];
  /** always include these y values in an automatic range */
  yInclude?: number[];
  xLabel?: string;
  yLabel?: string;
  cursor?: number;
  onCursor?: (x: number) => void;
  zeroLine?: boolean;
  ariaLabel: string;
}

const M = { l: 42, r: 10, t: 16, b: 26 };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function niceTicks(lo: number, hi: number, n: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / Math.max(1, n);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

function tickText(v: number): string {
  const a = Math.abs(v);
  const s = a === 0 ? "0" : a >= 100 ? v.toFixed(0) : a >= 1 ? String(+v.toFixed(2)) : String(+v.toPrecision(2));
  return s.replace("-", "−");
}

function autoRange(series: Series[], x: [number, number], include: number[] = []): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const s of series)
    for (let i = 0; i < s.y.length; i++) {
      const xv = s.x[i], yv = s.y[i];
      if (xv < x[0] || xv > x[1] || !Number.isFinite(yv)) continue;
      if (yv < lo) lo = yv;
      if (yv > hi) hi = yv;
    }
  for (const v of include) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!Number.isFinite(lo)) return [0, 1];
  if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
  const pad = (hi - lo) * 0.06;
  return [lo - pad, hi + pad];
}

/** y at x by linear interpolation along a series whose x is increasing */
function yAt(s: Series, xv: number): number {
  const n = s.x.length;
  if (n === 0 || xv < s.x[0] || xv > s.x[n - 1]) return NaN;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s.x[mid] <= xv) lo = mid;
    else hi = mid;
  }
  const f = (xv - s.x[lo]) / (s.x[hi] - s.x[lo] || 1);
  return s.y[lo] + f * (s.y[hi] - s.y[lo]);
}

export function Plot({ height, series, x, y, yInclude, xLabel, yLabel, cursor, onCursor, zeroLine, ariaLabel }: Props) {
  const [ref, width] = useWidth();
  const yr = y ?? autoRange(series, x, yInclude);
  const pw = width - M.l - M.r, ph = height - M.t - M.b;
  const sx = (v: number) => M.l + ((v - x[0]) / (x[1] - x[0])) * pw;
  const sy = (v: number) => M.t + (1 - (v - yr[0]) / (yr[1] - yr[0])) * ph;
  const clampY = (v: number) => Math.max(M.t - 4, Math.min(M.t + ph + 4, v));
  const xt = niceTicks(x[0], x[1], Math.max(2, Math.floor(pw / 60)));
  const yt = niceTicks(yr[0], yr[1], Math.max(2, Math.floor(ph / 32)));

  const toX = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const v = x[0] + ((e.clientX - r.left - M.l) / pw) * (x[1] - x[0]);
    return Math.max(x[0], Math.min(x[1], v));
  };
  const down = useRef(false);

  return (
    <div ref={ref} className="plot">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        style={{ touchAction: onCursor ? "none" : "pan-y" }}
        onPointerDown={onCursor ? (e) => { down.current = true; e.currentTarget.setPointerCapture(e.pointerId); onCursor(toX(e)); } : undefined}
        onPointerMove={onCursor ? (e) => { if (down.current) onCursor(toX(e)); } : undefined}
        onPointerUp={onCursor ? () => (down.current = false) : undefined}
        onPointerCancel={onCursor ? () => (down.current = false) : undefined}
      >
        <defs>
          <clipPath id={`clip-${ariaLabel.replace(/\W/g, "")}`}>
            <rect x={M.l} y={M.t - 4} width={pw} height={ph + 8} />
          </clipPath>
        </defs>
        {yt.map((v) => (
          <g key={`y${v}`}>
            <line x1={M.l} x2={M.l + pw} y1={sy(v)} y2={sy(v)} className={v === 0 && zeroLine ? "zero" : "grid"} />
            <text x={M.l - 5} y={sy(v) + 3.5} className="tick" textAnchor="end">{tickText(v)}</text>
          </g>
        ))}
        {xt.map((v) => (
          <g key={`x${v}`}>
            <line x1={sx(v)} x2={sx(v)} y1={M.t} y2={M.t + ph} className="grid" />
            <text x={sx(v)} y={M.t + ph + 13} className="tick" textAnchor="middle">{tickText(v)}</text>
          </g>
        ))}
        {xLabel && <text x={M.l + pw} y={height - 2} className="axis-label" textAnchor="end">{xLabel}</text>}
        {yLabel && <text x={4} y={10} className="axis-label">{yLabel}</text>}
        <g clipPath={`url(#clip-${ariaLabel.replace(/\W/g, "")})`}>
          {series.map((s, k) => {
            let d = "";
            let pen = false;
            for (let i = 0; i < s.x.length; i++) {
              const yv = s.y[i];
              if (!Number.isFinite(yv)) { pen = false; continue; }
              d += `${pen ? "L" : "M"}${sx(s.x[i]).toFixed(1)} ${clampY(sy(yv)).toFixed(1)}`;
              pen = true;
            }
            return (
              <path key={k} d={d} fill="none" style={{ stroke: s.color, strokeWidth: s.width ?? 1.6, strokeDasharray: s.dash, opacity: s.opacity ?? 1 }} strokeLinejoin="round" />
            );
          })}
        </g>
        {series.map((s, k) => {
          if (!s.label) return null;
          // the label sits at the line's last visible point
          let i = s.x.length - 1;
          while (i > 0 && (s.x[i] > x[1] || !Number.isFinite(s.y[i]))) i--;
          const ly = Math.max(M.t + 8, Math.min(M.t + ph - 3, sy(s.y[i]) - 4));
          return <text key={`l${k}`} x={Math.min(sx(s.x[i]), M.l + pw) - 2} y={ly} className="series-label" textAnchor="end" style={{ fill: s.color }}>{s.label}</text>;
        })}
        {cursor !== undefined && cursor >= x[0] && cursor <= x[1] && (
          <g>
            <line x1={sx(cursor)} x2={sx(cursor)} y1={M.t} y2={M.t + ph} className="cursor" />
            {series.filter((s) => s.label).map((s, k) => {
              const v = yAt(s, cursor);
              return Number.isFinite(v) && v >= yr[0] && v <= yr[1] ? <circle key={k} cx={sx(cursor)} cy={sy(v)} r={3.5} style={{ fill: s.color }} /> : null;
            })}
          </g>
        )}
      </svg>
    </div>
  );
}
