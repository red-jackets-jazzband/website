// `npm audit --audit-level=high`, minus advisories we have analysed and
// recorded as not affecting us.
//
// npm has no "ignore this advisory" switch, and a plain `npm audit` fails CI as
// soon as one high-severity advisory has no patched release - which is what
// happened with `braces` (stack exhaustion on deeply nested patterns, reachable
// only through stylelint's globbing of our own files) while every released
// `braces` version was affected. This script keeps the gate for everything else:
// any high or critical advisory that is NOT covered by vex/openvex.json still fails.
//
// The analysis lives in that OpenVEX document (https://openvex.dev), the
// standard way to say "this vulnerable component is not exploitable here", so
// it can be read by other tools too. A `not_affected` statement accepts an
// advisory (matched by GHSA/CVE id) for exactly the package versions it lists
// as subcomponents; a vulnerable version it doesn't list fails again. Entries
// are meant to be temporary: drop a statement as soon as a fixed version is
// installed (npm audit then stops reporting it), and keep its impact_statement
// saying why it is safe to carry.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseVex, findStatement, uncoveredVersions } from "./audit-vex.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const VEX_PATH = fileURLToPath(new URL("../vex/openvex.json", import.meta.url));

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
      const id = advisoryId(via.url);
      const entry = found.get(id) || { name: via.name, description: `${via.name}: ${via.title} (${via.url})`, nodes: new Set() };
      for (const node of vuln.nodes || []) entry.nodes.add(node);
      found.set(id, entry);
    }
  }
  return found;
}

// The versions of the vulnerable package actually installed, read from the
// node_modules paths npm audit names.
function installedVersions(nodes) {
  const versions = new Set();
  for (const node of nodes) {
    versions.add(JSON.parse(readFileSync(`${ROOT}${node}/package.json`, "utf8")).version);
  }
  return [...versions];
}

// Why this advisory is accepted, or why it isn't: { accepted, note }.
function assess(id, entry, statements) {
  const statement = findStatement(statements, id);
  if (!statement) return { accepted: false, note: entry.description };
  const missing = uncoveredVersions(statement, entry.name, installedVersions(entry.nodes));
  if (missing.length > 0) {
    return { accepted: false, note: `${entry.description} - vex/openvex.json does not cover installed ${entry.name} ${missing.join(", ")}` };
  }
  return { accepted: true, note: `${entry.description}: ${statement.impact_statement || statement.justification}` };
}

const statements = parseVex(readFileSync(VEX_PATH, "utf8"));
const assessed = [...blockingAdvisories(runAudit())].map(([id, entry]) => ({ id, ...assess(id, entry, statements) }));
const accepted = assessed.filter((a) => a.accepted);
const unaccepted = assessed.filter((a) => !a.accepted);

for (const { id, note } of accepted) console.error(`accepted ${id} (vex): ${note}`);

if (unaccepted.length > 0) {
  console.error("\nnpm audit found high/critical advisories that are not covered by vex/openvex.json:");
  for (const { note } of unaccepted) console.error(`  ${note}`);
  process.exit(1);
}

console.error(`audit passed: no unaccepted high/critical advisories (${accepted.length} accepted via vex/openvex.json).`);
