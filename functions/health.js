exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }
  return {
    statusCode: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  };
};
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
