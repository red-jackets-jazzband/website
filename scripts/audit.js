// `npm audit --audit-level=high`, minus advisories we have consciously accepted.
//
// npm has no "ignore this advisory" switch, and a plain `npm audit` fails CI as
// soon as one high-severity advisory has no patched release - which is what
// happened with `braces` (stack exhaustion on deeply nested patterns, reachable
// only through stylelint's globbing of our own files) while every released
// `braces` version was affected. This script keeps the gate for everything else:
// any high or critical advisory that is NOT in ACCEPTED_ADVISORIES still fails.
//
// Entries here are meant to be temporary: drop one as soon as a fixed version
// exists (npm audit then stops reporting it and the entry is dead weight), and
// say why it is safe to carry in the comment next to it.

import { spawnSync } from "node:child_process";

const ACCEPTED_ADVISORIES = new Map([
  [
    "GHSA-vfj7-8cjw-p6xm",
    "braces ReDoS-style stack exhaustion; dev tooling only (stylelint globbing our own " +
      "repo files), nothing from it ships to the site, and no patched braces release exists yet",
  ],
]);

const BLOCKING = new Set(["high", "critical"]);

function runAudit() {
  // Run through the npm that started us (set by `npm run audit`) rather than
  // looking `npm` up on PATH.
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("Run this through `npm run audit` so the npm in use is known.");
  const result = spawnSync(process.execPath, [npmCli, "audit", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const report = JSON.parse(result.stdout);
  // A failed audit (registry unreachable, bad lockfile, ...) still prints JSON,
  // just an error object instead of a report. Treating that as "no
  // vulnerabilities" would turn the gate green exactly when it couldn't check.
  // A real report always has a `vulnerabilities` object, even when the exit
  // status is non-zero because it lists some.
  if (!report || typeof report.vulnerabilities !== "object" || report.vulnerabilities === null) {
    throw new Error(`npm audit did not return an audit report (exit status ${result.status}): ${result.stdout.slice(0, 300)}`);
  }
  return report;
}

function advisoryId(url) {
  return url.slice(url.lastIndexOf("/") + 1);
}

function blockingAdvisories(report) {
  const found = new Map();
  for (const vuln of Object.values(report.vulnerabilities)) {
    for (const via of vuln.via) {
      // A string `via` is just "depends on that other vulnerable package".
      if (typeof via === "string" || !BLOCKING.has(via.severity)) continue;
      found.set(advisoryId(via.url), `${via.name}: ${via.title} (${via.url})`);
    }
  }
  return found;
}

const advisories = blockingAdvisories(runAudit());
const unaccepted = [...advisories].filter(([id]) => !ACCEPTED_ADVISORIES.has(id));

for (const [id] of advisories) {
  if (ACCEPTED_ADVISORIES.has(id)) console.error(`accepted ${id}: ${ACCEPTED_ADVISORIES.get(id)}`);
}

if (unaccepted.length > 0) {
  console.error("\nnpm audit found high/critical advisories that are not accepted in scripts/audit.js:");
  for (const [, description] of unaccepted) console.error(`  ${description}`);
  process.exit(1);
}

console.error(`audit passed: no unaccepted high/critical advisories (${advisories.size} accepted).`);
