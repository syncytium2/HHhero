/**
 * HHhero: the Hodgkin–Huxley gates, two ways.
 *
 * One model and two sets of controls. The switch at the top chooses whether
 * a gate is edited as its rates (α, β: Hodgkin & Huxley's own form) or as its
 * steady state and time constant (x∞, τ: the form most later models use).
 * Flipping it never changes the model; it changes what you hold. Each view
 * keeps its own edits, and the other view's are shown, never hidden.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plot, type Series } from "./ui/Plot.tsx";
import { Slider } from "./ui/Slider.tsx";
import { Tour, tour } from "./ui/Tour.tsx";
import { Retro } from "./ui/Retro.tsx";
import { clampView, isFull, type Range } from "./ui/zoom.ts";
import {
  fmt, GATE_IDS, infEdited, NO_EDIT, rateEdited, rateFormula, STOCK_RATES, stockGate, tauEdited,
  type GateId, type GateParams, type Rate,
} from "./core/rates.ts";
import { buildModel, stockParams, type Model, type Params } from "./core/model.ts";
import { availability, settle, spikeTimes, thresholdLadder, type ClampSweep } from "./core/sim.ts";
import {
  commandLine, DEFAULT_I, DEFAULT_V, epochAtTime, inactShaped, firesP, I_PRESETS, iclamp, iclampSweep, LETTERS, longestSweep, pulseAmp, swept,
  sweepEpochs, thresholdP, V_PRESETS, vclamp, withPulse, type Protocol,
} from "./core/protocol.ts";
import { ProtocolEditor, protocolWords } from "./ui/ProtocolEditor.tsx";
import { hInfLabel, inactNote, noteFor, type View } from "./core/notes.ts";
import { ARCHIVED, BORN, DEV_SITE, EARLIER, VERSION } from "./version.ts";

type Sel = GateId | "na" | "k" | "mem" | "proto";
type SimTab = "clamp" | "spike";
type Cur = "iNa" | "iK";
const CUR_LABEL = { iNa: "INa", iK: "IK" } as const;

/** y at time tq along a trace sampled at increasing times t, by linear interpolation */
function valAt(t: ArrayLike<number>, y: ArrayLike<number>, tq: number): number {
  const n = t.length;
  if (n === 0) return NaN;
  if (tq <= t[0]) return y[0];
  if (tq >= t[n - 1]) return y[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= tq) lo = mid;
    else hi = mid;
  }
  const f = (tq - t[lo]) / (t[hi] - t[lo] || 1);
  return y[lo] + f * (y[hi] - y[lo]);
}

const STOCK = stockParams();
const STOCK_MODEL = buildModel(STOCK);
const VGRID = Float64Array.from({ length: 301 }, (_, i) => -100 + i * 0.5);
const C = {
  m: "var(--m)", h: "var(--h)", n: "var(--n)", na: "var(--na)", k: "var(--k)",
  ink: "var(--ink)", stock: "var(--stock)",
};

function useMedia(q: string) {
  const [on, setOn] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [q]);
  return on;
}

