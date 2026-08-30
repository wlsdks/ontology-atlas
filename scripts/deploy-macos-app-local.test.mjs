import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildDeployMacosAppPlan,
  clearInstalledWebkitAssetCaches,
  installedProcessPatterns,
  parseDeployMacosAppArgs,
  resolveDefaultDeployRoute,
  summarizeDeployMacosAppEvidence,
} from "./deploy-macos-app-local.mjs";

test("local deploy clears stale WebKit assets without deleting vault persistence", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "ontology-atlas-webkit-cache-"));
  const cacheRoot = path.join(
    homeDir,
    "Library/Caches/dev.jinan.ontology-atlas/WebKit",
  );
  const indexedDb = path.join(
    homeDir,
    "Library/WebKit/dev.jinan.ontology-atlas/WebsiteData/IndexedDB",
  );
  fs.mkdirSync(path.join(cacheRoot, "NetworkCache"), { recursive: true });
  fs.mkdirSync(path.join(cacheRoot, "CacheStorage"), { recursive: true });
  fs.mkdirSync(indexedDb, { recursive: true });

  try {
    const removed = clearInstalledWebkitAssetCaches({ homeDir });

    assert.deepEqual(removed.map((entry) => path.basename(entry)).sort(), [
      "CacheStorage",
      "NetworkCache",
    ]);
    assert.equal(fs.existsSync(path.join(cacheRoot, "NetworkCache")), false);
    assert.equal(fs.existsSync(path.join(cacheRoot, "CacheStorage")), false);
    assert.equal(fs.existsSync(indexedDb), true);
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test("local macOS app deploy default route follows macOS preferred Korean language", () => {
  assert.equal(
    resolveDefaultDeployRoute({
      env: { LANG: "C.UTF-8" },
      appleLanguagesRaw: '("ko-KR")',
    }),
    "/ko/topology/",
  );
});

test("local macOS app deploy default route falls back to English without a Korean system language", () => {
  assert.equal(
    resolveDefaultDeployRoute({
      env: { LANG: "C.UTF-8" },
      appleLanguagesRaw: '("en-US")',
    }),
    "/en/topology/",
  );
});

test("local macOS app deploy builds without release updater signing, installs, and verifies the map route", () => {
  const options = parseDeployMacosAppArgs([], {
    env: { LANG: "C.UTF-8" },
    appleLanguagesRaw: '("en-US")',
  });
  const plan = buildDeployMacosAppPlan(options);

  assert.equal(options.skipBuild, false);
  assert.equal(options.leaveRunning, true);
  /*
   * 2026-08-11 — **the drag proof was retired.** Its probe waited for Sigma-era cards
   * (`sigma-skeleton-cards` · `data-skeleton-card`), that DOM disappeared when the map
   * became a canvas, and running it always failed with "waiting for selectable
   * domain:views card". CI referenced it 0 times.
   */
  assert.equal(options.requireScreenshot, false);
  assert.equal(options.visualEvidence, true);
  assert.equal(
    options.webviewEvidencePath,
    path.join(process.cwd(), ".tmp", "ontology-atlas-deployed-relief.webview.json"),
  );
  assert.equal(options.route, "/en/topology/");
  assert.equal(options.holdMs, 12000);
  assert.equal(options.minWindowSize, "1360x840");
  assert.equal(options.minWebviewSize, "1400x860");
  assert.equal(options.fixtureVaultPath, path.join(process.cwd(), "docs", "ontology"));
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
  assert.deepEqual(plan.build, ["pnpm", ["desktop:build:app:local"]]);
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
      "--hold-ms=12000",
      "--require-webview-route=/en/topology/",
      `--webview-fixture-vault=${path.join(process.cwd(), "docs", "ontology")}`,
      "--require-window",
      "--require-owner-name=Ontology Atlas",
      "--min-window-size=1360x840",
      `--try-window-screenshot=${path.join(process.cwd(), ".tmp", "ontology-atlas-deployed-relief.png")}`,
      "--min-webview-size=1400x860",
      `--webview-evidence=${path.join(process.cwd(), ".tmp", "ontology-atlas-deployed-relief.webview.json")}`,
      "--leave-running",
    ],
  ]);
  assert.deepEqual(plan.fallbackVerify, [
    "pnpm",
    [
      "desktop:verify-app",
      "/Applications/Ontology Atlas.app",
      "--kill-existing",
      "--hold-ms=12000",
      "--require-webview-route=/en/topology/",
      `--webview-fixture-vault=${path.join(process.cwd(), "docs", "ontology")}`,
      "--min-webview-size=1400x860",
      `--webview-evidence=${path.join(process.cwd(), ".tmp", "ontology-atlas-deployed-relief.webview.json")}`,
      "--leave-running",
    ],
  ]);
});

