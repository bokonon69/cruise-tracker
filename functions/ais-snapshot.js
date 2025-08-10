const WebSocket = require("ws");

exports.handler = async (event, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  const key = process.env.AISSTREAM_API_KEY;
  if (!key) return { statusCode: 500, headers, body: JSON.stringify({ ok:false, error:"server missing AISSTREAM_API_KEY" }) };

  const qs = event.queryStringParameters || {};
  const minLat = parseFloat(qs.minLat ?? "51.9038");
  const maxLat = parseFloat(qs.maxLat ?? "51.9090");
  const minLon = parseFloat(qs.minLon ?? "4.4550");
  const maxLon = parseFloat(qs.maxLon ?? "4.4720");
  const windowMs = Math.min(parseInt(qs.windowMs ?? "2000"), 8000);

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
        const lat = pos.Latitude, lon = pos.Longitude;
        if (!within(lat, lon)) return;
        const sog = (typeof pos.Sog === "number") ? pos.Sog : (typeof pos.SpeedOverGround === "number" ? pos.SpeedOverGround : null);
        const cog = (typeof pos.Cog === "number") ? pos.Cog : (typeof pos.CourseOverGround === "number" ? pos.CourseOverGround : null);
        const k = mmsi || (name ? `NONMMSI:${name}` : `ghost:${Math.random()}`);
        positions.set(k, { mmsi:k, name:name||`MMSI ${k}`, lat, lon, sog, cog, type, ts: Date.now() });
      }
    } catch {}
  }

  try {
    const url = `wss://stream.aisstream.io/v0/stream?apikey=${encodeURIComponent(key)}`;
    const ws = new WebSocket(url, { handshakeTimeout: 5000 });

    const done = new Promise((resolve) => {
      const timer = setTimeout(() => { try { ws.close(); } catch {} ; resolve(); }, windowMs);
      ws.on("open", () => {
        const sub = { Subscribe: { FiltersShipPosition: [{ Area: { Nw:{ Lon:minLon, Lat:maxLat }, Se:{ Lon:maxLon, Lat:minLat } } }] } };
        try { ws.send(JSON.stringify(sub)); } catch {}
      });
      ws.on("message", data => parseMessage(data));
      ws.on("error", () => { clearTimeout(timer); resolve(); });
      ws.on("close", () => { clearTimeout(timer); resolve(); });
    });

    await done;
    const out = Array.from(positions.values());
    return { statusCode: 200, headers, body: JSON.stringify({ ok:true, count: out.length, minLat, maxLat, minLon, maxLon, data: out }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok:false, error: e?.message || "proxy error" }) };
  }
};
