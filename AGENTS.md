# AGENTS.md

For an AI agent working in this repository. Humans want `README.md`.

## What this is

A phone-first teaching page for one idea: a Hodgkin–Huxley gate written as
rates (α, β) or as steady state and time constant (x∞, τ), with a switch
between the two. One model, two sets of controls. The core is `src/core/`
(pure TypeScript, no DOM); the UI is React with hand-drawn SVG plots.

## Commands

- `npm test`: vitest. The suite is the contract. `hh.test.ts` holds the model
  to NEURON's spike times and to the 1952 paper's equations; `views.test.ts`
  holds the two views to being one model, and every note the app shows to
  being true.
- `npx tsc -b`: typecheck (vitest does not). `npm run build`: static bundle.
- `node scripts/screenshot.mjs <url> <outdir>`: look at the app. Phone
  (360×740, touch) first, then wide. Fails on console errors, third-party
  requests, sideways scroll, touch targets under 44 px, or plots and controls
  not on screen together. Run it after any UI change.
- `npm run deploy`: the only way to deploy (on Windows, `bash scripts/deploy.sh`
  from Git Bash). Do not hand-roll `wrangler deploy`.
  It also rebuilds the two previous releases into `dist/v/<version>/`, so
  users can go back (`scripts/earlier-versions.ts`; About links to them).
  Those builds use today's node_modules: a dependency change can break them.

## Rules that are load-bearing

- **Every control gets a tour caption.** The Tour (`src/ui/Tour.tsx`) knows
  no features: it walks whatever carries `{...tour(title, text)}` in page
  order and shows each working (toggles pressed and released, picks chosen
  then restored, a slider nudged). A new button joins the tour by getting a
  caption; the screenshot check fails on a visible button without one.

- **The switch never changes the model.** Each view keeps its own edits,
  applied in a fixed order (α/β constants, then the conversion, then the x∞/τ
  edits). At no edit both views are the stock model to the bit. A view's edits
  are never hidden in the other view.
- **Every note the app shows is a tested claim** (`src/core/notes.ts` and
  `views.test.ts`). Add the test with the note.
- **If you change the integrator or dt, re-run the NEURON check.** The
  reference data are `src/core/oracle/neuron_hh.json`;
  `tools/neuron_oracle_hh.py` regenerates them.
- **`src/core/reference.ts` is a verbatim copy** of gaba_excites' HH gates. Do
  not edit it.
- **Phone first.** Design at 360 px portrait; the wide layout is the extra.
  Touch targets at least 44 px. The plot and the control being moved are on
  screen together.
- **No third-party requests, ever.** No CDNs, fonts, analytics. The CSP is
  injected into the built HTML by `vite.config.ts`.
- **The Born stamp comes from the root commit.** Never rewrite it; never build
  from a shallow clone.
- **Under review: not indexed.** `public/robots.txt` disallows all and
  `_headers` sends `X-Robots-Tag: noindex` until the owner approves.
- **Cite through `lit/sources.json`.** Never commit a PDF (`lit/pdf/` is
  gitignored; this repository is public).
- **Log the process** in `docs/process.md`: decisions and why.
- Imports carry explicit `.ts` extensions. House style: "data" is plural.
  Name things instead of pointing at "step 4" or "option 2".
