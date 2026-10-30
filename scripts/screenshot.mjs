// Look at the app, phone first, and fail loudly on what a phone user would hit.
//   node scripts/screenshot.mjs [url] [outdir]
// Checks, at 360×740 with touch (the design) and then 1440×900 (the lecture screen):
// no console errors, no request leaving the origin, no sideways scroll, the plots
// and the controls on screen together, every button and slider at least 44 px on
// the phone (the gate picker, log switch and trace tabs at least 36), and that both views and
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
      const min = e.closest(".gate-pick, .tabs, .log-btn") ? 36 : 44;
      return { t: (e.getAttribute("aria-label") || e.textContent || e.className).trim().slice(0, 30), h: Math.round(r.height), w: Math.round(r.width), min };
    })
    .filter((x) => x.h < x.min || x.w < Math.min(x.min, 36)),
);
for (const s of small) problems.push(`phone: touch target too small: "${s.t}" ${s.w}×${s.h} (min ${s.min})`);

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

await phone.getByRole("button", { name: "Action potential" }).tap();
await phone.waitForTimeout(200);
await phone.screenshot({ path: `${out}/phone-spike.png` });
if (!(await phone.locator('svg[aria-label="current pulse protocol"]').count())) problems.push("phone: no protocol strip on the action potential");
await pinch('svg[aria-label="membrane potential"]');
await phone.screenshot({ path: `${out}/phone-spike-zoomed.png` });
const vTicks = await lastTick('svg[aria-label="currents during the action potential"]');
if (!(vTicks < 40)) problems.push(`phone: pinching V did not zoom the currents below it (last tick ${vTicks})`);
await phone.getByRole("button", { name: "Reset zoom" }).tap();
for (const t of ["g", "m h n"]) { await phone.getByRole("button", { name: t, exact: true }).tap(); await phone.waitForTimeout(80); }
await phone.getByRole("button", { name: "about" }).tap();
await phone.waitForTimeout(100);
await phone.screenshot({ path: `${out}/phone-about.png` });
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
await wide.getByRole("radio", { name: "x∞, τ" }).click();
await wide.waitForTimeout(150);
await wide.screenshot({ path: `${out}/wide-it.png` });

await browser.close();
if (problems.length) {
  console.error(`${problems.length} problem(s):\n  ` + problems.join("\n  "));
  process.exit(1);
}
console.log(`ok: screenshots in ${out}/`);
