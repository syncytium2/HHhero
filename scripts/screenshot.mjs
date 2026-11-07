// Look at the app, phone first, and fail loudly on what a phone user would hit.
//   node scripts/screenshot.mjs [url] [outdir]
// Checks, at 360×740 with touch (the design) and then 1440×900 (the lecture screen):
// no console errors, no request leaving the origin, no sideways scroll, the plots
// and the controls on screen together, every button and slider at least 44 px on
// the phone (the gate picker, log and Step switches and trace tabs at least 36), and that both views and
// every chip render. Run it after any UI change.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/";
const out = process.argv[3] ?? "screenshots";
mkdirSync(out, { recursive: true });
const origin = new URL(url).origin;
const problems = [];

const browser = await chromium.launch();
async function open(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("request", (r) => { const u = r.url(); if (!u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:")) problems.push(`third-party request: ${u}`); });
  await page.goto(url);
  await page.waitForSelector(".plot svg");
  return page;
}
const noSideways = async (page, where) => {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  if (sw > cw) problems.push(`${where}: page scrolls sideways (${sw} > ${cw})`);
};

// ---------------------------------------------------------------- phone
const phone = await open({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await phone.screenshot({ path: `${out}/phone-ab.png` });
await noSideways(phone, "phone");

// a banner (an earlier version, or the dev site) is never squeezed: on a short screen the page's column once cut its text in half
const bannerWhole = async (page, where) => {
  const b = await page.evaluate(() => { const e = document.querySelector(".archived"); return e && { h: e.clientHeight, need: e.scrollHeight }; });
  if (b && b.h < b.need) problems.push(`${where}: the banner is squeezed (${b.h} px of ${b.need})`);
};
await bannerWhole(phone, "phone");
{
  const short = await open({ viewport: { width: 393, height: 560 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: "dark" });
  await bannerWhole(short, "short phone");
  await short.screenshot({ path: `${out}/phone-short-dark.png` });
  await short.context().close();
}

// plots and controls visible together
const vis = await phone.evaluate(() => {
  const r = (s) => document.querySelector(s)?.getBoundingClientRect();
  const c = r(".curves"), s = r(".sim"), k = r(".controls .slider");
  return { curvesBottom: c?.bottom, simBottom: s?.bottom, sliderTop: k?.top, h: innerHeight };
});
if (!(vis.simBottom <= vis.h && vis.sliderTop < vis.h - 44)) problems.push(`phone: plots and a slider are not on screen together ${JSON.stringify(vis)}`);

// touch targets
const small = await phone.evaluate(() =>
  [...document.querySelectorAll("button, input[type=range]")]
    .filter((e) => e.offsetParent !== null)
    .map((e) => {
      const r = e.getBoundingClientRect();
      const min = e.closest(".gate-pick, .tabs, .log-btn, .step-btn, .measure-btn, .recenter") ? 36 : 44;
      return { t: (e.getAttribute("aria-label") || e.textContent || e.className).trim().slice(0, 30), h: Math.round(r.height), w: Math.round(r.width), min };
    })
    .filter((x) => x.h < x.min || x.w < Math.min(x.min, 36)),
);
for (const s of small) problems.push(`phone: touch target too small: "${s.t}" ${s.w}×${s.h} (min ${s.min})`);

// the tour knows no features: every control on screen must carry a caption (tour() in App.tsx), or the tour misses it
const untoured = async (pg, where) => {
  const bare = await pg.evaluate(() =>
    [...document.querySelectorAll(".app button")]
      .filter((e) => e.offsetParent !== null && !e.closest(".tour-btn, .tour-card, [role=dialog]") && !e.closest("[data-tour]"))
      .map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim()),
  );
  for (const b of bare) problems.push(`${where}: "${b}" has no tour caption: give it tour() in App.tsx`);
};
await untoured(phone, "phone");
// the whole tour, a stop at a time; afterwards everything is as it was
const isPressed = (pg, name) => pg.getByRole("button", { name, exact: true }).getAttribute("aria-pressed");
const sliderBefore = await phone.locator(".panel input[type=range]").first().inputValue();
await phone.getByRole("button", { name: "quick tour" }).tap();
await phone.locator(".tour-card").waitFor();
const seen = [];
for (let i = 0; i < 60 && (await phone.locator(".tour-card").count()); i++) {
  seen.push((await phone.locator(".tour-title").textContent()).replace(/^\d+\. /, ""));
  await phone.waitForTimeout(i < 25 ? 1400 : 300);
  if (i === 4 || seen.at(-1) === "Step") await phone.screenshot({ path: `${out}/phone-tour-${i}.png` });
  if (await phone.locator(".tour-card").count()) await phone.getByRole("button", { name: "Next", exact: true }).tap();
}
await phone.waitForTimeout(600);
if (await phone.locator(".tour-card").count()) problems.push("phone: the tour never ended");
for (const t of ["α, β", "x∞, τ", "Voltage clamp", "Action potential", "Step", "K", "I–V", "g", "Cursor", "Focus", "Sliders", "m h n"])
  if (!seen.includes(t)) problems.push(`phone: the tour skipped "${t}" (saw ${seen.join(" / ")})`);
if (!(await phone.locator(".curves").count())) problems.push("phone: after the tour, Focus is still on");
if ((await phone.getByRole("radio", { name: "α, β" }).getAttribute("aria-checked")) !== "true") problems.push("phone: after the tour, the view is not back to α, β");
if (!(await phone.locator('svg[aria-label="sodium current family"]').count())) problems.push("phone: after the tour, the clamp INa family is not back");
for (const b of ["potassium", "I–V", "conductance"]) if ((await isPressed(phone, b)) !== "false") problems.push(`phone: after the tour, ${b} is still on`);
if ((await isPressed(phone, "measuring cursor")) !== "false") problems.push("phone: after the tour, the cursor is still on");
if (await phone.locator(".stepper").count()) problems.push("phone: after the tour, Step is still on");
if ((await phone.locator(".panel input[type=range]").first().inputValue()) !== sliderBefore) problems.push("phone: after the tour, the slider moved");
await phone.getByRole("button", { name: "Spike (action potential)" }).tap();
await phone.waitForTimeout(100);
if ((await phone.getByRole("button", { name: "I", exact: true }).getAttribute("class"))?.includes("on") !== true) problems.push("phone: after the tour, the spike traces are not back to I");
await untoured(phone, "phone spike");
await phone.getByRole("button", { name: "Voltage clamp" }).tap();

// m, h and n together: the curve card's buttons toggle, they do not switch
await phone.getByRole("button", { name: "show h" }).tap();
await phone.getByRole("button", { name: "show n" }).tap();
await phone.waitForTimeout(150);
const pressed = await phone.locator('.gate-pick button[aria-pressed="true"]').count();
if (pressed !== 3) problems.push(`phone: after turning on h and n, ${pressed} gates are shown, not 3`);
await phone.screenshot({ path: `${out}/phone-ab-mhn.png` });
await phone.getByRole("button", { name: "log scale" }).tap();
await phone.waitForTimeout(100);
await phone.screenshot({ path: `${out}/phone-ab-mhn-log.png` });
await phone.getByRole("button", { name: "log scale" }).tap();
await phone.getByRole("radio", { name: "x∞, τ" }).tap();
await phone.waitForTimeout(150);
await phone.screenshot({ path: `${out}/phone-it-mhn.png` });
await phone.getByRole("button", { name: "show n" }).tap();
await phone.waitForTimeout(80);
if ((await phone.locator('.gate-pick button[aria-pressed="true"]').count()) !== 2) problems.push("phone: turning n off did not leave two gates");
await phone.getByRole("radio", { name: "α, β" }).tap();

// the switch, every chip, every gate, both experiments
await phone.getByRole("radio", { name: "x∞, τ" }).tap();
await phone.waitForTimeout(150);
await phone.screenshot({ path: `${out}/phone-it.png` });
if ((await phone.locator(".pair .plot").count()) !== 2) problems.push("phone: x∞, τ view does not show two plots");
await noSideways(phone, "phone x∞, τ");
for (const chip of ["m", "h", "n", "Na", "K", "Membrane", "Protocol"]) {
  await phone.locator(".chips").getByRole("tab", { name: chip, exact: true }).tap();
  await phone.waitForTimeout(80);
  if ((await phone.locator(".panel .slider").count()) < 1) problems.push(`phone: chip ${chip} shows no controls`);
  await noSideways(phone, `phone chip ${chip}`);
}
await phone.locator(".chips").getByRole("tab", { name: "h", exact: true }).tap();
// an edit in the x∞, τ view: the τ scale up, and the note must appear
await phone.getByRole("button", { name: "increase τh scale" }).tap();
await phone.waitForTimeout(100);
if (!(await phone.locator(".note").count())) problems.push("phone: a τ edit showed no note");
await phone.getByRole("radio", { name: "α, β" }).tap();
await phone.waitForTimeout(100);
if (!(await phone.locator(".other").count())) problems.push("phone: an x∞, τ edit is not shown in the α, β view");
await phone.screenshot({ path: `${out}/phone-ab-other-edit.png` });
// pinch to zoom the time axis on the clamp traces: two synthetic touch pointers spreading apart
const pinch = async (sel) => {
  await phone.evaluate((sel) => {
    const svg = document.querySelector(sel);
    const r = svg.getBoundingClientRect();
    const y = r.top + r.height / 2, c = r.left + r.width * 0.3;
    const ev = (type, id, x) => svg.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType: "touch", bubbles: true }));
    ev("pointerdown", 11, c - 20); ev("pointerdown", 12, c + 20);
    for (let k = 1; k <= 8; k++) { ev("pointermove", 11, c - 20 - 10 * k); ev("pointermove", 12, c + 20 + 10 * k); }
    ev("pointerup", 11, c - 100); ev("pointerup", 12, c + 100);
  }, sel);
  await phone.waitForTimeout(150);
};
const lastTick = async (sel) => phone.evaluate((sel) => { const t = [...document.querySelectorAll(`${sel} .tick`)].filter((e) => e.getAttribute("text-anchor") === "middle"); return t.length ? parseFloat(t[t.length - 1].textContent) : NaN; }, sel);
const tracesSel = 'svg[aria-label="sodium current family"]';
const before = await lastTick(tracesSel);
await pinch(tracesSel);
const after = await lastTick(tracesSel);
if (!(after < before)) problems.push(`phone: pinching the clamp traces did not zoom the time axis (${before} -> ${after})`);
if (!(await phone.getByRole("button", { name: "Reset zoom" }).count())) problems.push("phone: zoomed, but no Reset zoom button");
if ((await phone.getByRole("button", { name: "Reset zoom" }).count()) > 1) problems.push("phone: more than one Reset zoom button");
await phone.screenshot({ path: `${out}/phone-clamp-zoomed.png` });
await phone.getByRole("button", { name: "Reset zoom" }).tap();
await phone.waitForTimeout(100);
if ((await lastTick(tracesSel)) !== before) problems.push("phone: Reset zoom did not restore the full time axis");
if (!(await phone.locator('svg[aria-label="voltage-clamp protocol"]').count())) problems.push("phone: no protocol strip on the clamp traces");

// the touch cursor: off by default; a tap measures; a pinch still zooms
if (await phone.locator(".reading").count()) problems.push("phone: the cursor is on by default");
await phone.getByRole("button", { name: "measuring cursor" }).tap();
const pb = await phone.locator(tracesSel).boundingBox();
await phone.touchscreen.tap(pb.x + pb.width * 0.4, pb.y + pb.height * 0.5);
await phone.waitForTimeout(150);
const pr = (await phone.locator(".reading").count()) ? await phone.locator(".reading").textContent() : "";
if (!pr.startsWith("t ")) problems.push(`phone: a tap did not place the cursor ("${pr}")`);
await phone.screenshot({ path: `${out}/phone-cursor.png` });
await phone.waitForTimeout(400); // past the double-tap window
await pinch(tracesSel);
if (!((await lastTick(tracesSel)) < before)) problems.push("phone: with the cursor on, a pinch no longer zooms");
await phone.getByRole("button", { name: "Reset zoom" }).tap();
await phone.getByRole("button", { name: "measuring cursor" }).tap();

await phone.getByRole("button", { name: "Action potential" }).tap();
await phone.waitForTimeout(200);
await phone.screenshot({ path: `${out}/phone-spike.png` });
if (!(await phone.locator('svg[aria-label="current pulse protocol"]').count())) problems.push("phone: no protocol strip on the action potential");
// the simulation header is one row on a phone, in both experiments
const headRows = async () => phone.evaluate(() => { const h = document.querySelector(".sim .card-head"); const tops = new Set([...h.querySelectorAll("button")].map((b) => Math.round(b.getBoundingClientRect().top))); return tops.size; });
if ((await headRows()) !== 1) problems.push("phone: the action potential header wraps");
await phone.getByRole("button", { name: "Voltage clamp" }).tap();
await phone.waitForTimeout(100);
if ((await headRows()) !== 1) problems.push("phone: the voltage clamp header wraps");
await phone.getByRole("button", { name: "Spike (action potential)" }).tap();
await phone.waitForTimeout(100);
await pinch('svg[aria-label="membrane potential"]');
await phone.screenshot({ path: `${out}/phone-spike-zoomed.png` });
const vTicks = await lastTick('svg[aria-label="currents during the action potential"]');
if (!(vTicks < 40)) problems.push(`phone: pinching V did not zoom the currents below it (last tick ${vTicks})`);
await phone.getByRole("button", { name: "Reset zoom" }).tap();
for (const t of ["g", "m h n"]) { await phone.getByRole("button", { name: t, exact: true }).tap(); await phone.waitForTimeout(80); }
// stepping through: one sweep at a time on the clamp, then the pulses up to threshold, then your own pulses
const stepText = async (pg) => (await pg.locator(".step-text").textContent()) ?? "";
await phone.getByRole("button", { name: "I", exact: true }).tap();
await phone.getByRole("button", { name: "Voltage clamp" }).tap();
await phone.getByRole("button", { name: "step through" }).tap();
await phone.waitForTimeout(100);
if (!(await stepText(phone)).startsWith("Step 1 of")) problems.push(`phone: stepping the clamp did not start at step 1 ("${await stepText(phone)}")`);
await phone.getByRole("button", { name: "next step" }).tap();
await phone.getByRole("button", { name: "next step" }).tap();
await phone.waitForTimeout(100);
if (!(await stepText(phone)).startsWith("Step 3 of")) problems.push(`phone: two taps forward did not reach step 3 ("${await stepText(phone)}")`);
const visibleSweeps = await phone.locator('svg[aria-label="sodium current family"] path[d^="M"]').count();
await phone.screenshot({ path: `${out}/phone-step-clamp.png` });
await phone.getByRole("button", { name: "previous step" }).tap();
await phone.waitForTimeout(80);
if (!(await stepText(phone)).startsWith("Step 2 of")) problems.push("phone: back did not step back");
if (!(visibleSweeps > 0)) problems.push("phone: stepping the clamp drew no sweeps");
await noSideways(phone, "phone stepping");
await phone.getByRole("button", { name: "Spike (action potential)" }).tap();
await phone.waitForTimeout(200);
if (!(await stepText(phone)).startsWith("Pulse 1 of")) problems.push(`phone: stepping the spike did not start at pulse 1 ("${await stepText(phone)}")`);
let sawThreshold = false, sawSpike = false;
for (let i = 0; i < 20; i++) {
  const t = await stepText(phone);
  if (t.includes("Threshold is")) sawThreshold = true;
  if (/, spike/.test(t)) sawSpike = true;
  if (await phone.getByRole("button", { name: "next step" }).isDisabled()) break;
  await phone.getByRole("button", { name: "next step" }).tap();
  await phone.waitForTimeout(60);
  if (i === 5) await phone.screenshot({ path: `${out}/phone-step-spike-sub.png` });
}
if (!sawThreshold || !sawSpike) problems.push(`phone: stepping the pulses never crossed threshold (threshold ${sawThreshold}, spike ${sawSpike})`);
await phone.screenshot({ path: `${out}/phone-step-spike-end.png` });
await phone.locator(".chips").getByRole("tab", { name: "Protocol", exact: true }).tap();
// the clamp family is editable: one more step size shortens the family
await phone.getByRole("button", { name: "increase step spacing" }).tap();
await phone.waitForTimeout(100);
if (!(await phone.getByText(/10 steps from −55 to 45 mV by 11/).count())) problems.push("phone: the clamp step spacing did not change the family");
await phone.getByRole("button", { name: "decrease step spacing" }).tap();
await phone.getByRole("radio", { name: "My own" }).tap();
await phone.waitForTimeout(150);
if (!(await phone.getByText("first pulse").count())) problems.push("phone: My own pulses shows no controls");
await phone.getByRole("button", { name: "increase pulses" }).tap();
await phone.waitForTimeout(150);
if (!/of \d+/.test(await stepText(phone))) problems.push("phone: no step text with my own pulses");
await phone.screenshot({ path: `${out}/phone-step-own.png` });
await phone.getByRole("radio", { name: "Around threshold" }).tap();
// a slider changes the cell, not the pulses: the pulse stays put, and Re-center rebuilds them around the new threshold
await phone.waitForTimeout(150);
const pulseAmp = (t) => /: (\S+) µA\/cm²/.exec(t)?.[1];
const ampBefore = pulseAmp(await stepText(phone));
await phone.locator(".chips").getByRole("tab", { name: "Na", exact: true }).tap();
for (let i = 0; i < 15; i++) await phone.getByRole("button", { name: "decrease ḡNa" }).tap();
await phone.waitForTimeout(200);
const afterSlide = await stepText(phone);
if (pulseAmp(afterSlide) !== ampBefore) problems.push(`phone: a slider changed the pulse (${ampBefore} → "${afterSlide}")`);
if (!afterSlide.includes("were set around")) problems.push(`phone: after a slider the step text does not say where threshold was ("${afterSlide}")`);
await phone.screenshot({ path: `${out}/phone-step-moved.png` });
await phone.getByRole("button", { name: "Re-center" }).tap();
await phone.waitForTimeout(200);
if (await phone.getByRole("button", { name: "Re-center" }).count()) problems.push("phone: Re-center did not re-center");
for (let i = 0; i < 15; i++) await phone.getByRole("button", { name: "increase ḡNa" }).tap();
await phone.locator(".chips").getByRole("tab", { name: "Protocol", exact: true }).tap();
await phone.getByRole("button", { name: "step through" }).tap();
await phone.waitForTimeout(80);
if (await phone.locator(".stepper").count()) problems.push("phone: turning Step off left the stepper");
// focus: the curves card goes, the traces take its height, and the traces and a slider still share the screen
const focusVis = async (pg) => pg.evaluate(() => {
  const r = (s) => document.querySelector(s)?.getBoundingClientRect();
  const s = r(".sim"), k = r(".controls .slider");
  return { curves: !!document.querySelector(".curves"), simBottom: s?.bottom, sliderTop: k?.top, h: innerHeight };
});
const spikeVH = async (pg) => (await pg.locator('svg[aria-label="membrane potential"]').boundingBox())?.height ?? 0;
const vBefore = await spikeVH(phone);
await phone.getByRole("button", { name: "focus on the traces" }).tap();
await phone.waitForTimeout(150);
await phone.screenshot({ path: `${out}/phone-focus-spike.png` });
const fv = await focusVis(phone);
if (fv.curves) problems.push("phone: Focus left the curves card");
if (!(fv.simBottom <= fv.h && fv.sliderTop < fv.h - 44)) problems.push(`phone: in Focus the traces and a slider are not on screen together ${JSON.stringify(fv)}`);
if (!((await spikeVH(phone)) > vBefore * 1.5)) problems.push(`phone: Focus did not make the V trace taller (${vBefore} -> ${await spikeVH(phone)})`);
await noSideways(phone, "phone focus");
await phone.getByRole("button", { name: "Voltage clamp" }).tap();
await phone.waitForTimeout(150);
await phone.screenshot({ path: `${out}/phone-focus-clamp.png` });
const fc = await focusVis(phone);
if (!(fc.simBottom <= fc.h && fc.sliderTop < fc.h - 44)) problems.push(`phone: in Focus the clamp and a slider are not on screen together ${JSON.stringify(fc)}`);
await phone.getByRole("button", { name: "Spike (action potential)" }).tap();
await phone.getByRole("button", { name: "focus on the traces" }).tap();
await phone.waitForTimeout(100);
if (!(await phone.locator(".curves").count())) problems.push("phone: turning Focus off did not bring the curves back");

await phone.getByRole("button", { name: "Why" }).tap();
await phone.waitForTimeout(100);
await phone.screenshot({ path: `${out}/phone-about.png` });
if (!(await phone.getByRole("heading", { name: "Versions" }).count())) problems.push("phone: About has no Versions section");
await phone.getByRole("button", { name: "Close" }).tap();

// ---------------------------------------------------------------- wide
const wide = await open({ viewport: { width: 1440, height: 900 } });
await wide.screenshot({ path: `${out}/wide-ab.png` });
// the mouse: drag across the traces zooms to the dragged window; double-click resets; the wheel zooms
const wSel = 'svg[aria-label="sodium current family"]';
const wTick = async () => wide.evaluate((sel) => { const t = [...document.querySelectorAll(`${sel} .tick`)].filter((e) => e.getAttribute("text-anchor") === "middle"); return parseFloat(t[t.length - 1].textContent); }, wSel);
const tb = await wide.locator(wSel).boundingBox();
const full0 = await wTick();
await wide.mouse.move(tb.x + tb.width * 0.2, tb.y + tb.height / 2);
await wide.mouse.down();
await wide.mouse.move(tb.x + tb.width * 0.4, tb.y + tb.height / 2, { steps: 6 });
await wide.mouse.up();
await wide.waitForTimeout(150);
const dragged = await wTick();
if (!(dragged < full0)) problems.push(`wide: dragging across the traces did not zoom (${full0} -> ${dragged})`);
await wide.screenshot({ path: `${out}/wide-zoomed.png` });
await wide.mouse.dblclick(tb.x + tb.width * 0.5, tb.y + tb.height / 2);
await wide.waitForTimeout(150);
if ((await wTick()) !== full0) problems.push("wide: double-click did not reset the zoom");
await wide.mouse.move(tb.x + tb.width * 0.3, tb.y + tb.height / 2);
await wide.mouse.wheel(0, -400);
await wide.waitForTimeout(150);
if (!((await wTick()) < full0)) problems.push("wide: the wheel did not zoom");
await wide.getByRole("button", { name: "Reset zoom" }).click();
if (!(await wide.getByText("Drag across the traces").count())) problems.push("wide: no mouse zoom hint");
await noSideways(wide, "wide");
// the lecture screen: the arrow keys (and a clicker's Page Down) step
await wide.getByRole("button", { name: "step through" }).click();
await wide.keyboard.press("ArrowRight");
await wide.keyboard.press("PageDown");
await wide.waitForTimeout(100);
if (!(await stepText(wide)).startsWith("Step 3 of")) problems.push(`wide: the keys did not step ("${await stepText(wide)}")`);
await wide.screenshot({ path: `${out}/wide-step-clamp.png` });
await wide.getByRole("button", { name: "I–V" }).click();
await wide.waitForTimeout(100);
await wide.screenshot({ path: `${out}/wide-step-iv.png` });
await wide.getByRole("button", { name: "I–V" }).click();
await wide.getByRole("button", { name: "step through" }).click();
// INa and IK toggle, together on one plot
await wide.getByRole("button", { name: "potassium", exact: true }).click();
await wide.waitForTimeout(100);
if (!(await wide.locator('svg[aria-label="sodium and potassium current families"]').count())) problems.push("wide: INa and IK together did not draw both families");
await wide.screenshot({ path: `${out}/wide-both.png` });
await wide.getByRole("button", { name: "potassium", exact: true }).click();
// g: the clamp shows conductances instead of currents
await wide.getByRole("button", { name: "conductance", exact: true }).click();
await wide.waitForTimeout(100);
if (!(await wide.locator('svg[aria-label="sodium conductance family"]').count())) problems.push("wide: g did not draw the sodium conductance family");
await wide.getByRole("button", { name: "g–V" }).click();
await wide.waitForTimeout(100);
if (!(await wide.locator('svg[aria-label="conductance-voltage relation"]').count())) problems.push("wide: g with I–V did not draw the g–V");
await wide.screenshot({ path: `${out}/wide-gv.png` });
await wide.getByRole("button", { name: "g–V" }).click();
await wide.getByRole("button", { name: "conductance", exact: true }).click();
// the mouse cursor: a click measures, dragging the line moves it, and a drag elsewhere still zooms
const reading = async () => (await wide.locator(".reading").count()) ? await wide.locator(".reading").textContent() : "";
await wide.getByRole("button", { name: "measuring cursor" }).click();
const cb = await wide.locator(wSel).boundingBox();
await wide.mouse.click(cb.x + cb.width * 0.3, cb.y + cb.height * 0.5);
await wide.waitForTimeout(100);
const r1 = await reading();
if (!r1.startsWith("t ")) problems.push(`wide: a click did not place the cursor ("${r1}")`);
if ((await wTick()) !== full0) problems.push("wide: a click to measure zoomed");
// grab the line where it was placed and drag it right (after a pause: two quick presses in one place are a double-click)
await wide.waitForTimeout(400);
const lx = await wide.evaluate((sel) => { const l = document.querySelector(`${sel} .cursor`); const r = l.getBoundingClientRect(); return r.left + r.width / 2; }, wSel);
await wide.mouse.move(lx, cb.y + cb.height * 0.5);
await wide.mouse.down();
await wide.mouse.move(lx + cb.width * 0.2, cb.y + cb.height * 0.5, { steps: 6 });
await wide.mouse.up();
await wide.waitForTimeout(100);
const r2 = await reading();
if (r2 === r1) problems.push("wide: dragging the cursor line did not move it");
if ((await wTick()) !== full0) problems.push("wide: dragging the cursor line zoomed");
await wide.screenshot({ path: `${out}/wide-cursor.png` });
await wide.mouse.move(cb.x + cb.width * 0.05, cb.y + cb.height * 0.5);
await wide.mouse.down();
await wide.mouse.move(cb.x + cb.width * 0.15, cb.y + cb.height * 0.5, { steps: 6 });
await wide.mouse.up();
await wide.waitForTimeout(100);
if (!((await wTick()) < full0)) problems.push("wide: with the cursor on, a drag no longer zooms");
await wide.getByRole("button", { name: "Reset zoom" }).click();
await wide.getByRole("button", { name: "measuring cursor" }).click();
if (await wide.locator(".reading").count()) problems.push("wide: turning the cursor off left a reading");
await wide.getByRole("button", { name: "focus on the traces" }).click();
await wide.waitForTimeout(150);
await wide.screenshot({ path: `${out}/wide-focus.png` });
if (await wide.locator(".curves").count()) problems.push("wide: Focus left the curves card");
const wf = await wide.evaluate(() => { const s = document.querySelector(".sim").getBoundingClientRect(); return { bottom: s.bottom, h: innerHeight }; });
if (!(wf.bottom <= wf.h)) problems.push(`wide: in Focus the simulation card runs off the screen ${JSON.stringify(wf)}`);
await wide.getByRole("button", { name: "focus on the traces" }).click();
await wide.getByRole("radio", { name: "x∞, τ" }).click();
await wide.waitForTimeout(150);
await wide.screenshot({ path: `${out}/wide-it.png` });

// ---------------------------------------------------------------- 1952
// the model paper's figures: a guided walk ends on the paper's data, a challenge is met by setting the rig
// while it is under review (SHOW_1952 in src/App.tsx) there is no button: open it by its address
const b1952 = wide.getByRole("button", { name: "1952", exact: true });
if (await b1952.count()) await b1952.click();
else await wide.evaluate(() => { location.hash = "1952"; });
await wide.waitForTimeout(300);
if (!(await wide.locator(".retro").count())) problems.push("1952: the button did not open the 1952 screen");
await untoured(wide, "1952");
await noSideways(wide, "1952");
const rNext = () => wide.getByRole("button", { name: "next step" });
for (let i = 0; i < 10 && !(await rNext().isDisabled()); i++) await rNext().click();
await wide.waitForTimeout(150);
const paperCircles = await wide.locator('svg[aria-label="conductance during the clamp steps"] circle').count();
if (paperCircles < 100) problems.push(`1952: the last step of Fig. 3 shows ${paperCircles} of the paper's points`);
await wide.screenshot({ path: `${out}/wide-1952-fig3.png` });
// Fig. 12 as a challenge, in modern signs: set the shocks and the temperature, and it says so
await wide.getByRole("button", { name: /Fig\. 12/ }).click();
await wide.getByRole("radio", { name: "Challenge" }).click();
await wide.getByRole("radio", { name: "Modern" }).click();
await wide.getByRole("radio", { name: "Shock" }).click();
await wide.locator(".r-field input").fill("90, 15, 7, 6");
await wide.locator(".r-field input").press("Enter");
for (let i = 0; i < 3; i++) await wide.getByRole("button", { name: "decrease temperature" }).click();
await wide.waitForTimeout(200);
const verdict = (await wide.locator(".r-check").textContent()) ?? "";
if (!verdict.startsWith("✓")) problems.push(`1952: the Fig. 12 challenge was set up and not met ("${verdict}")`);
if (!(await wide.locator(".t4").count())) problems.push("1952: the met Fig. 12 challenge does not show Table 4");
if (!(await wide.getByText("V (mV)", { exact: true }).count())) problems.push("1952: modern signs do not label the voltage V (mV)");
await wide.screenshot({ path: `${out}/wide-1952-fig12-challenge.png` });
await wide.getByRole("radio", { name: "1952 signs" }).click();
await wide.waitForTimeout(100);
if (!(await wide.getByText(/−V \(mV\)/).count())) problems.push("1952: the paper's signs do not plot −V");
await wide.getByRole("button", { name: "Back to HHhero" }).click();
await wide.waitForTimeout(200);
if (await wide.locator(".retro").count()) problems.push("1952: Back did not leave the 1952 screen");

await browser.close();
if (problems.length) {
  console.error(`${problems.length} problem(s):\n  ` + problems.join("\n  "));
  process.exit(1);
}
console.log(`ok: screenshots in ${out}/`);
