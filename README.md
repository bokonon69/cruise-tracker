# Lloydkade Live Tracker

Proof-of-concept webapp die live schepen toont op de Nieuwe Maas langs de Lloydkade.

## Installatie

```bash
npm install
netlify dev
```

## Deploy

- Push naar GitHub
- Koppel aan Netlify
- Voeg `AISSTREAM_API_KEY` toe als environment variable

## Endpoints

- `/.netlify/functions/health`
- `/.netlify/functions/ais-snapshot`
