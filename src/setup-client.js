import { errRes, jsonRes, atFetch } from "./helpers.js";
import { CLIENTS_TABLE, FIELDS, QR_CODE_FIELD, BASE_ID } from "./constants.js";
import QRCode from "qrcode";

function generateToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
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

  // Use the library's low-level matrix output (no canvas/Buffer dependency),
  // then draw the SVG ourselves — safe in the Workers runtime.
  let qrSvg;
  try {
    const qrData = QRCode.create(magicLink, { errorCorrectionLevel: 'M' });
    const modules = qrData.modules;
    const size = modules.size;
    const moduleSize = 10;
    const quiet = 4;
    const total = (size + quiet * 2) * moduleSize;

    const rects = [];
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (modules.get(row, col)) {
          rects.push(`<rect x="${(col + quiet) * moduleSize}" y="${(row + quiet) * moduleSize}" width="${moduleSize}" height="${moduleSize}"/>`);
        }
      }
    }

    qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}"><rect width="${total}" height="${total}" fill="white"/><g fill="black">${rects.join('')}</g></svg>`;
  } catch (e) {
    return errRes(`QR generation failed: ${e.message || String(e)}`, 500);
  }

  const qrBase64 = toBase64(qrSvg);

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
        contentType: 'image/svg+xml',
        filename: `qr-${token}.svg`,
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