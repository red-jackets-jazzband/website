/*
   The front Worker (docs/device-sync-plan.md, WBS 2.2, 2.3): checks origin,
   id and size, then hands the request to that vault's Durable Object. It
   never parses the blob; there are no accounts, sessions or cookies.

     GET    /v1/vault/:id        read (If-None-Match → 304)
     PUT    /v1/vault/:id        write { expected, blob }; expected 0 creates
     DELETE /v1/vault/:id        delete, leaving a marker (later 410)
     GET    /v1/vault/:id/live   WebSocket pushing {version} after each save
*/
import { Vault } from "./vault.js";
import { Limits } from "./limits.js";

export { Vault, Limits };

export const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_ORIGINS = "https://www.redjackets.nl,http://localhost:1313";
const ROUTE = /^\/v1\/vault\/([0-9a-f]{64})(\/live)?$/;
const PREFLIGHT_SECONDS = "600"; // WebKit's cap

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map((o) => { return o.trim(); });
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
    "Access-Control-Expose-Headers": "ETag",
    "Access-Control-Max-Age": PREFLIGHT_SECONDS,
    Vary: "Origin",
  };
}

function fail(status, message, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...(origin ? corsHeaders(origin) : {}) },
  });
}

function withCors(response, origin) {
  if (!origin || response.status === 101) return response;
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(origin)).forEach(([name, value]) => { headers.set(name, value); });
  return new Response(response.body, { status: response.status, headers });
}

async function hashIp(env, ip) {
  const day = new Date().toISOString().slice(0, 10);
  const data = new TextEncoder().encode(`${env.SALT_SECRET || ""}|${day}|${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => { return b.toString(16).padStart(2, "0"); }).join("");
}

// Browsers always send Origin on PUT/DELETE/WebSocket; a plain GET without
// one (a curl smoke check) only ever gets ciphertext, so it's let through.
function originProblem(request, allowed) {
  const origin = request.headers.get("Origin");
  if (origin) return allowed.includes(origin) ? null : "Origin not allowed";
  return request.method === "GET" && !request.headers.get("Upgrade") ? null : "Origin required";
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// The request body as text, or null once it passes `max` bytes — read in
// chunks, so an oversized upload is cut off instead of buffered whole.
async function readLimited(request, max) {
  const declared = Number(request.headers.get("Content-Length"));
  if (declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); // NOSONAR
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  chunks.forEach((chunk) => { all.set(chunk, at); at += chunk.length; });
  return new TextDecoder().decode(all);
}

async function checkCreate(request, env, body) {
  const parsed = parseJson(body);
  if (!parsed || parsed.expected !== 0) return null; // anything unreadable: the vault answers 400
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const limits = env.LIMITS.get(env.LIMITS.idFromName("global"));
  const answer = await limits.fetch(`https://limits/?ip=${await hashIp(env, ip)}`, { method: "POST" });
  return answer.status === 429 ? answer : null;
}

async function toVault(request, env, route, origin) {
  const stub = env.VAULT.get(env.VAULT.idFromName(route[1]));
  const url = `https://vault/${route[2] ? "live" : ""}`;
  if (request.method !== "PUT") {
    const init = { method: request.method, headers: request.headers };
    return withCors(await stub.fetch(url, init), origin);
  }
  const body = await readLimited(request, MAX_BODY_BYTES);
  if (body === null) return fail(413, "Too much to sync", origin);
  const refused = await checkCreate(request, env, body);
  if (refused) return withCors(refused, origin);
  return withCors(await stub.fetch(url, { method: "PUT", body }), origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = allowedOrigins(env);
    if (request.method === "OPTIONS") {
      return origin && allowed.includes(origin)
        ? new Response(null, { status: 204, headers: corsHeaders(origin) })
        : fail(403, "Origin not allowed");
    }
    const problem = originProblem(request, allowed);
    if (problem) return fail(403, problem);
    const route = ROUTE.exec(new URL(request.url).pathname);
    if (!route) return fail(404, "Not found", origin);
    if (route[2] && request.method !== "GET") return fail(405, "Method not allowed", origin);
    if (!["GET", "PUT", "DELETE"].includes(request.method)) return fail(405, "Method not allowed", origin);
    return toVault(request, env, route, origin);
  },
};
