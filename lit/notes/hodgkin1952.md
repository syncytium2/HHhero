# Hodgkin & Huxley 1952: the squid giant axon

Hodgkin AL, Huxley AF (1952) A quantitative description of membrane current and its application to conduction and
excitation in nerve. J Physiol 117:500–544. doi:10.1113/jphysiol.1952.sp004764. Open access (PMC1392413).

**Status: read and checked, 2026-10-29.** The port was first transcribed from NEURON's built-in `hh.mod`, then checked
line by line against the paper. Every rate function and constant agrees after the sign change below. The checks are
in `src/core/hh.test.ts`; the methods page (#hh-paper) shows the comparison.

## Sign convention

The paper's V is the displacement of the membrane potential from rest, **depolarization negative** (p. 505). The
port's Vm (mV, depolarization positive, rest −65 mV) is Vm = −(V + 65); equilibrium potentials likewise E = −V − 65.

## The rate functions (p. 519; first given on pp. 510, 515, 516), in 1/ms at 6.3 °C

| | paper (V) | port (Vm) |
|---|---|---|
| α_n (Eq. 12) | 0.01 (V + 10) / (exp((V + 10)/10) − 1) | 0.01 · vtrap(−(Vm + 55), 10) |
| β_n (Eq. 13) | 0.125 exp(V/80) | 0.125 exp(−(Vm + 65)/80) |
| α_m (Eq. 20) | 0.1 (V + 25) / (exp((V + 25)/10) − 1) | 0.1 · vtrap(−(Vm + 40), 10) |
| β_m (Eq. 21) | 4 exp(V/18) | 4 exp(−(Vm + 65)/18) |
| α_h (Eq. 23) | 0.07 exp(V/20) | 0.07 exp(−(Vm + 65)/20) |
| β_h (Eq. 24) | 1 / (exp((V + 30)/10) + 1) | 1 / (exp(−(Vm + 35)/10) + 1) |

`vtrap(x, y) = x / (exp(x/y) − 1)`, with its limit y at x = 0 (the printed forms are 0/0 at V = −10 and V = −25).
Currents: Eq. 26, I = C dV/dt + ḡK n⁴ (V − V_K) + ḡNa m³h (V − V_Na) + ḡl (V − V_l). Gates: Eqs. 7, 15, 16.
Temperature: "for other temperatures they must be scaled with a Q10 of 3" (p. 519); φ = 3^((T − 6.3)/10) (p. 523).

## Table 3 (p. 520), "Value chosen"

| constant | paper | port |
|---|---|---|
| C_M | 1.0 µF/cm² | 1 µF/cm² (100 pF on the 10 000 µm² patch) |
| V_Na | −115 mV | E_Na = +50 mV |
| V_K | +12 mV | E_K = −77 mV |
| V_l | −10.613 mV ("exact value chosen to make the total ionic current zero at the resting potential") | E_L = −54.387 mV |
| ḡNa | 120 mmho/cm² | 12 000 nS |
| ḡK | 36 mmho/cm² | 3600 nS |
| ḡl | 0.3 mmho/cm² | 30 nS |

## Table 4 (p. 527), "Characteristics of calculated action potentials", membrane rows

A membrane action potential (p. 522): eqn. 26 with I = 0, from V = V₀ with the gates at rest (a brief shock). Anode
break (p. 536): released from the steady state at 30 mV below rest. Heights and the positive phase are measured from
rest.

| temperature | stimulus | spike height (mV) | positive phase (mV) | rise, 20 mV to peak (ms) | fall, peak to V = 0 (ms) | positive phase (ms) | max rate of rise (V/s) |
|---|---|---|---|---|---|---|---|
| 18.5 | 15 mV depolarization | 96.8 | 10.5 | 0.275 | 0.61 | 5.09 | 564 |
| 6.3 | 100 mV depolarization | 108.8 | — | — | — | — | — |
| 6.3 | 90 mV depolarization | 108.5 | — | — | — | — | — |
| 6.3 | 15 mV depolarization | 105.4 | 11.2 | 0.59 | 2.21 | 14.15 | 311 |
| 6.3 | 7 mV depolarization | 102.1 | — | 0.62 | — | — | 277 |
| 6.3 | anode break | 112.1 | 11.2 | 0.50 | 2.54 | 14.4 | 414 |

The table also gives peak conductance and the interval from peak potential to peak conductance; the port does not
check those. The propagated row (18.5 °C, 90.5 mV) needs a cable and is not modeled.

Fig. 12 (p. 525): at 6 °C, initial depolarizations of 90, 15 and 7 mV give spikes; 6 mV does not.

## Voltage clamp

Figs. 3 (p. 508) and 6 (p. 513): K⁺ and Na⁺ conductance during depolarizations of 6 to 109 mV from rest, axon 17 at
6–7 °C, sodium replaced by choline for Fig. 3. These are the data the equations were fitted to (with axon 17's own ḡ,
Tables 1 and 2), not predictions of the final model, so the port does not compare against their points. It checks
instead that voltage clamp on the port reproduces the paper's clamped-step solution, Eqs. 8, 17 and 18.

Anode break mechanism (p. 537): "anodal polarization decreases the potassium conductance and removes inactivation."
