/**
 * Paws on Longmeadow — Worker Entry Point
 */
import { cors, errRes }              from "./src/helpers.js";
import { handleGetClient }           from "./src/client.js";
import { handlePostProfile }         from "./src/profile.js";
import { handlePostAgreement }       from "./src/agreement.js";
import { handlePostCancellation } from './src/cancellation.js';
import { handlePostCancellationConfirmed, handlePostRecurringArchived } from './src/cancellation-confirmed.js';
import { handlePostCompliance }      from "./src/compliance.js";
import { handlePostBooking }         from "./src/booking.js";
import { handlePostMessage }         from "./src/message.js";
import { handleGetAdminClients }     from "./src/admin.js";
import { handlePostRecurringRequest, handlePostRecurringPause, handlePostRecurringCancel } from './src/recurring.js';
import { handleSetupClient }         from './src/setup-client.js';
import { handlePostPet, handlePostVet, handlePostPetUpdate, handlePostPetBreed } from "./src/pet.js";
import { handleGetBreeds }           from './src/breeds.js';
import { handleRunReminders }        from "./src/reminders.js";

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
    if (path === '/cancellation' && method === 'POST') return handlePostCancellation(req, env);
    if (path === "/compliance" && method === "POST") return handlePostCompliance(req, env);
    if (path === '/recurring-request' && method === 'POST') return handlePostRecurringRequest(req, env);
    if (path === '/recurring-pause'   && method === 'POST') return handlePostRecurringPause(req, env);
    if (path === '/recurring-cancel'  && method === 'POST') return handlePostRecurringCancel(req, env);
    if (path === '/cancellation-confirmed' && method === 'POST') return handlePostCancellationConfirmed(req, env);
    if (path === '/recurring-archived'     && method === 'POST') return handlePostRecurringArchived(req, env);
    if (path === "/booking"    && method === "POST") return handlePostBooking(req, env);
    if (path === "/message"    && method === "POST") return handlePostMessage(req, env);
    if (path === "/pet"        && method === "POST") return handlePostPet(req, env);
    if (path === "/vet"        && method === "POST") return handlePostVet(req, env);
    if (path === "/pet-update" && method === "POST") return handlePostPetUpdate(req, env);
    if (path === '/pet-breed' && req.method === 'POST') return handlePostPetBreed(req, env);
    if (path === "/admin/clients" && method === "GET") return handleGetAdminClients(req, env);
    if (path === '/setup-client') return handleSetupClient(req, env);
    if (path === '/breeds' && req.method === 'GET') return handleGetBreeds(req, env);
    if (path === "/run-reminders") return handleRunReminders(req, env);
    return env.ASSETS.fetch(req);
  },

  // Cron entry point. Wired now so Stage 3 only needs a schedule in wrangler.toml.
  // In Stage 1 the engine is dry-run only, so this is a safe no-op preview: it
  // computes the plan and logs it, but sends nothing and writes nothing.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      handleRunReminders(
        new Request("https://internal/run-reminders?key=" + (env.REMINDER_KEY || "")),
        env
      )
    );
  },
};