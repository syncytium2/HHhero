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
stays in grey under every edited curve.

**Under review, not indexed**: robots.txt disallows all, `X-Robots-Tag:
noindex`, and no sitemap, until the owner approves. Not linked from
gaba_excites.
