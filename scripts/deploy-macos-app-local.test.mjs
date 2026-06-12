import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  buildDeployMacosAppPlan,
  installedProcessPatterns,
  parseDeployMacosAppArgs,
} from "./deploy-macos-app-local.mjs";

test("local macOS app deploy defaults to build, Applications install, Relief route, and screenshot proof", () => {
  const options = parseDeployMacosAppArgs([]);
  const plan = buildDeployMacosAppPlan(options);

  assert.equal(options.skipBuild, false);
  assert.equal(options.leaveRunning, true);
  assert.equal(options.verifyTopologyDrag, true);
  assert.equal(options.route, "/en/topology/");
  assert.equal(options.holdMs, 12000);
  assert.equal(options.installPath, "/Applications/Ontology Atlas.app");
  assert.equal(
    options.builtAppPath,
    path.join(
      process.cwd(),
      "src-tauri",
      "target",
      "release",
      "bundle",
      "macos",
      "Ontology Atlas.app",
    ),
  );
  assert.deepEqual(plan.build, ["pnpm", ["desktop:build:app"]]);
  assert.deepEqual(plan.copyInstalled, [
    "ditto",
    [options.builtAppPath, "/Applications/Ontology Atlas.app"],
  ]);
  assert.deepEqual(plan.verify, [
    "pnpm",
    [
      "desktop:verify-app",
      "/Applications/Ontology Atlas.app",
      "--kill-existing",
      "--require-window",
      "--require-capturable-window",
      `--window-screenshot=${path.join(process.cwd(), ".tmp", "ontology-atlas-deployed-relief.png")}`,
      "--hold-ms=12000",
      "--require-owner-name=Ontology Atlas",
      "--min-window-size=1040x720",
      "--require-webview-route=/en/topology/",
      "--leave-running",
      "--verify-topology-drag",
    ],
  ]);
});

test("local macOS app deploy can reuse an existing build and customize proof route", () => {
  const options = parseDeployMacosAppArgs([
    "--skip-build",
    "--no-leave-running",
    "--no-topology-drag",
    "--route=/ko/topology/",
    "--hold-ms=9000",
    "--screenshot=/tmp/atlas.png",
    "--install-path=/tmp/Ontology Atlas.app",
    "--built-app=/tmp/build/Ontology Atlas.app",
  ]);
  const plan = buildDeployMacosAppPlan(options);

  assert.equal(options.skipBuild, true);
  assert.equal(options.leaveRunning, false);
  assert.equal(options.verifyTopologyDrag, false);
  assert.equal(plan.build, null);
  assert.deepEqual(plan.copyInstalled, [
    "ditto",
    ["/tmp/build/Ontology Atlas.app", "/tmp/Ontology Atlas.app"],
  ]);
  assert.equal(plan.verify[1].includes("--leave-running"), false);
  assert.equal(plan.verify[1].includes("--verify-topology-drag"), false);
  assert.ok(plan.verify[1].includes("--require-webview-route=/ko/topology/"));
  assert.ok(plan.verify[1].includes("--hold-ms=9000"));
  assert.ok(plan.verify[1].includes("--window-screenshot=/tmp/atlas.png"));
});

test("local macOS app deploy waits on installed app executable patterns before replacement", () => {
  assert.deepEqual(installedProcessPatterns("/tmp/Ontology Atlas.app"), [
    "/tmp/Ontology Atlas.app/Contents/MacOS/Ontology Atlas",
    "\\.app/Contents/MacOS/Ontology Atlas$",
  ]);
});
