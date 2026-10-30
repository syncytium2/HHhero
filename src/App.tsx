/**
 * HHhero: the Hodgkin–Huxley gates, two ways.
 *
 * One model and two sets of controls. The switch at the top chooses whether
 * a gate is edited as its rates (α, β: Hodgkin & Huxley's own form) or as its
 * steady state and time constant (x∞, τ: the form most later models use).
 * Flipping it never changes the model; it changes what you hold. Each view
 * keeps its own edits, and the other view's are shown, never hidden.
 */
import { useEffect, useMemo, useState } from "react";
import { Plot, type Series } from "./ui/Plot.tsx";
import { Slider } from "./ui/Slider.tsx";
import {
  fmt, GATE_IDS, infEdited, NO_EDIT, rateEdited, rateFormula, STOCK_RATES, stockGate, tauEdited,
  type GateId, type GateParams, type Rate,
} from "./core/rates.ts";
import { buildModel, stockParams, type Model, type Params } from "./core/model.ts";
import { clampFamily, DEFAULT_CLAMP, DEFAULT_STIM, freeRun, settle, type ClampProtocol, type Stimulus } from "./core/sim.ts";
import { noteFor, type View } from "./core/notes.ts";
import { BORN, VERSION } from "./version.ts";

type Sel = GateId | "na" | "k" | "mem" | "proto";
type SimTab = "clamp" | "spike";

const STOCK = stockParams();
const STOCK_MODEL = buildModel(STOCK);
const VGRID = Float64Array.from({ length: 301 }, (_, i) => -100 + i * 0.5);
const C = {
  m: "var(--m)", h: "var(--h)", n: "var(--n)", na: "var(--na)", k: "var(--k)",
  ink: "var(--ink)", stock: "var(--stock)",
};
const SUB: Record<GateId, string> = { m: "m", h: "h", n: "n" };

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

const SETTLE_MS = 50, DT = 0.01;
function spike(md: Model, stim: Stimulus) {
  const st = settle(md, stim.hold, SETTLE_MS, DT);
  return freeRun(md, stim, st, DT, 5);
}

