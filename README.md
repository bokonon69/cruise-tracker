# Lloydkade Live — PWA (v3)
- Persists **bbox selection + custom coords** and **map view (center/zoom)** per device
- **Mini vessel card** at bottom for selected ship (name, SOG, quick link to VesselFinder)
- **Deep link** button: copies URL with bbox/mode/view for sharing
- Full-screen map, overlay stats, FABs; slide-in overlays (Ships, Settings)
- Mobile defaults: hide moored, shorter trail/TTL; remembers mode
- PWA: manifest + service worker

Deploy:
1) Upload to Netlify (Functions + `AISSTREAM_API_KEY`)
2) Open on iPhone → Share → Add to Home Screen
