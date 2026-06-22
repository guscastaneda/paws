// src/setup-client.js
// POST /setup-client
// Called by Airtable automation when a new client record is created.
// Generates a unique token + SVG QR code and writes both back to the record.

import { cors, errRes, jsonRes, atFetch } from './helpers.js';
import { BASE_ID, CLIENTS_TABLE, FIELDS, QR_CODE_FIELD } from './constants.js';

// ── QR Code Generator (pure JS, no dependencies) ─────────────────────────────

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function buildGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function gfPolyMul(p, q) {
  const r = new Array(p.length + q.length - 1).fill(0);
  for (let i = 0; i < p.length; i++)
    for (let j = 0; j < q.length; j++)
      r[i + j] ^= gfMul(p[i], q[j]);
  return r;
}

function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) g = gfPolyMul(g, [1, GF_EXP[i]]);
  return g;
}

function rsEncode(data, nEc) {
  const gen = rsGenerator(nEc);
  const msg = [...data, ...new Array(nEc).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef) for (let j = 0; j < gen.length; j++) msg[i + j] ^= gfMul(gen[j], coef);
  }
  return msg.slice(data.length);
}

const VERSION_INFO = {
  1:[26,10,1,16,0,0], 2:[44,16,1,28,0,0], 3:[70,26,1,44,0,0],
  4:[100,18,2,32,0,0], 5:[134,24,2,43,0,0], 6:[172,16,4,27,0,0],
  7:[196,18,4,31,0,0], 8:[242,22,2,38,2,39], 9:[292,22,3,36,2,37],
  10:[346,26,4,37,1,38],
};
const VERSION_CAPACITY = {1:16,2:28,3:44,4:64,5:86,6:108,7:124,8:154,9:182,10:216};

function getVersion(n) {
  for (let v = 1; v <= 10; v++) if (n <= VERSION_CAPACITY[v]) return v;
  throw new Error('URL too long for QR');
}

function encodeData(dataBytes, version) {
  const [totalCw, ecPerBlock, b1, cw1, b2, cw2] = VERSION_INFO[version];
  const totalDataCw = totalCw - ecPerBlock * (b1 + b2);
  const bits = [0,1,0,0];
  const n = dataBytes.length;
  for (let i = 7; i >= 0; i--) bits.push((n >> i) & 1);
  for (const byte of dataBytes) for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  bits.push(0,0,0,0);
  while (bits.length % 8) bits.push(0);
  const padBytes = [0xEC, 0x11]; let pi = 0;
  while (bits.length < totalDataCw * 8) {
    const pb = padBytes[pi++ % 2];
    for (let i = 7; i >= 0; i--) bits.push((pb >> i) & 1);
  }
  const codewords = [];
  for (let i = 0; i < totalDataCw * 8; i += 8)
    codewords.push(parseInt(bits.slice(i, i+8).join(''), 2));
  const blocksData = []; let idx = 0;
  for (let i = 0; i < b1; i++) { blocksData.push(codewords.slice(idx, idx+cw1)); idx += cw1; }
  for (let i = 0; i < b2; i++) { blocksData.push(codewords.slice(idx, idx+cw2)); idx += cw2; }
  const blocksEc = blocksData.map(b => rsEncode(b, ecPerBlock));
  const final = [];
  const maxLen = Math.max(...blocksData.map(b => b.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocksData) if (i < b.length) final.push(b[i]);
  for (let i = 0; i < ecPerBlock; i++) for (const b of blocksEc) if (i < b.length) final.push(b[i]);
  return final;
}

function makeMatrix(version) {
  const size = version * 4 + 17;
  const matrix = Array.from({length: size}, () => new Array(size).fill(null));
  const reserved = Array.from({length: size}, () => new Array(size).fill(false));
  const set = (r, c, v) => { matrix[r][c] = v; reserved[r][c] = true; };
  const placeFinder = (r, c) => {
    for (let dr = 0; dr < 7; dr++)
      for (let dc = 0; dc < 7; dc++) {
        const v = (dr===0||dr===6||dc===0||dc===6||(dr>=2&&dr<=4&&dc>=2&&dc<=4)) ? 1 : 0;
        if (r+dr < size && c+dc < size) set(r+dr, c+dc, v);
      }
    for (let i = 0; i < 8; i++) {
      if (r+i < size && c-1 >= 0) set(r+i, c-1, 0);
      if (r+i < size && c+7 < size) set(r+i, c+7, 0);
      if (r-1 >= 0 && c+i < size) set(r-1, c+i, 0);
      if (r+7 < size && c+i < size) set(r+7, c+i, 0);
    }
  };
  placeFinder(0,0); placeFinder(0, size-7); placeFinder(size-7, 0);
  for (let i = 8; i < size-8; i++) { set(6,i,i%2===0?1:0); set(i,6,i%2===0?1:0); }
  set(size-8, 8, 1);
  const ALIGN = {2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],
                 7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]};
  if (version >= 2) {
    const pos = ALIGN[version];
    for (const r of pos) for (const c of pos) {
      if (matrix[r][c] === null)
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
          set(r+dr, c+dc, (Math.abs(dr)===2||Math.abs(dc)===2||(dr===0&&dc===0)) ? 1 : 0);
    }
  }
  for (let i = 0; i < 9; i++) {
    if (matrix[i][8] === null) reserved[i][8] = true;
    if (matrix[8][i] === null) reserved[8][i] = true;
  }
  for (let i = size-8; i < size; i++) {
    if (matrix[i][8] === null) reserved[i][8] = true;
    if (matrix[8][i] === null) reserved[8][i] = true;
  }
  return { matrix, reserved, size };
}

