import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertPnpmScriptsExist, missingPnpmScripts, pnpmScriptsFromText } from "./pnpm-script-refs.mjs";

describe("pnpm script reference helpers", () => {
  it("extracts unique pnpm script references in first-seen order", () => {
    assert.deepEqual(
      pnpmScriptsFromText("pnpm dogfood:help\npnpm test:dogfood:args\npnpm dogfood:help"),
      ["dogfood:help", "test:dogfood:args"],
    );
  });

  it("ignores pnpm builtin commands that are not package scripts", () => {
    assert.deepEqual(
      pnpmScriptsFromText("pnpm install\npnpm exec tsc --noEmit\npnpm dev\npnpm setup"),
      ["dev"],
    );
  });

  it("ignores prose and wildcard examples that are not concrete script refs", () => {
    assert.deepEqual(
      pnpmScriptsFromText("shared pnpm separator; pnpm forwards args\npnpm integration:* --\n`pnpm ...`"),
      [],
    );
  });

  it("extracts inline-code and environment-prefixed command examples", () => {
    assert.deepEqual(
      pnpmScriptsFromText("Use `pnpm dogfood:status`.\nOMOT_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk"),
      ["dogfood:status", "dogfood:walk"],
    );
  });

  it("extracts chained package-script commands and shell-prompt examples", () => {
    assert.deepEqual(
      pnpmScriptsFromText("node scripts/check.mjs && pnpm test:cli:lib\n$ pnpm test:mcp:docs"),
      ["test:cli:lib", "test:mcp:docs"],
    );
  });

  it("extracts script references after pnpm options", () => {
    assert.deepEqual(
      pnpmScriptsFromText("pnpm --silent dogfood:status\npnpm --filter ./mcp test:mcp:package"),
      ["dogfood:status", "test:mcp:package"],
    );
  });

  it("extracts pnpm run script references", () => {
    assert.deepEqual(
      pnpmScriptsFromText("pnpm run dogfood:status\npnpm --silent run --if-present test:mcp:docs\npnpm run"),
      ["dogfood:status", "test:mcp:docs"],
    );
  });

  it("extracts parenthesized and quoted script references", () => {
    assert.deepEqual(
      pnpmScriptsFromText("(pnpm test:mcp:docs)\npnpm \"dogfood:status\"\npnpm run 'test:cli:args'"),
      ["test:mcp:docs", "dogfood:status", "test:cli:args"],
    );
  });

  it("reports missing package scripts", () => {
    const scripts = { "dogfood:help": "node scripts/dogfood-mcp-walk.mjs --help" };

    assert.deepEqual(missingPnpmScripts("pnpm dogfood:help\npnpm dogfood:missing", scripts), [
      "dogfood:missing",
    ]);
    assert.deepEqual(missingPnpmScripts("pnpm missing-simple", scripts), ["missing-simple"]);
    assert.throws(
      () => assertPnpmScriptsExist("pnpm dogfood:missing", scripts),
      /Missing package\.json scripts: dogfood:missing/,
    );
  });
});
