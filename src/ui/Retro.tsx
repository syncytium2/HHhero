/**
 * The 1952 screen: re-run figures from Hodgkin & Huxley's model paper on the
 * app's model, on a green-phosphor tube, in the paper's signs or today's.
 * Each figure is a guided walk (numbered steps that set the rig and say what
 * to see, ending on the paper's own data) or a challenge (the paper's figure
 * described, and the student sets the rig until it matches). The figures and
 * every claim they make live in src/paper/paper1952.ts, with tests.
 */
import { useEffect, useMemo, useState } from "react";
import { Plot, type Series } from "./Plot.tsx";
import { Slider } from "./Slider.tsx";
import { Tour, tour } from "./Tour.tsx";
import { fmt } from "../core/rates.ts";
import {
  clampStep, eqn11, FIG3_DATA, FIGURES, guideRig, modelAt, paperI, REST, shock, spikeHeight, START_RIG, stepToText, TABLE4,
  textToStep, type ApTrace, type Rig, type Signs,
} from "../paper/paper1952.ts";

const GREEN = "var(--ph-green)", AMBER = "var(--ph-amber)", PAPER = "var(--ph-paper)", PALE = "var(--ph-pale)";
const AP_TRACES: ApTrace[] = ["gNa", "gK", "m", "h", "n"];
const mA = (a: Float64Array) => a.map((x) => x / 1000);

function useWinH() {
  const [h, setH] = useState(() => (typeof innerHeight === "number" ? innerHeight : 900));
  useEffect(() => {
    const f = () => setH(innerHeight);
    addEventListener("resize", f);
    return () => removeEventListener("resize", f);
  }, []);
  return h;
}

