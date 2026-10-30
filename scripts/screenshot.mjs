// Look at the app, phone first, and fail loudly on what a phone user would hit.
//   node scripts/screenshot.mjs [url] [outdir]
// Checks, at 360×740 with touch (the design) and then 1440×900 (the lecture screen):
// no console errors, no request leaving the origin, no sideways scroll, the plots
// and the controls on screen together, every button and slider at least 44 px on
// the phone (the gate picker and trace tabs at least 36), and that both views and
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
      const min = e.closest(".gate-pick, .tabs") ? 36 : 44;
      return { t: (e.getAttribute("aria-label") || e.textContent || e.className).trim().slice(0, 30), h: Math.round(r.height), w: Math.round(r.width), min };
    })
    .filter((x) => x.h < x.min || x.w < Math.min(x.min, 36)),
);
for (const s of small) problems.push(`phone: touch target too small: "${s.t}" ${s.w}×${s.h} (min ${s.min})`);

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
await phone.getByRole("button", { name: "Action potential" }).tap();
await phone.waitForTimeout(200);
await phone.screenshot({ path: `${out}/phone-spike.png` });
for (const t of ["g", "m h n"]) { await phone.getByRole("button", { name: t, exact: true }).tap(); await phone.waitForTimeout(80); }
await phone.getByRole("button", { name: "about" }).tap();
await phone.waitForTimeout(100);
await phone.screenshot({ path: `${out}/phone-about.png` });
await phone.getByRole("button", { name: "Close" }).tap();

// ---------------------------------------------------------------- wide
const wide = await open({ viewport: { width: 1440, height: 900 } });
await wide.screenshot({ path: `${out}/wide-ab.png` });
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
