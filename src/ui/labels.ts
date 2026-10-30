/**
 * Spread labels apart vertically so none overlaps another, moving each as
 * little as possible and keeping them within [top, bottom]. Input and output
 * are y positions in pixels, in the input's order.
 */
export function spreadLabels(ys: number[], gap: number, top: number, bottom: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const out = order.map((o) => Math.max(top, Math.min(bottom, o.y)));
  // push down past any overlap, then pull back up from the bottom edge
  for (let k = 1; k < out.length; k++) out[k] = Math.max(out[k], out[k - 1] + gap);
  if (out.length && out[out.length - 1] > bottom) {
    out[out.length - 1] = bottom;
    for (let k = out.length - 2; k >= 0; k--) out[k] = Math.min(out[k], out[k + 1] - gap);
  }
  const res = new Array<number>(ys.length);
  order.forEach((o, k) => (res[o.i] = out[k]));
  return res;
}
