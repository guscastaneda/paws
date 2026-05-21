/**
 * Paws on Longmeadow — Worker Entry Point
 */
import { cors, errRes }              from "./src/helpers.js";
import { handleGetClient }           from "./src/client.js";
import { handlePostProfile }         from "./src/profile.js";
import { handlePostAgreement }       from "./src/agreement.js";
import { handlePostCompliance }      from "./src/compliance.js";
import { handlePostBooking }         from "./src/booking.js";
import { handlePostPet, handlePostVet, handlePostPetUpdate } from "./src/pet.js";

export default {
  async fetch(req, env) {
    const url    = new URL(req.url);
    const path   = url.pathname;
    const method = req.method;

    if (method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    if (path === "/client"     && method === "GET")  return handleGetClient(req, env);
    if (path === "/profile"    && method === "POST") return handlePostProfile(req, env);
    if (path === "/agreement"  && method === "POST") return handlePostAgreement(req, env);
    if (path === "/compliance" && method === "POST") return handlePostCompliance(req, env);
    if (path === "/booking"    && method === "POST") return handlePostBooking(req, env);
    if (path === "/pet"        && method === "POST") return handlePostPet(req, env);
    if (path === "/vet"        && method === "POST") return handlePostVet(req, env);
    if (path === "/pet-update" && method === "POST") return handlePostPetUpdate(req, env);

    return env.ASSETS.fetch(req);
  },
};