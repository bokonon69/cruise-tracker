# Lloydkade Live Tracker — hide moored / show all (fix)

Fixes:
- Knop-handlers werken nu correct (`false` i.p.v. `False`).
- Actieve knop krijgt visuele state.
- Filtering toegepast via centrale `renderAll()`.

Modes:
- **Hide moored (default):** alleen SOG > 0.8 kn met geldige SOG.
- **Show all:** alles tonen, ook SOG ≤ 0.8 en zonder SOG.
