import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("installed-app insights proof follows the current relationship-analysis contract", () => {
  // The probe scripts live in webview_verify/; reading only Rust would pass on an empty haystack.
  const tauriLib = [
    fs.readFileSync("src-tauri/src/webview_verify/mod.rs", "utf8"),
    ...fs
      .readdirSync("src-tauri/src/webview_verify")
      .filter((name) => name.endsWith(".js"))
      .map((name) => fs.readFileSync(`src-tauri/src/webview_verify/${name}`, "utf8")),
  ].join("\n");
  const insightsPage = fs.readFileSync(
    "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
    "utf8",
  );
  const analysisWorkspace = fs.readFileSync(
    "src/views/ontology-insights/ui/analysis/AnalysisWorkspace.tsx",
    "utf8",
  );

  assert.match(insightsPage, /data-insights-surface="relationship-analysis"/);
  assert.match(insightsPage, /data-insights-question-model="claim-evidence"/);
  assert.match(analysisWorkspace, /data-testid="analysis-evidence"/);
  assert.match(tauriLib, /insightsMaintenanceBoard/);
  assert.match(tauriLib, /insightsQuestionTabs/);
  assert.match(tauriLib, /insightsSelectedPanelVisible/);
  assert.doesNotMatch(tauriLib, /hasDecisionQuestionList/);
  assert.doesNotMatch(tauriLib, /hasReaderDecisionLens/);
});
