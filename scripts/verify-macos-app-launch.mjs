#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { resolveMacosExecutable } from "./lib/macos-release-names.mjs";
import { AI_SETTINGS_PAYLOAD_TIMEOUT_MS, authorityOfBaseUrl, isSafeAiSettingsBaseUrl, validateAiSettingsAuditTrail } from "./lib/verify-macos/ai-settings-contract.mjs";
import { appBundleName, names, root } from "./lib/verify-macos/context.mjs";
import { fail, normalizeWebviewRoute, parseVerifyAppLaunchArgs, printHelp, sleep } from "./lib/verify-macos/cli-args.mjs";
import { writeWebviewEvidence } from "./lib/verify-macos/evidence-payload.mjs";
import { validateWebviewVerifyPayload } from "./lib/verify-macos/payload-contract.mjs";
import { createVerifyLock, printBundlePathConflictWarnings, processExists, terminate, terminateExisting, verifyLockPath, waitForExistingProcessesToExit } from "./lib/verify-macos/process-lock.mjs";
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
 * 화면이 "확인됨" 이라고 말한 다음, **디스크가 같은 말을 하는지** 본다.
 *
 * DOM 마커는 호스트를 그리지 않는다(감사 표는 벤더 이름·목적·범위만 보여준다).
 * 그래서 "요청이 정말 그 주소로 나갔나" 는 볼트 안 평문 기록으로만 증명된다 —
 * 이 검사가 없으면 화면 문구만으로 통과할 수 있고, 그건 이 규칙이 막으려는
 * 바로 그 가짜 통과다.
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
  verifyTopologyDrag,
  verifyTopologySelectedRelation,
  verifyTopologyNodePopover,
  verifyTopologyCreateNode,
  verifyTopologyFocusNoop,
  verifyTopologyFocusZoom,
  verifyTopologyFrameProfile,
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
  // 감사 줄이 **이 실행의 것**이어야 하므로 launch 이전 시각을 바닥으로 쓴다.
  const launchedAt = Date.now();
  const child = spawn(executablePath, {
    cwd: path.dirname(executablePath),
    env: requireWebviewContent
      ? {
          ...process.env,
          ...webviewVerifyEnvPatch({
            requireWebviewRoute,
            webviewFixtureVaultPath,
            verifyTopologyDrag,
            verifyTopologySelectedRelation,
            verifyTopologyNodePopover,
            verifyTopologyCreateNode,
            verifyTopologyFocusNoop,
            verifyTopologyFocusZoom,
            verifyTopologyFrameProfile,
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
      requireTopologyDrag: verifyTopologyDrag,
      requireTopologySelectedRelation: verifyTopologySelectedRelation,
      requireTopologyNodePopover: verifyTopologyNodePopover,
      requireTopologyCreateNode: verifyTopologyCreateNode,
      requireTopologyFocusNoop: verifyTopologyFocusNoop,
      requireTopologyFocusZoom: verifyTopologyFocusZoom,
      requireTopologyFrameProfile: verifyTopologyFrameProfile,
      requireAiSettings: verifyAiSettings,
      expectedAiSettingsBaseUrl: verifyAiSettings ? aiSettingsBaseUrl : null,
      requireWebviewReducedMotion,
    };
    const { payload, validationError: webviewError } = await waitForWebviewVerifyPayload(
      () => stdout,
      {
        // AI 설정 흐름은 시트 열기 → 절 이동 → 주소 입력 → 왕복 확인 →
        // 모델 고르기까지 클릭이 다섯 단계라, 기본 15초 창 안에 마커가 안
        // 들어온다. 창을 넓히는 것과 판정을 무르게 하는 것은 다르다 —
        // 판정은 그대로다.
        ...(verifyAiSettings ? { timeoutMs: AI_SETTINGS_PAYLOAD_TIMEOUT_MS } : {}),
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
    webviewFixtureVaultPath,
    verifyTopologyDrag,
    verifyTopologySelectedRelation,
    verifyTopologyNodePopover,
    verifyTopologyCreateNode,
    verifyTopologyFocusNoop,
    verifyTopologyFocusZoom,
    verifyTopologyFrameProfile,
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
  if (verifyAiSettings && openApp) {
    fail("--verify-ai-settings is only supported for direct executable launch; omit --open-app.");
  }
  if (verifyAiSettings && !webviewFixtureVaultPath) {
    // 볼트가 없으면 [연결 확인] 버튼 자체가 비활성이다 — 기록할 곳이 없으면
    // 보내지 않는다는 계약이라서다. 그 상태로 돌리면 "못 눌렀다" 가 아니라
    // "안 눌렀다" 로 읽히는 흐릿한 실패가 되므로 여기서 먼저 끊는다.
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
        webviewFixtureVaultPath,
        verifyTopologyDrag,
        verifyTopologySelectedRelation,
        verifyTopologyNodePopover,
        verifyTopologyCreateNode,
        verifyTopologyFocusNoop,
        verifyTopologyFocusZoom,
        verifyTopologyFrameProfile,
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
