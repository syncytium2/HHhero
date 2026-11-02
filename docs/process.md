# Process

The running record of decisions and why. Newest last.

## 2026-10-30: born

The owner, in a gaba_excites session, asked for "a focused second app looking
only at the HH equations to allow students to see currents, act/inact curves,
and manipulate HH parameters", optimized for a smartphone, with a lecture
screen as a bonus ("students will likely get both experiences"). Of the many
lessons the 1952 paper holds, the owner chose one to build first: "switching
between the formulations xinf and tau ... toggle the controls/sim between the
two. the rest keep in mind once we get a reviewable tool live." The rest is in
`docs/roadmap.md`.

**A separate repository, not a page inside gaba_excites or a long-lived
branch.** gaba_excites deploys only from `main`, so a branch could not go live
for review; a page inside it would ship whatever was on gaba_excites' `main`
with every HHhero release, and another session was working on that site. The
shared part is small and the 1952 equations do not change, so copying it is
cheap and will not drift. The owner named it HHhero and chose the subdomain
hhhero.tonydefazio.com. Both were checked free first: no GitHub repository of
that name on the account, no DNS record.

**Copied from gaba_excites at 25d74e3**, unchanged:
`src/core/oracle/neuron_hh.json` (NEURON 9.0.2 running its built-in hh
mechanism), `tools/neuron_oracle_hh.py` (which writes it),
`lit/notes/hodgkin1952.md`, the two `lit/sources.json` entries behind them,
the HH gate code as `src/core/reference.ts` (tests only), and LICENSE,
`.gitattributes`, `.gitignore`, `.nvmrc`, `tsconfig.json`. The CSP, the Born
stamp, `_headers` and the deploy runbook follow gaba_excites' pattern, cut down.

**One model, two sets of controls.** x∞ = α/(α+β) and τ = 1/(φ(α+β)) invert
exactly (α = x∞/τ, β = (1 − x∞)/τ), so the switch changes which curves the
student holds, never the model. Considered and set aside for now: making the
x∞/τ view a Boltzmann x∞ with a bell τ fitted to HH. That would change the
model when the switch flips, which is a different lesson ("the modern refit"),
and is on the roadmap.

**The controls.** α/β view: each rate's own constants (A, V0, k) in the form
Hodgkin and Huxley wrote it (linoid, exponential, sigmoid; p. 519). x∞/τ view:
the x∞ midpoint and steepness (pivoting about the midpoint the α/β constants
give), and τ's scale and shift. Each view's edits are kept separately and
applied in a fixed order; at no edit the curves are returned untouched, so the
defaults are the stock model to the bit, not to rounding.

**The notes**, shown when an edit has a simple meaning in the other view:
both rates × c leaves x∞ alone and divides τ by c (what temperature does);
both rates shifted together slide x∞ and τ together; any one α or β constant
moved alone moves both curves; an x∞ edit leaves τ alone and vice versa; τ × c
is α and β × 1/c. Each is a test in `views.test.ts`.

**The simulation.** Voltage clamp is ideal and closed form: at a fixed voltage
each gate relaxes as an exponential, so a step family is a formula and redraws
as fast as a slider moves. Current clamp is NEURON's fixed-step scheme as
gaba_excites runs it: V by backward Euler with the conductances held over the
step, then each gate relaxed exactly at the new V. Measured 2026-10-30 against
NEURON: all 21 sweeps the same spike counts (0 to 280), 912 spikes, worst
error 0.010 ms (one dt). The crossing is interpolated, as NEURON's side is.

**Phone first.** The switch, the plots and the controls are on screen
together at 360×740; the controls panel scrolls on its own. Every button and
slider is at least 44 px (the gate picker and trace tabs 36). Plots are
hand-drawn SVG: a few hundred points each, and owning the drawing makes a
press-and-drag voltage cursor simple (phones have no hover). The stock model
stays in gray under every edited curve.

**Under review, not indexed**: robots.txt disallows all, `X-Robots-Tag:
noindex`, and no sitemap, until the owner approves. Not linked from
gaba_excites.

## 2026-10-30: first deploy, v0.1.1

The owner ran the publish commands from WSL. `gh repo create` had already made
the (empty) repository on an earlier run, and WSL has no `node`, so the deploy
bumped the version and stopped. The bump was undone, `main` pushed, and the
deploy run from Git Bash: v0.1.1, live at hhhero.tonydefazio.workers.dev and
hhhero.tonydefazio.com, both serving the bundle with `X-Robots-Tag: noindex`.
The script's own check of the custom domain was skipped because the
university's DNS still cached the name as nonexistent (it had been looked up
before the record existed); fetched through Cloudflare's edge directly, it
served the deployed bundle. The deploy script now refuses to start without
node and npm, and says to use Git Bash.