export function Retro({ onExit }: { onExit: () => void }) {
  const [signs, setSigns] = useState<Signs>("1952");
  const [figId, setFigId] = useState(FIGURES[0].id);
  const [mode, setMode] = useState<"guide" | "challenge">("guide");
  const [k, setK] = useState(0);
  const [rig, setRig] = useState<Rig>(() => guideRig(FIGURES[0], 0));
  const [showPaper, setShowPaper] = useState(false);
  const [touring, setTouring] = useState(false);
  const winH = useWinH();
  const fig = FIGURES.find((f) => f.id === figId)!;
  const check = fig.check(rig);

  // a guide step sets the rig, and says whether to show the paper
  const goStep = (f = fig, j = k) => {
    setK(j);
    setRig(guideRig(f, j));
    setShowPaper(!!f.guide[j].paper);
  };
  const pickFig = (id: string) => {
    const f = FIGURES.find((x) => x.id === id)!;
    setFigId(id);
    if (mode === "guide") goStep(f, 0);
    else { setRig(START_RIG); setShowPaper(false); }
  };
  const pickMode = (m: "guide" | "challenge") => {
    setMode(m);
    if (m === "guide") goStep(fig, 0);
    else { setRig(START_RIG); setShowPaper(false); }
  };
  // a challenge met shows the paper over the student's figure
  const solved = mode === "challenge" && check.ok;
  const paperOn = showPaper || solved;

  // ------------------------------------------------------------ the runs
  const md = useMemo(() => modelAt(rig.celsius), [rig.celsius]);
  const steps = useMemo(() => [...rig.steps].sort((a, b) => b - a), [rig.steps]);
  const clampRuns = useMemo(() => (rig.kind === "clamp" ? steps.map((d) => ({ d, s: clampStep(md, d, rig.ms) })) : []), [md, steps, rig.kind, rig.ms]);
  const shockRuns = useMemo(() => (rig.kind === "shock" ? steps.map((d) => ({ d, r: shock(md, d, rig.ms) })) : []), [md, steps, rig.kind, rig.ms]);

  const stepLabel = (d: number) => {
    const x = stepToText(rig.kind, d, signs);
    return rig.kind === "shock" ? `${fmt(d)}` : signs === "1952" ? `V ${fmt(x)}` : `${fmt(x)} mV`;
  };
  const vName = signs === "1952" ? "−V (mV), depolarization up" : "V (mV)";
  const iName = signs === "1952" ? "I (mA/cm²), inward up" : "I (mA/cm²), outward up";
  const plotH = Math.max(260, winH - 330);

  let plots;
  if (rig.kind === "clamp") {
    const series: Series[] = [];
    clampRuns.forEach(({ d, s }, j) => {
      for (const c of ["na", "k"] as const) {
        if (!rig[c]) continue;
        const y = rig.q === "g" ? (c === "na" ? s.gNa : s.gK) : (() => { const a = mA(c === "na" ? s.iNa : s.iK); return signs === "1952" ? a.map(paperI) : a; })();
        const last = (c === "k" || !rig.k) && j < 14;
        series.push({ x: s.t, y, color: c === "na" ? AMBER : GREEN, width: 1.6, label: last ? stepLabel(d) : undefined });
      }
    });
    if (paperOn && fig.paper === "fig3" && rig.q === "g" && rig.k) {
      for (const c of FIG3_DATA) {
        if (!steps.some((d) => Math.abs(d - c.depolarization) <= 1)) continue;
        const ts = Array.from({ length: 111 }, (_, i) => i * 0.1);
        series.push({ x: ts, y: ts.map((t) => eqn11(t, c.gKinf, c.tauN)), color: PAPER, width: 1.2, dash: "5 4" });
        series.push({ x: c.points.map((p) => p[0]), y: c.points.map((p) => p[1]), color: PAPER, points: true });
      }
    }
    plots = (
      <Plot
        height={plotH}
        ariaLabel={rig.q === "g" ? "conductance during the clamp steps" : "current during the clamp steps"}
        x={[0, rig.ms]}
        zeroLine
        yInclude={[0]}
        xLabel="ms"
        yLabel={rig.q === "g" ? "g (m.mho/cm²)" : iName}
        series={series}
      />
    );
  } else {
    const vS: Series[] = shockRuns.map(({ d, r }) => ({
      x: r.t, y: signs === "1952" ? r.v.map((v) => v - REST) : r.v, color: GREEN, width: 1.8, label: stepLabel(d), labelAt: signs === "1952" ? ("peak" as const) : ("end" as const),
    }));
    const gs = rig.ap.filter((a) => a === "gNa" || a === "gK");
    const xs = rig.ap.filter((a) => a === "m" || a === "h" || a === "n");
    const n = 1 + (gs.length ? 1 : 0) + (xs.length ? 1 : 0);
    const h = Math.round((plotH - (n - 1) * 8) / (n === 1 ? 1 : n === 2 ? 1.6 : 2.2));
    const sub = n === 1 ? 0 : Math.round((plotH - h) / (n - 1)) - 8;
    plots = (
      <>
        <Plot height={h} ariaLabel="membrane potential after the shock" x={[0, rig.ms]} yInclude={signs === "1952" ? [0, 110] : [-75, 45]} noXTicks={n > 1} xLabel="ms" yLabel={vName} series={vS} zeroLine={signs === "1952"} />
        {gs.length > 0 && (
          <Plot height={sub} ariaLabel="conductances after the shock" x={[0, rig.ms]} yInclude={[0]} noXTicks={xs.length > 0} xLabel="ms" yLabel="g (m.mho/cm²)"
            series={shockRuns.flatMap(({ r }, j) => gs.map((g) => ({ x: r.t, y: r[g], color: g === "gNa" ? AMBER : GREEN, width: 1.5, label: j === 0 ? g : undefined, labelAt: "peak" as const })))} />
        )}
        {xs.length > 0 && (
          <Plot height={sub} ariaLabel="gates after the shock" x={[0, rig.ms]} y={[-0.04, 1.04]} xLabel="ms" yLabel="gates"
            series={shockRuns.flatMap(({ r }, j) => xs.map((g) => ({ x: r.t, y: r[g], color: g === "h" ? PALE : g === "m" ? AMBER : GREEN, width: 1.5, label: j === 0 ? g : undefined }) as Series))} />
        )}
      </>
    );
  }

  // Table 4 beside the model, for the figure that quotes it
  const table4 = paperOn && fig.paper === "table4" && rig.kind === "shock" && (
    <table className="t4">
      <caption>Spike height above rest, mV: the paper's Table 4 (p. 527, at 6.3 °C) and the model here, at {fmt(rig.celsius)} °C</caption>
      <thead><tr><th>shock</th><th>paper</th><th>model</th></tr></thead>
      <tbody>
        {[...TABLE4.map((r) => r.depol), 6].map((d) => {
          const paper = TABLE4.find((r) => r.depol === d)?.height;
          const run = shockRuns.find((r) => Math.abs(r.d - d) <= 0.5);
          const h = run ? spikeHeight(run.r) : undefined;
          return (
            <tr key={d}>
              <td>{d} mV</td>
              <td>{paper !== undefined ? paper.toFixed(1) : "no spike"}</td>
              <td>{h === undefined ? "not run" : h === null ? "no spike" : h.toFixed(1)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // ------------------------------------------------------------ the rig's controls
  const [stepsText, setStepsText] = useState("");
  const shownSteps = steps.map((d) => fmt(stepToText(rig.kind, d, signs))).join(", ");
  useEffect(() => setStepsText(shownSteps), [shownSteps]);
  const applySteps = () => {
    const xs = stepsText.split(/[\s,;]+/).map((x) => parseFloat(x.replace("−", "-"))).filter((x) => Number.isFinite(x));
    const ds = xs.map((x) => textToStep(rig.kind, x, signs)).filter((d) => d >= -100 && d <= 150).slice(0, 20);
    if (ds.length) setRig({ ...rig, steps: ds });
    else setStepsText(shownSteps);
  };
  const stepsName =
    rig.kind === "shock" ? "shocks: initial depolarization, mV" : signs === "1952" ? "steps: V, mV (depolarization negative)" : "steps: membrane potential, mV";
  const toggleAp = (a: ApTrace) => setRig({ ...rig, ap: rig.ap.includes(a) ? rig.ap.filter((x) => x !== a) : AP_TRACES.filter((x) => x === a || rig.ap.includes(x)) });

  return (
    <div className="retro">
      <header className="r-top">
        <div className="brand">
          <h1>HH<span>hero</span> <b>1952</b></h1>
          <a className="home-link" href="https://tonydefazio.com/">tonydefazio.com</a>
        </div>
        <span className="r-cite">Hodgkin &amp; Huxley (1952) J Physiol 117:500–544</span>
        <div className="seg" role="radiogroup" aria-label="sign convention">
          <button role="radio" aria-checked={signs === "1952"} className={signs === "1952" ? "on" : ""} onClick={() => setSigns("1952")}
            {...tour("1952 signs", "The paper's convention: V is the displacement from rest, depolarization negative, and inward current is positive.")}>1952 signs</button>
          <button role="radio" aria-checked={signs === "modern"} className={signs === "modern" ? "on" : ""} onClick={() => setSigns("modern")}
            {...tour("Modern signs", "Today's convention: the membrane potential itself, rest at −65 mV, outward current positive. The model is the same either way.")}>Modern</button>
        </div>
        <button className="tour-btn" aria-label="quick tour" onClick={() => setTouring(true)} disabled={touring}>Tour</button>
        <button onClick={onExit} {...tour("Back", "Back to the rest of HHhero.")}>Back to HHhero</button>
      </header>

      <div className="r-body">
        <nav className="r-figs" aria-label="figures" {...tour("Figures", "Figures from the model paper that the model here can re-run. Pick one.")}>
          <div className="r-h">The model paper</div>
          {FIGURES.map((f) => (
            <button key={f.id} className={f.id === figId ? "on" : ""} aria-pressed={f.id === figId} onClick={() => pickFig(f.id)}>
              <b>Fig. {f.num}</b> {f.title} <span className="r-pg">p. {f.page}</span>
            </button>
          ))}
          <p className="r-soon">More figures, and the rest of the 1952 series, to come.</p>
        </nav>

        <main className="r-main">
          <div className="r-head">
            <h2>Fig. {fig.num}. {fig.title}</h2>
            <div className="seg" role="radiogroup" aria-label="guided or challenge">
              <button role="radio" aria-checked={mode === "guide"} className={mode === "guide" ? "on" : ""} onClick={() => pickMode("guide")}
                {...tour("Guided", "A walk through the figure, a numbered step at a time, ending on the paper's own data.")}>Guided</button>
              <button role="radio" aria-checked={mode === "challenge"} className={mode === "challenge" ? "on" : ""} onClick={() => pickMode("challenge")}
                {...tour("Challenge", "The figure described; set up the experiment yourself until it matches.")}>Challenge</button>
            </div>
            {fig.paper && (
              <button className={paperOn ? "on" : ""} aria-pressed={paperOn} onClick={() => setShowPaper(!showPaper)} disabled={solved}
                {...tour("The paper", "Flip the paper's own data over the model: traced points and fitted curves, or its table.")}>The paper</button>
            )}
          </div>
          <div className="r-screen" {...tour("The screen", "The model's traces, on a green-phosphor tube. The paper's data, when shown, are pale.")}>
            {plots}
          </div>
          {mode === "guide" ? (
            <div className="r-card" {...tour("The walk", "What to look at, a step at a time. The arrow buttons step.")}>
              <div className="r-stepper">
                <button aria-label="previous step" disabled={k === 0} onClick={() => goStep(fig, k - 1)}>‹</button>
                <div>
                  <div className="r-num">Step {k + 1} of {fig.guide.length}</div>
                  <p>{fig.guide[k].text}</p>
                </div>
                <button aria-label="next step" disabled={k === fig.guide.length - 1} onClick={() => goStep(fig, k + 1)}>›</button>
              </div>
            </div>
          ) : (
            <div className={`r-card${solved ? " solved" : ""}`} {...tour("The task", "The figure to recreate, and what is still missing.")}>
              <p className="r-ask">{fig.ask}</p>
              <p className="r-check" aria-live="polite">{solved ? "✓ " : ""}{check.hint}</p>
            </div>
          )}
        </main>

        <aside className="r-rig" aria-label="the experiment" {...tour("The rig", "The experiment: clamp or shock, the steps, the temperature, and what to draw. Guided steps set it; in a challenge it is yours.")}>
          <div className="r-h">The experiment</div>
          <div className="seg" role="radiogroup" aria-label="experiment">
            <button role="radio" aria-checked={rig.kind === "clamp"} className={rig.kind === "clamp" ? "on" : ""} onClick={() => setRig({ ...rig, kind: "clamp", ms: Math.max(rig.ms, 11) })}>Voltage clamp</button>
            <button role="radio" aria-checked={rig.kind === "shock"} className={rig.kind === "shock" ? "on" : ""} onClick={() => setRig({ ...rig, kind: "shock" })}>Shock</button>
          </div>
          <label className="r-field">
            <span>{stepsName}</span>
            <input value={stepsText} onChange={(e) => setStepsText(e.target.value)} onBlur={applySteps} onKeyDown={(e) => e.key === "Enter" && applySteps()} spellCheck={false} />
          </label>
          <Slider label="temperature" unit="°C" value={rig.celsius} min={0} max={30} step={0.1} stock={6.3} onChange={(v) => setRig({ ...rig, celsius: v })} />
          <Slider label="sweep length" unit="ms" value={rig.ms} min={2} max={40} step={1} stock={rig.ms} onChange={(v) => setRig({ ...rig, ms: v })} />
          <div className="r-h">Draw</div>
          {rig.kind === "clamp" ? (
            <div className="r-draw">
              <span className="seg" role="radiogroup" aria-label="current or conductance">
                <button role="radio" aria-checked={rig.q === "i"} className={rig.q === "i" ? "on" : ""} onClick={() => setRig({ ...rig, q: "i" })}>I</button>
                <button role="radio" aria-checked={rig.q === "g"} className={rig.q === "g" ? "on" : ""} onClick={() => setRig({ ...rig, q: "g" })}>g</button>
              </span>
              <button aria-pressed={rig.na} className={rig.na ? "on" : ""} onClick={() => setRig({ ...rig, na: !rig.na })}>Na</button>
              <button aria-pressed={rig.k} className={rig.k ? "on" : ""} onClick={() => setRig({ ...rig, k: !rig.k })}>K</button>
            </div>
          ) : (
            <div className="r-draw">
              {AP_TRACES.map((a) => (
                <button key={a} aria-pressed={rig.ap.includes(a)} className={rig.ap.includes(a) ? "on" : ""} onClick={() => toggleAp(a)}>{a}</button>
              ))}
            </div>
          )}
          <p className="r-note">
            {rig.kind === "clamp"
              ? "Each step runs from rest, with the membrane held at the new potential."
              : "Each sweep starts with the membrane suddenly depolarized and the gates at rest, as after a brief shock; then no current. 1 mV is 1 mµcoulomb/cm²."}
          </p>
          {table4}
        </aside>
      </div>
      {touring && <Tour onEnd={() => setTouring(false)} />}
    </div>
  );
}
