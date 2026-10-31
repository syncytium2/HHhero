# Roadmap

The first version does one thing: the α, β ⇄ x∞, τ switch. The owner,
2026-10-30: "all of these are teachable moments. probably too much to cover it
all ... the rest keep in mind once we get a reviewable tool live." Kept in mind:

- **The 1952 screen: more of the model paper.** Built 2026-10-31 with
  Figs. 3, 12 and 19 (laptop first). Next from the same paper, each a guided
  walk plus a challenge, traced data where the figure has measurements:
  Fig. 6 (gNa families, axon 17; Table 2 gives the fitted curves, the circles
  need tracing as Fig. 3's were); Figs. 4, 5, 7, 8, 9, 10 (the rate constants
  and n∞, h∞ against V: points over the curves card); Fig. 11 (computed and
  recorded clamp currents at 4 °C: needs the total current); the recorded
  lower family of Fig. 12 (tracings of lines, not circles); Fig. 13 (9.1 °C
  record); Fig. 20 (refractory period: needs a second shock); Fig. 21
  (threshold, near-threshold responses); Fig. 22 (anode break: release from
  30 mV below rest); Figs. 23 and 24 (small oscillations). Then the phone
  layout.
- **The rest of the 1952 series**, the owner's to-do list (2026-10-31): Hodgkin,
  Huxley & Katz 1952 (the clamp itself, J Physiol 116:424) and Hodgkin &
  Huxley 1952a–c (116:449, 116:473, 116:497: the ionic currents separated,
  the potassium and sodium conductances, inactivation). These are where the
  experiments are; the model paper mostly computes. Each figure the model can
  reach becomes an entry in `src/paper/`, with its claims tested. PDFs are in
  the owner's Dropbox lit folder.
- **How Hodgkin and Huxley fitted it.** The paper's fitted points (Tables 1 and
  2 for axon 17; check what they print, transcribe with pages) on the α and β
  plots, and students drag the constants to fit them. Printed values first;
  points read off a figure are digitized and labeled so.
- **The modern refit.** A Boltzmann x∞ and a bell τ fitted to HH: the switch
  then changes the model slightly, and the residual is the lesson.
- **What the rates mean physically.** Rates as barrier crossings,
  α ∝ e^(+zδFV/RT): a Boltzmann x∞ with slope RT/zF, and the gating charge.
  Hodgkin and Huxley's exponential βs have this form; their linoid αs are fits.
- **Independent gates as states, and where that fails.** m³h as an 8-state
  scheme, n⁴ as 5; then coupled inactivation and the Cole–Moore delay, cited
  through `lit/sources.json` with DOIs checked, not recalled.
- **Single channels.** A few hundred stochastic channels whose average is m³h.
- **Equations as MathML**, with the edited term highlighted live.
- **Lecture mode**: two or three plots at once, larger type, keyboard control.
- **Reorder the tiles.** Asked for 2026-10-30, parked so as not to change
  the layout under students already using it. Plan: a small up/down button
  on each card head swaps it with its neighbor, kept in localStorage per
  device, with a reset. On a phone only the two plot cards move; the
  controls stay at the bottom so a slider and the plots stay on screen
  together (the screenshot check enforces that). On a wide screen the same
  control swaps the controls column to the left. Drag-and-drop was
  considered and set aside: it needs a handle so it does not collide with
  the plots' pinch, pan and drag-to-zoom, and a library, for little gain
  over a swap.
- **State in the URL**, so a lecturer can send a configuration to students'
  phones.
- **Installable and offline** (a same-origin service worker), for classroom
  Wi-Fi.
- **Back to gaba_excites.** Its roadmap wants a channel description a UI can
  edit; the gate-as-data here is a candidate. Copy it back or share it as a
  package once it has proven itself here.