## 2026-10-30: m, h and n together; a protocol strip; zoom; American spelling

The owner, after trying v0.1.1: "add the ability to show m, h, and n on the
same display (clicking toggles on off, not switch between)"; "need an easy
horizontal zoom that works on a phone for second row"; "need a row showing
the protocol in the second row"; and "kill the british spellings everywhere".

- **Gates drawn together.** The m, h, n buttons on the curve card toggle which
  gates are drawn (at least one stays on). The m, h, n chips under the plots
  still choose which gate the sliders edit, and choosing one also draws it.
  With all three on, βm (up to about 28/ms) flattens h and n on a linear axis,
  so the rate and τ plots have a **log** switch (off by default; the floor is
  1e-4). End labels are spread apart so none overlaps (`src/ui/labels.ts`,
  tested). The readout lists every drawn gate at the cursor.
- **Protocol strip.** Above the traces, a thin plot of what the experimenter
  commands: the clamp's voltage steps, or the injected current pulse, on the
  traces' time axis. Not shown with the I–V plot, whose axis is voltage.
- **Zoom.** Pinch the time axis, drag to pan once zoomed, double-tap or the
  caption's Reset zoom to return. The strip and every trace on one
  experiment share one view. The arithmetic is pure and tested
  (`src/ui/zoom.ts`); the screenshot check pinches with synthetic touch
  pointers and checks the axis narrowed, the plots below followed, and the
  reset restored it.
- **American spelling everywhere**: "centre" and "grey" were in the UI and
  comments; now "center" and "gray".

## 2026-10-30: zoom with a mouse

The owner, on the university workstation: "can we detect if we're on a desktop
and there are no gestures? click and drag doesn't zoom". No separate desktop
mode was needed: every pointer event says whether it came from a mouse, a
finger or a pen, so the plot answers each in its own way. With a mouse, drag
across the traces to zoom to the dragged window (a shaded band shows it),
scroll to zoom about the pointer, scroll sideways to pan, double-click to
reset. A trackpad pinch reaches the page as a wheel event with ctrlKey, so it
zooms too. Touch is unchanged. The caption shows the mouse hint when the
device can hover with a fine pointer, and the touch hint otherwise. The
arithmetic is in `src/ui/zoom.ts` (`selectView`, `wheelView`), tested; the
screenshot check drags, double-clicks and scrolls with a real mouse.

Two bugs found on the way, both now fixed. Plots started at a placeholder
width and measured themselves after the first paint, so a drag started in
that moment mapped to the wrong times; they now measure before painting. And
the double-tap timer started at time zero, so a press within 300 ms of the
page loading counted as a double-tap and reset the zoom.

## 2026-10-30: stepping through, for teaching from the front

The owner asked for "presentation mode where you can step through the
protocol with fwd and back button. Similar for spike mode with small steps
sub threshold to show threshold", then "need the protocol mode to be editable
for spike mode". The Step switch over the traces shows one sweep at a time,
with forward and back buttons; earlier sweeps stay faded and the axes stay
where the whole family puts them, so nothing jumps. On the clamp it walks the
voltage steps, and the I–V builds a point at a time. On the action potential
it walks a ladder of pulse amplitudes. By default the ladder is built around
this cell's own threshold, found by bisection: even, round steps below it,
then 1% under and 1% over (all or none), then twice threshold (a shorter
delay). The threshold is named only once a pulse crosses it. The Protocol
panel can replace the ladder with your own: first pulse, step size, number of
pulses. Arrow keys and Page Up/Down step too, which is what a presentation
clicker sends.

What counts as firing: a −20 mV crossing after the pulse starts, with the
peak inward INa larger than the pulse. Without the second condition, a big
enough pulse into a cell with no sodium conductance crosses −20 mV passively
and would be called a spike. Code in `src/core/sim.ts` (`fires`,
`pulseThreshold`, `thresholdLadder`, `evenLadder`); tests in
`src/core/steps.test.ts`; the screenshot check steps both experiments, the
custom ladder and the keys.

## 2026-10-30: the clamp family is editable

Asked for right after stepping went live. Protocol now sets the first step,
the last step and the step spacing as well as the hold and step length. The
first step is kept at or below the last, so the family always has at least
one sweep. The clamp slider is called "step spacing" so that it differs from
the "step size" of your own pulse ladder.

