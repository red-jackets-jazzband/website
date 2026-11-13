/*
   The abuse counter (docs/device-sync-plan.md, WBS 2.3): one small object that
   decides whether a new vault may be created. The IP is only ever a day-salted
   hash and rows older than a day are dropped, so nothing here identifies
   anyone beyond the day.
*/

export const PER_IP_PER_HOUR = 30;
export const PER_DAY = 500;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const EXPIRY_SLACK_MS = 60 * 1000;

export class SqlLimitStore {
  constructor(sql) {
    this.sql = sql;
    sql.exec("CREATE TABLE IF NOT EXISTS creations (hash TEXT NOT NULL, at INTEGER NOT NULL)");
  }

  prune(before) {
    this.sql.exec("DELETE FROM creations WHERE at < ?", before);
  }

  count(since, hash) {
    const rows = hash === undefined
      ? this.sql.exec("SELECT COUNT(*) AS n FROM creations WHERE at >= ?", since).toArray()
      : this.sql.exec("SELECT COUNT(*) AS n FROM creations WHERE at >= ? AND hash = ?", since, hash).toArray();
    return rows[0].n;
  }

  oldest() {
    const rows = this.sql.exec("SELECT MIN(at) AS at FROM creations").toArray();
    return rows[0].at === null ? null : rows[0].at;
  }

  add(hash, at) {
    this.sql.exec("INSERT INTO creations (hash, at) VALUES (?, ?)", hash, at);
  }
}

export class Limits {
  // `deps` is for tests: { store, now }.
  constructor(ctx, env, deps) {
    const extra = deps || {};
    this.ctx = ctx;
    this.store = extra.store || new SqlLimitStore(ctx.storage.sql);
    this.now = extra.now || (() => { return Date.now(); });
  }

  // POST /?ip=<day-salted hash> → 200 (counted) | 429
  async fetch(request) {
    const hash = new URL(request.url).searchParams.get("ip") || "";
    const now = this.now();
    this.store.prune(now - DAY_MS);
    const overIp = this.store.count(now - HOUR_MS, hash) >= PER_IP_PER_HOUR;
    const overDay = this.store.count(now - DAY_MS) >= PER_DAY;
    if (overIp || overDay) {
      return new Response(JSON.stringify({ error: "Too many new syncs right now — try again later" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
    this.store.add(hash, now);
    // An alarm prunes the rows a day after they were counted, even if no later
    // request ever arrives: set for the first row, then (in alarm()) for
    // whatever is left, so a row is never kept past its day.
    const storage = this.ctx && this.ctx.storage;
    if (storage && storage.setAlarm && await storage.getAlarm() === null) await storage.setAlarm(now + DAY_MS + EXPIRY_SLACK_MS);
    return new Response(null, { status: 200 });
  }

  async alarm() {
    this.store.prune(this.now() - DAY_MS);
    const oldest = this.store.oldest();
    const storage = this.ctx && this.ctx.storage;
    if (oldest !== null && storage && storage.setAlarm) await storage.setAlarm(oldest + DAY_MS + EXPIRY_SLACK_MS);
  }
}
