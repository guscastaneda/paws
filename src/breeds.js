import { errRes, jsonRes, atFetch } from "./helpers.js";

const BREEDS_TABLE = "tblLsiIKKeimLnBxF";
const BREED_NAME_FIELD = "fldFetxyc0IbkFadw";
const BREED_SPECIES_FIELD = "fldRJouS1cAwWQsmA";

// Simple in-memory cache — resets on Worker restart but good enough
let breedsCache = null;
let breedsCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ── GET /breeds ───────────────────────────────────────────────────────────────
async function handleGetBreeds(req, env) {
  const now = Date.now();
  if (breedsCache && (now - breedsCacheTime) < CACHE_TTL) {
    return jsonRes(breedsCache);
  }

  const res = await atFetch(env, `/${BREEDS_TABLE}?fields[]=${BREED_NAME_FIELD}&fields[]=${BREED_SPECIES_FIELD}&sort[0][field]=${BREED_NAME_FIELD}&sort[0][direction]=asc`);
  if (!res.ok) return errRes("Failed to fetch breeds", 502);

  const data = await res.json();
  const breeds = (data.records || []).map(r => ({
    id:      r.id,
    name:    r.fields[BREED_NAME_FIELD] || "",
    species: (r.fields[BREED_SPECIES_FIELD] || {}).name || "Dog",
  })).filter(b => b.name);

  // Deduplicate by name
  const seen = new Set();
  const unique = breeds.filter(b => {
    if (seen.has(b.name)) return false;
    seen.add(b.name);
    return true;
  });

  breedsCache = unique;
  breedsCacheTime = now;

  return jsonRes(unique);
}

export { handleGetBreeds };