function placeData(matrix, reserved, size, codewords) {
  const bits = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
  let bitIdx = 0, upward = true, col = size - 1;
  while (col >= 0) {
    if (col === 6) col--;
    const rows = upward ? Array.from({length:size},(_,i)=>size-1-i) : Array.from({length:size},(_,i)=>i);
    for (const row of rows) for (let dc = 0; dc < 2; dc++) {
      const c = col - dc;
      if (!reserved[row][c]) matrix[row][c] = bitIdx < bits.length ? bits[bitIdx++] : 0;
    }
    upward = !upward; col -= 2;
  }
}

function applyMask(matrix, reserved, size, maskId) {
  const m = matrix.map(r => [...r]);
  const cond = (r, c) => [
    (r+c)%2===0, r%2===0, c%3===0, (r+c)%3===0,
    (Math.floor(r/2)+Math.floor(c/3))%2===0,
    (r*c)%2+(r*c)%3===0, ((r*c)%2+(r*c)%3)%2===0, ((r+c)%2+(r*c)%3)%2===0,
  ][maskId];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (!reserved[r][c] && cond(r,c)) m[r][c] ^= 1;
  return m;
}

function placeFormat(matrix, size, maskId, eccLevel=0b01) {
  const data = (eccLevel << 3) | maskId;
  const g = 0b10100110111; let rem = data << 10;
  for (let i = 4; i >= 0; i--) if (rem & (1 << (i+10))) rem ^= g << i;
  const fmt = ((data << 10) | rem) ^ 0b101010000010010;
  const bits = Array.from({length:15}, (_,i) => (fmt >> (14-i)) & 1);
  const pos = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
  pos.forEach(([r,c],i) => matrix[r][c] = bits[i]);
  for (let i = 0; i < 7; i++) matrix[size-1-i][8] = bits[i];
  for (let i = 0; i < 8; i++) matrix[8][size-8+i] = bits[7+i];
}

function scoreMatrix(m, size) {
  let score = 0;
  for (let r = 0; r < size; r++) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      if (m[r][c] === m[r][c-1]) run++;
      else { if (run >= 5) score += run-2; run = 1; }
    }
    if (run >= 5) score += run-2;
  }
  for (let c = 0; c < size; c++) {
    let run = 1;
    for (let r = 1; r < size; r++) {
      if (m[r][c] === m[r-1][c]) run++;
      else { if (run >= 5) score += run-2; run = 1; }
    }
    if (run >= 5) score += run-2;
  }
  for (let r = 0; r < size-1; r++)
    for (let c = 0; c < size-1; c++) {
      const v = m[r][c];
      if (m[r+1][c]===v && m[r][c+1]===v && m[r+1][c+1]===v) score += 3;
    }
  return score;
}

function generateQrSvg(text, moduleSize=10) {
  const dataBytes = new TextEncoder().encode(text);
  const version = getVersion(dataBytes.length);
  const codewords = encodeData(Array.from(dataBytes), version);
  const { matrix, reserved, size } = makeMatrix(version);
  placeData(matrix, reserved, size, codewords);
  let bestMask = 0, bestScore = Infinity, bestMatrix = null;
  for (let maskId = 0; maskId < 8; maskId++) {
    const m = applyMask(matrix, reserved, size, maskId);
    placeFormat(m, size, maskId);
    const s = scoreMatrix(m, size);
    if (s < bestScore) { bestScore = s; bestMask = maskId; bestMatrix = m; }
  }
  placeFormat(bestMatrix, size, bestMask);
  const quiet = 4, total = (size + quiet*2) * moduleSize;
  const rects = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (bestMatrix[r][c])
        rects.push(`<rect x="${(c+quiet)*moduleSize}" y="${(r+quiet)*moduleSize}" width="${moduleSize}" height="${moduleSize}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}"><rect width="${total}" height="${total}" fill="white"/><g fill="black">${rects.join('')}</g></svg>`;
}

// ── Token generator ───────────────────────────────────────────────────────────

function generateToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleSetupClient(request, env) {
  if (request.method === 'OPTIONS') return cors();

  // Auth check
  const secret = request.headers.get('X-Webhook-Secret');
  if (!secret || secret !== env.WEBHOOK_SECRET) {
    return errRes('Unauthorized', 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errRes('Invalid JSON', 400);
  }

  const recordId = body.recordId;
  if (!recordId) return errRes('Missing recordId', 400);

  // Generate token
  const token = generateToken();
  const magicLink = `https://client.pawsonlongmeadow.com?client=${token}`;

  // Generate QR SVG and base64 encode it
  const svg = generateQrSvg(magicLink, 10);
  const svgBase64 = btoa(svg);

  // 1. Write token to Airtable
  const tokenRes = await atFetch(env, `/${CLIENTS_TABLE}/${recordId}`, 'PATCH', {
    fields: {
      [FIELDS.CLIENT_TOKEN]: token,
    }
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return errRes(`Failed to write token: ${err}`, 500);
  }

  // 2. Upload QR code via Airtable content API
  const uploadUrl = `https://content.airtable.com/v0/${BASE_ID}/${recordId}/${QR_CODE_FIELD}/uploadAttachment`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contentType: 'image/svg+xml',
      filename: `qr-${token}.svg`,
      file: svgBase64,
    }),
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    return errRes(`Token written but QR upload failed: ${err}`, 500);
  }

  return jsonRes({ ok: true, token, recordId });
}
