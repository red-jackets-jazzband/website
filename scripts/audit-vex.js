// The accepted-advisory side of scripts/audit.js: an OpenVEX document
// (vex/openvex.json, https://openvex.dev) records why an advisory that npm
// audit reports does not apply to this project. Pure functions; audit.js does
// the I/O. Only a `not_affected` statement accepts anything, and only for the
// exact package versions it lists as subcomponents - a still-vulnerable
// version it never analysed fails the gate again.

const CONTEXT_PREFIX = "https://openvex.dev/ns";
const PURL_NPM = "pkg:npm/";

function assertStatement(statement, index) {
  const where = `vex statement ${index}`;
  if (!statement || typeof statement.vulnerability !== "object" || statement.vulnerability === null) {
    throw new Error(`${where}: missing vulnerability`);
  }
  if (typeof statement.vulnerability.name !== "string") throw new Error(`${where}: vulnerability needs a name`);
  if (!Array.isArray(statement.products) || statement.products.length === 0) {
    throw new Error(`${where}: needs at least one product`);
  }
  if (typeof statement.status !== "string") throw new Error(`${where}: missing status`);
  // OpenVEX: a not_affected statement must say why.
  if (statement.status === "not_affected" && !statement.justification && !statement.impact_statement) {
    throw new Error(`${where}: not_affected needs a justification or an impact_statement`);
  }
}

// Parses and validates the document text; returns its statements.
export function parseVex(text) {
  const doc = JSON.parse(text);
  if (!doc || typeof doc["@context"] !== "string" || !doc["@context"].startsWith(CONTEXT_PREFIX)) {
    throw new Error("vex document is not OpenVEX (missing @context)");
  }
  if (!Array.isArray(doc.statements)) throw new Error("vex document has no statements array");
  doc.statements.forEach(assertStatement);
  return doc.statements;
}

function namesOf(statement) {
  const { name, aliases } = statement.vulnerability;
  return [name, ...(Array.isArray(aliases) ? aliases : [])];
}

// The not_affected statement for an advisory, by its id (GHSA/CVE) in the
// statement's name or aliases; undefined when there is none.
export function findStatement(statements, advisoryId) {
  return statements.find((s) => s.status === "not_affected" && namesOf(s).includes(advisoryId));
}

// Package URLs of every subcomponent the statement lists.
function subcomponentIds(statement) {
  const ids = new Set();
  for (const product of statement.products) {
    for (const sub of Array.isArray(product.subcomponents) ? product.subcomponents : []) ids.add(sub["@id"]);
  }
  return ids;
}

// The `name@version` entries of `installed` (the vulnerable package's
// installed versions) the statement does not cover.
export function uncoveredVersions(statement, packageName, installed) {
  const covered = subcomponentIds(statement);
  return installed.filter((version) => !covered.has(`${PURL_NPM}${packageName}@${version}`));
}
