export const WEBVIEW_VERIFY_ENV = "ONTOLOGY_ATLAS_VERIFY_WEBVIEW";

export const WEBVIEW_VERIFY_ROUTE_ENV = "ONTOLOGY_ATLAS_VERIFY_ROUTE";

export const WEBVIEW_VERIFY_VAULT_ENV = "ONTOLOGY_ATLAS_VERIFY_VAULT";

export const WEBVIEW_VERIFY_TOPOLOGY_DRAG_ENV = "ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_DRAG";
const WEBVIEW_VERIFY_TOPOLOGY_SELECTED_RELATION_ENV =
  "ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_SELECTED_RELATION";
const WEBVIEW_VERIFY_TOPOLOGY_NODE_POPOVER_ENV =
  "ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_NODE_POPOVER";

export const WEBVIEW_VERIFY_TOPOLOGY_CREATE_NODE_ENV = "ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_CREATE_NODE";

export const WEBVIEW_VERIFY_TOPOLOGY_FOCUS_NOOP_ENV = "ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_FOCUS_NOOP";

export const WEBVIEW_VERIFY_TOPOLOGY_FOCUS_ZOOM_ENV = "ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_FOCUS_ZOOM";
const WEBVIEW_VERIFY_TOPOLOGY_FRAME_PROFILE_ENV =
  "ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_FRAME_PROFILE";

export const WEBVIEW_VERIFY_AI_SETTINGS_ENV = "ONTOLOGY_ATLAS_VERIFY_AI_SETTINGS";

export const WEBVIEW_VERIFY_AI_BASE_URL_ENV = "ONTOLOGY_ATLAS_VERIFY_AI_BASE_URL";

export const WEBVIEW_VERIFY_WINDOW_SIZE_ENV = "ONTOLOGY_ATLAS_VERIFY_WINDOW_SIZE";

export const RELATION_LABEL_COMPACT_WIDTH_TOLERANCE_PX = 2.5;

export const TOPOLOGY_DRAG_FOCUS_MIN_DELTA_PX = 20;

export const TOPOLOGY_DRAG_FOCUS_MAX_REASONABLE_DELTA_PX = 560;

export const TOPOLOGY_DIM_OPACITY_CONTRACT = "readable-context-geography";

export const TOPOLOGY_DIM_ANCHOR_MIN_OPACITY = 0.26;

export const TOPOLOGY_DIM_CONTEXT_MIN_OPACITY = 0.08;

export const VALID_ZOOM_LENS_PRESENTATION_SOURCES = new Set([
  "camera-zoom-in",
  "selected-relation-context",
  "selected-focus-detail",
]);

export const WEBVIEW_VERIFY_PREFIX = "[ontology-atlas-webview-verify] ";

export const WEBVIEW_VERIFY_TIMEOUT_MS = 15000;

export const GRACEFUL_QUIT_COMMAND_TIMEOUT_MS = 1200;

export const STALE_PROCESS_EXIT_TIMEOUT_MS = 6000;

export const STALE_PROCESS_POLL_MS = 200;

export const ACCESSIBILITY_WINDOW_TIMEOUT_MS = 3000;

export const ACCESSIBILITY_TEXT_TIMEOUT_MS = 7000;

export const ACCESSIBILITY_TEXT_MAX_DEPTH = 8;

export const ACCESSIBILITY_TEXT_MAX_CHILDREN_PER_NODE = 80;

export const VISUAL_EVIDENCE_MIN_NON_DARK_RATIO = 0.001;

export const VISUAL_EVIDENCE_MIN_LUMA_SPREAD = 8;

export const WEBVIEW_WORKBENCH_MARKERS = [
  /온톨로지|Ontology|Atlas/,
  /Workspace|작업공간|저장소|문서함|Source Vault|Documents|Relief|Concept map|개념/,
];


export function normalizeTopologySelectedParam(value) {
  if (typeof value !== "string" || value.trim().length === 0) return "";
  return value.trim();
}