## 2026-10-31: a measuring cursor on the traces; INa and IK together

The owner asked whether a cursor measurement could live on the traces
without interfering with zoom, then: "Build it with a toggle to disable, off
by default." The Cursor button in the caption row turns it on. The gestures
split by movement: a tap or click that barely moves (under 8 px) places the
cursor, a press within 22 px of the cursor line drags it, and every other
gesture zooms and pans as before. The tap also reports the height tapped, so
on a clamp family it picks the sweep drawn nearest the tap; that sweep is
bolded and labeled, and in step mode the cursor reads the current step. One
cursor per experiment, shared by every plot on its time axis, like the zoom.
The reading replaces the caption text, so it costs no height on a phone.

A double-tap (or double-click) now has to be two quick presses in the same
place (within 30 px). Before, any two presses within 300 ms reset the zoom,
which would have fired while measuring at two places in quick succession.

Also: "Enable showing both na and k in vclamp mode (make the buttons toggle
rather than switch). Separate the iv button", and "Na and k buttons would
toggle iv plot view too". INa and IK are now colored toggles like m, h and n
(at least one stays on). They choose the currents on the traces and on the
I–V alike; I–V is its own on/off button beside them.

## 2026-10-31: going back to an earlier version

The owner, now that students use it: "Just in case please add a version
selector so the user can revert to a previous version starting with the last
two versions." Each deploy now also builds the two releases before it from
their own "Release v…" commits (a temporary git worktree under `.versions/`,
gitignored, found by `scripts/earlier-versions.ts`) and serves them at
`/v/<version>/`, each with its own CSP and Born stamp. Rebuilt v0.1.3 and
v0.1.4 came out byte-for-byte the bundles that were deployed. The About
dialog's Versions section links to them; nothing is fetched, the list is
baked in at build. A version served under `/v/` says so in a banner with a
link back to the current one; versions built before this change (v0.1.5 and
earlier) do not have the banner, so the back button or the plain address is
the way back from those. The deploy checks each `/v/<version>/` answers 200
and records them in DEPLOYED.md. To keep more than two, change `KEEP` in
`scripts/earlier-versions.ts`.

Two Git Bash traps on the way: it rewrites an argument like `/v/0.1.4/` into
the Windows drive `v:`, so the build runs with `MSYS_NO_PATHCONV=1`, and with
that set, absolute paths stop being converted, so the build uses relative ones.

## 2026-10-31: the pulses stay put while a slider moves

The owner: dragging a parameter in step mode made the injected-current axis
jump; they want to set a pulse just under threshold, then move a parameter and
watch what it does. The "Around threshold" pulses were rebuilt from the cell's
threshold on every slider move, so the pulse itself changed. Now they are built
from the cell as it was when stepping began (or when "Around threshold" is
picked), and a slider changes only the cell. Once the cell has moved, the step
text drops "1% under threshold" (no longer true) and says where the pulses were
set and where threshold is now, with a Re-center button that rebuilds them
around the new threshold. Your own pulses were already fixed amplitudes.

## 2026-10-31: Focus

The owner asked how to collapse tiles so an instructor can focus on the trace
or the curves, then chose a single Focus button over a collapse chevron on each
card. Focus hides the curves card and the traces take its height: on a phone,
fixed heights that still leave a slider on screen (the screenshot check holds
that); on a wide screen, the window's height, so a projector's whole screen is
traces, less a row when Step is showing. The slider panel never hides, since
the point is to move one and watch. Off by default; remembered per device in
localStorage (`hhhero.focus`), so students see what they saw before, and an
instructor's laptop stays as it was left. Collapsing the simulation card
instead, to make the curves big, is not built; it would be the same mechanism.

## 2026-10-31: the tour, g in voltage clamp, and the link home

The owner asked for a quick tour that demos every feature, then: "Make it so
it adapts to new features automatically." So the tour has no list of
features. Each control carries a caption (`tour()` in `src/ui/Tour.tsx`)
beside its own code, and the tour walks whatever captioned elements are on
screen, in page order, acting by kind: a toggle is pressed and released, a
choice (radio, tab) is made and, at the end, put back, a slider gets five +
and five −. Choices wait until everything else on screen has been seen, so
choosing Action potential brings its own controls into the tour. The
screenshot check runs the whole tour and checks everything is back as it
was, and fails on any visible button without a caption: that is what keeps
"automatically" true. One bug found that way: five − presses in one instant
read the same starting value and moved the slider once, so the presses are
spaced.

