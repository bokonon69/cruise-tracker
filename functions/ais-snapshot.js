const WebSocket = require('ws');

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: corsHeaders(), body: '' };
    }
    const debug = event.queryStringParameters && event.queryStringParameters.debug;
    const apiKey = process.env.AISSTREAM_API_KEY;
    if (!apiKey) return json(502, { ok: false, error: 'missing-aisstream-api-key' });

    const qp = new URLSearchParams(event.queryStringParameters || {});
    const defaults = { minLat: 51.9038, maxLat: 51.9090, minLon: 4.4550, maxLon: 4.4720 };
    const minLat = num(qp.get('minLat'), defaults.minLat);
    const maxLat = num(qp.get('maxLat'), defaults.maxLat);
    const minLon = num(qp.get('minLon'), defaults.minLon);
    const maxLon = num(qp.get('maxLon'), defaults.maxLon);
    let windowMs = Math.min(Math.max(num(qp.get('windowMs'), 6000), 1000), 10000);
    const bbox = [ [ [maxLat, minLon], [minLat, maxLon] ] ];

    const url = 'wss://stream.aisstream.io/v0/stream';
    const collected = [];
    const rawMsgs = [];
    const startedAt = Date.now();
    const ws = new WebSocket(url);
    const timeoutId = setTimeout(() => { try { ws.close(); } catch {} }, windowMs);

    const subscribePayload = {
      APIKey: apiKey,
      BoundingBoxes: bbox,
      FilterMessageTypes: ["PositionReport"]
    };

    const ready = new Promise((resolve, reject) => {
      ws.on('open', () => { ws.send(JSON.stringify(subscribePayload)); });
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (debug && rawMsgs.length < 3) rawMsgs.push(msg);
          const item = normalizeAisMessage(msg);
          if (!item) return;
          if (inBbox(item.lat, item.lon, { minLat, maxLat, minLon, maxLon })) {
            collected.push(item);
          }
        } catch {}
      });
      ws.on('error', (err) => { clearTimeout(timeoutId); reject(err); });
      ws.on('close', () => { clearTimeout(timeoutId); resolve(); });
    });

    await ready;

    const byMmsi = new Map();
    for (const v of collected) {
      const prev = byMmsi.get(v.mmsi);
      if (!prev || (v.ts || 0) > (prev.ts || 0)) byMmsi.set(v.mmsi, v);
    }
    const data = Array.from(byMmsi.values());

    return json(200, {
      ok: true,
      count: data.length,
      minLat, maxLat, minLon, maxLon,
      windowMs,
      durationMs: Date.now() - startedAt,
      collectedCount: collected.length,
      data,
      debug: debug ? rawMsgs : undefined
    });
  } catch (e) {
    return json(502, { ok: false, error: String(e && e.message || e) });
  }
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function inBbox(lat, lon, { minLat, maxLat, minLon, maxLon }) {
  return lat <= maxLat && lat >= minLat && lon >= minLon && lon <= maxLon;
}
function normalizeAisMessage(msg) {
  const md = msg.MetaData || msg.metadata || {};
  let m = msg.Message || msg.message || msg.Body || msg.body || {};
  if (msg.MessageType && m && typeof m === 'object' && m[msg.MessageType]) {
    m = m[msg.MessageType];
  }
  let lat, lon;
  if (m.Position && isNum(m.Position.lat) && isNum(m.Position.lon)) {
    lat = +m.Position.lat; lon = +m.Position.lon;
  } else if (isNum(m.Latitude) && isNum(m.Longitude)) {
    lat = +m.Latitude; lon = +m.Longitude;
  } else if (m.position && isNum(m.position.lat) && isNum(m.position.lon)) {
    lat = +m.position.lat; lon = +m.position.lon;
  } else if (isNum(md.latitude) && isNum(md.longitude)) {
    lat = +md.latitude; lon = +md.longitude;
  }
  if (!isNum(lat) || !isNum(lon)) return null;
  const sog = pickNum(m.Sog, m.sog, m.SpeedOverGround, m.speed, m.speed_over_ground);
  const cog = pickNum(m.Cog, m.cog, m.CourseOverGround, m.course, m.course_over_ground);
  const type = pickStr(m.ShipType, m.shipType, m.Type, m.type, m.VesselType);
  const mmsi = pickStr(md.MMSI, md.Mmsi, md.mmsi, m.UserID, m.MMSI, m.mmsi);
  const name = pickStr(md.ShipName, md.Name, md.shipName, m.ShipName, m.Name, m.name);
  const ts = pickNum(md.Timestamp, md.Time, md.ts, m.Timestamp, m.Time, m.ts) || Date.now();
  return { mmsi: mmsi ? String(mmsi) : undefined, name: name || '', lat, lon, sog: sog ?? null, cog: cog ?? null, type: type || '', ts };
}
function isNum(v) { return Number.isFinite(+v); }
function pickNum(...vals) { for (const v of vals) { const n = +v; if (Number.isFinite(n)) return n; } return undefined; }
function pickStr(...vals) { for (const v of vals) { if (v !== undefined && v !== null) return String(v); } return undefined; }