test("local macOS app deploy keeps drag proof only for the plain topology route", () => {
});

test("local macOS app deploy does not let drag proof rewrite a query-specific route", () => {
  const options = parseDeployMacosAppArgs([
    "--route=/ko/topology/?mode=path",
    "--webview-evidence=/tmp/path-mode.json",
  ]);
  const plan = buildDeployMacosAppPlan(options);
  assert.ok(plan.verify[1].includes("--require-webview-route=/ko/topology/?mode=path"));
  assert.ok(plan.fallbackVerify?.[1].includes("--require-webview-route=/ko/topology/?mode=path"));
});

test("local macOS app deploy can require a screenshot proof when macOS capture is available", () => {
  const options = parseDeployMacosAppArgs(["--require-screenshot"]);
  const plan = buildDeployMacosAppPlan(options);

  assert.equal(options.requireScreenshot, true);
  assert.equal(plan.fallbackVerify, null);
  assert.ok(plan.verify[1].includes("--require-capturable-window"));
  assert.ok(
    plan.verify[1].includes(
      `--window-screenshot=${path.join(process.cwd(), ".tmp", "ontology-atlas-deployed-relief.png")}`,
    ),
  );
});

test("local macOS app deploy can reuse an existing build and customize proof route", () => {
  const options = parseDeployMacosAppArgs([
    "--skip-build",
    "--no-leave-running",
    "--no-visual-evidence",
    "--require-screenshot",
    "--route=/ko/topology/",
    "--hold-ms=9000",
    "--min-window-size=1500x920",
    "--min-webview-size=1480x880",
    "--screenshot=/tmp/atlas.png",
    "--webview-evidence=/tmp/atlas-webview.json",
    "--webview-fixture-vault=/tmp/project/atlas",
    "--install-path=/tmp/Ontology Atlas.app",
    "--built-app=/tmp/build/Ontology Atlas.app",
  ]);
  const plan = buildDeployMacosAppPlan(options);

  assert.equal(options.skipBuild, true);
  assert.equal(options.leaveRunning, false);
  assert.equal(options.requireScreenshot, true);
  assert.equal(options.visualEvidence, false);
  assert.equal(plan.build, null);
  assert.deepEqual(plan.copyInstalled, [
    "ditto",
    ["/tmp/build/Ontology Atlas.app", "/tmp/Ontology Atlas.app"],
  ]);
  assert.equal(plan.verify[1].includes("--leave-running"), false);
  // The drag proof is retired — that flag is not passed on any route.
  assert.equal(plan.verify[1].includes("--verify-topology-drag"), false);
  assert.ok(plan.verify[1].includes("--require-webview-route=/ko/topology/"));
  assert.ok(plan.verify[1].includes("--hold-ms=9000"));
  assert.ok(plan.verify[1].includes("--min-window-size=1500x920"));
  assert.ok(plan.verify[1].includes("--min-webview-size=1480x880"));
  assert.ok(plan.verify[1].includes("--window-screenshot=/tmp/atlas.png"));
  assert.equal(plan.verify[1].includes("--try-window-screenshot=/tmp/atlas.png"), false);
  assert.ok(plan.verify[1].includes("--webview-evidence=/tmp/atlas-webview.json"));
  assert.ok(plan.verify[1].includes("--webview-fixture-vault=/tmp/project/atlas"));
  assert.equal(plan.fallbackVerify, null);
});

