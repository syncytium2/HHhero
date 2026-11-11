/**
 * The protocol builder: a mode (voltage or current clamp), a stock protocol
 * to start from, and up to five epochs, each a level held for a time, either
 * of which can change from sweep to sweep. Phone first: one epoch's sliders
 * at a time, picked by its letter, so the plot above stays in view.
 */
import { Slider } from "./Slider.tsx";
import { tour } from "./Tour.tsx";
import { fmt } from "../core/rates.ts";
import { epochIn, LETTERS, MAX_EPOCHS, MAX_SWEEPS, swept, type Epoch, type Mode, type Preset, type Protocol } from "../core/protocol.ts";

const same = (a: Protocol, b: Protocol) => JSON.stringify(a) === JSON.stringify(b);

/** the protocol in words: what each sweep does, and what changes */
export function protocolWords(p: Protocol): string {
  const u = p.mode === "v" ? "mV" : "µA/cm²";
  const s = swept(p);
  const n = `${p.sweeps} sweep${p.sweeps === 1 ? "" : "s"}`;
  if (!s) return `${p.epochs.length} epochs, ${n}`;
  const e = p.epochs[s.epoch], a = epochIn(e, 0), b = epochIn(e, p.sweeps - 1);
  return s.what === "level"
    ? `${n}, ${LETTERS[s.epoch]} from ${fmt(a.level)} to ${fmt(b.level)} ${u}`
    : `${n}, ${LETTERS[s.epoch]} from ${fmt(a.dur)} to ${fmt(b.dur)} ms`;
}

interface Props {
  mode: Mode;
  onMode: (m: Mode) => void;
  p: Protocol;
  setP: (p: Protocol) => void;
  presets: Preset[];
  /** ids of presets the clamp header picks: not listed here, where only the rest are */
  inHeader?: string[];
  /** the stock protocol last chosen: its values are the sliders' stock marks */
  base: Protocol;
  setBase: (p: Protocol) => void;
  sel: number;
  setSel: (j: number) => void;
}

export function ProtocolEditor({ mode, onMode, p, setP, presets, inHeader = [], base, setBase, sel, setSel }: Props) {
  const j = Math.min(sel, p.epochs.length - 1);
  const e = p.epochs[j], e0 = base.epochs[j] ?? e;
  const L = LETTERS[j];
  const v = mode === "v";
  const u = v ? "mV" : "µA/cm²";
  const setE = (f: Partial<Epoch>) => setP({ ...p, epochs: p.epochs.map((x, i) => (i === j ? { ...x, ...f } : x)) });
  const matched = presets.find((pr) => same(pr.p, p));
  const add = () => {
    const last = p.epochs[p.epochs.length - 1];
    setP({ ...p, epochs: [...p.epochs, { level: p.epochs[0].level, dLevel: 0, dur: Math.max(1, last.dur / 2), dDur: 0 }] });
    setSel(p.epochs.length);
  };
  const remove = () => {
    const n = p.epochs.length - 1;
    setP({ ...p, epochs: p.epochs.slice(0, n), measure: Math.min(p.measure, n - 1) });
    setSel(Math.min(j, n - 1));
  };

  return (
    <fieldset className="group proto">
      <legend className="sr-only">{v ? "Voltage clamp" : "Current clamp"}: {protocolWords(p)}</legend>
      <div className="ladder-pick epochs" role="radiogroup" aria-label="epochs"
        {...tour("Epochs", "Each epoch holds a level for a time; A is the hold. Pick one to edit it, + adds an epoch, − removes the last.")}>
        {p.epochs.map((_, i) => (
          <button key={i} role="radio" aria-checked={i === j} aria-label={`epoch ${LETTERS[i]}`} className={i === j ? "on" : ""} onClick={() => setSel(i)}>{LETTERS[i]}</button>
        ))}
        <button aria-label="add epoch" disabled={p.epochs.length >= MAX_EPOCHS} onClick={add}>+</button>
        <button aria-label="remove epoch" disabled={p.epochs.length <= 2} onClick={remove}>−</button>
      </div>
      <Slider label={`${L} level`} unit={u} value={e.level} min={v ? -130 : -100} max={v ? 80 : 200} step={v ? 1 : 0.5} stock={e0.level} onChange={(x) => setE({ level: x })} />
      <Slider label={`${L} duration`} unit="ms" value={e.dur} min={0.05} max={300} log stock={e0.dur} onChange={(x) => setE({ dur: x })} />
      <Slider label={`${L} level change per sweep`} unit={u} value={e.dLevel} min={-50} max={50} step={0.5} stock={e0.dLevel} onChange={(x) => setE({ dLevel: x })} />
      <Slider label={`${L} duration change per sweep`} unit="ms" value={e.dDur} min={-20} max={50} step={0.5} stock={e0.dDur} onChange={(x) => setE({ dDur: x })} />
      <Slider label="sweeps" value={p.sweeps} min={1} max={MAX_SWEEPS} integer stock={base.sweeps} onChange={(x) => setP({ ...p, sweeps: x })} />
      {v && (
        <div className="ladder-pick epochs" role="radiogroup" aria-label="measure in epoch"
          {...tour("Measure", "The epoch the I–V reads: its peak sodium current and its last potassium current, against whatever changes from sweep to sweep.")}>
          <span className="pick-label">I–V reads</span>
          {p.epochs.map((_, i) => (
            <button key={i} role="radio" aria-checked={i === p.measure} aria-label={`measure in ${LETTERS[i]}`} className={i === p.measure ? "on" : ""}
              onClick={() => setP({ ...p, measure: i })}>{LETTERS[i]}</button>
          ))}
        </div>
      )}
      <div className="ladder-pick" role="radiogroup" aria-label="clamp mode"
        {...tour("Mode", "Voltage clamp commands the voltage and records the currents; current clamp injects current and records the voltage.")}>
        <button role="radio" aria-checked={v} className={v ? "on" : ""} onClick={() => onMode("v")}>V clamp</button>
        <button role="radio" aria-checked={!v} className={!v ? "on" : ""} onClick={() => onMode("i")}>I clamp</button>
      </div>
      <div className="ladder-pick wrap" role="radiogroup" aria-label="stock protocols"
        {...tour("Protocols", inHeader.length ? "More protocols to start from, besides the experiments the header picks. Each sets the epochs above, and every one can be edited." : "Classic protocols to start from. Each sets the epochs above, and every one can be edited.")}>
        {inHeader.length > 0 && <span className="pick-label">Also</span>}
        {presets.filter((pr) => !inHeader.includes(pr.id)).map((pr) => {
          const on = matched?.id === pr.id;
          return (
            <button key={pr.id} role="radio" aria-checked={on} className={on ? "on" : ""}
              onClick={() => { setP(pr.p); setBase(pr.p); setSel(Math.min(1, pr.p.epochs.length - 1)); }}>{pr.name}</button>
          );
        })}
      </div>
      <p className="hint">{matched ? matched.text : "Your own protocol."}</p>
      <p className="hint">
        {v
          ? "Each sweep starts settled at A's level. The clamp is ideal: what no rig records."
          : "Each sweep starts settled at A's current. Step walks the sweeps; with one sweep, it walks pulses up to threshold and across it, scaling the epoch furthest from A."}
      </p>
    </fieldset>
  );
}
