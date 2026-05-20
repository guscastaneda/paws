/**
 * Paws on Longmeadow — Worker Entry Point
 */
import { cors, errRes }          from "./src/helpers.js";
import { handleGetClient }       from "./src/client.js";
import { handlePostProfile }     from "./src/profile.js";
import { handlePostAgreement }   from "./src/agreement.js";
import { handlePostCompliance }  from "./src/compliance.js";
import { handlePostBooking }     from "./src/booking.js";

export default {
  async fetch(req, env) {
    const url    = new URL(req.url);
    const path   = url.pathname;
    const method = req.method;

    if (method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    // API routes — handle BEFORE assets
    if (path === "/client"     && method === "GET")  return handleGetClient(req, env);
    if (path === "/profile"    && method === "POST") return handlePostProfile(req, env);
    if (path === "/agreement"  && method === "POST") return handlePostAgreement(req, env);
    if (path === "/compliance" && method === "POST") return handlePostCompliance(req, env);
    if (path === "/booking"    && method === "POST") return handlePostBooking(req, env);

    // Everything else — serve static portal assets
    return env.ASSETS.fetch(req);
  },
};
