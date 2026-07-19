#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { resolveMacosExecutable } from "./lib/macos-release-names.mjs";
import { appBundleName, names, root } from "./lib/verify-macos/context.mjs";
import { fail, normalizeWebviewRoute, parseVerifyAppLaunchArgs, printHelp, sleep } from "./lib/verify-macos/cli-args.mjs";
import { writeWebviewEvidence } from "./lib/verify-macos/evidence-payload.mjs";
import { validateWebviewVerifyPayload } from "./lib/verify-macos/payload-contract.mjs";
import { createVerifyLock, printBundlePathConflictWarnings, processExists, terminate, terminateExisting, verifyLockPath, waitForExistingProcessesToExit } from "./lib/verify-macos/process-lock.mjs";
import { waitForWebviewVerifyPayload } from "./lib/verify-macos/relation-marker-validators.mjs";
import { printWindowDiagnostics, tryCaptureWindowEvidence, verifyCapturableWindow, verifyOnscreenWindow } from "./lib/verify-macos/visual-evidence.mjs";
import { webviewVerifyEnvPatch } from "./lib/verify-macos/webview-env.mjs";
import { verifyAccessibilityText, verifyAccessibilityWindow, verifyFrontmostWindow } from "./lib/verify-macos/window-accessibility.mjs";

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
  verifyTopologyDrag,
  verifyTopologySelectedRelation,
  verifyTopologyNodePopover,
  verifyTopologyCreateNode,
  verifyTopologyFocusNoop,
  verifyTopologyFocusZoom,
  verifyTopologyFrameProfile,
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
  const child = spawn(executablePath, {
    cwd: path.dirname(executablePath),
    env: requireWebviewContent
      ? {
          ...process.env,
          ...webviewVerifyEnvPatch({
            requireWebviewRoute,
            verifyTopologyDrag,
            verifyTopologySelectedRelation,
            verifyTopologyNodePopover,
            verifyTopologyCreateNode,
            verifyTopologyFocusNoop,
            verifyTopologyFocusZoom,
            verifyTopologyFrameProfile,
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
      minWebviewSize,
      maxWebviewSize,
      requireTopologyDrag: verifyTopologyDrag,
      requireTopologySelectedRelation: verifyTopologySelectedRelation,
      requireTopologyNodePopover: verifyTopologyNodePopover,
      requireTopologyCreateNode: verifyTopologyCreateNode,
      requireTopologyFocusNoop: verifyTopologyFocusNoop,
      requireTopologyFocusZoom: verifyTopologyFocusZoom,
      requireTopologyFrameProfile: verifyTopologyFrameProfile,
    };
    const { payload, validationError: webviewError } = await waitForWebviewVerifyPayload(
      () => stdout,
      {
        validatePayload: (candidate) => validateWebviewVerifyPayload(candidate, validationOptions),
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
    leaveRunning,
    openApp,
    requireWindow,
    requireCapturableWindow,
    requireAccessibilityWindow,
    requireFrontmost,
    requireWebviewContent,
    requireWebviewRoute,
    verifyTopologyDrag,
    verifyTopologySelectedRelation,
    verifyTopologyNodePopover,
    verifyTopologyCreateNode,
    verifyTopologyFocusNoop,
    verifyTopologyFocusZoom,
    verifyTopologyFrameProfile,
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
  if (requireWebviewContent && openApp) {
    fail("--require-webview-content is only supported for direct executable launch; omit --open-app.");
  }
  if (requireWebviewRoute && openApp) {
    fail("--require-webview-route is only supported for direct executable launch; omit --open-app.");
  }
  if (webviewEvidencePath && openApp) {
    fail("--webview-evidence is only supported for direct executable launch; omit --open-app.");
  }
  if (verifyTopologyDrag && openApp) {
    fail("--verify-topology-drag is only supported for direct executable launch; omit --open-app.");
  }
  if (verifyTopologySelectedRelation && openApp) {
    fail("--verify-topology-selected-relation is only supported for direct executable launch; omit --open-app.");
  }
  if (verifyTopologyNodePopover && openApp) {
    fail("--verify-topology-node-popover is only supported for direct executable launch; omit --open-app.");
  }
  if (verifyTopologyCreateNode && openApp) {
    fail("--verify-topology-create-node is only supported for direct executable launch; omit --open-app.");
  }
  if (verifyTopologyFocusNoop && openApp) {
    fail("--verify-topology-focus-noop is only supported for direct executable launch; omit --open-app.");
  }
  if (verifyTopologyFrameProfile && openApp) {
    fail("--verify-topology-frame-profile is only supported for direct executable launch; omit --open-app.");
  }
  if (verifyTopologyFocusZoom && openApp) {
    fail("--verify-topology-focus-zoom is only supported for direct executable launch; omit --open-app.");
  }
  if (webviewWindowSize && openApp) {
    fail("--webview-window-size is only supported for direct executable launch; omit --open-app.");
  }
  const normalizedWebviewRoute = requireWebviewRoute
    ? normalizeWebviewRoute(requireWebviewRoute)
    : null;
  if (requireWebviewRoute && !normalizedWebviewRoute) {
    fail("--require-webview-route must be an absolute app path such as /en/topology/.");
  }
  if (verifyTopologyDrag && !normalizedWebviewRoute?.includes("/topology")) {
    fail("--verify-topology-drag requires --require-webview-route pointing at a /topology route.");
  }
  if (verifyTopologySelectedRelation && !normalizedWebviewRoute?.includes("/topology")) {
    fail("--verify-topology-selected-relation requires --require-webview-route pointing at a /topology route.");
  }
  if (verifyTopologyNodePopover && !normalizedWebviewRoute?.includes("/topology")) {
    fail("--verify-topology-node-popover requires --require-webview-route pointing at a /topology route.");
  }
  if (verifyTopologyCreateNode && !normalizedWebviewRoute?.includes("/topology")) {
    fail("--verify-topology-create-node requires --require-webview-route pointing at a /topology route.");
  }
  if (verifyTopologyFocusNoop && !normalizedWebviewRoute?.includes("/topology")) {
    fail("--verify-topology-focus-noop requires --require-webview-route pointing at a /topology route.");
  }
  if (verifyTopologyFocusZoom && !normalizedWebviewRoute?.includes("/topology")) {
    fail("--verify-topology-focus-zoom requires --require-webview-route pointing at a /topology route.");
  }
  if (verifyTopologyFrameProfile && !normalizedWebviewRoute?.includes("/topology")) {
    fail("--verify-topology-frame-profile requires --require-webview-route pointing at a /topology route.");
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
        verifyTopologyDrag,
        verifyTopologySelectedRelation,
        verifyTopologyNodePopover,
        verifyTopologyCreateNode,
        verifyTopologyFocusNoop,
        verifyTopologyFocusZoom,
        verifyTopologyFrameProfile,
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
    verifyLock.release();
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


if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
