/**
 * A small SVG line plot, sized to its container. No library: curves here are
 * a few hundred points, and owning the drawing keeps touch handling simple.
 * With `onCursor`, a press-and-drag anywhere on the plot moves a vertical
 * cursor (phones have no hover), and the plot claims the gesture so the page
 * does not scroll under the finger. With `onCursor` and `zoom` together, the
 * gestures split: a tap or click that barely moves places the cursor (and
 * reports the height tapped, to pick a trace), a press near the cursor line
 * drags it, and everything else zooms and pans as before.
 */
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { spreadLabels } from "./labels.ts";
import { isFull, pinchView, selectView, wheelView, type Range } from "./zoom.ts";

export interface Series {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  color: string;
  width?: number;
  dash?: string;
  opacity?: number;
  /** drawn at the line's right end, or at its largest excursion from zero */
  label?: string;
  labelAt?: "end" | "peak";
  /** also mark each point */
  dots?: boolean;
  /** draw only open circles at the points, no line (measured data) */
  points?: boolean;
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
  /** x, and on a tap or click with zoom also the y tapped, in data units (not on a log axis) */
  onCursor?: (x: number, y?: number) => void;
  zeroLine?: boolean;
  /** log10 y axis; values at or below 1e-4 are drawn at the floor */
  yLog?: boolean;
  /**
   * Horizontal zoom: `x` is the full range and `view` the part shown. Pinch to
   * zoom, drag to pan when zoomed, double-tap to reset. Plots that share a time
   * axis share one view.
   */
  zoom?: { view: Range; onView: (v: Range) => void; minSpan: number; /** show the reset button here (one plot per axis) */ button?: boolean };
  /** leave out the x tick labels (a plot stacked above another with the same axis) */
  noXTicks?: boolean;
  ariaLabel: string;
}

const MARGIN = { l: 42, r: 10, t: 16, b: 26 };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  // measure before the first paint, so the plot never shows (or takes input) at the placeholder width
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.max(120, Math.floor(el.getBoundingClientRect().width)));
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

