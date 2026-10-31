/**
 * The quick tour. It knows no features: it walks whatever on the page carries
 * a caption (the `tour()` props below), in page order, and shows each one
 * working. So a new control joins the tour by getting a caption next to its
 * own code, and the screenshot check fails on a control without one.
 *
 * What a stop does depends on what the element is:
 *   toggle (aria-pressed)   pressed on for the stop, off again after
 *   pick (radio, tab, or kind "pick")   chosen; the new view's controls join
 *                           the tour; picks wait until the rest are seen, and
 *                           at the end the original choices come back
 *   slider (kind "slider")  its first + pressed a few times, then − as many
 *   show                    pointed at, nothing pressed
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type TourKind = "show" | "pick" | "slider";

/** props that put an element in the tour; `then` names a button (its aria-label) to press a few times once a toggle is on */
export function tour(title: string, text: string, opts: { kind?: TourKind; then?: string } = {}) {
  return {
    "data-tour": title,
    "data-tour-text": text,
    ...(opts.kind ? { "data-tour-kind": opts.kind } : {}),
    ...(opts.then ? { "data-tour-then": opts.then } : {}),
  };
}

const DWELL = 2600;

function kindOf(el: HTMLElement): string {
  if (el.dataset.tourKind) return el.dataset.tourKind;
  if (el.hasAttribute("aria-pressed")) return "toggle";
  const r = el.getAttribute("role");
  return r === "radio" || r === "tab" ? "pick" : "show";
}
const isOn = (el: Element) =>
  el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-selected") === "true" ||
  el.getAttribute("aria-pressed") === "true" || el.classList.contains("on");
const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const stops = () => [...document.querySelectorAll<HTMLElement>("[data-tour]")].filter(visible);
const find = (title: string) => stops().find((e) => e.dataset.tour === title);

interface Stop { title: string; text: string }

export function Tour({ onEnd }: { onEnd: () => void }) {
  const [cur, setCur] = useState<Stop | null>(null);
  const [count, setCount] = useState(0);
  const [paused, setPaused] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const visited = useRef(new Set<string>());
  const groups = useRef(new Set<Element>());
  const restore = useRef<string[]>([]); // the picks chosen before the tour, in the order found
  const undo = useRef<(() => void) | null>(null);
  const timers = useRef<number[]>([]);
  const waiting = useRef(false); // the stop's time is up, but the tour is paused
  const pausedRef = useRef(false);
  const ended = useRef(false);

  const later = (ms: number, f: () => void) => { timers.current.push(window.setTimeout(f, ms)); };
  const leave = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    undo.current?.();
    undo.current = null;
  };

  const finish = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    leave();
    setCur(null);
    // the deepest choices first: a view's own picks exist only while that view is showing
    const back = [...restore.current].reverse();
    const step = (i: number) => {
      if (i === back.length) { onEnd(); return; }
      const e = find(back[i]);
      if (e && !isOn(e)) e.click();
      window.setTimeout(() => step(i + 1), 60);
    };
    step(0);
  }, [onEnd]);

  const next = useCallback(() => {
    if (ended.current) return;
    leave();
    waiting.current = false;
    // remember each group of picks as it was before the tour touched it
    for (const e of stops()) {
      if (kindOf(e) !== "pick" || !e.parentElement || groups.current.has(e.parentElement)) continue;
      groups.current.add(e.parentElement);
      for (const s of e.parentElement.querySelectorAll<HTMLElement>(":scope > [data-tour]")) if (isOn(s)) restore.current.push(s.dataset.tour!);
    }
    const left = stops().filter((e) => !visited.current.has(e.dataset.tour!));
    const el = left.find((e) => kindOf(e) !== "pick") ?? left[0];
    if (!el) { finish(); return; }
    const title = el.dataset.tour!;
    visited.current.add(title);
    setCur({ title, text: el.dataset.tourText ?? "" });
    setCount((c) => c + 1);

    let dwell = DWELL;
    const kind = kindOf(el);
    if (kind === "toggle" && !isOn(el)) {
      later(500, () => {
        const e = find(title);
        if (!e) return;
        e.click();
        undo.current = () => { const x = find(title); if (x && isOn(x)) x.click(); };
      });
      const then = el.dataset.tourThen;
      if (then) {
        for (let i = 0; i < 3; i++) later(1300 + i * 700, () => document.querySelector<HTMLElement>(`[aria-label="${then}"]`)?.click());
        dwell = 3800;
      }
    } else if (kind === "pick" && !isOn(el)) {
      later(500, () => find(title)?.click());
    } else if (kind === "slider") {
      const up = el.querySelector<HTMLElement>('button[aria-label^="increase"]');
      const down = up?.closest(".slider")?.querySelector<HTMLElement>('button[aria-label^="decrease"]');
      if (up && down) {
        let net = 0;
        for (let i = 0; i < 5; i++) later(500 + i * 160, () => { up.click(); net++; });
        for (let i = 0; i < 5; i++) later(1700 + i * 160, () => { down.click(); net--; });
        // one press at a time: presses in the same instant would all read the same starting value
        undo.current = () => {
          const f = () => { if (net > 0) { down.click(); net--; window.setTimeout(f, 40); } };
          f();
        };
        dwell = 3200;
      }
    }
    later(dwell, () => {
      if (pausedRef.current) waiting.current = true;
      else next();
    });
  }, [finish]);

  // start once; Escape ends
  useEffect(() => {
    next();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    addEventListener("keydown", onKey);
    return () => { removeEventListener("keydown", onKey); timers.current.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the ring follows its element as the layout moves
  useEffect(() => {
    if (!cur) return;
    let id = 0;
    const f = () => { setRect(find(cur.title)?.getBoundingClientRect() ?? null); id = requestAnimationFrame(f); };
    f();
    return () => cancelAnimationFrame(id);
  }, [cur]);

  const togglePause = () => {
    const p = !paused;
    setPaused(p);
    pausedRef.current = p;
    if (!p && waiting.current) next();
  };

  if (!cur) return null;
  // the card sits away from what it points at
  const low = rect ? rect.top + rect.height / 2 > innerHeight * 0.5 : false;
  const pad = 4;
  return (
    <>
      {rect && (
        <div
          className="tour-ring"
          aria-hidden="true"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + 2 * pad, height: rect.height + 2 * pad }}
        />
      )}
      <div className={`tour-card ${low ? "at-top" : "at-bottom"}`} role="dialog" aria-label="tour" aria-live="polite">
        <div className="tour-title">{count}. {cur.title}</div>
        <div className="tour-text">{cur.text}</div>
        <div className="tour-buttons">
          <button onClick={togglePause} aria-pressed={paused}>{paused ? "Play" : "Pause"}</button>
          <button onClick={next}>Next</button>
          <button onClick={finish}>End tour</button>
        </div>
      </div>
    </>
  );
}
