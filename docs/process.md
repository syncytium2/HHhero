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
