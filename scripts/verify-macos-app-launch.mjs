#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadMacosReleaseNames, resolveMacosExecutable } from "./lib/macos-release-names.mjs";

const root = process.cwd();
const names = loadMacosReleaseNames(root);
const { appBundleName } = names;
const WEBVIEW_VERIFY_ENV = "ONTOLOGY_ATLAS_VERIFY_WEBVIEW";
const WEBVIEW_VERIFY_ROUTE_ENV = "ONTOLOGY_ATLAS_VERIFY_ROUTE";
const WEBVIEW_VERIFY_TOPOLOGY_DRAG_ENV = "ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_DRAG";
const WEBVIEW_VERIFY_TOPOLOGY_NODE_POPOVER_ENV =
  "ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_NODE_POPOVER";
const WEBVIEW_VERIFY_TOPOLOGY_CREATE_NODE_ENV = "ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_CREATE_NODE";
const WEBVIEW_VERIFY_TOPOLOGY_FOCUS_NOOP_ENV = "ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_FOCUS_NOOP";
const WEBVIEW_VERIFY_WINDOW_SIZE_ENV = "ONTOLOGY_ATLAS_VERIFY_WINDOW_SIZE";
const RELATION_LABEL_COMPACT_WIDTH_TOLERANCE_PX = 2.5;
const TOPOLOGY_DRAG_FOCUS_MAX_REASONABLE_DELTA_PX = 560;
const WEBVIEW_VERIFY_PREFIX = "[ontology-atlas-webview-verify] ";
const WEBVIEW_VERIFY_TIMEOUT_MS = 15000;
const GRACEFUL_QUIT_COMMAND_TIMEOUT_MS = 1200;
const STALE_PROCESS_EXIT_TIMEOUT_MS = 6000;
const STALE_PROCESS_POLL_MS = 200;
const ACCESSIBILITY_WINDOW_TIMEOUT_MS = 3000;
const ACCESSIBILITY_TEXT_TIMEOUT_MS = 7000;
const ACCESSIBILITY_TEXT_MAX_DEPTH = 8;
const ACCESSIBILITY_TEXT_MAX_CHILDREN_PER_NODE = 80;
const VISUAL_EVIDENCE_MIN_NON_DARK_RATIO = 0.001;
const VISUAL_EVIDENCE_MIN_LUMA_SPREAD = 8;
const WEBVIEW_WORKBENCH_MARKERS = [
  /온톨로지|Ontology/,
  /Workspace|작업공간|저장소|문서함|Source Vault|Documents|Relief|Concept map|개념/,
];

function normalizeTopologySelectedParam(value) {
  if (typeof value !== "string" || value.trim().length === 0) return "";
  return value.trim();
}

function topologyDragDeltaVector(delta) {
  if (!delta || typeof delta !== "object") return null;
  const x = Number(delta.x);
  const y = Number(delta.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, magnitude: Math.hypot(x, y) };
}

export function topologyDragCompanionVectorTolerance(markers = {}) {
  const uiScale = Number(markers.topologyUiScale);
  if (!Number.isFinite(uiScale) || uiScale <= 1) return 8;
  return Math.min(14, Math.max(8, uiScale * 8));
}

function validateTopologyNodePopoverScrollFooterContract(markers) {
  if (markers.topologyNodePopoverFooterVisible !== true) {
    return "WebView Relief selected node popover footer was not measurable";
  }
  if (markers.topologyNodePopoverFooterContract !== "fixed-outside-scroll-region") {
    return `WebView Relief selected node popover footer contract was ${markers.topologyNodePopoverFooterContract || "missing"}`;
  }
  if (markers.topologyNodePopoverFooterPositionContract !== "anchored-bottom-visible") {
    return `WebView Relief selected node popover footer position contract was ${markers.topologyNodePopoverFooterPositionContract || "missing"}`;
  }
  if (markers.topologyNodePopoverFooterOverflowContract !== "no-horizontal-scroll") {
    return `WebView Relief selected node popover footer overflow contract was ${markers.topologyNodePopoverFooterOverflowContract || "missing"}`;
  }
  const connectionListTop = Number(markers.topologyNodePopoverConnectionListTop || 0);
  const connectionListBottom = Number(markers.topologyNodePopoverConnectionListBottom || 0);
  const footerTop = Number(markers.topologyNodePopoverFooterTop || 0);
  const footerBottom = Number(markers.topologyNodePopoverFooterBottom || 0);
  const popoverBottom = Number(markers.topologyNodePopoverBottom || 0);
  const rowHeight = Number(markers.topologyNodePopoverRelationRowHeight || 0);
  const visibleRowHeight = Number(markers.topologyNodePopoverVisibleRelationRowHeight || 0);
  if (
    !Number.isFinite(connectionListBottom) ||
    !Number.isFinite(footerTop) ||
    connectionListBottom <= 0 ||
    footerTop <= 0 ||
    footerTop < connectionListBottom - 2
  ) {
    return `WebView Relief selected node popover footer overlapped the connection list (${footerTop || "missing"} top / ${connectionListBottom || "missing"} list bottom)`;
  }
  const connectionListHeight = connectionListBottom - connectionListTop;
  const minReadableConnectionListHeight =
    Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight * 2 : 160;
  if (
    !Number.isFinite(connectionListHeight) ||
    connectionListTop <= 0 ||
    connectionListBottom <= 0 ||
    connectionListHeight < minReadableConnectionListHeight
  ) {
    return `WebView Relief selected node popover connection list was too short (${Number.isFinite(connectionListHeight) ? connectionListHeight : "missing"}px / ${Number.isFinite(minReadableConnectionListHeight) ? minReadableConnectionListHeight : "missing"}px minimum)`;
  }
  if (
    !Number.isFinite(rowHeight) ||
    !Number.isFinite(visibleRowHeight) ||
    rowHeight <= 0 ||
    visibleRowHeight < rowHeight - 1 ||
    markers.topologyNodePopoverRelationRowFullyVisible !== true
  ) {
    return `WebView Relief selected node popover first relation row was not fully visible (${visibleRowHeight || "missing"}px visible / ${rowHeight || "missing"}px row)`;
  }
  if (
    !Number.isFinite(footerBottom) ||
    !Number.isFinite(popoverBottom) ||
    footerBottom <= 0 ||
    popoverBottom <= 0 ||
    footerBottom > popoverBottom + 2
  ) {
    return `WebView Relief selected node popover footer overflowed the inspector rail (${footerBottom || "missing"} footer bottom / ${popoverBottom || "missing"} popover bottom)`;
  }
  const footerClientWidth = Number(markers.topologyNodePopoverFooterClientWidth || 0);
  const footerScrollWidth = Number(markers.topologyNodePopoverFooterScrollWidth || 0);
  if (
    !Number.isFinite(footerClientWidth) ||
    !Number.isFinite(footerScrollWidth) ||
    footerClientWidth < 180 ||
    footerScrollWidth - footerClientWidth > 2
  ) {
    return `WebView Relief selected node popover footer overflowed (${footerClientWidth} client / ${footerScrollWidth} scroll)`;
  }
  return null;
}

function validateTopologyFocusCommandSpineContract(markers) {
  if (markers.topologyVerifierTokenContractVersion !== "command-spine-v1") {
    return null;
  }
  if (markers.topologyFocusCommandSpineVisible !== true) {
    return "WebView Relief selected focus command spine was not visible";
  }
  if (
    markers.topologyFocusCommandSpineHierarchy !==
    "brief-primary-review-agent-proof"
  ) {
    return `WebView Relief selected focus command hierarchy was ${markers.topologyFocusCommandSpineHierarchy || "missing"}`;
  }
  if (markers.topologyFocusCommandSpineAttentionLayer !== "support-command-spine") {
    return `WebView Relief selected focus command attention layer was ${markers.topologyFocusCommandSpineAttentionLayer || "missing"}`;
  }
  if (markers.topologyFocusCommandSpineTokenizedSurface !== "topology-command-spine") {
    return `WebView Relief selected focus command surface token was ${markers.topologyFocusCommandSpineTokenizedSurface || "missing"}`;
  }
  if (markers.topologyAnalysisPanelSurfaceToken !== "--topology-panel-support-surface") {
    return `WebView Relief selected focus panel surface token was ${markers.topologyAnalysisPanelSurfaceToken || "missing"}`;
  }
  if (markers.topologyAnalysisPanelCommandSpinePaddingToken !== "--topology-command-spine-padding") {
    return `WebView Relief selected focus panel command padding token was ${markers.topologyAnalysisPanelCommandSpinePaddingToken || "missing"}`;
  }
  if (markers.topologyAnalysisPanelCommandSpineGapToken !== "--topology-command-spine-gap") {
    return `WebView Relief selected focus panel command gap token was ${markers.topologyAnalysisPanelCommandSpineGapToken || "missing"}`;
  }
  if (
    markers.topologyAnalysisPanelCommandPrimaryHeightToken !==
    "--topology-command-primary-min-height"
  ) {
    return `WebView Relief selected focus primary action height token was ${markers.topologyAnalysisPanelCommandPrimaryHeightToken || "missing"}`;
  }
  if (
    markers.topologyAnalysisPanelCommandSpineSurfaceToken !==
      "--topology-command-spine-surface" ||
    markers.topologyFocusCommandSpineSurfaceToken !==
      "--topology-command-spine-surface"
  ) {
    return `WebView Relief selected focus command spine surface token was ${markers.topologyFocusCommandSpineSurfaceToken || markers.topologyAnalysisPanelCommandSpineSurfaceToken || "missing"}`;
  }
  if (
    markers.topologyAnalysisPanelCommandSpineBorderToken !==
      "--topology-command-spine-border" ||
    markers.topologyFocusCommandSpineBorderToken !==
      "--topology-command-spine-border"
  ) {
    return `WebView Relief selected focus command spine border token was ${markers.topologyFocusCommandSpineBorderToken || markers.topologyAnalysisPanelCommandSpineBorderToken || "missing"}`;
  }
  if (
    markers.topologyFocusCommandPrimaryActionSurfaceToken !==
      "--topology-command-primary-surface" ||
    markers.topologyFocusCommandPrimaryActionBorderToken !==
      "--topology-command-primary-border"
  ) {
    return `WebView Relief selected focus primary command token was ${markers.topologyFocusCommandPrimaryActionSurfaceToken || markers.topologyFocusCommandPrimaryActionBorderToken || "missing"}`;
  }
  const commandSpineWidth = Number(markers.topologyFocusCommandSpineWidth || 0);
  const commandSpineHeight = Number(markers.topologyFocusCommandSpineHeight || 0);
  const primaryActionWidth = Number(markers.topologyFocusCommandPrimaryActionWidth || 0);
  const primaryActionHeight = Number(markers.topologyFocusCommandPrimaryActionHeight || 0);
  if (
    !Number.isFinite(commandSpineWidth) ||
    !Number.isFinite(commandSpineHeight) ||
    commandSpineWidth < 200 ||
    commandSpineHeight < 180
  ) {
    return `WebView Relief selected focus command spine was undersized (${commandSpineWidth}x${commandSpineHeight})`;
  }
  if (
    markers.topologyFocusCommandPrimaryActionVisible !== true ||
    !/(Copy focus brief|브리프 복사)/i.test(
      String(markers.topologyFocusCommandPrimaryActionText || ""),
    ) ||
    primaryActionWidth < 180 ||
    primaryActionHeight < 40
  ) {
    return `WebView Relief selected focus primary command was malformed (${markers.topologyFocusCommandPrimaryActionText || "missing"} · ${primaryActionWidth}x${primaryActionHeight})`;
  }
  if (markers.topologyFocusReviewOrderVisible !== true) {
    return "WebView Relief selected focus review order was not visible";
  }
  if (markers.topologyFocusSecondaryActionsVisible !== true) {
    return "WebView Relief selected focus secondary actions were not visible";
  }
  if (
    markers.topologyFocusAgentHandoffVisible !== true ||
    markers.topologyFocusAgentHandoffContract !== "mcp-cli-proof-disclosed"
  ) {
    return `WebView Relief selected focus agent handoff contract was ${markers.topologyFocusAgentHandoffContract || "missing"}`;
  }
  return null;
}

function validateTopologyNodePopoverTokenContract(markers) {
  if (markers.topologyVerifierTokenContractVersion !== "command-spine-v1") {
    return null;
  }
  if (markers.topologyNodePopoverVisible !== true) return null;
  const collapsed = markers.topologyNodePopoverCollapsed === true;
  const expectedWidthToken = "--topology-node-popover-fluid-width";
  const expectedRailToken = "--topology-node-popover-rail-width";
  const expectedWidthContract = collapsed
    ? "fluid-chip-to-rail"
    : "fluid-inspector-to-rail";
  if (markers.topologyNodePopoverWidthToken !== expectedWidthToken) {
    return `WebView Relief selected node popover width token was ${markers.topologyNodePopoverWidthToken || "missing"}`;
  }
  if (markers.topologyNodePopoverRailWidthToken !== expectedRailToken) {
    return `WebView Relief selected node popover rail token was ${markers.topologyNodePopoverRailWidthToken || "missing"}`;
  }
  if (markers.topologyNodePopoverResponsiveWidthContract !== expectedWidthContract) {
    return `WebView Relief selected node popover responsive width contract was ${markers.topologyNodePopoverResponsiveWidthContract || "missing"}`;
  }
  if (markers.topologyNodePopoverCompactHandoffContract !== "selected-node-actions-visible") {
    return `WebView Relief selected node popover compact handoff contract was ${markers.topologyNodePopoverCompactHandoffContract || "missing"}`;
  }
  if (
    markers.topologyNodePopoverScrollContract !==
    (collapsed ? "collapsed-chip-no-scroll" : "expanded-internal-scroll")
  ) {
    return `WebView Relief selected node popover scroll contract was ${markers.topologyNodePopoverScrollContract || "missing"}`;
  }
  if (collapsed && markers.topologyNodePopoverOverflowY !== "hidden") {
    return `WebView Relief selected node popover collapsed overflow-y was ${markers.topologyNodePopoverOverflowY || "missing"}`;
  }
  if (!collapsed && markers.topologyNodePopoverOverflowY !== "hidden") {
    return `WebView Relief selected node popover expanded root overflow-y was ${markers.topologyNodePopoverOverflowY || "missing"}`;
  }
  if (!collapsed && markers.topologyNodePopoverBodyScrollContract !== "content-scrolls-above-fixed-footer") {
    return `WebView Relief selected node popover body scroll contract was ${markers.topologyNodePopoverBodyScrollContract || "missing"}`;
  }
  if (!collapsed && markers.topologyNodePopoverBodyOverflowY !== "auto") {
    return `WebView Relief selected node popover body overflow-y was ${markers.topologyNodePopoverBodyOverflowY || "missing"}`;
  }
  if (!collapsed && markers.topologyNodePopoverBodyOverflowX !== "hidden") {
    return `WebView Relief selected node popover body overflow-x was ${markers.topologyNodePopoverBodyOverflowX || "missing"}`;
  }
  if (!collapsed && markers.topologyNodePopoverOverflowX !== "hidden") {
    return `WebView Relief selected node popover expanded overflow-x was ${markers.topologyNodePopoverOverflowX || "missing"}`;
  }
  if (markers.topologyNodePopoverSurfaceToken !== "--topology-node-popover-surface") {
    return `WebView Relief selected node popover surface token was ${markers.topologyNodePopoverSurfaceToken || "missing"}`;
  }
  if (markers.topologyNodePopoverBorderToken !== "--topology-node-popover-border") {
    return `WebView Relief selected node popover border token was ${markers.topologyNodePopoverBorderToken || "missing"}`;
  }
  if (collapsed) {
    if (markers.topologyNodePopoverCompactBriefActionVisible !== true) {
      return "WebView Relief selected node popover compact brief action was not visible";
    }
    if (markers.topologyNodePopoverCompactBriefActionKind !== "focus-brief") {
      return `WebView Relief selected node popover compact brief action was ${markers.topologyNodePopoverCompactBriefActionKind || "missing"}`;
    }
    if (markers.topologyNodePopoverCompactBriefActionContract !== "copy-focus-brief") {
      return `WebView Relief selected node popover compact brief action contract was ${markers.topologyNodePopoverCompactBriefActionContract || "missing"}`;
    }
    if (
      markers.topologyNodePopoverCompactBriefActionSurfaceToken !==
      "--topology-node-popover-action-icon-surface"
    ) {
      return `WebView Relief selected node popover compact brief action surface token was ${markers.topologyNodePopoverCompactBriefActionSurfaceToken || "missing"}`;
    }
    if (
      markers.topologyNodePopoverCompactBriefActionBorderToken !==
      "--topology-node-popover-action-icon-border"
    ) {
      return `WebView Relief selected node popover compact brief action border token was ${markers.topologyNodePopoverCompactBriefActionBorderToken || "missing"}`;
    }
    const actionWidth = Number(markers.topologyNodePopoverCompactBriefActionWidth || 0);
    const actionHeight = Number(markers.topologyNodePopoverCompactBriefActionHeight || 0);
    if (
      !Number.isFinite(actionWidth) ||
      !Number.isFinite(actionHeight) ||
      actionWidth < 56 ||
      actionWidth > 88 ||
      actionHeight < 28 ||
      actionHeight > 44
    ) {
      return `WebView Relief selected node popover compact brief action was malformed (${actionWidth}x${actionHeight})`;
    }
  }
  if (!collapsed) {
    if (markers.topologyNodePopoverActionRailVisible !== true) {
      return "WebView Relief selected node popover action rail was not visible";
    }
    if (markers.topologyNodePopoverActionRailContract !== "compact-mcp-cli-handoff") {
      return `WebView Relief selected node popover action rail contract was ${markers.topologyNodePopoverActionRailContract || "missing"}`;
    }
    if (Number(markers.topologyNodePopoverActionRailCount || 0) < 3) {
      return `WebView Relief selected node popover action rail count was ${markers.topologyNodePopoverActionRailCount || "missing"}`;
    }
  }
  if (!collapsed && markers.topologyNodePopoverMaxHeightToken !== "--topology-node-popover-max-height") {
    return `WebView Relief selected node popover max-height token was ${markers.topologyNodePopoverMaxHeightToken || "missing"}`;
  }
  if (!collapsed) {
    const popoverClientWidth = Number(markers.topologyNodePopoverClientWidth || 0);
    const popoverScrollWidth = Number(markers.topologyNodePopoverScrollWidth || 0);
    if (
      !Number.isFinite(popoverClientWidth) ||
      !Number.isFinite(popoverScrollWidth) ||
      popoverClientWidth < 180 ||
      popoverScrollWidth - popoverClientWidth > 2
    ) {
      return `WebView Relief selected node popover horizontally overflowed (${popoverClientWidth} client / ${popoverScrollWidth} scroll)`;
    }
  }
  return null;
}

function validateTopologySelectedCardRelationSummaryContract(markers) {
  if (markers.topologyVerifierTokenContractVersion !== "command-spine-v1") {
    return null;
  }
  if (markers.topologySelectedNodePopoverVisible !== true) return null;
  if (markers.topologySelectedSkeletonCardRelationSummaryVisible !== true) {
    return "WebView Relief selected skeleton card relation summary was not visible";
  }
  if (
    markers.topologySelectedSkeletonCardRelationSummaryContract !==
    "selected-card-direct-facts"
  ) {
    return `WebView Relief selected skeleton card relation summary contract was ${markers.topologySelectedSkeletonCardRelationSummaryContract || "missing"}`;
  }
  if (
    markers.topologySelectedSkeletonCardRelationSummarySurfaceToken !==
    "--topology-relation-summary-surface"
  ) {
    return `WebView Relief selected skeleton card relation summary surface token was ${markers.topologySelectedSkeletonCardRelationSummarySurfaceToken || "missing"}`;
  }
  if (
    markers.topologySelectedSkeletonCardRelationSummaryBorderToken !==
    "--topology-relation-summary-border"
  ) {
    return `WebView Relief selected skeleton card relation summary border token was ${markers.topologySelectedSkeletonCardRelationSummaryBorderToken || "missing"}`;
  }
  if (
    markers.topologySelectedSkeletonCardRelationSummaryTextToken !==
    "--topology-relation-summary-text"
  ) {
    return `WebView Relief selected skeleton card relation summary text token was ${markers.topologySelectedSkeletonCardRelationSummaryTextToken || "missing"}`;
  }
  if (Number(markers.topologySelectedSkeletonCardRelationSummaryCount || 0) < 1) {
    return `WebView Relief selected skeleton card relation summary count was ${markers.topologySelectedSkeletonCardRelationSummaryCount || "missing"}`;
  }
  if (Number(markers.topologySelectedSkeletonCardRelationSummaryTypeCount || 0) < 1) {
    return `WebView Relief selected skeleton card relation summary type count was ${markers.topologySelectedSkeletonCardRelationSummaryTypeCount || "missing"}`;
  }
  return null;
}

function validateTopologyFocusUtilityLaneContract(markers) {
  if (markers.topologyVerifierTokenContractVersion !== "command-spine-v1") {
    return null;
  }
  if (markers.topologyCommandChromeState !== "compact-focus") {
    return `WebView Relief selected focus command chrome state was ${markers.topologyCommandChromeState || "missing"}`;
  }
  if (markers.topologyUtilityLaneHeightToken !== "--topology-utility-lane-height") {
    return `WebView Relief selected focus utility lane height token was ${markers.topologyUtilityLaneHeightToken || "missing"}`;
  }
  if (markers.topologyUtilityLaneGapToken !== "--topology-utility-lane-gap") {
    return `WebView Relief selected focus utility lane gap token was ${markers.topologyUtilityLaneGapToken || "missing"}`;
  }
  if (
    markers.topologyUtilityLaneCompactWidthToken !==
    "--topology-utility-lane-compact-width"
  ) {
    return `WebView Relief selected focus utility lane compact width token was ${markers.topologyUtilityLaneCompactWidthToken || "missing"}`;
  }
  if (markers.topologyUtilityActionLaneVisible !== true) {
    return "WebView Relief selected focus utility action lane was not visible";
  }
  if (markers.topologyUtilityActionLaneDensity !== "compact-focus") {
    return `WebView Relief selected focus utility lane density was ${markers.topologyUtilityActionLaneDensity || "missing"}`;
  }
  if (markers.topologyUtilityActionLaneContract !== "icon-first-focus-utility") {
    return `WebView Relief selected focus utility lane contract was ${markers.topologyUtilityActionLaneContract || "missing"}`;
  }
  const width = Number(markers.topologyUtilityActionLaneWidth || 0);
  const height = Number(markers.topologyUtilityActionLaneHeight || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 80 || height < 36) {
    return `WebView Relief selected focus utility lane was undersized (${width}x${height})`;
  }
  return null;
}

function validateTopologyFocusSearchLaneContract(markers) {
  if (markers.topologyVerifierTokenContractVersion !== "command-spine-v1") {
    return null;
  }
  if (markers.topologySearchActionLaneVisible !== true) {
    return "WebView Relief selected focus search action lane was not visible";
  }
  if (markers.topologySearchActionLaneDensity !== "compact-focus") {
    return `WebView Relief selected focus search lane density was ${markers.topologySearchActionLaneDensity || "missing"}`;
  }
  if (markers.topologySearchActionLaneContract !== "icon-first-focus-search") {
    return `WebView Relief selected focus search lane contract was ${markers.topologySearchActionLaneContract || "missing"}`;
  }
  if (markers.topologySearchLaneCompactWidthToken !== "--topology-search-lane-compact-width") {
    return `WebView Relief selected focus search compact width token was ${markers.topologySearchLaneCompactWidthToken || "missing"}`;
  }
  const width = Number(markers.topologySearchActionLaneWidth || 0);
  const height = Number(markers.topologySearchActionLaneHeight || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 80 || height < 36) {
    return `WebView Relief selected focus search lane was undersized (${width}x${height})`;
  }
  if (width > 150) {
    return `WebView Relief selected focus search lane stayed too wide (${width}px)`;
  }
  return null;
}

function validateTopologyFocusRightControlsContract(markers) {
  if (markers.topologyVerifierTokenContractVersion !== "command-spine-v1") {
    return null;
  }
  if (markers.topologySigmaControlsStackVisible !== true) {
    return "WebView Relief selected focus right controls stack was not visible";
  }
  if (markers.topologySigmaControlsStackDensity !== "compact-focus") {
    return `WebView Relief selected focus right controls stack density was ${markers.topologySigmaControlsStackDensity || "missing"}`;
  }
  if (markers.topologySigmaControlsStackContract !== "focus-support-utility-stack") {
    return `WebView Relief selected focus right controls stack contract was ${markers.topologySigmaControlsStackContract || "missing"}`;
  }
  if (markers.topologySigmaControlsStackSurfaceToken !== "--topology-floating-control-surface") {
    return `WebView Relief selected focus right controls stack surface token was ${markers.topologySigmaControlsStackSurfaceToken || "missing"}`;
  }
  if (markers.topologySigmaControlsStackBorderToken !== "--topology-floating-control-border") {
    return `WebView Relief selected focus right controls stack border token was ${markers.topologySigmaControlsStackBorderToken || "missing"}`;
  }
  const stackWidth = Number(markers.topologySigmaControlsStackWidth || 0);
  const stackHeight = Number(markers.topologySigmaControlsStackHeight || 0);
  if (
    !Number.isFinite(stackWidth) ||
    !Number.isFinite(stackHeight) ||
    stackWidth < 32 ||
    stackWidth > 60 ||
    stackHeight < 32 ||
    stackHeight > 104
  ) {
    return `WebView Relief selected focus right controls stack was malformed (${stackWidth}x${stackHeight})`;
  }
  if (markers.topologyShortcutsHelpButtonVisible !== true) {
    return "WebView Relief selected focus shortcuts help button was not visible";
  }
  if (markers.topologyShortcutsHelpButtonDensity !== "compact-focus") {
    return `WebView Relief selected focus shortcuts help density was ${markers.topologyShortcutsHelpButtonDensity || "missing"}`;
  }
  if (markers.topologyShortcutsHelpButtonContract !== "focus-support-help-entry") {
    return `WebView Relief selected focus shortcuts help contract was ${markers.topologyShortcutsHelpButtonContract || "missing"}`;
  }
  const helpWidth = Number(markers.topologyShortcutsHelpButtonWidth || 0);
  const helpHeight = Number(markers.topologyShortcutsHelpButtonHeight || 0);
  if (
    !Number.isFinite(helpWidth) ||
    !Number.isFinite(helpHeight) ||
    helpWidth < 32 ||
    helpWidth > 60 ||
    helpHeight < 32 ||
    helpHeight > 60
  ) {
    return `WebView Relief selected focus shortcuts help button was malformed (${helpWidth}x${helpHeight})`;
  }
  return null;
}

const INSTALLED_APP_CANDIDATE_DIRS = [
  "/Applications",
  path.join(os.homedir(), "Applications"),
];

export function verifyLockPath(appPath) {
  const digest = crypto
    .createHash("sha256")
    .update(path.resolve(appPath))
    .digest("hex")
    .slice(0, 16);
  return path.join(os.tmpdir(), `ontology-atlas-verify-app-${digest}.lock`);
}

function pidIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockOwner(lockDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(lockDir, "owner.json"), "utf8"));
  } catch {
    return null;
  }
}

export function createVerifyLock(lockDir, { appPath, pid = process.pid } = {}) {
  try {
    fs.mkdirSync(lockDir);
    fs.writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({
        pid,
        appPath: appPath ? path.resolve(appPath) : null,
        startedAt: new Date().toISOString(),
      }),
    );
    return {
      ok: true,
      release: () => fs.rmSync(lockDir, { recursive: true, force: true }),
    };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const owner = readLockOwner(lockDir);
    if (owner && !pidIsRunning(Number(owner.pid))) {
      fs.rmSync(lockDir, { recursive: true, force: true });
      return createVerifyLock(lockDir, { appPath, pid });
    }
    const ownerLabel = owner?.pid ? `pid=${owner.pid}` : "unknown owner";
    return {
      ok: false,
      message:
        `another desktop app verification is already running for this app (${ownerLabel}); ` +
        "run desktop:verify-app commands sequentially so --kill-existing cannot terminate a sibling verifier",
      release: () => undefined,
    };
  }
}

export function parseVerifyAppLaunchArgs(argv, {
  defaultAppPath,
  defaultHoldMs = 5000,
} = {}) {
  const positional = argv.filter((arg) => !arg.startsWith("-"));
  const holdMsArg = argv.find((arg) => arg.startsWith("--hold-ms="));
  const ownerNameArg = argv.find((arg) => arg.startsWith("--require-owner-name="));
  const minWindowSizeArg = argv.find((arg) => arg.startsWith("--min-window-size="));
  const minWebviewSizeArg = argv.find((arg) => arg.startsWith("--min-webview-size="));
  const maxWebviewSizeArg = argv.find((arg) => arg.startsWith("--max-webview-size="));
  const webviewWindowSizeArg = argv.find((arg) => arg.startsWith("--webview-window-size="));
  const windowScreenshotArg = argv.find((arg) => arg.startsWith("--window-screenshot="));
  const tryWindowScreenshotArg = argv.find((arg) => arg.startsWith("--try-window-screenshot="));
  const webviewEvidenceArg = argv.find((arg) => arg.startsWith("--webview-evidence="));
  const webviewRouteArg = argv.find((arg) => arg.startsWith("--require-webview-route="));
  const requireAccessibilityText = argv
    .filter((arg) => arg.startsWith("--require-accessibility-text="))
    .map((arg) => arg.slice("--require-accessibility-text=".length).trim())
    .filter(Boolean);

  return {
    appPath: positional[0] ?? defaultAppPath,
    holdMs: holdMsArg ? Number(holdMsArg.slice("--hold-ms=".length)) : defaultHoldMs,
    killExisting: argv.includes("--kill-existing"),
    leaveRunning: argv.includes("--leave-running"),
    openApp: argv.includes("--open-app"),
    requireWindow: argv.includes("--require-window"),
    requireCapturableWindow: argv.includes("--require-capturable-window"),
    requireAccessibilityWindow: argv.includes("--require-accessibility-window"),
    requireFrontmost: argv.includes("--require-frontmost"),
    requireWebviewContent: argv.includes("--require-webview-content") || !argv.includes("--open-app"),
    requireWebviewRoute: webviewRouteArg
      ? webviewRouteArg.slice("--require-webview-route=".length).trim() || null
      : null,
    printWindowDiagnostics: argv.includes("--print-window-diagnostics"),
    verifyTopologyDrag: argv.includes("--verify-topology-drag"),
    verifyTopologyNodePopover: argv.includes("--verify-topology-node-popover"),
    verifyTopologyCreateNode: argv.includes("--verify-topology-create-node"),
    verifyTopologyFocusNoop: argv.includes("--verify-topology-focus-noop"),
    requireOwnerName: ownerNameArg
      ? ownerNameArg.slice("--require-owner-name=".length)
      : null,
    minWindowSize: minWindowSizeArg
      ? parseMinWindowSize(minWindowSizeArg.slice("--min-window-size=".length))
      : null,
    minWebviewSize: minWebviewSizeArg
      ? parseMinWindowSize(minWebviewSizeArg.slice("--min-webview-size=".length))
      : null,
    maxWebviewSize: maxWebviewSizeArg
      ? parseMinWindowSize(maxWebviewSizeArg.slice("--max-webview-size=".length))
      : null,
    webviewWindowSize: webviewWindowSizeArg
      ? parseMinWindowSize(webviewWindowSizeArg.slice("--webview-window-size=".length))
      : null,
    windowScreenshotPath: windowScreenshotArg
      ? windowScreenshotArg.slice("--window-screenshot=".length).trim() || null
      : null,
    tryWindowScreenshotPath: tryWindowScreenshotArg
      ? tryWindowScreenshotArg.slice("--try-window-screenshot=".length).trim() || null
      : null,
    webviewEvidencePath: webviewEvidenceArg
      ? webviewEvidenceArg.slice("--webview-evidence=".length).trim() || null
      : null,
    requireAccessibilityText,
  };
}

function printHelp() {
  console.log(`Usage: pnpm desktop:verify-app [path/to/${appBundleName}] [--hold-ms=5000] [--kill-existing] [--leave-running] [--open-app] [--require-window] [--require-capturable-window] [--window-screenshot=/tmp/atlas-window.png] [--try-window-screenshot=/tmp/atlas-window.png] [--webview-evidence=/tmp/atlas-webview.json] [--require-accessibility-window] [--require-frontmost] [--require-accessibility-text="개념 지도"] [--require-webview-content] [--require-webview-route=/en/topology/] [--verify-topology-drag] [--verify-topology-node-popover] [--verify-topology-create-node] [--verify-topology-focus-noop] [--print-window-diagnostics] [--require-owner-name="Ontology Atlas"] [--min-window-size=1040x720] [--min-webview-size=1400x860] [--max-webview-size=1100x800] [--webview-window-size=1100x800]

Launches the packaged macOS .app executable, waits long enough to catch early
startup crashes, then terminates it. This is an unsigned local runtime smoke;
release artifacts still need pnpm desktop:verify-release-dmg.

Options:
  --kill-existing   Terminate already-running copies of this app bundle executable before launch,
                    including installed .app copies with the same executable name.
  --leave-running   Keep the verified app running after verification so Computer Use or a human can
                    inspect the same installed app window. Direct WebView route checks can use this
                    without --open-app so the verifier returns instead of holding the process open.
  --open-app        Launch through macOS LaunchServices (open -n) instead of spawning the executable directly.
  --verify-topology-create-node
                    On a /topology route, click the Concept action before WebView marker capture and
                    require the Add Concept composer backdrop proof.
  --verify-topology-focus-noop
                    On a selected /topology route, re-run the selected-focus camera fit after initial
                    settle and require an already-safe no-op motion proof.
  --require-window  Require an on-screen macOS window owned by the launched app process.
  --require-capturable-window
                    Require at least one matching CoreGraphics window to produce a local screenshot
                    artifact, first by window id and then by the current-desktop bounds region.
                    This adds capture proof; Computer Use is still the final desktop-control check.
  --window-screenshot=PATH
                    Save the first successful matching window capture to PATH for human review.
                    Requires --require-capturable-window.
  --try-window-screenshot=PATH
                    Best-effort visual evidence. If an on-screen window is available and macOS
                    allows capture, save a screenshot to PATH; capture failure does not fail the
                    verifier. Use --window-screenshot with --require-capturable-window for a hard gate.
  --webview-evidence=PATH
                    Save the validated WebView marker payload to PATH. Direct executable launch only.
                    This gives deterministic installed-app route evidence when macOS screen capture
                    or Computer Use observation is unavailable.
  --require-accessibility-window
                    Require System Events to see at least one Accessibility window for the launched
                    process. This fails when macOS only exposes an app/menu tree with zero AX windows.
  --require-frontmost
                    Require System Events to report the launched process as frontmost. Use this when
                    diagnosing whether LaunchServices opened a foreground app for Computer Use.
  --require-accessibility-text=TEXT
                    Require the Swift Accessibility probe to find TEXT in the launched app's AX tree.
                    Repeat this option to require several screen phrases. Useful with --open-app,
                    where stdout WebView markers are not available.
  --require-webview-content
                    Require the Tauri WebView to report a loaded DOM with non-empty body text.
                    This uses stdout from direct executable launch and is not compatible with --open-app.
  --require-webview-route=PATH
                    Direct executable launch only. Navigate the packaged WebView to PATH before
                    reading the DOM and require the reported tauri:// pathname to match. Useful
                    for proving installed-app routes such as /en/topology/ without UI clicks.
  --verify-topology-drag
                    Direct executable launch only. On /topology routes, select the Views card,
                    perform a short WebView-level card drag, and require the dragged card plus a
                    companion card to settle visible, aligned, unclipped, and non-overlapping.
  --print-window-diagnostics
                    Print one JSON line with launched process ids, CoreGraphics windows, and
                    System Events accessibility rows. Use when Computer Use cannot observe
                    a window that macOS itself reports as visible.
  --require-owner-name=NAME
                    Require the visible app window's macOS owner name to match NAME.
  --min-window-size=WIDTHxHEIGHT
                    Require the visible app window to be at least WIDTH by HEIGHT points.
  --min-webview-size=WIDTHxHEIGHT
                    Require the direct-launch WebView DOM viewport to be at least WIDTH by
                    HEIGHT CSS pixels. Use this for deterministic fullscreen/large-screen
                    Relief checks even when macOS screen capture is unavailable.
  --max-webview-size=WIDTHxHEIGHT
                    Require the direct-launch WebView DOM viewport to be no larger than
                    WIDTH by HEIGHT CSS pixels. Use this to prove a compact Relief smoke is
                    actually exercising a compact installed-app viewport instead of the
                    default desktop window.
  --webview-window-size=WIDTHxHEIGHT
                    Request a verification-only Tauri main-window size before the WebView
                    evidence probe runs. This is direct executable launch only; pair it with
                    --max-webview-size to prove compact Relief behavior in the installed app.
`);
}

