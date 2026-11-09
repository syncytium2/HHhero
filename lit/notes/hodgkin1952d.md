# Hodgkin & Huxley 1952d: inactivation

Hodgkin AL, Huxley AF (1952) The dual effect of membrane potential on sodium conductance in the giant axon of
Loligo. J Physiol 116:497–506. doi:10.1113/jphysiol.1952.sp004719. Open access (PMC1392212). Received 24 October
1951, before the model paper (117:500).

**Status: read, 2026-11-09.** Same sign convention as the model paper: V is the displacement from rest,
depolarization negative.

## What it measures

- **Conditioning then test** (Figs. 1–3, pp. 497–500): a conditioning step V1 of varying length, then a test step
  of −44 mV. The test's sodium current falls (V1 = −8 mV) or rises (V1 = +31 mV) exponentially with the
  conditioning length.
- **Steady state** (Figs. 4–5, pp. 500–501): long conditioning steps from +46 to −29 mV. Eqn. 1 (p. 501):
  h∞ = 1 / (1 + exp((Vh − V)/7)), Vh = −2.5 mV in Fig. 5; −1.5 to −3.5 mV in fresh fibers, +7.5 mV in a fiber used
  for some time (p. 502). h at rest 0.55–0.62. This is h as a steady state and a time constant, before the
  model paper rewrote it as α and β.
- **Two pulses** (Figs. 6–7, pp. 503–504): two −44 mV pulses of 1.8 ms, axon 31 at 4.5 °C. The second pulse's
  sodium current falls to 0.37 of normal at short intervals and recovers as 1 − 0.63 exp(−t/τh), τh = 12 ms.
- **Table 1** (p. 503): h∞ and τh against V for axons 37, 38, 39, at 3–19 °C. The PDF's text layer is garbled
  here; transcribe from the page image before using any value.

Measured values are the test pulse's sodium current relative to an unconditioned one: h/h_rest, not h (Fig. 5
gives both scales).

## Checked against the model

The model's h∞ (model paper eqns. 23, 24) agrees with Table 1's axon 38 to within about 0.03 from −29 to +46 mV
(rough reading). Its τh at rest at 4.5 °C is 10.4 ms against Fig. 7's 12 ms: in `paper1952.test.ts`.
