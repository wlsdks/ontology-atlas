import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  evaluateOntologyDesignSurface,
  renderOntologyDesignSurfaceReport,
} from "./check-ontology-design-surface.mjs";

function makeFixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "omo-design-surface-"));
}

function writeFixture(root, relativePath, source) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, "utf8");
}

function writeCleanWorkbenchFixtures(root) {
  writeFixture(
    root,
    "src/views/ontology-view/ui/OntologyViewPage.tsx",
    [
      "function OntologyMeaningGateStrip() {}",
      "<OntologyMeaningGateStrip",
      "function GraphWorkbenchSummary() {}",
      "<GraphWorkbenchSummary",
      "activeSlugLabel",
      "activeSlugBody",
      "treeProof",
      "graphDbProof",
      "formatAgentPostChangeSyncPacket",
    ].join("\n"),
  );
  writeFixture(
    root,
    "src/widgets/ontology-tree-view/ui/OntologyTreeView.tsx",
    [
      "selectAriaLabel",
      "selectedHandleLabel",
      "selectedHandleTitle",
      "data-orphan-select-button",
    ].join("\n"),
  );
  writeFixture(
    root,
    "src/views/home/ui/HomePage.tsx",
    [
      "<MeaningEditorPanel",
      "create-node-change-review",
      "<TopologyCanvasSurface",
    ].join("\n"),
  );
  writeFixture(
    root,
    "src/views/home/ui/TopologyCanvasSurface.tsx",
    "previewEdge={mapRelationPreview}",
  );
  writeFixture(root, "src/views/home/ui/TopologyMapRenderer.tsx", "");
  writeFixture(
    root,
    "src/views/home/ui/CreateNodeForm.tsx",
    "create-node-change-review",
  );
  writeFixture(
    root,
    "src/features/ontology-meaning-editor/ui/MeaningEditorPanel.tsx",
    [
      "export function MeaningEditorPanel() {}",
      "buildOntologyRelationEditPlan",
      "meaning-editor-change-review",
    ].join("\n"),
  );
  writeFixture(
    root,
    "src/features/ontology-change-review/ui/OntologyChangeReview.tsx",
    "function OntologyChangeReview() {}",
  );
  writeFixture(
    root,
    "src/widgets/acp-chat-panel/ui/AcpPermissionCard.tsx",
    [
      "acp-ontology-change-review",
      "request.reviewKind === 'ontology-write'",
      "allowAlways && !ontologyWrite",
    ].join("\n"),
  );
  writeFixture(
    root,
    "src/features/acp-session/model/acp-client.ts",
    "const ontologyWrite = atlasMode === 'write';",
  );
  writeFixture(root, "src/views/ontology-insights/ui/OntologyInsightsPage.tsx", '<main data-insights-surface="relationship-analysis" data-insights-question-model="claim-evidence" role="tabpanel"><TabBar /><AnalysisWorkspace /></main>');
  writeFixture(root, "src/views/ontology-insights/ui/analysis/AnalysisWorkspace.tsx", '<aside data-testid="analysis-evidence">buildDocsVaultHref</aside>');
  writeFixture(root, "src/views/ontology-insights/ui/analysis/DependencyDiagram.tsx", '<div data-testid="analysis-dependency-diagram" />');
  writeFixture(root, "src/views/ontology-insights/ui/analysis/PairRail.tsx", '<button data-testid="analysis-pair" />');
  writeFixture(root, "src/views/ontology-insights/ui/analysis/AnalysisRecords.tsx", '<InsightsAgentDock /> planInsightsAgentPrompt');
  writeFixture(root, "src/views/ontology-insights/ui/tabs/FlowTab.tsx", '<button data-testid="flow-prefill" onClick={() => onPrefill?.(request)} /><CopyControl text={request} testId="flow-copy" />');
  writeFixture(
    root,
    "src/views/docs-vault/ui/DocsVaultPage.tsx",
    ["<DocsVaultAuditModal"].join("\n"),
  );
  writeFixture(
    root,
    "src/views/docs-vault/ui/parts/DocsVaultAuditModal.tsx",
    [
      "function DocsVaultAuditModal() {}",
      "sourceContract.filesLabel",
      "sourceContract.filesChip",
      "sourceContract.graphLabel",
      "sourceContract.graphChip",
      "sourceContract.agentLabel",
      "sourceContract.agentChip",
      "AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND",
      "SOURCE_VAULT_RUNTIME_REPLAY_MARKERS",
      "pattern_walk/project_map",
      "sourceContract.agentCopyGate",
    ].join("\n"),
  );
  writeFixture(
    root,
    "src/widgets/docs-vault/ui/DocsVaultTree.tsx",
    "export function DocsVaultTree() { return null; }",
  );
}

test("ontology design surface passes when visual and workbench contracts are present", () => {
  const root = makeFixture();
  writeCleanWorkbenchFixtures(root);

  const report = evaluateOntologyDesignSurface({
    root,
    targetDirs: [
      "src/views/docs-vault",
      "src/widgets/docs-vault",
      "src/views/ontology-view",
      "src/features/ontology-meaning-editor",
      "src/views/ontology-insights",
    ],
  });

  assert.equal(report.ok, true);
  // Only code-surface contracts remain; the three that pinned doc prose were removed.
  assert.equal(report.requiredSurfaceMarkerCount, 3);
  assert.equal(report.violations.length, 0);
  assert.match(renderOntologyDesignSurfaceReport(report).join("\n"), /5 surfaces \+ 3 workbench structure contracts/);
});

test("ontology design surface fails closed when its scan matches zero files", () => {
  const root = makeFixture();
  fs.mkdirSync(path.join(root, "src/views/empty-design-surface"), { recursive: true });

  const report = evaluateOntologyDesignSurface({
    root,
    targetDirs: ["src/views/empty-design-surface"],
    requiredSurfaceMarkers: [],
  });

  assert.equal(report.ok, false);
  assert.equal(report.files.length, 0);
  assert.deepEqual(
    report.violations.map((violation) => violation.check.id),
    ["ontology-design-scan-idle"],
  );
});

test("ontology design surface ignores test fixtures when scanning forbidden visuals", () => {
  const root = makeFixture();
  writeCleanWorkbenchFixtures(root);
  // The planted string must be one a live check actually matches. Until 2026-09-08 this
  // fixture planted `linear-gradient`, and the gradient check was lifted the same day —
  // leaving an assertion that passed whether the ignore rule worked or not. A test that
  // cannot fail is not a gate; the marker below is what the scanner still refuses.
  writeFixture(
    root,
    "src/views/docs-vault/lib/popout-template.test.ts",
    'expect(html).not.toMatch(/ontology-kind-decision-stripe/);',
  );

  const report = evaluateOntologyDesignSurface({
    root,
    targetDirs: [
      "src/views/docs-vault",
      "src/widgets/docs-vault",
      "src/views/ontology-view",
      "src/features/ontology-meaning-editor",
      "src/views/ontology-insights",
    ],
  });

  assert.equal(report.ok, true);
  assert.equal(report.violations.length, 0);
});

test("ontology design surface rejects kind decision full-height stripes", () => {
  const root = makeFixture();
  writeCleanWorkbenchFixtures(root);
  writeFixture(
    root,
    "src/views/ontology-view/ui/BadKindDecisionCard.tsx",
    '<span data-testid="ontology-kind-decision-stripe" className="absolute inset-y-0 left-0 w-1.5" />',
  );

  const report = evaluateOntologyDesignSurface({
    root,
    targetDirs: ["src/views/ontology-view"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    Array.from(new Set(report.violations.map((violation) => violation.check.id))),
    ["no-kind-decision-stripe"],
  );
});

test("ontology design surface ignores a comment naming a forbidden token after JSX text with an apostrophe", () => {
  const root = makeFixture();
  writeCleanWorkbenchFixtures(root);
  writeFixture(
    root,
    "src/views/ontology-view/ui/KindCard.tsx",
    [
      "export function KindCard() {",
      "  return <p>Don't draw a rail</p>;",
      "}",
      "// ontology-kind-decision-stripe stays out of this card",
    ].join("\n"),
  );

  const report = evaluateOntologyDesignSurface({ root, targetDirs: ["src/views/ontology-view"] });

  assert.deepEqual(report.violations, []);
});

test("ontology design surface reports a real use at its own line and column after a block comment", () => {
  const root = makeFixture();
  writeCleanWorkbenchFixtures(root);
  writeFixture(
    root,
    "src/views/ontology-view/ui/KindCard.tsx",
    [
      "/*",
      " * A kind card.",
      " */",
      `/* Don't draw a rail. */ export const KindCard = () => <span className="ontology-kind-decision-stripe" />;`,
    ].join("\n"),
  );

  const report = evaluateOntologyDesignSurface({ root, targetDirs: ["src/views/ontology-view"] });

  assert.deepEqual(
    report.violations.map((violation) => [violation.check.id, violation.line, violation.column]),
    [["no-kind-decision-stripe", 4, 73]],
  );
});

test("ontology design surface does not accept a workbench marker that survives only in a comment", () => {
  const root = makeFixture();
  writeCleanWorkbenchFixtures(root);
  const modal = "src/views/docs-vault/ui/parts/DocsVaultAuditModal.tsx";
  writeFixture(
    root,
    modal,
    fs.readFileSync(path.join(root, modal), "utf8")
      .replace("function DocsVaultAuditModal() {}", "// function DocsVaultAuditModal() {}")
      .replace("sourceContract.graphChip", "/* sourceContract.graphChip */"),
  );

  const report = evaluateOntologyDesignSurface({ root, targetDirs: ["src/views/ontology-view"] });

  assert.deepEqual(
    report.violations.map((violation) => violation.source),
    ["missing marker: function DocsVaultAuditModal", "missing marker: sourceContract.graphChip"],
  );
});

for (const [file, missing] of [
  ["src/views/ontology-insights/ui/OntologyInsightsPage.tsx", /relationship-analysis/],
  ["src/views/ontology-insights/ui/analysis/AnalysisWorkspace.tsx", /analysis-evidence/],
  ["src/views/ontology-insights/ui/analysis/DependencyDiagram.tsx", /analysis-dependency-diagram/],
  ["src/views/ontology-insights/ui/analysis/PairRail.tsx", /analysis-pair/],
  ["src/views/ontology-insights/ui/analysis/AnalysisRecords.tsx", /InsightsAgentDock/],
  ["src/views/ontology-insights/ui/tabs/FlowTab.tsx", /onPrefill/],
]) {
  test(`ontology design surface rejects missing relationship or authority subject: ${file}`, () => {
    const root = makeFixture();
    writeCleanWorkbenchFixtures(root);
    writeFixture(root, file, "// the protected subject was removed");
    const report = evaluateOntologyDesignSurface({ root, targetDirs: ["src/views/ontology-insights"] });
    assert.equal(report.ok, false);
    assert.ok(report.violations.length > 0);
    assert.match(report.violations.map(violation => violation.source).join("\n"), missing);
  });
}

test("ontology design surface rejects the retired three-tab insights dashboard", () => {
  const root = makeFixture();
  writeCleanWorkbenchFixtures(root);
  writeFixture(
    root,
    "src/views/ontology-insights/lib/insights-tab-state.ts",
    'export const INSIGHTS_TABS = ["overview", "relations", "freshness"] as const;',
  );
  writeFixture(
    root,
    "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
    [
      "<TabBar",
      "<InsightsHeroCensus",
      "<InsightsHandoffRow",
    ].join("\n"),
  );

  const report = evaluateOntologyDesignSurface({
    root,
    targetDirs: ["src/views/ontology-insights"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    Array.from(new Set(report.violations.map((violation) => violation.check.id))),
    ["insights-relationship-analysis"],
  );
});

test("ontology design surface reports missing workspace execution cells", () => {
  const root = makeFixture();
  writeCleanWorkbenchFixtures(root);
  writeFixture(
    root,
    "src/views/docs-vault/ui/parts/DocsVaultAuditModal.tsx",
    [
      "function DocsVaultAuditModal() {}",
      "AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND",
      "sourceContract.agentCopyGate",
    ].join("\n"),
  );

  const report = evaluateOntologyDesignSurface({
    root,
    targetDirs: ["src/views/ontology-view", "src/features/ontology-meaning-editor", "src/views/ontology-insights"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    Array.from(new Set(report.violations.map((violation) => violation.check.id))),
    ["source-vault-execution-contract"],
  );
  assert.deepEqual(
    report.violations.map((violation) => violation.source),
    [
      "missing marker: sourceContract.filesLabel",
      "missing marker: sourceContract.filesChip",
      "missing marker: sourceContract.graphLabel",
      "missing marker: sourceContract.graphChip",
      "missing marker: sourceContract.agentLabel",
      "missing marker: sourceContract.agentChip",
      "missing marker: SOURCE_VAULT_RUNTIME_REPLAY_MARKERS",
      "missing marker: pattern_walk/project_map",
    ],
  );
});
