# HHhero

**The Hodgkin–Huxley gates, two ways.** Edit each gate as Hodgkin and Huxley
wrote it, as two rates (α opens, β closes), or as most models since write it,
as where it settles (x∞) and how fast it gets there (τ). Flip between the two
and watch the curves, the voltage-clamp currents and the action potential
change. Phone first; it also works on a lecture screen.

Live: https://hhhero.tonydefazio.com

## The idea

    x∞ = α / (α + β)        τ = 1 / (φ (α + β))
    α  = x∞ / τ             β = (1 − x∞) / τ

The conversion is exact both ways, so the switch never changes the model: it
changes which pair of curves you hold. In the α, β view every constant moves
both x∞ and τ. In the x∞, τ view you can move one and leave the other alone.
That difference is the lesson. Each view keeps its own edits; a gate edited
in the other view says so, with a reset.

In voltage clamp, the header picks the experiment, in two pairs. Voltage
dependence: Act, a family of steps, and Inact, prepulses to a family of
potentials before one test step; the I–V (h–V) button shows the curve of
the peaks instead of the traces. Time dependence: Inact, one prepulse held a little
longer each sweep, and Recovery, two pulses with a growing gap; the peaks
fall or rise along an exponential with τh, drawn on the traces.

Protocol, among the sliders, holds the epochs of whatever is running: up to
five, each a level held for a time, either of which can change from sweep
to sweep. Edit them and the experiment becomes your own. It also starts
tails in voltage clamp, and in current clamp a pulse, two pulses (the
refractory period), anode break and a long step.

For teaching from the front, the Step switch over the traces walks the sweeps
one at a time, or, for a single current pulse, a ladder of pulses up to and
across threshold. The arrow keys and a presentation clicker step too. Focus, under the traces, hides the
gate curves and gives the traces the screen; the device remembers it.

New to it? Why, at the top, starts with what an action potential is and says
where this site fits; it also holds the model's source and the earlier
versions. Tour, beside it, walks every control and shows it working, then
puts everything back. In voltage clamp, Na and K switch each channel on and
off, g shows conductance instead of current, and I–V (g–V, h–V) shows the
curve instead of the traces.

While it is under review, nothing links to the 1952 screen (`SHOW_1952` in
`src/App.tsx`); `#1952` still opens it. When shown, on a laptop, **1952**
opens Hodgkin and Huxley's model paper on a
green-phosphor screen, in the paper's own signs (V from rest, depolarization
negative, inward current positive) or today's. Each figure is a guided walk,
step by step, ending on the paper's own data, or a challenge: the figure
described, and you set up the experiment until it matches. So far Fig. 3
(potassium conductance, with the measured points traced from the paper),
Fig. 12 (membrane action potentials, against Table 4) and Fig. 19 (gK and h
after the spike). The address `#1952` opens it directly.

## The model

The space-clamped squid axon of Hodgkin & Huxley (1952) J Physiol 117:500–544
(doi:10.1113/jphysiol.1952.sp004764), in the modern sign: rest −65 mV,
depolarization positive. Units are the paper's: mV, ms, mS/cm², µA/cm², µF/cm².

With nothing edited it is NEURON's built-in `hh` mechanism. `npm test` holds
it there: the gates equal gaba_excites' NEURON-checked ones to the bit, every
rate equals the paper's printed equations, and current clamp reproduces
NEURON's spike times on 21 current steps (912 spikes, all within 0.010 ms).

Everything is the model alone, with no electrode: what no rig can record.

## Running it

    npm install
    npm run dev                          # http://localhost:5173
    npm test                             # the contract
    npx tsc -b                           # typecheck
    node scripts/screenshot.mjs <url>    # phone and wide checks, after any UI change
    npm run deploy                       # the only way to deploy

## Where it came from

HHhero is a focused companion to
[gaba_excites](https://github.com/syncytium2/gaba_excites), a current- and
voltage-clamp simulator. The HH gates, the NEURON reference data and the
literature notes were copied from it at commit `25d74e3`; see `docs/process.md`.

MIT licensed.
