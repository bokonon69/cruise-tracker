import WebSocket from "ws";

export default async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  const key = process.env.AISSTREAM_API_KEY;
  if (!key) return res.status(500).json({ error: "server missing AISSTREAM_API_KEY" });

  const q = req.query || {};
  const minLat = parseFloat(q.minLat ?? "51.9010");
  const maxLat = parseFloat(q.maxLat ?? "51.9120");
  const minLon = parseFloat(q.minLon ?? "4.4400");
  const maxLon = parseFloat(q.maxLon ?? "4.4800");
  const windowMs = Math.min(parseInt(q.windowMs ?? "1800"), 8000);

  const positions = new Map();
  const within = (lat, lon) => lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;

  function parseMessage(d) {
    try {
      const obj = JSON.parse(d);
      const meta = obj?.MetaData || {};
      const mmsi = meta.MMSI || obj?.MMSI || obj?.mmsi;
      const msg = obj?.Message || {};
      const pos = msg.ShipPosition || msg.PositionReport || msg.ClassAPositionReport || msg.ClassBPositionReport || msg.ExtendedClassBPositionReport;
      const sd = msg.ShipStaticData || msg.StaticData || {};
      const name = sd?.ShipName || obj?.ShipName || meta?.ShipName || sd?.Name || "";
      const type = sd?.ShipType || obj?.ShipType || "";

      if (pos && typeof pos.Latitude === "number" && typeof pos.Longitude === "number") {
        const lat = pos.Latitude;
        const lon = pos.Longitude;
        if (!within(lat, lon)) return;
        const sog = (typeof pos.Sog === "number") ? pos.Sog : (typeof pos.SpeedOverGround === "number" ? pos.SpeedOverGround : null);
        const cog = (typeof pos.Cog === "number") ? pos.Cog : (typeof pos.CourseOverGround === "number" ? pos.CourseOverGround : null);
        const key = mmsi || (name ? `NONMMSI:${name}` : `ghost:${Math.random()}`);
        positions.set(key, { mmsi: key, name: name || `MMSI ${key}`, lat, lon, sog, cog, type, ts: Date.now() });
      }
    } catch {}
  }

  try {
    const url = `wss://stream.aisstream.io/v0/stream?apikey=${encodeURIComponent(key)}`;
    const ws = new WebSocket(url, { handshakeTimeout: 5000 });

    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { try { ws.close(); } catch {}; resolve(); }, windowMs);

      ws.on("open", () => {
        const msg = {
          "Subscribe": {
            "FiltersShipPosition": [{
              "Area": {
                "Nw": { "Lon": minLon, "Lat": maxLat },
                "Se": { "Lon": maxLon, "Lat": minLat }
              }
            }]
          }
        };
        ws.send(JSON.stringify(msg));
      });

      ws.on("message", (data) => parseMessage(data));
      ws.on("error", (err) => { clearTimeout(timer); reject(err); });
      ws.on("close", () => { clearTimeout(timer); resolve(); });
    });

    await done;
    const out = Array.from(positions.values());
    return res.status(200).json({ ok: true, count: out.length, minLat, maxLat, minLon, maxLon, data: out });
  } catch (e) {
    return res.status(502).json({ error: e?.message || "proxy error" });
  }
};
