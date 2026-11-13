// An in-memory localStorage and a vault server speaking the protocol of workers/sync, for the sync tests.
export function makeStorage() {
  const data = {};
  return {
    get length() { return Object.keys(data).length; },
    key: (i) => { return Object.keys(data)[i] ?? null; },
    getItem: (k) => { return Object.hasOwn(data, k) ? data[k] : null; },
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

// An in-memory vault server speaking the same protocol as workers/sync.
export function fakeServer() {
  const vaults = {};
  const gone = {};
  const fetchFn = async (url, init) => {
    const id = url.split("/").pop();
    const json = (body, status) => { return new Response(JSON.stringify(body), { status }); };
    if (gone[id]) return json({}, 410);
    if (init.method === "GET") {
      const v = vaults[id];
      if (!v) return json({}, 404);
      if (init.headers?.["If-None-Match"] === `"${v.version}"`) return new Response(null, { status: 304 });
      return json(v, 200);
    }
    if (init.method === "DELETE") {
      delete vaults[id];
      gone[id] = true;
      return new Response(null, { status: 204 });
    }
    const { expected, blob } = JSON.parse(init.body);
    const v = vaults[id];
    if (!v && expected !== 0) return json({}, 404);
    if (v && v.version !== expected) return json(v, 409);
    vaults[id] = { version: (v ? v.version : 0) + 1, blob };
    return json({ version: vaults[id].version }, 200);
  };
  return { fetchFn, vaults, gone };
}