test("local macOS app deploy can use deterministic WebView-only verification", () => {
  const options = parseDeployMacosAppArgs(["--no-visual-evidence"], {
    env: { LANG: "C.UTF-8" },
    appleLanguagesRaw: '("en-US")',
  });
  const plan = buildDeployMacosAppPlan(options);

  assert.equal(options.visualEvidence, false);
  assert.equal(plan.verify[1].includes("--require-window"), false);
  assert.equal(plan.verify[1].includes("--require-owner-name=Ontology Atlas"), false);
  assert.equal(plan.verify[1].some((arg) => arg.startsWith("--min-window-size=")), false);
  assert.ok(plan.verify[1].includes("--min-webview-size=1400x860"));
  assert.equal(plan.verify[1].some((arg) => arg.startsWith("--try-window-screenshot=")), false);
  assert.ok(plan.verify[1].includes("--require-webview-route=/en/topology/"));
  assert.ok(
    plan.verify[1].includes(
      `--webview-fixture-vault=${path.join(process.cwd(), "docs", "ontology")}`,
    ),
  );
  assert.equal(plan.fallbackVerify, null);
});

test("local macOS app deploy reports visual evidence honestly when window capture falls back", () => {
  const options = parseDeployMacosAppArgs([], {
    env: { LANG: "C.UTF-8" },
    appleLanguagesRaw: '("en-US")',
  });
  const summary = summarizeDeployMacosAppEvidence(options, {
    screenshotExists: false,
    usedFallback: true,
  });

  assert.equal(
    summary.screenshot,
    `unavailable-after-window-fallback:${path.join(process.cwd(), ".tmp", "ontology-atlas-deployed-relief.png")}`,
  );
  assert.equal(
    summary.visualEvidence,
    "unavailable; window/capture verification failed and deterministic WebView fallback passed",
  );
  assert.equal(
    summary.webviewEvidence,
    path.join(process.cwd(), ".tmp", "ontology-atlas-deployed-relief.webview.json"),
  );
});

test("local macOS app deploy distinguishes saved visual evidence from disabled visual evidence", () => {
  const visualOptions = parseDeployMacosAppArgs([], {
    env: { LANG: "C.UTF-8" },
    appleLanguagesRaw: '("en-US")',
  });
  assert.deepEqual(
    summarizeDeployMacosAppEvidence(visualOptions, {
      screenshotExists: true,
      usedFallback: false,
    }),
    {
      screenshot: path.join(process.cwd(), ".tmp", "ontology-atlas-deployed-relief.png"),
      visualEvidence: path.join(process.cwd(), ".tmp", "ontology-atlas-deployed-relief.png"),
      webviewEvidence: path.join(process.cwd(), ".tmp", "ontology-atlas-deployed-relief.webview.json"),
    },
  );

  const webviewOnlyOptions = parseDeployMacosAppArgs(["--no-visual-evidence"], {
    env: { LANG: "C.UTF-8" },
    appleLanguagesRaw: '("en-US")',
  });
  assert.deepEqual(
    summarizeDeployMacosAppEvidence(webviewOnlyOptions, {
      screenshotExists: false,
      usedFallback: false,
    }),
    {
      screenshot: "not requested",
      visualEvidence: "disabled",
      webviewEvidence: path.join(process.cwd(), ".tmp", "ontology-atlas-deployed-relief.webview.json"),
    },
  );
});

test("local macOS app deploy waits on installed app executable patterns before replacement", () => {
  assert.deepEqual(installedProcessPatterns("/tmp/Ontology Atlas.app"), [
    "/tmp/Ontology Atlas.app/Contents/MacOS/Ontology Atlas",
    "\\.app/Contents/MacOS/Ontology Atlas$",
  ]);
});
