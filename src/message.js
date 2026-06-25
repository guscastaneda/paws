import { errRes, jsonRes, atFetch } from "./helpers.js";
import { CLIENTS_TABLE, PETS_TABLE } from "./constants.js";

async function sendEmail(env, { to, replyTo, subject, html }) {
  if (!env.RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Paws on Longmeadow <bookings@pawsonlongmeadow.com>", to, reply_to: replyTo, subject, html }),
  }).catch(e => console.error("Email error:", e));
}

function emailWrapper(body, clientToken) {
  const portalUrl = clientToken
    ? `https://client.pawsonlongmeadow.com/?client=${clientToken}`
    : `https://client.pawsonlongmeadow.com`;
  return `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#2c1f14;background:#fdfcfb;">
    <div style="text-align:center;margin-bottom:2rem;">
      <div style="font-size:1.5rem;letter-spacing:0.15em;font-weight:600;color:#2D5A27;text-transform:uppercase;">Paws on Longmeadow</div>
      <div style="font-size:0.8rem;color:#7a6a5a;margin-top:0.25rem;">Sharon, Massachusetts</div>
    </div>
    ${body}
    <div style="border-top:1px solid #e8e0d8;margin-top:2.5rem;padding-top:1rem;text-align:center;font-size:0.8rem;color:#7a6a5a;">
      © Paws on Longmeadow · Sharon, MA · <a href="${portalUrl}" style="color:#2D5A27;">Client Portal</a>
    </div>
  </div>`;
}

// Escape user-supplied text before embedding in the HTML email
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TOPIC_LABELS = {
  trial:        'Set up a trial',
  availability: 'Availability / booking',
  pet:          'About my pet',
  stay:         'About an upcoming stay',
  billing:      'Billing or documents',
  other:        'Something else',
};

// ── POST /message ─────────────────────────────────────────────────────────────
async function handlePostMessage(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, topic, petId, message } = body;

  // Token + client are required: only someone with a real portal link can reach this.
  if (!token || !clientId) return errRes("Missing client credentials");
  if (!message || !message.trim()) return errRes("Message is required");
  if (message.length > 4000) return errRes("Message is too long");

  // Validate the token actually matches this client (server-side gate against abuse)
  let clientName  = clientId;
  let clientEmail = '';
  let clientToken = '';
  try {
    const clientRes = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`);
    if (!clientRes.ok) return errRes("Client not found", 404);
    const cd = await clientRes.json();
    clientName  = cd.fields["Client Name"]   || clientId;
    clientEmail = cd.fields["Email Address"]  || '';
    clientToken = cd.fields["Client Token"]   || '';
    if (!clientToken || clientToken !== token) return errRes("Invalid credentials", 403);
  } catch (e) {
    console.error("Failed to verify client:", e);
    return errRes("Could not verify client", 502);
  }

  // Optional pet reference
  let petName = '';
  if (petId) {
    try {
      const petRes = await atFetch(env, `/${PETS_TABLE}/${petId}`);
      if (petRes.ok) {
        const pd = await petRes.json();
        petName = pd.fields["Pet Name"] || '';
      }
    } catch (e) { console.error("Failed to fetch pet:", e); }
  }

  const topicLabel = TOPIC_LABELS[topic] || 'General question';
  const safeMessage = esc(message).replace(/\n/g, '<br>');

  const rows = [
    ['From', esc(clientName) + (clientEmail ? ' · ' + esc(clientEmail) : '')],
    ['Topic', esc(topicLabel)],
  ];
  if (petName) rows.push(['About', esc(petName)]);

  const detailTable = `<div style="background:#f5f0eb;border-radius:12px;padding:1.25rem 1.5rem;margin:1.25rem 0;">
    <table style="width:100%;font-size:0.88rem;line-height:1.9;border-collapse:collapse;">
      ${rows.map(([label, value]) => `<tr><td style="color:#7a6a5a;width:90px;vertical-align:top;">${label}</td><td style="font-weight:500;color:#2c1f14;">${value}</td></tr>`).join('')}
    </table>
  </div>`;

  // Owner notification — reply_to set to the client so you can reply straight from your inbox
  await sendEmail(env, {
    to: ['hello@pawsonlongmeadow.com'],
    replyTo: clientEmail || undefined,
    subject: `Portal message (${topicLabel}) — ${clientName}`,
    html: emailWrapper(`
      <h2 style="font-size:1.3rem;font-weight:600;color:#2D5A27;margin-bottom:0.25rem;">New message from the portal</h2>
      ${detailTable}
      <div style="background:#fff;border:1px solid #e8e0d8;border-radius:12px;padding:1.1rem 1.3rem;margin:0.5rem 0;">
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;margin:0;">${safeMessage}</p>
      </div>
      <p style="font-size:0.88rem;color:#7a6a5a;">Reply to this email to respond${clientEmail ? ' to ' + esc(clientName) : ''} directly.</p>
    `, clientToken),
  });

  return jsonRes({ success: true }, 201);
}

export { handlePostMessage };