import { errRes, jsonRes, atFetch } from "./helpers.js";
import { CLIENTS_TABLE, FIELDS, QR_CODE_FIELD, BASE_ID } from "./constants.js";
import QRCode from "qrcode";

function generateToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function handleSetupClient(request, env) {
  const secret = request.headers.get('X-Webhook-Secret');
  if (!secret || secret !== env.WEBHOOK_SECRET) {
    return errRes('Unauthorized', 401);
  }

  let body;
  try { body = await request.json(); } catch { return errRes('Invalid JSON', 400); }

  const recordId = body.recordId;
  if (!recordId) return errRes('Missing recordId', 400);

  const token = generateToken();
  const magicLink = `https://client.pawsonlongmeadow.com?client=${token}`;

  const qrDataUrl = await QRCode.toDataURL(magicLink, { width: 450, margin: 4 });
  const qrBase64 = qrDataUrl.split(',')[1];

  const tokenRes = await atFetch(env, `/${CLIENTS_TABLE}/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { [FIELDS.CLIENT_TOKEN]: token } }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return errRes(`Failed to write token: ${err}`, 500);
  }

  const uploadRes = await fetch(
    `https://content.airtable.com/v0/${BASE_ID}/${recordId}/${QR_CODE_FIELD}/uploadAttachment`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.AIRTABLE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contentType: 'image/png',
        filename: `qr-${token}.png`,
        file: qrBase64,
      }),
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    return errRes(`Token written but QR upload failed: ${err}`, 500);
  }

  return jsonRes({ ok: true, token, recordId });
}