const WebSocket = require('ws');
exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
    const apiKey = process.env.AISSTREAM_API_KEY;
    if (!apiKey) return json(502, { ok:false, error:'missing-aisstream-api-key' });
    const qp = new URLSearchParams(event.queryStringParameters || {});
    const defaults = { minLat:51.9038, maxLat:51.9090, minLon:4.4550, maxLon:4.4720 };
    const minLat = num(qp.get('minLat'), defaults.minLat);
    const maxLat = num(qp.get('maxLat'), defaults.maxLat);
    const minLon = num(qp.get('minLon'), defaults.minLon);
    const maxLon = num(qp.get('maxLon'), defaults.maxLon);
    let windowMs = Math.min(Math.max(num(qp.get('windowMs'), 6000), 1000), 10000);
    const bbox = [ [ [maxLat, minLon], [minLat, maxLon] ] ];
    const url = 'wss://stream.aisstream.io/v0/stream';
    const ws = new WebSocket(url);
    const collected = [];
    const subscribePayload = { APIKey: apiKey, BoundingBoxes: bbox, FilterMessageTypes: ["PositionReport"] };
    const timeoutId = setTimeout(() => { try{ws.close();}catch{} }, windowMs);
    await new Promise((resolve, reject)=>{
      ws.on('open', ()=> ws.send(JSON.stringify(subscribePayload)));
      ws.on('message', (raw)=>{
        try{
          const msg = JSON.parse(raw.toString());
          const item = normalize(msg);
          if (item && item.lat<=maxLat && item.lat>=minLat && item.lon>=minLon && item.lon<=maxLon) collected.push(item);
        }catch{}
      });
      ws.on('error', (e)=>{ clearTimeout(timeoutId); reject(e); });
      ws.on('close', ()=>{ clearTimeout(timeoutId); resolve(); });
    });
    const byM = new Map();
    for (const v of collected){ const p = byM.get(v.mmsi); if(!p || (v.ts||0)>(p.ts||0)) byM.set(v.mmsi, v); }
    const data = [...byM.values()];
    return json(200, { ok:true, count:data.length, minLat,maxLat,minLon,maxLon, windowMs, data });
  } catch (e) {
    return json(502, { ok:false, error:String(e && e.message || e) });
  }
};
function json(statusCode, obj){ return { statusCode, headers: { ...cors(), 'Content-Type':'application/json' }, body: JSON.stringify(obj) }; }
function cors(){return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};}
function num(v,d){ const n=parseFloat(v); return Number.isFinite(n)?n:d; }
function normalize(msg){
  const md = msg.MetaData || msg.metadata || {};
  let m = msg.Message || msg.message || msg.Body || msg.body || {};
  if (msg.MessageType && m && typeof m==='object' && m[msg.MessageType]) m = m[msg.MessageType];
  let lat,lon;
  if (m.Position && isN(m.Position.lat) && isN(m.Position.lon)) { lat=+m.Position.lat; lon=+m.Position.lon; }
  else if (isN(m.Latitude) && isN(m.Longitude)) { lat=+m.Latitude; lon=+m.Longitude; }
  else if (m.position && isN(m.position.lat) && isN(m.position.lon)) { lat=+m.position.lat; lon=+m.position.lon; }
  else if (isN(md.latitude) && isN(md.longitude)) { lat=+md.latitude; lon=+md.longitude; }
  else return null;
  const sog = pickN(m.Sog, m.sog, m.SpeedOverGround, m.speed, m.speed_over_ground);
  const cog = pickN(m.Cog, m.cog, m.CourseOverGround, m.course, m.course_over_ground);
  const type = pickS(m.ShipType, m.shipType, m.Type, m.type, m.VesselType);
  const mmsi = pickS(md.MMSI, md.Mmsi, md.mmsi, m.UserID, m.MMSI, m.mmsi);
  const name = pickS(md.ShipName, md.Name, md.shipName, m.ShipName, m.Name, m.name);
  const ts = pickN(md.Timestamp, md.Time, md.ts, m.Timestamp, m.Time, m.ts) || Date.now();
  return { mmsi: mmsi? String(mmsi):undefined, name:name||'', lat, lon, sog: sog ?? null, cog: cog ?? null, type: type||'', ts };
}
function isN(v){ return Number.isFinite(+v); }
function pickN(...a){ for (const v of a){ const n=+v; if (Number.isFinite(n)) return n; } }
function pickS(...a){ for (const v of a){ if (v!==undefined && v!==null) return String(v); } }