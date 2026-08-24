#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { resolveMacosExecutable } from "./lib/macos-release-names.mjs";
import { AI_SETTINGS_PAYLOAD_TIMEOUT_MS, authorityOfBaseUrl, isSafeAiSettingsBaseUrl, validateAiSettingsAuditTrail } from "./lib/verify-macos/ai-settings-contract.mjs";
import { appBundleName, names, root } from "./lib/verify-macos/context.mjs";
import { fail, normalizeWebviewRoute, parseVerifyAppLaunchArgs, printHelp, sleep, windowStateFlagConflict } from "./lib/verify-macos/cli-args.mjs";
import { writeWebviewEvidence } from "./lib/verify-macos/evidence-payload.mjs";
import { validateWebviewVerifyPayload } from "./lib/verify-macos/payload-contract.mjs";
import { createVerifyLock, existingProcessIds, printBundlePathConflictWarnings, processExists, readBundleIdentifier, setAsideWindowState, staleInstanceFailure, terminate, terminateExisting, verifyLockPath, waitForExistingProcessesToExit, windowStatePath } from "./lib/verify-macos/process-lock.mjs";
import { waitForWebviewVerifyPayload } from "./lib/verify-macos/relation-marker-validators.mjs";
import { printWindowDiagnostics, tryCaptureWindowEvidence, verifyCapturableWindow, verifyOnscreenWindow } from "./lib/verify-macos/visual-evidence.mjs";
import { webviewVerifyEnvPatch } from "./lib/verify-macos/webview-env.mjs";
import { verifyAccessibilityText, verifyAccessibilityWindow, verifyFrontmostWindow } from "./lib/verify-macos/window-accessibility.mjs";

export * from "./lib/verify-macos/ai-settings-contract.mjs";
export * from "./lib/verify-macos/webview-env.mjs";
export * from "./lib/verify-macos/cli-args.mjs";
export * from "./lib/verify-macos/process-lock.mjs";
export * from "./lib/verify-macos/topology-panel-contracts.mjs";
export * from "./lib/verify-macos/relation-marker-validators.mjs";
export * from "./lib/verify-macos/payload-contract.mjs";
export * from "./lib/verify-macos/window-accessibility.mjs";
export * from "./lib/verify-macos/visual-evidence.mjs";
export * from "./lib/verify-macos/evidence-payload.mjs";