export function Plot({ height, series: raw, x: full, y, yInclude, xLabel, yLabel, cursor, onCursor, zeroLine, yLog, zoom, noXTicks, ariaLabel }: Props) {
  const [ref, width] = useWidth();
  const x: Range = zoom ? zoom.view : full;
  // on a log axis everything below works in log10 units; only the tick labels go back
  const LOG_FLOOR = -4;
  const lg = (v: number) => (v > 0 ? Math.max(LOG_FLOOR, Math.log10(v)) : LOG_FLOOR);
  const series = yLog ? raw.map((s) => ({ ...s, y: Array.from(s.y, lg) })) : raw;
  const yr = y ? (yLog ? ([lg(y[0]), lg(y[1])] as [number, number]) : y) : autoRange(series, x, yLog ? yInclude?.map(lg) : yInclude);
  const M = noXTicks ? { ...MARGIN, b: 6 } : MARGIN;
  const pw = width - M.l - M.r, ph = height - M.t - M.b;
  const sx = (v: number) => M.l + ((v - x[0]) / (x[1] - x[0])) * pw;
  const sy = (v: number) => M.t + (1 - (v - yr[0]) / (yr[1] - yr[0])) * ph;
  const clampY = (v: number) => Math.max(M.t - 4, Math.min(M.t + ph + 4, v));
  const xt = niceTicks(x[0], x[1], Math.max(2, Math.floor(pw / 60)));
  const yt = yLog
    ? Array.from({ length: Math.floor(yr[1]) - Math.ceil(yr[0]) + 1 }, (_, i) => Math.ceil(yr[0]) + i)
    : niceTicks(yr[0], yr[1], Math.max(2, Math.floor(ph / 32)));
  const yTickText = (v: number) => (yLog ? tickText(Math.pow(10, v)) : tickText(v));

  const toX = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const v = x[0] + ((e.clientX - r.left - M.l) / pw) * (x[1] - x[0]);
    return Math.max(x[0], Math.min(x[1], v));
  };
  const down = useRef(false);

  // ---- mouse: drag selects a window to zoom into (the band), wheel zooms, sideways wheel pans
  const [band, setBand] = useState<[number, number] | null>(null); // drawn only
  const dragFrom = useRef<number | null>(null); // where a mouse drag began, as a fraction of the width
  const svgRef = useRef<SVGSVGElement>(null);
  const live = useRef({ zoom, full, pw, l: M.l });
  live.current = { zoom, full, pw, l: M.l };
  const hasZoom = !!zoom;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !hasZoom) return;
    const onWheel = (e: WheelEvent) => {
      const { zoom: z, full: fr, pw: w, l } = live.current;
      if (!z) return;
      e.preventDefault();
      const f = Math.max(0, Math.min(1, (e.clientX - svg.getBoundingClientRect().left - l) / w));
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1; // lines or pages to pixels
      z.onView(wheelView(z.view, fr, f, e.deltaX * unit, e.deltaY * unit, e.ctrlKey, w, z.minSpan));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [hasZoom]);

  // ---- touch: pointers by id; two make a pinch, one pans; a quick second tap resets
  const pts = useRef(new Map<number, number>());
  const gesture = useRef<{ view0: Range; f0: number; d0: number } | null>(null);
  const lastTap = useRef(-Infinity); // time of the last tap; -Infinity: none yet (a press soon after load is not a double-tap)
  const lastTapX = useRef(0); // and where it was: a double-tap is two quick taps in the same place
  const isDouble = (now: number, clientX: number) => now - lastTap.current < 300 && Math.abs(clientX - lastTapX.current) < 30;
  const frac = (clientX: number, svg: SVGSVGElement) => (clientX - svg.getBoundingClientRect().left - M.l) / pw;
  const startGesture = (svg: SVGSVGElement) => {
    const xs = [...pts.current.values()];
    const mid = xs.reduce((a, b) => a + b, 0) / xs.length;
    gesture.current = { view0: zoom!.view, f0: frac(mid, svg), d0: xs.length > 1 ? Math.abs(xs[0] - xs[1]) || 1 : 1 };
  };
  // ---- cursor with zoom: a tap places it, a press near the line drags it
  const TAP_PX = 8, GRAB_PX = 22;
  const tap = useRef<{ x: number; y: number; t: number } | null>(null); // a press that may still be a tap
  const lineDrag = useRef(false);
  const toY = (clientY: number, svg: SVGSVGElement) => {
    const v = yr[0] + (1 - (clientY - svg.getBoundingClientRect().top - M.t) / ph) * (yr[1] - yr[0]);
    return yLog ? undefined : v;
  };
  const nearLine = (clientX: number, svg: SVGSVGElement) =>
    cursor !== undefined && cursor >= x[0] && cursor <= x[1] && Math.abs(clientX - svg.getBoundingClientRect().left - sx(cursor)) < GRAB_PX;
  const measuring = !!(zoom && onCursor);
  const zoomHandlers = zoom && {
    onPointerDown: (e: PointerEvent<SVGSVGElement>) => {
      const now = e.timeStamp;
      if (measuring && pts.current.size === 0 && dragFrom.current === null) {
        tap.current = { x: e.clientX, y: e.clientY, t: now };
        if (nearLine(e.clientX, e.currentTarget) && !isDouble(now, e.clientX)) {
          lineDrag.current = true;
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointers in tests */ }
          if (e.pointerType !== "mouse") pts.current.set(e.pointerId, e.clientX);
          return;
        }
      } else tap.current = null; // a second finger: a pinch, not a tap
      if (pts.current.size === 0 && isDouble(now, e.clientX)) {
        zoom.onView(full);
        lastTap.current = -Infinity;
        return;
      }
      if (pts.current.size === 0) { lastTap.current = now; lastTapX.current = e.clientX; }
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointers in tests */ }
      if (e.pointerType === "mouse") {
        const f = Math.max(0, Math.min(1, frac(e.clientX, e.currentTarget)));
        dragFrom.current = f;
        setBand([f, f]);
        return;
      }
      pts.current.set(e.pointerId, e.clientX);
      startGesture(e.currentTarget);
    },
    onPointerMove: (e: PointerEvent<SVGSVGElement>) => {
      if (tap.current && Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y) > TAP_PX) tap.current = null;
      if (lineDrag.current) {
        if (!tap.current) lastTap.current = -Infinity;
        onCursor!(toX(e));
        return;
      }
      if (e.pointerType === "mouse") {
        const f0 = dragFrom.current;
        if (f0 !== null) setBand([f0, Math.max(0, Math.min(1, frac(e.clientX, e.currentTarget)))]);
        return;
      }
      if (!pts.current.has(e.pointerId) || !gesture.current) return;
      pts.current.set(e.pointerId, e.clientX);
      const xs = [...pts.current.values()];
      const mid = xs.reduce((a, b) => a + b, 0) / xs.length;
      const g = gesture.current;
      const ratio = xs.length > 1 ? (Math.abs(xs[0] - xs[1]) || 1) / g.d0 : 1;
      if (xs.length === 1 && isFull(g.view0, full)) return; // nothing to pan
      if (Math.abs(mid - (g.f0 * pw + e.currentTarget.getBoundingClientRect().left + M.l)) > 6 || ratio !== 1) lastTap.current = -Infinity;
      zoom.onView(pinchView(g.view0, full, g.f0, frac(mid, e.currentTarget), ratio, zoom.minSpan));
    },
    onPointerUp: (e: PointerEvent<SVGSVGElement>) => {
      const t = tap.current;
      tap.current = null;
      const wasTap = measuring && t !== null && e.timeStamp - t.t < 500;
      if (lineDrag.current) {
        lineDrag.current = false;
        pts.current.delete(e.pointerId);
        gesture.current = null;
        if (wasTap) onCursor!(toX(e), toY(e.clientY, e.currentTarget));
        return;
      }
      if (wasTap) onCursor!(toX(e), toY(e.clientY, e.currentTarget));
      if (e.pointerType === "mouse") {
        const f0 = dragFrom.current, f1 = Math.max(0, Math.min(1, frac(e.clientX, e.currentTarget)));
        dragFrom.current = null;
        setBand(null);
        if (f0 !== null && Math.abs(f1 - f0) * pw > 4) {
          zoom.onView(selectView(zoom.view, full, f0, f1, zoom.minSpan));
          lastTap.current = -Infinity;
        }
        return;
      }
      pts.current.delete(e.pointerId);
      if (pts.current.size) startGesture(e.currentTarget);
      else gesture.current = null;
    },
    onPointerCancel: (e: PointerEvent<SVGSVGElement>) => {
      tap.current = null;
      lineDrag.current = false;
      setBand(null);
      dragFrom.current = null;
      pts.current.delete(e.pointerId);
      gesture.current = null;
    },
  };

  return (
    <div ref={ref} className="plot">
      {zoom && zoom.button !== false && !isFull(zoom.view, full) && (
        <button className="zoom-reset" onClick={() => zoom.onView(full)}>Reset zoom</button>
      )}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        style={{ touchAction: onCursor || zoom ? "none" : "pan-y", cursor: zoom ? "crosshair" : undefined }}
        onPointerDown={zoomHandlers ? zoomHandlers.onPointerDown : onCursor ? (e) => { down.current = true; e.currentTarget.setPointerCapture(e.pointerId); onCursor(toX(e)); } : undefined}
        onPointerMove={zoomHandlers ? zoomHandlers.onPointerMove : onCursor ? (e) => { if (down.current) onCursor(toX(e)); } : undefined}
        onPointerUp={zoomHandlers ? zoomHandlers.onPointerUp : onCursor ? () => (down.current = false) : undefined}
        onPointerCancel={zoomHandlers ? zoomHandlers.onPointerCancel : onCursor ? () => (down.current = false) : undefined}
      >
        <defs>
          <clipPath id={`clip-${ariaLabel.replace(/\W/g, "")}`}>
            <rect x={M.l} y={M.t - 4} width={pw} height={ph + 8} />
          </clipPath>
        </defs>
        {yt.map((v) => (
          <g key={`y${v}`}>
            <line x1={M.l} x2={M.l + pw} y1={sy(v)} y2={sy(v)} className={v === 0 && zeroLine && !yLog ? "zero" : "grid"} />
            <text x={M.l - 5} y={sy(v) + 3.5} className="tick" textAnchor="end">{yTickText(v)}</text>
          </g>
        ))}
        {xt.map((v) => (
          <g key={`x${v}`}>
            <line x1={sx(v)} x2={sx(v)} y1={M.t} y2={M.t + ph} className="grid" />
            {!noXTicks && <text x={sx(v)} y={M.t + ph + 13} className="tick" textAnchor="middle">{tickText(v)}</text>}
          </g>
        ))}
        {xLabel && !noXTicks && <text x={M.l + pw} y={height - 2} className="axis-label" textAnchor="end">{xLabel}</text>}
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
            if (s.points)
              return (
                <g key={k}>
                  {Array.from(s.x, (xv, i) => (Number.isFinite(s.y[i]) ? <circle key={i} cx={sx(xv)} cy={clampY(sy(s.y[i]))} r={3.6} style={{ fill: "none", stroke: s.color, strokeWidth: 1.4, opacity: s.opacity ?? 1 }} /> : null))}
                </g>
              );
            const line = <path d={d} fill="none" style={{ stroke: s.color, strokeWidth: s.width ?? 1.6, strokeDasharray: s.dash, opacity: s.opacity ?? 1 }} strokeLinejoin="round" />;
            if (!s.dots) return <g key={k}>{line}</g>;
            return (
              <g key={k}>
                {line}
                {Array.from(s.x, (xv, i) => (Number.isFinite(s.y[i]) ? <circle key={i} cx={sx(xv)} cy={clampY(sy(s.y[i]))} r={3.5} style={{ fill: s.color, opacity: s.opacity ?? 1 }} /> : null))}
              </g>
            );
          })}
        </g>
        {(() => {
          // end labels sit at each line's last visible point, spread apart so none overlaps;
          // peak labels sit beside the line's largest excursion from zero
          const ends: { k: number; x: number; y: number }[] = [];
          const out: JSX.Element[] = [];
          series.forEach((s, k) => {
            if (!s.label) return;
            if (s.labelAt === "peak") {
              let best = 0;
              for (let j = 0; j < s.x.length; j++) if (s.x[j] <= x[1] && Math.abs(s.y[j]) > Math.abs(s.y[best])) best = j;
              const below = s.y[best] < 0;
              const ly = Math.max(M.t + 8, Math.min(M.t + ph - 3, sy(s.y[best]) + (below ? 13 : -5)));
              out.push(<text key={`l${k}`} x={Math.min(sx(s.x[best]) + 6, M.l + pw - 2)} y={ly} className="series-label" textAnchor="start" style={{ fill: s.color }}>{s.label}</text>);
              return;
            }
            let i = s.x.length - 1;
            while (i > 0 && (s.x[i] > x[1] || !Number.isFinite(s.y[i]))) i--;
            ends.push({ k, x: Math.min(sx(s.x[i]), M.l + pw) - 2, y: sy(s.y[i]) - 4 });
          });
          const ys = spreadLabels(ends.map((e) => e.y), 12, M.t + 8, M.t + ph - 3);
          ends.forEach((e, j) => {
            const s = series[e.k];
            out.push(<text key={`l${e.k}`} x={e.x} y={ys[j]} className="series-label" textAnchor="end" style={{ fill: s.color }}>{s.label}</text>);
          });
          return out;
        })()}
        {band && <rect x={M.l + Math.min(band[0], band[1]) * pw} y={M.t} width={Math.abs(band[1] - band[0]) * pw} height={ph} className="band" />}
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
