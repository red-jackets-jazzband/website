/*
   One Durable Object per vault (docs/device-sync-plan.md, WBS 2.1, 2.2, 2.6,
   2.7). It stores one encrypted blob with a version and refuses a write unless
   the writer saw the current version, so two devices can't silently overwrite
   each other. It never sees the code or the content, only ciphertext.

   Internal API (called by index.js, which has done the origin/id/size checks):
     GET    /          → 200 { version, blob } + ETag | 304 | 404 | 410
     PUT    /          body { expected, blob }: expected 0 creates
                       → 200 { version } | 409 { version, blob } | 404 | 410
     DELETE /          → 204, leaves a marker so the id answers 410 from now on
     GET    /live      → WebSocket (Hibernation API); every save sends {version}
   Everything expires with one alarm, 18 months after the last write.
*/

export const EXPIRY_MS = 18 * 30 * 24 * 60 * 60 * 1000;
const CLOSE_NORMAL = 1000;

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function etag(version) {
  return `"${version}"`;
}

// Production storage: the object's own SQLite. One row, id 1. The table is
// created on the first write, never on a read: an unknown id asked about by
// anyone must not leave persistent storage (or an expiry alarm) behind.
export class SqlVaultStore {
  constructor(sql) {
    this.sql = sql;
  }

  ensureTable() {
    this.sql.exec("CREATE TABLE IF NOT EXISTS vault (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, blob TEXT, deleted INTEGER NOT NULL DEFAULT 0)");
  }

  hasTable() {
    return this.sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'vault'").toArray().length > 0;
  }

  read() {
    if (!this.hasTable()) return null;
    const rows = this.sql.exec("SELECT version, blob, deleted FROM vault WHERE id = 1").toArray();
    if (rows.length === 0) return null;
    return { version: rows[0].version, blob: rows[0].blob, deleted: rows[0].deleted === 1 };
  }

  write(version, blob) {
    this.ensureTable();
    this.sql.exec("INSERT OR REPLACE INTO vault (id, version, blob, deleted) VALUES (1, ?, ?, 0)", version, blob);
  }

  markDeleted() {
    this.ensureTable();
    this.sql.exec("INSERT OR REPLACE INTO vault (id, version, blob, deleted) VALUES (1, 0, NULL, 1)");
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readBody(text) {
  const body = parseJson(text);
  const valid = Number.isInteger(body?.expected) && body.expected >= 0 &&
    typeof body.blob === "object" && body.blob !== null && !Array.isArray(body.blob);
  return valid ? body : null;
}

export class Vault {
  // `deps` is for tests: { store, createSocketPair, now }.
  constructor(ctx, env, deps) {
    this.ctx = ctx;
    this.env = env;
    const extra = deps || {};
    this.store = extra.store || new SqlVaultStore(ctx.storage.sql);
    this.createSocketPair = extra.createSocketPair || (() => { return new WebSocketPair(); }); // eslint-disable-line no-undef -- Workers global
    this.now = extra.now || (() => { return Date.now(); });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/live") return this.live(request);
    if (request.method === "GET") return this.get(request);
    if (request.method === "PUT") return this.put(request);
    if (request.method === "DELETE") return this.remove();
    return json({ error: "Method not allowed" }, 405);
  }

  current() {
    const row = this.store.read();
    if (row?.deleted) return { gone: true };
    return row ? { row } : { missing: true };
  }

  get(request) {
    const state = this.current();
    if (state.gone) return json({ error: "This sync was stopped or replaced" }, 410);
    if (state.missing) return json({ error: "No sync found for this code" }, 404);
    const headers = { ETag: etag(state.row.version) };
    if (request.headers.get("If-None-Match") === headers.ETag) return new Response(null, { status: 304, headers });
    return json({ version: state.row.version, blob: JSON.parse(state.row.blob) }, 200, headers);
  }

  async put(request) {
    const body = readBody(await request.text());
    if (!body) return json({ error: "Bad request" }, 400);
    const state = this.current();
    if (state.gone) return json({ error: "This sync was stopped or replaced" }, 410);
    if (state.missing && body.expected !== 0) return json({ error: "No sync found for this code" }, 404);
    if (state.row !== undefined && state.row.version !== body.expected) {
      return json({ version: state.row.version, blob: JSON.parse(state.row.blob) }, 409);
    }
    const version = (state.row ? state.row.version : 0) + 1;
    this.store.write(version, JSON.stringify(body.blob));
    await this.ctx.storage.setAlarm(this.now() + EXPIRY_MS);
    this.broadcast({ version });
    return json({ version }, 200, { ETag: etag(version) });
  }

  async remove() {
    const state = this.current();
    if (state.missing) return json({ error: "No sync found for this code" }, 404);
    this.store.markDeleted();
    await this.ctx.storage.setAlarm(this.now() + EXPIRY_MS);
    this.ctx.getWebSockets().forEach((socket) => {
      socket.close(CLOSE_NORMAL, "deleted");
    });
    return new Response(null, { status: 204 });
  }

  live(request) {
    const state = this.current();
    if (state.gone) return json({ error: "This sync was stopped or replaced" }, 410);
    if (state.missing) return json({ error: "No sync found for this code" }, 404);
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "Expected a WebSocket" }, 426);
    const pair = this.createSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].send(JSON.stringify({ version: state.row.version }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  broadcast(message) {
    const text = JSON.stringify(message);
    this.ctx.getWebSockets().forEach((socket) => {
      try {
        socket.send(text);
      } catch (_e) {
        // a socket that is already closing just misses this push; it catches up on reconnect.
      }
    });
  }

  // Hibernation API: devices only ever listen; a ping gets a pong, the rest is ignored.
  webSocketMessage(socket, message) {
    if (message === "ping") socket.send("pong");
  }

  webSocketClose(socket, code) {
    socket.close(code === 1005 ? CLOSE_NORMAL : code, "closed");
  }

  // 18 months without a write: the vault (or its deleted marker) goes.
  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
