// src/admin.js
import { cors, errRes, jsonRes, atFetch } from "./helpers.js";
import { CLIENTS_TABLE, FIELDS } from "./constants.js";

export async function handleGetAdminClients(req, env) {
  const url = new URL(req.url);

  // Gate with a secret — set ADMIN_SECRET in Cloudflare Workers dashboard
  const secret = url.searchParams.get("secret");
  if (!secret || secret !== env.ADMIN_SECRET) {
    return errRes("Unauthorized", 401);
  }

  const fields = [
    FIELDS.CLIENT_NAME,
    FIELDS.CLIENT_TOKEN,
    FIELDS.CLIENT_PHONE,
  ].map(f => `fields[]=${f}`).join("&");

  // Paginate through all records
  const records = [];
  let offset = null;

  do {
    const qs = `?${fields}&pageSize=100${offset ? "&offset=" + offset : ""}`;
    const res = await atFetch(env, `/${CLIENTS_TABLE}${qs}`);
    if (!res.ok) return errRes("Airtable error", 502);
    const data = await res.json();
    records.push(...data.records);
    offset = data.offset || null;
  } while (offset);

  const clients = records.map(r => ({
    name: r.fields[FIELDS.CLIENT_NAME] || "",
    token: r.fields[FIELDS.CLIENT_TOKEN] || "",
    phone: r.fields[FIELDS.CLIENT_PHONE] || "",
  }));

  // Sort alphabetically
  clients.sort((a, b) => a.name.localeCompare(b.name));

  return jsonRes({ clients });
}