Asked for "an I / g toggle for clamp mode", and to label the clamp tab
"V clamp" (Spike stays: more salient than "I clamp" before students know
voltage from current clamp). g swaps currents for conductances on the traces
and the I–V, which becomes a g–V (peak gNa, gK at the end of the step). To
keep a phone's header on one row, INa and IK became Na and K (they now
choose a channel, current or conductance), and the row's buttons tightened;
the screenshot check now fails if that header wraps.

The required link back to tonydefazio.com, without the usual arrow (the
owner finds it confusing) and without using vertical space: small, under
the HHhero name in the header, which is already as tall as its buttons; and
in About, "By Tony DeFazio".

## 2026-10-31: the 1952 screen

The owner: "a retro mode with green phosphor like old school mode in gaba
excites ... use the original conventions (with a toggle) and enable a student
to recreate each of the original experiments", by a guided walk ending on the
paper's figure or by being asked to recreate a figure. Advice first, then:
"start with the model paper ... Tracing is fine ... Focus on laptop mode."

What was built. A separate screen (`src/ui/Retro.tsx`, the **1952** button on
wide screens, or `#1952`) so nothing changes under students on the main app.
gaba_excites' Old school palette, the traces in phosphor green with a glow.
A sign toggle: the paper's V (displacement from rest, depolarization
negative) and current (inward positive), both stated on p. 505, and −V
plotted upward as the paper does from Fig. 12 on; or modern. A rig with two
drives, the paper's own: a voltage-clamp step, and a "shock" (V displaced
suddenly with the gates at rest, eqn. 26 with no current, p. 522). Steps are
kept as depolarizations, the paper's words, so only display and typing
follow the toggle. Three figures: Fig. 3 (gK families), Fig. 12 (membrane
action potentials), Fig. 19 (gK and h after the spike). Guided walks set the
rig a step at a time; challenges describe the figure and check the rig, and
when met, show the paper's data over the student's.

The paper's data. Fig. 3's smooth curves are not traced: Table 1 gives each
curve's final gK and τn, and eqn. (11) redraws them exactly (drawn over the
scan they land on the printed lines, which also proves the tracing's
calibration). Its circles are traced (`tools/trace/hh1952_fig3.py`, the
armory/no_peak method: calibrate from tick marks, find circles as enclosed
white holes, keep a review overlay out of git). Holes in printed digits
("88", "38", "6") were first read as points; the overlay caught them. The
PDF is the 2006 archive scan, the copy PubMed Central serves free, from the
owner's Dropbox lit folder; unlike Webster 1991 in no_peak, no subscription
terms attach to it. Fig. 12 needs no tracing for its upper family: those
are the paper's calculations, and the model reproduces them (Table 4's
heights to 0.1 mV, 7 mV fires and 6 does not); its recorded lower family is
on the roadmap.

What the model and axon 17 disagree on, said in the guide rather than
hidden: the model's ḡK is Table 3's standard axon, so its large-step gK
curves sit above axon 17's points. A first draft said gK "starts flat"; at
rest n is already 0.32, so the test showed a milder S (the first 0.1 ms at
about half the steepest rate) and the text now says "slowly, then faster".

## 2026-11-02: a Why page, for a viewer who arrives knowing nothing

The owner noticed the site had no "what is this" for a naive viewer. The
header's "?" (About) is now a Why button, and its page opens with the
owner's introduction to action potentials from gaba_excites (`/explainer`
there), quoted as written: its first and third paragraphs and its two
footnotes. The second paragraph, about gaba_excites' own cells (pyramidal,
interneuron, GnRH), is left out because HHhero has only the squid axon.
Then "Where this site fits": Hodgkin and Huxley's experiment, the one idea
HHhero is about (a gate as α, β or as x∞, τ), the 1952 screen, gaba_excites
for whole neurons, and Bezanilla's The Nerve Impulse for the biophysics.
The old About (the conversion, the model and its source, the versions)
follows, with GitHub named in full rather than as "source".

## 2026-11-02: public

The owner: "We should be public." The repository already was; the site
was kept out of search engines while under review. Now robots.txt allows
all crawlers, AI ones included (gaba_excites' policy), a sitemap lists the
one page (the 1952 screen is a hash, #1952, not a page of its own), and the
noindex header and meta tag are gone. The earlier versions under /v/ keep
`X-Robots-Tag: noindex`, so a search lands on the current one. Cloudflare's
managed robots.txt and AI-crawler blocking can override the file; check the
zone after the deploy, as no_peak's robots.txt describes.
