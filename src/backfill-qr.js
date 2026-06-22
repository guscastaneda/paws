import { errRes, jsonRes, atFetch } from "./helpers.js";
import { CLIENTS_TABLE, FIELDS } from "./constants.js";

// ── POST /admin/backfill-qr ───────────────────────────────────────────────────
// TEMPORARY endpoint. Loops through all Client records and re-triggers the same
// token + QR generation logic from setup-client.js for each one. Use this once
// to backfill clients created while the QR upload was silently broken
// (AIRTABLE_BASE_ID env var bug). Remove this route + file once backfill is done.
export async function handlePostBackfillQr(req, env) {
  const secret = req.headers.get('X-Webhook-Secret');
  if (!secret || secret !== env.WEBHOOK_SECRET) {
    return errRes('Unauthorized', 401);
  }

  // Fetch all client record IDs
  const allClientIds = [];
  let offset = null;
  do {
    const qs = `?fields[]=${FIELDS.CLIENT_NAME}${offset ? '&offset=' + offset : ''}`;
    const res = await atFetch(env, `/${CLIENTS_TABLE}${qs}`);
    if (!res.ok) return errRes('Failed to list clients', 502);
    const data = await res.json();
    allClientIds.push(...data.records.map(r => r.id));
    offset = data.offset || null;
  } while (offset);

  const results = [];
  for (const recordId of allClientIds) {
    try {
      const setupRes = await fetch(new URL('/setup-client', req.url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': env.WEBHOOK_SECRET,
        },
        body: JSON.stringify({ recordId }),
      });
      const setupData = await setupRes.json().catch(() => ({}));
      results.push({ recordId, ok: setupRes.ok, status: setupRes.status, detail: setupData });
    } catch (e) {
      results.push({ recordId, ok: false, error: String(e) });
    }
  }

  const succeeded = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);

  return jsonRes({
    total: