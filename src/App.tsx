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
import { clampView, isFull, type Range } from "./ui/zoom.ts";
import {
  fmt, GATE_IDS, infEdited, NO_EDIT, rateEdited, rateFormula, STOCK_RATES, stockGate, tauEdited,
  type GateId, type GateParams, type Rate,
} from "./core/rates.ts";
import { buildModel, stockParams, type Model, type Params } from "./core/model.ts";
import {
  clampFamily, DEFAULT_CLAMP, DEFAULT_STIM, evenLadder, fires, freeRun, niceStep, pulseThreshold, settle, testPotentials, thresholdLadder,
  type ClampProtocol, type Stimulus,
} from "./core/sim.ts";
import { noteFor, type View } from "./core/notes.ts";
import { BORN, VERSION } from "./version.ts";

type Sel = GateId | "na" | "k" | "mem" | "proto";
type SimTab = "clamp" | "spike";
interface LadderSpec { first: number; by: number; count: number }

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
function spike(md: Model, stim: Stimulus) {
  const st = settle(md, stim.hold, SETTLE_MS, DT);
  return freeRun(md, stim, st, DT, 5);
}

export function App() {
  const [p, setP] = useState<Params>(stockParams);
  const [view, setView] = useState<View>("ab");
  const [sel, setSel] = useState<Sel>("m");
  // the gates drawn on the curve plots: any combination, toggled on and off
  const [shown, setShown] = useState<GateId[]>(["m"]);
  const [logY, setLogY] = useState(false);
  const [tab, setTab] = useState<SimTab>("clamp");
  const [clampTrace, setClampTrace] = useState<"iNa" | "iK" | "iv">("iNa");
  const [spikeTrace, setSpikeTrace] = useState<"i" | "g" | "gates">("i");
  const [clamp, setClamp] = useState<ClampProtocol>(DEFAULT_CLAMP);
  const [stim, setStim] = useState<Stimulus>(DEFAULT_STIM);
  const [cursor, setCursor] = useState(-40);
  const [about, setAbout] = useState(false);
  const [clampX, setClampX] = useState<Range | null>(null);
  // stepping through: one sweep at a time, forward and back, for teaching from the front of a room
  const [stepping, setStepping] = useState(false);
  const [clampK, setClampK] = useState(0);
  const [spikeK, setSpikeK] = useState(0);
  // the pulses to step through: null is the ladder built around this cell's threshold
  const [ladderSpec, setLadderSpec] = useState<LadderSpec | null>(null);
  const [spikeX, setSpikeX] = useState<Range | null>(null);
  const wide = useWide();
  // a mouse or trackpad (hover and a fine pointer) gets the desktop zoom hint; touch gets the gestures
  const mouse = useMedia("(hover: hover) and (pointer: fine)");
  // a new view or chip starts at the top of the panel, where the notes are
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (panelRef.current) panelRef.current.scrollTop = 0; }, [view, sel]);

  const md = useMemo(() => buildModel(p), [p]);
  const cv = useMemo(() => ({ m: curves(md, "m"), h: curves(md, "h"), n: curves(md, "n") }), [md]);
  const fam = useMemo(() => clampFamily(md, clamp), [md, clamp]);
  const famStock = useMemo(() => clampFamily(STOCK_MODEL, clamp), [clamp]);
  const sweepMs = Math.max(40, stim.start + stim.dur + 25);
  const ap = useMemo(() => spike(md, { ...stim, sweep: sweepMs }), [md, stim, sweepMs]);
  const apStock = useMemo(() => spike(STOCK_MODEL, { ...stim, sweep: sweepMs }), [stim, sweepMs]);

  // the pulses to step through: even steps up to this cell's threshold, then across it; or your own
  const ladder = useMemo(() => {
    if (!stepping || tab !== "spike") return null;
    const st = { ...stim, sweep: sweepMs };
    const from = settle(md, st.hold, SETTLE_MS, DT);
    const thr = pulseThreshold(md, st, from, DT);
    const base = ladderSpec ? evenLadder(ladderSpec.first, ladderSpec.by, ladderSpec.count) : thresholdLadder(thr, st.amp);
    const rungs = base.map((r) => ({
      ...r,
      fired: fires(md, { ...st, amp: r.amp }, from, DT),
      run: freeRun(md, { ...st, amp: r.amp }, from, DT, 5),
    }));
    return { thr, rungs };
  }, [md, stim, sweepMs, stepping, tab, ladderSpec]);
  // the even part of the threshold ladder, as a starting point for your own
  const autoSpec = useMemo((): LadderSpec | null => {
    if (sel !== "proto") return null;
    const st = { ...stim, sweep: sweepMs };
    const thr = pulseThreshold(md, st, settle(md, st.hold, SETTLE_MS, DT), DT);
    if (thr === null) { const a = Math.abs(stim.amp || 1) / 4; return { first: a, by: a, count: 4 }; }
    const d = niceStep(thr / 6);
    return { first: d, by: d, count: Math.floor(thr / d) + 2 };
  }, [sel, md, stim, sweepMs]);
  const nSteps = tab === "clamp" ? fam.length : ladder?.rungs.length ?? 1;
  const k = Math.min(tab === "clamp" ? clampK : spikeK, nSteps - 1);
  const go = (d: number) => (tab === "clamp" ? setClampK : setSpikeK)(Math.max(0, Math.min(nSteps - 1, k + d)));
  const rung = ladder ? ladder.rungs[k] : null;
  const rungAmp = rung?.amp;
  const rungStock = useMemo(
    () => (rungAmp === undefined ? null : spike(STOCK_MODEL, { ...stim, sweep: sweepMs, amp: rungAmp })),
    [rungAmp, stim, sweepMs],
  );
  const apShown = rung ? rung.run : ap;
  const apStockShown = rungStock ?? apStock;
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
    if (!stepping) { setClampK(0); setSpikeK(0); }
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
    return JSON.stringify(clamp) !== JSON.stringify(DEFAULT_CLAMP) || JSON.stringify(stim) !== JSON.stringify(DEFAULT_STIM) || ladderSpec !== null;
  };
  const anyEdited = (["m", "h", "n", "na", "k", "mem", "proto"] as Sel[]).some(edited);

  const H = wide
    ? { curve: 260, strip: 72, sim: 280, v: 170, sim2: 180 }
    : { curve: 132, strip: 46, sim: 124, v: 64, sim2: 80 };

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
  const clampFull: Range = [0, clamp.pre + clamp.dur];
  const spikeFull: Range = [0, sweepMs];
  // the reset lives in the caption, not over a plot
  const clampZoom = { view: clampView(clampX ?? clampFull, clampFull, 0.5), onView: setClampX, minSpan: 0.5, button: false };
  const spikeZoom = { view: clampView(spikeX ?? spikeFull, spikeFull, 1), onView: setSpikeX, minSpan: 1, button: false };
  const zoomOn = tab === "clamp" ? clampTrace !== "iv" && !isFull(clampZoom.view, clampFull) : !isFull(spikeZoom.view, spikeFull);

  // the protocol strip: what the experimenter commands, on the traces' time axis
  const steps = fam.map((s) => s.v);
  const protocol =
    tab === "clamp" ? (
      <Plot
        height={H.strip}
        ariaLabel="voltage-clamp protocol"
        x={clampFull}
        zoom={clampZoom}
        noXTicks
        yInclude={[clamp.hold, clamp.from, clamp.to]}
        yLabel={`command V (mV): hold ${fmt(clamp.hold)}, steps ${fmt(clamp.from)} to ${fmt(clamp.to)} by ${fmt(clamp.by)}`}
        series={upTo(steps).map((v, j) => ({
          x: [0, clamp.pre, clamp.pre, clamp.pre + clamp.dur],
          y: [clamp.hold, clamp.hold, v, v],
          color: C.ink,
          width: bold(j) ?? 1.2,
          opacity: fade(j),
        }))}
      />
    ) : (
      <Plot
        height={H.strip}
        ariaLabel="current pulse protocol"
        x={spikeFull}
        zoom={spikeZoom}
        noXTicks
        yInclude={[0, stim.hold, ...(ladder ? ladder.rungs.map((r) => stim.hold + r.amp) : [stim.hold + stim.amp])]}
        yLabel={`injected I (µA/cm²): ${fmt(rungAmp ?? stim.amp)} for ${fmt(stim.dur)} ms at ${fmt(stim.start)} ms`}
        series={(ladder ? ladder.rungs.slice(0, k + 1).map((r) => r.amp) : [stim.amp]).map((a, j) => ({
          x: [0, stim.start, stim.start, stim.start + stim.dur, stim.start + stim.dur, sweepMs],
          y: [stim.hold, stim.hold, stim.hold + a, stim.hold + a, stim.hold, stim.hold],
          color: C.ink,
          width: ladder ? bold(j) ?? 1.2 : 1.4,
          opacity: ladder ? fade(j) : 1,
        }))}
      />
    );

  let simPlot;
  if (tab === "clamp") {
    if (clampTrace === "iv") {
      // stepping builds the curve a point at a time, on the axes the whole family needs
      const vs = upTo(fam.map((s) => s.v));
      const pk = (f: typeof fam, which: "iNaPeak" | "iKEnd") => upTo(f.map((s) => s[which] / 1000));
      simPlot = (
        <Plot
          height={H.sim}
          ariaLabel="current-voltage relation"
          x={[clamp.from - 5, clamp.to + 5]}
          zeroLine
          yInclude={extent([fam, famStock].flatMap((f) => [f.map((s) => s.iNaPeak / 1000), f.map((s) => s.iKEnd / 1000)]))}
          xLabel="test potential (mV)"
          yLabel="I (mA/cm²)"
          series={[
            { x: vs, y: pk(famStock, "iNaPeak"), color: C.stock, width: 3 },
            { x: vs, y: pk(famStock, "iKEnd"), color: C.stock, width: 3, dash: "5 4" },
            { x: vs, y: pk(fam, "iNaPeak"), color: C.na, label: "INa peak", dots: stepping },
            { x: vs, y: pk(fam, "iKEnd"), color: C.k, dash: "5 4", label: "IK end", dots: stepping },
          ]}
        />
      );
    } else {
      const key = clampTrace;
      const col = key === "iNa" ? C.na : C.k;
      simPlot = (
        <Plot
          height={H.sim}
          ariaLabel={key === "iNa" ? "sodium current family" : "potassium current family"}
          x={clampFull}
          zoom={clampZoom}
          zeroLine
          yInclude={stepping ? extent([...fam, ...famStock].map((s) => mA(s[key]))) : [0]}
          xLabel="ms"
          yLabel={`${key === "iNa" ? "INa" : "IK"} (mA/cm²)`}
          series={[
            ...(stepping ? [famStock[k]] : famStock).map((s) => ({ x: s.t, y: mA(s[key]), color: C.stock, width: 2.5 }) as Series),
            ...upTo(fam).map((s, j) => ({ x: s.t, y: mA(s[key]), color: col, width: bold(j) ?? 1.4, opacity: fade(j) }) as Series),
          ]}
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
          noXTicks
          yInclude={[-80, 40]}
          yLabel="V (mV)"
          series={[
            { x: apStock.t, y: apStock.v, color: C.stock, width: 3 },
            ...(ladder ? ladder.rungs.slice(0, k).map((r) => ({ x: r.run.t, y: r.run.v, color: C.ink, width: 1.2, opacity: 0.25 }) as Series) : []),
            { x: ap.t, y: ap.v, color: C.ink, label: "V", width: ladder ? 2.2 : undefined },
          ]}
        />
        <Plot
          height={H.sim2}
          ariaLabel={spikeTrace === "gates" ? "gates during the action potential" : "currents during the action potential"}
          x={spikeFull}
          zoom={spikeZoom}
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

  // what this step is, in words
  let stepText = "";
  if (stepping && tab === "clamp") {
    stepText = `Step ${k + 1} of ${nSteps}: ${fmt(clamp.hold)} → ${fmt(fam[k].v)} mV`;
  } else if (stepping && ladder) {
    const r = ladder.rungs[k];
    const head = `Pulse ${k + 1} of ${nSteps}: ${fmt(r.amp)} µA/cm², ${r.fired ? "spike" : "no spike"}`;
    const thr = ladder.thr === null ? "" : `Threshold is ${fmt(ladder.thr)} µA/cm².`;
    const firstToFire = r.fired && (k === 0 || !ladder.rungs[k - 1].fired);
    stepText =
      r.role === "under" ? `${head}, 1% under threshold.`
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
    controls = (
      <>
        <fieldset className="group">
          <legend className="formula">Voltage clamp: hold, then {testPotentials(clamp).length} steps from {fmt(clamp.from)} to {fmt(clamp.to)} mV by {fmt(clamp.by)}</legend>
          <Slider label="holding potential" unit="mV" value={clamp.hold} min={-120} max={-30} step={1} stock={DEFAULT_CLAMP.hold} onChange={(v) => setClamp({ ...clamp, hold: v })} />
          <Slider label="first step" unit="mV" value={clamp.from} min={-120} max={80} step={1} stock={DEFAULT_CLAMP.from} onChange={(v) => setClamp({ ...clamp, from: Math.min(v, clamp.to) })} />
          <Slider label="last step" unit="mV" value={clamp.to} min={-120} max={80} step={1} stock={DEFAULT_CLAMP.to} onChange={(v) => setClamp({ ...clamp, to: Math.max(v, clamp.from) })} />
          <Slider label="step spacing" unit="mV" value={clamp.by} min={1} max={50} step={1} stock={DEFAULT_CLAMP.by} onChange={(v) => setClamp({ ...clamp, by: Math.max(1, v) })} />
          <Slider label="step length" unit="ms" value={clamp.dur} min={2} max={50} step={1} stock={DEFAULT_CLAMP.dur} onChange={(v) => setClamp({ ...clamp, dur: v })} />
        </fieldset>
        <fieldset className="group">
          <legend className="formula">Action potential: a current pulse at {fmt(stim.start)} ms</legend>
          <Slider label="pulse amplitude" unit="µA/cm²" value={stim.amp} min={-50} max={200} step={0.5} stock={DEFAULT_STIM.amp} onChange={(v) => setStim({ ...stim, amp: v })} />
          <Slider label="pulse length" unit="ms" value={stim.dur} min={0.05} max={50} log stock={DEFAULT_STIM.dur} onChange={(v) => setStim({ ...stim, dur: v })} />
          <Slider label="holding current" unit="µA/cm²" value={stim.hold} min={-20} max={20} step={0.1} stock={DEFAULT_STIM.hold} onChange={(v) => setStim({ ...stim, hold: v })} />
        </fieldset>
        <fieldset className="group">
          <legend className="formula">
            Step through the action potential:{" "}
            {ladderSpec
              ? `${fmt(ladderSpec.count)} pulses, ${fmt(ladderSpec.first)} to ${fmt(ladderSpec.first + (ladderSpec.count - 1) * ladderSpec.by)} µA/cm²`
              : "even steps up to threshold, then 1% under, 1% over, twice"}
          </legend>
          <div className="ladder-pick" role="radiogroup" aria-label="pulses to step through">
            <button role="radio" aria-checked={!ladderSpec} className={!ladderSpec ? "on" : ""} onClick={() => setLadderSpec(null)}>Around threshold</button>
            <button role="radio" aria-checked={!!ladderSpec} className={ladderSpec ? "on" : ""} onClick={() => !ladderSpec && autoSpec && setLadderSpec(autoSpec)}>My own</button>
          </div>
          {ladderSpec && autoSpec && (
            <>
              <Slider label="first pulse" unit="µA/cm²" value={ladderSpec.first} min={0} max={200} step={0.1} stock={autoSpec.first} onChange={(v) => setLadderSpec({ ...ladderSpec, first: v })} />
              <Slider label="step size" unit="µA/cm²" value={ladderSpec.by} min={-50} max={50} step={0.1} stock={autoSpec.by} onChange={(v) => setLadderSpec({ ...ladderSpec, by: v })} />
              <Slider label="pulses" value={ladderSpec.count} min={2} max={20} integer stock={autoSpec.count} onChange={(v) => setLadderSpec({ ...ladderSpec, count: v })} />
            </>
          )}
          <p className="hint">Pulse length and holding current come from above. Turn on Step over the traces to walk through them.</p>
        </fieldset>
      </>
    );
  }

  const resetSel = () => {
    if (sel === "m" || sel === "h" || sel === "n") setGateP(sel, () => stockGate(sel));
    else if (sel === "na") setP({ ...p, gNa: STOCK.gNa, eNa: STOCK.eNa, pm: STOCK.pm, ph: STOCK.ph });
    else if (sel === "k") setP({ ...p, gK: STOCK.gK, eK: STOCK.eK, pn: STOCK.pn });
    else if (sel === "mem") setP({ ...p, celsius: STOCK.celsius, gL: STOCK.gL, eL: STOCK.eL, cm: STOCK.cm });
    else { setClamp(DEFAULT_CLAMP); setStim(DEFAULT_STIM); setLadderSpec(null); }
  };

  const chips: { id: Sel; label: string }[] = [
    { id: "m", label: "m" }, { id: "h", label: "h" }, { id: "n", label: "n" },
    { id: "na", label: "Na" }, { id: "k", label: "K" }, { id: "mem", label: "Membrane" }, { id: "proto", label: "Protocol" },
  ];

  return (
    <div className={`app${wide ? " wide" : ""}`}>
      <header className="top">
        <h1>HH<span>hero</span></h1>
        <div className="switch" role="radiogroup" aria-label="formulation">
          <button role="radio" aria-checked={view === "ab"} className={view === "ab" ? "on" : ""} onClick={() => setView("ab")}>α, β</button>
          <button role="radio" aria-checked={view === "it"} className={view === "it" ? "on" : ""} onClick={() => setView("it")}>x∞, τ</button>
        </div>
        <button className="about-btn" aria-label="about" onClick={() => setAbout(true)}>?</button>
      </header>

      <main className="plots">
        <section className="card curves" aria-label="gate curves">
          <div className="card-head">
            <span className="gate-pick">
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
            <button className={`log-btn${logY ? " on" : ""}`} aria-pressed={logY} aria-label="log scale" onClick={() => setLogY(!logY)}>log</button>
            <span className="muted">{fmt(p.celsius)} °C · gray = stock</span>
          </div>
          {curvePlots}
          {readout}
        </section>

        <section className="card sim" aria-label="simulation">
          <div className="card-head">
            <span className="tabs">
              <button className={tab === "clamp" ? "on" : ""} aria-label="Voltage clamp" onClick={() => setTab("clamp")}>{wide ? "Voltage clamp" : "Clamp"}</button>
              <button className={tab === "spike" ? "on" : ""} aria-label="Spike (action potential)" onClick={() => setTab("spike")}>{wide ? "Action potential" : "Spike"}</button>
            </span>
            <button className={`step-btn${stepping ? " on" : ""}`} aria-pressed={stepping} aria-label="step through" onClick={toggleStepping}>Step</button>
            <span className="tabs small">
              {tab === "clamp"
                ? (["iNa", "iK", "iv"] as const).map((k) => (
                    <button key={k} className={clampTrace === k ? "on" : ""} onClick={() => setClampTrace(k)}>{k === "iNa" ? "INa" : k === "iK" ? "IK" : "I–V"}</button>
                  ))
                : (["i", "g", "gates"] as const).map((k) => (
                    <button key={k} className={spikeTrace === k ? "on" : ""} onClick={() => setSpikeTrace(k)}>{k === "i" ? "I" : k === "g" ? "g" : "m h n"}</button>
                  ))}
            </span>
          </div>
          {(tab === "spike" || clampTrace !== "iv") && protocol}
          {simPlot}
          {stepping && (
            <div className="stepper" role="group" aria-label="steps">
              <button aria-label="previous step" disabled={k === 0} onClick={() => go(-1)}>‹</button>
              <span className="step-text" aria-live="polite">{stepText}</span>
              <button aria-label="next step" disabled={k === nSteps - 1} onClick={() => go(1)}>›</button>
            </div>
          )}
          {(!stepping || zoomOn || mouse) && (
            <p className="caption">
              {!stepping && (tab === "clamp" ? "Ideal clamp, no electrode: what no rig records." : "The membrane alone, no electrode.")}
              {!stepping && (tab === "spike" || clampTrace !== "iv") && !zoomOn && (mouse ? " Drag across the traces or scroll to zoom time; double-click to reset." : " Pinch to zoom time, drag to pan, double-tap to reset.")}
              {stepping && mouse && !zoomOn && "The arrow keys, or a presentation clicker, step too."}
              {zoomOn && (
                <button className="zoom-reset" onClick={() => (tab === "clamp" ? setClampX(null) : setSpikeX(null))}>Reset zoom</button>
              )}
            </p>
          )}
        </section>
      </main>

      <aside className="controls" aria-label="parameters">
        <div className="chips" role="tablist">
          {chips.map((c) => (
            <button key={c.id} role="tab" aria-selected={sel === c.id} className={`chip${sel === c.id ? " on" : ""}${edited(c.id) ? " dirty" : ""}`} onClick={() => pick(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="panel" ref={panelRef}>
          {controls}
          <div className="resets">
            <button onClick={resetSel} disabled={!edited(sel)}>Reset {chips.find((c) => c.id === sel)!.label}</button>
            <button onClick={() => { setP(stockParams()); setClamp(DEFAULT_CLAMP); setStim(DEFAULT_STIM); setLadderSpec(null); }} disabled={!anyEdited}>Reset all</button>
          </div>
        </div>
      </aside>

      {about && (
        <div className="about" role="dialog" aria-modal="true" aria-label="about HHhero" onClick={() => setAbout(false)}>
          <div className="about-card" onClick={(e) => e.stopPropagation()}>
            <h2>One model, two ways to hold it</h2>
            <p>
              Hodgkin and Huxley wrote each gate as two rates: α, how fast it opens, and β, how fast it closes. Most models
              since write the same gate as where it settles, x∞, and how fast it gets there, τ. The two are the same thing:
            </p>
            <p className="eq">x∞ = α / (α + β) &nbsp;&nbsp; τ = 1 / (φ(α + β))<br />α = x∞ / τ &nbsp;&nbsp; β = (1 − x∞) / τ</p>
            <p>
              The switch at the top changes which pair you edit, never the model. In the α, β view every constant moves both
              x∞ and τ; in the x∞, τ view you can move one and leave the other. Each view keeps its own edits, and a gate
              edited in the other view says so.
            </p>
            <p>
              The model is the space-clamped squid axon of Hodgkin &amp; Huxley (1952) J Physiol 117:500–544,{" "}
              <a href="https://doi.org/10.1113/jphysiol.1952.sp004764">doi:10.1113/jphysiol.1952.sp004764</a>, in the modern
              sign (rest −65 mV, depolarization positive). With nothing edited it is NEURON's built-in hh mechanism: the tests
              hold it to NEURON's spike times on 21 current steps. Everything here is the model alone, with no electrode: what
              no rig can record.
            </p>
            <p className="muted">
              HHhero v{VERSION} · born {BORN.slice(0, 10)} ·{" "}
              <a href="https://github.com/syncytium2/HHhero">source</a> · from{" "}
              <a href="https://gaba.tonydefazio.com">gaba_excites</a>
            </p>
            <button onClick={() => setAbout(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
