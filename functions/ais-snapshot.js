
const WebSocket = require("ws");

exports.handler = async (event) => {
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
  const windowMs = Math.min(parseInt(qs.windowMs ?? "5000"), 10000);

  const positions = new Map();
  const within = (lat, lon) => lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;

  function parseMessage(d) {
    try {
      const obj = JSON.parse(d);
      if (obj && obj.error) { positions.set("__error__", { error: obj.error }); return; }
      const meta = obj.MetaData || obj.Metadata || {};
      const msg = obj.Message || {};
      // accept multiple position shapes
      const pr = msg.ShipPosition || msg.PositionReport || msg.ClassAPositionReport || msg.StandardClassBPositionReport || msg.ExtendedClassBPositionReport;
      const sd = msg.ShipStaticData || {};
      const mmsi = meta.MMSI || meta.Mmsi || obj.MMSI || obj.mmsi;
      const name = meta.ShipName || sd.ShipName || "";
      if (pr && typeof pr.Latitude === "number" && typeof pr.Longitude === "number") {
        const lat = pr.Latitude, lon = pr.Longitude;
        if (!within(lat, lon)) return;
        const sog = typeof pr.Sog === "number" ? pr.Sog : (typeof pr.SpeedOverGround === "number" ? pr.SpeedOverGround : null);
        const cog = typeof pr.Cog === "number" ? pr.Cog : (typeof pr.CourseOverGround === "number" ? pr.CourseOverGround : null);
        const key = mmsi || (name ? `NONMMSI:${name}` : `ghost:${Math.random()}`);
        positions.set(key, { mmsi:key, name:name||`MMSI ${key}`, lat, lon, sog, cog, type: sd.ShipType || "", ts: Date.now() });
      }
    } catch {}
  }

  try {
    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream", { handshakeTimeout: 5000 });

    const done = new Promise((resolve) => {
      const timer = setTimeout(() => { try { ws.close(); } catch {} ; resolve(); }, windowMs);
      ws.on("open", () => {
        // Use only APIKey + BoundingBoxes (lat,lon pairs). Let server default message types.
        const subscription = {
          APIKey: key,
          BoundingBoxes: [[[maxLat, minLon], [minLat, maxLon]]]
        };
        try { ws.send(JSON.stringify(subscription)); } catch {}
      });
      ws.on("message", data => parseMessage(data));
      ws.on("error", () => { clearTimeout(timer); resolve(); });
      ws.on("close", () => { clearTimeout(timer); resolve(); });
    });

    await done;
    const error = positions.get("__error__");
    if (error) {
      positions.delete("__error__");
      return { statusCode: 502, headers, body: JSON.stringify({ ok:false, error:error.error }) };
    }
    const out = Array.from(positions.values());
    return { statusCode: 200, headers, body: JSON.stringify({ ok:true, count: out.length, minLat, maxLat, minLon, maxLon, data: out }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok:false, error: e?.message || "proxy error" }) };
  }
};
