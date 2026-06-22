import { errRes, jsonRes, atFetch } from "./helpers.js";
import { CLIENTS_TABLE, FIELDS } from "./constants.js";
import { setupClientCore } from "./setup-client.js";

const BATCH_SIZE = 10;

export async function handlePostBackfillQr(req, env) {
  const secret = req.headers.get('X-Webhook-Secret');
  if (!secret || secret !== env.WEBHOOK_SECRET) {
    return errRes('Unauthorized', 401);
  }

  let body = {};
  try { body = await req.json(); } catch {}
  const startOffset = body.startOffset || 0;

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
      const result = await setupClientCore(env, recordId);
      results.push({ recordId, ok: true, token: result.token });
    } catch (e) {
      results.push({ recordId, ok: false, error: e.message || String(e) });
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