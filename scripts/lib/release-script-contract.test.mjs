import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  evaluateAgentSetupGate,
  evaluateDesktopReleasePreflight,
} from "./release-script-contract.mjs";

const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;

test("release script contracts accept the current package scripts", () => {
  const setup = evaluateAgentSetupGate(scripts["dogfood:agent-setup-gate"]);
  const desktop = evaluateDesktopReleasePreflight(scripts["desktop:release-preflight"]);

  assert.equal(setup.ok, true, setup.errors.join("\n"));
  assert.equal(desktop.ok, true, desktop.errors.join("\n"));
  assert.ok(desktop.commandCount >= 16, "desktop preflight subject scan went idle");
});

test("agent setup gate accepts reordered flags and different positive bounds", () => {
  const variant = scripts["dogfood:agent-setup-gate"].replace(
    "--verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
    "--fallback-concurrency 2 --exit-zero --fallback-slow-ms 7000 --json --verify-fallbacks --fallback-timeout-ms 20000",
  );

  const result = evaluateAgentSetupGate(variant);
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("agent setup gate rejects a missing automation flag and malformed bounds", () => {
  const missingExitZero = scripts["dogfood:agent-setup-gate"].replace(" --exit-zero", "");
  const malformedConcurrency = scripts["dogfood:agent-setup-gate"].replace(
    "--fallback-concurrency 4",
    "--fallback-concurrency many",
  );

  assert.match(evaluateAgentSetupGate(missingExitZero).errors.join("\n"), /--exit-zero/);
  assert.match(
    evaluateAgentSetupGate(malformedConcurrency).errors.join("\n"),
    /--fallback-concurrency must be a positive integer/,
  );
});

test("desktop preflight accepts harmless extra checks and reordered verify-app flags", () => {
  const commands = scripts["desktop:release-preflight"].split(" && ");
  const verifyAppAt = commands.findIndex((command) => command.startsWith("pnpm desktop:verify-app "));
  assert.ok(verifyAppAt >= 0, "fixture requires the verify-app command");
  commands[verifyAppAt] = [
    "pnpm desktop:verify-app --",
    "--reset-window-state",
    "--require-window",
    "--min-window-size=1040x720",
    "--require-accessibility-text=\"Ontology Atlas\"",
    "--open-app",
    "--require-owner-name=\"Ontology Atlas\"",
    "--kill-existing",
  ].join(" ");
  commands.splice(verifyAppAt, 0, "pnpm optional:deterministic-check");

  const result = evaluateDesktopReleasePreflight(commands.join(" && "));
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("desktop preflight rejects missing, reordered, and source-dogfood steps", () => {
  const current = scripts["desktop:release-preflight"].split(" && ");
  const withoutVaultValidation = current.filter((command) => command !== "pnpm vault:validate");
  const reordered = [...current];
  const sidecarAt = reordered.indexOf("pnpm mcp:build-binary");
  const bridgeAt = reordered.indexOf("pnpm test:desktop:bridge");
  [reordered[sidecarAt], reordered[bridgeAt]] = [reordered[bridgeAt], reordered[sidecarAt]];
  const withDogfood = [...current];
  withDogfood.splice(4, 0, "pnpm dogfood:status");

  assert.match(
    evaluateDesktopReleasePreflight(withoutVaultValidation.join(" && ")).errors.join("\n"),
    /pnpm vault:validate/,
  );
  assert.match(
    evaluateDesktopReleasePreflight(reordered.join(" && ")).errors.join("\n"),
    /must run before/,
  );
  assert.match(
    evaluateDesktopReleasePreflight(withDogfood.join(" && ")).errors.join("\n"),
    /source dogfood command/,
  );
});
