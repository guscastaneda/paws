const { recordId, webhookSecret } = input.config();

const res = await fetch('https://client.pawsonlongmeadow.com/setup-client', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Secret': webhookSecret,
  },
  body: JSON.stringify({ recordId }),
});

if (!res.ok) {
  const err = await res.text();
  throw new Error(`Setup failed: ${err}`);
}

const data = await res.json();
console.log(`Done. Token: ${data.token}`);