function fail(message) {
  console.error(`[desktop-app-verify] ${message}`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseMinWindowSize(value) {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) return null;
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

export function normalizeWebviewRoute(value) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const route = value.trim();
  if (!route.startsWith("/") || route.startsWith("//") || route.includes("://")) {
    return null;
  }
  if (/[\s"'<>\\]/.test(route)) return null;
  return route;
}

function normalizeAppPath(value) {
  return path.resolve(value).replace(/\/+$/, "");
}

function readBundleIdentifier(appPath) {
  const plistPath = path.join(appPath, "Contents", "Info.plist");
  if (!fs.existsSync(plistPath)) return null;
  const result = spawnSync(
    "/usr/libexec/PlistBuddy",
    ["-c", "Print :CFBundleIdentifier", plistPath],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

export function webviewVerifyEnvPatch({
  requireWebviewRoute = null,
  verifyTopologyDrag = false,
  verifyTopologyNodePopover = false,
  verifyTopologyCreateNode = false,
  verifyTopologyFocusNoop = false,
  webviewWindowSize = null,
} = {}) {
  return {
    [WEBVIEW_VERIFY_ENV]: "1",
    ...(requireWebviewRoute ? { [WEBVIEW_VERIFY_ROUTE_ENV]: requireWebviewRoute } : {}),
    ...(verifyTopologyDrag ? { [WEBVIEW_VERIFY_TOPOLOGY_DRAG_ENV]: "1" } : {}),
    ...(verifyTopologyNodePopover
      ? { [WEBVIEW_VERIFY_TOPOLOGY_NODE_POPOVER_ENV]: "1" }
      : {}),
    ...(verifyTopologyCreateNode ? { [WEBVIEW_VERIFY_TOPOLOGY_CREATE_NODE_ENV]: "1" } : {}),
    ...(verifyTopologyFocusNoop ? { [WEBVIEW_VERIFY_TOPOLOGY_FOCUS_NOOP_ENV]: "1" } : {}),
    ...(webviewWindowSize
      ? {
          [WEBVIEW_VERIFY_WINDOW_SIZE_ENV]: `${webviewWindowSize.width}x${webviewWindowSize.height}`,
        }
      : {}),
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function gracefulQuitCommandOptions() {
  return { stdio: "ignore", timeout: GRACEFUL_QUIT_COMMAND_TIMEOUT_MS };
}

export function expectedRelationLabelAgentGateText(gateKind) {
  if (gateKind === "handoff-ready") return "MCP/CLI";
  if (gateKind === "preflight-first") return "check";
  return "review";
}

function installedAppBundleCandidates(appBundleName) {
  return INSTALLED_APP_CANDIDATE_DIRS
    .map((dir) => path.join(dir, appBundleName))
    .filter((appPath) => fs.existsSync(appPath));
}

export function bundlePathConflictWarnings({
  targetAppPath,
  targetBundleIdentifier,
  candidates,
}) {
  if (!targetBundleIdentifier) return [];
  const normalizedTarget = normalizeAppPath(targetAppPath);
  return candidates
    .filter(
      (candidate) =>
        candidate.bundleIdentifier === targetBundleIdentifier &&
        normalizeAppPath(candidate.appPath) !== normalizedTarget,
    )
    .map(
      (candidate) =>
        `${normalizeAppPath(candidate.appPath)} shares bundle id ${targetBundleIdentifier} with the verified app; app-name Computer Use may attach to that installed copy unless the Run script refreshed it, so use the full built app path when exact bundle provenance matters.`,
    );
}

function printBundlePathConflictWarnings({ appPath, appBundleName }) {
  const targetBundleIdentifier = readBundleIdentifier(appPath);
  const candidates = installedAppBundleCandidates(appBundleName).map((candidatePath) => ({
    appPath: candidatePath,
    bundleIdentifier: readBundleIdentifier(candidatePath),
  }));
  for (const warning of bundlePathConflictWarnings({
    targetAppPath: appPath,
    targetBundleIdentifier,
    candidates,
  })) {
    console.warn(`[desktop-app-verify] warning: ${warning}`);
  }
}

async function terminate(child, { appPath = null, executablePath = null, appName = null } = {}) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (appPath || appName) {
    const bundleIdentifier = appPath ? readBundleIdentifier(appPath) : null;
    for (const { command, args } of gracefulQuitExistingAppCommands({
      appName,
      bundleIdentifier,
    })) {
      spawnSync(command, args, gracefulQuitCommandOptions());
    }
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      sleep(2500),
    ]);
    if (child.exitCode !== null || child.signalCode !== null) return;
  }
  if (executablePath && processIds(executablePath).length === 0) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(2000).then(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }),
  ]);
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function existingProcessPatterns({ executablePath }) {
  const executableName = path.basename(executablePath);
  return [
    regexEscape(executablePath),
    `\\.app/Contents/MacOS/${regexEscape(executableName)}$`,
  ];
}

export function gracefulQuitExistingAppCommands({ appName, bundleIdentifier }) {
  return [
    bundleIdentifier
      ? {
          command: "osascript",
          args: ["-e", `tell application id ${JSON.stringify(bundleIdentifier)} to quit`],
        }
      : null,
    appName
      ? {
          command: "osascript",
          args: ["-e", `tell application ${JSON.stringify(appName)} to quit`],
        }
      : null,
  ].filter(Boolean);
}

function terminateExisting({ appPath, executablePath, appName = null }) {
  const bundleIdentifier = readBundleIdentifier(appPath);
  for (const { command, args } of gracefulQuitExistingAppCommands({
    appName,
    bundleIdentifier,
  })) {
    spawnSync(command, args, gracefulQuitCommandOptions());
  }
  const gracefulQuitWaitUntil = Date.now() + 2500;
  while (processIds(executablePath).length > 0 && Date.now() < gracefulQuitWaitUntil) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  if (processIds(executablePath).length === 0) return;
  for (const pattern of existingProcessPatterns({ appPath, executablePath })) {
    spawnSync("pkill", ["-f", pattern], { stdio: "ignore" });
  }
}

function processExists(executablePath) {
  const result = spawnSync("pgrep", ["-f", executablePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 && result.stdout.trim().length > 0;
}

function processIds(executablePath) {
  const result = spawnSync("pgrep", ["-f", executablePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\s+/)
    .map((pid) => Number(pid))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function processIdsForPattern(pattern) {
  const result = spawnSync("pgrep", ["-f", pattern], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\s+/)
    .map((pid) => Number(pid))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

export function existingProcessIds({ appPath, executablePath }) {
  const pids = new Set();
  for (const pattern of existingProcessPatterns({ appPath, executablePath })) {
    for (const pid of processIdsForPattern(pattern)) {
      pids.add(pid);
    }
  }
  return Array.from(pids).sort((a, b) => a - b);
}

export async function waitForExistingProcessesToExit({
  appPath,
  executablePath,
  timeoutMs = STALE_PROCESS_EXIT_TIMEOUT_MS,
  intervalMs = STALE_PROCESS_POLL_MS,
  readProcessIds = existingProcessIds,
  sleepFn = sleep,
} = {}) {
  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  let pids = readProcessIds({ appPath, executablePath });
  for (let attempt = 0; pids.length > 0 && attempt < attempts; attempt += 1) {
    await sleepFn(intervalMs);
    pids = readProcessIds({ appPath, executablePath });
  }
  return pids;
}

export function parseOnscreenWindows(payload, ownerPids) {
  const allowedPids = new Set(ownerPids);
  const windows = JSON.parse(payload);
  if (!Array.isArray(windows)) return [];
  return windows.filter((window) => {
    const bounds = window.kCGWindowBounds;
    return (
      allowedPids.has(window.kCGWindowOwnerPID) &&
      window.kCGWindowIsOnscreen === true &&
      window.kCGWindowLayer === 0 &&
      window.kCGWindowAlpha !== 0 &&
      bounds &&
      Number(bounds.Width) > 0 &&
      Number(bounds.Height) > 0
    );
  });
}

export function validateWindowRequirements(windows, {
  requireOwnerName = null,
  minWindowSize = null,
} = {}) {
  if (requireOwnerName) {
    const matchesOwnerName = windows.some((window) => window.kCGWindowOwnerName === requireOwnerName);
    if (!matchesOwnerName) {
      return `no visible app window has owner name "${requireOwnerName}"`;
    }
  }
  if (minWindowSize) {
    const matchesSize = windows.some((window) => {
      const bounds = window.kCGWindowBounds;
      return (
        bounds &&
        Number(bounds.Width) >= minWindowSize.width &&
        Number(bounds.Height) >= minWindowSize.height
      );
    });
    if (!matchesSize) {
      return `no visible app window is at least ${minWindowSize.width}x${minWindowSize.height}`;
    }
  }
  return null;
}

export function windowCaptureTargets(windows) {
  return windows
    .map((window) => ({
      id: Number(window.kCGWindowNumber),
      ownerPid: Number(window.kCGWindowOwnerPID),
      ownerName: window.kCGWindowOwnerName ?? null,
      name: window.kCGWindowName ?? null,
      bounds: window.kCGWindowBounds ?? null,
      alpha: window.kCGWindowAlpha ?? null,
      sharingState: window.kCGWindowSharingState ?? null,
      storeType: window.kCGWindowStoreType ?? null,
      memoryUsage: window.kCGWindowMemoryUsage ?? null,
    }))
    .filter((window) => Number.isInteger(window.id) && window.id > 0);
}

export function buildAccessibilityWindowProbeScript(pids) {
  const predicates = pids.map((pid) => `procPid = ${pid}`).join(" or ");
  return `
set output to ""
tell application "System Events" to launch
tell application "System Events"
  repeat with proc in processes
    try
      set procPid to unix id of proc
      if ${predicates || "false"} then
        set output to output & procPid & tab & name of proc & tab & frontmost of proc & tab & (count of windows of proc) & tab & (count of UI elements of proc) & linefeed
      end if
    end try
  end repeat
end tell
return output
`;
}

export function buildForegroundActivationScript({ bundleIdentifier = null, pids = [] } = {}) {
  const predicates = pids.map((pid) => `procPid = ${pid}`).join(" or ");
  const bundleActivate = bundleIdentifier
    ? `
try
  tell application id ${JSON.stringify(bundleIdentifier)} to activate
  set activatedByBundle to true
end try
`
    : "";
  return `
set activatedByBundle to false
set activatedByPid to false
${bundleActivate}
delay 0.4
tell application "System Events" to launch
tell application "System Events"
  repeat with proc in processes
    try
      set procPid to unix id of proc
      if ${predicates || "false"} then
        set frontmost of proc to true
        set activatedByPid to true
      end if
    end try
  end repeat
end tell
return "bundle=" & activatedByBundle & tab & "pid=" & activatedByPid
`;
}

function activateAppForVisualEvidence({ appPath, executablePath }) {
  const pids = processIds(executablePath);
  const bundleIdentifier = readBundleIdentifier(appPath);
  const result = spawnSync(
    "osascript",
    ["-e", buildForegroundActivationScript({ bundleIdentifier, pids })],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    },
  );
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  const accessibility = spawnSync("osascript", ["-e", buildAccessibilityWindowProbeScript(pids)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: ACCESSIBILITY_WINDOW_TIMEOUT_MS,
  });
  const accessibilityRows = accessibility.status === 0
    ? parseAccessibilityWindowRows(accessibility.stdout)
    : [];
  const frontmost = accessibilityRows.some((row) => row.frontmost);
  const ok =
    result.status === 0 &&
    (/\bbundle=true\b/.test(stdout) || /\bpid=true\b/.test(stdout)) &&
    frontmost;
  return {
    ok,
    bundleIdentifier,
    pids,
    frontmost,
    status: result.status,
    stdout,
    stderr: [
      result.error?.code === "ETIMEDOUT" ? "foreground activation timed out" : null,
      stderr,
      accessibility.error?.code === "ETIMEDOUT"
        ? `post-activation Accessibility probe timed out after ${ACCESSIBILITY_WINDOW_TIMEOUT_MS}ms`
        : null,
      accessibility.status !== 0
        ? `post-activation Accessibility probe failed: ${accessibility.stderr.trim()}`
        : null,
    ].filter(Boolean).join("; "),
  };
}

export function parseAccessibilityWindowRows(payload) {
  return payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, processName, frontmost, windowCount, uiElementCount] = line.split("\t");
      return {
        pid: Number(pid),
        processName,
        frontmost: frontmost === "true",
        windowCount: Number(windowCount),
        uiElementCount: uiElementCount === undefined ? 0 : Number(uiElementCount),
      };
    })
    .filter((row) => Number.isInteger(row.pid) && row.pid > 0);
}

export function validateAccessibilityWindowRows(rows) {
  if (rows.length === 0) {
    return "System Events did not find the launched process";
  }
  const visibleRows = rows.filter((row) => Number(row.windowCount) > 0);
  if (visibleRows.length === 0) {
    return `System Events found the process but reported no Accessibility windows (${rows
      .map((row) => `${row.processName || "unknown"} pid=${row.pid}`)
      .join(", ")})`;
  }
  return null;
}

export function validateFrontmostAccessibilityRows(rows) {
  if (rows.length === 0) {
    return "System Events did not find the launched process";
  }
  if (!rows.some((row) => row.frontmost)) {
    return `System Events found the process but it was not frontmost (${rows
      .map((row) => `${row.processName || "unknown"} pid=${row.pid}`)
      .join(", ")})`;
  }
  return null;
}

export function buildAccessibilityTextProbeSwift(pids, requiredText = []) {
  const pidList = JSON.stringify(pids);
  const requiredList = JSON.stringify(requiredText);
  return `
import ApplicationServices
import Foundation

let requiredPids: Set<pid_t> = ${pidList}
let requiredText = ${requiredList}
let maxDepth = ${ACCESSIBILITY_TEXT_MAX_DEPTH}
let maxChildrenPerNode = ${ACCESSIBILITY_TEXT_MAX_CHILDREN_PER_NODE}
var found = Set<String>()
var output: [String] = []

func isComplete() -> Bool {
  return !requiredText.isEmpty && requiredText.allSatisfy { found.contains($0) }
}

func copyAttribute(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
  var value: CFTypeRef?
  let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
  if result != .success {
    return nil
  }
  return value
}

func appendValue(_ value: CFTypeRef?) {
  if isComplete() {
    return
  }
  guard let value else {
    return
  }
  let text = String(describing: value)
  if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
    return
  }
  if requiredText.isEmpty {
    output.append(text)
    return
  }
  for required in requiredText where !found.contains(required) && text.contains(required) {
    found.insert(required)
    output.append(text)
  }
}

func collectText(_ element: AXUIElement, depth: Int) {
  if isComplete() || depth > maxDepth {
    return
  }
  appendValue(copyAttribute(element, kAXTitleAttribute))
  appendValue(copyAttribute(element, kAXDescriptionAttribute))
  appendValue(copyAttribute(element, kAXValueAttribute))
  appendValue(copyAttribute(element, kAXRoleDescriptionAttribute))
  if isComplete() {
    return
  }
  guard let children = copyAttribute(element, kAXChildrenAttribute) as? [AXUIElement] else {
    return
  }
  for child in children.prefix(maxChildrenPerNode) {
    if isComplete() {
      break
    }
    collectText(child, depth: depth + 1)
  }
}

for pid in requiredPids {
  if isComplete() {
    break
  }
  collectText(AXUIElementCreateApplication(pid), depth: 0)
}

print(output.joined(separator: "\\n"))
`;
}

export function validateAccessibilityText(payload, requiredText) {
  if (requiredText.length === 0) return null;
  if (typeof payload !== "string" || payload.trim().length === 0) {
    return "empty Accessibility text payload";
  }
  for (const text of requiredText) {
    if (!payload.includes(text)) {
      return `missing Accessibility text "${text}"`;
    }
  }
  return null;
}

export function parseWebviewVerifyPayload(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .reverse()
    .filter((entry) => entry.startsWith(WEBVIEW_VERIFY_PREFIX));
  for (const line of lines) {
    const raw = line.slice(WEBVIEW_VERIFY_PREFIX.length).trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "string") return parsed;
      if (!parsed.trim()) continue;
      return JSON.parse(parsed);
    } catch {
      continue;
    }
  }
  return null;
}

export function validateSelectedRelationLabelCompactMarkers(markers, width) {
  const relationLabelViewportInset = Math.max(
    0,
    Number(markers?.topologySelectedRelationLabelViewportInset || 0),
  );
  if (
    Number(markers?.topologySelectedRelationLabelHitLeft || 0) <
    relationLabelViewportInset - 0.5
  ) {
    return `WebView Relief selected relation label overflowed the viewport left (${markers?.topologySelectedRelationLabelHitLeft ?? "missing"}px)`;
  }
  const relationLabelRightInset =
    Number(width || 0) - Number(markers?.topologySelectedRelationLabelHitRight || 0);
  if (relationLabelRightInset < relationLabelViewportInset - 0.5) {
    return `WebView Relief selected relation label overflowed the viewport right (right inset ${Number.isFinite(relationLabelRightInset) ? relationLabelRightInset : "missing"}px)`;
  }
  if (!/^(true|false)$/.test(String(markers?.topologySelectedRelationLabelCompact || ""))) {
    return "WebView Relief selected relation label did not expose a compact-mode marker";
  }
  const relationLabelCompact =
    String(markers?.topologySelectedRelationLabelCompact) === "true";
  const relationLabelHitWidth = Number(markers?.topologySelectedRelationLabelHitWidth || 0);
  const relationLabelDesiredWidth = Number(
    markers?.topologySelectedRelationLabelDesiredWidth || 0,
  );
  const relationLabelCenteredAvailableWidth = Number(
    markers?.topologySelectedRelationLabelCenteredAvailableWidth || 0,
  );
  if (!(relationLabelDesiredWidth >= relationLabelHitWidth)) {
    return `WebView Relief selected relation label desired width was smaller than its rendered width (${relationLabelDesiredWidth || "missing"} < ${relationLabelHitWidth || "missing"})`;
  }
  if (!(relationLabelCenteredAvailableWidth >= relationLabelHitWidth)) {
    return `WebView Relief selected relation label available width was smaller than its rendered width (${relationLabelCenteredAvailableWidth || "missing"} < ${relationLabelHitWidth || "missing"})`;
  }
  const relationLabelCompactBasis = relationLabelCenteredAvailableWidth || relationLabelHitWidth;
  const relationLabelRequiresCompact =
    relationLabelCompactBasis + RELATION_LABEL_COMPACT_WIDTH_TOLERANCE_PX <
    relationLabelDesiredWidth;
  if (relationLabelRequiresCompact !== relationLabelCompact) {
    return `WebView Relief selected relation label compact marker was inconsistent with its available width (${relationLabelCompactBasis} of ${relationLabelDesiredWidth})`;
  }
  const relationLabelClampContract = String(
    markers?.topologySelectedRelationLabelViewportClampContract || "",
  );
  const relationLabelClampSide = String(
    markers?.topologySelectedRelationLabelViewportClampSide || "",
  );
  if (
    !/^(centered-within-viewport|compacted-to-viewport-edge)$/.test(
      relationLabelClampContract,
    )
  ) {
    return `WebView Relief selected relation label viewport clamp contract was ${relationLabelClampContract || "missing"}`;
  }
  if (!/^(left|right|none)$/.test(relationLabelClampSide)) {
    return `WebView Relief selected relation label viewport clamp side was ${relationLabelClampSide || "missing"}`;
  }
  if (relationLabelClampContract === "centered-within-viewport" && relationLabelClampSide !== "none") {
    return `WebView Relief selected relation label clamp side ${relationLabelClampSide} contradicted centered geometry`;
  }
  if (
    relationLabelClampContract === "compacted-to-viewport-edge" &&
    relationLabelClampSide === "none"
  ) {
    return "WebView Relief selected relation label reported edge compaction without a clamp side";
  }
  return null;
}

export function validateRelationLabelFrameGeometryMarkers(markers) {
  const contract = String(markers?.topologyRelationLabelGeometryContract || "");
  if (contract !== "frame-positioned-hit-targets") {
    return `WebView Relief relation label frame geometry contract was ${contract || "missing"}`;
  }
  const source = String(markers?.topologyRelationLabelGeometrySource || "");
  if (source !== "after-render-layout-pass") {
    return `WebView Relief relation label frame geometry source was ${source || "missing"}`;
  }
  const expected = Number(markers?.topologyRelationLabelGeometryExpectedCount || 0);
  const ready = Number(markers?.topologyRelationLabelGeometryReadyCount || 0);
  const pending = Number(markers?.topologyRelationLabelGeometryPendingCount || 0);
  if (!Number.isFinite(expected) || expected < 1) {
    return `WebView Relief relation label frame geometry expected count was ${markers?.topologyRelationLabelGeometryExpectedCount ?? "missing"}`;
  }
  if (!Number.isFinite(ready) || ready < expected) {
    return `WebView Relief relation label frame geometry ready count (${ready || "missing"}) was below expected (${expected || "missing"})`;
  }
  if (!Number.isFinite(pending) || pending !== 0) {
    return `WebView Relief relation label frame geometry still had ${Number.isFinite(pending) ? pending : "missing"} pending labels`;
  }
  return null;
}

export function validateSelectedRelationCardAttentionLane(markers, width) {
  if (markers?.topologySelectedRelationCardDockContract !== "right-compact-relation-rail") {
    return `WebView Relief selected relation card dock contract was ${markers?.topologySelectedRelationCardDockContract || "missing"}`;
  }
  if (markers?.topologySelectedRelationCardAttentionLane !== "right-inspector-rail") {
    return `WebView Relief selected relation card attention lane was ${markers?.topologySelectedRelationCardAttentionLane || "missing"}`;
  }
  if (
    markers?.topologySelectedRelationCardMapClearanceContract !==
    "selected-label-keeps-map-lane"
  ) {
    return `WebView Relief selected relation card map clearance contract was ${markers?.topologySelectedRelationCardMapClearanceContract || "missing"}`;
  }
  const viewportWidth = Number(width || 0);
  const cardLeft = Number(markers?.topologySelectedRelationCardLeft || 0);
  const cardRight = Number(markers?.topologySelectedRelationCardRight || 0);
  const labelRight = Number(markers?.topologySelectedRelationLabelHitRight || 0);
  if (viewportWidth >= 1400) {
    const rightInset = viewportWidth - cardRight;
    if (!Number.isFinite(rightInset) || rightInset < 24 || rightInset > 96) {
      return `WebView Relief selected relation card left the right inspector lane (right inset ${Number.isFinite(rightInset) ? rightInset : "missing"}px)`;
    }
    const labelGap = cardLeft - labelRight;
    if (
      Number.isFinite(labelRight) &&
      labelRight > 0 &&
      (!Number.isFinite(labelGap) || labelGap < 32)
    ) {
      return `WebView Relief selected relation card crowded the selected relation label (${Number.isFinite(labelGap) ? labelGap : "missing"}px gap)`;
    }
    const panelRight = Number(markers?.topologyAnalysisPanelRight || 0);
    const panelVisible = markers?.topologyAnalysisPanelVisible === true;
    if (panelVisible) {
      const panelGap = cardLeft - panelRight;
      if (!Number.isFinite(panelGap) || panelGap < 32) {
        return `WebView Relief selected relation card crowded the support panel (${Number.isFinite(panelGap) ? panelGap : "missing"}px gap)`;
      }
    }
  }
  return null;
}

export function validateSelectedRelationCardDensityContract(markers, width) {
  const viewportWidth = Number(width || 0);
  if (viewportWidth < 1400) return null;

  if (markers?.topologySelectedRelationCardDensity !== "compact") {
    return `WebView reported malformed Relief selected relation card density (${markers?.topologySelectedRelationCardDensity || "missing"})`;
  }
  if (
    markers?.topologySelectedRelationCardDensityContract !==
    "mini-relation-inspector"
  ) {
    return `WebView reported malformed Relief selected relation card density contract (${markers?.topologySelectedRelationCardDensityContract || "missing"})`;
  }
  if (
    viewportWidth >= 1920 &&
    markers?.topologySelectedRelationCardScaleContract !== "density-fixed-no-ui-zoom"
  ) {
    return `WebView reported malformed Relief selected relation card scale contract (${markers?.topologySelectedRelationCardScaleContract || "missing"})`;
  }
  if (
    markers?.topologySelectedRelationCardTypographyContract !==
    "legible-compact-relation-inspector"
  ) {
    return `WebView reported malformed Relief selected relation typography contract (${markers?.topologySelectedRelationCardTypographyContract || "missing"})`;
  }
  if (
    markers?.topologySelectedRelationCardMaxHeightToken !==
    "--topology-selected-relation-card-max-height"
  ) {
    return `WebView reported malformed Relief selected relation card max-height token (${markers?.topologySelectedRelationCardMaxHeightToken || "missing"})`;
  }
  const expectedTypographyTokens = {
    topologySelectedRelationCardKickerFontSizeToken:
      "--topology-selected-relation-kicker-font-size",
    topologySelectedRelationCardChipFontSizeToken:
      "--topology-selected-relation-chip-font-size",
    topologySelectedRelationCardRouteLabelFontSizeToken:
      "--topology-selected-relation-route-label-font-size",
    topologySelectedRelationCardRouteValueFontSizeToken:
      "--topology-selected-relation-route-value-font-size",
    topologySelectedRelationCardPayloadFontSizeToken:
      "--topology-selected-relation-payload-font-size",
  };
  for (const [marker, token] of Object.entries(expectedTypographyTokens)) {
    if (markers?.[marker] !== token) {
      return `WebView reported malformed Relief selected relation typography token ${marker} (${markers?.[marker] || "missing"})`;
    }
  }
  const routeSteps = Array.isArray(markers?.topologySelectedRelationAgentRouteSteps)
    ? markers.topologySelectedRelationAgentRouteSteps
    : [];
  const routeFontTooSmall = routeSteps.find((step) => {
    if (step?.visibility === "metadata-only" || step?.kind === "action") {
      return false;
    }
    const labelSize = Number.parseFloat(String(step?.labelFontSize || "0"));
    const valueSize = Number.parseFloat(String(step?.valueFontSize || "0"));
    return labelSize < 8 || valueSize < 10;
  });
  if (routeFontTooSmall) {
    return `WebView reported too-small Relief selected relation route typography (${routeFontTooSmall.labelFontSize || "missing"}/${routeFontTooSmall.valueFontSize || "missing"})`;
  }

  const cardWidth = Number(markers?.topologySelectedRelationCardWidth || 0);
  const cardHeight = Number(markers?.topologySelectedRelationCardHeight || 0);
  if (cardWidth > 288 || cardHeight > 336) {
    return `WebView reported oversized compact Relief selected relation card (${cardWidth || "missing"}x${cardHeight || "missing"})`;
  }

  const proofBandHeight = Number(markers?.topologySelectedRelationProofBandHeight || 0);
  if (proofBandHeight > 44) {
    return `WebView reported oversized Relief selected relation proof band (${proofBandHeight || "missing"}px)`;
  }

  const copyActionRailHeight = Number(
    markers?.topologySelectedRelationCopyActionRailHeight || 0,
  );
  if (copyActionRailHeight > 36) {
    return `WebView reported oversized Relief selected relation copy action rail (${copyActionRailHeight || "missing"}px)`;
  }

  const copyPayloadHeight = Number(markers?.topologySelectedRelationCopyPayloadHeight || 0);
  if (copyPayloadHeight > 38) {
    return `WebView reported oversized Relief selected relation copy payload strip (${copyPayloadHeight || "missing"}px)`;
  }

  const agentRouteHeight = Number(markers?.topologySelectedRelationAgentRouteHeight || 0);
  if (agentRouteHeight > 38) {
    return `WebView reported oversized Relief selected relation agent route rail (${agentRouteHeight || "missing"}px)`;
  }

  return null;
}

export function selectedRelationRouteRailTextLeak(payload) {
  const compactBodyText = String(payload?.bodyText || "").replace(/\s+/g, "");
  return /(?:STRONG|SUPPORTED|WEAK|REVIEW)FACT(?:SRC|AUTH|REVIEW)(?:MCP\/CLI|CHECK|REVIEW)(?:EXPLAIN|CHECK)/i.test(
    compactBodyText,
  ) || /S\d+(?:MCP\/CLI|CHECK|REVIEW)/i.test(compactBodyText);
}

function validateTopologyFocusNoopMarkers(payload) {
  if (payload.markers.topologyFocusNoopAttempted !== true) {
    return `WebView did not attempt selected focus no-op verification (${payload.markers.topologyFocusNoopReason || "unknown reason"})`;
  }
  if (payload.markers.topologyFocusNoopReason !== "done") {
    return `WebView selected focus no-op verification did not finish (${payload.markers.topologyFocusNoopReason || "missing"})`;
  }
  if (payload.markers.topologyFocusNoopAfterTrigger !== "selected-focus-already-safe") {
    return `WebView selected focus no-op trigger was ${payload.markers.topologyFocusNoopAfterTrigger || "missing"}`;
  }
  if (payload.markers.topologyFocusNoopAfterState !== "already-safe") {
    return `WebView selected focus no-op state was ${payload.markers.topologyFocusNoopAfterState || "missing"}`;
  }
  if (Number(payload.markers.topologyFocusNoopAfterDistancePx ?? -1) !== 0) {
    return `WebView selected focus no-op distance was ${payload.markers.topologyFocusNoopAfterDistancePx ?? "missing"}px`;
  }
  return null;
}

export function validateWebviewVerifyPayload(payload, {
  expectedPath = null,
  minWebviewSize = null,
  maxWebviewSize = null,
  requireTopologyDrag = false,
  requireTopologyNodePopover = false,
  requireTopologyCreateNode = false,
  requireTopologyFocusNoop = false,
} = {}) {
  if (!payload || typeof payload !== "object") {
    return "missing WebView verification payload";
  }
  if (typeof payload.href !== "string" || !payload.href.startsWith("tauri://")) {
    return "WebView did not report a tauri:// URL";
  }
  if (payload.readyState !== "complete") {
    return `WebView document was not complete (readyState=${payload.readyState ?? "unknown"})`;
  }
  if (typeof payload.bodyText !== "string" || payload.bodyText.trim().length === 0) {
    return "WebView body text was empty";
  }
  if (
    payload.title !== "Ontology Atlas" &&
    !(
      typeof payload.title === "string" &&
      /\bontology-atlas\b|Ontology Atlas/.test(payload.title)
    )
  ) {
    return `WebView did not report an Ontology Atlas route title (title=${payload.title ?? "unknown"})`;
  }
  if (!WEBVIEW_WORKBENCH_MARKERS.every((marker) => marker.test(payload.bodyText))) {
    return "WebView body text did not include Ontology Atlas workbench markers";
  }
  if (!payload.markers || typeof payload.markers !== "object") {
    return "WebView did not report structured markers";
  }
  if (minWebviewSize) {
    const width = Number(payload.width);
    const height = Number(payload.height);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < minWebviewSize.width ||
      height < minWebviewSize.height
    ) {
      return `WebView viewport was ${width || "unknown"}x${height || "unknown"}, expected at least ${minWebviewSize.width}x${minWebviewSize.height}`;
    }
  }
  if (maxWebviewSize) {
    const width = Number(payload.width);
    const height = Number(payload.height);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width > maxWebviewSize.width ||
      height > maxWebviewSize.height
    ) {
      return `WebView viewport was ${width || "unknown"}x${height || "unknown"}, expected at most ${maxWebviewSize.width}x${maxWebviewSize.height}`;
    }
  }
  if (payload.markers.ontologyNav !== true) {
    return "WebView did not report the ontology navigation marker";
  }
  if (payload.markers.sourceVaultNav !== true) {
    return "WebView did not report the source vault navigation marker";
  }
  const webviewUrl = new URL(payload.href);
  const webviewPath = webviewUrl.pathname;
  const topologyAnalysisMode =
    typeof payload.markers.topologyAnalysisPanelMode === "string"
      ? payload.markers.topologyAnalysisPanelMode.trim() || webviewUrl.searchParams.get("mode") || ""
      : webviewUrl.searchParams.get("mode") || "";
  if (expectedPath) {
    const expectedUrl = new URL(expectedPath, payload.href);
    const expectedRoute = expectedUrl.search
      ? `${expectedUrl.pathname}${expectedUrl.search}`
      : expectedUrl.pathname;
    const actualRoute = expectedUrl.search
      ? `${webviewPath}${webviewUrl.search}`
      : webviewPath;
    if (actualRoute !== expectedRoute) {
      return `WebView reported route ${actualRoute}, expected ${expectedRoute}`;
    }
  }
  const topologySelectedParam = normalizeTopologySelectedParam(
    webviewUrl.searchParams.get("p"),
  );
  const selectedNodeId =
    typeof payload.markers.topologySelectedNodeId === "string"
      ? payload.markers.topologySelectedNodeId.trim()
      : "";
  const selectedNodeKind =
    typeof payload.markers.topologySelectedNodeKind === "string"
      ? payload.markers.topologySelectedNodeKind.trim()
      : "";
  const selectedNodeTitle =
    typeof payload.markers.topologySelectedNodeTitle === "string"
      ? payload.markers.topologySelectedNodeTitle.trim()
      : "";
  const selectedNodeSummary =
    typeof payload.markers.topologySelectedNodeSummary === "string"
      ? payload.markers.topologySelectedNodeSummary.trim()
      : "";
  const focusSelectedNodeRoute =
    Boolean(topologySelectedParam) && topologyAnalysisMode === "focus";
  const blockingComposerOpen = payload.markers.topologyCreateNodeOpen === true;
  const selectedRelationSource =
    typeof payload.markers.topologySelectedRelationHandleStripSource === "string"
      ? payload.markers.topologySelectedRelationHandleStripSource.trim()
      : "";
  const selectedRelationTarget =
    typeof payload.markers.topologySelectedRelationHandleStripTarget === "string"
      ? payload.markers.topologySelectedRelationHandleStripTarget.trim()
      : "";
  const selectedRelationContextVisible =
    payload.markers.topologySelectedRelationClaimLensVisible === true &&
    Boolean(topologySelectedParam) &&
    (selectedRelationSource === topologySelectedParam ||
      selectedRelationTarget === topologySelectedParam);
  const koreanTopologyRoute = webviewPath.startsWith("/ko/topology");
  const rawRelationTypePattern =
    /^(contains|depends_on|depends-on|depends|relates|relates_to|related_to|describes|uses|belongs_to|belongs-to)$/i;
  if (
    webviewPath.includes("/ontology/insights") &&
    payload.markers.businessDecisionQuestions !== true
  ) {
    return "WebView did not report the business decision questions marker";
  }
  if (
    webviewPath.includes("/ontology/insights") &&
    payload.markers.readerDecisionLens !== true
  ) {
    return "WebView did not report the reader decision lens marker";
  }
  if (webviewPath.includes("/topology") && payload.markers.topologyRelief !== true) {
    return "WebView did not report the Relief topology marker";
  }
  if (
    webviewPath.includes("/topology") &&
    webviewUrl.searchParams.get("mode") === "path" &&
    !(Number(payload.markers.topologyPathCandidateCardCount || 0) >= 1 ||
      Number(payload.markers.topologyPathSourceCardCount || 0) >= 1)
  ) {
    return "WebView Path mode cards did not expose path selection roles";
  }
  const expectedPathSourceParam = normalizeTopologySelectedParam(
    webviewUrl.searchParams.get("pathFrom") ||
      (webviewUrl.searchParams.get("mode") === "path"
        ? webviewUrl.searchParams.get("p")
        : ""),
  );
  if (
    webviewPath.includes("/topology") &&
    webviewUrl.searchParams.get("mode") === "path" &&
    expectedPathSourceParam &&
    payload.markers.topologySkeletonCardsActive === true
  ) {
    if (Number(payload.markers.topologyPathSourceCardCount || 0) < 1) {
      return "WebView Path mode selected source card was not visible";
    }
    if (payload.markers.topologyPathSourceCardRoleContract !== "source-anchor-visible") {
      return `WebView Path mode source card contract was ${payload.markers.topologyPathSourceCardRoleContract || "missing"}`;
    }
    if (payload.markers.topologyPathSourceCardAttentionLayer !== "focus-path-state") {
      return `WebView Path mode source card attention layer was ${payload.markers.topologyPathSourceCardAttentionLayer || "missing"}`;
    }
    if (payload.markers.topologyPathSourceCardAnchor !== "source") {
      return `WebView Path mode source card anchor was ${payload.markers.topologyPathSourceCardAnchor || "missing"}`;
    }
    if (payload.markers.topologyPathSourceCardBadgeLabel !== "A") {
      return `WebView Path mode source card badge was ${payload.markers.topologyPathSourceCardBadgeLabel || "missing"}`;
    }
    const expectedSourceNextAction = webviewUrl.searchParams.get("pathTo")
      ? "review-path"
      : "pick-target";
    if (payload.markers.topologyPathSourceCardNextAction !== expectedSourceNextAction) {
      return `WebView Path mode source card next action was ${payload.markers.topologyPathSourceCardNextAction || "missing"}`;
    }
    if (webviewUrl.searchParams.get("pathTo")) {
      if (Number(payload.markers.topologyPathTargetCardCount || 0) < 1) {
        return "WebView Path mode selected target card was not visible";
      }
      if (payload.markers.topologyPathTargetCardRoleContract !== "target-anchor-visible") {
        return `WebView Path mode target card contract was ${payload.markers.topologyPathTargetCardRoleContract || "missing"}`;
      }
      if (payload.markers.topologyPathTargetCardBadgeLabel !== "B") {
        return `WebView Path mode target card badge was ${payload.markers.topologyPathTargetCardBadgeLabel || "missing"}`;
      }
    }
  }
  if (
    webviewPath.includes("/topology") &&
    webviewUrl.searchParams.get("mode") === "path" &&
    payload.markers.topologySkeletonCardsActive === true &&
    payload.markers.topologyPathStartPromptVisible === true
  ) {
    return "WebView kept a redundant Path mode prompt over Relief card mode";
  }
  if (
    webviewPath.includes("/topology") &&
    webviewUrl.searchParams.get("mode") === "path" &&
    payload.markers.topologySkeletonCardsActive === true
  ) {
    if (
      payload.markers.topologyAnalysisPanelWidthBand !== "header-aligned" ||
      payload.markers.topologyAnalysisPanelWidthTarget !== "path-14-inch-rail" ||
      payload.markers.topologyAnalysisPanelWidthContract !==
        "path-support-rail-max-360-phone-utility-reserve" ||
      payload.markers.topologyAnalysisPanelWidthToken !==
        "--topology-panel-path-responsive-width" ||
      payload.markers.topologyAnalysisPanelPhoneUtilityReserveToken !==
        "--topology-panel-phone-utility-rail-reserve" ||
      Number(payload.markers.topologyAnalysisPanelWidth || 0) < 320 ||
      Number(payload.markers.topologyAnalysisPanelWidth || 0) > 360 ||
      payload.markers.topologyAnalysisPanelAttentionRole !== "support"
    ) {
      return `WebView Path mode panel did not use the 14-inch support width contract (${payload.markers.topologyAnalysisPanelWidthBand || "missing"} · ${payload.markers.topologyAnalysisPanelWidthTarget || "missing"} · ${payload.markers.topologyAnalysisPanelWidthContract || "missing"} · ${payload.markers.topologyAnalysisPanelWidthToken || "missing"} · ${payload.markers.topologyAnalysisPanelWidth || 0}px)`;
    }
    const visibleCandidates = Number(
      payload.markers.topologyPathCandidateVisibilityVisible || 0,
    );
    const totalCandidates = Number(
      payload.markers.topologyPathCandidateVisibilityTotal || 0,
    );
    const visibilityText = String(
      payload.markers.topologyPathCandidateVisibilityText || "",
    ).trim();
    if (
      !(visibleCandidates >= 1) ||
      !(totalCandidates >= visibleCandidates) ||
      !new RegExp(`${visibleCandidates}\\s*/\\s*${totalCandidates}`).test(visibilityText)
    ) {
      return "WebView Path mode did not report visible candidate coverage";
    }
    if (payload.markers.topologyPathAgentHandoffVisible !== true) {
      return "WebView Path mode did not expose the agent handoff marker";
    }
    const pathResultHasBothEndpoints =
      Number(payload.markers.topologyPathSourceCardCount || 0) >= 1 &&
      Number(payload.markers.topologyPathTargetCardCount || 0) >= 1;
    if (pathResultHasBothEndpoints) {
      if (payload.markers.topologyPathVisibleRouteVisible !== true) {
        return "WebView Path mode did not expose the visible source-target route rail";
      }
      if (
        payload.markers.topologyPathVisibleRouteContract !==
        "source-target-visible-before-proof-disclosure"
      ) {
        return `WebView Path mode visible route contract was ${payload.markers.topologyPathVisibleRouteContract || "missing"}`;
      }
      if (payload.markers.topologyPathVisibleRouteAttentionLayer !== "focus-path-state") {
        return `WebView Path mode visible route layer was ${payload.markers.topologyPathVisibleRouteAttentionLayer || "missing"}`;
      }
      if (payload.markers.topologyPathVisibleRouteGuidanceOwner !== "analysis-rail") {
        return `WebView Path mode visible route owner was ${payload.markers.topologyPathVisibleRouteGuidanceOwner || "missing"}`;
      }
      if (payload.markers.topologyPathVisibleRouteOverflowContract !== "no-horizontal-scroll") {
        return `WebView Path mode visible route overflow contract was ${payload.markers.topologyPathVisibleRouteOverflowContract || "missing"}`;
      }
      if (
        payload.markers.topologyPathVisibleRouteSurfaceToken !== "--topology-path-route-surface" ||
        payload.markers.topologyPathVisibleRouteBorderToken !== "--topology-path-route-border" ||
        payload.markers.topologyPathVisibleRouteChipSurfaceToken !==
          "--topology-path-route-chip-surface" ||
        payload.markers.topologyPathVisibleRouteChipBorderToken !==
          "--topology-path-route-chip-border"
      ) {
        return "WebView Path mode visible route token contract was not active";
      }
      if (
        Number(payload.markers.topologyPathVisibleRouteClientWidth || 0) < 180 ||
        Number(payload.markers.topologyPathVisibleRouteScrollWidth || 0) -
          Number(payload.markers.topologyPathVisibleRouteClientWidth || 0) >
          2
      ) {
        return `WebView Path mode visible route overflowed (${payload.markers.topologyPathVisibleRouteClientWidth || 0} client / ${payload.markers.topologyPathVisibleRouteScrollWidth || 0} scroll)`;
      }
    }
    if (payload.markers.topologyPathAgentHandoffLayer !== "focus-path-state") {
      return `WebView Path mode handoff layer was ${payload.markers.topologyPathAgentHandoffLayer || "missing"}`;
    }
    if (payload.markers.topologyPathGuidanceOwner !== "analysis-rail") {
      return `WebView Path mode guidance owner was ${payload.markers.topologyPathGuidanceOwner || "missing"}`;
    }
    if (payload.markers.topologyPathPromptPolicy !== "panel-owned-when-card-mode") {
      return `WebView Path mode prompt policy was ${payload.markers.topologyPathPromptPolicy || "missing"}`;
    }
    if (payload.markers.topologyPathHandoffContract !== "agent-next-action-visible") {
      return `WebView Path mode handoff contract was ${payload.markers.topologyPathHandoffContract || "missing"}`;
    }
    if (payload.markers.topologyPathHandoffLayoutContract !== "compact-proof-strip") {
      return `WebView Path mode handoff layout contract was ${payload.markers.topologyPathHandoffLayoutContract || "missing"}`;
    }
    if (
      payload.markers.topologyPathHandoffSurfaceToken !== "--topology-path-handoff-surface" ||
      payload.markers.topologyPathHandoffBorderToken !== "--topology-path-handoff-border" ||
      payload.markers.topologyPathHandoffActionMinHeightToken !==
        "--topology-path-handoff-action-min-height" ||
      payload.markers.topologyPathHandoffActionRadiusToken !==
        "--topology-path-handoff-action-radius"
    ) {
      return "WebView Path mode handoff token contract was not active";
    }
    if (
      Object.prototype.hasOwnProperty.call(
        payload.markers,
        "topologyPathPromptSuppressionContract",
      ) &&
      payload.markers.topologyPathStartPromptVisible !== true &&
      payload.markers.topologyPathAnchorPromptVisible !== true &&
      payload.markers.topologyPathResultBannerVisible !== true &&
      payload.markers.topologyPathPromptSuppressionContract !==
        "analysis-rail-owns-path-start"
    ) {
      return `WebView Path mode prompt suppression contract was ${payload.markers.topologyPathPromptSuppressionContract || "missing"}`;
    }
    const hasPathHandoffOverflowEvidence =
      Object.prototype.hasOwnProperty.call(
        payload.markers,
        "topologyPathHandoffOverflowContract",
      ) ||
      Object.prototype.hasOwnProperty.call(
        payload.markers,
        "topologyPathAgentHandoffClientWidth",
      ) ||
      Object.prototype.hasOwnProperty.call(
        payload.markers,
        "topologyPathAgentHandoffScrollWidth",
      );
    if (hasPathHandoffOverflowEvidence) {
      if (payload.markers.topologyPathHandoffOverflowContract !== "no-horizontal-scroll") {
        return `WebView Path mode handoff overflow contract was ${payload.markers.topologyPathHandoffOverflowContract || "missing"}`;
      }
      const pathHandoffClientWidth = Number(
        payload.markers.topologyPathAgentHandoffClientWidth || 0,
      );
      const pathHandoffScrollWidth = Number(
        payload.markers.topologyPathAgentHandoffScrollWidth || 0,
      );
      if (
        pathHandoffClientWidth < 160 ||
        pathHandoffScrollWidth - pathHandoffClientWidth > 2
      ) {
        return `WebView Path mode handoff overflowed (${pathHandoffClientWidth} client / ${pathHandoffScrollWidth} scroll)`;
      }
    }
    if (payload.markers.topologyPathAgentHandoffMcpAction !== "find_path") {
      return `WebView Path mode MCP handoff was ${payload.markers.topologyPathAgentHandoffMcpAction || "missing"}`;
    }
    if (
      !String(payload.markers.topologyPathAgentHandoffCliFallback || "")
        .toLowerCase()
        .includes("path")
    ) {
      return `WebView Path mode CLI handoff was ${payload.markers.topologyPathAgentHandoffCliFallback || "missing"}`;
    }
    if (payload.markers.topologyAttentionWinner !== "focus-path-state") {
      return `WebView Path mode attention winner was ${payload.markers.topologyAttentionWinner || "missing"}`;
    }
    if (payload.markers.topologyMinimapVisible === true) {
      return "WebView Path mode kept the minimap utility chrome visible";
    }
    if (payload.markers.topologyKindLegendVisible === true) {
      return "WebView Path mode kept the kind legend utility chrome visible";
    }
    if (payload.markers.topologyKindLegendState !== "collapsed-support-chrome") {
      return `WebView Path mode kind legend state was ${payload.markers.topologyKindLegendState || "missing"}`;
    }
    if (
      webviewUrl.searchParams.has("p") &&
      payload.markers.topologyNodePopoverVisible === true
    ) {
      return "WebView Path mode kept the selected node popover visible";
    }
  }
  if (
    webviewPath.includes("/topology") &&
    webviewUrl.searchParams.get("mode") === "path" &&
    payload.markers.topologyAnalysisPanelVisible === true
  ) {
    const panelRight = Number(payload.markers.topologyAnalysisPanelRight || 0);
    const anchorPromptVisible = payload.markers.topologyPathAnchorPromptVisible === true;
    const startPromptVisible = payload.markers.topologyPathStartPromptVisible === true;
    const promptContract = anchorPromptVisible
      ? String(payload.markers.topologyPathAnchorPromptContract || "")
      : startPromptVisible
        ? String(payload.markers.topologyPathStartPromptContract || "")
        : "";
    const promptLeft = anchorPromptVisible
      ? Number(payload.markers.topologyPathAnchorPromptLeft || 0)
      : startPromptVisible
        ? Number(payload.markers.topologyPathStartPromptLeft || 0)
        : 0;
    const promptTop = anchorPromptVisible
      ? Number(payload.markers.topologyPathAnchorPromptTop || 0)
      : startPromptVisible
        ? Number(payload.markers.topologyPathStartPromptTop || 0)
        : 0;
    const promptRight = anchorPromptVisible
      ? Number(payload.markers.topologyPathAnchorPromptRight || 0)
      : startPromptVisible
        ? Number(payload.markers.topologyPathStartPromptRight || 0)
        : 0;
    const promptWidth = anchorPromptVisible
      ? Number(payload.markers.topologyPathAnchorPromptWidth || 0)
      : startPromptVisible
        ? Number(payload.markers.topologyPathStartPromptWidth || 0)
        : 0;
    const promptLane = anchorPromptVisible
      ? String(payload.markers.topologyPathAnchorPromptLane || "")
      : startPromptVisible
        ? String(payload.markers.topologyPathStartPromptLane || "")
        : "";
    const promptAttentionLayer = anchorPromptVisible
      ? String(payload.markers.topologyPathAnchorPromptAttentionLayer || "")
      : startPromptVisible
        ? String(payload.markers.topologyPathStartPromptAttentionLayer || "")
        : "";
    const promptHandoffContract = anchorPromptVisible
      ? String(payload.markers.topologyPathAnchorPromptHandoffContract || "")
      : startPromptVisible
        ? String(payload.markers.topologyPathStartPromptHandoffContract || "")
        : "";
    const promptOverflowContract = anchorPromptVisible
      ? String(payload.markers.topologyPathAnchorPromptOverflowContract || "")
      : startPromptVisible
        ? String(payload.markers.topologyPathStartPromptOverflowContract || "")
        : "";
    const promptMcpAction = anchorPromptVisible
      ? String(payload.markers.topologyPathAnchorPromptMcpAction || "")
      : startPromptVisible
        ? String(payload.markers.topologyPathStartPromptMcpAction || "")
        : "";
    const promptCliFallback = anchorPromptVisible
      ? String(payload.markers.topologyPathAnchorPromptCliFallback || "")
      : startPromptVisible
        ? String(payload.markers.topologyPathStartPromptCliFallback || "")
        : "";
    const promptClientWidth = anchorPromptVisible
      ? Number(payload.markers.topologyPathAnchorPromptClientWidth || 0)
      : startPromptVisible
        ? Number(payload.markers.topologyPathStartPromptClientWidth || 0)
        : 0;
    const promptScrollWidth = anchorPromptVisible
      ? Number(payload.markers.topologyPathAnchorPromptScrollWidth || 0)
      : startPromptVisible
        ? Number(payload.markers.topologyPathStartPromptScrollWidth || 0)
        : 0;
    if ((anchorPromptVisible || startPromptVisible) && promptContract !== "panel-clear-viewport-contained") {
      return `WebView Path mode prompt contract was ${promptContract || "missing"}`;
    }
    if ((anchorPromptVisible || startPromptVisible) && promptLane !== "chrome-clear-path-lane") {
      return `WebView Path mode prompt lane was ${promptLane || "missing"}`;
    }
    if ((anchorPromptVisible || startPromptVisible) && promptAttentionLayer !== "focus-path-state") {
      return `WebView Path mode prompt attention layer was ${promptAttentionLayer || "missing"}`;
    }
    if ((anchorPromptVisible || startPromptVisible) && promptHandoffContract !== "agent-next-action-visible") {
      return `WebView Path mode prompt handoff contract was ${promptHandoffContract || "missing"}`;
    }
    if ((anchorPromptVisible || startPromptVisible) && promptOverflowContract !== "no-horizontal-scroll") {
      return `WebView Path mode prompt overflow contract was ${promptOverflowContract || "missing"}`;
    }
    if ((anchorPromptVisible || startPromptVisible) && promptMcpAction !== "find_path") {
      return `WebView Path mode prompt MCP action was ${promptMcpAction || "missing"}`;
    }
    if (
      (anchorPromptVisible || startPromptVisible) &&
      !promptCliFallback.toLowerCase().includes("path")
    ) {
      return `WebView Path mode prompt CLI fallback was ${promptCliFallback || "missing"}`;
    }
    if (
      (anchorPromptVisible || startPromptVisible) &&
      (promptClientWidth < 240 || promptScrollWidth - promptClientWidth > 2)
    ) {
      return `WebView Path mode prompt overflowed (${promptClientWidth} client / ${promptScrollWidth} scroll)`;
    }
    if (
      (anchorPromptVisible || startPromptVisible) &&
      payload.markers.topologyPathPromptClearanceContract !== "analysis-rail-clear-24"
    ) {
      return `WebView Path mode prompt clearance contract was ${payload.markers.topologyPathPromptClearanceContract || "missing"}`;
    }
    if ((anchorPromptVisible || startPromptVisible) && Number(payload.width || 0) >= 900 && promptTop < 124) {
      return `WebView Path mode prompt competed with top chrome (${promptTop}px top)`;
    }
    if (promptLeft > 0 && panelRight > 0 && promptLeft < panelRight + 24) {
      return `WebView Path mode prompt overlapped the Relief analysis panel (${promptLeft}px left vs ${panelRight}px panel right)`;
    }
    if (
      (anchorPromptVisible || startPromptVisible) &&
      Number(payload.markers.topologyPathPromptPanelClearancePx || 0) < 24
    ) {
      return `WebView Path mode prompt reported insufficient analysis panel clearance (${payload.markers.topologyPathPromptPanelClearancePx ?? "missing"}px)`;
    }
    if (
      (anchorPromptVisible || startPromptVisible) &&
      Number(payload.markers.topologyPathPromptViewportRightClearancePx || 0) < 24
    ) {
      return `WebView Path mode prompt reported insufficient viewport right clearance (${payload.markers.topologyPathPromptViewportRightClearancePx ?? "missing"}px)`;
    }
    if (
      promptWidth > 680 ||
      (promptRight > 0 && Number(payload.width || 0) > 0 && promptRight > Number(payload.width) - 24)
    ) {
      return `WebView Path mode prompt exceeded its viewport contract (${promptWidth}px wide, right=${promptRight}px)`;
    }
  }
  if (
    webviewPath.includes("/topology") &&
    payload.markers.topologyPathResultBannerVisible === true
  ) {
    if (
      payload.markers.topologyPathResultBannerContract !==
      "panel-clear-viewport-contained"
    ) {
      return `WebView Path result banner contract was ${payload.markers.topologyPathResultBannerContract || "missing"}`;
    }
    if (payload.markers.topologyPathResultBannerLane !== "chrome-clear-path-lane") {
      return `WebView Path result banner lane was ${payload.markers.topologyPathResultBannerLane || "missing"}`;
    }
    if (payload.markers.topologyPathResultBannerAttentionLayer !== "focus-path-state") {
      return `WebView Path result banner attention layer was ${payload.markers.topologyPathResultBannerAttentionLayer || "missing"}`;
    }
    if (payload.markers.topologyPathResultBannerHandoffContract !== "agent-next-action-visible") {
      return `WebView Path result banner handoff contract was ${payload.markers.topologyPathResultBannerHandoffContract || "missing"}`;
    }
    if (payload.markers.topologyPathResultBannerOverflowContract !== "no-horizontal-scroll") {
      return `WebView Path result banner overflow contract was ${payload.markers.topologyPathResultBannerOverflowContract || "missing"}`;
    }
    const fixedSurfaceNames = Array.isArray(payload.markers.topologyFixedSurfaceNames)
      ? payload.markers.topologyFixedSurfaceNames
      : null;
    if (
      fixedSurfaceNames &&
      !fixedSurfaceNames.includes("topology-path-result-banner")
    ) {
      return `WebView did not register the Path result banner as a fixed topology surface (${JSON.stringify(fixedSurfaceNames)})`;
    }
    if (
      Object.prototype.hasOwnProperty.call(
        payload.markers,
        "topologyPathResultBannerClearanceContract",
      ) &&
      payload.markers.topologyPathResultBannerClearanceContract !==
        "analysis-rail-clear-96"
    ) {
      return `WebView Path result banner clearance contract was ${payload.markers.topologyPathResultBannerClearanceContract || "missing"}`;
    }
    const pathResultBannerClientWidth = Number(
      payload.markers.topologyPathResultBannerClientWidth || 0,
    );
    const pathResultBannerScrollWidth = Number(
      payload.markers.topologyPathResultBannerScrollWidth || 0,
    );
    if (
      pathResultBannerClientWidth < 260 ||
      pathResultBannerScrollWidth - pathResultBannerClientWidth > 2
    ) {
      return `WebView Path result banner overflowed (${pathResultBannerClientWidth} client / ${pathResultBannerScrollWidth} scroll)`;
    }
    const pathResultBannerTop = Number(
      payload.markers.topologyPathResultBannerTop || 0,
    );
    const pathResultBannerLeft = Number(
      payload.markers.topologyPathResultBannerLeft || 0,
    );
    const pathResultBannerRight = Number(
      payload.markers.topologyPathResultBannerRight || 0,
    );
    const analysisPanelRight = Number(payload.markers.topologyAnalysisPanelRight || 0);
    if (
      Object.prototype.hasOwnProperty.call(
        payload.markers,
        "topologyPathResultBannerPanelClearancePx",
      ) &&
      Number(payload.markers.topologyPathResultBannerPanelClearancePx || 0) < 96
    ) {
      return `WebView Path result banner reported insufficient analysis rail clearance (${payload.markers.topologyPathResultBannerPanelClearancePx ?? "missing"}px)`;
    }
    if (Number(payload.width || 0) >= 900 && pathResultBannerTop < 124) {
      return `WebView Path result banner competed with top chrome (${pathResultBannerTop}px top)`;
    }
    if (
      analysisPanelRight > 0 &&
      pathResultBannerLeft > 0 &&
      pathResultBannerLeft < analysisPanelRight + 24
    ) {
      return `WebView Path result banner overlapped the Relief analysis panel (${pathResultBannerLeft}px left vs ${analysisPanelRight}px panel right)`;
    }
    if (
      pathResultBannerRight > 0 &&
      Number(payload.width || 0) > 0 &&
      pathResultBannerRight > Number(payload.width) - 24
    ) {
      return `WebView Path result banner exceeded its viewport contract (right=${pathResultBannerRight}px)`;
    }
    if (payload.markers.topologyPathResultRouteChainOverflowContract !== "no-horizontal-scroll") {
      return `WebView Path result route chain overflow contract was ${payload.markers.topologyPathResultRouteChainOverflowContract || "missing"}`;
    }
    if (
      payload.markers.topologyPathResultRouteChainCompactContract !==
      "endpoint-badges-visible-relation-chips-truncated"
    ) {
      return `WebView Path result route chain compact contract was ${payload.markers.topologyPathResultRouteChainCompactContract || "missing"}`;
    }
    const pathResultRouteChainClientWidth = Number(
      payload.markers.topologyPathResultRouteChainClientWidth || 0,
    );
    const pathResultRouteChainScrollWidth = Number(
      payload.markers.topologyPathResultRouteChainScrollWidth || 0,
    );
    if (
      pathResultRouteChainClientWidth < 180 ||
      pathResultRouteChainScrollWidth - pathResultRouteChainClientWidth > 2
    ) {
      return `WebView Path result route chain overflowed (${pathResultRouteChainClientWidth} client / ${pathResultRouteChainScrollWidth} scroll)`;
    }
    if (payload.markers.topologyPathResultActionRailOverflowContract !== "no-horizontal-scroll") {
      return `WebView Path result action rail overflow contract was ${payload.markers.topologyPathResultActionRailOverflowContract || "missing"}`;
    }
    if (
      payload.markers.topologyPathResultActionRailHierarchy !==
      "primary-visible-secondary-disclosed"
    ) {
      return `WebView Path result action rail hierarchy was ${payload.markers.topologyPathResultActionRailHierarchy || "missing"}`;
    }
    if (
      payload.markers.topologyPathResultSecondaryChecksContract !==
      "secondary-checks-collapsed-by-default"
    ) {
      return `WebView Path result secondary checks contract was ${payload.markers.topologyPathResultSecondaryChecksContract || "missing"}`;
    }
    if (payload.markers.topologyPathResultSecondaryChecksOpen === true) {
      return "WebView Path result secondary checks were open by default";
    }
    const pathResultActionRailClientWidth = Number(
      payload.markers.topologyPathResultActionRailClientWidth || 0,
    );
    const pathResultActionRailScrollWidth = Number(
      payload.markers.topologyPathResultActionRailScrollWidth || 0,
    );
    if (
      pathResultActionRailClientWidth < 260 ||
      pathResultActionRailScrollWidth - pathResultActionRailClientWidth > 2
    ) {
      return `WebView Path result action rail overflowed (${pathResultActionRailClientWidth} client / ${pathResultActionRailScrollWidth} scroll)`;
    }
    const pathResultRestoreHopCount = Number(payload.markers.topologyPathRestoreHopCount || 0);
    const pathResultRelationChips = Array.isArray(payload.markers.topologyPathResultRelationChips)
      ? payload.markers.topologyPathResultRelationChips
      : [];
    if (
      pathResultRestoreHopCount > 0 &&
      pathResultRelationChips.length < pathResultRestoreHopCount
    ) {
      return `WebView Path result route chain rendered ${pathResultRelationChips.length} relation chips for ${pathResultRestoreHopCount} hops`;
    }
    for (const chip of pathResultRelationChips) {
      if (Number(chip?.width || 0) > 96) {
        return `WebView Path result relation chip exceeded compact width (${Number(chip?.width || 0)}px)`;
      }
    }
    const pathResultActions = Array.isArray(payload.markers.topologyPathResultActions)
      ? payload.markers.topologyPathResultActions
      : [];
    const pathResultActionKinds = new Set(pathResultActions.map((action) => action?.kind));
    for (const requiredKind of [
      "evidence",
      "find_path",
      "relation_check",
      "explain_relation",
      "all_paths_plan",
      "all_paths",
      "clear",
    ]) {
      if (!pathResultActionKinds.has(requiredKind)) {
        return `WebView Path result banner omitted ${requiredKind} action`;
      }
    }
    const primaryPathResultActions = pathResultActions.filter(
      (action) => action?.tier === "primary",
    );
    const secondaryPathResultActions = pathResultActions.filter(
      (action) => action?.tier === "secondary",
    );
    const visiblePrimaryActionKinds = new Set(
      primaryPathResultActions.filter((action) => action?.visible === true).map((action) => action?.kind),
    );
    const visibleSecondaryActionKinds = new Set(
      secondaryPathResultActions.filter((action) => action?.visible === true).map((action) => action?.kind),
    );
    for (const requiredKind of ["evidence", "find_path", "clear"]) {
      if (!visiblePrimaryActionKinds.has(requiredKind)) {
        return `WebView Path result primary action ${requiredKind} was not visible`;
      }
    }
    for (const requiredKind of [
      "relation_check",
      "explain_relation",
      "all_paths_plan",
      "all_paths",
    ]) {
      const action = pathResultActions.find((candidate) => candidate?.kind === requiredKind);
      if (action?.tier !== "secondary" || action?.disclosureOwner !== "secondary-checks") {
        return `WebView Path result secondary action ${requiredKind} was not in the compact checks disclosure`;
      }
      if (visibleSecondaryActionKinds.has(requiredKind)) {
        return `WebView Path result secondary action ${requiredKind} was visible by default`;
      }
    }
    const pathResultEndpoints = Array.isArray(payload.markers.topologyPathResultEndpoints)
      ? payload.markers.topologyPathResultEndpoints
      : [];
    const pathResultEndpointKinds = new Set(
      pathResultEndpoints.map((endpoint) => endpoint?.kind),
    );
    for (const requiredKind of ["source", "target"]) {
      if (!pathResultEndpointKinds.has(requiredKind)) {
        return `WebView Path result banner omitted ${requiredKind} endpoint marker`;
      }
    }
  }
  if (
    webviewPath.includes("/topology") &&
    webviewPath.startsWith("/ko/") &&
    payload.markers.topologyCommandChromeState !== "collapsed-active-relation"
  ) {
    if (!String(payload.markers.topologyTopRelayoutLabel || "").trim().includes("자동 정렬")) {
      return `WebView Korean Relief top relayout label was ${payload.markers.topologyTopRelayoutLabel || "missing"}`;
    }
    if (!String(payload.markers.topologyTopSearchLabel || "").trim().includes("검색")) {
      return `WebView Korean Relief top search label was ${payload.markers.topologyTopSearchLabel || "missing"}`;
    }
    if (!String(payload.markers.topologyTopWorkspaceLabel || "").trim().includes("작업공간")) {
      return `WebView Korean Relief top workspace label was ${payload.markers.topologyTopWorkspaceLabel || "missing"}`;
    }
    const createLabel = String(payload.markers.topologyTopCreateLabel || "").trim();
    if (createLabel && createLabel !== "개념") {
      return `WebView Korean Relief top create label was ${createLabel}`;
    }
  }
  if (webviewPath.includes("/topology") && requireTopologyCreateNode && payload.markers.topologyCreateNodeOpen !== true) {
    return "WebView did not open the Add Concept composer during verification";
  }
  if (webviewPath.includes("/topology") && payload.markers.topologyCreateNodeOpen === true) {
    if (payload.markers.topologyCreateNodePanelVisible !== true) {
      return "WebView Add Concept composer was open without a visible panel";
    }
    if (payload.markers.topologyAttentionWinner !== "blocking-composer") {
      return `WebView Add Concept attention winner was ${payload.markers.topologyAttentionWinner || "missing"}`;
    }
    if (
      payload.markers.topologyCreateNodePanelAttentionRole !== "blocking-composer" ||
      payload.markers.topologyCreateNodePanelPlacementContract !== "centered-blocking-edit"
    ) {
      return `WebView Add Concept composer attention contract was ${payload.markers.topologyCreateNodePanelAttentionRole || "missing"} / ${payload.markers.topologyCreateNodePanelPlacementContract || "missing"}`;
    }
    if (payload.markers.topologyCreateNodeSurfaceRole !== "blocking-edit-surface") {
      return `WebView Add Concept surface role was ${payload.markers.topologyCreateNodeSurfaceRole || "missing"}`;
    }
    if (payload.markers.topologyCreateNodeElevationContract !== "solid-panel-over-dimmed-map") {
      return `WebView Add Concept elevation contract was ${payload.markers.topologyCreateNodeElevationContract || "missing"}`;
    }
    if (payload.markers.topologyCreateNodeSizeContract !== "bounded-centered-composer") {
      return `WebView Add Concept size contract was ${payload.markers.topologyCreateNodeSizeContract || "missing"}`;
    }
    if (payload.markers.topologyCreateNodePanelTopToken !== "--topology-blocking-composer-top") {
      return `WebView Add Concept composer top token was ${payload.markers.topologyCreateNodePanelTopToken || "missing"}`;
    }
    if (payload.markers.topologyCreateNodePanelWidthToken !== "--topology-blocking-composer-width") {
      return `WebView Add Concept composer width token was ${payload.markers.topologyCreateNodePanelWidthToken || "missing"}`;
    }
    if (payload.markers.topologyCreateNodePanelMaxHeightToken !== "--topology-blocking-composer-max-height") {
      return `WebView Add Concept composer max-height token was ${payload.markers.topologyCreateNodePanelMaxHeightToken || "missing"}`;
    }
    if (payload.markers.topologyCreateNodeFormSurfaceToken !== "--topology-blocking-composer-surface") {
      return `WebView Add Concept composer surface token was ${payload.markers.topologyCreateNodeFormSurfaceToken || "missing"}`;
    }
    if (payload.markers.topologyCreateNodeFormBorderToken !== "--topology-blocking-composer-border") {
      return `WebView Add Concept composer border token was ${payload.markers.topologyCreateNodeFormBorderToken || "missing"}`;
    }
    if (payload.markers.topologyCreateNodeFormShadowToken !== "--topology-blocking-composer-shadow") {
      return `WebView Add Concept composer shadow token was ${payload.markers.topologyCreateNodeFormShadowToken || "missing"}`;
    }
    if (payload.markers.topologyCreateNodePanelRole !== "dialog") {
      return `WebView Add Concept composer role was ${payload.markers.topologyCreateNodePanelRole || "missing"}`;
    }
    if (String(payload.markers.topologyCreateNodePanelAriaModal || "") !== "true") {
      return `WebView Add Concept composer aria-modal was ${payload.markers.topologyCreateNodePanelAriaModal || "missing"}`;
    }
    if (
      !payload.markers.topologyCreateNodePanelLabelledBy ||
      payload.markers.topologyCreateNodePanelLabelledBy !== payload.markers.topologyCreateNodeHeadingId
    ) {
      return `WebView Add Concept composer was not labelled by its visible heading (${payload.markers.topologyCreateNodePanelLabelledBy || "missing"} / ${payload.markers.topologyCreateNodeHeadingId || "missing"})`;
    }
    if (payload.markers.topologyCreateNodeFocusInside !== true) {
      return `WebView Add Concept composer did not own keyboard focus (${payload.markers.topologyCreateNodeActiveElementTestId || "missing"})`;
    }
    if (payload.markers.topologyCreateNodeBackdropVisible !== true) {
      return "WebView Add Concept backdrop was missing while the composer was open";
    }
    if (payload.markers.topologyCreateNodeBackdropCoversViewport !== true) {
      return "WebView Add Concept backdrop did not cover the viewport";
    }
    if (payload.markers.topologyCreateNodeBackdropPointerEvents !== "auto") {
      return `WebView Add Concept backdrop did not intercept map interaction (${payload.markers.topologyCreateNodeBackdropPointerEvents || "missing"})`;
    }
    if (payload.markers.topologyCreateNodeBackdropContract !== "blocks-map-and-closes-composer") {
      return `WebView Add Concept backdrop contract was ${payload.markers.topologyCreateNodeBackdropContract || "missing"}`;
    }
    if (payload.markers.topologyCreateNodeBackdropSurfaceToken !== "--topology-blocking-backdrop-surface") {
      return `WebView Add Concept backdrop surface token was ${payload.markers.topologyCreateNodeBackdropSurfaceToken || "missing"}`;
    }
    if (payload.markers.topologyBlockingComposerOverlayContract !== "exclusive-blocking-composer") {
      return `WebView Add Concept composer did not own the only interactive overlay (${payload.markers.topologyBlockingComposerOverlayContract || "missing"} · ${JSON.stringify(payload.markers.topologyInteractiveOverlayNames ?? [])})`;
    }
    const backdropBackground = String(payload.markers.topologyCreateNodeBackdropBackground || "");
    const backdropAlpha = Number(
      backdropBackground.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/)?.[1] ||
      backdropBackground.match(/\/\s*([0-9.]+)\s*\)/)?.[1] ||
      "0",
    );
    if (!(backdropAlpha >= 0.6)) {
      return `WebView Add Concept backdrop dim was too weak (${backdropBackground || "missing"})`;
    }
    const backdropFilter = String(payload.markers.topologyCreateNodeBackdropFilter || "none");
    if (backdropFilter !== "none") {
      return `WebView Add Concept backdrop used a forbidden backdrop filter (${backdropFilter})`;
    }
    if (
      payload.markers.topologyMapSurfaceBlockingEdit !== true ||
      payload.markers.topologyMapSurfaceDemoted !== true
    ) {
      return "WebView Add Concept did not demote the topology map surface";
    }
    if (Number(payload.markers.topologyMapSurfaceDimOpacity || 1) > 0.35) {
      return `WebView Add Concept topology map surface dim was too weak (${payload.markers.topologyMapSurfaceDimOpacity ?? "missing"})`;
    }
    if (payload.markers.topologyMapSurfaceDimOpacityToken !== "--topology-blocking-map-opacity") {
      return `WebView Add Concept topology map opacity token was ${payload.markers.topologyMapSurfaceDimOpacityToken || "missing"}`;
    }
    if (payload.markers.topologyMapSurfaceFilterToken !== "--topology-blocking-map-filter") {
      return `WebView Add Concept topology map filter token was ${payload.markers.topologyMapSurfaceFilterToken || "missing"}`;
    }
    if (payload.markers.topologyMapSurfaceInteractionContract !== "suppressed-while-blocking-composer") {
      return `WebView Add Concept topology map interaction contract was ${payload.markers.topologyMapSurfaceInteractionContract || "missing"}`;
    }
    if (payload.markers.topologyMapSurfacePointerEvents !== "none") {
      return `WebView Add Concept topology map surface still accepted interaction (${payload.markers.topologyMapSurfacePointerEvents || "missing"})`;
    }
    if (Number(payload.markers.topologyTransientSurfaceCount || 0) > 0) {
      return `WebView Add Concept kept transient Relief surfaces open (${JSON.stringify(payload.markers.topologyTransientSurfaceNames ?? [])})`;
    }
    if (payload.markers.topologySelectedRelationClaimLensVisible === true) {
      return "WebView Add Concept kept the selected relation claim lens visible under the blocking composer";
    }
    if (payload.markers.topologySelectedRelationHaloVisible === true) {
      return "WebView Add Concept kept the selected relation halo visible under the blocking composer";
    }
    if (
      payload.markers.topologyNodePopoverVisible === true ||
      payload.markers.topologySelectedNodePopoverVisible === true
    ) {
      return "WebView Add Concept kept the selected node popover visible under the blocking composer";
    }
    if (payload.markers.topologyAnalysisPanelVisible === true) {
      return "WebView Add Concept kept the Relief support panel visible above the blocking composer";
    }
    if (
      Number(payload.markers.topologyCreateNodePanelTop || 0) < 110 ||
      Number(payload.markers.topologyCreateNodePanelBottom || 0) > Number(payload.height || 0) - 24 ||
      Number(payload.markers.topologyCreateNodePanelLeft || 0) < 0 ||
      Number(payload.markers.topologyCreateNodePanelRight || 0) > Number(payload.width || 0)
    ) {
      return `WebView Add Concept panel was out of bounds (${payload.markers.topologyCreateNodePanelLeft ?? "?"}, ${payload.markers.topologyCreateNodePanelTop ?? "?"}, ${payload.markers.topologyCreateNodePanelRight ?? "?"}, ${payload.markers.topologyCreateNodePanelBottom ?? "?"})`;
    }
    const composerWidth = Number(payload.markers.topologyCreateNodePanelWidth || 0);
    if (composerWidth < 320 || composerWidth > Math.min(600, Number(payload.width || 0) - 24)) {
      return `WebView Add Concept panel width was not compact (${composerWidth || "missing"})`;
    }
    if (Number(payload.markers.topologyCreateNodePanelHeight || 0) > Number(payload.height || 0) - 176) {
      return `WebView Add Concept panel height exceeded the blocking edit viewport budget (${payload.markers.topologyCreateNodePanelHeight ?? "missing"})`;
    }
    if (Number(payload.markers.topologyCreateNodePanelCenterOffset || 0) > 24) {
      return `WebView Add Concept panel was not centered (${payload.markers.topologyCreateNodePanelCenterOffset ?? "missing"})`;
    }
    if (webviewPath.startsWith("/ko/")) {
      const panelText = String(payload.markers.topologyCreateNodePanelText || "");
      const titlePlaceholder = String(payload.markers.topologyCreateNodeTitlePlaceholder || "");
      const domainPlaceholder = String(payload.markers.topologyCreateNodeDomainPlaceholder || "");
      const submitLabel = String(payload.markers.topologyCreateNodeSubmitLabel || "");
      const kindOptions = Array.isArray(payload.markers.topologyCreateNodeKindOptions)
        ? payload.markers.topologyCreateNodeKindOptions.map(String)
        : [];
      const localizedComposer =
        panelText.includes("개념 추가") &&
        panelText.includes("종류") &&
        titlePlaceholder === "개념 이름" &&
        domainPlaceholder.includes("도메인 slug") &&
        submitLabel.includes("만들기") &&
        ["도메인", "역량", "요소"].every((option) => kindOptions.includes(option));
      if (!localizedComposer) {
        return "WebView Korean Relief localized Add Concept composer markers were missing";
      }
    }
  }
  if (
    webviewPath.includes("/topology") &&
    topologySelectedParam &&
    webviewUrl.searchParams.get("mode") !== "path"
  ) {
    const selectedFocusNoopContextVisible =
      requireTopologyFocusNoop &&
      payload.markers.topologyCameraMotionTrigger === "selected-focus-already-safe" &&
      payload.markers.topologyCameraMotionState === "already-safe";
    if (
      payload.markers.topologySelectedNodePopoverVisible !== true &&
      !selectedRelationContextVisible &&
      !selectedFocusNoopContextVisible &&
      !blockingComposerOpen
    ) {
      return `WebView did not report a visible Relief selected node context for ${topologySelectedParam}`;
    }
    if (requireTopologyFocusNoop) {
      const focusNoopError = validateTopologyFocusNoopMarkers(payload);
      if (focusNoopError) return focusNoopError;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      selectedNodeId !== topologySelectedParam
    ) {
      return `WebView reported selected node ${selectedNodeId || "unknown"}, expected ${topologySelectedParam}`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      (!selectedNodeKind || !selectedNodeTitle || !selectedNodeSummary.includes(selectedNodeId))
    ) {
      return `WebView reported incomplete Relief selected node context (${selectedNodeSummary || "unknown"})`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      !selectedRelationContextVisible &&
      payload.markers.topologyAttentionWinner !== "focus-state"
    ) {
      return `WebView Relief selected node attention winner was ${payload.markers.topologyAttentionWinner || "missing"}`;
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologyAttentionWinner !== "active-relation-inspector"
    ) {
      return `WebView Relief selected relation attention winner was ${payload.markers.topologyAttentionWinner || "missing"}`;
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologyFocusClusterVisible === true
    ) {
      return "WebView Relief selected relation inspector competed with the focus cluster";
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologyAnalysisPanelVisible === true
    ) {
      return "WebView Relief selected relation inspector competed with the analysis panel";
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologyMinimapVisible === true
    ) {
      return "WebView Relief selected relation inspector competed with the minimap";
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologyKindLegendVisible === true
    ) {
      return "WebView Relief selected relation inspector competed with the kind legend";
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologyKindLegendState !== "collapsed-support-chrome"
    ) {
      return `WebView Relief selected relation kind legend state was ${payload.markers.topologyKindLegendState || "missing"}`;
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologyCommandChromeState !== "collapsed-active-relation"
    ) {
      return `WebView Relief selected relation command chrome state was ${payload.markers.topologyCommandChromeState || "missing"}`;
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologyTopLeftChromeGroupState !== "compact-active-relation"
    ) {
      return `WebView Relief selected relation workspace context state was ${payload.markers.topologyTopLeftChromeGroupState || "missing"}`;
    }
    if (
      selectedRelationContextVisible &&
      Number(payload.width || 0) >= 1400 &&
      Number(payload.markers.topologyTopLeftChromeGroupWidth || 0) > 210
    ) {
      return `WebView Relief selected relation workspace context stayed too wide (${payload.markers.topologyTopLeftChromeGroupWidth ?? 0}px)`;
    }
    if (
      selectedRelationContextVisible &&
      Number(payload.width || 0) >= 1400 &&
      Number(payload.markers.topologySelectedRelationLabelHitWidth || 0) > 160
    ) {
      return `WebView Relief selected relation label stayed too wide for the active inspector (${payload.markers.topologySelectedRelationLabelHitWidth ?? 0}px)`;
    }
    if (
      selectedRelationContextVisible &&
      payload.markers.topologySelectedRelationLabelDensity !== "focus-token"
    ) {
      return `WebView Relief selected relation label density was ${payload.markers.topologySelectedRelationLabelDensity || "missing"}`;
    }
    if (selectedRelationContextVisible && selectedRelationRouteRailTextLeak(payload)) {
      return "WebView Relief selected relation label leaked hidden route rail text into body text";
    }
    if (selectedRelationContextVisible && koreanTopologyRoute) {
      const visibleRelationLabels = [
        payload.markers.topologySelectedRelationCardTypeLabel,
        payload.markers.topologySelectedRelationLabelTypeLabel,
      ]
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean);
      if (visibleRelationLabels.length === 0) {
        return "WebView Relief selected relation did not expose localized relation type labels";
      }
      const rawRelationTypes = [
        payload.markers.topologySelectedRelationCardType,
        payload.markers.topologySelectedRelationLabelType,
        payload.markers.topologySelectedRelationCopyPayloadType,
      ]
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean);
      if (!rawRelationTypes.some((value) => rawRelationTypePattern.test(value))) {
        return "WebView Relief selected relation did not preserve the raw relation type for MCP/CLI handoff";
      }
      const rawVisibleRelationLabel = visibleRelationLabels.find((value) =>
        rawRelationTypePattern.test(value),
      );
      if (rawVisibleRelationLabel) {
        return `WebView Relief selected relation exposed raw relation type copy in Korean UI (${rawVisibleRelationLabel})`;
      }
      if (!visibleRelationLabels.some((value) => /포함|의존|연관|설명|사용|소속/.test(value))) {
        return `WebView Relief selected relation visible type labels were not Korean (${visibleRelationLabels.join(", ")})`;
      }
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyNodePopoverSurfaceRole !== "active-node-inspector"
    ) {
      return `WebView Relief selected node popover surface role was ${payload.markers.topologyNodePopoverSurfaceRole || "missing"}`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyNodePopoverAttentionRole !== "supporting-detail"
    ) {
      return `WebView Relief selected node popover attention role was ${payload.markers.topologyNodePopoverAttentionRole || "missing"}`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyNodePopoverFocusPrimary !== "linked-focus-cluster"
    ) {
      return `WebView Relief selected node popover primary focus was ${payload.markers.topologyNodePopoverFocusPrimary || "missing"}`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyNodePopoverHierarchyContract !== "click-focus-detail-support"
    ) {
      return `WebView Relief selected node popover hierarchy contract was ${payload.markers.topologyNodePopoverHierarchyContract || "missing"}`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyNodePopoverCollapsed === true
    ) {
      if (payload.markers.topologyNodePopoverSizePolicy !== "context-chip") {
        return `WebView Relief selected node popover used ${payload.markers.topologyNodePopoverSizePolicy || "no"} collapsed size policy during selected-node focus`;
      }
      if (payload.markers.topologyNodePopoverRelationRowVisible === true) {
        return "WebView Relief selected node popover exposed relation rows while collapsed";
      }
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyNodePopoverCollapsed !== true &&
      payload.markers.topologyNodePopoverSizePolicy !== "inspector-rail"
    ) {
      return `WebView Relief selected node popover used ${payload.markers.topologyNodePopoverSizePolicy || "no"} size policy during selected-node focus`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyNodePopoverCollapsed !== true &&
      payload.markers.topologyNodePopoverRelationRowVisible !== true
    ) {
      return "WebView Relief selected node popover did not expose a relation row during selected-node focus";
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyNodePopoverCollapsed !== true
    ) {
      if (
        payload.markers.topologyNodePopoverConnectionsOverflowContract !==
        "single-vertical-scroll-region"
      ) {
        return `WebView Relief selected node popover connections overflow contract was ${payload.markers.topologyNodePopoverConnectionsOverflowContract || "missing"}`;
      }
      if (
        payload.markers.topologyNodePopoverConnectionListOverflowContract !==
        "vertical-scroll-only"
      ) {
        return `WebView Relief selected node popover connection list overflow contract was ${payload.markers.topologyNodePopoverConnectionListOverflowContract || "missing"}`;
      }
      const nodePopoverFooterError = validateTopologyNodePopoverScrollFooterContract(
        payload.markers,
      );
      if (nodePopoverFooterError) {
        return nodePopoverFooterError;
      }
      const connectionListClientWidth = Number(
        payload.markers.topologyNodePopoverConnectionListClientWidth || 0,
      );
      const connectionListScrollWidth = Number(
        payload.markers.topologyNodePopoverConnectionListScrollWidth || 0,
      );
      if (
        !Number.isFinite(connectionListClientWidth) ||
        !Number.isFinite(connectionListScrollWidth) ||
        connectionListClientWidth < 180 ||
        connectionListScrollWidth - connectionListClientWidth > 2
      ) {
        return `WebView Relief selected node popover connection list overflowed (${connectionListClientWidth} client / ${connectionListScrollWidth} scroll)`;
      }
      if (
        payload.markers.topologyNodePopoverRelationRowOverflowContract !==
        "no-horizontal-scroll"
      ) {
        return `WebView Relief selected node popover relation row overflow contract was ${payload.markers.topologyNodePopoverRelationRowOverflowContract || "missing"}`;
      }
      if (
        payload.markers.topologyNodePopoverConnectionListRowDensityContract !==
        "agent-handoff-scan-list"
      ) {
        return `WebView Relief selected node popover connection list row density contract was ${payload.markers.topologyNodePopoverConnectionListRowDensityContract || "missing"}`;
      }
      if (
        payload.markers.topologyNodePopoverConnectionListReadableRowContract !==
        "at-least-one-full-relation-row"
      ) {
        return `WebView Relief selected node popover readable row contract was ${payload.markers.topologyNodePopoverConnectionListReadableRowContract || "missing"}`;
      }
      if (
        Number(payload.markers.topologyNodePopoverConnectionListRowMinHitHeight || 0) < 72
      ) {
        return `WebView Relief selected node popover connection list row hit height token was ${payload.markers.topologyNodePopoverConnectionListRowMinHitHeight ?? "missing"}`;
      }
      if (
        payload.markers.topologyNodePopoverConnectionListRowRenderContract !==
        "capped-preview-plus-remainder"
      ) {
        return `WebView Relief selected node popover connection list row render contract was ${payload.markers.topologyNodePopoverConnectionListRowRenderContract || "missing"}`;
      }
      const nodePopoverRowRenderBudget = Number(
        payload.markers.topologyNodePopoverConnectionListRowRenderBudget || 0,
      );
      const nodePopoverRenderedRows = Number(
        payload.markers.topologyNodePopoverConnectionListRenderedCount || 0,
      );
      const nodePopoverHiddenRows = Number(
        payload.markers.topologyNodePopoverConnectionListHiddenCount || 0,
      );
      const nodePopoverTotalRows = Number(
        payload.markers.topologyNodePopoverConnectionListTotalCount || 0,
      );
      if (
        !Number.isFinite(nodePopoverRowRenderBudget) ||
        nodePopoverRowRenderBudget < 1 ||
        nodePopoverRowRenderBudget > 2
      ) {
        return `WebView Relief selected node popover connection list row render budget was ${payload.markers.topologyNodePopoverConnectionListRowRenderBudget ?? "missing"}`;
      }
      if (
        !Number.isFinite(nodePopoverRenderedRows) ||
        nodePopoverRenderedRows < 1 ||
        nodePopoverRenderedRows > nodePopoverRowRenderBudget
      ) {
        return `WebView Relief selected node popover rendered too many relation rows (${payload.markers.topologyNodePopoverConnectionListRenderedCount ?? "missing"} rendered / ${payload.markers.topologyNodePopoverConnectionListRowRenderBudget ?? "missing"} budget)`;
      }
      if (
        Number.isFinite(nodePopoverTotalRows) &&
        nodePopoverTotalRows > nodePopoverRenderedRows &&
        !(Number.isFinite(nodePopoverHiddenRows) && nodePopoverHiddenRows > 0)
      ) {
        return `WebView Relief selected node popover hidden relation remainder was ${payload.markers.topologyNodePopoverConnectionListHiddenCount ?? "missing"} for ${nodePopoverTotalRows} total relation(s)`;
      }
      if (
        payload.markers.topologyNodePopoverRelationRowDensityContract !==
        "agent-handoff-scan-row"
      ) {
        return `WebView Relief selected node popover relation row density contract was ${payload.markers.topologyNodePopoverRelationRowDensityContract || "missing"}`;
      }
      if (
        Number(payload.markers.topologyNodePopoverRelationRowMinHitHeight || 0) < 72
      ) {
        return `WebView Relief selected node popover relation row hit height token was ${payload.markers.topologyNodePopoverRelationRowMinHitHeight ?? "missing"}`;
      }
      if (payload.markers.topologyNodePopoverRelationRowScanOrder !== "title>relation>direction>proof>handoff") {
        return `WebView Relief selected node popover relation row scan order was ${payload.markers.topologyNodePopoverRelationRowScanOrder || "missing"}`;
      }
      if (payload.markers.topologyNodePopoverRelationTitlePrimaryScanTarget !== "true") {
        return `WebView Relief selected node popover relation title primary scan target was ${payload.markers.topologyNodePopoverRelationTitlePrimaryScanTarget || "missing"}`;
      }
      if (payload.markers.topologyNodePopoverRelationHandoffLane !== "mcp-cli-next-action") {
        return `WebView Relief selected node popover relation row handoff lane was ${payload.markers.topologyNodePopoverRelationHandoffLane || "missing"}`;
      }
      if (Number(payload.markers.topologyNodePopoverRelationRowHeight || 0) < 68) {
        return `WebView Relief selected node popover relation row hit height was ${payload.markers.topologyNodePopoverRelationRowHeight ?? "missing"}px`;
      }
      const relationRowClientWidth = Number(
        payload.markers.topologyNodePopoverRelationRowClientWidth || 0,
      );
      const relationRowScrollWidth = Number(
        payload.markers.topologyNodePopoverRelationRowScrollWidth || 0,
      );
      if (
        !Number.isFinite(relationRowClientWidth) ||
        !Number.isFinite(relationRowScrollWidth) ||
        relationRowClientWidth < 180 ||
        relationRowScrollWidth - relationRowClientWidth > 2
      ) {
        return `WebView Relief selected node popover relation row overflowed (${relationRowClientWidth} client / ${relationRowScrollWidth} scroll)`;
      }
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyAnalysisPanelMode !== "focus"
    ) {
      return `WebView Relief selected node panel stayed in ${payload.markers.topologyAnalysisPanelMode || "unknown"} mode instead of focus support`;
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      (payload.markers.topologyAnalysisPanelSelectedContext === true ||
        payload.markers.topologyAnalysisPanelSelectedFocusRail === true)
    ) {
      if (payload.markers.topologyAnalysisPanelSelectedFocusRail !== true) {
        return "WebView Relief selected node panel did not report the selected focus rail marker";
      }
      if (payload.markers.topologyAnalysisPanelAttentionRole !== "support") {
        return `WebView Relief selected node panel attention role was ${payload.markers.topologyAnalysisPanelAttentionRole || "missing"}`;
      }
      if (payload.markers.topologyAnalysisPanelWidthContract !== "selected-focus-rail-max-320") {
        return `WebView Relief selected node panel width contract was ${payload.markers.topologyAnalysisPanelWidthContract || "missing"}`;
      }
      const selectedFocusRailMaxWidth = Number(payload.width || 0) <= 1600 ? 322 : 380;
      if (Number(payload.markers.topologyAnalysisPanelWidth || 0) > selectedFocusRailMaxWidth) {
        return `WebView Relief selected node panel was wider than the focus rail contract (${payload.markers.topologyAnalysisPanelWidth}px)`;
      }
    }
    if (payload.markers.topologySelectedNodePopoverVisible === true) {
      const viewportWidth = Number(payload.width || 0);
      const popoverLeft = Number(payload.markers.topologyNodePopoverLeft || 0);
      const analysisPanelRight = Number(payload.markers.topologyAnalysisPanelRight || 0);
      const measuredInspectorGap = popoverLeft - analysisPanelRight;
      const reportedInspectorGap = Number(
        payload.markers.topologyNodePopoverInspectorGap ?? measuredInspectorGap,
      );
      const canMeasureInspectorGap =
        viewportWidth >= 1400 &&
        payload.markers.topologyAnalysisPanelVisible === true &&
        Number.isFinite(popoverLeft) &&
        popoverLeft > 0 &&
        Number.isFinite(analysisPanelRight) &&
        analysisPanelRight > 0;
      if (
        canMeasureInspectorGap &&
        payload.markers.topologyNodePopoverAttentionLaneContract !==
          "right-inspector-separated-from-support-rail"
      ) {
        return `WebView Relief selected node inspector attention lane contract was ${payload.markers.topologyNodePopoverAttentionLaneContract || "missing"}`;
      }
      if (
        canMeasureInspectorGap &&
        Math.abs(reportedInspectorGap - measuredInspectorGap) > 1
      ) {
        return `WebView Relief selected node inspector attention gap marker mismatched geometry (${reportedInspectorGap}px marker vs ${measuredInspectorGap}px measured)`;
      }
      if (canMeasureInspectorGap && reportedInspectorGap < 96) {
        return `WebView Relief selected node inspector attention gap was ${reportedInspectorGap}px`;
      }
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologySkeletonMode === true &&
      selectedNodeKind !== "element"
    ) {
      const viewportWidth = Number(payload.width || 0);
      const viewportHeight = Number(payload.height || 0);
      const focusClusterSize = Number(payload.markers.topologyFocusClusterSize || 0);
      const bodyText = String(payload.bodyText || "");
      const bodyFocusClusterVisible =
        focusClusterSize >= 2 && /linked\s+focus/i.test(bodyText);
      const bodyFocusRelationVisible =
        bodyFocusClusterVisible &&
        /(contains|depends|relates|uses|belongs|describes|CONTAINS|DEPENDS|RELATES|USES|BELONGS|DESCRIBES)/.test(
          bodyText,
        );
      if (
        payload.markers.topologyFocusClusterMode !== "focus" &&
        !bodyFocusClusterVisible
      ) {
        return `WebView Relief selected node focus cluster mode was ${payload.markers.topologyFocusClusterMode || "missing"}`;
      }
      if (
        payload.markers.topologyFocusClusterVisible !== true &&
        !bodyFocusClusterVisible
      ) {
        return "WebView Relief selected node focus cluster was not visible";
      }
      if (
        payload.markers.topologyFocusClusterMode === "focus" &&
        payload.markers.topologyFocusClusterStage !== "click-focus"
      ) {
        return `WebView Relief selected node focus cluster stage was ${payload.markers.topologyFocusClusterStage || "missing"}`;
      }
      if (
        payload.markers.topologyFocusClusterAttentionLabel !== "linked-focus"
      ) {
        return `WebView Relief selected node focus cluster attention label was ${payload.markers.topologyFocusClusterAttentionLabel || "missing"}`;
      }
      if (payload.markers.topologyClickFocusRelationshipContext !== "durable") {
        return `WebView Relief selected node click focus relationship context was ${payload.markers.topologyClickFocusRelationshipContext || "missing"}`;
      }
      if (
        !/^(selected-dock-companions|focus-cluster)$/.test(
          String(payload.markers.topologyClickFocusRelationshipContextSource || ""),
        )
      ) {
        return `WebView Relief selected node click focus relationship context source was ${payload.markers.topologyClickFocusRelationshipContextSource || "missing"}`;
      }
      const cameraMotionTrigger = String(
        payload.markers.topologyCameraMotionTrigger || "",
      );
      const cameraMotionNoop = cameraMotionTrigger === "selected-focus-already-safe";
      if (
        !["selected-focus-safe-fit", "selected-focus-already-safe"].includes(
          cameraMotionTrigger,
        )
      ) {
        return `WebView Relief selected node camera motion trigger was ${payload.markers.topologyCameraMotionTrigger || "missing"}`;
      }
      if (
        payload.markers.topologyCameraMotionContract !==
        "purposeful-safe-fit-motion"
      ) {
        return `WebView Relief selected node camera motion contract was ${payload.markers.topologyCameraMotionContract || "missing"}`;
      }
      if (payload.markers.topologyCameraMotionEasing !== "ease-out-quart") {
        return `WebView Relief selected node camera motion easing was ${payload.markers.topologyCameraMotionEasing || "missing"}`;
      }
      const cameraMotionDuration = Number(
        payload.markers.topologyCameraMotionDurationMs || 0,
      );
      if (cameraMotionNoop && cameraMotionDuration !== 0) {
        return `WebView Relief selected node no-op camera duration was ${cameraMotionDuration}ms`;
      }
      if (
        !cameraMotionNoop &&
        payload.markers.topologyCameraMotionReduced === true &&
        cameraMotionDuration !== 0
      ) {
        return `WebView Relief selected node reduced-motion camera duration was ${cameraMotionDuration}ms`;
      }
      if (
        !cameraMotionNoop &&
        payload.markers.topologyCameraMotionReduced !== true &&
        cameraMotionDuration !== 420
      ) {
        return `WebView Relief selected node camera motion duration was ${cameraMotionDuration || "missing"}ms`;
      }
      if (
        !["settled", "animating", "reduced-motion", "already-safe"].includes(
          String(payload.markers.topologyCameraMotionState || ""),
        )
      ) {
        return `WebView Relief selected node camera motion state was ${payload.markers.topologyCameraMotionState || "missing"}`;
      }
      if (
        cameraMotionNoop &&
        payload.markers.topologyCameraMotionState !== "already-safe"
      ) {
        return `WebView Relief selected node no-op camera state was ${payload.markers.topologyCameraMotionState || "missing"}`;
      }
      if (payload.markers.topologyCameraMotionIntent !== "selected-focus-safe-rect") {
        return `WebView Relief selected node camera motion intent was ${payload.markers.topologyCameraMotionIntent || "missing"}`;
      }
      const expectedCameraMotionTargetPolicy = cameraMotionNoop
        ? "already-inside-safe-rect"
        : "viewport-center";
      if (payload.markers.topologyCameraMotionTargetPolicy !== expectedCameraMotionTargetPolicy) {
        return `WebView Relief selected node camera motion target policy was ${payload.markers.topologyCameraMotionTargetPolicy || "missing"}`;
      }
      const expectedCameraMotionDistancePolicy = cameraMotionNoop
        ? "already-safe-no-motion"
        : "bounded-safe-fit-distance";
      if (
        payload.markers.topologyCameraMotionDistancePolicy !==
        expectedCameraMotionDistancePolicy
      ) {
        return `WebView Relief selected node camera motion distance policy was ${payload.markers.topologyCameraMotionDistancePolicy || "missing"}`;
      }
      const cameraMotionSelectedViewportX = Number(
        payload.markers.topologyCameraMotionSelectedViewportX || 0,
      );
      const cameraMotionSelectedViewportY = Number(
        payload.markers.topologyCameraMotionSelectedViewportY || 0,
      );
      const cameraMotionSafeTargetX = Number(
        payload.markers.topologyCameraMotionSafeTargetX || 0,
      );
      const cameraMotionSafeTargetY = Number(
        payload.markers.topologyCameraMotionSafeTargetY || 0,
      );
      if (
        [
          cameraMotionSelectedViewportX,
          cameraMotionSelectedViewportY,
          cameraMotionSafeTargetX,
          cameraMotionSafeTargetY,
        ].some((value) => !Number.isFinite(value) || value <= 0)
      ) {
        return "WebView Relief selected node camera motion coordinate proof was incomplete";
      }
      const cameraMotionDistancePx = Number(
        payload.markers.topologyCameraMotionDistancePx || 0,
      );
      if (
        cameraMotionNoop
          ? cameraMotionDistancePx !== 0
          : !Number.isFinite(cameraMotionDistancePx) || cameraMotionDistancePx < 1
      ) {
        return `WebView Relief selected node camera motion distance was ${payload.markers.topologyCameraMotionDistancePx || "missing"}px`;
      }
      const measuredCameraMotionDistance = Math.round(
        Math.hypot(
          cameraMotionSafeTargetX - cameraMotionSelectedViewportX,
          cameraMotionSafeTargetY - cameraMotionSelectedViewportY,
        ),
      );
      if (Math.abs(measuredCameraMotionDistance - cameraMotionDistancePx) > 2) {
        return `WebView Relief selected node camera motion distance mismatched the coordinate proof (${cameraMotionDistancePx}px marker vs ${measuredCameraMotionDistance}px measured)`;
      }
      const selectedFanoutRows = Number(
        payload.markers.topologyCameraMotionSelectedFanoutRows || 0,
      );
      const cameraMotionMaxDistancePx =
        220 + Math.max(0, selectedFanoutRows - 2) * 16;
      if (
        Number(payload.markers.topologyCameraMotionMaxDistancePx || 0) !==
        cameraMotionMaxDistancePx
      ) {
        return `WebView Relief selected node camera motion max distance marker was ${payload.markers.topologyCameraMotionMaxDistancePx || "missing"}px`;
      }
      if (cameraMotionDistancePx > cameraMotionMaxDistancePx) {
        return `WebView Relief selected node camera motion was excessive (${cameraMotionDistancePx}px > ${cameraMotionMaxDistancePx}px)`;
      }
      if (payload.markers.topologyCameraMotionTargetInsideSafeRect !== true) {
        return "WebView Relief selected node camera motion safe target was not confirmed";
      }
      const cameraSafeInsets = [
        payload.markers.topologyCameraMotionSafeInsetTop,
        payload.markers.topologyCameraMotionSafeInsetRight,
        payload.markers.topologyCameraMotionSafeInsetBottom,
        payload.markers.topologyCameraMotionSafeInsetLeft,
      ].map((value) => Number(value || 0));
      if (
        cameraSafeInsets.some((value) => !Number.isFinite(value) || value <= 0) ||
        selectedFanoutRows < 1
      ) {
        return "WebView Relief selected node camera motion safe rect proof was incomplete";
      }
      const [safeInsetTop, safeInsetRight, safeInsetBottom, safeInsetLeft] = cameraSafeInsets;
      const safeRight = viewportWidth - safeInsetRight;
      const safeBottom = viewportHeight - safeInsetBottom;
      if (
        cameraMotionSafeTargetX < safeInsetLeft - 1 ||
        cameraMotionSafeTargetX > safeRight + 1 ||
        cameraMotionSafeTargetY < safeInsetTop - 1 ||
        cameraMotionSafeTargetY > safeBottom + 1
      ) {
        return `WebView Relief selected node camera motion target was outside the computed safe rect (${cameraMotionSafeTargetX}, ${cameraMotionSafeTargetY} vs left ${safeInsetLeft}, top ${safeInsetTop}, right ${safeRight}, bottom ${safeBottom})`;
      }
      const shouldValidateRightReserve =
        requireTopologyNodePopover ||
        String(payload.markers.topologyCameraMotionRightReserveContract || "")
          .length > 0 ||
        payload.markers.topologyCameraMotionSafeTargetRightClearance !== undefined;
      if (shouldValidateRightReserve) {
        if (
          payload.markers.topologyCameraMotionRightReserveContract !==
          "selected-inspector-safe-reserve"
        ) {
          return `WebView Relief selected node camera right reserve contract was ${payload.markers.topologyCameraMotionRightReserveContract || "missing"}`;
        }
        const reportedSafeTargetRightClearance = Number(
          payload.markers.topologyCameraMotionSafeTargetRightClearance ?? 0,
        );
        const measuredSafeTargetRightClearance = Math.round(
          safeRight - cameraMotionSafeTargetX,
        );
        if (
          !Number.isFinite(reportedSafeTargetRightClearance) ||
          reportedSafeTargetRightClearance < 0 ||
          Math.abs(
            reportedSafeTargetRightClearance - measuredSafeTargetRightClearance,
          ) > 2
        ) {
          return `WebView Relief selected node camera safe target right clearance mismatched (${reportedSafeTargetRightClearance || "missing"}px marker vs ${measuredSafeTargetRightClearance}px measured)`;
        }
      }
      if (requireTopologyFocusNoop) {
        const focusNoopError = validateTopologyFocusNoopMarkers(payload);
        if (focusNoopError) return focusNoopError;
      }
      if (!(focusClusterSize >= 2)) {
        return `WebView Relief selected node focus cluster was too small (${payload.markers.topologyFocusClusterSize ?? "missing"})`;
      }
      if (
        !(Number(payload.markers.topologyFocusClusterConnectorCount) >= 1) &&
        !bodyFocusRelationVisible
      ) {
        return "WebView Relief selected node focus cluster did not expose linked relation connectors";
      }
      if (
        !(Number(payload.markers.topologyFocusClusterRelationLabelCount) >= 1) &&
        !bodyFocusRelationVisible
      ) {
        return "WebView Relief selected node focus cluster did not expose linked relation labels";
      }
      const focusClusterWidth = Number(payload.markers.topologyFocusClusterWidth || 0);
      const focusClusterHeight = Number(payload.markers.topologyFocusClusterHeight || 0);
      const focusClusterLeft = Number(payload.markers.topologyFocusClusterLeft || 0);
      const focusClusterTop = Number(payload.markers.topologyFocusClusterTop || 0);
      const focusClusterRight = Number(payload.markers.topologyFocusClusterRight || 0);
      const focusClusterBottom = Number(payload.markers.topologyFocusClusterBottom || 0);
      const canMeasureFocusGeometry =
        viewportWidth >= 1400 &&
        viewportHeight >= 800 &&
        [focusClusterWidth, focusClusterHeight, focusClusterLeft, focusClusterTop, focusClusterRight, focusClusterBottom].every(Number.isFinite);
      if (
        canMeasureFocusGeometry &&
        (
          focusClusterWidth < 320 ||
          focusClusterHeight < 120 ||
          focusClusterLeft < 0 ||
          focusClusterTop < 72 ||
          focusClusterRight > viewportWidth ||
          focusClusterBottom > viewportHeight
        )
      ) {
        return `WebView Relief selected node focus cluster geometry was out of contract (${focusClusterLeft}, ${focusClusterTop}, ${focusClusterRight}, ${focusClusterBottom}; ${focusClusterWidth}x${focusClusterHeight})`;
      }
      const focusClusterCenterY = (focusClusterTop + focusClusterBottom) / 2;
      if (
        canMeasureFocusGeometry &&
        focusClusterCenterY > viewportHeight * 0.6
      ) {
        return `WebView Relief selected node focus cluster was below the click-focus reading band (${focusClusterCenterY}px center vs ${viewportHeight}px viewport)`;
      }
      const panelLeft = Number(payload.markers.topologyAnalysisPanelLeft || 0);
      const panelTop = Number(payload.markers.topologyAnalysisPanelTop || 0);
      const panelRight = Number(payload.markers.topologyAnalysisPanelRight || 0);
      const panelBottom = Number(payload.markers.topologyAnalysisPanelBottom || 0);
      const canMeasurePanelCollision =
        canMeasureFocusGeometry &&
        [panelLeft, panelTop, panelRight, panelBottom].every(Number.isFinite) &&
        panelRight > panelLeft &&
        panelBottom > panelTop;
      const collisionPad = 8;
      const overlapsPanel =
        focusClusterLeft < panelRight + collisionPad &&
        focusClusterRight > panelLeft - collisionPad &&
        focusClusterTop < panelBottom + collisionPad &&
        focusClusterBottom > panelTop - collisionPad;
      if (canMeasurePanelCollision && overlapsPanel) {
        return `WebView Relief selected node focus cluster overlapped the analysis panel (${focusClusterLeft}, ${focusClusterTop}, ${focusClusterRight}, ${focusClusterBottom} vs ${panelLeft}, ${panelTop}, ${panelRight}, ${panelBottom})`;
      }
      if (payload.markers.topologyFocusClusterVisible === true) {
        if (
          payload.markers.topologyFocusClusterBreathingRoomContract !==
          "viewport-edge-clearance"
        ) {
          return `WebView Relief selected node focus cluster breathing-room contract was ${payload.markers.topologyFocusClusterBreathingRoomContract || "missing"}`;
        }
        const focusClusterBreathingRoom = Number(
          payload.markers.topologyFocusClusterBreathingRoomPx || 0,
        );
        const focusClusterRightClearance = Number(
          payload.markers.topologyFocusClusterRightClearance || 0,
        );
        const focusClusterBottomClearance = Number(
          payload.markers.topologyFocusClusterBottomClearance || 0,
        );
        if (
          focusClusterBreathingRoom < 12 ||
          focusClusterRightClearance < focusClusterBreathingRoom ||
          focusClusterBottomClearance < focusClusterBreathingRoom
        ) {
          return `WebView Relief selected node focus cluster hugged the viewport edge (${focusClusterRightClearance || "missing"}px right / ${focusClusterBottomClearance || "missing"}px bottom / ${focusClusterBreathingRoom || "missing"}px required)`;
        }
      }
    }
    if (
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyAnalysisPanelSelectedFocusRail === true
    ) {
      const nodePopoverTokenError =
        validateTopologyNodePopoverTokenContract(payload.markers);
      if (nodePopoverTokenError) return nodePopoverTokenError;
      const selectedCardRelationSummaryError =
        validateTopologySelectedCardRelationSummaryContract(payload.markers);
      if (selectedCardRelationSummaryError) return selectedCardRelationSummaryError;
      const commandSpineError =
        validateTopologyFocusCommandSpineContract(payload.markers);
      if (commandSpineError) return commandSpineError;
      const utilityLaneError =
        validateTopologyFocusUtilityLaneContract(payload.markers);
      if (utilityLaneError) return utilityLaneError;
      const searchLaneError =
        validateTopologyFocusSearchLaneContract(payload.markers);
      if (searchLaneError) return searchLaneError;
      const rightControlsError =
        validateTopologyFocusRightControlsContract(payload.markers);
      if (rightControlsError) return rightControlsError;
    }
    if (requireTopologyNodePopover) {
      if (payload.markers.topologyNodePopoverVerifyAttempted !== true) {
        return "WebView did not attempt selected node popover verification";
      }
      if (payload.markers.topologyNodePopoverVerifyExpanded !== true) {
        return `WebView did not finish selected node popover expansion (${payload.markers.topologyNodePopoverVerifyReason || "unknown reason"})`;
      }
      if (payload.markers.topologySelectedNodePopoverVisible !== true) {
        return "WebView did not expose the selected node popover during node popover verification";
      }
      if (payload.markers.topologyNodePopoverVisible !== true) {
        return "WebView did not measure the selected node popover during node popover verification";
      }
      if (payload.markers.topologyNodePopoverCollapsed === true) {
        return "WebView did not expand the selected node popover during node popover verification";
      }
      if (payload.markers.topologyNodePopoverRelationRowVisible !== true) {
        return "WebView selected node popover did not expose a relation row during node popover verification";
      }
      const nodePopoverTokenError =
        validateTopologyNodePopoverTokenContract(payload.markers);
      if (nodePopoverTokenError) return nodePopoverTokenError;
      const nodePopoverFooterError = validateTopologyNodePopoverScrollFooterContract(
        payload.markers,
      );
      if (nodePopoverFooterError) return nodePopoverFooterError;
    }
  }
  if (webviewPath.includes("/topology")) {
    const topologyDragDone =
      requireTopologyDrag &&
      payload.markers.topologyDragAttempted === true &&
      payload.markers.topologyDragReason === "done";
    if (payload.markers.topologySigmaViewportVisible === false) {
      return "WebView did not report a visible Sigma topology viewport";
    }
    if (payload.markers.topologySigmaBootError === true) {
      return "WebView reported a Sigma topology boot error";
    }
    if (payload.markers.topologySigmaReady === false) {
      return "WebView reported Relief before the Sigma renderer was ready";
    }
    if (!(Number(payload.markers.topologyStagePanClickCancelPx) >= 12)) {
      return `WebView reported an over-sensitive Relief stage pan threshold (${payload.markers.topologyStagePanClickCancelPx ?? "missing"}px)`;
    }
    if (
      payload.markers.topologySigmaReady === true &&
      payload.markers.topologyEngineLoadingVisible === true
    ) {
      return "WebView reported a visible Relief engine loading indicator after Sigma was ready";
    }
    if (
      Number.isFinite(payload.markers.topologySigmaCanvasCount) &&
      payload.markers.topologySigmaCanvasCount < 1
    ) {
      return `WebView reported no Sigma canvas (${payload.markers.topologySigmaCanvasCount ?? "unknown"} canvas element(s))`;
    }
    if (payload.markers.topologySkeletonMode === false) {
      return "WebView reported Relief without topology skeleton mode";
    }
    if (payload.markers.topologySkeletonCardsActive === false) {
      return `WebView reported Relief without active skeleton cards (${payload.markers.topologySkeletonCardModelCount ?? "unknown"} card model(s))`;
    }
    if (payload.markers.topologySkeletonLayerPresent === false) {
      return `WebView reported active skeleton cards but no skeleton layer (${payload.markers.topologySkeletonCardModelCount ?? "unknown"} card model(s))`;
    }
    if (
      Number.isFinite(payload.markers.topologySkeletonLayerModelCount) &&
      Number.isFinite(payload.markers.topologySkeletonLayerResolvedCount) &&
      payload.markers.topologySkeletonLayerModelCount > 0 &&
      payload.markers.topologySkeletonLayerResolvedCount < 1
    ) {
      return `WebView reported no resolvable Relief cards (${payload.markers.topologySkeletonLayerResolvedCount}/${payload.markers.topologySkeletonLayerModelCount})`;
    }
    if (
      Number(payload.width) >= 1400 &&
      !(Number(payload.markers.topologyUiScale) >= 1.12)
    ) {
      return `WebView Relief UI scale was ${payload.markers.topologyUiScale ?? "missing"} at ${payload.width}px viewport`;
    }
    if (!topologyDragDone && payload.markers.topologyCardsReady !== true) {
      return "WebView reported Relief cards before the skeleton overlay was ready";
    }
    const selectedFocusContext =
      payload.markers.topologySelectedNodePopoverVisible === true &&
      payload.markers.topologyFocusClusterVisible === true &&
      Number(payload.markers.topologyFocusClusterSize) >= 2;
    const hasDimOpacityProof =
      payload.markers.topologyDimOpacityContract !== undefined ||
      payload.markers.topologyDimAnchorOpacity !== undefined ||
      payload.markers.topologyDimChipOpacity !== undefined ||
      Array.isArray(payload.markers.topologyCardRawSample);
    if (selectedFocusContext && hasDimOpacityProof) {
      const dimAnchorOpacity = Number(payload.markers.topologyDimAnchorOpacity || 0);
      const dimChipOpacity = Number(payload.markers.topologyDimChipOpacity || 0);
      const dimAnchorVisibleCount = Number(payload.markers.topologyDimAnchorVisibleCount || 0);
      const dimChipVisibleCount = Number(payload.markers.topologyDimChipVisibleCount || 0);
      const dimAnchorMinOpacity = Number(payload.markers.topologyDimAnchorMinOpacity || 0);
      const dimChipMinOpacity = Number(payload.markers.topologyDimChipMinOpacity || 0);
      if (payload.markers.topologyDimOpacityContract !== "readable-context-geography") {
        return `WebView dimmed Relief context opacity contract was ${payload.markers.topologyDimOpacityContract || "missing"}`;
      }
      if (!(dimAnchorOpacity >= 0.34)) {
        return `WebView dimmed Relief anchor opacity token was ${payload.markers.topologyDimAnchorOpacity ?? "missing"}`;
      }
      if (!(dimChipOpacity >= 0.18)) {
        return `WebView dimmed Relief chip opacity token was ${payload.markers.topologyDimChipOpacity ?? "missing"}`;
      }
      if (dimAnchorVisibleCount > 0 && !(dimAnchorMinOpacity >= 0.34)) {
        return `WebView dimmed Relief anchor opacity was ${payload.markers.topologyDimAnchorMinOpacity ?? "missing"}`;
      }
      if (dimChipVisibleCount > 0 && !(dimChipMinOpacity >= 0.18)) {
        return `WebView dimmed Relief chip opacity was ${payload.markers.topologyDimChipMinOpacity ?? "missing"}`;
      }
    }
    const minimumTopologyCardCount = topologyDragDone ? 1 : selectedFocusContext ? 2 : 8;
    if (
      !Number.isFinite(payload.markers.topologyCardCount) ||
      payload.markers.topologyCardCount < minimumTopologyCardCount
    ) {
      return `WebView reported too few visible Relief cards (${payload.markers.topologyCardCount ?? "unknown"} visible, ${payload.markers.topologyCardRawCount ?? "unknown"} raw)`;
    }
    if (requireTopologyDrag && !topologyDragDone) {
      return `WebView did not attempt the Relief card drag verification (${payload.markers.topologyDragReason ?? "unknown reason"})`;
    }
    if (
      requireTopologyDrag &&
      !(Number(payload.markers.topologySelectedDockCompanionCount) >= 1)
    ) {
      return `WebView did not report selected Relief fan-out companions (${payload.markers.topologySelectedDockCompanionCount ?? "missing"} companion(s))`;
    }
    const hasVisibleSelectedFanOut =
      Number(payload.markers.topologySelectedDockVisibleCompanionCount) >= 1 ||
      Number(payload.markers.topologyDragVisibleCompanionCount) >= 1;
    if (
      requireTopologyDrag &&
      !hasVisibleSelectedFanOut
    ) {
      return `WebView did not report a visible selected Relief fan-out companion (${payload.markers.topologySelectedDockVisibleCompanionCount ?? "missing"} current, ${payload.markers.topologyDragVisibleCompanionCount ?? "missing"} captured)`;
    }
    if (
      requireTopologyDrag &&
      payload.markers.topologySelectedDockCompanionVisible !== true &&
      payload.markers.topologyDragCompanionVisible !== true
    ) {
      return "WebView reported selected Relief fan-out companions as hidden";
    }
    if (payload.markers.topologyCardOverlapCount !== 0) {
      return `WebView reported overlapping Relief cards (${payload.markers.topologyCardOverlapCount ?? "unknown"} overlap pair(s))`;
    }
    if (payload.markers.topologyCardClippedCount !== 0) {
      return `WebView reported clipped Relief cards (${payload.markers.topologyCardClippedCount ?? "unknown"} clipped card(s))`;
    }
    if (payload.markers.topologyCardFixedSurfaceOverlapCount !== 0) {
      return `WebView reported Relief cards overlapping fixed topology surfaces (${payload.markers.topologyCardFixedSurfaceOverlapCount ?? "unknown"} overlap(s))`;
    }
    if (payload.markers.topologyFixedSurfaceOverlapCount !== 0) {
      return `WebView reported overlapping Relief fixed surfaces (${payload.markers.topologyFixedSurfaceOverlapCount ?? "unknown"} overlap(s))`;
    }
    const fixedSurfaceNames = Array.isArray(payload.markers.topologyFixedSurfaceNames)
      ? payload.markers.topologyFixedSurfaceNames
      : null;
    if (
      selectedRelationContextVisible &&
      fixedSurfaceNames &&
      !fixedSurfaceNames.includes("sigma-selected-edge-card")
    ) {
      return `WebView did not register the selected relation card as a fixed topology surface (${JSON.stringify(fixedSurfaceNames)})`;
    }
    const transientContract = String(
      payload.markers.topologyTransientSurfaceContract || "",
    );
    if (
      payload.markers.topologyCreateNodeOpen === true &&
      Number(payload.markers.topologyTransientSurfaceCount || 0) > 0
    ) {
      return `WebView kept transient Relief surfaces open above the blocking composer (${JSON.stringify(payload.markers.topologyTransientSurfaceNames ?? [])})`;
    }
    if (
      transientContract &&
      !["single-transient", "path-prompt-group", "blocking-surface-wins"].includes(
        transientContract,
      )
    ) {
      return `WebView reported a stacked Relief transient surface contract (${transientContract}: ${JSON.stringify(payload.markers.topologyTransientSurfaceNames ?? [])})`;
    }
    if (
      Number(payload.width) >= 1400 &&
      payload.markers.topologyCreateNodeOpen !== true &&
      !selectedRelationContextVisible &&
      !focusSelectedNodeRoute &&
      webviewUrl.searchParams.get("mode") !== "path"
    ) {
      if (payload.markers.topologyMinimapVisible !== true) {
        return `WebView did not report the Relief minimap at ${payload.width}px viewport`;
      }
      if (
        Number(payload.markers.topologyMinimapWidth) < 220 ||
        Number(payload.markers.topologyMinimapHeight) < 170
      ) {
        return `WebView reported a cramped Relief minimap (${payload.markers.topologyMinimapWidth ?? "unknown"}x${payload.markers.topologyMinimapHeight ?? "unknown"})`;
      }
      if (
        Number(payload.markers.topologyMinimapRight) < 12 ||
        Number(payload.markers.topologyMinimapBottom) < 12
      ) {
        return `WebView reported Relief minimap without viewport-safe inset (right=${payload.markers.topologyMinimapRight ?? "unknown"}, bottom=${payload.markers.topologyMinimapBottom ?? "unknown"})`;
      }
      if (payload.markers.topologyMinimapViewportVisible !== true) {
        return "WebView did not report a visible Relief minimap viewport frame";
      }
      if (
        payload.markers.topologyMinimapViewportFrameState !== "readable" ||
        Number(payload.markers.topologyMinimapViewportWidth) < 24 ||
        Number(payload.markers.topologyMinimapViewportHeight) < 20
      ) {
        return `WebView reported a thin Relief minimap viewport frame (${payload.markers.topologyMinimapViewportFrameState || "unknown"}, ${payload.markers.topologyMinimapViewportWidth ?? "unknown"}x${payload.markers.topologyMinimapViewportHeight ?? "unknown"})`;
      }
    }
    if (
      payload.markers.topologyRelationLensVisible === true &&
      payload.markers.topologyRelationLensPluralMismatch === true
    ) {
      return `WebView reported malformed Relief relation lens copy (${payload.markers.topologyRelationLensText ?? "unknown text"})`;
    }
    const overviewRelationQualityText =
      typeof payload.markers.topologyOverviewRelationQualityText === "string"
        ? payload.markers.topologyOverviewRelationQualityText.trim()
        : "";
    const selectedRelationQualityText =
      typeof payload.markers.topologySelectedRelationQualityLensText === "string"
        ? payload.markers.topologySelectedRelationQualityLensText.trim()
        : "";
    const legacyRelationQualityText =
      typeof payload.markers.topologyRelationQualityLensText === "string"
        ? payload.markers.topologyRelationQualityLensText.trim()
        : "";
    const relationQualityText =
      overviewRelationQualityText || selectedRelationQualityText || legacyRelationQualityText;
    const isReadableRelationQualityText = (text) =>
      /(strong|clear|강한|분명함)[^\d]+\d+/i.test(text) &&
      /(supported|근거)[^\d]+\d+/i.test(text) &&
      /(weak|thin|약한|얇은)[^\d]+\d+/i.test(text) &&
      /(review|check|검토|확인)[^\d]+\d+/i.test(text) &&
      /[·,:]/.test(text);
    const relationQualityTextReadable = isReadableRelationQualityText(relationQualityText);
    const hasOverviewRelationQuality =
      overviewRelationQualityText.length > 0 ||
      (typeof payload.bodyText === "string" &&
        /relation quality|관계 품질/i.test(payload.bodyText) &&
        /(strong|supported|weak|review|강함|지원|약함|검토)/i.test(payload.bodyText));
    if (
      topologyAnalysisMode !== "path" &&
      topologyAnalysisMode !== "health" &&
      !focusSelectedNodeRoute &&
      !blockingComposerOpen &&
      payload.markers.topologyRelationQualityLensVisible !== true &&
      !hasOverviewRelationQuality
    ) {
      return "WebView did not report the Relief relation quality marker";
    }
    if (
      payload.markers.topologyRelationQualityLensVisible === true &&
      relationQualityText.length === 0
    ) {
      return "WebView reported empty Relief relation quality lens text";
    }
    if (
      topologyAnalysisMode !== "path" &&
      topologyAnalysisMode !== "health" &&
      !focusSelectedNodeRoute &&
      !blockingComposerOpen &&
      Object.hasOwn(payload.markers, "topologyOverviewRelationQualityText") &&
      overviewRelationQualityText.length === 0
    ) {
      return "WebView reported empty Relief overview relation quality text";
    }
    if (
      topologyAnalysisMode !== "path" &&
      topologyAnalysisMode !== "health" &&
      Object.hasOwn(payload.markers, "topologyOverviewRelationQualityText") &&
      overviewRelationQualityText.length > 0 &&
      !isReadableRelationQualityText(overviewRelationQualityText)
    ) {
      return `WebView reported unparseable Relief overview relation quality text (${overviewRelationQualityText})`;
    }
    if (
      Object.hasOwn(payload.markers, "topologySelectedRelationQualityLensText") &&
      selectedRelationQualityText.length > 0 &&
      !isReadableRelationQualityText(selectedRelationQualityText)
    ) {
      return `WebView reported unparseable Relief selected relation quality lens text (${selectedRelationQualityText})`;
    }
    if (
      payload.markers.topologyRelationQualityLensVisible === true &&
      !relationQualityTextReadable
    ) {
      return `WebView reported unparseable Relief relation quality lens text (${relationQualityText})`;
    }
    const overviewAgentReadinessText =
      typeof payload.markers.topologyOverviewAgentReadinessText === "string"
        ? payload.markers.topologyOverviewAgentReadinessText.trim()
        : "";
    const overviewAgentReadinessReadable =
      /(handoff-ready|ready|handoff 가능|전달 가능|인계 가능)[^\d]+\d+/i.test(
        overviewAgentReadinessText,
      ) &&
      /(preflight|check first|check|사전 점검)[^\d]+\d+/i.test(overviewAgentReadinessText) &&
      /(needs review|review|검토)[^\d]+\d+/i.test(overviewAgentReadinessText) &&
      /[·,:]/.test(overviewAgentReadinessText);
    const requireOverviewAgentReadiness =
      topologyAnalysisMode !== "path" &&
      topologyAnalysisMode !== "health" &&
      !focusSelectedNodeRoute &&
      !blockingComposerOpen;
    if (
      requireOverviewAgentReadiness &&
      (typeof payload.markers.topologyOverviewAgentReadinessText !== "string" ||
        !overviewAgentReadinessReadable)
    ) {
      return `WebView did not report the Relief overview agent readiness marker (${payload.markers.topologyOverviewAgentReadinessText ?? "unknown text"})`;
    }
    const overviewAgentReadinessSegments = Array.isArray(
      payload.markers.topologyOverviewAgentReadinessMeterSegments,
    )
      ? payload.markers.topologyOverviewAgentReadinessMeterSegments
      : [];
    if (
      requireOverviewAgentReadiness &&
      !["ready", "preflight", "review"].every((kind) =>
        overviewAgentReadinessSegments.some(
          (segment) =>
            segment &&
            segment.kind === kind &&
            typeof segment.count === "string" &&
            segment.count.trim().length > 0,
        ),
      )
    ) {
      return `WebView did not report the Relief overview agent readiness meter marker (${JSON.stringify(payload.markers.topologyOverviewAgentReadinessMeterSegments ?? null)})`;
    }
    if (
      Object.hasOwn(payload.markers, "topologyAnalysisPanelVisible") &&
      !selectedRelationContextVisible &&
      payload.markers.topologyCreateNodeOpen !== true
    ) {
      if (payload.markers.topologyAnalysisPanelVisible !== true) {
        return "WebView did not report a visible Relief analysis panel";
      }
      const usesOverviewWidth =
        payload.markers.topologyAnalysisPanelMode === "overview" ||
        payload.markers.topologyAnalysisPanelWidthPolicy === "overview-support";
      const isOverviewAnalysis =
        payload.markers.topologyAnalysisPanelMode === "overview";
      const usesPathRailWidth =
        topologyAnalysisMode === "path" ||
        payload.markers.topologyAnalysisPanelWidthContract ===
          "path-support-rail-max-360-phone-utility-reserve";
      const analysisPanelMinWidth = usesPathRailWidth
        ? 320
        : focusSelectedNodeRoute
          ? 240
          : 360;
      if (
        !usesOverviewWidth &&
        !(Number(payload.markers.topologyAnalysisPanelWidth) >= analysisPanelMinWidth)
      ) {
        return `WebView reported a cramped Relief analysis panel width (${payload.markers.topologyAnalysisPanelWidth ?? "unknown"})`;
      }
      const analysisPanelMinHeight =
        topologyAnalysisMode === "path" ? 120 : focusSelectedNodeRoute ? 260 : 320;
      if (!(Number(payload.markers.topologyAnalysisPanelHeight) >= analysisPanelMinHeight)) {
        return `WebView reported a cramped Relief analysis panel height (${payload.markers.topologyAnalysisPanelHeight ?? "unknown"})`;
      }
      if (topologyAnalysisMode === "health") {
        if (
          payload.markers.topologyHealthRepairLaneContract !==
          "target-to-builder-to-sync"
        ) {
          return `WebView Relief health repair lane contract was ${payload.markers.topologyHealthRepairLaneContract || "missing"}`;
        }
        if (
          payload.markers.topologyHealthRepairOrderContract !== "inspect-repair-sync"
        ) {
          return `WebView Relief health repair order contract was ${payload.markers.topologyHealthRepairOrderContract || "missing"}`;
        }
        if (
          !String(payload.markers.topologyHealthRepairTargetSlug || "").trim() ||
          !/^(stale|orphan|promotion)$/.test(
            String(payload.markers.topologyHealthRepairTargetKind || ""),
          )
        ) {
          return `WebView Relief health repair target was incomplete (${payload.markers.topologyHealthRepairTargetKind || "missing"} ${payload.markers.topologyHealthRepairTargetSlug || "missing"})`;
        }
        if (
          payload.markers.topologyHealthRepairMapTargetContract !==
          "analysis-panel-target-to-audit-overlay"
        ) {
          return `WebView Relief health map target contract was ${payload.markers.topologyHealthRepairMapTargetContract || "missing"}`;
        }
        if (
          payload.markers.topologyHealthRepairMapTargetSlug !==
            payload.markers.topologyHealthRepairTargetSlug ||
          payload.markers.topologyHealthRepairMapTargetKind !==
            payload.markers.topologyHealthRepairTargetKind
        ) {
          return `WebView Relief health map target did not match the panel target (${payload.markers.topologyHealthRepairMapTargetKind || "missing"} ${payload.markers.topologyHealthRepairMapTargetSlug || "missing"})`;
        }
        if (
          payload.markers.topologyHealthRepairAuditTargetContract !==
          "panel-target-card-highlight"
        ) {
          return `WebView Relief health audit target card contract was ${payload.markers.topologyHealthRepairAuditTargetContract || "missing"}`;
        }
        if (
          payload.markers.topologyHealthRepairAuditTargetSlug !==
            payload.markers.topologyHealthRepairTargetSlug ||
          payload.markers.topologyHealthRepairAuditTargetKind !==
            payload.markers.topologyHealthRepairTargetKind
        ) {
          return `WebView Relief health audit card did not match the panel target (${payload.markers.topologyHealthRepairAuditTargetKind || "missing"} ${payload.markers.topologyHealthRepairAuditTargetSlug || "missing"})`;
        }
        if (
          payload.markers.topologyHealthRepairAuditTargetBadgeContract !==
          "inline-card-state-label"
        ) {
          return `WebView Relief health audit target badge contract was ${payload.markers.topologyHealthRepairAuditTargetBadgeContract || "missing"}`;
        }
        if (
          !String(payload.markers.topologyHealthRepairAuditTargetBadge || "").trim()
        ) {
          return "WebView Relief health audit target badge text was missing";
        }
        if (payload.markers.topologyHealthRepairPrimaryAction !== "builder") {
          return `WebView Relief health repair primary action was ${payload.markers.topologyHealthRepairPrimaryAction || "missing"}`;
        }
        if (
          payload.markers.topologyHealthRepairActionOrder !==
          "builder-mcp-ontology"
        ) {
          return `WebView Relief health repair action order was ${payload.markers.topologyHealthRepairActionOrder || "missing"}`;
        }
        if (
          payload.markers.topologyHealthRepairVisualContract !==
          "builder-primary-secondary-compact"
        ) {
          return `WebView Relief health repair visual contract was ${payload.markers.topologyHealthRepairVisualContract || "missing"}`;
        }
        if (payload.markers.topologyHealthRepairFirstActionPrimary !== "builder") {
          return `WebView Relief health repair first action was ${payload.markers.topologyHealthRepairFirstActionPrimary || "missing"}`;
        }
        if (payload.markers.topologyHealthRepairFirstActionTier !== "primary") {
          return `WebView Relief health repair first action tier was ${payload.markers.topologyHealthRepairFirstActionTier || "missing"}`;
        }
        if (!(Number(payload.markers.topologyHealthRepairFirstActionWidth) >= 96)) {
          return `WebView Relief health repair first action was too narrow (${payload.markers.topologyHealthRepairFirstActionWidth || "missing"})`;
        }
        if (payload.markers.topologyHealthRepairSyncGate !== "post-change") {
          return `WebView Relief health repair sync gate was ${payload.markers.topologyHealthRepairSyncGate || "missing"}`;
        }
        if (payload.markers.topologyAuditLegendVisible !== true) {
          return "WebView Relief health audit legend was not visible as support chrome";
        }
        if (
          payload.markers.topologyAuditLegendContract !==
          "health-support-bottom-left-clear-of-minimap"
        ) {
          return `WebView Relief health audit legend contract was ${payload.markers.topologyAuditLegendContract || "missing"}`;
        }
        if (payload.markers.topologyAuditLegendAttentionRole !== "support") {
          return `WebView Relief health audit legend attention role was ${payload.markers.topologyAuditLegendAttentionRole || "missing"}`;
        }
        if (payload.markers.topologyAuditLegendDensity !== "compact") {
          return `WebView Relief health audit legend density was ${payload.markers.topologyAuditLegendDensity || "missing"}`;
        }
        if (
          payload.markers.topologyAuditLegendOverlapsAnalysisPanel === true ||
          payload.markers.topologyAuditLegendOverlapsMinimap === true
        ) {
          return "WebView Relief health audit legend overlapped the analysis panel or minimap";
        }
      }
      if (payload.markers.topologyCreateNodeOpen !== true && usesOverviewWidth) {
        if (payload.markers.topologyAnalysisPanelWidthPolicy !== "overview-support") {
          return `WebView reported malformed Relief overview panel width policy (${payload.markers.topologyAnalysisPanelWidthPolicy ?? "unknown"})`;
        }
        if (payload.markers.topologyAnalysisPanelWidthBand !== "header-aligned") {
          return `WebView reported malformed Relief overview panel width band (${payload.markers.topologyAnalysisPanelWidthBand ?? "unknown"})`;
        }
        if (isOverviewAnalysis) {
          if (payload.markers.topologyAnalysisPanelAttentionRole !== "support") {
            return `WebView reported malformed Relief overview panel attention role (${payload.markers.topologyAnalysisPanelAttentionRole ?? "unknown"})`;
          }
          if (payload.markers.topologyAnalysisPanelWidthContract !== "overview-support-max-360-phone-utility-reserve") {
            return `WebView reported malformed Relief overview panel width contract (${payload.markers.topologyAnalysisPanelWidthContract ?? "unknown"})`;
          }
          if (payload.markers.topologyAnalysisPanelWidthTarget !== "overview-14-inch-compact") {
            return `WebView reported malformed Relief overview panel width target (${payload.markers.topologyAnalysisPanelWidthTarget ?? "unknown"})`;
          }
          if (payload.markers.topologyAnalysisPanelWidthToken !== "--topology-panel-overview-responsive-width") {
            return `WebView reported malformed Relief overview panel width token (${payload.markers.topologyAnalysisPanelWidthToken ?? "unknown"})`;
          }
          if (
            payload.markers.topologyAnalysisPanelPhoneUtilityReserveToken !==
            "--topology-panel-phone-utility-rail-reserve"
          ) {
            return `WebView reported malformed Relief overview panel phone utility reserve token (${payload.markers.topologyAnalysisPanelPhoneUtilityReserveToken ?? "unknown"})`;
          }
          if (
            payload.markers.topologyAnalysisPanelLayerContract !==
              "read-surface-above-map-cards" ||
            payload.markers.topologyAnalysisPanelZIndexToken !==
              "--topology-panel-read-layer-z-index" ||
            Number(payload.markers.topologyAnalysisPanelZIndexComputed || 0) < 30
          ) {
            return `WebView reported malformed Relief overview panel layer contract (${payload.markers.topologyAnalysisPanelLayerContract || "missing"} · ${payload.markers.topologyAnalysisPanelZIndexToken || "missing"} · ${payload.markers.topologyAnalysisPanelZIndexComputed || "missing"})`;
          }
          const overviewPanelMinWidth = Number(payload.width) < 1600 ? 320 : 460;
          if (!(Number(payload.markers.topologyAnalysisPanelWidth) >= overviewPanelMinWidth)) {
            return `WebView reported a cramped Relief overview panel width (${payload.markers.topologyAnalysisPanelWidth ?? "unknown"})`;
          }
          const overviewPanelMaxWidth =
            Number(payload.width) >= 1400 && Number(payload.width) <= 1600 ? 360 : 560;
          if (!(Number(payload.markers.topologyAnalysisPanelWidth) <= overviewPanelMaxWidth)) {
            return `WebView reported an oversized Relief overview panel width (${payload.markers.topologyAnalysisPanelWidth ?? "unknown"})`;
          }
          if (
            Number(payload.width) >= 1400 &&
            Number(payload.width) <= 1600 &&
            payload.markers.topologyTopLeftChromeGroupVisible === true
          ) {
            const chromeRight = Number(payload.markers.topologyTopLeftChromeGroupRight || 0);
            const panelRight = Number(payload.markers.topologyAnalysisPanelRight || 0);
            const chromeLeft = Number(payload.markers.topologyTopLeftChromeGroupLeft || 0);
            const panelLeft = Number(payload.markers.topologyAnalysisPanelLeft || 0);
            if (
              [chromeRight, panelRight, chromeLeft, panelLeft].every(Number.isFinite) &&
              chromeRight > chromeLeft &&
              panelRight > panelLeft
            ) {
              const rightDelta = panelRight - chromeRight;
              const leftDelta = Math.abs(panelLeft - chromeLeft);
              if (rightDelta > 32 || leftDelta > 16) {
                return `WebView Relief overview panel drifted from the top-left Relief chrome group (${panelLeft}, ${panelRight} vs ${chromeLeft}, ${chromeRight})`;
              }
            }
          }
        }
      }
      if (payload.markers.topologyCreateNodeOpen !== true && isOverviewAnalysis) {
        if (
          !["scan-facts", "summary-first"].includes(
            payload.markers.topologyOverviewRelationQualityDensity,
          )
        ) {
          return `WebView reported malformed Relief overview relation quality density (${payload.markers.topologyOverviewRelationQualityDensity ?? "unknown"})`;
        }
        if (!(Number(payload.markers.topologyAnalysisPanelHeight) >= 455)) {
          return `WebView reported a cramped Relief overview panel height (${payload.markers.topologyAnalysisPanelHeight ?? "unknown"})`;
        }
        if (payload.markers.topologyAnalysisPanelOverflowY !== "hidden") {
          return `WebView reported a scroll-prone Relief overview panel (${payload.markers.topologyAnalysisPanelOverflowY ?? "unknown"} overflow)`;
        }
        const overflowDelta =
          Number(payload.markers.topologyAnalysisPanelScrollHeight) -
          Number(payload.markers.topologyAnalysisPanelClientHeight);
        if (Number.isFinite(overflowDelta) && overflowDelta > 2) {
          return `WebView reported clipped Relief overview panel content (${overflowDelta}px overflow)`;
        }
        const overviewCopyMinWidth = Number(payload.width) < 1600 ? 280 : 410;
        if (!(Number(payload.markers.topologyOverviewPrimaryCopyWidth) >= overviewCopyMinWidth)) {
          return `WebView reported a cramped Relief overview copy action (${payload.markers.topologyOverviewPrimaryCopyWidth ?? "unknown"}px)`;
        }
        if (!(Number(payload.markers.topologyOverviewPrimaryCopyHeight) >= 34)) {
          return `WebView reported a cramped Relief overview copy action hit target (${payload.markers.topologyOverviewPrimaryCopyHeight ?? "unknown"}px)`;
        }
      }
    }
    if (requireTopologyDrag) {
      if (payload.markers.topologyDragFocusMoved !== true) {
        return `WebView Relief drag did not move the focus card (${payload.markers.topologyDragFocusDelta ?? "unknown delta"})`;
      }
      if (payload.markers.topologyDragCompanionVisible !== true) {
        return "WebView Relief drag companion card did not remain visible after release";
      }
      if (payload.markers.topologyDragCompanionAligned !== true) {
        const focusDelta = JSON.stringify(payload.markers.topologyDragFocusDelta ?? "unknown focus delta");
        const companionDelta = JSON.stringify(payload.markers.topologyDragCompanionDelta ?? "unknown companion delta");
        return `WebView Relief drag companion did not travel with the focus card (focus ${focusDelta}, companion ${companionDelta})`;
      }
      const focusDeltaVector = topologyDragDeltaVector(payload.markers.topologyDragFocusDelta);
      const companionDeltaVector = topologyDragDeltaVector(
        payload.markers.topologyDragCompanionDelta,
      );
      if (focusDeltaVector && companionDeltaVector) {
        if (
          focusDeltaVector.magnitude < 24 ||
          focusDeltaVector.magnitude > TOPOLOGY_DRAG_FOCUS_MAX_REASONABLE_DELTA_PX
        ) {
          return `WebView Relief drag moved the focus card by an implausible distance (${Math.round(focusDeltaVector.magnitude)}px)`;
        }
        const dragVectorDelta = Math.hypot(
          focusDeltaVector.x - companionDeltaVector.x,
          focusDeltaVector.y - companionDeltaVector.y,
        );
        const dragVectorTolerance = topologyDragCompanionVectorTolerance(payload.markers);
        if (dragVectorDelta > dragVectorTolerance) {
          return `WebView Relief drag companion vector drifted from the focus card (${Math.round(dragVectorDelta)}px)`;
        }
      }
      if (payload.markers.topologyDragRelationLabelClicked !== true) {
        return "WebView did not perform the Relief relation label selection during drag verification";
      }
      if (payload.markers.topologyDragConnectorDrawable !== true) {
        return "WebView Relief drag did not report a drawable connector during drag verification";
      }
      if (!(Number(payload.markers.topologyDragClusterSize) >= 2)) {
        return `WebView Relief drag did not keep a linked card cluster (${payload.markers.topologyDragClusterSize ?? "missing"} active members)`;
      }
      if (payload.markers.topologyDragCollisionPolicy !== "release-settle") {
        return `WebView Relief drag collision policy was ${payload.markers.topologyDragCollisionPolicy || "missing"}`;
      }
      if (payload.markers.topologyDragFrameCacheContract !== "pointer-move-reuses-drag-indexes") {
        return `WebView Relief drag frame cache contract was ${payload.markers.topologyDragFrameCacheContract || "missing"}`;
      }
      if (payload.markers.topologyDragDomIndexContract !== "drag-release-reuses-card-elements") {
        return `WebView Relief drag DOM index contract was ${payload.markers.topologyDragDomIndexContract || "missing"}`;
      }
      if (!(Number(payload.markers.topologyDragDomIndexSize || 0) >= 2)) {
        return `WebView Relief drag DOM index size was ${payload.markers.topologyDragDomIndexSize ?? "missing"}`;
      }
      if (
        payload.markers.topologyDragFrameCacheSnapshotCount === undefined ||
        !(Number(payload.markers.topologyDragFrameCacheSnapshotCount) >= 0)
      ) {
        return `WebView Relief drag frame cache snapshot count was ${payload.markers.topologyDragFrameCacheSnapshotCount ?? "missing"}`;
      }
      if (payload.markers.topologyDockDragSnapshotContract !== "single-pass-card-rect-read") {
        return `WebView Relief dock drag snapshot contract was ${payload.markers.topologyDockDragSnapshotContract || "missing"}`;
      }
      if (payload.markers.topologyConnectorDomIndexContract !== "reuse-card-index") {
        return `WebView Relief connector DOM index contract was ${payload.markers.topologyConnectorDomIndexContract || "missing"}`;
      }
      if (payload.markers.topologyConnectorRectCacheContract !== "frame-local-card-rect-cache") {
        return `WebView Relief connector rect cache contract was ${payload.markers.topologyConnectorRectCacheContract || "missing"}`;
      }
      if (payload.markers.topologyConnectorRectCacheAccounting !== "reads-plus-hits") {
        return `WebView Relief connector rect cache accounting was ${payload.markers.topologyConnectorRectCacheAccounting || "missing"}`;
      }
      const connectorRectCacheSize = Number(payload.markers.topologyConnectorRectCacheSize || 0);
      const connectorRectCacheReadCount = Number(
        payload.markers.topologyConnectorRectCacheReadCount || 0,
      );
      const connectorRectCacheHitCount = Number(
        payload.markers.topologyConnectorRectCacheHitCount || 0,
      );
      if (
        !Number.isFinite(connectorRectCacheSize) ||
        !Number.isFinite(connectorRectCacheReadCount) ||
        !Number.isFinite(connectorRectCacheHitCount) ||
        connectorRectCacheSize < 2 ||
        connectorRectCacheReadCount < 2 ||
        connectorRectCacheHitCount < 1
      ) {
        return `WebView Relief connector rect cache proof was incomplete (${connectorRectCacheSize} size / ${connectorRectCacheReadCount} reads / ${connectorRectCacheHitCount} hits)`;
      }
      if (payload.markers.topologyRelationLabelBlockerContract !== "reuse-visible-card-rects") {
        return `WebView Relief relation label blocker contract was ${payload.markers.topologyRelationLabelBlockerContract || "missing"}`;
      }
      if (
        payload.markers.topologyRelationLabelBlockerSource &&
        !["visibility-pass", "fallback-visibility-pass"].includes(
          payload.markers.topologyRelationLabelBlockerSource,
        )
      ) {
        return `WebView Relief relation label blocker source was ${payload.markers.topologyRelationLabelBlockerSource}`;
      }
      if (payload.markers.topologyRelationLabelPhoneBottomReserveContract) {
        if (
          payload.markers.topologyRelationLabelPhoneBottomReserveContract !==
          "avoid-floating-controls"
        ) {
          return `WebView Relief relation label phone bottom reserve contract was ${payload.markers.topologyRelationLabelPhoneBottomReserveContract}`;
        }
        if (
          Number(payload.markers.topologyRelationLabelPhoneBottomReservePx || 0) < 96
        ) {
          return `WebView Relief relation label phone bottom reserve was too small (${payload.markers.topologyRelationLabelPhoneBottomReservePx || "missing"}px)`;
        }
        if (
          payload.markers.topologyRelationLabelPhoneBottomReserveToken !==
          "--topology-floating-control-phone-bottom"
        ) {
          return `WebView Relief relation label phone bottom reserve token was ${payload.markers.topologyRelationLabelPhoneBottomReserveToken || "missing"}`;
        }
      }
      if (payload.markers.topologyRelationLabelQueryContract !== "indexed-once") {
        return `WebView Relief relation label query contract was ${payload.markers.topologyRelationLabelQueryContract || "missing"}`;
      }
      if (!(Number(payload.markers.topologyRelationLabelQueryIndexCount || 0) >= 1)) {
        return `WebView Relief relation label query index count was ${payload.markers.topologyRelationLabelQueryIndexCount ?? "missing"}`;
      }
      if (payload.markers.topologyVisibilityCountContract !== "single-pass-unless-fallback") {
        return `WebView Relief visibility count contract was ${payload.markers.topologyVisibilityCountContract || "missing"}`;
      }
      if (payload.markers.topologyFixedSurfaceMeasureContract !== "single-pass-rect-read") {
        return `WebView Relief fixed surface measurement contract was ${payload.markers.topologyFixedSurfaceMeasureContract || "missing"}`;
      }
      if (
        payload.markers.topologyVisibilityCountSource &&
        !["single-pass", "fallback-recount"].includes(payload.markers.topologyVisibilityCountSource)
      ) {
        return `WebView Relief visibility count source was ${payload.markers.topologyVisibilityCountSource}`;
      }
      if (payload.markers.topologyDragSettleMotionContract !== "linked-cluster-drag-settle") {
        return `WebView Relief drag settle motion contract was ${payload.markers.topologyDragSettleMotionContract || "missing"}`;
      }
      if (Number(payload.markers.topologyDragSettleMotionDurationMs || 0) !== 720) {
        return `WebView Relief drag settle motion duration was ${payload.markers.topologyDragSettleMotionDurationMs || "missing"}ms`;
      }
      if (payload.markers.topologyDragSettleMotionEasing !== "ease-out") {
        return `WebView Relief drag settle motion easing was ${payload.markers.topologyDragSettleMotionEasing || "missing"}`;
      }
      if (!(Number(payload.markers.topologyDragConnectorCount) >= 1)) {
        return `WebView Relief drag did not report linked-cluster connectors (${payload.markers.topologyDragConnectorCount ?? "missing"} connectors)`;
      }
      if (!(Number(payload.markers.topologyDragConnectorClearance) >= 6)) {
        return `WebView Relief drag connector did not report a usable card clearance (${payload.markers.topologyDragConnectorClearance ?? "missing"})`;
      }
      if (blockingComposerOpen) {
        return null;
      }
      if (payload.markers.topologySelectedRelationHaloVisible !== true) {
        return `WebView Relief relation label selection did not reveal a selected relation halo (${payload.markers.topologySelectedRelationVisibleHaloCount ?? 0}/${payload.markers.topologySelectedRelationHaloCount ?? 0} visible)`;
      }
      if (payload.markers.topologySelectedRelationLabelHitAligned !== true) {
        return "WebView Relief selected relation label hit target is not aligned with its visible badge";
      }
      if (
        Number(payload.markers.topologySelectedRelationLabelHitWidth || 0) < 90 ||
        Number(payload.markers.topologySelectedRelationLabelHitHeight || 0) < 32
      ) {
        return `WebView Relief selected relation label hit target is too small (${payload.markers.topologySelectedRelationLabelHitWidth ?? 0}x${payload.markers.topologySelectedRelationLabelHitHeight ?? 0})`;
      }
      if (
        Number(payload.width || 0) >= 1400 &&
        Number(payload.markers.topologySelectedRelationLabelHitWidth || 0) > 160
      ) {
        return `WebView Relief selected relation label stayed too wide for the active inspector (${payload.markers.topologySelectedRelationLabelHitWidth ?? 0}px)`;
      }
      if (payload.markers.topologySelectedRelationLabelDensity !== "focus-token") {
        return `WebView Relief selected relation label density was ${payload.markers.topologySelectedRelationLabelDensity || "missing"}`;
      }
      if (selectedRelationRouteRailTextLeak(payload)) {
        return "WebView Relief selected relation label leaked hidden route rail text into body text";
      }
      const relationLabelCompactError = validateSelectedRelationLabelCompactMarkers(
        payload.markers,
        payload.width,
      );
      if (relationLabelCompactError) return relationLabelCompactError;
      const relationLabelFrameGeometryError = validateRelationLabelFrameGeometryMarkers(
        payload.markers,
      );
      if (relationLabelFrameGeometryError) return relationLabelFrameGeometryError;
      if (
        typeof payload.markers.topologySelectedRelationLabelQuality !== "string" ||
        !/^(strong|supported|weak|review)$/.test(payload.markers.topologySelectedRelationLabelQuality)
      ) {
        return "WebView Relief selected relation label did not expose a relation quality marker";
      }
      if (
        typeof payload.markers.topologySelectedRelationLabelQualityChipText !== "string" ||
        payload.markers.topologySelectedRelationLabelQualityChipText.trim().length === 0
      ) {
        return "WebView Relief selected relation label did not expose a visible relation quality chip";
      }
      if (
        typeof payload.markers.topologySelectedRelationLabelEvidenceState !== "string" ||
        !/^(source-backed|authored|needs-review)$/.test(payload.markers.topologySelectedRelationLabelEvidenceState)
      ) {
        return "WebView Relief selected relation label did not expose an evidence state marker";
      }
      if (
        typeof payload.markers.topologySelectedRelationLabelAgentGateKind !== "string" ||
        !/^(handoff-ready|preflight-first|review-first)$/.test(
          payload.markers.topologySelectedRelationLabelAgentGateKind,
        )
      ) {
        return "WebView Relief selected relation label did not expose an agent gate marker";
      }
      const expectedRelationLabelAction =
        payload.markers.topologySelectedRelationLabelAgentGateKind === "handoff-ready"
          ? "explain_relation"
          : "relation_check";
      if (payload.markers.topologySelectedRelationLabelPrimaryCopyAction !== expectedRelationLabelAction) {
        return `WebView Relief selected relation label reported ${
          payload.markers.topologySelectedRelationLabelPrimaryCopyAction || "no"
        } primary action for ${payload.markers.topologySelectedRelationLabelAgentGateKind}`;
      }
      const expectedRelationLabelCliFallbackCommand =
        expectedRelationLabelAction === "relation_check"
          ? `ontology-atlas relation-check ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadFrom)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadTo)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadType)} [vault]`
          : `ontology-atlas explain ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadFrom)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadTo)} [vault] --type ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadType)}`;
      const relationLabelCliFallbackCommand =
        typeof payload.markers.topologySelectedRelationLabelCliFallbackCommand === "string"
          ? payload.markers.topologySelectedRelationLabelCliFallbackCommand.trim()
          : "";
      if (relationLabelCliFallbackCommand !== expectedRelationLabelCliFallbackCommand) {
        return `WebView Relief selected relation label CLI fallback was ${relationLabelCliFallbackCommand || "missing"}, expected ${expectedRelationLabelCliFallbackCommand}`;
      }
      if (
        typeof payload.markers.topologySelectedRelationLabelAgentGateText !== "string" ||
        payload.markers.topologySelectedRelationLabelAgentGateText.trim().length === 0
      ) {
        return "WebView Relief selected relation label did not expose a visible agent gate chip";
      }
      const expectedRelationLabelGateText = expectedRelationLabelAgentGateText(
        payload.markers.topologySelectedRelationLabelAgentGateKind,
      );
      if (
        String(payload.markers.topologySelectedRelationLabelAgentGateText || "").trim() !==
        expectedRelationLabelGateText
      ) {
        return `WebView Relief selected relation label visible agent gate chip was ${
          payload.markers.topologySelectedRelationLabelAgentGateText || "missing"
        }, expected ${expectedRelationLabelGateText}`;
      }
      if (payload.markers.topologySelectedRelationLabelFactRoute !== "fact>evidence>gate>action") {
        return `WebView Relief selected relation label reported malformed fact route (${payload.markers.topologySelectedRelationLabelFactRoute || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationLabelFactRouteQuality !==
        payload.markers.topologySelectedRelationLabelQuality
      ) {
        return `WebView Relief selected relation label route quality mismatched the badge (${payload.markers.topologySelectedRelationLabelFactRouteQuality || "missing"} vs ${payload.markers.topologySelectedRelationLabelQuality || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationLabelFactRouteEvidence !==
        payload.markers.topologySelectedRelationLabelEvidenceState
      ) {
        return `WebView Relief selected relation label route evidence mismatched the badge (${payload.markers.topologySelectedRelationLabelFactRouteEvidence || "missing"} vs ${payload.markers.topologySelectedRelationLabelEvidenceState || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationLabelFactRouteGate !==
        payload.markers.topologySelectedRelationLabelAgentGateKind
      ) {
        return `WebView Relief selected relation label route gate mismatched the badge (${payload.markers.topologySelectedRelationLabelFactRouteGate || "missing"} vs ${payload.markers.topologySelectedRelationLabelAgentGateKind || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationLabelFactRouteAction !==
        expectedRelationLabelAction
      ) {
        return `WebView Relief selected relation label route action reported ${payload.markers.topologySelectedRelationLabelFactRouteAction || "missing"} for ${payload.markers.topologySelectedRelationLabelAgentGateKind}`;
      }
      const labelFactRouteChips = Array.isArray(
        payload.markers.topologySelectedRelationLabelFactRouteChips,
      )
        ? payload.markers.topologySelectedRelationLabelFactRouteChips
        : [];
      const labelFactRouteKinds = labelFactRouteChips.map((chip) => chip?.kind).join(">");
      if (labelFactRouteKinds !== "fact>evidence>gate>action") {
        return `WebView Relief selected relation label fact route chips were malformed (${labelFactRouteKinds || "missing"})`;
      }
      const labelFactRouteGate = labelFactRouteChips.find((chip) => chip?.kind === "gate");
      if (
        !labelFactRouteGate ||
        String(labelFactRouteGate.text || "").trim() !==
          String(payload.markers.topologySelectedRelationLabelAgentGateText || "").trim()
      ) {
        return "WebView Relief selected relation label fact route did not expose the agent gate chip";
      }
      if (
        payload.markers.topologyRelationLabelHandoffContract ||
        payload.markers.topologySelectedRelationLabelHandoffState
      ) {
        if (
          payload.markers.topologyRelationLabelHandoffContract !==
          "label-level-mcp-cli-fallback"
        ) {
          return `WebView Relief selected relation label handoff contract was ${payload.markers.topologyRelationLabelHandoffContract || "missing"}`;
        }
        if (payload.markers.topologySelectedRelationLabelHandoffState !== "ready") {
          return `WebView Relief selected relation label handoff state was ${payload.markers.topologySelectedRelationLabelHandoffState || "missing"}`;
        }
        if (
          payload.markers.topologySelectedRelationLabelHandoffGate !==
          payload.markers.topologySelectedRelationLabelAgentGateKind
        ) {
          return `WebView Relief selected relation label handoff gate mismatched the badge (${payload.markers.topologySelectedRelationLabelHandoffGate || "missing"} vs ${payload.markers.topologySelectedRelationLabelAgentGateKind || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationLabelHandoffPrimaryAction !==
          expectedRelationLabelAction
        ) {
          return `WebView Relief selected relation label handoff action mismatched the badge (${payload.markers.topologySelectedRelationLabelHandoffPrimaryAction || "missing"} vs ${expectedRelationLabelAction})`;
        }
        if (
          String(payload.markers.topologySelectedRelationLabelHandoffCliFallbackCommand || "").trim() !==
          relationLabelCliFallbackCommand
        ) {
          return `WebView Relief selected relation label handoff CLI fallback mismatched the badge (${payload.markers.topologySelectedRelationLabelHandoffCliFallbackCommand || "missing"} vs ${relationLabelCliFallbackCommand || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationLabelHandoffFactRoute !==
          payload.markers.topologySelectedRelationLabelFactRoute
        ) {
          return `WebView Relief selected relation label handoff fact route mismatched the badge (${payload.markers.topologySelectedRelationLabelHandoffFactRoute || "missing"} vs ${payload.markers.topologySelectedRelationLabelFactRoute || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationLabelHandoffQuality !==
          payload.markers.topologySelectedRelationLabelQuality ||
          payload.markers.topologySelectedRelationLabelHandoffEvidence !==
            payload.markers.topologySelectedRelationLabelEvidenceState
        ) {
          return `WebView Relief selected relation label handoff fact markers mismatched the badge (${payload.markers.topologySelectedRelationLabelHandoffQuality || "missing"}/${payload.markers.topologySelectedRelationLabelHandoffEvidence || "missing"})`;
        }
      }
      if (payload.markers.topologyNodePopoverVisible === true) {
      if (payload.markers.topologyNodePopoverCollapsed === true) {
        return "WebView Relief selected node popover stayed collapsed after expand verification";
      }
      if (payload.markers.topologyNodePopoverSurfaceRole !== "active-node-inspector") {
        return `WebView Relief selected node popover surface role was ${payload.markers.topologyNodePopoverSurfaceRole || "missing"}`;
      }
      if (payload.markers.topologyNodePopoverAttentionRole !== "supporting-detail") {
        return `WebView Relief selected node popover attention role was ${payload.markers.topologyNodePopoverAttentionRole || "missing"}`;
      }
      if (payload.markers.topologyNodePopoverFocusPrimary !== "linked-focus-cluster") {
        return `WebView Relief selected node popover primary focus was ${payload.markers.topologyNodePopoverFocusPrimary || "missing"}`;
      }
      if (payload.markers.topologyNodePopoverHierarchyContract !== "click-focus-detail-support") {
        return `WebView Relief selected node popover hierarchy contract was ${payload.markers.topologyNodePopoverHierarchyContract || "missing"}`;
      }
      if (payload.markers.topologyNodePopoverSizePolicy !== "inspector-rail") {
        return `WebView Relief selected node popover used ${payload.markers.topologyNodePopoverSizePolicy || "no"} size policy`;
      }
      const viewportWidth = Number(payload.width || 0);
      const nodePopoverMinWidth = 248;
      if (!(Number(payload.markers.topologyNodePopoverWidth) >= nodePopoverMinWidth)) {
        return `WebView Relief selected node popover was too narrow (${payload.markers.topologyNodePopoverWidth ?? "missing"}px)`;
      }
      const nodePopoverMaxWidth =
        viewportWidth >= 1800 ? 360 : viewportWidth >= 1400 ? 320 : Number.POSITIVE_INFINITY;
      if (Number(payload.markers.topologyNodePopoverWidth) > nodePopoverMaxWidth) {
        return `WebView Relief selected node popover exceeded the focus rail contract (${payload.markers.topologyNodePopoverWidth ?? "missing"}px > ${nodePopoverMaxWidth}px)`;
      }
      if (Number(payload.markers.topologyNodePopoverLeft) < 8) {
        return `WebView Relief selected node popover overflowed the viewport left (${payload.markers.topologyNodePopoverLeft ?? "missing"}px)`;
      }
      const popoverRightInset = viewportWidth - Number(payload.markers.topologyNodePopoverRight);
      if (popoverRightInset < (viewportWidth >= 1400 ? 72 : 8)) {
        return `WebView Relief selected node popover overflowed the right control rail (right inset ${Number.isFinite(popoverRightInset) ? popoverRightInset : "missing"}px)`;
      }
      if (!(Number(payload.markers.topologyNodePopoverTop) <= 130)) {
        return `WebView Relief selected node popover was placed too low (${payload.markers.topologyNodePopoverTop ?? "missing"}px)`;
      }
      if (
        Number(payload.markers.topologyNodePopoverBottom) >
        Number(payload.height || 0) - 16
      ) {
        return `WebView Relief selected node popover overflowed the viewport bottom (${payload.markers.topologyNodePopoverBottom ?? "missing"}px)`;
      }
      if (payload.markers.topologyNodePopoverRelationRowVisible !== true) {
        return "WebView Relief selected node popover did not expose a relation row";
      }
      const nodePopoverFooterError = validateTopologyNodePopoverScrollFooterContract(
        payload.markers,
      );
      if (nodePopoverFooterError) {
        return nodePopoverFooterError;
      }
      if (
        typeof payload.markers.topologyNodePopoverRelationEvidenceState !== "string" ||
        !/^(source-backed|authored|needs-review)$/.test(
          payload.markers.topologyNodePopoverRelationEvidenceState,
        )
      ) {
        return "WebView Relief selected node popover relation row did not expose an evidence state marker";
      }
      if (
        typeof payload.markers.topologyNodePopoverRelationAgentGateKind !== "string" ||
        !/^(handoff-ready|preflight-first|review-first)$/.test(
          payload.markers.topologyNodePopoverRelationAgentGateKind,
        )
      ) {
        return "WebView Relief selected node popover relation row did not expose an agent gate marker";
      }
      const expectedNodePopoverRelationAction =
        payload.markers.topologyNodePopoverRelationAgentGateKind === "handoff-ready"
          ? "explain_relation"
          : "relation_check";
      if (
        payload.markers.topologyNodePopoverRelationPrimaryCopyAction !==
        expectedNodePopoverRelationAction
      ) {
        return `WebView Relief selected node popover relation row reported ${
          payload.markers.topologyNodePopoverRelationPrimaryCopyAction || "no"
        } primary action for ${payload.markers.topologyNodePopoverRelationAgentGateKind}`;
      }
      if (
        typeof payload.markers.topologyNodePopoverRelationAgentGateText !== "string" ||
        payload.markers.topologyNodePopoverRelationAgentGateText.trim().length === 0
      ) {
        return "WebView Relief selected node popover relation row did not expose a visible agent gate chip";
      }
      const nodePopoverRelationAgentGateText =
        payload.markers.topologyNodePopoverRelationAgentGateText.trim();
      if (
        koreanTopologyRoute &&
        !/^(전달|점검|검토)$/.test(nodePopoverRelationAgentGateText)
      ) {
        return `WebView Relief selected node popover relation row exposed non-localized agent gate chip in Korean UI (${nodePopoverRelationAgentGateText})`;
      }
      if (payload.markers.topologyNodePopoverRelationFactRoute !== "fact>evidence>gate>action") {
        return `WebView Relief selected node popover relation row reported malformed fact route (${payload.markers.topologyNodePopoverRelationFactRoute || "missing"})`;
      }
      if (
        payload.markers.topologyNodePopoverRelationFactRouteQuality !==
        payload.markers.topologyNodePopoverRelationQuality
      ) {
        return `WebView Relief selected node popover relation row route quality mismatched the row (${payload.markers.topologyNodePopoverRelationFactRouteQuality || "missing"} vs ${payload.markers.topologyNodePopoverRelationQuality || "missing"})`;
      }
      if (
        payload.markers.topologyNodePopoverRelationFactRouteEvidence !==
        payload.markers.topologyNodePopoverRelationEvidenceState
      ) {
        return `WebView Relief selected node popover relation row route evidence mismatched the row (${payload.markers.topologyNodePopoverRelationFactRouteEvidence || "missing"} vs ${payload.markers.topologyNodePopoverRelationEvidenceState || "missing"})`;
      }
      if (
        payload.markers.topologyNodePopoverRelationFactRouteGate !==
        payload.markers.topologyNodePopoverRelationAgentGateKind
      ) {
        return `WebView Relief selected node popover relation row route gate mismatched the row (${payload.markers.topologyNodePopoverRelationFactRouteGate || "missing"} vs ${payload.markers.topologyNodePopoverRelationAgentGateKind || "missing"})`;
      }
      if (
        payload.markers.topologyNodePopoverRelationFactRouteAction !==
        expectedNodePopoverRelationAction
      ) {
        return `WebView Relief selected node popover relation row route action reported ${payload.markers.topologyNodePopoverRelationFactRouteAction || "missing"} for ${payload.markers.topologyNodePopoverRelationAgentGateKind}`;
      }
      if (
        payload.markers.topologyNodePopoverRelationHandoffGrammarContract !==
        "fact-evidence-gate-action-payload"
      ) {
        return `WebView Relief selected node popover relation row handoff grammar contract was ${payload.markers.topologyNodePopoverRelationHandoffGrammarContract || "missing"}`;
      }
      const nodePopoverRelationFactRouteChips = Array.isArray(
        payload.markers.topologyNodePopoverRelationFactRouteChips,
      )
        ? payload.markers.topologyNodePopoverRelationFactRouteChips
        : [];
      const nodePopoverRelationFactRouteKinds = nodePopoverRelationFactRouteChips
        .map((chip) => chip?.kind)
        .join(">");
      if (nodePopoverRelationFactRouteKinds !== "fact>evidence>gate>action>payload") {
        return `WebView Relief selected node popover relation row fact route chips were malformed (${nodePopoverRelationFactRouteKinds || "missing"})`;
      }
      const nodePopoverRelationGateChip = nodePopoverRelationFactRouteChips.find(
        (chip) => chip?.kind === "gate",
      );
      if (
        !nodePopoverRelationGateChip ||
        String(nodePopoverRelationGateChip.text || "").trim().length === 0
      ) {
        return "WebView Relief selected node popover relation row did not expose a visible gate chip";
      }
      const nodePopoverRelationActionChip = nodePopoverRelationFactRouteChips.find(
        (chip) => chip?.kind === "action",
      );
      const expectedNodePopoverActionChipText =
        expectedNodePopoverRelationAction === "explain_relation" ? "explain" : "check";
      if (
        String(nodePopoverRelationActionChip?.text || "").trim() !==
        expectedNodePopoverActionChipText
      ) {
        return `WebView Relief selected node popover relation row visible action chip was ${nodePopoverRelationActionChip?.text || "missing"} for ${expectedNodePopoverRelationAction}`;
      }
      const nodePopoverRelationPayloadChip = nodePopoverRelationFactRouteChips.find(
        (chip) => chip?.kind === "payload",
      );
      if (nodePopoverRelationPayloadChip?.text?.trim() !== "JSON") {
        return "WebView Relief selected node popover relation row did not expose a visible JSON payload chip";
      }
      if (payload.markers.topologyNodePopoverRelationRouteState !== "compact-json-ready") {
        return `WebView Relief selected node popover relation row route rail reported ${payload.markers.topologyNodePopoverRelationRouteState || "no"} state`;
      }
      const nodePopoverRelationRouteRailWidth = Number(
        payload.markers.topologyNodePopoverRelationRouteRailWidth,
      );
      const nodePopoverRelationRouteRailScrollWidth = Number(
        payload.markers.topologyNodePopoverRelationRouteRailScrollWidth,
      );
      if (
        !(nodePopoverRelationRouteRailWidth > 0) ||
        nodePopoverRelationRouteRailScrollWidth > nodePopoverRelationRouteRailWidth + 1
      ) {
        return `WebView Relief selected node popover relation row route rail overflowed (${nodePopoverRelationRouteRailScrollWidth || "missing"} > ${nodePopoverRelationRouteRailWidth || "missing"})`;
      }
      if (
        !(Number(payload.markers.topologyNodePopoverRelationPayloadChipWidth) > 0) ||
        String(payload.markers.topologyNodePopoverRelationPayloadChipText || "").trim() !==
          "JSON"
      ) {
        return "WebView Relief selected node popover relation row JSON payload chip was not visibly measurable";
      }
      const nodePopoverRelationSourceId =
        typeof payload.markers.topologyNodePopoverRelationSourceId === "string"
          ? payload.markers.topologyNodePopoverRelationSourceId.trim()
          : "";
      const nodePopoverRelationTargetId =
        typeof payload.markers.topologyNodePopoverRelationTargetId === "string"
          ? payload.markers.topologyNodePopoverRelationTargetId.trim()
          : "";
      const nodePopoverRelationEndpointRoute =
        typeof payload.markers.topologyNodePopoverRelationEndpointRoute === "string"
          ? payload.markers.topologyNodePopoverRelationEndpointRoute.trim()
          : "";
      if (!nodePopoverRelationSourceId || !nodePopoverRelationTargetId) {
        return "WebView Relief selected node popover relation row did not expose source and target endpoint markers";
      }
      if (
        nodePopoverRelationEndpointRoute !==
        `${nodePopoverRelationSourceId}>${nodePopoverRelationTargetId}`
      ) {
        return `WebView Relief selected node popover relation row endpoint route mismatched source and target (${nodePopoverRelationEndpointRoute || "missing"})`;
      }
      if (
        selectedNodeId &&
        nodePopoverRelationSourceId !== selectedNodeId &&
        nodePopoverRelationTargetId !== selectedNodeId
      ) {
        return `WebView Relief selected node popover relation row endpoint route did not include selected node ${selectedNodeId}`;
      }
      const nodePopoverRelationEndpointChips = Array.isArray(
        payload.markers.topologyNodePopoverRelationEndpointChips,
      )
        ? payload.markers.topologyNodePopoverRelationEndpointChips
        : [];
      const nodePopoverRelationEndpointKinds = nodePopoverRelationEndpointChips
        .map((chip) => chip?.kind)
        .join(">");
      if (nodePopoverRelationEndpointKinds !== "source>target") {
        return `WebView Relief selected node popover relation row endpoint chips were malformed (${nodePopoverRelationEndpointKinds || "missing"})`;
      }
      const nodePopoverRelationHandoffSummary =
        typeof payload.markers.topologyNodePopoverRelationHandoffSummary === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffSummary.trim()
          : "";
      const nodePopoverRelationAccessibleName =
        typeof payload.markers.topologyNodePopoverRelationAccessibleName === "string"
          ? payload.markers.topologyNodePopoverRelationAccessibleName.trim()
          : "";
      if (
        !nodePopoverRelationHandoffSummary.includes(
          `${nodePopoverRelationSourceId} > ${nodePopoverRelationTargetId}`,
        ) ||
        !nodePopoverRelationHandoffSummary.includes(
          payload.markers.topologyNodePopoverRelationEvidenceState,
        ) ||
        !nodePopoverRelationHandoffSummary.includes(
          payload.markers.topologyNodePopoverRelationAgentGateKind,
        ) ||
        !nodePopoverRelationHandoffSummary.includes(expectedNodePopoverRelationAction)
      ) {
        return `WebView Relief selected node popover relation row handoff summary was incomplete (${nodePopoverRelationHandoffSummary || "missing"})`;
      }
      if (!nodePopoverRelationAccessibleName.includes(nodePopoverRelationHandoffSummary)) {
        return "WebView Relief selected node popover relation row accessible name did not include handoff summary";
      }
      const nodePopoverRelationHandoffTool =
        typeof payload.markers.topologyNodePopoverRelationHandoffTool === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffTool.trim()
          : "";
      const nodePopoverRelationHandoffOperation =
        typeof payload.markers.topologyNodePopoverRelationHandoffOperation === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffOperation.trim()
          : "";
      const nodePopoverRelationHandoffFrom =
        typeof payload.markers.topologyNodePopoverRelationHandoffFrom === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffFrom.trim()
          : "";
      const nodePopoverRelationHandoffTo =
        typeof payload.markers.topologyNodePopoverRelationHandoffTo === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffTo.trim()
          : "";
      const nodePopoverRelationHandoffType =
        typeof payload.markers.topologyNodePopoverRelationHandoffType === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffType.trim()
          : "";
      const nodePopoverRelationHandoffPayloadSummary =
        typeof payload.markers.topologyNodePopoverRelationHandoffPayloadSummary === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffPayloadSummary.trim()
          : "";
      const nodePopoverRelationHandoffPayloadJson =
        typeof payload.markers.topologyNodePopoverRelationHandoffPayloadJson === "string"
          ? payload.markers.topologyNodePopoverRelationHandoffPayloadJson.trim()
          : "";
      if (nodePopoverRelationHandoffTool !== "query_ontology") {
        return `WebView Relief selected node popover relation row reported ${nodePopoverRelationHandoffTool || "no"} MCP handoff tool`;
      }
      if (nodePopoverRelationHandoffOperation !== expectedNodePopoverRelationAction) {
        return `WebView Relief selected node popover relation row reported ${nodePopoverRelationHandoffOperation || "no"} MCP operation`;
      }
      if (
        nodePopoverRelationHandoffFrom !== nodePopoverRelationSourceId ||
        nodePopoverRelationHandoffTo !== nodePopoverRelationTargetId
      ) {
        return "WebView Relief selected node popover relation row MCP payload endpoints did not match source and target";
      }
      if (
        !nodePopoverRelationHandoffType ||
        nodePopoverRelationHandoffType !== payload.markers.topologyNodePopoverRelationType ||
        nodePopoverRelationHandoffPayloadSummary !==
          `query_ontology · ${expectedNodePopoverRelationAction} · ${nodePopoverRelationSourceId} -> ${nodePopoverRelationTargetId} · ${nodePopoverRelationHandoffType}`
      ) {
        return `WebView Relief selected node popover relation row MCP payload summary was malformed (${nodePopoverRelationHandoffPayloadSummary || "missing"})`;
      }
      const nodePopoverRelationPayloadChipTitle =
        typeof payload.markers.topologyNodePopoverRelationPayloadChipTitle === "string"
          ? payload.markers.topologyNodePopoverRelationPayloadChipTitle.trim()
          : "";
      const nodePopoverRelationPayloadChipSummary =
        typeof payload.markers.topologyNodePopoverRelationPayloadChipSummary === "string"
          ? payload.markers.topologyNodePopoverRelationPayloadChipSummary.trim()
          : "";
      if (nodePopoverRelationPayloadChipTitle !== nodePopoverRelationHandoffPayloadSummary) {
        return "WebView Relief selected node popover relation row JSON payload chip title did not match MCP payload summary";
      }
      if (nodePopoverRelationPayloadChipSummary !== nodePopoverRelationHandoffPayloadSummary) {
        return "WebView Relief selected node popover relation row JSON payload chip summary did not match MCP payload summary";
      }
      let parsedNodePopoverRelationHandoffPayload;
      try {
        parsedNodePopoverRelationHandoffPayload = JSON.parse(
          nodePopoverRelationHandoffPayloadJson,
        );
      } catch {
        return "WebView Relief selected node popover relation row MCP payload JSON was not parseable";
      }
      if (
        parsedNodePopoverRelationHandoffPayload?.tool !== "query_ontology" ||
        parsedNodePopoverRelationHandoffPayload?.operation !==
          expectedNodePopoverRelationAction ||
        parsedNodePopoverRelationHandoffPayload?.from !== nodePopoverRelationSourceId ||
        parsedNodePopoverRelationHandoffPayload?.to !== nodePopoverRelationTargetId ||
        parsedNodePopoverRelationHandoffPayload?.type !== nodePopoverRelationHandoffType
      ) {
        return "WebView Relief selected node popover relation row MCP payload JSON mismatched the row markers";
      }
      if (payload.markers.topologyNodePopoverAgentReadinessVisible !== true) {
        return "WebView Relief selected node popover did not expose an agent readiness lens";
      }
      const nodeAgentReadinessText =
        typeof payload.markers.topologyNodePopoverAgentReadinessText === "string"
          ? payload.markers.topologyNodePopoverAgentReadinessText.trim()
          : "";
      const nodeAgentReadinessReadable =
        /(handoff-ready|handoff 가능|전달 가능|인계 가능)[^\d]+\d+/i.test(
          nodeAgentReadinessText,
        ) &&
        /(preflight|사전 점검)[^\d]+\d+/i.test(nodeAgentReadinessText) &&
        /(review|검토)[^\d]+\d+/i.test(nodeAgentReadinessText) &&
        /[·,:]/.test(nodeAgentReadinessText);
      if (!nodeAgentReadinessReadable) {
        return `WebView Relief selected node popover reported unparseable agent readiness lens (${nodeAgentReadinessText || "unknown"})`;
      }
      const agentReadinessChips = Array.isArray(
        payload.markers.topologyNodePopoverAgentReadinessChips,
      )
        ? payload.markers.topologyNodePopoverAgentReadinessChips
        : [];
      const agentReadinessKinds = new Set(
        agentReadinessChips.map((chip) => chip?.kind).filter(Boolean),
      );
      for (const kind of ["ready", "preflight", "review"]) {
        if (!agentReadinessKinds.has(kind)) {
          return `WebView Relief selected node popover agent readiness lens is missing ${kind}`;
        }
      }
      if (
        requireTopologyDrag &&
        Number(payload.markers.topologySelectedDockCompanionCount) >= 1 &&
        Number(payload.markers.topologySelectedDockVisibleCompanionCount) < 1
      ) {
        const mapContextText =
          typeof payload.markers.topologyNodePopoverMapContextText === "string"
            ? payload.markers.topologyNodePopoverMapContextText.trim()
            : "";
        if (payload.markers.topologyNodePopoverMapContextVisible !== true) {
          return "WebView did not report the selected node map context note";
        }
        if (!(Number(payload.markers.topologyNodePopoverMapContextCount) >= 1)) {
          return `WebView reported an empty selected node map context note (${payload.markers.topologyNodePopoverMapContextCount ?? "missing"} connection(s))`;
        }
        if (
          payload.markers.topologyNodePopoverMapContextContract !==
          "expanded-relations-stay-on-map"
        ) {
          return `WebView reported malformed selected node map context contract (${payload.markers.topologyNodePopoverMapContextContract || "missing"})`;
        }
        if (
          payload.markers.topologyNodePopoverMapContextHandoffContract !==
          "map-visible-relations-summarized"
        ) {
          return `WebView reported malformed selected node map context handoff contract (${payload.markers.topologyNodePopoverMapContextHandoffContract || "missing"})`;
        }
        if (!(Number(payload.markers.topologyNodePopoverMapContextRelationTypeCount) >= 1)) {
          return `WebView reported empty selected node map context relation type count (${payload.markers.topologyNodePopoverMapContextRelationTypeCount ?? "missing"})`;
        }
        if (
          typeof payload.markers.topologyNodePopoverMapContextAgentReadinessSummary !==
            "string" ||
          payload.markers.topologyNodePopoverMapContextAgentReadinessSummary.trim().length === 0
        ) {
          return "WebView reported empty selected node map context agent readiness summary";
        }
        if (
          typeof payload.markers.topologyNodePopoverMapContextQualitySummary !== "string" ||
          payload.markers.topologyNodePopoverMapContextQualitySummary.trim().length === 0
        ) {
          return "WebView reported empty selected node map context quality summary";
        }
        if (!/(map|지도).*(inspect|확인|보기|겹침|overlap)/i.test(mapContextText)) {
          return `WebView reported an unclear selected node map context note (${mapContextText || "empty"})`;
        }
      }
      } else if (!selectedRelationContextVisible) {
        return "WebView Relief selected node popover was not visible after drag verification";
      }
      if (payload.markers.topologySelectedRelationClaimLensVisible !== true) {
        return "WebView did not report the Relief selected relation claim lens marker";
      }
      if (
        payload.markers.topologySelectedRelationHaloVisible === true &&
        (typeof payload.markers.topologySelectedRelationHaloQuality !== "string" ||
          payload.markers.topologySelectedRelationHaloQuality.trim().length === 0)
      ) {
        return "WebView reported empty Relief selected relation halo quality";
      }
      if (
        typeof payload.markers.topologySelectedRelationClaimLensText !== "string" ||
        !/(typed ontology fact|타입이 있는 온톨로지 사실)/i.test(
          payload.markers.topologySelectedRelationClaimLensText,
        )
      ) {
        return `WebView reported malformed Relief selected relation claim lens copy (${payload.markers.topologySelectedRelationClaimLensText ?? "unknown text"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationClaimLensQuality !== "string" ||
        !/^(strong|supported|weak|review)$/i.test(
          payload.markers.topologySelectedRelationClaimLensQuality,
        )
      ) {
        return `WebView reported malformed Relief selected relation claim lens quality marker (${payload.markers.topologySelectedRelationClaimLensQuality ?? "unknown marker"})`;
      }
      if (payload.markers.topologySelectedRelationClaimLensDotVisible !== true) {
        return "WebView did not report the Relief selected relation claim lens quality dot marker";
      }
      if (
        payload.markers.topologySelectedRelationContractKind !==
        "typed-fact-not-similarity"
      ) {
        return `WebView reported malformed Relief selected relation contract marker (${payload.markers.topologySelectedRelationContractKind ?? "unknown marker"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationContractText !== "string" ||
        !/(not a similarity score|유사도 점수가 아니라)/i.test(
          payload.markers.topologySelectedRelationContractText,
        ) ||
        !/(handoff confidence|handoff 신뢰도|전달 신뢰도)/i.test(
          payload.markers.topologySelectedRelationContractText,
        )
      ) {
        return `WebView reported malformed Relief selected relation contract copy (${payload.markers.topologySelectedRelationContractText ?? "unknown text"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationAgentGateText !== "string" ||
        !/(MCP\/CLI ready|handoff ready|preflight first|review first|handoff 준비됨|전달 준비됨|preflight 먼저|사전 점검 먼저|검토 먼저)/i.test(
          payload.markers.topologySelectedRelationAgentGateText,
        )
      ) {
        return `WebView reported malformed Relief selected relation agent gate copy (${payload.markers.topologySelectedRelationAgentGateText ?? "unknown text"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardQuality !== "string" ||
        !/^(strong|supported|weak|review)$/i.test(
          payload.markers.topologySelectedRelationCardQuality,
        )
      ) {
        return `WebView reported malformed Relief selected relation card quality marker (${payload.markers.topologySelectedRelationCardQuality ?? "unknown marker"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardEvidenceState !== "string" ||
        !/^(source-backed|authored|needs-review)$/.test(
          payload.markers.topologySelectedRelationCardEvidenceState,
        )
      ) {
        return `WebView reported malformed Relief selected relation card evidence marker (${payload.markers.topologySelectedRelationCardEvidenceState ?? "unknown marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationClaimLensQuality !==
        payload.markers.topologySelectedRelationCardQuality
      ) {
        return `WebView reported mismatched Relief selected relation claim lens quality marker (${payload.markers.topologySelectedRelationClaimLensQuality ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardQuality ?? "unknown card marker"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationLabelEvidenceState === "string" &&
        payload.markers.topologySelectedRelationLabelEvidenceState.trim().length > 0 &&
        payload.markers.topologySelectedRelationLabelEvidenceState !==
          payload.markers.topologySelectedRelationCardEvidenceState
      ) {
        return `WebView reported mismatched Relief selected relation label/card evidence marker (${payload.markers.topologySelectedRelationLabelEvidenceState ?? "unknown label marker"} vs ${payload.markers.topologySelectedRelationCardEvidenceState ?? "unknown card marker"})`;
      }
      const selectedRelationCardRect = {
        left: Number(payload.markers.topologySelectedRelationCardLeft || 0),
        top: Number(payload.markers.topologySelectedRelationCardTop || 0),
        right: Number(payload.markers.topologySelectedRelationCardRight || 0),
        bottom: Number(payload.markers.topologySelectedRelationCardBottom || 0),
        width: Number(payload.markers.topologySelectedRelationCardWidth || 0),
        height: Number(payload.markers.topologySelectedRelationCardHeight || 0),
      };
      const viewportWidth = Number(payload.width || 0);
      const viewportHeight = Number(payload.height || 0);
      const selectedRelationMinCardWidth = viewportWidth >= 1500 ? 236 : 220;
      const selectedRelationMaxCardHeight =
        viewportWidth >= 1500 && viewportHeight > 0
          ? Math.min(340, Math.max(190, viewportHeight - 160))
          : Number.POSITIVE_INFINITY;
      if (
        !Number.isFinite(selectedRelationCardRect.left) ||
        !Number.isFinite(selectedRelationCardRect.top) ||
        !Number.isFinite(selectedRelationCardRect.right) ||
        !Number.isFinite(selectedRelationCardRect.bottom) ||
        selectedRelationCardRect.width < selectedRelationMinCardWidth ||
        selectedRelationCardRect.height < 190
      ) {
        return `WebView reported undersized Relief selected relation card (${selectedRelationCardRect.width}x${selectedRelationCardRect.height})`;
      }
      if (selectedRelationCardRect.height > selectedRelationMaxCardHeight) {
        return `WebView reported oversized Relief selected relation card (${selectedRelationCardRect.width}x${selectedRelationCardRect.height})`;
      }
      if (viewportWidth >= 1500) {
        const selectedRelationMaxCardWidth = viewportWidth >= 1920 ? 360 : 320;
        if (selectedRelationCardRect.width > selectedRelationMaxCardWidth) {
          return `WebView reported oversized Relief selected relation card width (${selectedRelationCardRect.width}px > ${selectedRelationMaxCardWidth}px)`;
        }
        if (payload.markers.topologySelectedRelationCardSurfaceRole !== "active-relation-inspector") {
          return `WebView reported malformed Relief selected relation card surface role (${payload.markers.topologySelectedRelationCardSurfaceRole || "missing"})`;
        }
        if (payload.markers.topologySelectedRelationCardDensity !== "compact") {
          return `WebView reported malformed Relief selected relation card density (${payload.markers.topologySelectedRelationCardDensity || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationCardSurfaceToken !==
          "--topology-selected-relation-card-surface"
        ) {
          return `WebView reported malformed Relief selected relation card surface token (${payload.markers.topologySelectedRelationCardSurfaceToken || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationCardBorderToken !==
          "--topology-selected-relation-card-border"
        ) {
          return `WebView reported malformed Relief selected relation card border token (${payload.markers.topologySelectedRelationCardBorderToken || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationCardShadowToken !==
          "--topology-selected-relation-card-shadow"
        ) {
          return `WebView reported malformed Relief selected relation card shadow token (${payload.markers.topologySelectedRelationCardShadowToken || "missing"})`;
        }
        const selectedRelationCardDensityError =
          validateSelectedRelationCardDensityContract(payload.markers, viewportWidth);
        if (selectedRelationCardDensityError) {
          return selectedRelationCardDensityError;
        }
        if (
          payload.markers.topologySelectedRelationCardOverflowContract !==
          "no-horizontal-scroll"
        ) {
          return `WebView reported malformed Relief selected relation card overflow contract (${payload.markers.topologySelectedRelationCardOverflowContract || "missing"})`;
        }
        const selectedRelationCardClientWidth = Number(
          payload.markers.topologySelectedRelationCardClientWidth || 0,
        );
        const selectedRelationCardScrollWidth = Number(
          payload.markers.topologySelectedRelationCardScrollWidth || 0,
        );
        if (
          !Number.isFinite(selectedRelationCardClientWidth) ||
          !Number.isFinite(selectedRelationCardScrollWidth) ||
          selectedRelationCardClientWidth < selectedRelationMinCardWidth ||
          selectedRelationCardScrollWidth - selectedRelationCardClientWidth > 2
        ) {
          return `WebView reported overflowing Relief selected relation card (${selectedRelationCardClientWidth} client / ${selectedRelationCardScrollWidth} scroll)`;
        }
        if (
          payload.markers.topologySelectedRelationCardElevationContract !==
          "solid-active-inspector-over-map"
        ) {
          return `WebView reported malformed Relief selected relation card elevation contract (${payload.markers.topologySelectedRelationCardElevationContract || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationCardMotionContract !==
          "active-relation-inspector-entry"
        ) {
          return `WebView reported malformed Relief selected relation inspector motion contract (${payload.markers.topologySelectedRelationCardMotionContract || "missing"})`;
        }
        if (Number(payload.markers.topologySelectedRelationCardMotionDurationMs || 0) !== 180) {
          return `WebView reported malformed Relief selected relation inspector motion duration (${payload.markers.topologySelectedRelationCardMotionDurationMs || "missing"}ms)`;
        }
        if (payload.markers.topologySelectedRelationCardMotionEasing !== "ease-out") {
          return `WebView reported malformed Relief selected relation inspector motion easing (${payload.markers.topologySelectedRelationCardMotionEasing || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationCardActionMinWidthToken !==
            "--topology-selected-relation-action-min-width" ||
          payload.markers.topologySelectedRelationCopyActionRailMinWidthToken !==
            "--topology-selected-relation-action-min-width"
        ) {
          return "WebView reported malformed Relief selected relation copy action width token";
        }
        if (
          payload.markers.topologySelectedRelationCardCopyPayloadMinHeightToken !==
            "--topology-selected-relation-copy-payload-min-height" ||
          payload.markers.topologySelectedRelationCopyPayloadMinHeightToken !==
            "--topology-selected-relation-copy-payload-min-height"
        ) {
          return "WebView reported malformed Relief selected relation copy payload height token";
        }
        if (
          payload.markers.topologySelectedRelationCardRouteStepMinWidthToken !==
            "--topology-selected-relation-route-step-min-width" ||
          payload.markers.topologySelectedRelationAgentRouteStepMinWidthToken !==
            "--topology-selected-relation-route-step-min-width"
        ) {
          return "WebView reported malformed Relief selected relation route step width token";
        }
        if (
          payload.markers.topologySelectedRelationActionMinWidthTokenValue !== "86px" ||
          payload.markers.topologySelectedRelationCopyPayloadMinHeightTokenValue !== "30px" ||
          payload.markers.topologySelectedRelationRouteStepMinWidthTokenValue !== "48px"
        ) {
          return `WebView reported malformed Relief selected relation density token values (${payload.markers.topologySelectedRelationActionMinWidthTokenValue || "missing"} / ${payload.markers.topologySelectedRelationCopyPayloadMinHeightTokenValue || "missing"} / ${payload.markers.topologySelectedRelationRouteStepMinWidthTokenValue || "missing"})`;
        }
        if (
          payload.markers.topologySelectedRelationCardMotionSyncState !==
            "settled-with-camera" &&
          payload.markers.topologySelectedRelationCardMotionSyncState !==
            "reduced-motion-ready"
        ) {
          return `WebView reported malformed Relief selected relation inspector motion sync (${payload.markers.topologySelectedRelationCardMotionSyncState || "missing"})`;
        }
        if (selectedRelationCardRect.top < 96) {
          return `WebView reported insufficient Relief selected relation card top chrome clearance (${selectedRelationCardRect.top}px)`;
        }
        const proofBandWidth = Number(payload.markers.topologySelectedRelationProofBandWidth || 0);
        const proofBandHeight = Number(payload.markers.topologySelectedRelationProofBandHeight || 0);
        const contractRect = {
          top: Number(payload.markers.topologySelectedRelationContractTop || 0),
          width: Number(payload.markers.topologySelectedRelationContractWidth || 0),
          height: Number(payload.markers.topologySelectedRelationContractHeight || 0),
        };
        const decisionRect = {
          top: Number(payload.markers.topologySelectedRelationAgentDecisionTop || 0),
          width: Number(payload.markers.topologySelectedRelationAgentDecisionWidth || 0),
          height: Number(payload.markers.topologySelectedRelationAgentDecisionHeight || 0),
        };
        if (
          proofBandWidth < 226 ||
          proofBandHeight < 34 ||
          proofBandHeight > 95 ||
          contractRect.width < 108 ||
          decisionRect.width < 108 ||
          Math.abs(contractRect.top - decisionRect.top) > 2
        ) {
          return `WebView reported malformed compact Relief selected relation proof band (${proofBandWidth}x${proofBandHeight}, contract=${contractRect.width}x${contractRect.height}, decision=${decisionRect.width}x${decisionRect.height})`;
        }
        if (Number(payload.markers.topologySelectedRelationMetricStripHeight || 0) > 12) {
          return `WebView reported visible duplicate Relief selected relation metric strip (${payload.markers.topologySelectedRelationMetricStripWidth ?? 0}x${payload.markers.topologySelectedRelationMetricStripHeight ?? 0})`;
        }
        if (Number(payload.markers.topologySelectedRelationHandleStripHeight || 0) > 12) {
          return `WebView reported visible duplicate Relief selected relation handle strip (${payload.markers.topologySelectedRelationHandleStripWidth ?? 0}x${payload.markers.topologySelectedRelationHandleStripHeight ?? 0})`;
        }
      }
      if (
        viewportWidth > 0 &&
        viewportHeight > 0 &&
        (selectedRelationCardRect.left < 0 ||
          selectedRelationCardRect.top < 0 ||
          selectedRelationCardRect.right > viewportWidth ||
          selectedRelationCardRect.bottom > viewportHeight)
      ) {
        return `WebView reported out-of-bounds Relief selected relation card (${selectedRelationCardRect.left},${selectedRelationCardRect.top} ${selectedRelationCardRect.right}x${selectedRelationCardRect.bottom} within ${viewportWidth}x${viewportHeight})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardAgentGate !== "string" ||
        payload.markers.topologySelectedRelationCardAgentGate.trim().length === 0 ||
        payload.markers.topologySelectedRelationCardAgentGate !==
          payload.markers.topologySelectedRelationAgentGateText
      ) {
        return `WebView reported mismatched Relief selected relation card agent gate marker (${payload.markers.topologySelectedRelationCardAgentGate ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationAgentGateText ?? "unknown text"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardAgentGateKind !== "string" ||
        !/^(handoff-ready|preflight-first|review-first)$/.test(
          payload.markers.topologySelectedRelationCardAgentGateKind,
        )
      ) {
        return `WebView reported malformed Relief selected relation card agent gate kind marker (${payload.markers.topologySelectedRelationCardAgentGateKind ?? "unknown marker"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCardAgentDecision !== "string" ||
        payload.markers.topologySelectedRelationCardAgentDecision.trim().length === 0
      ) {
        return `WebView reported empty Relief selected relation card agent decision marker (${payload.markers.topologySelectedRelationCardAgentDecision ?? "unknown marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationAgentDecisionGateKind !==
        payload.markers.topologySelectedRelationCardAgentGateKind
      ) {
        return `WebView reported mismatched Relief selected relation decision gate kind marker (${payload.markers.topologySelectedRelationAgentDecisionGateKind ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardAgentGateKind ?? "unknown card marker"})`;
      }
      const expectedPrimaryAction =
        payload.markers.topologySelectedRelationCardAgentGateKind === "handoff-ready"
          ? "explain_relation"
          : "relation_check";
      if (
        payload.markers.topologySelectedRelationPrimaryCopyActionKind !==
        expectedPrimaryAction
      ) {
        return `WebView reported mismatched Relief selected relation primary copy action marker (${payload.markers.topologySelectedRelationPrimaryCopyActionKind ?? "unknown marker"} vs ${expectedPrimaryAction})`;
      }
      if (payload.markers.topologySelectedRelationPrimaryCopyRecommended !== true) {
        return `WebView reported Relief selected relation primary copy action is not marked recommended (${payload.markers.topologySelectedRelationPrimaryCopyRecommended ?? "unknown marker"})`;
      }
      const primaryCopyText =
        typeof payload.markers.topologySelectedRelationPrimaryCopyActionText === "string"
          ? payload.markers.topologySelectedRelationPrimaryCopyActionText.trim()
          : "";
      const hrefLocale = payload.href.includes("/ko/") ? "ko" : "en";
      const primaryCopyTextMatches =
        expectedPrimaryAction === "explain_relation"
          ? hrefLocale === "ko"
            ? /관계\s*설명/.test(primaryCopyText)
            : primaryCopyText.toLowerCase().includes("explain")
          : hrefLocale === "ko"
            ? /관계\s*(점검|사전\s*점검)/.test(primaryCopyText)
            : primaryCopyText.toLowerCase().includes("relation");
      if (!primaryCopyTextMatches) {
        return `WebView reported malformed Relief selected relation primary copy action text (${primaryCopyText || "empty"} vs ${expectedPrimaryAction})`;
      }
      const primaryCopyBadgeText =
        typeof payload.markers.topologySelectedRelationPrimaryCopyBadgeText === "string"
          ? payload.markers.topologySelectedRelationPrimaryCopyBadgeText.trim()
          : "";
      if (!/^(best next|next step|다음 액션|다음 작업|권장 다음 작업)$/i.test(primaryCopyBadgeText)) {
        return `WebView reported malformed Relief selected relation primary copy badge (${primaryCopyBadgeText || "empty"})`;
      }
      if (
        Number(payload.markers.topologySelectedRelationPrimaryCopyActionWidth || 0) < 90 ||
        Number(payload.markers.topologySelectedRelationPrimaryCopyActionHeight || 0) < 26
      ) {
        return `WebView reported undersized Relief selected relation primary copy action (${payload.markers.topologySelectedRelationPrimaryCopyActionWidth ?? 0}x${payload.markers.topologySelectedRelationPrimaryCopyActionHeight ?? 0})`;
      }
      if (payload.markers.topologySelectedRelationCopyPayloadTool !== "query_ontology") {
        return `WebView reported malformed Relief selected relation copy payload tool (${payload.markers.topologySelectedRelationCopyPayloadTool ?? "unknown marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationCopyPayloadOverflowContract !==
        "no-horizontal-scroll"
      ) {
        return `WebView reported malformed Relief selected relation copy payload overflow contract (${payload.markers.topologySelectedRelationCopyPayloadOverflowContract || "missing"})`;
      }
      if (payload.markers.topologySelectedRelationCopyPayloadAction !== expectedPrimaryAction) {
        return `WebView reported mismatched Relief selected relation copy payload action (${payload.markers.topologySelectedRelationCopyPayloadAction ?? "unknown marker"} vs ${expectedPrimaryAction})`;
      }
      if (
        payload.markers.topologySelectedRelationCopyPayloadEvidence !==
        payload.markers.topologySelectedRelationCardEvidenceState
      ) {
        return `WebView reported mismatched Relief selected relation copy payload evidence (${payload.markers.topologySelectedRelationCopyPayloadEvidence ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardEvidenceState ?? "unknown card marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationCopyPayloadGate !==
        payload.markers.topologySelectedRelationCardAgentGateKind
      ) {
        return `WebView reported mismatched Relief selected relation copy payload gate (${payload.markers.topologySelectedRelationCopyPayloadGate ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardAgentGateKind ?? "unknown card marker"})`;
      }
      if (
        typeof payload.markers.topologySelectedRelationCopyPayloadFrom !== "string" ||
        payload.markers.topologySelectedRelationCopyPayloadFrom.trim().length === 0 ||
        typeof payload.markers.topologySelectedRelationCopyPayloadTo !== "string" ||
        payload.markers.topologySelectedRelationCopyPayloadTo.trim().length === 0
      ) {
        return `WebView reported malformed Relief selected relation copy payload endpoints (${payload.markers.topologySelectedRelationCopyPayloadFrom ?? "unknown from"} -> ${payload.markers.topologySelectedRelationCopyPayloadTo ?? "unknown to"})`;
      }
      if (
        payload.markers.topologySelectedRelationHandleStripSource !==
          payload.markers.topologySelectedRelationCopyPayloadFrom ||
        payload.markers.topologySelectedRelationHandleStripTarget !==
          payload.markers.topologySelectedRelationCopyPayloadTo ||
        payload.markers.topologySelectedRelationHandleStripType !==
          payload.markers.topologySelectedRelationCopyPayloadType
      ) {
        return `WebView reported mismatched Relief selected relation ontology handle strip (${payload.markers.topologySelectedRelationHandleStripSource ?? "unknown source"} -> ${payload.markers.topologySelectedRelationHandleStripTarget ?? "unknown target"} · ${payload.markers.topologySelectedRelationHandleStripType ?? "unknown type"})`;
      }
      const handleSummary =
        typeof payload.markers.topologySelectedRelationHandleStripSummary === "string"
          ? payload.markers.topologySelectedRelationHandleStripSummary.trim()
          : "";
      if (
        !handleSummary.includes(payload.markers.topologySelectedRelationCopyPayloadFrom) ||
        !handleSummary.includes(payload.markers.topologySelectedRelationCopyPayloadTo) ||
        !handleSummary.includes(payload.markers.topologySelectedRelationCopyPayloadType) ||
        !handleSummary.includes("→")
      ) {
        return `WebView reported malformed Relief selected relation ontology handle summary (${handleSummary || "empty"})`;
      }
      const copyPayloadSummary =
        typeof payload.markers.topologySelectedRelationCopyPayloadSummary === "string"
          ? payload.markers.topologySelectedRelationCopyPayloadSummary.trim()
          : "";
      if (
        copyPayloadSummary !==
        `query_ontology · ${expectedPrimaryAction} · ${payload.markers.topologySelectedRelationCopyPayloadFrom} → ${payload.markers.topologySelectedRelationCopyPayloadTo} · ${payload.markers.topologySelectedRelationCopyPayloadType} · ${payload.markers.topologySelectedRelationCardEvidenceState} · ${payload.markers.topologySelectedRelationCardAgentGateKind}`
      ) {
        return `WebView reported malformed Relief selected relation copy payload summary (${copyPayloadSummary || "empty"})`;
      }
      const copyPayloadVisibleSummary =
        typeof payload.markers.topologySelectedRelationCopyPayloadVisibleSummary === "string"
          ? payload.markers.topologySelectedRelationCopyPayloadVisibleSummary.trim()
          : "";
      const expectedVisibleCopyPayloadSummary =
        expectedPrimaryAction === "relation_check" ? "Check first" : "Ready to explain";
      const koreanVisibleCopyPayloadSummary =
        expectedPrimaryAction === "relation_check" ? "점검 먼저" : "설명 준비";
      if (
        copyPayloadVisibleSummary !== expectedVisibleCopyPayloadSummary &&
        copyPayloadVisibleSummary !== koreanVisibleCopyPayloadSummary
      ) {
        return `WebView reported malformed Relief selected relation visible copy payload summary (${copyPayloadVisibleSummary || "empty"})`;
      }
      if (
        copyPayloadVisibleSummary.includes(payload.markers.topologySelectedRelationCopyPayloadType) ||
        copyPayloadVisibleSummary.includes(payload.markers.topologySelectedRelationCardEvidenceState) ||
        copyPayloadVisibleSummary.includes(payload.markers.topologySelectedRelationCardAgentGateKind)
      ) {
        return `WebView reported cramped Relief selected relation visible copy payload summary (${copyPayloadVisibleSummary})`;
      }
      const copyPayloadCall =
        typeof payload.markers.topologySelectedRelationCopyPayloadCall === "string"
          ? payload.markers.topologySelectedRelationCopyPayloadCall.trim()
          : "";
      const expectedCopyPayloadCall =
        expectedPrimaryAction === "relation_check"
          ? `query_ontology({"operation":"relation_check","from":"${payload.markers.topologySelectedRelationCopyPayloadFrom}","to":"${payload.markers.topologySelectedRelationCopyPayloadTo}","type":"${payload.markers.topologySelectedRelationCopyPayloadType}"})`
          : `query_ontology({"operation":"explain_relation","from":"${payload.markers.topologySelectedRelationCopyPayloadFrom}","to":"${payload.markers.topologySelectedRelationCopyPayloadTo}","direction":"undirected","maxHops":5,"limit":10})`;
      if (copyPayloadCall !== expectedCopyPayloadCall) {
        return `WebView reported malformed Relief selected relation primary copy payload call (${copyPayloadCall || "empty"})`;
      }
      const expectedCliFallbackCommand =
        expectedPrimaryAction === "relation_check"
          ? `ontology-atlas relation-check ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadFrom)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadTo)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadType)} [vault]`
          : `ontology-atlas explain ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadFrom)} ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadTo)} [vault] --type ${shellQuote(payload.markers.topologySelectedRelationCopyPayloadType)}`;
      const cliFallbackCommand =
        typeof payload.markers.topologySelectedRelationCliFallbackCommand === "string"
          ? payload.markers.topologySelectedRelationCliFallbackCommand.trim()
          : "";
      const cliFallbackSummary =
        typeof payload.markers.topologySelectedRelationCliFallbackSummary === "string"
          ? payload.markers.topologySelectedRelationCliFallbackSummary.trim()
          : "";
      if (cliFallbackCommand !== expectedCliFallbackCommand) {
        return `WebView reported malformed Relief selected relation CLI fallback (${cliFallbackCommand || "empty"})`;
      }
      if (cliFallbackSummary !== expectedCliFallbackCommand) {
        return `WebView reported malformed Relief selected relation CLI fallback summary (${cliFallbackSummary || "empty"})`;
      }
      const primaryCopyActionCall =
        typeof payload.markers.topologySelectedRelationPrimaryCopyActionCall === "string"
          ? payload.markers.topologySelectedRelationPrimaryCopyActionCall.trim()
          : "";
      const primaryCopyActionTitle =
        typeof payload.markers.topologySelectedRelationPrimaryCopyActionTitle === "string"
          ? payload.markers.topologySelectedRelationPrimaryCopyActionTitle.trim()
          : "";
      if (primaryCopyActionCall !== copyPayloadCall) {
        return `WebView reported mismatched Relief selected relation primary button payload call (${primaryCopyActionCall || "empty"} vs ${copyPayloadCall || "empty"})`;
      }
      if (primaryCopyActionTitle !== copyPayloadCall) {
        return `WebView reported mismatched Relief selected relation primary button payload title (${primaryCopyActionTitle || "empty"} vs ${copyPayloadCall || "empty"})`;
      }
      const copyActions = Array.isArray(payload.markers.topologySelectedRelationCopyActions)
        ? payload.markers.topologySelectedRelationCopyActions
        : [];
      if (copyActions.length !== 2) {
        return `WebView reported ${copyActions.length || "no"} Relief selected relation copy actions`;
      }
      const copyActionByKind = new Map(copyActions.map((action) => [action?.kind, action]));
      const expectedRelationCheckCall = `query_ontology({"operation":"relation_check","from":"${payload.markers.topologySelectedRelationCopyPayloadFrom}","to":"${payload.markers.topologySelectedRelationCopyPayloadTo}","type":"${payload.markers.topologySelectedRelationCopyPayloadType}"})`;
      const expectedExplainRelationCall = `query_ontology({"operation":"explain_relation","from":"${payload.markers.topologySelectedRelationCopyPayloadFrom}","to":"${payload.markers.topologySelectedRelationCopyPayloadTo}","direction":"undirected","maxHops":5,"limit":10})`;
      for (const [kind, expectedCall] of [
        ["relation_check", expectedRelationCheckCall],
        ["explain_relation", expectedExplainRelationCall],
      ]) {
        const action = copyActionByKind.get(kind);
        if (!action) {
          return `WebView omitted Relief selected relation ${kind} copy action`;
        }
        if (action.call !== expectedCall || action.title !== expectedCall) {
          return `WebView reported malformed Relief selected relation ${kind} copy action payload`;
        }
        if (!(Number(action.width) >= 90) || !(Number(action.height) >= 26)) {
          return `WebView reported undersized Relief selected relation ${kind} copy action (${action.width ?? 0}x${action.height ?? 0})`;
        }
      }
      const recommendedActions = copyActions.filter((action) => action?.recommended);
      if (
        recommendedActions.length !== 1 ||
        recommendedActions[0]?.kind !== expectedPrimaryAction ||
        recommendedActions[0]?.priority !== "primary"
      ) {
        return `WebView reported malformed Relief selected relation recommended copy action (${recommendedActions.map((action) => action?.kind).join(",") || "missing"})`;
      }
      if (
        typeof recommendedActions[0]?.recommendationLabel !== "string" ||
        recommendedActions[0].recommendationLabel.trim().length === 0 ||
        payload.markers.topologySelectedRelationPrimaryCopyBadgeText !==
          recommendedActions[0].recommendationLabel
      ) {
        return `WebView reported malformed Relief selected relation recommended copy marker (${recommendedActions[0]?.recommendationLabel || "missing"})`;
      }
      if (
        typeof recommendedActions[0]?.text === "string" &&
        recommendedActions[0].text.includes(recommendedActions[0].recommendationLabel)
      ) {
        return `WebView reported cramped Relief selected relation recommended copy text (${recommendedActions[0].text})`;
      }
      if (
        payload.markers.topologySelectedRelationCopyActionRailOverflowContract !==
        "no-horizontal-scroll"
      ) {
        return `WebView reported malformed Relief selected relation copy action rail overflow contract (${payload.markers.topologySelectedRelationCopyActionRailOverflowContract || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationCopyActionRailDensityContract !==
        "single-row-compact"
      ) {
        return `WebView reported malformed Relief selected relation copy action rail density contract (${payload.markers.topologySelectedRelationCopyActionRailDensityContract || "missing"})`;
      }
      const copyActionRailClientWidth = Number(
        payload.markers.topologySelectedRelationCopyActionRailClientWidth || 0,
      );
      const copyActionRailScrollWidth = Number(
        payload.markers.topologySelectedRelationCopyActionRailScrollWidth || 0,
      );
      const copyActionRailHeight = Number(
        payload.markers.topologySelectedRelationCopyActionRailHeight || 0,
      );
      if (
        !Number.isFinite(copyActionRailClientWidth) ||
        !Number.isFinite(copyActionRailScrollWidth) ||
        !Number.isFinite(copyActionRailHeight) ||
        copyActionRailClientWidth < 180 ||
        copyActionRailScrollWidth - copyActionRailClientWidth > 2 ||
        copyActionRailHeight > 44
      ) {
        return `WebView reported overflowing Relief selected relation copy action rail (${copyActionRailClientWidth} client / ${copyActionRailScrollWidth} scroll / ${copyActionRailHeight} height)`;
      }
      if (
        Number(payload.markers.topologySelectedRelationCopyPayloadWidth || 0) < 180 ||
        Number(payload.markers.topologySelectedRelationCopyPayloadHeight || 0) < 28
      ) {
        return `WebView reported undersized Relief selected relation copy payload strip (${payload.markers.topologySelectedRelationCopyPayloadWidth ?? 0}x${payload.markers.topologySelectedRelationCopyPayloadHeight ?? 0})`;
      }
      if (Number(payload.markers.topologySelectedRelationCopyPayloadHeight || 0) > 48) {
        return `WebView reported oversized Relief selected relation copy payload strip (${payload.markers.topologySelectedRelationCopyPayloadWidth ?? 0}x${payload.markers.topologySelectedRelationCopyPayloadHeight ?? 0})`;
      }
      const copyPayloadClientWidth = Number(
        payload.markers.topologySelectedRelationCopyPayloadClientWidth || 0,
      );
      const copyPayloadScrollWidth = Number(
        payload.markers.topologySelectedRelationCopyPayloadScrollWidth || 0,
      );
      if (
        !Number.isFinite(copyPayloadClientWidth) ||
        !Number.isFinite(copyPayloadScrollWidth) ||
        copyPayloadClientWidth < 180 ||
        copyPayloadScrollWidth - copyPayloadClientWidth > 2
      ) {
        return `WebView reported overflowing Relief selected relation copy payload strip (${copyPayloadClientWidth} client / ${copyPayloadScrollWidth} scroll)`;
      }
      const agentRouteSteps = Array.isArray(
        payload.markers.topologySelectedRelationAgentRouteSteps,
      )
        ? payload.markers.topologySelectedRelationAgentRouteSteps
        : [];
      const agentRouteKinds = agentRouteSteps.map((step) => step?.kind).join(">");
      if (agentRouteKinds !== "fact>evidence>gate>action") {
        return `WebView reported malformed Relief selected relation agent route steps (${agentRouteKinds || "missing"})`;
      }
      if (payload.markers.topologySelectedRelationAgentRouteDensity !== "micro-rail") {
        return `WebView reported malformed Relief selected relation agent route density (${payload.markers.topologySelectedRelationAgentRouteDensity || "missing"})`;
      }
      if (
        payload.markers.topologySelectedRelationAgentRouteOverflowContract !==
        "no-horizontal-scroll"
      ) {
        return `WebView reported malformed Relief selected relation agent route overflow contract (${payload.markers.topologySelectedRelationAgentRouteOverflowContract || "missing"})`;
      }
      const agentRouteClientWidth = Number(
        payload.markers.topologySelectedRelationAgentRouteClientWidth || 0,
      );
      const agentRouteScrollWidth = Number(
        payload.markers.topologySelectedRelationAgentRouteScrollWidth || 0,
      );
      if (
        !Number.isFinite(agentRouteClientWidth) ||
        !Number.isFinite(agentRouteScrollWidth) ||
        agentRouteClientWidth < 180 ||
        agentRouteScrollWidth - agentRouteClientWidth > 2
      ) {
        return `WebView reported overflowing Relief selected relation agent route (${agentRouteClientWidth} client / ${agentRouteScrollWidth} scroll)`;
      }
      const agentRouteEvidenceStep = agentRouteSteps.find((step) => step?.kind === "evidence");
      if (
        typeof agentRouteEvidenceStep?.value !== "string" ||
        agentRouteEvidenceStep.value.trim().length === 0 ||
        !/(source|authored|review|출처|작성자|검토)/i.test(agentRouteEvidenceStep.value)
      ) {
        return `WebView reported malformed Relief selected relation agent route evidence step (${agentRouteEvidenceStep?.value ?? "missing"})`;
      }
      const narrowRouteStep = agentRouteSteps.find((step) => {
        if (step?.visibility === "metadata-only" || step?.kind === "action") {
          return false;
        }
        return Number(step?.width || 0) < 48;
      });
      if (narrowRouteStep) {
        return `WebView reported cramped Relief selected relation agent route step (${narrowRouteStep.kind || "unknown"} ${narrowRouteStep.width ?? 0}x${narrowRouteStep.height ?? 0})`;
      }
      if (
        payload.markers.topologySelectedRelationAgentRouteGateKind !==
        payload.markers.topologySelectedRelationCardAgentGateKind
      ) {
        return `WebView reported mismatched Relief selected relation route gate marker (${payload.markers.topologySelectedRelationAgentRouteGateKind ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardAgentGateKind ?? "unknown card marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationAgentRouteEvidenceState !==
        payload.markers.topologySelectedRelationCardEvidenceState
      ) {
        return `WebView reported mismatched Relief selected relation route evidence marker (${payload.markers.topologySelectedRelationAgentRouteEvidenceState ?? "unknown marker"} vs ${payload.markers.topologySelectedRelationCardEvidenceState ?? "unknown card marker"})`;
      }
      if (
        payload.markers.topologySelectedRelationAgentRoutePrimaryAction !==
        expectedPrimaryAction
      ) {
        return `WebView reported mismatched Relief selected relation route action marker (${payload.markers.topologySelectedRelationAgentRoutePrimaryAction ?? "unknown marker"} vs ${expectedPrimaryAction})`;
      }
      const routeActionStep = agentRouteSteps.find((step) => step?.kind === "action");
      if (
        typeof routeActionStep?.value !== "string" ||
        routeActionStep.value.trim() !== expectedPrimaryAction
      ) {
        return `WebView reported malformed Relief selected relation route action copy (${routeActionStep?.value ?? "unknown"})`;
      }
      const selectedRelationCardAttentionLaneError =
        validateSelectedRelationCardAttentionLane(payload.markers, viewportWidth);
      if (selectedRelationCardAttentionLaneError) {
        return selectedRelationCardAttentionLaneError;
      }
      if (
        typeof payload.markers.topologySelectedRelationAgentDecisionText !== "string" ||
        !/(agent handoff|에이전트 전달|relation_check|agent-ready|관계 근거|handoff|전달)/i.test(
          payload.markers.topologySelectedRelationAgentDecisionText,
        )
      ) {
        return `WebView reported malformed Relief selected relation agent decision copy (${payload.markers.topologySelectedRelationAgentDecisionText ?? "unknown text"})`;
      }
    }
  }
  if (
    !Number.isFinite(payload.width) ||
    !Number.isFinite(payload.height) ||
    payload.width <= 0 ||
    payload.height <= 0
  ) {
    return "WebView viewport dimensions were empty";
  }
  return null;
}

export async function waitForWebviewVerifyPayload(readStdout, {
  timeoutMs = WEBVIEW_VERIFY_TIMEOUT_MS,
  intervalMs = 100,
  validatePayload = () => null,
} = {}) {
  const started = Date.now();
  let payload = parseWebviewVerifyPayload(readStdout());
  let validationError = payload ? validatePayload(payload) : "missing WebView verification payload";
  while ((!payload || validationError) && Date.now() - started < timeoutMs) {
    await sleep(intervalMs);
    payload = parseWebviewVerifyPayload(readStdout());
    validationError = payload ? validatePayload(payload) : "missing WebView verification payload";
  }
  return { payload, validationError };
}

function readOnscreenWindows() {
  const swift = `
import CoreGraphics
import Foundation

let options = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
let windows = (CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]]) ?? []
let data = try JSONSerialization.data(withJSONObject: windows, options: [])
print(String(data: data, encoding: .utf8)!)
`;
  const result = spawnSync("swift", ["-e", swift], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(
      [
        "failed to inspect macOS windows with CoreGraphics",
        result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout;
}

function readAccessibilityWindows(pids) {
  const result = spawnSync("osascript", ["-e", buildAccessibilityWindowProbeScript(pids)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: ACCESSIBILITY_WINDOW_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    fail(
      [
        "failed to inspect macOS Accessibility windows with System Events",
        "grant Terminal/Codex Accessibility permission or rerun without --require-accessibility-window if only CG window proof is needed",
        result.error?.code === "ETIMEDOUT"
          ? `System Events did not respond within ${ACCESSIBILITY_WINDOW_TIMEOUT_MS}ms`
          : null,
        result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout;
}

function readAccessibilityWindowsBestEffort(pids) {
  const result = spawnSync("osascript", ["-e", buildAccessibilityWindowProbeScript(pids)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: ACCESSIBILITY_WINDOW_TIMEOUT_MS,
  });
  if (result.status === 0) {
    return { payload: result.stdout, error: null };
  }
  return {
    payload: "",
    error: [
      result.error?.code === "ETIMEDOUT"
        ? `System Events did not respond within ${ACCESSIBILITY_WINDOW_TIMEOUT_MS}ms`
        : null,
      result.stderr.trim() ? result.stderr.trim() : null,
      result.status !== null ? `exit status ${result.status}` : null,
    ].filter(Boolean).join("; ") || "Accessibility window probe unavailable",
  };
}

function readAccessibilityText(pids, requiredText) {
  const result = spawnSync("swift", ["-e", buildAccessibilityTextProbeSwift(pids, requiredText)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: ACCESSIBILITY_TEXT_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    fail(
      [
        "failed to inspect macOS Accessibility text with the Swift AX probe",
        "grant Terminal/Codex Accessibility permission or rerun without --require-accessibility-text if only window proof is needed",
        result.error?.code === "ETIMEDOUT"
          ? `Swift AX probe did not respond within ${ACCESSIBILITY_TEXT_TIMEOUT_MS}ms`
          : null,
        result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout;
}

function captureRegion(target, outPath) {
  const bounds = target.bounds;
  const x = Number(bounds?.X);
  const y = Number(bounds?.Y);
  const width = Number(bounds?.Width);
  const height = Number(bounds?.Height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }

  return spawnSync(
    "screencapture",
    ["-x", "-R", `${Math.round(x)},${Math.round(y)},${Math.round(width)},${Math.round(height)}`, outPath],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    },
  );
}

function buildImageVisualStatsSwift(imagePath) {
  const pathLiteral = JSON.stringify(imagePath);
  return `
import AppKit
import Foundation

let path = ${pathLiteral}
guard let image = NSImage(contentsOfFile: path),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  fputs("cannot decode image\\n", stderr)
  exit(2)
}
let width = cgImage.width
let height = cgImage.height
let side = 64
let bytesPerPixel = 4
let bytesPerRow = side * bytesPerPixel
var pixels = [UInt8](repeating: 0, count: side * side * bytesPerPixel)
let colorSpace = CGColorSpaceCreateDeviceRGB()
guard let context = CGContext(
  data: &pixels,
  width: side,
  height: side,
  bitsPerComponent: 8,
  bytesPerRow: bytesPerRow,
  space: colorSpace,
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
  fputs("cannot create bitmap context\\n", stderr)
  exit(3)
}
context.interpolationQuality = .none
context.draw(cgImage, in: CGRect(x: 0, y: 0, width: side, height: side))
var minLuma = 255.0
var maxLuma = 0.0
var nonDark = 0
for i in stride(from: 0, to: pixels.count, by: 4) {
  let r = Double(pixels[i])
  let g = Double(pixels[i + 1])
  let b = Double(pixels[i + 2])
  let a = Double(pixels[i + 3])
  let luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) * (a / 255.0)
  minLuma = min(minLuma, luma)
  maxLuma = max(maxLuma, luma)
  if luma > 8.0 { nonDark += 1 }
}
let sampleCount = side * side
let json = String(
  format: "{\\"width\\":%d,\\"height\\":%d,\\"sampleCount\\":%d,\\"nonDarkRatio\\":%.6f,\\"lumaSpread\\":%.3f}",
  width,
  height,
  sampleCount,
  Double(nonDark) / Double(sampleCount),
  maxLuma - minLuma
)
print(json)
`;
}

function readImageVisualStats(imagePath) {
  const result = spawnSync("swift", ["-e", buildImageVisualStatsSwift(imagePath)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 7000,
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: [
        result.error?.code === "ETIMEDOUT" ? "Swift image probe timed out" : null,
        result.stderr.trim(),
      ].filter(Boolean).join("; ") || "Swift image probe failed",
    };
  }
  try {
    return { ok: true, stats: JSON.parse(result.stdout.trim()) };
  } catch {
    return { ok: false, error: "Swift image probe returned invalid JSON" };
  }
}

export function validateVisualEvidenceStats(stats) {
  if (!stats || typeof stats !== "object") {
    return "image visual stats unavailable";
  }
  if (!Number.isFinite(stats.width) || !Number.isFinite(stats.height) || stats.width <= 0 || stats.height <= 0) {
    return "image visual stats have invalid dimensions";
  }
  if (
    !Number.isFinite(stats.nonDarkRatio) ||
    stats.nonDarkRatio < VISUAL_EVIDENCE_MIN_NON_DARK_RATIO
  ) {
    return `image appears blank or black (nonDarkRatio ${stats.nonDarkRatio ?? "unknown"})`;
  }
  if (
    !Number.isFinite(stats.lumaSpread) ||
    stats.lumaSpread < VISUAL_EVIDENCE_MIN_LUMA_SPREAD
  ) {
    return `image has too little visible contrast (lumaSpread ${stats.lumaSpread ?? "unknown"})`;
  }
  return null;
}

function visualEvidenceFailure(outPath, exists, stats) {
  if (!exists || !stats || stats.size <= 0) return null;
  const visual = readImageVisualStats(outPath);
  if (!visual.ok) return `image visual stats unavailable: ${visual.error}`;
  return validateVisualEvidenceStats(visual.stats);
}

function captureWindow(target, { keepPath = null } = {}) {
  const outPath = keepPath ?? path.join(
    "/tmp",
    `ontology-atlas-window-${process.pid}-${target.id}.png`,
  );
  if (keepPath) {
    fs.mkdirSync(path.dirname(keepPath), { recursive: true });
    fs.rmSync(keepPath, { force: true });
  }
  try {
    let method = "window-id";
    let result = spawnSync("screencapture", ["-x", "-l", String(target.id), outPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    });
    let exists = fs.existsSync(outPath);
    let stats = exists ? fs.statSync(outPath) : null;
    const windowIdError = result.stderr.trim();

    if (!(result.status === 0 && exists && stats && stats.size > 0)) {
      fs.rmSync(outPath, { force: true });
      const regionResult = captureRegion(target, outPath);
      if (regionResult) {
        method = "bounds-region";
        result = regionResult;
        exists = fs.existsSync(outPath);
        stats = exists ? fs.statSync(outPath) : null;
      }
    }

    const visualFailure = result.status === 0
      ? visualEvidenceFailure(outPath, exists, stats)
      : null;
    const ok = result.status === 0 && exists && stats && stats.size > 0 && !visualFailure;

    return {
      ...target,
      ok,
      method,
      status: result.status,
      stderr: [windowIdError ? `window-id: ${windowIdError}` : null, result.stderr.trim() ? `${method}: ${result.stderr.trim()}` : null, visualFailure ? `${method}: ${visualFailure}` : null]
        .filter(Boolean)
        .join("; "),
      bytes: stats?.size ?? 0,
      artifactPath: ok && keepPath
        ? keepPath
        : null,
    };
  } finally {
    if (!keepPath) {
      fs.rmSync(outPath, { force: true });
    }
  }
}

function captureScreenEvidence(outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.rmSync(outPath, { force: true });
  const result = spawnSync("screencapture", ["-x", outPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5000,
  });
  const exists = fs.existsSync(outPath);
  const stats = exists ? fs.statSync(outPath) : null;
  const visualFailure = result.status === 0
    ? visualEvidenceFailure(outPath, exists, stats)
    : null;
  const ok = result.status === 0 && exists && stats && stats.size > 0 && !visualFailure;
  return {
    id: null,
    ownerPid: null,
    ownerName: "desktop",
    name: "full screen",
    bounds: null,
    alpha: null,
    sharingState: null,
    storeType: null,
    memoryUsage: null,
    ok,
    method: "full-screen",
    status: result.status,
    stderr: [
      result.stderr.trim() ? `full-screen: ${result.stderr.trim()}` : null,
      visualFailure ? `full-screen: ${visualFailure}` : null,
    ].filter(Boolean).join("; "),
    bytes: stats?.size ?? 0,
    artifactPath: ok ? outPath : null,
  };
}

export function validateCapturableWindowRows(rows) {
  if (rows.length === 0) {
    return "no CoreGraphics window ids were available for capture";
  }
  if (!rows.some((row) => row.ok)) {
    return `no matching CoreGraphics window could be captured (${rows
      .map((row) => {
        const label = `${row.ownerName || "unknown"} window=${row.id}`;
        return row.stderr ? `${label}: ${row.stderr}` : label;
      })
      .join("; ")})`;
  }
  return null;
}

export function classifyVisualEvidenceBlocker({ activation = null, captureRows = [] } = {}) {
  if (captureRows.some((row) => row.ok && row.artifactPath)) {
    return "captured";
  }
  const activationError = `${activation?.stderr ?? ""} ${activation?.stdout ?? ""}`;
  const activationBlockedByAccessibility =
    activation?.frontmost === false &&
    /Accessibility|System Events|not authorized|not permitted|timed out|timeout/i.test(
      activationError,
    );
  const captureBlocked =
    captureRows.some((row) => typeof row.stderr === "string" && row.stderr.trim().length > 0);
  if (activationBlockedByAccessibility && captureBlocked) {
    return "macos-automation-and-screen-capture-blocked";
  }
  if (activation && activation.frontmost === false) {
    return "foreground-activation-unconfirmed";
  }
  if (
    captureRows.some((row) =>
      typeof row.stderr === "string" &&
      /blank|black|nonDarkRatio|too little visible contrast/i.test(row.stderr),
    )
  ) {
    return "screen-capture-returned-blank-image";
  }
  if (captureRows.some((row) => typeof row.stderr === "string" && row.stderr.trim().length > 0)) {
    return "screen-capture-command-failed";
  }
  return "screen-capture-unavailable";
}

export function visualEvidenceBlockerHint(blocker) {
  if (blocker === "macos-automation-and-screen-capture-blocked") {
    return {
      summary:
        "macOS automation and screen capture blocked visual evidence; WebView proof may still be valid.",
      nextActions: [
        "Grant Accessibility permission to the terminal or Codex host running the verifier.",
        "Grant Screen Recording permission, then rerun with --try-window-screenshot or --require-capturable-window.",
        "Use the saved WebView evidence JSON as deterministic route proof until PNG capture is available.",
      ],
    };
  }
  if (blocker === "foreground-activation-unconfirmed") {
    return {
      summary: "macOS did not confirm the launched app became frontmost.",
      nextActions: [
        "Rerun with --require-frontmost when foreground activation itself is the behavior under test.",
        "Inspect System Events Accessibility rows in the diagnostics payload.",
      ],
    };
  }
  if (blocker === "screen-capture-returned-blank-image") {
    return {
      summary: "screencapture returned a blank or low-contrast image.",
      nextActions: [
        "Grant Screen Recording permission to the terminal or Codex host.",
        "Rerun visual evidence capture after confirming the app window is visible on the current desktop.",
      ],
    };
  }
  if (blocker === "screen-capture-command-failed") {
    return {
      summary: "screencapture failed for the matching CoreGraphics window.",
      nextActions: [
        "Inspect captureRows stderr for the failing window-id or bounds-region method.",
        "Rerun with --print-window-diagnostics when capturable-window proof is required.",
      ],
    };
  }
  return {
    summary: "visual evidence capture was unavailable.",
    nextActions: [
      "Inspect the saved diagnostics payload before treating the missing screenshot as an app failure.",
    ],
  };
}

export function formatVisualEvidenceHandoffLines({
  blocker,
  requestedPath,
  diagnosticsPath,
  webviewEvidencePath = null,
  hint,
}) {
  return [
    `[desktop-app-verify:visual-evidence] blocker ${blocker}: ${hint.summary}`,
    webviewEvidencePath
      ? `[desktop-app-verify:visual-evidence] WebView route proof: ${webviewEvidencePath}`
      : null,
    ...hint.nextActions.map((action, index) =>
      `[desktop-app-verify:visual-evidence] next action ${index + 1}: ${action}`,
    ),
    `[desktop-app-verify:visual-evidence] diagnostics saved ${diagnosticsPath}`,
    `[desktop-app-verify:visual-evidence] screenshot unavailable for ${requestedPath}`,
  ].filter(Boolean);
}

function verifyOnscreenWindow({
  appPath,
  executablePath,
  requireOwnerName,
  minWindowSize,
}) {
  const pids = processIds(executablePath);
  if (pids.length === 0) {
    fail(`${path.basename(appPath)} has no running process for ${executablePath}.`);
  }

  const windows = parseOnscreenWindows(readOnscreenWindows(), pids);
  if (windows.length === 0) {
    fail(
      `${path.basename(appPath)} is running but has no on-screen macOS window for PID(s) ${pids.join(", ")}.`,
    );
  }
  const unmetRequirement = validateWindowRequirements(windows, {
    requireOwnerName,
    minWindowSize,
  });
  if (unmetRequirement) {
    fail(
      `${path.basename(appPath)} has ${windows.length} visible window(s), but ${unmetRequirement}.`,
    );
  }
  return windows;
}

function verifyCapturableWindow({
  appPath,
  executablePath,
  windows,
  windowScreenshotPath = null,
  printDiagnosticsOnFailure = false,
}) {
  let savedCapture = false;
  const rows = windowCaptureTargets(windows).map((target) => {
    const row = captureWindow(target, {
      keepPath: windowScreenshotPath && !savedCapture ? windowScreenshotPath : null,
    });
    if (row.ok && row.artifactPath) {
      savedCapture = true;
    }
    return row;
  });
  const unmetRequirement = validateCapturableWindowRows(rows);
  if (unmetRequirement) {
    if (windowScreenshotPath) {
      fs.rmSync(windowScreenshotPath, { force: true });
    }
    if (printDiagnosticsOnFailure) {
      printWindowDiagnostics({ executablePath, windows, captureRows: rows });
    }
    fail(
      `${path.basename(appPath)} has CoreGraphics window metadata but no capturable current-desktop window: ${unmetRequirement}.`,
    );
  }
  const savedRow = rows.find((row) => row.ok && row.artifactPath);
  return savedRow
    ? normalizeVisualEvidenceReference({
        screenshotPath: savedRow.artifactPath,
        screenshotStatus: "saved",
        bytes: savedRow.bytes,
        method: savedRow.method,
      })
    : null;
}

function tryCaptureWindowEvidence({
  appPath,
  executablePath,
  windows,
  windowScreenshotPath,
  webviewEvidencePath = null,
}) {
  if (!windowScreenshotPath || windows.length === 0) {
    return null;
  }
  const activation = activateAppForVisualEvidence({ appPath, executablePath });
  const activationDetail = [
    activation.bundleIdentifier ? `bundleId=${activation.bundleIdentifier}` : null,
    activation.pids.length > 0 ? `pids=${activation.pids.join(",")}` : "pids=none",
    `frontmost=${activation.frontmost}`,
    activation.stdout ? `stdout=${activation.stdout}` : null,
    activation.stderr ? `stderr=${activation.stderr}` : null,
  ].filter(Boolean).join(" ");
  console.log(
    `[desktop-app-verify:visual-evidence] foreground activation ${activation.ok ? "ok" : "unconfirmed"} ${activationDetail}`,
  );
  let savedCapture = false;
  const rows = windowCaptureTargets(windows).map((target) => {
    const row = captureWindow(target, {
      keepPath: !savedCapture ? windowScreenshotPath : null,
    });
    if (row.ok && row.artifactPath) {
      savedCapture = true;
    }
    return row;
  });
  const savedRow = rows.find((row) => row.ok && row.artifactPath);
  if (savedRow) {
    console.log(
      `[desktop-app-verify:visual-evidence] saved ${path.resolve(savedRow.artifactPath)} (${savedRow.bytes} bytes, ${savedRow.method})`,
    );
    return normalizeVisualEvidenceReference({
      screenshotPath: savedRow.artifactPath,
      screenshotStatus: "saved",
      bytes: savedRow.bytes,
      method: savedRow.method,
    });
  }
  fs.rmSync(windowScreenshotPath, { force: true });
  const fallbackRow = captureScreenEvidence(windowScreenshotPath);
  const allRows = [...rows, fallbackRow];
  if (fallbackRow.ok && fallbackRow.artifactPath) {
    console.log(
      `[desktop-app-verify:visual-evidence] saved ${path.resolve(fallbackRow.artifactPath)} (${fallbackRow.bytes} bytes, ${fallbackRow.method} fallback)`,
    );
    return normalizeVisualEvidenceReference({
      screenshotPath: fallbackRow.artifactPath,
      screenshotStatus: "saved",
      bytes: fallbackRow.bytes,
      method: fallbackRow.method,
    });
  }
  fs.rmSync(windowScreenshotPath, { force: true });
  const diagnostics = collectWindowDiagnostics({
    executablePath,
    windows,
    captureRows: allRows,
    allowAccessibilityFailure: true,
  });
  const blocker = classifyVisualEvidenceBlocker({ activation, captureRows: allRows });
  const blockerHint = visualEvidenceBlockerHint(blocker);
  const diagnosticsPath = `${windowScreenshotPath}.diagnostics.json`;
  fs.mkdirSync(path.dirname(diagnosticsPath), { recursive: true });
  fs.writeFileSync(
    diagnosticsPath,
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        visualEvidence: {
          requestedPath: path.resolve(windowScreenshotPath),
          saved: false,
          blocker,
          summary: blockerHint.summary,
          nextActions: blockerHint.nextActions,
          webviewEvidencePath: webviewEvidencePath ? path.resolve(webviewEvidencePath) : null,
          activation: {
            ok: activation.ok,
            frontmost: activation.frontmost,
            stdout: activation.stdout,
            stderr: activation.stderr,
          },
        },
        diagnostics,
      },
      null,
      2,
    )}\n`,
  );
  for (const line of formatVisualEvidenceHandoffLines({
    blocker,
    requestedPath: path.resolve(windowScreenshotPath),
    diagnosticsPath: path.resolve(diagnosticsPath),
    webviewEvidencePath: webviewEvidencePath ? path.resolve(webviewEvidencePath) : null,
    hint: blockerHint,
  })) {
    console.log(line);
  }
  console.log(`[desktop-app-verify:window-diagnostics] ${JSON.stringify(diagnostics)}`);
  return normalizeVisualEvidenceReference({
    screenshotPath: windowScreenshotPath,
    screenshotStatus: "unavailable",
    blocker,
    diagnosticsPath,
    summary: blockerHint.summary,
    nextActions: blockerHint.nextActions,
  });
}

function verifyAccessibilityWindow({ appPath, executablePath }) {
  const pids = processIds(executablePath);
  if (pids.length === 0) {
    fail(`${path.basename(appPath)} has no running process for ${executablePath}.`);
  }

  const rows = parseAccessibilityWindowRows(readAccessibilityWindows(pids));
  const unmetRequirement = validateAccessibilityWindowRows(rows);
  if (unmetRequirement) {
    fail(
      `${path.basename(appPath)} is running but is not Accessibility-window observable for PID(s) ${pids.join(", ")}: ${unmetRequirement}.`,
    );
  }
}

function verifyFrontmostWindow({ appPath, executablePath, printDiagnosticsOnFailure = false }) {
  const pids = processIds(executablePath);
  if (pids.length === 0) {
    fail(`${path.basename(appPath)} has no running process for ${executablePath}.`);
  }

  const rows = parseAccessibilityWindowRows(readAccessibilityWindows(pids));
  const unmetRequirement = validateFrontmostAccessibilityRows(rows);
  if (unmetRequirement) {
    if (printDiagnosticsOnFailure) {
      printWindowDiagnostics({ executablePath });
    }
    fail(
      `${path.basename(appPath)} is running but is not the foreground macOS app for PID(s) ${pids.join(", ")}: ${unmetRequirement}.`,
    );
  }
}

function verifyAccessibilityText({ appPath, executablePath, requiredText }) {
  const pids = processIds(executablePath);
  if (pids.length === 0) {
    fail(`${path.basename(appPath)} has no running process for ${executablePath}.`);
  }

  const payload = readAccessibilityText(pids, requiredText);
  const unmetRequirement = validateAccessibilityText(payload, requiredText);
  if (unmetRequirement) {
    fail(
      `${path.basename(appPath)} is running but its Accessibility tree did not prove the required app content: ${unmetRequirement}.`,
    );
  }
}

export function formatWindowDiagnosticsPayload({
  pids,
  windows,
  accessibilityRows,
  accessibilityError = null,
  captureRows = [],
}) {
  return {
    pids,
    windows: windows.map((window) => ({
      windowNumber: window.kCGWindowNumber,
      ownerPid: window.kCGWindowOwnerPID,
      ownerName: window.kCGWindowOwnerName,
      name: window.kCGWindowName,
      bounds: window.kCGWindowBounds,
      layer: window.kCGWindowLayer,
      onscreen: window.kCGWindowIsOnscreen,
      alpha: window.kCGWindowAlpha ?? null,
      sharingState: window.kCGWindowSharingState ?? null,
      storeType: window.kCGWindowStoreType ?? null,
      memoryUsage: window.kCGWindowMemoryUsage ?? null,
    })),
    accessibilityRows,
    ...(accessibilityError ? { accessibilityError } : {}),
    captureRows: captureRows.map((row) => ({
      windowNumber: row.id,
      ownerName: row.ownerName,
      sharingState: row.sharingState ?? null,
      alpha: row.alpha ?? null,
      ok: row.ok,
      method: row.method,
      stderr: row.stderr,
      bytes: row.bytes,
      artifactPath: row.artifactPath ?? null,
    })),
  };
}

export function collectWindowDiagnostics({
  executablePath,
  windows = null,
  captureRows = [],
  allowAccessibilityFailure = false,
  processIdsFn = processIds,
  readOnscreenWindowsFn = readOnscreenWindows,
  readAccessibilityWindowsFn = readAccessibilityWindows,
} = {}) {
  const pids = processIdsFn(executablePath);
  const resolvedWindows = windows ?? (pids.length > 0 ? parseOnscreenWindows(readOnscreenWindowsFn(), pids) : []);
  let accessibilityRows = [];
  let accessibilityError = null;
  if (pids.length > 0) {
    try {
      if (allowAccessibilityFailure && readAccessibilityWindowsFn === readAccessibilityWindows) {
        const accessibility = readAccessibilityWindowsBestEffort(pids);
        accessibilityRows = parseAccessibilityWindowRows(accessibility.payload);
        accessibilityError = accessibility.error;
      } else {
        accessibilityRows = parseAccessibilityWindowRows(readAccessibilityWindowsFn(pids));
      }
    } catch (error) {
      if (!allowAccessibilityFailure) throw error;
      accessibilityError = error instanceof Error ? error.message : String(error);
    }
  }
  return formatWindowDiagnosticsPayload({
    pids,
    windows: resolvedWindows,
    accessibilityRows,
    accessibilityError,
    captureRows,
  });
}

function printWindowDiagnostics({ executablePath, windows = null, captureRows = [] }) {
  console.log(
    `[desktop-app-verify:window-diagnostics] ${JSON.stringify(
      collectWindowDiagnostics({ executablePath, windows, captureRows }),
    )}`,
  );
}

function markerNumber(markers, key) {
  const value = Number(markers?.[key]);
  return Number.isFinite(value) ? value : null;
}

function extractBackdropAlpha(background) {
  const value = String(background || "");
  const alpha = Number(
    value.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/)?.[1] ||
    value.match(/\/\s*([0-9.]+)\s*\)/)?.[1] ||
    "0",
  );
  return Number.isFinite(alpha) ? alpha : null;
}

function evidenceRoute(href) {
  try {
    const url = new URL(href);
    return `${url.pathname}${url.search}`;
  } catch {
    return "";
  }
}

function normalizeVisualEvidenceReference(visualEvidence, visualEvidencePath = null) {
  if (visualEvidence && typeof visualEvidence === "object") {
    const screenshotPath = visualEvidence.screenshotPath ?? visualEvidence.artifactPath;
    if (typeof screenshotPath !== "string" || screenshotPath.trim() === "") return null;
    const screenshotStatus = ["saved", "unavailable", "requested"].includes(
      visualEvidence.screenshotStatus,
    )
      ? visualEvidence.screenshotStatus
      : "requested";
    const reference = {
      screenshotPath: path.resolve(screenshotPath),
      screenshotStatus,
    };
    if (Number.isFinite(visualEvidence.bytes)) {
      reference.bytes = visualEvidence.bytes;
    }
    if (typeof visualEvidence.method === "string" && visualEvidence.method.trim()) {
      reference.method = visualEvidence.method.trim();
    }
    if (typeof visualEvidence.blocker === "string" && visualEvidence.blocker.trim()) {
      reference.blocker = visualEvidence.blocker.trim();
    }
    if (typeof visualEvidence.diagnosticsPath === "string" && visualEvidence.diagnosticsPath.trim()) {
      reference.diagnosticsPath = path.resolve(visualEvidence.diagnosticsPath);
    }
    if (typeof visualEvidence.summary === "string" && visualEvidence.summary.trim()) {
      reference.summary = visualEvidence.summary.trim();
    }
    if (Array.isArray(visualEvidence.nextActions) && visualEvidence.nextActions.length > 0) {
      reference.nextActions = visualEvidence.nextActions
        .filter((action) => typeof action === "string" && action.trim())
        .map((action) => action.trim());
    }
    return reference;
  }
  if (visualEvidencePath) {
    return {
      screenshotPath: path.resolve(visualEvidencePath),
      screenshotStatus: "requested",
    };
  }
  return null;
}

const COMPOSER_DISMISSED_SURFACE_KINDS = [
  "context-menu",
  "selected-relation",
  "search-panel",
  "path-prompt",
  "node-popover",
  "support-panel",
];

export function buildWebviewEvidencePayload(
  payload,
  {
    capturedAt = new Date().toISOString(),
    visualEvidence = null,
    visualEvidencePath = null,
  } = {},
) {
  const markers = payload?.markers ?? {};
  const visualEvidenceReference = normalizeVisualEvidenceReference(visualEvidence, visualEvidencePath);
  const composerBlockingProof = markers.topologyCreateNodeOpen === true
    ? {
      proof: "topology-add-concept-composer-blocking",
      status: "proved",
      route: evidenceRoute(payload?.href),
      attention: {
        winner: markers.topologyAttentionWinner ?? null,
        panelRole: markers.topologyCreateNodePanelAttentionRole ?? null,
        placementContract: markers.topologyCreateNodePanelPlacementContract ?? null,
        surfaceRole: markers.topologyCreateNodeSurfaceRole ?? null,
        elevationContract: markers.topologyCreateNodeElevationContract ?? null,
        sizeContract: markers.topologyCreateNodeSizeContract ?? null,
        topToken: markers.topologyCreateNodePanelTopToken ?? null,
        widthToken: markers.topologyCreateNodePanelWidthToken ?? null,
        maxHeightToken: markers.topologyCreateNodePanelMaxHeightToken ?? null,
        surfaceToken: markers.topologyCreateNodeFormSurfaceToken ?? null,
        borderToken: markers.topologyCreateNodeFormBorderToken ?? null,
        shadowToken: markers.topologyCreateNodeFormShadowToken ?? null,
        role: markers.topologyCreateNodePanelRole ?? null,
        ariaModal: markers.topologyCreateNodePanelAriaModal ?? null,
        focusInside: markers.topologyCreateNodeFocusInside === true,
        activeElementTestId: markers.topologyCreateNodeActiveElementTestId ?? null,
      },
      backdrop: {
        visible: markers.topologyCreateNodeBackdropVisible === true,
        coversViewport: markers.topologyCreateNodeBackdropCoversViewport === true,
        pointerEvents: markers.topologyCreateNodeBackdropPointerEvents ?? null,
        contract: markers.topologyCreateNodeBackdropContract ?? null,
        surfaceToken: markers.topologyCreateNodeBackdropSurfaceToken ?? null,
        background: markers.topologyCreateNodeBackdropBackground ?? null,
        dimAlpha: extractBackdropAlpha(markers.topologyCreateNodeBackdropBackground),
        filter: markers.topologyCreateNodeBackdropFilter ?? null,
      },
      map: {
        blockingEdit: markers.topologyMapSurfaceBlockingEdit === true,
        demoted: markers.topologyMapSurfaceDemoted === true,
        dimOpacity: markerNumber(markers, "topologyMapSurfaceDimOpacity"),
        dimOpacityToken: markers.topologyMapSurfaceDimOpacityToken ?? null,
        filterToken: markers.topologyMapSurfaceFilterToken ?? null,
        interactionContract: markers.topologyMapSurfaceInteractionContract ?? null,
        pointerEvents: markers.topologyMapSurfacePointerEvents ?? null,
      },
      overlays: {
        contract: markers.topologyBlockingComposerOverlayContract ?? null,
        count: markerNumber(markers, "topologyInteractiveOverlayCount"),
        names: Array.isArray(markers.topologyInteractiveOverlayNames)
          ? markers.topologyInteractiveOverlayNames
          : [],
      },
      transients: {
        contract: markers.topologyTransientSurfaceContract ?? null,
        count: markerNumber(markers, "topologyTransientSurfaceCount"),
        names: Array.isArray(markers.topologyTransientSurfaceNames)
          ? markers.topologyTransientSurfaceNames
          : [],
        dismissedSurfaceKinds: COMPOSER_DISMISSED_SURFACE_KINDS,
        blockingReason: "composer-open",
      },
      panel: {
        top: markerNumber(markers, "topologyCreateNodePanelTop"),
        bottom: markerNumber(markers, "topologyCreateNodePanelBottom"),
        left: markerNumber(markers, "topologyCreateNodePanelLeft"),
        right: markerNumber(markers, "topologyCreateNodePanelRight"),
        width: markerNumber(markers, "topologyCreateNodePanelWidth"),
        height: markerNumber(markers, "topologyCreateNodePanelHeight"),
        centerOffset: markerNumber(markers, "topologyCreateNodePanelCenterOffset"),
      },
      visualSeparation: {
        status: "proved",
        attentionLayer: "blocking-composer-over-dimmed-map",
        scrim: "strong-opaque-scrim",
        map: "demoted-context-only",
        panel: "solid-bounded-centered",
        interaction: "background-blocked",
        viewport: "14-inch-fullscreen-safe",
      },
      agentNextAction: "treat-add-concept-composer-as-current-work-surface",
      agentHandoff: {
        currentSurface: "topology-add-concept-composer",
        mapState: "dimmed-and-interaction-blocked",
        blockedUntil: "create-or-cancel",
        ...(visualEvidenceReference ? { visualEvidence: visualEvidenceReference } : {}),
        nextActions: ["complete-create-node-form", "cancel-composer"],
      },
    }
    : null;
  const relationLabelHandoffProof =
    markers.topologySelectedRelationLabelHandoffState === "ready"
      ? {
        proof: "topology-relation-label-handoff",
        status: "proved",
        route: evidenceRoute(payload?.href),
        contract: markers.topologyRelationLabelHandoffContract ?? null,
        label: {
          gate: markers.topologySelectedRelationLabelAgentGateKind ?? null,
          primaryAction: markers.topologySelectedRelationLabelPrimaryCopyAction ?? null,
          cliFallback: markers.topologySelectedRelationLabelCliFallbackCommand ?? null,
          factRoute: markers.topologySelectedRelationLabelFactRoute ?? null,
          quality: markers.topologySelectedRelationLabelQuality ?? null,
          evidence: markers.topologySelectedRelationLabelEvidenceState ?? null,
          type: markers.topologySelectedRelationLabelType ?? null,
          typeLabel: markers.topologySelectedRelationLabelTypeLabel ?? null,
        },
        aggregate: {
          gate: markers.topologySelectedRelationLabelHandoffGate ?? null,
          primaryAction: markers.topologySelectedRelationLabelHandoffPrimaryAction ?? null,
          cliFallback: markers.topologySelectedRelationLabelHandoffCliFallbackCommand ?? null,
          factRoute: markers.topologySelectedRelationLabelHandoffFactRoute ?? null,
          quality: markers.topologySelectedRelationLabelHandoffQuality ?? null,
          evidence: markers.topologySelectedRelationLabelHandoffEvidence ?? null,
        },
        agentNextAction:
          markers.topologySelectedRelationLabelHandoffPrimaryAction === "relation_check"
            ? "run-relation-check-before-handoff"
            : "run-explain-relation-for-handoff",
      }
      : null;
  const relationLabelFrameGeometryProof =
    markers.topologyRelationLabelGeometryContract === "frame-positioned-hit-targets"
      ? {
        proof: "topology-relation-label-frame-geometry",
        status:
          markerNumber(markers, "topologyRelationLabelGeometryExpectedCount") >= 1 &&
          markerNumber(markers, "topologyRelationLabelGeometryReadyCount") >=
            markerNumber(markers, "topologyRelationLabelGeometryExpectedCount") &&
          markerNumber(markers, "topologyRelationLabelGeometryPendingCount") === 0
            ? "proved"
            : "incomplete",
        route: evidenceRoute(payload?.href),
        contract: markers.topologyRelationLabelGeometryContract ?? null,
        source: markers.topologyRelationLabelGeometrySource ?? null,
        expected: markerNumber(markers, "topologyRelationLabelGeometryExpectedCount"),
        ready: markerNumber(markers, "topologyRelationLabelGeometryReadyCount"),
        pending: markerNumber(markers, "topologyRelationLabelGeometryPendingCount"),
      }
      : null;
  const nodePopoverExpandedProof =
    markers.topologyNodePopoverVisible === true &&
    markers.topologyNodePopoverCollapsed === false &&
    markers.topologyNodePopoverFooterPositionContract === "anchored-bottom-visible"
      ? {
        proof: "topology-node-popover-expanded-readability",
        status:
          markers.topologyNodePopoverRelationRowFullyVisible === true &&
          markers.topologyNodePopoverActionRailVisible === true
            ? "proved"
            : "incomplete",
        route: evidenceRoute(payload?.href),
        scroll: {
          popover: markers.topologyNodePopoverScrollContract ?? null,
          rootOverflowY: markers.topologyNodePopoverOverflowY ?? null,
          bodyContract: markers.topologyNodePopoverBodyScrollContract ?? null,
          bodyOverflowY: markers.topologyNodePopoverBodyOverflowY ?? null,
          bodyOverflowX: markers.topologyNodePopoverBodyOverflowX ?? null,
        },
        footer: {
          contract: markers.topologyNodePopoverFooterContract ?? null,
          position: markers.topologyNodePopoverFooterPositionContract ?? null,
          overflow: markers.topologyNodePopoverFooterOverflowContract ?? null,
          top: markerNumber(markers, "topologyNodePopoverFooterTop"),
          bottom: markerNumber(markers, "topologyNodePopoverFooterBottom"),
        },
        relationRow: {
          visible: markers.topologyNodePopoverRelationRowVisible === true,
          fullRowVisible: markers.topologyNodePopoverRelationRowFullyVisible === true,
          rowHeight: markerNumber(markers, "topologyNodePopoverRelationRowHeight"),
          visibleHeight: markerNumber(markers, "topologyNodePopoverVisibleRelationRowHeight"),
          readableRowContract: markers.topologyNodePopoverConnectionListReadableRowContract ?? null,
          evidence: markers.topologyNodePopoverRelationEvidenceState ?? null,
          gate: markers.topologyNodePopoverRelationAgentGateKind ?? null,
          primaryAction: markers.topologyNodePopoverRelationPrimaryCopyAction ?? null,
        },
        actionRail: {
          visible: markers.topologyNodePopoverActionRailVisible === true,
          contract: markers.topologyNodePopoverActionRailContract ?? null,
          count: markerNumber(markers, "topologyNodePopoverActionRailCount"),
        },
        agentNextAction: "use-selected-node-expanded-popover-handoff",
      }
      : null;

  return {
    capturedAt,
    payload,
    composerBlockingProof,
    relationLabelHandoffProof,
    relationLabelFrameGeometryProof,
    nodePopoverExpandedProof,
  };
}

function writeWebviewEvidence(payload, outPath, options = {}) {
  if (!outPath) return;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    `${JSON.stringify(buildWebviewEvidencePayload(payload, options), null, 2)}\n`,
  );
  console.log(`[desktop-app-verify:webview-evidence] saved ${path.resolve(outPath)}`);
}

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
  verifyTopologyNodePopover,
  verifyTopologyCreateNode,
  verifyTopologyFocusNoop,
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
            verifyTopologyNodePopover,
            verifyTopologyCreateNode,
            verifyTopologyFocusNoop,
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
      requireTopologyNodePopover: verifyTopologyNodePopover,
      requireTopologyCreateNode: verifyTopologyCreateNode,
      requireTopologyFocusNoop: verifyTopologyFocusNoop,
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
    verifyTopologyNodePopover,
    verifyTopologyCreateNode,
    verifyTopologyFocusNoop,
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
  if (verifyTopologyNodePopover && openApp) {
    fail("--verify-topology-node-popover is only supported for direct executable launch; omit --open-app.");
  }
  if (verifyTopologyCreateNode && openApp) {
    fail("--verify-topology-create-node is only supported for direct executable launch; omit --open-app.");
  }
  if (verifyTopologyFocusNoop && openApp) {
    fail("--verify-topology-focus-noop is only supported for direct executable launch; omit --open-app.");
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
  if (verifyTopologyNodePopover && !normalizedWebviewRoute?.includes("/topology")) {
    fail("--verify-topology-node-popover requires --require-webview-route pointing at a /topology route.");
  }
  if (verifyTopologyCreateNode && !normalizedWebviewRoute?.includes("/topology")) {
    fail("--verify-topology-create-node requires --require-webview-route pointing at a /topology route.");
  }
  if (verifyTopologyFocusNoop && !normalizedWebviewRoute?.includes("/topology")) {
    fail("--verify-topology-focus-noop requires --require-webview-route pointing at a /topology route.");
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
        verifyTopologyNodePopover,
        verifyTopologyCreateNode,
        verifyTopologyFocusNoop,
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
