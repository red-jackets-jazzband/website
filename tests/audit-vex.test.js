import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseVex, findStatement, uncoveredVersions } from "../scripts/audit-vex.js";

function doc(statement) {
  return JSON.stringify({ "@context": "https://openvex.dev/ns/v0.2.0", statements: [statement] });
}

const NOT_AFFECTED = {
  vulnerability: { name: "CVE-1", aliases: ["GHSA-x"] },
  products: [{ "@id": "pkg:github/o/r", subcomponents: [{ "@id": "pkg:npm/foo@1.0.0" }] }],
  status: "not_affected",
  justification: "vulnerable_code_cannot_be_controlled_by_adversary",
};

test("the repository's own vex file is valid and covers its picomatch advisory", () => {
  const path = fileURLToPath(new URL("../vex/openvex.json", import.meta.url));
  const statements = parseVex(readFileSync(path, "utf8"));
  const statement = findStatement(statements, "GHSA-fc5q-39xc-vjpf");
  assert.ok(statement, "statement for the picomatch advisory");
  assert.equal(findStatement(statements, "CVE-2026-112366"), statement);
  assert.ok(statement.impact_statement);
});

test("parseVex rejects documents that are not OpenVEX or have malformed statements", () => {
  assert.throws(() => parseVex("{}"), /not OpenVEX/);
  assert.throws(() => parseVex(JSON.stringify({ "@context": "https://openvex.dev/ns/v0.2.0" })), /statements/);
  assert.throws(() => parseVex(doc({ ...NOT_AFFECTED, products: [] })), /product/);
  assert.throws(() => parseVex(doc({ ...NOT_AFFECTED, justification: undefined })), /justification/);
  assert.equal(parseVex(doc(NOT_AFFECTED)).length, 1);
});

test("findStatement matches name or alias, and only for not_affected", () => {
  const statements = parseVex(doc(NOT_AFFECTED));
  assert.equal(findStatement(statements, "CVE-1"), statements[0]);
  assert.equal(findStatement(statements, "GHSA-x"), statements[0]);
  assert.equal(findStatement(statements, "GHSA-other"), undefined);
  const affected = parseVex(doc({ ...NOT_AFFECTED, status: "affected" }));
  assert.equal(findStatement(affected, "CVE-1"), undefined);
});

test("uncoveredVersions lists installed versions the statement never analysed", () => {
  const [statement] = parseVex(doc(NOT_AFFECTED));
  assert.deepEqual(uncoveredVersions(statement, "foo", ["1.0.0"]), []);
  assert.deepEqual(uncoveredVersions(statement, "foo", ["1.0.0", "1.0.1"]), ["1.0.1"]);
  assert.deepEqual(uncoveredVersions(statement, "bar", ["1.0.0"]), ["1.0.0"]);
});
