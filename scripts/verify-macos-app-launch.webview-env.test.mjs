import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  expectedRelationLabelAgentGateText,
  isSelectedRelationAgentGateText,
  isSelectedRelationPrimaryCopyActionText,
  } from "./verify-macos-app-launch.mjs";

test("installed-app insights proof follows the current maintenance-board contract", () => {
  const tauriLib = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const insightsPage = fs.readFileSync(
    "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
    "utf8",
  );
  const insightsHandoff = fs.readFileSync(
    "src/views/ontology-insights/ui/parts/InsightsHandoffRow.tsx",
    "utf8",
  );

  assert.match(insightsPage, /data-insights-surface="maintenance-board"/);
  assert.match(insightsPage, /data-insights-question-model="one-tab-one-question"/);
  assert.match(insightsHandoff, /data-insights-handoff="tab-query"/);
  assert.match(tauriLib, /insightsMaintenanceBoard/);
  assert.match(tauriLib, /insightsQuestionTabs/);
  assert.match(tauriLib, /insightsSelectedPanelVisible/);
  assert.match(tauriLib, /insightsHandoff/);
  assert.doesNotMatch(tauriLib, /hasDecisionQuestionList/);
  assert.doesNotMatch(tauriLib, /hasReaderDecisionLens/);
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
