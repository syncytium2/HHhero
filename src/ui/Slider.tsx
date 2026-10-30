/**
 * One parameter: its name, its value (tap to type), − and + buttons, and a
 * slider. Built for a thumb: every target is at least 44 px. A log slider
 * moves by ratios, for scales that span decades.
 */
import { useEffect, useState } from "react";
import { fmt } from "../core/rates.ts";

interface Props {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  /** linear sliders: the step; log sliders: ignored (± is ×/÷ 1.05) */
  step?: number;
  log?: boolean;
  integer?: boolean;
  /** the stock value; the row is marked when the value differs */
  stock: number;
  onChange: (v: number) => void;
}

const LOG_STEPS = 1000;

export function Slider({ label, unit, value, min, max, step = 1, log, integer, stock, onChange }: Props) {
  const [text, setText] = useState(fmt(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(fmt(value)); }, [value, editing]);

  const clamp = (v: number) => Math.max(min, Math.min(max, integer ? Math.round(v) : v));
  const snap = (v: number) => (log ? +v.toPrecision(4) : +(Math.round(v / step) * step).toFixed(6));
  const set = (v: number) => onChange(clamp(snap(v)));
  const toPos = (v: number) => (log ? (Math.log(v / min) / Math.log(max / min)) * LOG_STEPS : v);
  const fromPos = (p: number) => (log ? min * Math.pow(max / min, p / LOG_STEPS) : p);
  const nudge = (dir: 1 | -1) => set(log ? value * Math.pow(1.05, dir) : value + dir * step);
  const edited = Math.abs(value - stock) > 1e-9 * Math.max(1, Math.abs(stock));
  const commit = () => {
    setEditing(false);
    const v = parseFloat(text.replace("−", "-"));
    if (Number.isFinite(v) && (!log || v > 0)) set(v);
    else setText(fmt(value));
  };

  return (
    <div className={`slider${edited ? " edited" : ""}`}>
      <label className="s-label">
        <span>{label}</span>
        {edited && <span className="s-stock">stock {fmt(stock)}</span>}
      </label>
      <input
        className="s-value"
        inputMode="decimal"
        aria-label={`${label} value`}
        value={editing ? text : fmt(value) + (unit ? ` ${unit}` : "")}
        onFocus={(e) => { setEditing(true); setText(fmt(value)); requestAnimationFrame(() => e.target.select()); }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
      <button className="s-btn" aria-label={`decrease ${label}`} onClick={() => nudge(-1)}>−</button>
      <input
        className="s-range"
        type="range"
        aria-label={label}
        min={log ? 0 : min}
        max={log ? LOG_STEPS : max}
        step={log ? 1 : integer ? 1 : step}
        value={toPos(value)}
        onChange={(e) => set(fromPos(+e.target.value))}
      />
      <button className="s-btn" aria-label={`increase ${label}`} onClick={() => nudge(1)}>+</button>
    </div>
  );
}
