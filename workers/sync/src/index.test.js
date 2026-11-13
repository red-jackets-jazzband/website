import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { MAX_BODY_BYTES } from "./index.js";
import { Vault, EXPIRY_MS } from "./vault.js";
import { Limits, PER_IP_PER_HOUR } from "./limits.js";

const ORIGIN = "https://www.redjackets.nl";
const ID = "a".repeat(64);
const BLOB = { v: 1, iv: "x", ct: "y" };

function memoryVaultStore() {
  let row = null;
  return {
    read: () => { return row && { ...row }; },
    write: (version, blob) => { row = { version, blob, deleted: false }; },
    markDeleted: () => { row = { version: 0, blob: null, deleted: true }; },
    clear: () => { row = null; },
  };
}

function fakeSocket() {
  const sent = [];
  return { sent, closed: null, send: (m) => { sent.push(m); }, close(code) { this.closed = code; } };
}

// A tiny stand-in for a Durable Object namespace: one instance per id.
function namespace(make) {
  const instances = {};
  return {
    idFromName: (name) => { return name; },
    get: (id) => {
      instances[id] ||= make();
      return { fetch: (url, init) => { return instances[id].fetch(new Request(url, init)); } };
    },
    instances,
  };
}

function makeEnv(extra) {
  const clock = { now: 1_000_000 };
  const sockets = [];
  const vaults = namespace(() => {
    const ctx = {
      alarmAt: null,
      storage: { setAlarm: async (t) => { ctx.alarmAt = t; }, deleteAll: async () => {} },
      getWebSockets: () => { return sockets; },
      acceptWebSocket: () => {},
    };
    const vault = new Vault(ctx, {}, {
      store: memoryVaultStore(),
      now: () => { return clock.now; },
      createSocketPair: () => { return [{}, fakeSocket()]; },
    });
    vault.ctx = ctx;
    return vault;
  });
  let counts = 0;
  const limitStore = {
    prune: () => {},
    count: () => { return counts; },
    add: () => { counts++; },
  };
  const limits = namespace(() => { return new Limits({}, {}, { store: limitStore, now: () => { return clock.now; } }); });
  return { env: { VAULT: vaults, LIMITS: limits, SALT_SECRET: "s", ...extra }, clock, sockets, vaults, setCount: (n) => { counts = n; } };
}

function call(env, method, path, { body, headers, origin = ORIGIN } = {}) {
  const init = { method, headers: { ...(origin ? { Origin: origin } : {}), ...headers } };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  return worker.fetch(new Request(`https://sync.test${path}`, init), env);
}

const put = (env, expected, blob = BLOB) => { return call(env, "PUT", `/v1/vault/${ID}`, { body: { expected, blob } }); };

test("create, read, conditional read, update", async () => {
  const { env } = makeEnv();
  assert.equal((await call(env, "GET", `/v1/vault/${ID}`)).status, 404);
  const created = await put(env, 0);
  assert.equal(created.status, 200);
  assert.deepEqual(await created.json(), { version: 1 });
  const read = await call(env, "GET", `/v1/vault/${ID}`);
  assert.equal(read.headers.get("ETag"), '"1"');
  assert.deepEqual(await read.json(), { version: 1, blob: BLOB });
  const same = await call(env, "GET", `/v1/vault/${ID}`, { headers: { "If-None-Match": '"1"' } });
  assert.equal(same.status, 304);
  assert.deepEqual(await (await put(env, 1, { ...BLOB, ct: "z" })).json(), { version: 2 });
});

test("a write that didn't see the current version gets 409 and the current copy", async () => {
  const { env } = makeEnv();
  await put(env, 0);
  await put(env, 1, { ...BLOB, ct: "newer" });
  const stale = await put(env, 1, { ...BLOB, ct: "stale" });
  assert.equal(stale.status, 409);
  const body = await stale.json();
  assert.equal(body.version, 2);
  assert.equal(body.blob.ct, "newer");
  assert.equal((await put(env, 0)).status, 409); // a second create is a conflict, not an overwrite
});

test("an update to a vault that doesn't exist is 404 and creates nothing", async () => {
  const { env } = makeEnv();
  assert.equal((await put(env, 3)).status, 404);
  assert.equal((await call(env, "GET", `/v1/vault/${ID}`)).status, 404);
});

