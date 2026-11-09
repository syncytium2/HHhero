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
- **Table 1** (p. 503): h∞ and τh against V for axons 37, 38, 39, at 3–19 °C. Transcribed below.

Measured values are the test pulse's sodium current relative to an unconditioned one: h/h_rest, not h (Fig. 5
gives both scales).

## Table 1 (p. 503), "Experiments with conditioning voltage"

Transcribed by eye from the page rendered at 300 dpi (pymupdf), 2026-11-09: the PDF's text layer is an OCR of
the scan and garbles this table, so pdftotext (and armory's litreview tools, which use it) cannot be trusted
here. — is the paper's dash (not measured); [ ] is the paper's "interpolated". † "the axon had been used for
some time and was in poor condition". V is the displacement from rest, depolarization negative.

| axon | °C | variable | −29 | −22 | −14 | −8 | −7 | 0 | 9 | 16 | 31 | 46 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 38 | 5 | h (steady state), Figs. 4–5 method | 0.02 | 0.04 | 0.17 | — | 0.37 | 0.59 | 0.82 | 0.94 | 0.99 | 1.00 |
| 39 | 19 | | 0.02 | 0.04 | 0.09 | — | 0.28 | 0.55 | 0.83 | 0.94 | 0.98 | 0.99 |
| 39† | 3 | | 0.01 | 0.03 | 0.04 | — | 0.11 | 0.26 | 0.50 | 0.69 | 0.93 | 0.99 |
| 38 | 5 | h (steady state), Figs. 1–3 method | 0.02 | — | — | 0.43 | — | 0.58 | — | 0.92 | 0.99 | — |
| 39 | 19 | | 0.03 | — | — | 0.40 | — | 0.61 | — | 0.94 | — | — |
| 39† | 3 | | — | — | — | — | — | 0.22 | — | 0.75 | 0.93 | — |
| 37 | 3 | | — | 0.04 | — | 0.34 | — | 0.55 | 0.81 | 0.96 | — | — |
| 38 | 5 | τh (ms), Figs. 1–3 method | 1.5 | — | — | 7 | — | [8–10] | — | 8 | 4 | — |
| 39 | 19 | | 0.35 | — | — | 1.5 | — | [1.7–2.1] | — | 1.8 | — | — |
| 39† | 3 | | — | — | — | — | — | — | — | 13 | 7 | — |
| 37 | 3 | | — | 3 | — | 6 | — | [8–10] | 9 | 7 | — | — |
| 38 | 6 | τh (ms), scaled to 6 °C with a Q10 of 3 | 1.3 | — | — | 6 | — | [7–9] | — | 7 | 3.6 | — |
| 39 | 6 | | 1.5 | — | — | 6 | — | [7–9] | — | 8 | — | — |
| 39† | 6 | | — | — | — | — | — | — | — | 9 | 5 | — |
| 37 | 6 | | — | 2.2 | — | 4 | — | [6–7] | 7 | 5 | — | — |

Two-pulse experiment, axon 31: at 4.5 °C, τh = 1.8 ms at V = −44 mV and 12 ms at V = 0; scaled to 6 °C,
1.5 ms and 10 ms.

## Checked against the model

The model's h∞ (model paper eqns. 23, 24) agrees with Table 1's axon 38 (5 °C) to within 0.03 from −29 to +46 mV. Its τh at rest at 4.5 °C is 10.4 ms against Fig. 7's 12 ms: in `paper1952.test.ts`.
