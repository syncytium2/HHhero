# Copied from gaba_excites (github.com/syncytium2/gaba_excites) at 25d74e3, unchanged.
# It writes src/core/oracle/neuron_hh.json, which src/core/hh.test.ts reads.
"""
NEURON oracle for the Hodgkin-Huxley squid axon (Hodgkin & Huxley 1952,
J Physiol 117:500-544).

Runs NEURON's built-in `hh` mechanism, which is the 1952 model in the modern
sign convention (rest near -65 mV, depolarization positive), on one
space-clamped patch of membrane, and writes the spike times of current-step
families to src/core/oracle/neuron_hh.json. src/core/hh.test.ts then requires
the TypeScript port to reproduce them.

Nothing to compile: `hh` ships with NEURON.

    python3 -m venv .venv-neuron && .venv-neuron/bin/pip install neuron
    .venv-neuron/bin/python tools/neuron_oracle_hh.py

The patch: 10 000 um^2 (a cylinder with diam = L = 56.42 um and sealed ends),
so 1 uF/cm^2 gives 100 pF and 100 pA is 1 uA/cm^2. Space clamp: one segment,
no propagation, as in the paper's "membrane action potential".

Parameters as in the paper, in the modern sign:
gNa 120, gK 36, gL 0.3 mS/cm^2; ENa +50, EK -77 mV; EL -54.387 mV, which puts
rest at -65 mV exactly. NEURON's default el_hh is -54.3, the same value
rounded; it is set here to the paper's. usetable_hh = 0, so NEURON evaluates
the rate functions exactly rather than interpolating from its 200-point table
(the port has no table). Temperature factor 3^((celsius - 6.3)/10), as in hh.mod.

Protocol, matched on the TypeScript side: 1000 ms settle at the family's hold,
then a 1000 ms sweep with a step from 100 ms for 800 ms. Fixed step
dt = 0.01 ms, implicit Euler (NEURON's default).
"""
import json, math, os

from neuron import h

h.load_file("stdrun.hoc")

DT, SETTLE, STEP_ON, STEP_DUR, SWEEP = 0.01, 1000.0, 100.0, 800.0, 1000.0
AREA_UM2 = 1e4
D = math.sqrt(AREA_UM2 / math.pi)  # side area pi*d*L with L = d

# (celsius, hold pA, step amplitudes pA)
FAMILIES = [
    # 6.3 degC, the paper's temperature: below threshold, the single spike at
    # step onset, the jump to repetitive firing, high rates, depolarization block
    (6.3, 0, [100, 200, 300, 500, 600, 700, 1000, 2000, 5000, 10000, 20000]),
    # hyperpolarization, then release: anode break excitation
    (6.3, 0, [-200, -300, -400, -500, -1000, -2000]),
    # warmer: the same membrane at 18.5 degC
    (18.5, 0, [500, 1000, 2000, 5000]),
]

soma = h.Section(name="patch")
soma.nseg = 1; soma.diam = D; soma.L = D; soma.cm = 1; soma.Ra = 35.4
soma.insert("hh")
soma.gnabar_hh = 0.12; soma.gkbar_hh = 0.036; soma.gl_hh = 0.0003; soma.el_hh = -54.387
soma.ena = 50; soma.ek = -77
h.usetable_hh = 0

stim = h.IClamp(soma(0.5))
hold = h.IClamp(soma(0.5)); hold.delay = 0; hold.dur = 1e9
vvec = h.Vector().record(soma(0.5)._ref_v)
tvec = h.Vector().record(h._ref_t)
h.dt = DT; h.steps_per_ms = 1 / DT; h.secondorder = 0

area_cm2 = soma(0.5).area() * 1e-8
assert abs(soma(0.5).area() - AREA_UM2) < 1e-6, soma(0.5).area()


def run(celsius, amp_pa, hold_pa):
    h.celsius = celsius
    hold.amp = hold_pa / 1000.0
    stim.delay = SETTLE + STEP_ON; stim.dur = STEP_DUR; stim.amp = amp_pa / 1000.0
    h.finitialize(-65.0)
    h.continuerun(SETTLE + SWEEP)
    v = vvec.as_numpy(); t = tvec.as_numpy()
    spikes, armed = [], v[0] < -20
    for i in range(1, len(v)):
        if not armed:
            if v[i] < -40: armed = True
            continue
        if v[i-1] < -20 <= v[i]:
            armed = False
            tc = t[i-1] + (-20 - v[i-1]) / (v[i] - v[i-1]) * (t[i] - t[i-1])
            if tc >= SETTLE: spikes.append(round(tc - SETTLE, 4))
    k0 = int(round(SETTLE / DT))
    return spikes, float(v[k0]), float(max(v[k0:]))


out = {"source": "NEURON built-in hh mechanism (Hodgkin & Huxley 1952), usetable_hh = 0, el_hh = -54.387",
       "neuron": h.nrnversion(5), "areaUm2": AREA_UM2, "dt": DT, "settle": SETTLE, "stepOn": STEP_ON,
       "stepDur": STEP_DUR, "sweep": SWEEP, "sweeps": []}
for celsius, hp, amps in FAMILIES:
    for a in amps:
        sp, v0, vmax = run(celsius, a, hp)
        out["sweeps"].append({"celsius": celsius, "hold": hp, "amp": a, "spikes": sp, "vStart": v0, "vMax": vmax})
        print(celsius, hp, a, len(sp), sp[:4], round(v0, 3))
dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "core", "oracle", "neuron_hh.json")
with open(dest, "w") as f: json.dump(out, f, indent=1)
print("wrote", os.path.normpath(dest))