async function verifyOpenAppLaunch({
  appPath,
  executablePath,
  holdMs,
  leaveRunning,
  requireWindow,
  requireCapturableWindow,
  requireAccessibilityWindow,
  requireFrontmost,
  requireAccessibilityText,
  printWindowDiagnostics: shouldPrintWindowDiagnostics,
  requireOwnerName,
  minWindowSize,
  windowScreenshotPath,
  tryWindowScreenshotPath,
}) {
  const open = spawn("open", ["-n", appPath], {
    cwd: path.dirname(appPath),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  open.stdout.setEncoding("utf8");
  open.stderr.setEncoding("utf8");
  open.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  open.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const openExit = await new Promise((resolve) => {
    open.once("exit", (code, signal) => resolve({ code, signal }));
  });

  if (openExit.code !== 0) {
    fail(
      [
        `open failed for ${appPath} (code=${openExit.code}, signal=${openExit.signal})`,
        stdout.trim() ? `stdout:\n${stdout.trim()}` : null,
        stderr.trim() ? `stderr:\n${stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  await sleep(holdMs);

  if (!processExists(executablePath)) {
    fail(`${path.basename(appPath)} was not running after LaunchServices hold (${holdMs}ms).`);
  }

  let windows = [];
  if (requireWindow) {
    windows = verifyOnscreenWindow({
      appPath,
      executablePath,
      requireOwnerName,
      minWindowSize,
    });
  }

  if (requireCapturableWindow) {
    verifyCapturableWindow({
      appPath,
      executablePath,
      windows,
      windowScreenshotPath,
      printDiagnosticsOnFailure: shouldPrintWindowDiagnostics,
    });
  }
  if (tryWindowScreenshotPath) {
    tryCaptureWindowEvidence({
      appPath,
      executablePath,
      windows,
      windowScreenshotPath: tryWindowScreenshotPath,
    });
  }

  if (requireAccessibilityWindow) {
    verifyAccessibilityWindow({ appPath, executablePath });
  }

  if (requireFrontmost) {
    verifyFrontmostWindow({
      appPath,
      executablePath,
      printDiagnosticsOnFailure: shouldPrintWindowDiagnostics,
    });
  }

  if (requireAccessibilityText.length > 0) {
    verifyAccessibilityText({ appPath, executablePath, requiredText: requireAccessibilityText });
  }

  if (shouldPrintWindowDiagnostics) {
    printWindowDiagnostics({ executablePath });
  }

  if (!leaveRunning) {
    terminateExisting({ appPath, executablePath, appName: names.appName });
  }
}


/**
 * After the screen says "verified", check whether **the disk says the same thing.**
 *
 * The DOM markers do not render the host (the audit table shows only vendor name,
 * purpose, and scope). So "did the request really go to that address" can only be
 * proven by the plain-text record inside the vault — without this check, screen copy
 * alone would pass, and that is exactly the fake pass this rule exists to block.
 */
function verifyAiSettingsAuditTrail({ vaultPath, since, baseUrl, markers }) {
  if (!vaultPath) {
    fail("--verify-ai-settings requires --webview-fixture-vault so the audit trail can be read.");
  }
  const auditPath = path.join(vaultPath, ".ontology-atlas", "llm-audit.jsonl");
  let raw = "";
  try {
    raw = fs.readFileSync(auditPath, "utf8");
  } catch (error) {
    fail(
      `--verify-ai-settings could not read the vault audit log at ${auditPath}: ${error?.message ?? error}`,
    );
  }
  const expectedHost = authorityOfBaseUrl(baseUrl);
  const { error, entry } = validateAiSettingsAuditTrail(raw, {
    since,
    expectedHost: expectedHost || null,
  });
  if (error) {
    fail(`AI settings audit trail check failed: ${error} (${auditPath})`);
  }
  console.log(
    `[desktop-app-verify] AI settings: local runner at ${expectedHost} answered with ${markers.aiSettingsVerification?.modelOptionCount ?? 0} model(s); chose ${markers.aiSettingsVerification?.selectedModel ?? "none"}; audit line at=${entry.at} host=${entry.host} outcome=${entry.outcome} http=${entry.httpStatus ?? "none"}`,
  );
}


async function verifyExecutableLaunch({
  appPath,
  executablePath,
  holdMs,
  leaveRunning,
  requireWindow,
  requireCapturableWindow,
  requireAccessibilityWindow,
  requireFrontmost,
  requireWebviewContent,
  requireWebviewRoute,
  webviewFixtureVaultPath,
  verifyAiSettings,
  aiSettingsBaseUrl,
  requireWebviewReducedMotion,
  requireAccessibilityText,
  printWindowDiagnostics: shouldPrintWindowDiagnostics,
  requireOwnerName,
  minWindowSize,
  minWebviewSize,
  maxWebviewSize,
  webviewWindowSize,
  windowScreenshotPath,
  tryWindowScreenshotPath,
  webviewEvidencePath,
}) {
  // The audit line must belong to **this run**, so the time before launch is the floor.
  const launchedAt = Date.now();
  const child = spawn(executablePath, {
    cwd: path.dirname(executablePath),
    env: requireWebviewContent
      ? {
          ...process.env,
          ...webviewVerifyEnvPatch({
            requireWebviewRoute,
            webviewFixtureVaultPath,
            verifyAiSettings,
            aiSettingsBaseUrl,
            webviewWindowSize,
          }),
        }
      : process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  let earlyExit = null;
  child.once("exit", (code, signal) => {
    earlyExit = { code, signal };
  });

  await sleep(holdMs);

  if (earlyExit) {
    fail(
      [
        `${appBundleName} exited before ${holdMs}ms (code=${earlyExit.code}, signal=${earlyExit.signal})`,
        stdout.trim() ? `stdout:\n${stdout.trim()}` : null,
        stderr.trim() ? `stderr:\n${stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  let windows = [];
  if (requireWindow) {
    windows = verifyOnscreenWindow({
      appPath,
      executablePath,
      requireOwnerName,
      minWindowSize,
    });
  }

  let webviewPayload = null;
  if (requireWebviewContent) {
    const validationOptions = {
      expectedPath: requireWebviewRoute,
      expectedFixtureVault: webviewFixtureVaultPath,
      minWebviewSize,
      maxWebviewSize,
      requireAiSettings: verifyAiSettings,
      expectedAiSettingsBaseUrl: verifyAiSettings ? aiSettingsBaseUrl : null,
      requireWebviewReducedMotion,
    };
    const { payload, validationError: webviewError } = await waitForWebviewVerifyPayload(
      () => stdout,
      {
        // The AI settings flow is five clicks deep — open the sheet, move to the section,
        // enter the address, confirm the round trip, choose a model — so the marker does not
        // arrive within the default 15 s window. Widening the window is not the same as
        // softening the verdict; the verdict is unchanged.
        ...(verifyAiSettings ? { timeoutMs: AI_SETTINGS_PAYLOAD_TIMEOUT_MS } : {}),
        // `stdout` is read at validation time, not captured now, so the window-state marker the app
        // printed during startup is in scope. Holding this stream means the run launched with the
        // verify env, which is exactly when the plugin must have been left unregistered.
        validatePayload: (candidate) =>
          validateWebviewVerifyPayload(candidate, {
            ...validationOptions,
            launchStdout: stdout,
          }),
      },
    );
    if (webviewError) {
      fail(
        [
          `${appBundleName} WebView content verification failed: ${webviewError}`,
          stdout.trim() ? `stdout:\n${stdout.trim()}` : null,
          stderr.trim() ? `stderr:\n${stderr.trim()}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
    webviewPayload = payload;
    if (verifyAiSettings) {
      verifyAiSettingsAuditTrail({
        vaultPath: webviewFixtureVaultPath,
        since: launchedAt,
        baseUrl: aiSettingsBaseUrl,
        markers: payload?.markers ?? {},
      });
    }
    writeWebviewEvidence(webviewPayload, webviewEvidencePath, {
      visualEvidencePath: tryWindowScreenshotPath ?? windowScreenshotPath,
    });
  }

  if (requireCapturableWindow) {
    const requiredVisualEvidence = verifyCapturableWindow({
      appPath,
      executablePath,
      windows,
      windowScreenshotPath,
      printDiagnosticsOnFailure: shouldPrintWindowDiagnostics,
    });
    if (!tryWindowScreenshotPath && webviewPayload && webviewEvidencePath && requiredVisualEvidence) {
      writeWebviewEvidence(webviewPayload, webviewEvidencePath, {
        visualEvidence: requiredVisualEvidence,
      });
    }
  }
  if (tryWindowScreenshotPath) {
    const visualEvidence = tryCaptureWindowEvidence({
      appPath,
      executablePath,
      windows,
      windowScreenshotPath: tryWindowScreenshotPath,
      webviewEvidencePath,
    });
    if (webviewPayload && webviewEvidencePath && visualEvidence) {
      writeWebviewEvidence(webviewPayload, webviewEvidencePath, {
        visualEvidence,
      });
    }
  }

  if (requireAccessibilityWindow) {
    verifyAccessibilityWindow({ appPath, executablePath });
  }

  if (requireFrontmost) {
    verifyFrontmostWindow({
      appPath,
      executablePath,
      printDiagnosticsOnFailure: shouldPrintWindowDiagnostics,
    });
  }

  if (requireAccessibilityText.length > 0) {
    verifyAccessibilityText({ appPath, executablePath, requiredText: requireAccessibilityText });
  }

  if (shouldPrintWindowDiagnostics) {
    printWindowDiagnostics({ executablePath });
  }

  if (!leaveRunning) {
    await terminate(child, {
      appPath,
      executablePath,
      appName: names.appName,
    });
  } else {
    child.stdout.destroy();
    child.stderr.destroy();
    child.unref();
  }
}


/**
 * Puts the parked window-state file back only once the app is actually gone.
 *
 * The window-state plugin writes geometry when the app exits, so restoring while any instance is
 * still alive hands the owner's just-restored file straight to that writer — `terminateExisting`
 * only waits about 2.5 s before falling through, and the `--open-app` instance runs without the
 * verify env, so its plugin is registered. If the wait times out with processes still alive, the
 * honest move is to **leave the file parked and say so**: the parked copy is the only surviving
 * byte-for-byte owner geometry, and restoring it under a live writer would convert a loud,
 * recoverable failure into a silent loss the moment the app quits.
 *
 * Returns `{ restored, remainingPids }`; injectable collaborators keep this testable without
 * real processes or a real filesystem.
 */
export async function restoreWindowStateAfterExit({
  guard,
  appPath,
  executablePath,
  waitForExit = waitForExistingProcessesToExit,
  warn = (message) => console.error(`[desktop-app-verify] ${message}`),
} = {}) {
  if (!guard?.moved) {
    // Nothing was parked, so there is no file to protect and no reason to poll the process table.
    guard?.restore();
    return { restored: false, remainingPids: [] };
  }
  const remainingPids = await waitForExit({ appPath, executablePath });
  if (remainingPids.length > 0) {
    warn(
      `saved window geometry was NOT restored: process(es) ${remainingPids.join(", ")} are still ` +
        `running and would overwrite it on quit. The owner's geometry is preserved at ` +
        `${guard.parked}; quit the app, then move that file back over the original ` +
        `(drop the .verify-backup suffix).`,
    );
    return { restored: false, remainingPids };
  }
  guard.restore();
  return { restored: true, remainingPids: [] };
}


async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (process.platform !== "darwin") {
    fail("macOS .app launch verification requires darwin.");
  }

  const {
    appPath,
    holdMs,
    killExisting,
    resetWindowState,
    leaveRunning,
    openApp,
    requireWindow,
    requireCapturableWindow,
    requireAccessibilityWindow,
    requireFrontmost,
    requireWebviewContent,
    requireWebviewRoute,
    webviewFixtureVaultPath,
    verifyAiSettings,
    aiSettingsBaseUrl,
    requireWebviewReducedMotion,
    requireAccessibilityText,
    printWindowDiagnostics,
    requireOwnerName,
    minWindowSize,
    minWebviewSize,
    maxWebviewSize,
    webviewWindowSize,
    windowScreenshotPath,
    tryWindowScreenshotPath,
    webviewEvidencePath,
  } = parseVerifyAppLaunchArgs(process.argv.slice(2), {
    defaultAppPath: path.join(
      root,
      "src-tauri",
      "target",
      "release",
      "bundle",
      "macos",
      appBundleName,
    ),
  });
  const resolvedAppPath = path.resolve(appPath);
  const executablePath = resolveMacosExecutable(resolvedAppPath, names);

  if (!Number.isFinite(holdMs) || holdMs < 1000) {
    fail("--hold-ms must be a number >= 1000.");
  }
  if (process.argv.some((arg) => arg.startsWith("--min-window-size=")) && !minWindowSize) {
    fail("--min-window-size must use WIDTHxHEIGHT, e.g. 1040x720.");
  }
  if (process.argv.some((arg) => arg.startsWith("--min-webview-size=")) && !minWebviewSize) {
    fail("--min-webview-size must use WIDTHxHEIGHT, e.g. 1400x860.");
  }
  if (process.argv.some((arg) => arg.startsWith("--max-webview-size=")) && !maxWebviewSize) {
    fail("--max-webview-size must use WIDTHxHEIGHT, e.g. 1100x800.");
  }
  if (process.argv.some((arg) => arg.startsWith("--webview-window-size=")) && !webviewWindowSize) {
    fail("--webview-window-size must use WIDTHxHEIGHT, e.g. 1100x800.");
  }
  if ((requireOwnerName || minWindowSize) && !requireWindow) {
    fail("--require-owner-name and --min-window-size require --require-window.");
  }
  if (requireCapturableWindow && !requireWindow) {
    fail("--require-capturable-window requires --require-window.");
  }
  if (windowScreenshotPath && !requireCapturableWindow) {
    fail("--window-screenshot requires --require-capturable-window.");
  }
  if (tryWindowScreenshotPath && !requireWindow) {
    fail("--try-window-screenshot requires --require-window.");
  }
  if (webviewEvidencePath && !requireWebviewContent) {
    fail("--webview-evidence requires --require-webview-content.");
  }
  if (requireWebviewReducedMotion && !requireWebviewContent) {
    fail("--require-webview-reduced-motion requires --require-webview-content.");
  }
  if (requireWebviewContent && openApp) {
    fail("--require-webview-content is only supported for direct executable launch; omit --open-app.");
  }
  const windowStateConflict = windowStateFlagConflict({ resetWindowState, leaveRunning });
  if (windowStateConflict) {
    fail(windowStateConflict);
  }
  if (requireWebviewRoute && openApp) {
    fail("--require-webview-route is only supported for direct executable launch; omit --open-app.");
  }
  if (webviewFixtureVaultPath && openApp) {
    fail("--webview-fixture-vault is only supported for direct executable launch; omit --open-app.");
  }
  if (webviewFixtureVaultPath) {
    let fixtureStat = null;
    try {
      fixtureStat = fs.statSync(webviewFixtureVaultPath);
    } catch {
      fail(`--webview-fixture-vault does not exist: ${webviewFixtureVaultPath}`);
    }
    if (!fixtureStat?.isDirectory()) {
      fail(`--webview-fixture-vault must point at a directory: ${webviewFixtureVaultPath}`);
    }
  }
  if (requireWebviewReducedMotion && openApp) {
    fail("--require-webview-reduced-motion is only supported for direct executable launch; omit --open-app.");
  }
  if (webviewEvidencePath && openApp) {
    fail("--webview-evidence is only supported for direct executable launch; omit --open-app.");
  }
  if (webviewWindowSize && openApp) {
    fail("--webview-window-size is only supported for direct executable launch; omit --open-app.");
  }
  if (verifyAiSettings && openApp) {
    fail("--verify-ai-settings is only supported for direct executable launch; omit --open-app.");
  }
  if (verifyAiSettings && !webviewFixtureVaultPath) {
    // With no vault the verify button is itself disabled — the contract is that nothing
    // is sent when there is nowhere to record it. Running in that state produces a blurry
    // failure that reads as "did not click" rather than "could not click", so it is cut
    // off here first.
    fail("--verify-ai-settings requires --webview-fixture-vault=PATH (the connection check refuses to send without a vault to log into).");
  }
  if (verifyAiSettings && !isSafeAiSettingsBaseUrl(aiSettingsBaseUrl)) {
    fail(
      `--ai-settings-base-url must be an http(s) URL without whitespace or quotes; got ${aiSettingsBaseUrl ?? "nothing"}.`,
    );
  }
  const normalizedWebviewRoute = requireWebviewRoute
    ? normalizeWebviewRoute(requireWebviewRoute)
    : null;
  if (requireWebviewRoute && !normalizedWebviewRoute) {
    fail("--require-webview-route must be an absolute app path such as /en/topology/.");
  }
  if (!fs.existsSync(resolvedAppPath)) {
    fail(`missing app bundle at ${resolvedAppPath}; run pnpm desktop:build:app first.`);
  }

  if (!fs.existsSync(executablePath)) {
    fail(`missing app executable at ${executablePath}; run pnpm desktop:build:app first.`);
  }

  printBundlePathConflictWarnings({
    appPath: resolvedAppPath,
    appBundleName,
  });

  const verifyLock = createVerifyLock(verifyLockPath(resolvedAppPath), {
    appPath: resolvedAppPath,
  });
  if (!verifyLock.ok) {
    fail(verifyLock.message);
  }

  // Moved aside before anything launches, and restored in `finally` whatever the verdict is.
  const windowStateGuard = resetWindowState
    ? setAsideWindowState(
        windowStatePath({ bundleIdentifier: readBundleIdentifier(resolvedAppPath) }),
      )
    : { moved: false, restore() {} };
  let windowStateRestored = false;
  if (windowStateGuard.moved) {
    console.log("[verify] saved window geometry set aside for this run");
    // `fail()` is `process.exit(1)`, so a verification failure raised inside the try block below
    // terminates without running its `finally` at all — and the owner's geometry would then sit
    // parked with nothing having said so. This handler runs on every exit path, including that one.
    // It has to stay synchronous, so it reports rather than waits: a message naming the file beats
    // a restore that races the app still writing to it.
    process.on("exit", () => {
      if (!windowStateGuard.moved || windowStateRestored) {
        return;
      }
      console.error(
        `[verify] saved window geometry is still parked at ${windowStateGuard.parked}. ` +
          "Quit Ontology Atlas, then move that file back over " +
          `${windowStateGuard.parked.replace(/\.verify-backup$/, "")} to restore it.`,
      );
    });
  }

  let windowStateLeftParked = false;
  try {
    if (killExisting) {
      terminateExisting({
        appPath: resolvedAppPath,
        executablePath,
        appName: names.appName,
      });
      const remainingPids = await waitForExistingProcessesToExit({
        appPath: resolvedAppPath,
        executablePath,
      });
      if (remainingPids.length > 0) {
        fail(
          `${appBundleName} still had stale process(es) after --kill-existing: ${remainingPids.join(", ")}`,
        );
      }
    } else {
      // Single instance means a second launch focuses the window that already exists instead of
      // starting one. Continuing here would measure the running build and call it green.
      const staleMessage = staleInstanceFailure({
        appBundleName,
        pids: existingProcessIds({ appPath: resolvedAppPath, executablePath }),
      });
      if (staleMessage) {
        fail(staleMessage);
      }
    }

    if (openApp) {
      await verifyOpenAppLaunch({
        appPath: resolvedAppPath,
        executablePath,
        holdMs,
        leaveRunning,
        requireWindow,
        requireCapturableWindow,
        requireAccessibilityWindow,
        requireFrontmost,
        requireAccessibilityText,
        printWindowDiagnostics,
        requireOwnerName,
        minWindowSize,
        minWebviewSize,
        maxWebviewSize,
        webviewWindowSize,
        windowScreenshotPath,
        tryWindowScreenshotPath,
      });
    } else {
      await verifyExecutableLaunch({
        appPath: resolvedAppPath,
        executablePath,
        holdMs,
        leaveRunning,
        requireWindow,
        requireCapturableWindow,
        requireAccessibilityWindow,
        requireFrontmost,
        requireWebviewContent,
        requireWebviewRoute: normalizedWebviewRoute,
        webviewFixtureVaultPath,
        verifyAiSettings,
        aiSettingsBaseUrl,
        requireWebviewReducedMotion,
        requireAccessibilityText,
        printWindowDiagnostics,
        requireOwnerName,
        minWindowSize,
        minWebviewSize,
        maxWebviewSize,
        webviewWindowSize,
        windowScreenshotPath,
        tryWindowScreenshotPath,
        webviewEvidencePath,
      });
    }
  } finally {
    const windowStateRestore = await restoreWindowStateAfterExit({
      guard: windowStateGuard,
      appPath: resolvedAppPath,
      executablePath,
    });
    verifyLock.release();
    // Exit non-zero via exitCode rather than fail(): fail() would process.exit() here and
    // swallow any exception already propagating out of the try block, hiding the launch
    // failure that left the app alive in the first place.
    windowStateLeftParked = windowStateGuard.moved && !windowStateRestore.restored;
    windowStateRestored = Boolean(windowStateRestore.restored);
    if (windowStateLeftParked) {
      process.exitCode = 1;
    }
  }

  if (windowStateLeftParked) {
    // The launch checks themselves passed, but the run disturbed owner state it could not put
    // back; printing the green summary line here would bury the only evidence of that.
    return;
  }

  console.log(
    `[desktop-app-verify] launched ${resolvedAppPath} for ${holdMs}ms without early exit${
      requireWindow ? " and with an on-screen window" : ""
    }${requireCapturableWindow ? " and with a capturable current-desktop window" : ""
    }${requireAccessibilityWindow ? " and with an Accessibility-observable window" : ""
    }${requireAccessibilityText.length > 0 ? " and with required Accessibility text" : ""
    }${requireWebviewContent ? " and loaded WebView content" : ""
    }${windowScreenshotPath ? ` and saved a window screenshot to ${path.resolve(windowScreenshotPath)}` : ""
    }${tryWindowScreenshotPath ? ` and attempted visual evidence at ${path.resolve(tryWindowScreenshotPath)}` : ""
    }${webviewEvidencePath ? ` and saved WebView evidence to ${path.resolve(webviewEvidencePath)}` : ""
    }${requireOwnerName ? ` owned by ${requireOwnerName}` : ""}${
      minWindowSize ? ` at least ${minWindowSize.width}x${minWindowSize.height}` : ""
    }`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
