import { errRes, jsonRes, atFetch } from "./helpers.js";
import { CLIENTS_TABLE, FIELDS } from "./constants.js";

const F_STATUS = "fldmrWP36MOw9Kt3D"; // Onboarding Status (formula) — not in FIELDS

export async function handleGetAdminClients(req, env) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (!secret || secret !== env.ADMIN_SECRET) return errRes("Unauthorized", 401);

  const fieldIds = [FIELDS.CLIENT_NAME, FIELDS.CLIENT_TOKEN, FIELDS.CLIENT_PHONE, F_STATUS];
  const fields = fieldIds.map(f => `fields[]=${f}`).join("&");

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

  const clients = records
    .map(r => ({
      name:   r.fields[FIELDS.CLIENT_NAME]  || "",
      token:  r.fields[FIELDS.CLIENT_TOKEN] || "",
      phone:  r.fields[FIELDS.CLIENT_PHONE] || "",
      status: r.fields[F_STATUS]            || "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return jsonRes({ clients });
}