export function App() {
  const [p, setP] = useState<Params>(stockParams);
  const [view, setView] = useState<View>("ab");
  const [sel, setSel] = useState<Sel>("m");
  const [gate, setGate] = useState<GateId>("m");
  const [tab, setTab] = useState<SimTab>("clamp");
  const [clampTrace, setClampTrace] = useState<"iNa" | "iK" | "iv">("iNa");
  const [spikeTrace, setSpikeTrace] = useState<"i" | "g" | "gates">("i");
  const [clamp, setClamp] = useState<ClampProtocol>(DEFAULT_CLAMP);
  const [stim, setStim] = useState<Stimulus>(DEFAULT_STIM);
  const [cursor, setCursor] = useState(-40);
  const [about, setAbout] = useState(false);
  const wide = useWide();

  const md = useMemo(() => buildModel(p), [p]);
  const cv = useMemo(() => curves(md, gate), [md, gate]);
  const cs = useMemo(() => curves(STOCK_MODEL, gate), [gate]);
  const fam = useMemo(() => clampFamily(md, clamp), [md, clamp]);
  const famStock = useMemo(() => clampFamily(STOCK_MODEL, clamp), [clamp]);
  const sweepMs = Math.max(40, stim.start + stim.dur + 25);
  const ap = useMemo(() => spike(md, { ...stim, sweep: sweepMs }), [md, stim, sweepMs]);
  const apStock = useMemo(() => spike(STOCK_MODEL, { ...stim, sweep: sweepMs }), [stim, sweepMs]);

  const pick = (s: Sel) => { setSel(s); if (s === "m" || s === "h" || s === "n") setGate(s); };
  const setGateP = (id: GateId, f: (g: GateParams) => GateParams) => setP((q) => ({ ...q, gates: { ...q.gates, [id]: f(q.gates[id]) } }));
  const setRate = (id: GateId, which: "alpha" | "beta", key: keyof Omit<Rate, "kind">, v: number) =>
    setGateP(id, (g) => ({ ...g, [which]: { ...g[which], [key]: v } }));
  const setIT = (id: GateId, key: keyof typeof NO_EDIT, v: number) => setGateP(id, (g) => ({ ...g, it: { ...g.it, [key]: v } }));

  const edited = (s: Sel): boolean => {
    if (s === "m" || s === "h" || s === "n") return rateEdited(p.gates[s], s) || infEdited(p.gates[s].it) || tauEdited(p.gates[s].it);
    if (s === "na") return p.gNa !== STOCK.gNa || p.eNa !== STOCK.eNa || p.pm !== STOCK.pm || p.ph !== STOCK.ph;
    if (s === "k") return p.gK !== STOCK.gK || p.eK !== STOCK.eK || p.pn !== STOCK.pn;
    if (s === "mem") return p.celsius !== STOCK.celsius || p.gL !== STOCK.gL || p.eL !== STOCK.eL || p.cm !== STOCK.cm;
    return JSON.stringify(clamp) !== JSON.stringify(DEFAULT_CLAMP) || JSON.stringify(stim) !== JSON.stringify(DEFAULT_STIM);
  };
  const anyEdited = (["m", "h", "n", "na", "k", "mem", "proto"] as Sel[]).some(edited);

  const g = md.g[gate];
  const gp = p.gates[gate];
  const H = wide
    ? { curve: 260, sim: 300, sim2: 200 }
    : { curve: 150, sim: 170, sim2: 92 };

  // ------------------------------------------------------------ curves
  const curvePlots =
    view === "ab" ? (
      <Plot
        height={H.curve}
        ariaLabel={`alpha and beta of ${gate}`}
        x={[-100, 50]}
        yInclude={[0]}
        xLabel="mV"
        yLabel={`α${SUB[gate]}, β${SUB[gate]} (1/ms)`}
        cursor={cursor}
        onCursor={setCursor}
        series={[
          { x: VGRID, y: cs.a, color: C.stock, width: 3 },
          { x: VGRID, y: cs.b, color: C.stock, width: 3, dash: "5 4" },
          { x: VGRID, y: cv.a, color: C[gate], label: "α" },
          { x: VGRID, y: cv.b, color: C[gate], dash: "5 4", label: "β" },
        ]}
      />
    ) : (
      <div className="pair">
        <Plot
          height={H.curve}
          ariaLabel={`steady state of ${gate}`}
          x={[-100, 50]}
          y={[-0.04, 1.04]}
          xLabel="mV"
          yLabel={`${SUB[gate]}∞`}
          cursor={cursor}
          onCursor={setCursor}
          series={[
            { x: VGRID, y: cs.inf, color: C.stock, width: 3 },
            { x: VGRID, y: cv.inf, color: C[gate], label: `${SUB[gate]}∞` },
          ]}
        />
        <Plot
          height={H.curve}
          ariaLabel={`time constant of ${gate}`}
          x={[-100, 50]}
          yInclude={[0]}
          xLabel="mV"
          yLabel={`τ${SUB[gate]} (ms)`}
          cursor={cursor}
          onCursor={setCursor}
          series={[
            { x: VGRID, y: cs.tau, color: C.stock, width: 3 },
            { x: VGRID, y: cv.tau, color: C[gate], label: "τ" },
          ]}
        />
      </div>
    );
  const readout = (
    <p className="readout" aria-live="polite">
      <b>{fmt(cursor)} mV</b> · α {fmt(g.alpha(cursor))} · β {fmt(g.beta(cursor))} /ms · {SUB[gate]}∞ {fmt(g.inf(cursor))} · τ {fmt(g.tau(cursor))} ms
    </p>
  );

  // ------------------------------------------------------------ simulation
  const mA = (a: Float64Array) => a.map((x) => x / 1000);
  const n = fam.length;
  const shade = (k: number) => 0.35 + (0.65 * k) / Math.max(1, n - 1);
  let simPlot;
  if (tab === "clamp") {
    if (clampTrace === "iv") {
      const vs = fam.map((s) => s.v);
      simPlot = (
        <Plot
          height={H.sim}
          ariaLabel="current-voltage relation"
          x={[clamp.from - 5, clamp.to + 5]}
          zeroLine
          yInclude={[0]}
          xLabel="test potential (mV)"
          yLabel="I (mA/cm²)"
          series={[
            { x: vs, y: famStock.map((s) => s.iNaPeak / 1000), color: C.stock, width: 3 },
            { x: vs, y: famStock.map((s) => s.iKEnd / 1000), color: C.stock, width: 3, dash: "5 4" },
            { x: vs, y: fam.map((s) => s.iNaPeak / 1000), color: C.na, label: "INa peak" },
            { x: vs, y: fam.map((s) => s.iKEnd / 1000), color: C.k, dash: "5 4", label: "IK end" },
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
          x={[0, clamp.pre + clamp.dur]}
          zeroLine
          yInclude={[0]}
          xLabel="ms"
          yLabel={`${key === "iNa" ? "INa" : "IK"} (mA/cm²), steps ${fmt(clamp.from)} to ${fmt(clamp.to)} mV`}
          series={[
            ...famStock.map((s) => ({ x: s.t, y: mA(s[key]), color: C.stock, width: 2.5 }) as Series),
            ...fam.map((s, k) => ({ x: s.t, y: mA(s[key]), color: col, width: 1.4, opacity: shade(k) }) as Series),
          ]}
        />
      );
    }
  } else {
    const second: Series[] =
      spikeTrace === "i"
        ? [
            { x: apStock.t, y: mA(apStock.iNa), color: C.stock, width: 2.5 },
            { x: apStock.t, y: mA(apStock.iK), color: C.stock, width: 2.5, dash: "5 4" },
            { x: ap.t, y: mA(ap.iNa), color: C.na, label: "INa" },
            { x: ap.t, y: mA(ap.iK), color: C.k, dash: "5 4", label: "IK" },
          ]
        : spikeTrace === "g"
          ? [
              { x: apStock.t, y: apStock.gNa, color: C.stock, width: 2.5 },
              { x: apStock.t, y: apStock.gK, color: C.stock, width: 2.5, dash: "5 4" },
              { x: ap.t, y: ap.gNa, color: C.na, label: "gNa" },
              { x: ap.t, y: ap.gK, color: C.k, dash: "5 4", label: "gK" },
            ]
          : GATE_IDS.map((id) => ({ x: ap.t, y: ap[id], color: C[id], label: id }) as Series);
    simPlot = (
      <>
        <Plot
          height={H.sim - H.sim2 + 30}
          ariaLabel="membrane potential"
          x={[0, sweepMs]}
          yInclude={[-80, 40]}
          yLabel="V (mV)"
          series={[
            { x: apStock.t, y: apStock.v, color: C.stock, width: 3 },
            { x: ap.t, y: ap.v, color: C.ink, label: "V" },
          ]}
        />
        <Plot
          height={H.sim2}
          ariaLabel={spikeTrace === "gates" ? "gates during the action potential" : "currents during the action potential"}
          x={[0, sweepMs]}
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

  // ------------------------------------------------------------ controls
  let controls;
  if (sel === "m" || sel === "h" || sel === "n") {
    const id = sel;
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
          <Slider label={`${nm} centre V0`} unit="mV" value={r.v0} min={r0.v0 - 50} max={r0.v0 + 50} step={0.5} stock={r0.v0} onChange={(v) => setRate(id, which, "v0", v)} />
          <Slider label={`${nm} voltage scale k`} unit="mV" value={r.k} min={Math.max(1, r0.k / 4)} max={r0.k * 4} log stock={r0.k} onChange={(v) => setRate(id, which, "k", v)} />
        </fieldset>
      );
    };
    const vh = md.g[id].vHalfBase;
    controls = (
      <>
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
        {note && <p className="note">{note}</p>}
        {other}
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
          <legend className="formula">Voltage clamp: hold, then steps from {fmt(clamp.from)} to {fmt(clamp.to)} mV</legend>
          <Slider label="holding potential" unit="mV" value={clamp.hold} min={-120} max={-30} step={1} stock={DEFAULT_CLAMP.hold} onChange={(v) => setClamp({ ...clamp, hold: v })} />
          <Slider label="step length" unit="ms" value={clamp.dur} min={2} max={50} step={1} stock={DEFAULT_CLAMP.dur} onChange={(v) => setClamp({ ...clamp, dur: v })} />
        </fieldset>
        <fieldset className="group">
          <legend className="formula">Action potential: a current pulse at {fmt(stim.start)} ms</legend>
          <Slider label="pulse amplitude" unit="µA/cm²" value={stim.amp} min={-50} max={200} step={0.5} stock={DEFAULT_STIM.amp} onChange={(v) => setStim({ ...stim, amp: v })} />
          <Slider label="pulse length" unit="ms" value={stim.dur} min={0.05} max={50} log stock={DEFAULT_STIM.dur} onChange={(v) => setStim({ ...stim, dur: v })} />
          <Slider label="holding current" unit="µA/cm²" value={stim.hold} min={-20} max={20} step={0.1} stock={DEFAULT_STIM.hold} onChange={(v) => setStim({ ...stim, hold: v })} />
        </fieldset>
      </>
    );
  }

  const resetSel = () => {
    if (sel === "m" || sel === "h" || sel === "n") setGateP(sel, () => stockGate(sel));
    else if (sel === "na") setP({ ...p, gNa: STOCK.gNa, eNa: STOCK.eNa, pm: STOCK.pm, ph: STOCK.ph });
    else if (sel === "k") setP({ ...p, gK: STOCK.gK, eK: STOCK.eK, pn: STOCK.pn });
    else if (sel === "mem") setP({ ...p, celsius: STOCK.celsius, gL: STOCK.gL, eL: STOCK.eL, cm: STOCK.cm });
    else { setClamp(DEFAULT_CLAMP); setStim(DEFAULT_STIM); }
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
                <button key={id} className={gate === id ? "on" : ""} style={{ color: C[id] }} onClick={() => pick(id)}>{id}</button>
              ))}
            </span>
            <span className="muted">{view === "ab" ? "rates" : "steady state and time constant"} · {fmt(p.celsius)} °C · grey: stock</span>
          </div>
          {curvePlots}
          {readout}
        </section>

        <section className="card sim" aria-label="simulation">
          <div className="card-head">
            <span className="tabs">
              <button className={tab === "clamp" ? "on" : ""} onClick={() => setTab("clamp")}>Voltage clamp</button>
              <button className={tab === "spike" ? "on" : ""} onClick={() => setTab("spike")}>Action potential</button>
            </span>
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
          {simPlot}
          <p className="caption">{tab === "clamp" ? "Ideal clamp, no electrode or leak: what no rig records." : "The membrane alone, no electrode: a model, not a recording."}</p>
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
        <div className="panel">
          {controls}
          <div className="resets">
            <button onClick={resetSel} disabled={!edited(sel)}>Reset {chips.find((c) => c.id === sel)!.label}</button>
            <button onClick={() => { setP(stockParams()); setClamp(DEFAULT_CLAMP); setStim(DEFAULT_STIM); }} disabled={!anyEdited}>Reset all</button>
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
