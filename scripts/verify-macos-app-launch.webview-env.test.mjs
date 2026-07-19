import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  expectedRelationLabelAgentGateText,
  isSelectedRelationAgentGateText,
  isSelectedRelationPrimaryCopyActionText,
  topologyDragCompanionVectorTolerance,
  webviewVerifyEnvPatch,
} from "./verify-macos-app-launch.mjs";

test("WebView verification env patch carries route, drag, composer, and requested window size", () => {
  assert.deepEqual(
    webviewVerifyEnvPatch({
      requireWebviewRoute: "/en/topology/",
      verifyTopologyDrag: true,
      verifyTopologySelectedRelation: true,
      verifyTopologyNodePopover: true,
      verifyTopologyCreateNode: true,
      verifyTopologyFocusNoop: true,
      webviewWindowSize: { width: 1100, height: 800 },
    }),
    {
      ONTOLOGY_ATLAS_VERIFY_WEBVIEW: "1",
      ONTOLOGY_ATLAS_VERIFY_ROUTE: "/en/topology/",
      ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_DRAG: "1",
      ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_SELECTED_RELATION: "1",
      ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_NODE_POPOVER: "1",
      ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_CREATE_NODE: "1",
      ONTOLOGY_ATLAS_VERIFY_TOPOLOGY_FOCUS_NOOP: "1",
      ONTOLOGY_ATLAS_VERIFY_WINDOW_SIZE: "1100x800",
    },
  );
});

test("Tauri node popover verifier captures compact facts even when the inspector starts expanded", () => {
  const tauriLib = fs.readFileSync("src-tauri/src/lib.rs", "utf8");

  assert.equal(
    tauriLib.includes('data-node-popover-toggle="collapse"'),
    true,
    "expanded node popover verifier needs the existing collapse control",
  );
  assert.equal(
    tauriLib.includes("clicked-collapse-for-compact"),
    true,
    "verifier should collapse an already-expanded popover before taking compact facts snapshot",
  );
  assert.equal(
    tauriLib.includes("result.compact?.factsVisible"),
    true,
    "verifier should only accept an expanded popover after compact facts were captured",
  );
});

test("selected relation label agent gate text exposes MCP and CLI for handoff-ready facts", () => {
  assert.equal(expectedRelationLabelAgentGateText("handoff-ready"), "MCP/CLI");
  assert.equal(expectedRelationLabelAgentGateText("preflight-first"), "check");
  assert.equal(expectedRelationLabelAgentGateText("review-first"), "review");
});

test("selected relation inspector agent gate text accepts localized proof copy", () => {
  assert.equal(isSelectedRelationAgentGateText("MCP/CLI ready"), true);
  assert.equal(isSelectedRelationAgentGateText("Agent gate handoff ready"), true);
  assert.equal(isSelectedRelationAgentGateText("설명 가능"), true);
  assert.equal(isSelectedRelationAgentGateText("사전 점검 먼저"), true);
  assert.equal(isSelectedRelationAgentGateText("검토 먼저"), true);
  assert.equal(isSelectedRelationAgentGateText("설명"), false);
  assert.equal(isSelectedRelationAgentGateText(""), false);
});

test("selected relation primary copy action text accepts compact localized labels", () => {
  assert.equal(
    isSelectedRelationPrimaryCopyActionText({
      text: "설명",
      action: "explain_relation",
      locale: "ko",
    }),
    true,
  );
  assert.equal(
    isSelectedRelationPrimaryCopyActionText({
      text: "설명 복사",
      action: "explain_relation",
      locale: "ko",
    }),
    true,
  );
  assert.equal(
    isSelectedRelationPrimaryCopyActionText({
      text: "관계 설명 복사",
      action: "explain_relation",
      locale: "ko",
    }),
    true,
  );
  assert.equal(
    isSelectedRelationPrimaryCopyActionText({
      text: "점검 복사",
      action: "relation_check",
      locale: "ko",
    }),
    true,
  );
  assert.equal(
    isSelectedRelationPrimaryCopyActionText({
      text: "점검",
      action: "relation_check",
      locale: "ko",
    }),
    true,
  );
  assert.equal(
    isSelectedRelationPrimaryCopyActionText({
      text: "Copy explain",
      action: "explain_relation",
      locale: "en",
    }),
    true,
  );
  assert.equal(
    isSelectedRelationPrimaryCopyActionText({
      text: "설명 가능",
      action: "explain_relation",
      locale: "ko",
    }),
    false,
  );
});

test("topology drag companion vector tolerance scales with wide WebView UI scale", () => {
  assert.equal(topologyDragCompanionVectorTolerance({}), 8);
  assert.equal(topologyDragCompanionVectorTolerance({ topologyUiScale: 0.9 }), 8);
  assert.equal(topologyDragCompanionVectorTolerance({ topologyUiScale: 1.32 }), 10.56);
  assert.equal(topologyDragCompanionVectorTolerance({ topologyUiScale: 4 }), 14);
});

test("topology drag verifier captures reactive motion before selecting a relation label", () => {
  const source = fs.readFileSync(
    path.resolve("src-tauri/src/lib.rs"),
    "utf8",
  );
  const relationClickIndex = source.indexOf("result.relationLabelClicked = true");
  const reactiveMotionIndex = source.indexOf("result.dragReactiveMotionLinkedPolicy");

  assert.notEqual(relationClickIndex, -1);
  assert.notEqual(reactiveMotionIndex, -1);
  assert.ok(
    reactiveMotionIndex < relationClickIndex,
    "drag reactive proof must be captured before relation label click mutates the topology state",
  );
});