function useWide() {
  const q = "(min-width: 900px)";
  const [wide, setWide] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const f = () => setWide(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return wide;
}

function useWinH() {
  const [h, setH] = useState(() => (typeof innerHeight === "number" ? innerHeight : 900));
  useEffect(() => {
    const f = () => setH(innerHeight);
    addEventListener("resize", f);
    return () => removeEventListener("resize", f);
  }, []);
  return h;
}

function curves(md: Model, id: GateId) {
  const g = md.g[id];
  return {
    a: VGRID.map((v) => g.alpha(v)),
    b: VGRID.map((v) => g.beta(v)),
    inf: VGRID.map((v) => g.inf(v)),
    tau: VGRID.map((v) => g.tau(v)),
  };
}

const STOCK_CURVES = { m: curves(STOCK_MODEL, "m"), h: curves(STOCK_MODEL, "h"), n: curves(STOCK_MODEL, "n") };

const SETTLE_MS = 50, DT = 0.01;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** what sweep k of a protocol is, in a few words: the swept epoch's value */
function sweepWords(pr: Protocol, k: number): string {
  const s = swept(pr);
  if (!s) return "";
  const e = sweepEpochs(pr, k)[s.epoch];
  return s.what === "level" ? `${LETTERS[s.epoch]} at ${fmt(e.level)} ${pr.mode === "v" ? "mV" : "µA/cm²"}` : `${LETTERS[s.epoch]} ${fmt(e.dur)} ms`;
}

/**
 * The 1952 screen is under the owner's review: it opens at #1952, but nothing
 * links to it until this is true.
 */
export const SHOW_1952 = false;

/** The app, or the 1952 screen when the address ends in #1952 (so it can be linked to). */
export function App() {
  const [retro, setRetro] = useState(() => typeof location !== "undefined" && location.hash === "#1952");
  useEffect(() => {
    const f = () => setRetro(location.hash === "#1952");
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  const go = (on: boolean) => {
    if (on) location.hash = "1952";
    else history.pushState(null, "", location.pathname + location.search);
    setRetro(on);
  };
  return retro ? <Retro onExit={() => go(false)} /> : <Main onRetro={() => go(true)} />;
}

function Main({ onRetro }: { onRetro: () => void }) {
  const [p, setP] = useState<Params>(stockParams);
  const [view, setView] = useState<View>("ab");
  const [sel, setSel] = useState<Sel>("m");
  // the gates drawn on the curve plots: any combination, toggled on and off
  const [shown, setShown] = useState<GateId[]>(["m"]);
  const [logY, setLogY] = useState(false);
  const [tab, setTab] = useState<SimTab>("clamp");
  // the currents drawn in voltage clamp, either or both, on the traces and on the I–V; and whether the I–V replaces the traces
  const [clampCur, setClampCur] = useState<Cur[]>(["iNa"]);
  // the clamp shows currents or, with g on, the conductances behind them
  const [clampG, setClampG] = useState(false);
  const [iv, setIv] = useState(false);
  // the measuring cursor on the traces: off until asked for; a time per experiment, and the clamp sweep it reads
  const [measure, setMeasure] = useState(false);
  const [clampT, setClampT] = useState<number | null>(null);
  const [spikeT, setSpikeT] = useState<number | null>(null);
  const [clampPick, setClampPick] = useState<number | null>(null);
  const [spikeTrace, setSpikeTrace] = useState<"i" | "g" | "gates">("i");
  // the protocols: one for each mode, each with the stock protocol it started from, and the epoch being edited
  const [vp, setVp] = useState<Protocol>(DEFAULT_V);
  const [ip, setIp] = useState<Protocol>(DEFAULT_I);
  const [vBase, setVBase] = useState<Protocol>(DEFAULT_V);
  const [iBase, setIBase] = useState<Protocol>(DEFAULT_I);
  const [selEp, setSelEp] = useState(1);
  const INACT_PRESET = V_PRESETS.find((x) => x.id === "hinf")!.p;
  // the header's Act | Inact: the stock protocol the clamp last started from
  const actOn = same(vBase, V_PRESETS[0].p), inactOn = same(vBase, INACT_PRESET);
  // a new protocol starts unzoomed, at its first sweep, with no cursor
  const pickV = (q: Protocol) => { setVp(q); setVBase(q); setSelEp(1); setClampK(0); setClampX(null); setClampT(null); setClampPick(null); };
  const [cursor, setCursor] = useState(-40);
  const [about, setAbout] = useState(false);
  const [touring, setTouring] = useState(false);
  // focus: the curves card hides and the traces take its height, for teaching from the front of a room; remembered per device
  const [focus, setFocus] = useState(() => { try { return localStorage.getItem("hhhero.focus") === "1"; } catch { return false; } });
  const toggleFocus = () => {
    const on = !focus;
    setFocus(on);
    try { localStorage.setItem("hhhero.focus", on ? "1" : "0"); } catch { /* private window: not remembered */ }
  };
  const [clampX, setClampX] = useState<Range | null>(null);
  // stepping through: one sweep at a time, forward and back, for teaching from the front of a room
  const [stepping, setStepping] = useState(false);
  const [clampK, setClampK] = useState(0);
  const [spikeK, setSpikeK] = useState(0);
  const [spikeX, setSpikeX] = useState<Range | null>(null);
  const wide = useWide();
  const winH = useWinH();
  // a mouse or trackpad (hover and a fine pointer) gets the desktop zoom hint; touch gets the gestures
  const mouse = useMedia("(hover: hover) and (pointer: fine)");
  // a new view or chip starts at the top of the panel, where the notes are
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (panelRef.current) panelRef.current.scrollTop = 0; }, [view, sel]);

  const md = useMemo(() => buildModel(p), [p]);
  const cv = useMemo(() => ({ m: curves(md, "m"), h: curves(md, "h"), n: curves(md, "n") }), [md]);
  const fam = useMemo(() => vclamp(md, vp), [md, vp]);
  const famStock = useMemo(() => vclamp(STOCK_MODEL, vp), [vp]);
  const runs = useMemo(() => iclamp(md, ip, DT, 5), [md, ip]);
  const runsStock = useMemo(() => iclamp(STOCK_MODEL, ip, DT, 5), [ip]);
  // current clamp with several sweeps: Step walks them; with one sweep, it walks pulses up to threshold and across it
  const family = ip.sweeps > 1;

  // The pulses around threshold are built from the cell as it was when stepping began (or was re-centered), so moving
  // a slider changes the cell, not the stimulus: pick a pulse just under threshold, then see what a parameter does to it.
  const [ladderP, setLadderP] = useState<Params | null>(null);
  const pinned = ladderP ?? p;
  // a hyperpolarizing pulse (anode break) is scaled the same way, downward
  const sgn = pulseAmp(ip) < 0 ? -1 : 1;
  const ladderBase = useMemo(() => {
    if (!stepping || tab !== "spike" || family) return null;
    const m0 = buildModel(pinned);
    const thr0 = thresholdP(m0, ip, settle(m0, ip.epochs[0].level, SETTLE_MS, DT), DT);
    return { thr0, base: thresholdLadder(thr0 === null ? null : Math.abs(thr0), Math.abs(pulseAmp(ip))) };
  }, [pinned, ip, stepping, tab, family]);
  // the cell has moved since the pulses were built around its threshold
  const moved = ladderP !== null && JSON.stringify(ladderP) !== JSON.stringify(p);
  const ladder = useMemo(() => {
    if (!ladderBase) return null;
    const from = settle(md, ip.epochs[0].level, SETTLE_MS, DT);
    const thr = moved ? thresholdP(md, ip, from, DT) : ladderBase.thr0;
    const rungs = ladderBase.base.map((r) => {
      const q = withPulse(ip, sgn * r.amp);
      return { ...r, amp: sgn * r.amp, fired: firesP(md, q, from, DT), run: iclampSweep(md, q, 0, DT, 5, from) };
    });
    return { thr, thr0: ladderBase.thr0, rungs };
  }, [md, ladderBase, moved, ip, sgn]);
  const recenter = () => setLadderP(p);
  const nSteps = tab === "clamp" ? fam.length : ladder ? ladder.rungs.length : runs.length;
  const k = Math.min(tab === "clamp" ? clampK : spikeK, nSteps - 1);
  const go = (d: number) => (tab === "clamp" ? setClampK : setSpikeK)(Math.max(0, Math.min(nSteps - 1, k + d)));
  const rung = ladder ? ladder.rungs[k] : null;
  const rungAmp = rung?.amp;
  const rungStock = useMemo(
    () => (rungAmp === undefined ? null : iclampSweep(STOCK_MODEL, withPulse(ip, rungAmp), 0, DT, 5)),
    [rungAmp, ip],
  );
  // the current-clamp sweep whose currents are drawn: the one stepped to, or the last
  const ri = stepping ? Math.min(k, runs.length - 1) : runs.length - 1;
  const apShown = rung ? rung.run : runs[ri];
  const apStockShown = rungStock ?? runsStock[ri];
  // arrow keys, Page Up and Page Down (what a presentation clicker sends) step too, unless a control has the keys
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    if (!stepping) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); goRef.current(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); goRef.current(-1); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [stepping]);
  const toggleStepping = () => {
    if (!stepping) { setClampK(0); setSpikeK(0); setLadderP(p); }
    setStepping(!stepping);
  };

  // choosing a gate to edit also draws it; the curve card's buttons toggle what is drawn
  const pick = (s: Sel) => {
    setSel(s);
    if (s === "m" || s === "h" || s === "n") setShown((q) => (q.includes(s) ? q : GATE_IDS.filter((id) => id === s || q.includes(id))));
  };
  const toggleShown = (id: GateId) =>
    setShown((q) => (q.includes(id) ? (q.length > 1 ? q.filter((x) => x !== id) : q) : GATE_IDS.filter((x) => x === id || q.includes(x))));
  const setGateP = (id: GateId, f: (g: GateParams) => GateParams) => setP((q) => ({ ...q, gates: { ...q.gates, [id]: f(q.gates[id]) } }));
  const setRate = (id: GateId, which: "alpha" | "beta", key: keyof Omit<Rate, "kind">, v: number) =>
    setGateP(id, (g) => ({ ...g, [which]: { ...g[which], [key]: v } }));
  const setIT = (id: GateId, key: keyof typeof NO_EDIT, v: number) => setGateP(id, (g) => ({ ...g, it: { ...g.it, [key]: v } }));

  const edited = (s: Sel): boolean => {
    if (s === "m" || s === "h" || s === "n") return rateEdited(p.gates[s], s) || infEdited(p.gates[s].it) || tauEdited(p.gates[s].it);
    if (s === "na") return p.gNa !== STOCK.gNa || p.eNa !== STOCK.eNa || p.pm !== STOCK.pm || p.ph !== STOCK.ph;
    if (s === "k") return p.gK !== STOCK.gK || p.eK !== STOCK.eK || p.pn !== STOCK.pn;
    if (s === "mem") return p.celsius !== STOCK.celsius || p.gL !== STOCK.gL || p.eL !== STOCK.eL || p.cm !== STOCK.cm;
    return !same(vp, DEFAULT_V) || !same(ip, DEFAULT_I);
  };
  const anyEdited = (["m", "h", "n", "na", "k", "mem", "proto"] as Sel[]).some(edited);

  // in focus the traces take the height the curves card gave up
  // (on a wide screen, the window's height, less the stepper's row when it is showing)
  const stepH = stepping ? 60 : 0;
  // a banner (the dev site's one line, an earlier version's two) takes its height from the traces in Focus on a phone
  const bannerH = wide ? 0 : DEV_SITE ? 24 : ARCHIVED ? 52 : 0;
  const H = wide
    ? focus ? { curve: 260, strip: 90, sim: Math.max(280, winH - 270 - stepH), v: Math.max(170, (winH - 260 - stepH) / 2), sim2: Math.max(180, (winH - 260 - stepH) / 2) } : { curve: 260, strip: 72, sim: 280, v: 170, sim2: 180 }
    : focus ? { curve: 132, strip: 60, sim: 320 - bannerH, v: 150 - bannerH / 2, sim2: 190 - bannerH / 2 } : { curve: 132, strip: 46, sim: 124, v: 64, sim2: 80 };

  // ------------------------------------------------------------ curves
  const one = shown.length === 1;
  const gs = (id: GateId) => (one ? "" : id); // a label needs the gate's name only when several are drawn
  const stockS = (k: "a" | "b" | "inf" | "tau", dash?: string): Series[] =>
    shown.map((id) => ({ x: VGRID, y: STOCK_CURVES[id][k], color: C.stock, width: 3, dash }));
  const names = shown.join(", ");
  const curvePlots =
    view === "ab" ? (
      <Plot
        height={H.curve}
        ariaLabel={`alpha and beta of ${names}`}
        x={[-100, 50]}
        yInclude={logY ? undefined : [0]}
        yLog={logY}
        xLabel="mV"
        yLabel={`α, β (1/ms)${logY ? ", log" : ""} · solid α, dashed β`}
        cursor={cursor}
        onCursor={setCursor}
        series={[
          ...stockS("a"),
          ...stockS("b", "5 4"),
          ...shown.map((id) => ({ x: VGRID, y: cv[id].a, color: C[id], label: `α${gs(id)}` }) as Series),
          ...shown.map((id) => ({ x: VGRID, y: cv[id].b, color: C[id], dash: "5 4", label: `β${gs(id)}` }) as Series),
        ]}
      />
    ) : (
      <div className="pair">
        <Plot
          height={H.curve}
          ariaLabel={`steady state of ${names}`}
          x={[-100, 50]}
          y={[-0.04, 1.04]}
          xLabel="mV"
          yLabel="x∞"
          cursor={cursor}
          onCursor={setCursor}
          series={[...stockS("inf"), ...shown.map((id) => ({ x: VGRID, y: cv[id].inf, color: C[id], label: `${id}∞` }) as Series)]}
        />
        <Plot
          height={H.curve}
          ariaLabel={`time constant of ${names}`}
          x={[-100, 50]}
          yInclude={logY ? undefined : [0]}
          yLog={logY}
          xLabel="mV"
          yLabel={`τ (ms)${logY ? ", log" : ""}`}
          cursor={cursor}
          onCursor={setCursor}
          series={[...stockS("tau"), ...shown.map((id) => ({ x: VGRID, y: cv[id].tau, color: C[id], label: `τ${gs(id)}` }) as Series)]}
        />
      </div>
    );
  const readout = (
    <p className="readout" aria-live="polite">
      <b>{fmt(cursor)} mV</b>
      {shown.map((id) => {
        const g = md.g[id];
        return (
          <span key={id} style={{ color: C[id] }}>
            {" · "}
            {view === "ab"
              ? `α${id} ${fmt(g.alpha(cursor))}, β${id} ${fmt(g.beta(cursor))}`
              : `${id}∞ ${fmt(g.inf(cursor))}, τ${id} ${fmt(g.tau(cursor))}`}
          </span>
        );
      })}
      <span className="muted">{view === "ab" ? " /ms" : " ms"}</span>
    </p>
  );

  // ------------------------------------------------------------ simulation
  const mA = (a: Float64Array) => a.map((x) => x / 1000);
  // what the clamp draws for a channel: its current in mA/cm², or its conductance in mS/cm²
  const cq = (s: ClampSweep, c: Cur) => (clampG ? (c === "iNa" ? s.gNa : s.gK) : mA(s[c]));
  const cqLabel = (c: Cur) => (clampG ? (c === "iNa" ? "gNa" : "gK") : CUR_LABEL[c]);
  const cqUnit = clampG ? "mS/cm²" : "mA/cm²";
  const n = fam.length;
  const shade = (j: number) => 0.35 + (0.65 * j) / Math.max(1, n - 1);
  // stepping: the sweeps so far, earlier ones faded, this one bold; the axes stay where the whole family puts them
  const upTo = <T,>(a: T[]) => (stepping ? a.slice(0, k + 1) : a);
  const fade = (j: number) => (stepping ? (j < k ? 0.25 : 1) : shade(j));
  const bold = (j: number) => (stepping && j === k ? 2.2 : undefined);
  const extent = (arrs: ArrayLike<number>[]) => {
    let lo = 0, hi = 0;
    for (const a of arrs) for (let i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
    return [lo, hi];
  };
  // one horizontal zoom per experiment, shared by every plot on its time axis
  const clampFull: Range = [0, longestSweep(vp)];
  const spikeFull: Range = [0, longestSweep(ip)];
  // the reset lives in the caption, not over a plot
  const clampZoom = { view: clampView(clampX ?? clampFull, clampFull, 0.5), onView: setClampX, minSpan: 0.5, button: false };
  const spikeZoom = { view: clampView(spikeX ?? spikeFull, spikeFull, 1), onView: setSpikeX, minSpan: 1, button: false };
  const zoomOn = tab === "clamp" ? !iv && !isFull(clampZoom.view, clampFull) : !isFull(spikeZoom.view, spikeFull);

  // the cursor: the clamp sweep it reads is the current step, or the one last tapped, or the last
  const mi = stepping ? k : Math.min(clampPick ?? n - 1, n - 1);
  const toggleCur = (c: Cur) =>
    setClampCur((q) => (q.includes(c) ? (q.length > 1 ? q.filter((x) => x !== c) : q) : (["iNa", "iK"] as Cur[]).filter((x) => x === c || q.includes(x))));
  // a tap on the traces reads the sweep drawn nearest the tap; on the protocol strip, the nearest command step
  const nearestSweep = (t: number, y: number, valueOf: (j: number) => number) => {
    let best = -1, bd = Infinity;
    for (let j = 0; j < (stepping ? k + 1 : n); j++) {
      const d = Math.abs(valueOf(j) - y);
      if (d < bd) { bd = d; best = j; }
    }
    if (best >= 0 && !stepping) setClampPick(best);
    setClampT(t);
  };
  const onClampTraces = (t: number, y?: number) => {
    if (y === undefined) return setClampT(t);
    let best = -1, bd = Infinity;
    for (let j = 0; j < (stepping ? k + 1 : n); j++)
      for (const c of clampCur) {
        const d = Math.abs(valAt(fam[j].t, cq(fam[j], c), t) - y);
        if (d < bd) { bd = d; best = j; }
      }
    if (best >= 0 && !stepping) setClampPick(best);
    setClampT(t);
  };
  const commandAt = (j: number, t: number) => sweepEpochs(vp, j)[epochAtTime(vp, j, t)].level;
  const onClampStrip = (t: number, y?: number) => (y === undefined ? setClampT(t) : nearestSweep(t, y, (j) => commandAt(j, t)));
  const clampCursor = measure ? { cursor: clampT ?? undefined } : {};
  const spikeCursor = measure ? { cursor: spikeT ?? undefined, onCursor: (t: number) => setSpikeT(t) } : {};
  const toggleMeasure = () => { setMeasure(!measure); setClampT(null); setSpikeT(null); setClampPick(null); };

  // the protocol strip: what the experimenter commands, on the traces' time axis
  // a prepulse family ahead of the measured step: the inactivation shape, whose I–V is h–V
  const inact = inactShaped(vp);
  const inactWords = (() => {
    const s = swept(vp), e = vp.epochs[s?.epoch ?? 0], last = sweepEpochs(vp, vp.sweeps - 1)[s?.epoch ?? 0];
    return `prepulses ${fmt(e.level)} to ${fmt(last.level)} by ${fmt(e.dLevel)}, then test ${fmt(vp.epochs[vp.measure].level)}`;
  })();
  const vLines = fam.map((s) => commandLine(vp, s.k));
  // current clamp: the pulses of the threshold ladder, or the protocol's own sweeps
  const iLines = ladder ? ladder.rungs.map((r) => commandLine(withPulse(ip, r.amp), 0)) : runs.map((r) => commandLine(ip, r.k));
  const iMany = iLines.length > 1;
  const protocol =
    tab === "clamp" ? (
      <Plot
        height={H.strip}
        ariaLabel="voltage-clamp protocol"
        x={clampFull}
        zoom={clampZoom}
        {...clampCursor}
        onCursor={measure ? onClampStrip : undefined}
        noXTicks
        yInclude={vLines.flatMap((l) => l.y)}
        yLabel={`command V (mV): ${inact ? inactWords : protocolWords(vp)}`}
        series={upTo(vLines).map((l, j) => ({
          x: l.x,
          y: l.y,
          color: C.ink,
          width: bold(j) ?? (measure && clampT !== null && j === mi ? 2.2 : 1.2),
          opacity: measure && clampT !== null && j === mi ? 1 : fade(j),
        }))}
      />
    ) : (
      <Plot
        height={H.strip}
        ariaLabel="current pulse protocol"
        x={spikeFull}
        zoom={spikeZoom}
        {...spikeCursor}
        noXTicks
        yInclude={[0, ...iLines.flatMap((l) => l.y)]}
        yLabel={`injected I (µA/cm²): ${rungAmp !== undefined ? `pulse ${fmt(rungAmp)}` : protocolWords(ip)}`}
        series={(stepping ? iLines.slice(0, k + 1) : iLines).map((l, j) => ({
          x: l.x,
          y: l.y,
          color: C.ink,
          width: iMany ? (stepping ? bold(j) ?? 1.2 : j === iLines.length - 1 ? 1.6 : 1.2) : 1.4,
          opacity: iMany ? (stepping ? fade(j) : j === iLines.length - 1 ? 1 : 0.3) : 1,
        }))}
      />
    );
  // the I–V's x axis: whatever changes from sweep to sweep
  const sw = swept(vp);
  const ivX = !sw ? "sweep" : sw.what === "dur" ? `${LETTERS[sw.epoch]} duration (ms)` : sw.epoch === vp.measure ? "test potential (mV)" : `${LETTERS[sw.epoch]} potential (mV)`;

  let simPlot;
  if (tab === "clamp") {
    if (iv && inact) {
      // inactivation: each prepulse's peak at the test step, over the largest, on the h∞ the model has
      const vs = upTo(fam.map((s) => s.x));
      const naOn = clampCur.includes("iNa"), kOn = clampCur.includes("iK");
      const xs = fam.map((s) => s.x);
      const lo = Math.min(...xs) - 5, hi = Math.max(...xs) + 5;
      const grid = Array.from({ length: 121 }, (_, i) => lo + ((hi - lo) * i) / 120);
      const hLine = (m: Model) => {
        const y = grid.map((v) => Math.pow(m.g.h.inf(v), m.p.ph));
        const top = Math.max(...fam.map((s) => Math.pow(m.g.h.inf(s.x), m.p.ph)));
        return y.map((x) => (top > 0 ? x / top : 0));
      };
      // potassium at the end of the test step, over the largest
      const kRel = (f: typeof fam) => { const e = f.map((s) => s.gKEnd), top = Math.max(0, ...e); return e.map((x) => (top > 0 ? x / top : 0)); };
      simPlot = (
        <Plot
          height={H.sim}
          ariaLabel="steady-state inactivation"
          x={[lo, hi]}
          y={[-0.04, 1.08]}
          xLabel="prepulse potential (mV)"
          yLabel={`${[naOn && "peak INa", kOn && "end IK"].filter(Boolean).join(", ")} ÷ largest${naOn ? ` · line ${hInfLabel(p.ph)}` : ""}`}
          series={[
            ...(naOn ? [{ x: vs, y: upTo(availability(famStock)), color: C.stock, width: 3 }] : []),
            ...(kOn ? [{ x: vs, y: upTo(kRel(famStock)), color: C.stock, width: 3, dash: "5 4" }] : []),
            ...(naOn ? [{ x: grid, y: hLine(md), color: C.h, width: 1.4, dash: "5 4", label: hInfLabel(p.ph) }] : []),
            ...(kOn ? [{ x: vs, y: upTo(kRel(fam)), color: C.k, dash: "5 4", label: "IK end", dots: true }] : []),
            ...(naOn ? [{ x: vs, y: upTo(availability(fam)), color: C.na, label: "INa peak", dots: true }] : []),
          ]}
        />
      );
    } else if (iv) {
      // stepping builds the curve a point at a time, on the axes the whole family needs
      const vs = upTo(fam.map((s) => s.x));
      const xs = fam.map((s) => s.x);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), pad = Math.max(0.05 * (x1 - x0), sw?.what === "level" ? 5 : 0.5);
      // peak INa and IK at the end of the step; or peak gNa and gK at the end
      const ivOf = (s: (typeof fam)[number], which: "iNaPeak" | "iKEnd") =>
        !clampG ? s[which] / 1000 : which === "iNaPeak" ? s.gNaPeak : s.gKEnd;
      const pk = (f: typeof fam, which: "iNaPeak" | "iKEnd") => upTo(f.map((s) => ivOf(s, which)));
      simPlot = (
        <Plot
          height={H.sim}
          ariaLabel={clampG ? "conductance-voltage relation" : "current-voltage relation"}
          x={[x0 - pad, x1 + pad]}
          zeroLine
          yInclude={extent([fam, famStock].flatMap((f) => [
            ...(clampCur.includes("iNa") ? [f.map((s) => ivOf(s, "iNaPeak"))] : []),
            ...(clampCur.includes("iK") ? [f.map((s) => ivOf(s, "iKEnd"))] : []),
          ]))}
          xLabel={ivX}
          yLabel={clampG ? "g (mS/cm²)" : "I (mA/cm²)"}
          series={[
            ...(clampCur.includes("iNa") ? [{ x: vs, y: pk(famStock, "iNaPeak"), color: C.stock, width: 3 }] : []),
            ...(clampCur.includes("iK") ? [{ x: vs, y: pk(famStock, "iKEnd"), color: C.stock, width: 3, dash: "5 4" }] : []),
            ...(clampCur.includes("iNa") ? [{ x: vs, y: pk(fam, "iNaPeak"), color: C.na, label: `${cqLabel("iNa")} peak`, dots: stepping }] : []),
            ...(clampCur.includes("iK") ? [{ x: vs, y: pk(fam, "iKEnd"), color: C.k, dash: "5 4", label: `${cqLabel("iK")} end`, dots: stepping }] : []),
          ]}
        />
      );
    } else {
      // either current or both; the sweep the cursor reads (or, with both drawn, the last) carries the label
      const both = clampCur.length > 1;
      const labelled = (j: number) => (measure && clampT !== null ? j === mi : both && j === (stepping ? k : n - 1));
      simPlot = (
        <Plot
          height={H.sim}
          ariaLabel={`${both ? "sodium and potassium" : clampCur[0] === "iNa" ? "sodium" : "potassium"} ${clampG ? "conductance" : "current"} famil${both ? "ies" : "y"}`}
          x={clampFull}
          zoom={clampZoom}
          {...clampCursor}
          onCursor={measure ? onClampTraces : undefined}
          zeroLine
          yInclude={stepping ? extent([...fam, ...famStock].flatMap((s) => clampCur.map((c) => cq(s, c)))) : [0]}
          xLabel="ms"
          yLabel={`${clampCur.map(cqLabel).join(", ")} (${cqUnit})`}
          series={clampCur.flatMap((c) => [
            ...(stepping ? [famStock[k]] : famStock).map((s) => ({ x: s.t, y: cq(s, c), color: C.stock, width: 2.5 }) as Series),
            ...upTo(fam).map((s, j) => ({
              x: s.t, y: cq(s, c), color: c === "iNa" ? C.na : C.k,
              width: bold(j) ?? (measure && clampT !== null && j === mi ? 2.2 : 1.4),
              opacity: measure && clampT !== null && j === mi ? 1 : fade(j),
              label: labelled(j) ? cqLabel(c) : undefined, labelAt: "peak",
            }) as Series),
          ])}
        />
      );
    }
  } else {
    const ap = apShown, apStock = apStockShown;
    const second: Series[] =
      spikeTrace === "i"
        ? [
            { x: apStock.t, y: mA(apStock.iNa), color: C.stock, width: 2.5 },
            { x: apStock.t, y: mA(apStock.iK), color: C.stock, width: 2.5, dash: "5 4" },
            { x: ap.t, y: mA(ap.iNa), color: C.na, label: "INa", labelAt: "peak" },
            { x: ap.t, y: mA(ap.iK), color: C.k, dash: "5 4", label: "IK", labelAt: "peak" },
          ]
        : spikeTrace === "g"
          ? [
              { x: apStock.t, y: apStock.gNa, color: C.stock, width: 2.5 },
              { x: apStock.t, y: apStock.gK, color: C.stock, width: 2.5, dash: "5 4" },
              { x: ap.t, y: ap.gNa, color: C.na, label: "gNa", labelAt: "peak" },
              { x: ap.t, y: ap.gK, color: C.k, dash: "5 4", label: "gK", labelAt: "peak" },
            ]
          : GATE_IDS.map((id) => ({ x: ap.t, y: ap[id], color: C[id], label: id }) as Series);
    simPlot = (
      <>
        <Plot
          height={H.v}
          ariaLabel="membrane potential"
          x={spikeFull}
          zoom={spikeZoom}
          {...spikeCursor}
          noXTicks
          yInclude={[-80, 40]}
          yLabel="V (mV)"
          series={[
            { x: apStock.t, y: apStock.v, color: C.stock, width: 3 },
            ...(ladder ? ladder.rungs.slice(0, k).map((r) => ({ x: r.run.t, y: r.run.v, color: C.ink, width: 1.2, opacity: 0.25 }) as Series) : []),
            ...(family ? runs.slice(0, ri).map((r) => ({ x: r.t, y: r.v, color: C.ink, width: 1.2, opacity: 0.25 }) as Series) : []),
            { x: ap.t, y: ap.v, color: C.ink, label: "V", width: ladder || family ? 2.2 : undefined },
          ]}
        />
        <Plot
          height={H.sim2}
          ariaLabel={spikeTrace === "gates" ? "gates during the action potential" : "currents during the action potential"}
          x={spikeFull}
          zoom={spikeZoom}
          {...spikeCursor}
          zeroLine
          y={spikeTrace === "gates" ? [-0.04, 1.04] : undefined}
          yInclude={[0]}
          xLabel="ms"
          yLabel={spikeTrace === "i" ? "mA/cm²" : spikeTrace === "g" ? "mS/cm²" : "gates"}
          series={second}
        />
      </>
    );
  }

  // what the cursor reads, in words
  let reading = "";
  if (measure && tab === "clamp" && !iv) {
    if (clampT === null) reading = mouse ? "Click a trace to measure it; drag the line to move." : "Tap a trace to measure it; drag the line to move.";
    else {
      const s = fam[mi], t = clampT;
      const cur = (["iNa", "iK"] as Cur[]).map((c) => `${cqLabel(c)} ${fmt(valAt(s.t, cq(s, c), t))}`).join(", ");
      reading = `t ${fmt(t)} ms · ${LETTERS[epochAtTime(vp, s.k, t)]} at ${fmt(commandAt(s.k, t))} mV · ${cur} ${cqUnit}`;
    }
  } else if (measure && tab === "spike") {
    if (spikeT === null) reading = mouse ? "Click the traces to measure; drag the line to move." : "Tap the traces to measure; drag the line to move.";
    else {
      const a = apShown, t = spikeT;
      const v = (y: ArrayLike<number>) => valAt(a.t, y, t);
      const more =
        spikeTrace === "i" ? `INa ${fmt(v(a.iNa) / 1000)}, IK ${fmt(v(a.iK) / 1000)} mA/cm²`
        : spikeTrace === "g" ? `gNa ${fmt(v(a.gNa))}, gK ${fmt(v(a.gK))} mS/cm²`
        : `m ${fmt(v(a.m))}, h ${fmt(v(a.h))}, n ${fmt(v(a.n))}`;
      reading = `t ${fmt(t)} ms · V ${fmt(v(a.v))} mV · ${more}`;
    }
  }

  // what this step is, in words
  let stepText = "";
  if (stepping && tab === "clamp") {
    const w = sweepWords(vp, k);
    stepText = inact
      ? `Prepulse ${k + 1} of ${nSteps}: ${fmt(fam[k].x)} mV for ${fmt(sweepEpochs(vp, k)[swept(vp)!.epoch].dur)} ms, then test ${fmt(fam[k].v)} mV`
      : `Sweep ${k + 1} of ${nSteps}${w ? `: ${w}` : ""}`;
  } else if (stepping && family) {
    const w = sweepWords(ip, k), n = spikeTimes(runs[k].t, runs[k].v).length;
    stepText = `Sweep ${k + 1} of ${nSteps}${w ? `: ${w}` : ""}, ${n === 0 ? "no spike" : n === 1 ? "1 spike" : `${n} spikes`}`;
  } else if (stepping && ladder) {
    const r = ladder.rungs[k];
    const head = `Pulse ${k + 1} of ${nSteps}: ${fmt(r.amp)} µA/cm², ${r.fired ? "spike" : "no spike"}`;
    const thr = ladder.thr === null ? "" : `Threshold is ${fmt(ladder.thr)} µA/cm².`;
    const firstToFire = r.fired && (k === 0 || !ladder.rungs[k - 1].fired);
    // once a slider has moved the cell, "1% under threshold" no longer holds: say where threshold was and is
    const was = ladder.thr0 === null ? "" : `The pulses were set around ${fmt(ladder.thr0)} µA/cm²; `;
    const now = ladder.thr === null ? "this cell now has no threshold." : `threshold is now ${fmt(ladder.thr)}.`;
    stepText =
      moved ? `${head}. ${was}${was ? now : now[0].toUpperCase() + now.slice(1)}`
      : r.role === "under" ? `${head}, 1% under threshold.`
      : r.role === "over" ? `${head}, 1% over. ${thr}`
      : r.role === "strong" ? `${head}, twice threshold: it fires sooner.`
      : firstToFire ? `${head}: the first to fire. ${thr}`
      : ladder.thr === null && k === 0 ? `${head}. No threshold: this cell fires with no pulse, or not at all.`
      : `${head}.`;
  }

  // ------------------------------------------------------------ controls
  let controls;
  if (sel === "m" || sel === "h" || sel === "n") {
    const id = sel;
    const gp = p.gates[id];
    const s = STOCK_RATES[id];
    const other =
      view === "ab"
        ? (infEdited(gp.it) || tauEdited(gp.it)) && (
            <p className="other">
              Also edited in the x∞, τ view.{" "}
              <button onClick={() => setGateP(id, (q) => ({ ...q, it: { ...NO_EDIT } }))}>Reset those</button>
            </p>
          )
        : rateEdited(gp, id) && (
            <p className="other">
              Also edited in the α, β view.{" "}
              <button onClick={() => setGateP(id, (q) => ({ ...stockGate(id), it: q.it }))}>Reset those</button>
            </p>
          );
    const note = noteFor(view, id, gp);
    const rateRows = (which: "alpha" | "beta") => {
      const r = gp[which], r0 = s[which];
      const nm = `${which === "alpha" ? "α" : "β"}${id}`;
      return (
        <fieldset className="group">
          <legend className="formula">{rateFormula(nm, r)}</legend>
          <Slider label={`${nm} scale A`} unit={r.kind === "linoid" ? "/mV/ms" : "/ms"} value={r.A} min={r0.A / 10} max={r0.A * 10} log stock={r0.A} onChange={(v) => setRate(id, which, "A", v)} />
          <Slider label={`${nm} center V0`} unit="mV" value={r.v0} min={r0.v0 - 50} max={r0.v0 + 50} step={0.5} stock={r0.v0} onChange={(v) => setRate(id, which, "v0", v)} />
          <Slider label={`${nm} voltage scale k`} unit="mV" value={r.k} min={Math.max(1, r0.k / 4)} max={r0.k * 4} log stock={r0.k} onChange={(v) => setRate(id, which, "k", v)} />
        </fieldset>
      );
    };
    const vh = md.g[id].vHalfBase;
    controls = (
      <>
        {note && <p className="note">{note}</p>}
        {other}
        {view === "ab" ? (
          <>
            {rateRows("alpha")}
            {rateRows("beta")}
          </>
        ) : (
          <>
            <fieldset className="group">
              <legend className="formula">{`${id}∞(V) = ${id}∞₀(V½ + (V − V½ − ${fmt(gp.it.dHalf)}) / ${fmt(gp.it.slope)})`}</legend>
              <Slider label={`${id}∞ midpoint V½`} unit="mV" value={+(vh + gp.it.dHalf).toFixed(2)} min={+(vh - 50).toFixed(2)} max={+(vh + 50).toFixed(2)} step={0.5} stock={+vh.toFixed(2)} onChange={(v) => setIT(id, "dHalf", +(v - vh).toFixed(6))} />
              <Slider label={`${id}∞ steepness`} unit="×" value={gp.it.slope} min={0.25} max={4} log stock={1} onChange={(v) => setIT(id, "slope", v)} />
            </fieldset>
            <fieldset className="group">
              <legend className="formula">{`τ${id}(V) = ${fmt(gp.it.tauScale)} · τ${id}₀(V − ${fmt(gp.it.tauShift)})`}</legend>
              <Slider label={`τ${id} scale`} unit="×" value={gp.it.tauScale} min={0.1} max={10} log stock={1} onChange={(v) => setIT(id, "tauScale", v)} />
              <Slider label={`τ${id} shift`} unit="mV" value={gp.it.tauShift} min={-50} max={50} step={0.5} stock={0} onChange={(v) => setIT(id, "tauShift", v)} />
            </fieldset>
            <p className="hint">₀ is the curve the α, β constants give. {id}∞ = α/(α+β), τ = 1/(φ(α+β)).</p>
          </>
        )}
      </>
    );
  } else if (sel === "na") {
    controls = (
      <fieldset className="group">
        <legend className="formula">{`INa = ${fmt(p.gNa)} · m^${p.pm} · h^${p.ph} · (V − ${fmt(p.eNa)})`}</legend>
        <Slider label="ḡNa" unit="mS/cm²" value={p.gNa} min={0} max={360} step={1} stock={STOCK.gNa} onChange={(v) => setP({ ...p, gNa: v })} />
        <Slider label="ENa" unit="mV" value={p.eNa} min={-20} max={120} step={0.5} stock={STOCK.eNa} onChange={(v) => setP({ ...p, eNa: v })} />
        <Slider label="power of m" value={p.pm} min={1} max={6} integer stock={STOCK.pm} onChange={(v) => setP({ ...p, pm: v })} />
        <Slider label="power of h" value={p.ph} min={0} max={3} integer stock={STOCK.ph} onChange={(v) => setP({ ...p, ph: v })} />
      </fieldset>
    );
  } else if (sel === "k") {
    controls = (
      <fieldset className="group">
        <legend className="formula">{`IK = ${fmt(p.gK)} · n^${p.pn} · (V − (${fmt(p.eK)}))`}</legend>
        <Slider label="ḡK" unit="mS/cm²" value={p.gK} min={0} max={108} step={0.5} stock={STOCK.gK} onChange={(v) => setP({ ...p, gK: v })} />
        <Slider label="EK" unit="mV" value={p.eK} min={-120} max={-20} step={0.5} stock={STOCK.eK} onChange={(v) => setP({ ...p, eK: v })} />
        <Slider label="power of n" value={p.pn} min={1} max={8} integer stock={STOCK.pn} onChange={(v) => setP({ ...p, pn: v })} />
      </fieldset>
    );
  } else if (sel === "mem") {
    controls = (
      <fieldset className="group">
        <legend className="formula">{`φ = 3^((T − 6.3)/10) = ${fmt(Math.pow(3, (p.celsius - 6.3) / 10))}: every τ ÷ φ`}</legend>
        <Slider label="temperature" unit="°C" value={p.celsius} min={0} max={35} step={0.1} stock={STOCK.celsius} onChange={(v) => setP({ ...p, celsius: v })} />
        <Slider label="ḡL (leak)" unit="mS/cm²" value={p.gL} min={0} max={3} step={0.01} stock={STOCK.gL} onChange={(v) => setP({ ...p, gL: v })} />
        <Slider label="EL" unit="mV" value={p.eL} min={-90} max={-30} step={0.1} stock={STOCK.eL} onChange={(v) => setP({ ...p, eL: v })} />
        <Slider label="Cm" unit="µF/cm²" value={p.cm} min={0.2} max={5} log stock={STOCK.cm} onChange={(v) => setP({ ...p, cm: v })} />
      </fieldset>
    );
  } else {
    const v = tab === "clamp";
    controls = (
      <ProtocolEditor
        mode={v ? "v" : "i"}
        onMode={(m) => { setTab(m === "v" ? "clamp" : "spike"); setSelEp(1); }}
        p={v ? vp : ip}
        setP={v ? setVp : setIp}
        presets={v ? V_PRESETS : I_PRESETS}
        base={v ? vBase : iBase}
        setBase={(b) => { (v ? setVBase : setIBase)(b); (v ? setClampK : setSpikeK)(0); }}
        sel={selEp}
        setSel={setSelEp}
      />
    );
  }

  const resetSel = () => {
    if (sel === "m" || sel === "h" || sel === "n") setGateP(sel, () => stockGate(sel));
    else if (sel === "na") setP({ ...p, gNa: STOCK.gNa, eNa: STOCK.eNa, pm: STOCK.pm, ph: STOCK.ph });
    else if (sel === "k") setP({ ...p, gK: STOCK.gK, eK: STOCK.eK, pn: STOCK.pn });
    else if (sel === "mem") setP({ ...p, celsius: STOCK.celsius, gL: STOCK.gL, eL: STOCK.eL, cm: STOCK.cm });
    else { setVp(DEFAULT_V); setIp(DEFAULT_I); setVBase(DEFAULT_V); setIBase(DEFAULT_I); }
  };

  const chips: { id: Sel; label: string }[] = [
    { id: "m", label: "m" }, { id: "h", label: "h" }, { id: "n", label: "n" },
    { id: "na", label: "Na" }, { id: "k", label: "K" }, { id: "mem", label: "Membrane" }, { id: "proto", label: "Protocol" },
  ];

  return (
    <div className={`app${wide ? " wide" : ""}`}>
      <header className="top">
        <div className="brand">
          <h1>HH<span>hero</span></h1>
          <a className="home-link" href="https://tonydefazio.com/">tonydefazio.com</a>
        </div>
        <button className="why-btn" onClick={() => setAbout(true)}
          {...tour("Why", "What an action potential is, where this site fits, the model and its source, and the earlier versions.")}>Why</button>
        <button className="tour-btn" aria-label="quick tour" onClick={() => setTouring(true)} disabled={touring}>Tour</button>
        {wide && SHOW_1952 && (
          <button className="r-enter" onClick={onRetro}
            {...tour("1952", "Re-run figures from Hodgkin and Huxley's model paper, on a green-phosphor screen, in the paper's own signs.")}>1952</button>
        )}
        <div className="switch" role="radiogroup" aria-label="formulation">
          <button role="radio" aria-checked={view === "ab"} className={view === "ab" ? "on" : ""} onClick={() => setView("ab")}
            {...tour("α, β", "Each gate as Hodgkin and Huxley wrote it: α, how fast it opens, and β, how fast it closes.")}>α, β</button>
          <button role="radio" aria-checked={view === "it"} className={view === "it" ? "on" : ""} onClick={() => setView("it")}
            {...tour("x∞, τ", "The same gates as where they settle and how fast they get there. The model doesn't change; what you hold does.")}>x∞, τ</button>
        </div>
      </header>

      {DEV_SITE && (
        <p className="archived dev-site" title="A preview for review, not the site students use">
          Dev preview: {DEV_SITE}. <a href="https://hhhero.tonydefazio.com/">Live site</a>
        </p>
      )}
      {ARCHIVED && (
        <p className="archived">
          You are using an earlier version, v{VERSION}. <a href="/">Back to the current version</a>
        </p>
      )}
      <main className="plots">
        {!focus && <section className="card curves" aria-label="gate curves">
          <div className="card-head">
            <span className="gate-pick" {...tour("The gates", "Draw m, h and n, any of them together. Gray is the stock squid axon; color is your cell.")}>
              {GATE_IDS.map((id) => (
                <button
                  key={id}
                  aria-pressed={shown.includes(id)}
                  aria-label={`show ${id}`}
                  className={shown.includes(id) ? "on" : ""}
                  style={shown.includes(id) ? { background: C[id], borderColor: C[id] } : { color: C[id] }}
                  onClick={() => toggleShown(id)}
                >
                  {id}
                </button>
              ))}
            </span>
            <button className={`log-btn${logY ? " on" : ""}`} aria-pressed={logY} aria-label="log scale" onClick={() => setLogY(!logY)}
              {...tour("log", "A log axis, to see the small rates.")}>log</button>
            <span className="muted">{fmt(p.celsius)} °C · gray = stock</span>
          </div>
          {curvePlots}
          {readout}
        </section>}

        <section className="card sim" aria-label="simulation">
          <div className="card-head">
            <span className="tabs">
              <button className={tab === "clamp" ? "on" : ""} aria-label="Voltage clamp" onClick={() => setTab("clamp")}
                {...tour("Voltage clamp", "Hold the membrane at a family of voltages and record the currents that flow.", { kind: "pick" })}>{wide ? "Voltage clamp" : "V clamp"}</button>
              <button className={tab === "spike" ? "on" : ""} aria-label="Spike (action potential)" onClick={() => setTab("spike")}
                {...tour("Action potential", "Inject a brief pulse of current and let the cell fire.", { kind: "pick" })}>{wide ? "Action potential" : "Spike"}</button>
            </span>
            <button className={`step-btn${stepping ? " on" : ""}`} aria-pressed={stepping} aria-label="step through" onClick={toggleStepping}
              {...tour("Step", "One sweep at a time, for teaching from the front of a room: the clamp family, or pulses up to threshold and across it. The arrow keys and a presentation clicker step too.", { then: "next step" })}>Step</button>
            {tab === "clamp" && <span className="row-break" aria-hidden="true" />}
            {tab === "clamp" && (
              // the clamp protocol, one tap from the traces: the Steps and Inactivation presets of Protocol
              <span className="tabs proto-pick" role="radiogroup" aria-label="voltage-clamp protocol">
                <button role="radio" aria-checked={actOn} aria-label="activation protocol" className={actOn ? "on" : ""} onClick={() => pickV(V_PRESETS[0].p)}
                  {...tour("Act", "Activation: a family of steps from one holding potential. Sodium turns on, then off; potassium turns on.", { kind: "pick" })}>{wide ? "Activation" : "Act"}</button>
                <button role="radio" aria-checked={inactOn} aria-label="inactivation protocol" className={inactOn ? "on" : ""} onClick={() => pickV(INACT_PRESET)}
                  {...tour("Inact", "Inactivation: each sweep a different prepulse, then all step to one test potential. The sodium current left shows how many channels the prepulse inactivated; h–V plots it. Its epochs are under Protocol.", { kind: "pick" })}>{wide ? "Inactivation" : "Inact"}</button>
              </span>
            )}
            <span className="tabs small">
              {tab === "clamp"
                ? (
                    <>
                      {(["iNa", "iK"] as const).map((c) => {
                        const on = clampCur.includes(c), col = c === "iNa" ? C.na : C.k;
                        return (
                          <button key={c} aria-pressed={on} className={on ? "on" : ""} style={on ? { background: col, borderColor: col } : { color: col }} aria-label={c === "iNa" ? "sodium" : "potassium"} onClick={() => toggleCur(c)}
                            {...tour(c === "iNa" ? "Na" : "K", c === "iNa" ? "Sodium. Na and K switch on and off separately, on the traces and on the I–V." : "Potassium, alone or with sodium.")}>{c === "iNa" ? "Na" : "K"}</button>
                        );
                      })}
                      <button className={clampG ? "on" : ""} aria-pressed={clampG} aria-label="conductance" onClick={() => setClampG(!clampG)}
                        {...tour("g", "Conductance instead of current: what the channels do, without the driving force.")}>g</button>
                      <button className={`iv-btn${iv ? " on" : ""}`} aria-pressed={iv} onClick={() => setIv(!iv)}
                        {...tour(inact ? "h–V" : "I–V", inact ? "Peak sodium at the test step against the prepulse, over h∞: the inactivation curve. Potassium, if on, stays flat." : "Peak sodium and late potassium against whatever the protocol changes from sweep to sweep.")}>{inact ? "h–V" : clampG ? "g–V" : "I–V"}</button>
                    </>
                  )
                : (["i", "g", "gates"] as const).map((k) => (
                    <button key={k} className={spikeTrace === k ? "on" : ""} onClick={() => setSpikeTrace(k)}
                    {...tour(k === "i" ? "I" : k === "g" ? "g" : "m h n", k === "i" ? "The currents during the spike." : k === "g" ? "The conductances during the spike." : "The gates during the spike.", { kind: "pick" })}>{k === "i" ? "I" : k === "g" ? "g" : "m h n"}</button>
                  ))}
            </span>
          </div>
          {(tab === "spike" || !iv) && protocol}
          <div className="sim-plots" {...tour("The traces", "Pinch or drag across them to zoom time; double-tap or double-click resets.")}>{simPlot}</div>
          {stepping && (
            <div className="stepper" role="group" aria-label="steps" {...tour("Stepping", "Back and forward through the sweeps.")}>
              <button aria-label="previous step" disabled={k === 0} onClick={() => go(-1)}>‹</button>
              <span className="step-text" aria-live="polite">
                {stepText}
                {moved && tab === "spike" && <> <button className="recenter" onClick={recenter}>Re-center</button></>}
              </span>
              <button aria-label="next step" disabled={k === nSteps - 1} onClick={() => go(1)}>›</button>
            </div>
          )}
          <div className="caption">
            <span className="cap-text" aria-live="polite">
              {reading ? <b className="reading">{reading}</b> : (
                <>
                  {!stepping && (tab === "clamp" ? "Ideal clamp, no electrode: what no rig records." : "The membrane alone, no electrode.")}
                  {tab === "clamp" && iv && inact && ` ${inactNote(p.ph, clampCur.includes("iNa"), clampCur.includes("iK"))}`}
                  {!stepping && (tab === "spike" || !iv) && !zoomOn && (mouse ? " Drag across the traces or scroll to zoom time; double-click to reset." : " Pinch to zoom time, drag to pan, double-tap to reset.")}
                  {stepping && mouse && !zoomOn && "The arrow keys, or a presentation clicker, step too."}
                </>
              )}
            </span>
            {zoomOn && (
              <button className="zoom-reset" {...tour("Reset zoom", "Back to the whole sweep.")} onClick={() => (tab === "clamp" ? setClampX(null) : setSpikeX(null))}>Reset zoom</button>
            )}
            {(tab === "spike" || !iv) && (
              <button className={`measure-btn${measure ? " on" : ""}`} aria-pressed={measure} aria-label="measuring cursor" onClick={toggleMeasure}
                {...tour("Cursor", "Tap a trace to read time, voltage and currents; drag the line to move it. Zoom still works.")}>Cursor</button>
            )}
            <button className={`measure-btn${focus ? " on" : ""}`} aria-pressed={focus} aria-label="focus on the traces" onClick={toggleFocus}
              {...tour("Focus", "Hide the curves and give the traces the screen, for a projector.")}>Focus</button>
          </div>
        </section>
      </main>

      <aside className="controls" aria-label="parameters">
        <div className="chips" role="tablist" {...tour("What to edit", "A gate, the sodium or potassium channel, the membrane, or the protocol. A dot marks what you have changed.")}>
          {chips.map((c) => (
            <button key={c.id} role="tab" aria-selected={sel === c.id} className={`chip${sel === c.id ? " on" : ""}${edited(c.id) ? " dirty" : ""}`} onClick={() => pick(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="panel" ref={panelRef} {...tour("Sliders", "Drag, or tap − and +. Everything above follows at once; gray marks the stock value.", { kind: "slider" })}>
          {controls}
          <div className="resets" {...tour("Reset", "Put one thing back, or everything.")}>
            <button onClick={resetSel} disabled={!edited(sel)}>Reset {chips.find((c) => c.id === sel)!.label}</button>
            <button onClick={() => { setP(stockParams()); setVp(DEFAULT_V); setIp(DEFAULT_I); setVBase(DEFAULT_V); setIBase(DEFAULT_I); }} disabled={!anyEdited}>Reset all</button>
          </div>
        </div>
      </aside>

      {touring && <Tour onEnd={() => setTouring(false)} />}
      {about && (
        <div className="about" role="dialog" aria-modal="true" aria-label="why HHhero" onClick={() => setAbout(false)}>
          <div className="about-card" onClick={(e) => e.stopPropagation()}>
            <h2>Action potentials</h2>
            <p className="byline">
              By Tony DeFazio, from his <a href="https://gaba.tonydefazio.com/explainer">introduction</a> for gaba_excites
            </p>
            <p>
              Action potentials are the fundamental unit of neuron activity.<sup>*</sup> Your brain is built from neurons,
              glia<sup>**</sup>, and the connections between them, plus the blood vessels that deliver oxygen and nutrients
              while taking away waste. When many neurons are active together, their combined electrical activity can be
              picked up by electrodes on the scalp: that is an EEG (electroencephalogram). Patterns among neurons are
              necessary for sleep, cognition, and also allow detection of abnormal activity during epileptic seizures and
              other neurological problems. All of these depend on action potentials.
            </p>
            <p>
              Action potentials are a change in voltage in the neuron. If you stick your finger in an electrical outlet, you
              get a very strong jolt of electricity. Wires carry electrons and the potential difference between the outlet
              wires is what powers your cell phone charger, your TV, your lights. In neurons, ions carry the charge. These are
              sodium, potassium, calcium, and chloride (plus many others, but these are the main ones). Neurons keep the
              concentration of ions different from the outside: sodium, calcium, and chloride are high outside the cell and
              low inside, the opposite is true for potassium (an introduction:{" "}
              <a href="https://openstax.org/books/anatomy-and-physiology-2e/pages/12-4-the-action-potential">
                OpenStax, <cite>Anatomy and Physiology 2e</cite>, section 12.4
              </a>
              ; to watch how cells build and keep these differences:{" "}
              <a href="https://ionhomie.tonydefazio.com/"><cite>ionhomie</cite></a>). The channels in this story each allow
              only one type of ion to flow through: sodium channels, potassium channels, etc. The channels that make the
              action potential have gates that constantly open and close, but the probability of their opening or closing is
              dependent on the voltage of the cell. Neurons sit at a negative voltage at rest because of the ion gradients and
              the channels open at rest. When a sodium channel opens, sodium rushes into the cell. Sodium is positively
              charged, so the inside of the neuron becomes less negative, and briefly positive. Potassium channels open when
              the neuron becomes less negative. Potassium is also positively charged, but the electrical and concentration
              gradient drives the potassium out of the cell, making the inside negative again. This interaction between
              sodium and potassium is how action potentials work. Scientists call “less negative” depolarized and “more
              negative” hyperpolarized; you’ll see those words in the simulator.
            </p>
            <p className="fn">
              * future projects are planned to address action potential independent activity…
              <br />
              ** glia is a name for many other non-neuronal cell types in the brain. These cells have many roles and are
              crucial for normal brain activity. You can’t build a brain with just neurons.
            </p>

            <h3>Where this site fits</h3>
            <p>
              Those gates were first worked out in 1952, by Alan Hodgkin and Andrew Huxley, in the giant axon of the squid.
              They held the membrane at one voltage after another, measured the sodium and potassium currents, and wrote
              equations for how each channel's gates open and close. Put together, with nothing else added, the equations
              made an action potential. Nearly every model of a neuron since is built the same way.
            </p>
            <p>
              HHhero is about one idea in those equations: how a gate is written. Hodgkin and Huxley wrote each gate as two
              rates: α, how fast it opens, and β, how fast it closes. Most models since write the same gate as where it
              settles, x∞, and how fast it gets there, τ. The two are the same thing:
            </p>
            <p className="eq">x∞ = α / (α + β) &nbsp;&nbsp; τ = 1 / (φ(α + β))<br />α = x∞ / τ &nbsp;&nbsp; β = (1 − x∞) / τ</p>
            <p>
              The switch at the top changes which pair you edit, never the model. In the α, β view every constant moves both
              x∞ and τ; in the x∞, τ view you can move one and leave the other. Each view keeps its own edits, and a gate
              edited in the other view says so. Edit a gate and watch the voltage-clamp currents and the action potential
              change.{SHOW_1952 && " On a wide screen, the 1952 button re-runs figures from Hodgkin and Huxley's paper itself."}
            </p>
            <p>
              It is designed for a lecture: students on their phones, the lecturer projecting the same page at the front. On a
              phone, the plot and the control you are moving stay on screen together. On a big screen, Step walks the sweeps
              one at a time (a presentation clicker steps too), and Focus gives the traces the whole screen.
            </p>
            <p>
              <a href="https://gaba.tonydefazio.com">gaba_excites</a>, the site this one grew from, puts channels like these
              into whole neurons with synapses, recorded as a current-clamp rig would, and asks what decides whether, and how
              often, a neuron fires. For the
              biophysics, Francisco Bezanilla's <a href="https://nerve.bsd.uchicago.edu/"><cite>The Nerve Impulse</cite></a>{" "}
              and its simulators are the classic.
            </p>

            <h3>The model</h3>
            <p>
              The space-clamped squid axon of Hodgkin &amp; Huxley (1952) J Physiol 117:500–544,{" "}
              <a href="https://doi.org/10.1113/jphysiol.1952.sp004764">doi:10.1113/jphysiol.1952.sp004764</a>, in the modern
              sign (rest −65 mV, depolarization positive). With nothing edited it is NEURON's built-in hh mechanism: the tests
              hold it to NEURON's spike times on 21 current steps. Everything here is the model alone, with no electrode: what
              no rig can record.
            </p>
            <p>
              The code is open, MIT licensed, on GitHub:{" "}
              <a href="https://github.com/syncytium2/HHhero">github.com/syncytium2/HHhero</a>.
            </p>
            <h3>Versions</h3>
            <p className="versions">
              {ARCHIVED ? (
                <>This is an earlier version, v{VERSION}. <a href="/">Go to the current version</a>.</>
              ) : (
                <>This is v{VERSION}, the current version.</>
              )}
              {EARLIER.length > 0 && !ARCHIVED && (
                <>
                  {" "}If something stopped working, the previous ones are still here:{" "}
                  {EARLIER.map((e, j) => (
                    <span key={e.version}>
                      {j > 0 && ", "}
                      <a href={`/v/${e.version}/`}>v{e.version}</a> ({e.date})
                    </span>
                  ))}
                  .
                </>
              )}
            </p>
            <p className="muted">
              HHhero v{VERSION} · born {BORN.slice(0, 10)} ·{" "}
              <a href="https://github.com/syncytium2/HHhero">GitHub</a>
            </p>
            <p className="muted">By <a href="https://tonydefazio.com/">Tony DeFazio</a>, tonydefazio.com</p>
            <button onClick={() => setAbout(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
