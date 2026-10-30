/**
 * Horizontal zoom for a phone: pinch to zoom, drag to pan, double-tap to
 * reset. Pure arithmetic on the visible range, so it is tested without a DOM.
 */

export type Range = [number, number];

/** Keep a view inside the full range, no narrower than minSpan, no wider than the full range. */
export function clampView(v: Range, full: Range, minSpan: number): Range {
  const fullSpan = full[1] - full[0];
  const span = Math.max(minSpan, Math.min(fullSpan, v[1] - v[0]));
  let a = v[0];
  if (a < full[0]) a = full[0];
  if (a + span > full[1]) a = full[1] - span;
  return [a, a + span];
}

/**
 * The view after a pinch (or a pan, with ratio 1). The data point that was
 * under the fingers' midpoint at fraction f0 of the plot's width stays under
 * the midpoint, now at fraction f1; the span shrinks by `ratio` (the fingers'
 * distance now over their distance at the start).
 */
export function pinchView(view0: Range, full: Range, f0: number, f1: number, ratio: number, minSpan: number): Range {
  const span0 = view0[1] - view0[0];
  const anchor = view0[0] + f0 * span0;
  const span = span0 / Math.max(ratio, 1e-6);
  const a = anchor - f1 * span;
  return clampView([a, a + span], full, minSpan);
}

export function isFull(v: Range, full: Range): boolean {
  return Math.abs(v[0] - full[0]) < 1e-9 && Math.abs(v[1] - full[1]) < 1e-9;
}

/** The view after a mouse drag from fraction f0 to f1 of the plot's width: the dragged window, in either direction. */
export function selectView(view: Range, full: Range, f0: number, f1: number, minSpan: number): Range {
  const span = view[1] - view[0];
  const a = view[0] + Math.min(f0, f1) * span, b = view[0] + Math.max(f0, f1) * span;
  const mid = (a + b) / 2;
  const w = Math.max(minSpan, b - a);
  return clampView([mid - w / 2, mid + w / 2], full, minSpan);
}

/**
 * The view after a wheel event at fraction f of the plot's width. Vertical
 * wheel (and a trackpad pinch, which browsers send as a wheel with ctrlKey)
 * zooms about the pointer; a sideways scroll pans.
 */
export function wheelView(view: Range, full: Range, f: number, dx: number, dy: number, ctrl: boolean, plotWidthPx: number, minSpan: number): Range {
  const span = view[1] - view[0];
  if (!ctrl && Math.abs(dx) > Math.abs(dy)) {
    const shift = (dx / plotWidthPx) * span;
    return clampView([view[0] + shift, view[1] + shift], full, minSpan);
  }
  const ratio = Math.exp(-dy * (ctrl ? 0.01 : 0.002));
  return pinchView(view, full, f, f, ratio, minSpan);
}
