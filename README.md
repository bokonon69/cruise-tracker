# Lloydkade Live Tracker — desktop + ios/mobile + pwa

Deze build gebruikt je bestaande desktop UI 1-op-1 en voegt daarbovenop:
- Responsive mobiele UI (≤768px): full-map, overlay list/settings, FABs, stats overlay
- iOS/PWA integratie: manifest + service worker + icons
- Desktop blijft ongewijzigd (sidebar + kaart)

Deploy (Netlify):
1) Upload/commit alles uit deze map
2) Zet environment: `AISSTREAM_API_KEY`
3) Open site → mobiel: topbar met ☰ en ⚙, FABs rechtsonder, stats linksboven
4) iPhone: “Add to Home Screen” voor fullscreen PWA

Let op: de mobiele FAB “👁” gebruikt je bestaande knoppen “Hide/Show” onder water,
zodat filtering en lijst/kaart in sync blijven.
