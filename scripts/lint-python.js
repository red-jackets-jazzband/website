// Runs ruff (ruff.toml) over the repo's Python tooling. ruff is a Python
// package, not an npm one, so it may not be installed locally: the CI job
// installs it from the hash-locked requirements-ci.txt and sets CI, where a
// missing ruff is a failure; elsewhere it's a printed skip, so `npm run lint`
// still works on a machine with no Python tooling.
import { spawnSync } from "node:child_process";

// .venv/bin/ruff first: the repo-local venv (gitignored) is the usual home for it.
const CANDIDATES = [[".venv/bin/ruff"], ["ruff"], ["python3", "-m", "ruff"], ["python", "-m", "ruff"]];

function tryRuff([command, ...prefix]) {
  const result = spawnSync(command, [...prefix, "check", "tools"], { stdio: "inherit" });
  return result.error ? null : result.status;
}

for (const candidate of CANDIDATES) {
  const status = tryRuff(candidate);
  if (status === null) continue;
  process.exit(status);
}

if (process.env.CI) {
  console.error("ruff is not installed (pip install --require-hashes -r requirements-ci.txt).");
  process.exit(1);
}
console.warn("note: ruff not installed, skipping the Python lint (pip install -r requirements-ci.txt to enable it).");
