
const WebSocket = require("ws");

/**
 * Snapshot AIS for a bbox.
 * Accepts many AIS shapes: PositionReport, ClassAPositionReport, StandardClassBPositionReport,
 * ExtendedClassBPositionReport, ShipPosition.
 * Returns small normalized objects.
 */
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
  const minLat = parseFloat(qs.minLat ?? "51.9010");
  const maxLat = parseFloat(qs.maxLat ?? "51.9120");
  const minLon = parseFloat(qs.minLon ?? "4.4400");
  const maxLon = parseFloat(qs.maxLon ?? "4.4800");
  const windowMs = Math.min(parseInt(qs.windowMs ?? "6000"), 12000);

  const positions = new Map();
  const within = (lat, lon) => lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;

  const shipTypeMap = (code) => {
    const c = Number(code);
    if (!Number.isFinite(c)) return "";
    if (c >= 60 && c < 70) return "passenger";
    if (c >= 70 && c < 80) return "cargo";
    if (c >= 80 && c < 90) return "tanker";
    if (c === 31) return "tug";
    if (c === 50) return "pilot";
    return String(c);
  };

  function parseMessage(d) {
    try {
      const obj = JSON.parse(d);
      if (!obj) return;
      if (obj.error) { positions.set("__error__", { error: obj.error }); return; }

      const meta = obj.MetaData || obj.Metadata || {};
      const msg  = obj.Message || {};

      const pr = msg.ShipPosition
              || msg.PositionReport
              || msg.ClassAPositionReport
              || msg.StandardClassBPositionReport
              || msg.ExtendedClassBPositionReport;

      const sd = msg.ShipStaticData || {};
      const mmsi = meta.MMSI || meta.Mmsi || obj.MMSI || obj.mmsi;
      const name = (meta.ShipName || sd.ShipName || "").trim();
      const type = sd.ShipType != null ? shipTypeMap(sd.ShipType) : "";

      if (pr && typeof pr.Latitude === "number" && typeof pr.Longitude === "number") {
        const lat = pr.Latitude;
        const lon = pr.Longitude;
        if (!within(lat, lon)) return;

        const sog = (typeof pr.Sog === "number") ? pr.Sog
                   : (typeof pr.SpeedOverGround === "number") ? pr.SpeedOverGround : null;
        const cog = (typeof pr.Cog === "number") ? pr.Cog
                   : (typeof pr.CourseOverGround === "number") ? pr.CourseOverGround : null;

        const k = mmsi || (name ? `NONMMSI:${name}` : `ghost:${Math.random()}`);
        positions.set(k, { mmsi:k, name: name || `MMSI ${k}`, lat, lon, sog, cog, type, ts: Date.now() });
      }
    } catch {}
  }

  try {
    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream", { handshakeTimeout: 5000 });

    const done = new Promise((resolve) => {
      const timer = setTimeout(() => { try { ws.close(); } catch {} ; resolve(); }, windowMs);
      ws.on("open", () => {
        // Minimal subscription: APIKey + BoundingBoxes (lat,lon). No type filters → get all supported types.
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