export function topologyDragDeltaVector(delta) {
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


export function webviewVerifyEnvPatch({
  requireWebviewRoute = null,
  webviewFixtureVaultPath = null,
  verifyTopologyDrag = false,
  verifyTopologySelectedRelation = false,
  verifyTopologyNodePopover = false,
  verifyTopologyCreateNode = false,
  verifyTopologyFocusNoop = false,
  verifyTopologyFocusZoom = false,
  verifyTopologyFrameProfile = false,
  verifyAiSettings = false,
  aiSettingsBaseUrl = null,
  webviewWindowSize = null,
} = {}) {
  return {
    [WEBVIEW_VERIFY_ENV]: "1",
    ...(requireWebviewRoute ? { [WEBVIEW_VERIFY_ROUTE_ENV]: requireWebviewRoute } : {}),
    ...(webviewFixtureVaultPath
      ? { [WEBVIEW_VERIFY_VAULT_ENV]: webviewFixtureVaultPath }
      : {}),
    ...(verifyTopologyDrag ? { [WEBVIEW_VERIFY_TOPOLOGY_DRAG_ENV]: "1" } : {}),
    ...(verifyTopologySelectedRelation
      ? { [WEBVIEW_VERIFY_TOPOLOGY_SELECTED_RELATION_ENV]: "1" }
      : {}),
    ...(verifyTopologyNodePopover
      ? { [WEBVIEW_VERIFY_TOPOLOGY_NODE_POPOVER_ENV]: "1" }
      : {}),
    ...(verifyTopologyCreateNode ? { [WEBVIEW_VERIFY_TOPOLOGY_CREATE_NODE_ENV]: "1" } : {}),
    ...(verifyTopologyFocusNoop ? { [WEBVIEW_VERIFY_TOPOLOGY_FOCUS_NOOP_ENV]: "1" } : {}),
    ...(verifyTopologyFocusZoom ? { [WEBVIEW_VERIFY_TOPOLOGY_FOCUS_ZOOM_ENV]: "1" } : {}),
    ...(verifyTopologyFrameProfile
      ? { [WEBVIEW_VERIFY_TOPOLOGY_FRAME_PROFILE_ENV]: "1" }
      : {}),
    ...(verifyAiSettings ? { [WEBVIEW_VERIFY_AI_SETTINGS_ENV]: "1" } : {}),
    // 주소는 **검증기가 정한다**. 앱이 기본값으로 되메우면 "무엇을 실제로 넣고
    // 눌렀나" 가 두 곳에서 정해져, 필드 값 대조가 대조가 아니게 된다.
    ...(verifyAiSettings && aiSettingsBaseUrl
      ? { [WEBVIEW_VERIFY_AI_BASE_URL_ENV]: aiSettingsBaseUrl }
      : {}),
    ...(webviewWindowSize
      ? {
          [WEBVIEW_VERIFY_WINDOW_SIZE_ENV]: `${webviewWindowSize.width}x${webviewWindowSize.height}`,
        }
      : {}),
  };
}


export function expectedRelationLabelAgentGateText(gateKind) {
  if (gateKind === "handoff-ready") return "MCP/CLI";
  if (gateKind === "preflight-first") return "check";
  return "review";
}


export function isSelectedRelationAgentGateText(value) {
  const text = String(value ?? "").trim();
  return /^(MCP\/CLI ready|handoff ready|Agent gate handoff ready|preflight first|review first|handoff 준비됨|전달 준비됨|설명 가능|preflight 먼저|사전 점검 먼저|검토 먼저)$/i.test(
    text,
  );
}


export function isSelectedRelationPrimaryCopyActionText({
  text,
  action,
  locale,
}) {
  const label = String(text ?? "").trim();
  if (action === "explain_relation") {
    return locale === "ko"
      ? /^(설명(?:\s*복사)?|관계\s*설명(?:\s*복사)?)$/.test(label)
      : label.toLowerCase().includes("explain");
  }
  if (action === "relation_check") {
    return locale === "ko"
      ? /^(점검(?:\s*복사)?|관계\s*(점검|사전\s*점검)(?:\s*복사)?)$/.test(label)
      : label.toLowerCase().includes("relation");
  }
  return false;
}
