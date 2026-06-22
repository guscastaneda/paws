import { errRes, jsonRes, atFetch } from "./helpers.js";
import { CLIENTS_TABLE, FIELDS } from "./constants.js";

const BATCH_SIZE = 10; // small enough to stay well under Workers' subrequest limit per invocation

export async function handlePostBackfillQr(req, env) {
  const secret = req.headers.get('X-Webhook-Secret');
  if (!secret || secret !== env.WEBHOOK_SECRET) {
    return errRes('Unauthorized', 401);
  }

  let body = {};
  try { body = await req.json(); } catch {}
  const startOffset = body.startOffset || 0;

  // Fetch all client IDs (paginated, only once per call — cheap)
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

  const batch = allClientIds.slice(startOffset, startOffset + BATCH_SIZE);
  const results = [];

  for (const recordId of batch) {
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

  const nextOffset = startOffset + BATCH_SIZE;
  const done = nextOffset >= allClientIds.length;

  return jsonRes({
    totalClients: allClientIds.length,
    processedThisBatch: batch.length,
    succeeded: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok),
    nextOffset: done ? null : nextOffset,
    done,
  });
}