test("delete leaves a marker: reads, writes and creates answer 410", async () => {
  const { env } = makeEnv();
  await put(env, 0);
  assert.equal((await call(env, "DELETE", `/v1/vault/${ID}`)).status, 204);
  assert.equal((await call(env, "GET", `/v1/vault/${ID}`)).status, 410);
  assert.equal((await put(env, 1)).status, 410);
  assert.equal((await put(env, 0)).status, 410);
  assert.equal((await call(env, "DELETE", "/v1/vault/" + "b".repeat(64))).status, 404);
});

test("origin, id, method and size guards", async () => {
  const { env } = makeEnv();
  assert.equal((await put({ ...env }, 0, BLOB)).status, 200);
  assert.equal((await call(env, "GET", `/v1/vault/${ID}`, { origin: "https://evil.example" })).status, 403);
  assert.equal((await call(env, "PUT", `/v1/vault/${ID}`, { origin: null, body: { expected: 1, blob: BLOB } })).status, 403);
  assert.equal((await call(env, "DELETE", `/v1/vault/${ID}`, { origin: null })).status, 403);
  assert.equal((await call(env, "GET", `/v1/vault/${ID}`, { origin: null })).status, 200);
  assert.equal((await call(env, "GET", "/v1/vault/not-hex")).status, 404);
  assert.equal((await call(env, "GET", `/v1/vault/${"A".repeat(64)}`)).status, 404);
  assert.equal((await call(env, "POST", `/v1/vault/${ID}`, { body: "{}" })).status, 405);
  const big = await put(env, 1, { ...BLOB, ct: "x".repeat(MAX_BODY_BYTES) });
  assert.equal(big.status, 413);
  assert.equal((await call(env, "PUT", `/v1/vault/${ID}`, { body: "not json" })).status, 400);
  assert.equal((await call(env, "PUT", `/v1/vault/${ID}`, { body: { expected: "1", blob: BLOB } })).status, 400);
});

test("CORS: preflight is cached and ETag is exposed; no CORS for other origins", async () => {
  const { env } = makeEnv();
  const preflight = await call(env, "OPTIONS", `/v1/vault/${ID}`);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.equal(preflight.headers.get("Access-Control-Max-Age"), "600");
  assert.match(preflight.headers.get("Access-Control-Allow-Headers"), /If-None-Match/);
  const read = await call(env, "GET", `/v1/vault/${ID}`);
  assert.equal(read.headers.get("Access-Control-Expose-Headers"), "ETag");
  assert.equal((await call(env, "OPTIONS", `/v1/vault/${ID}`, { origin: "https://evil.example" })).status, 403);
  const local = await call(env, "OPTIONS", `/v1/vault/${ID}`, { origin: "http://localhost:1313" });
  assert.equal(local.status, 204);
});

test("new vaults are capped, updates are not", async () => {
  const { env, setCount } = makeEnv();
  assert.equal((await put(env, 0)).status, 200);
  setCount(PER_IP_PER_HOUR);
  const second = await call(env, "PUT", `/v1/vault/${"c".repeat(64)}`, { body: { expected: 0, blob: BLOB } });
  assert.equal(second.status, 429);
  assert.equal(second.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.equal((await put(env, 1)).status, 200);
});

test("each save pushes the new version to connected devices; delete closes them", async () => {
  const { env, sockets } = makeEnv();
  const device = fakeSocket();
  sockets.push(device);
  await put(env, 0);
  await put(env, 1);
  assert.deepEqual(device.sent, ['{"version":1}', '{"version":2}']);
  await call(env, "DELETE", `/v1/vault/${ID}`);
  assert.equal(device.closed, 1000);
});

test("a vault expires 18 months after its last write", async () => {
  const { env, clock, vaults } = makeEnv();
  await put(env, 0);
  assert.equal(vaults.instances[ID].ctx.alarmAt, clock.now + EXPIRY_MS);
});

test("live endpoint needs an upgrade, an existing vault and an allowed origin", async () => {
  const { env } = makeEnv();
  assert.equal((await call(env, "GET", `/v1/vault/${ID}/live`)).status, 404);
  await put(env, 0);
  assert.equal((await call(env, "GET", `/v1/vault/${ID}/live`)).status, 426);
  assert.equal((await call(env, "GET", `/v1/vault/${ID}/live`, { origin: null, headers: { Upgrade: "websocket" } })).status, 403);
  assert.equal((await call(env, "PUT", `/v1/vault/${ID}/live`, { body: "{}" })).status, 405);
});
