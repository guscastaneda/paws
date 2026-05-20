import { AT } from "./constants.js";

// ── HELPERS ───────────────────────────────────────────────────────────────────
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

function errRes(msg, status = 400) {
  return jsonRes({ error: msg }, status);
}

async function atFetch(env, path, opts = {}) {
  return fetch(AT + path, {
    ...opts,
    headers: {
      Authorization: "Bearer " + env.AIRTABLE_API_KEY,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
}


export { cors, errRes, jsonRes, atFetch };
