# Roadmap

The first version does one thing: the α, β ⇄ x∞, τ switch. The owner,
2026-10-30: "all of these are teachable moments. probably too much to cover it
all ... the rest keep in mind once we get a reviewable tool live." Kept in mind:

- **The 1952 sign convention.** A switch that redraws every axis and equation
  as the paper prints them: V as the displacement from rest, depolarization
  negative, V_Na −115, V_K +12 mV. Before showing a current in the paper's
  sign, check the paper's sign of current on p. 505 and add it to
  `lit/notes/hodgkin1952.md` (from Eq. 26 with V_Na = −115, inward current
  comes out positive; confirm it on the page).
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
- **State in the URL**, so a lecturer can send a configuration to students'
  phones.
- **Installable and offline** (a same-origin service worker), for classroom
  Wi-Fi.
- **Back to gaba_excites.** Its roadmap wants a channel description a UI can
  edit; the gate-as-data here is a candidate. Copy it back or share it as a
  package once it has proven itself here.
