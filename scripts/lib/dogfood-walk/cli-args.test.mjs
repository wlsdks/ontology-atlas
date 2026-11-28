#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { assertPnpmScriptsExist } from "../pnpm-script-refs.mjs";
import {
  dogfoodTimeoutErrorMessage,
  dogfoodUsage,
  parseDogfoodArgs,
  parseDogfoodTimeoutMs,
} from "./cli-args.mjs";

const ROOT_PKG = JSON.parse(readFileSync("package.json", "utf-8"));

describe("dogfood walk command line", () => {
  it("parses the dogfood timeout as a strict positive integer", () => {
    assert.equal(parseDogfoodTimeoutMs(undefined), 5000);
    assert.equal(parseDogfoodTimeoutMs("12000"), 12000);
    assert.equal(parseDogfoodTimeoutMs("1000ms"), false);
    assert.equal(parseDogfoodTimeoutMs("0"), false);
    assert.match(dogfoodTimeoutErrorMessage("1000ms"), /Received: "1000ms"/);
  });

  it("prints dogfood help without starting a server, and every pnpm script it names exists", () => {
    assert.deepEqual(parseDogfoodArgs(["--help"]), { help: true, error: null });
    assert.deepEqual(parseDogfoodArgs(["--", "-h"]), { help: true, error: null });
    assert.deepEqual(parseDogfoodArgs([]), { help: false, error: null });
    assertPnpmScriptsExist(dogfoodUsage(), ROOT_PKG.scripts);
  });

  it("rejects an argument the walk does not take and suggests the nearest option", () => {
    assert.deepEqual(parseDogfoodArgs(["docs/ontology"]), {
      help: false,
      error: "dogfood:walk does not accept arguments: docs/ontology\nRun pnpm dogfood:walk -- --help for usage.",
    });
    assert.match(parseDogfoodArgs(["--hlep"]).error, /Did you mean --help\?/);
  });
});
