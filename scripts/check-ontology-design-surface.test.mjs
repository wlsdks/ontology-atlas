import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  evaluateOntologyDesignSurface,
  gradientIsFunctional,
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
      "previewEdge={meaningPreview}",
    ].join("\n"),
  );
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
  writeFixture(
    root,
    "src/views/ontology-insights/lib/insights-tab-state.ts",
    [
      "export const INSIGHTS_TABS = [",
      '  "do-next",',
      '  "composition",',
      '  "connections",',
      '  "boundaries",',
      '  "freshness",',
      "] as const;",
    ].join("\n"),
  );
  writeFixture(
    root,
    "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
    [
      '<main data-insights-surface="maintenance-board" data-insights-question-model="one-tab-one-question">',
      "<TabBar",
      'role="tabpanel"',
      "<InsightsHandoffRow",
      "<InsightsHeroCensus",
    ].join("\n"),
  );
  writeFixture(
    root,
    "src/views/ontology-insights/ui/tabs/OverviewTab.tsx",
    ["function OverviewTab() {}", "InsightsHeroCensus"].join("\n"),
  );
  writeFixture(
    root,
    "src/views/ontology-insights/ui/parts/InsightsHandoffRow.tsx",
    [
      "function InsightsHandoffRow() {}",
      '<section data-insights-handoff="tab-query">',
      "<CopyAgentTextButton",
    ].join("\n"),
  );
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
    "docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md",
    [
      "Design Council",
      "PO + Designer Working Loop",
      "Atlas Designer Bench",
      "Lead Product Designer",
      "Interaction Designer",
      "Information Visualization Designer",
      "macOS Workbench Designer",
      "Design Systems Engineer",
      "Agent Handoff Designer",
      "Reference source packet:",
      "Source -> Atlas rule -> verifier",
      "Not allowed:",
      "Standing Relief/Topology Critique Queue",
      "Reference Permission Test",
      "Relief/Topology Token And Anti-Pattern Gate",
      "Token decision record",
      "stacked floating panels",
      "popup soup",
      "blocking composer",
      "drag-only discovery",
      "one-off JSX clamp",
      "compact/14-inch/1920/2560",
      "WebView token marker",
      "Apple HIG",
      "Fluent 2",
      "Atlassian",
      "Carbon",
      "yFiles",
      "Cambridge Intelligence",
      "Linear",
      "Rauno",
      "Tufte",
      "Rams",
      "installed app route",
      "WebView marker",
      "Computer Use",
      "Do not copy",
    ].join("\n"),
  );
  writeFixture(
    root,
    "docs/DESIGN-SYSTEM.md",
    [
      "Tokenization Contract For Relief/Topology",
      "--topology-*",
      "product reason",
      "WebView/test marker",
      "stacked floating panels",
      "popup soup",
      "modal without modality",
      "drag-only discovery",
    ].join("\n"),
  );
  writeFixture(
    root,
    ".claude/rules/design.md",
    [
      "--topology-*",
      "product reason",
      "WebView/test marker",
      "stacked floating panels",
      "popup soup",
      "modal without modality",
      "drag-only discovery",
    ].join("\n"),
  );
  writeFixture(
    root,
    "AGENTS.md",
    [
      "Product design gate",
      "docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md",
      "mandatory",
      "Public references are principle sources only",
    ].join("\n"),
  );
  writeFixture(
    root,
    "src/widgets/docs-vault/ui/DocsVaultTree.tsx",
    "export function DocsVaultTree() { return null; }",
  );
}

test("design gate distinguishes token-driven control fills from decorative gradients", () => {
  assert.equal(
    gradientIsFunctional(
      "background: `linear-gradient(to right, var(--color-indigo-accent) ${filled}%, var(--color-overlay-3) ${filled}%)`",
    ),
    true,
  );
  assert.equal(
    gradientIsFunctional("background: linear-gradient(to right, rgb(99 102 241), #ec4899)"),
    false,
  );
  assert.equal(gradientIsFunctional("className=\"bg-gradient-to-r from-purple-500 to-pink-500\""), false);
});

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
  // The two markers "browse-workbench-loop" and "browse-tree-row-graph-handle" were
  // removed along with the retired `/ontology` tree hub, taking the count 8 → 6.
  assert.equal(report.requiredSurfaceMarkerCount, 6);
  assert.equal(report.violations.length, 0);
  assert.match(renderOntologyDesignSurfaceReport(report).join("\n"), /5 surfaces \+ 6 workbench structure contracts/);
});

test("ontology design surface ignores test fixtures when scanning forbidden visuals", () => {
  const root = makeFixture();
  writeCleanWorkbenchFixtures(root);
  writeFixture(
    root,
    "src/views/docs-vault/lib/popout-template.test.ts",
    "expect(html).not.toMatch(/linear-gradient/);",
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

test("ontology design surface reports forbidden visual drift", () => {
  const root = makeFixture();
  writeCleanWorkbenchFixtures(root);
  writeFixture(
    root,
    "src/views/ontology-view/ui/BadSurface.tsx",
    '<div className="hover:scale-105 bg-gradient-to-r from-purple-500 to-pink-500" />',
  );

  const report = evaluateOntologyDesignSurface({
    root,
    targetDirs: ["src/views/ontology-view", "src/features/ontology-meaning-editor", "src/views/ontology-insights"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    Array.from(new Set(report.violations.map((violation) => violation.check.id))).sort(),
    ["no-decorative-gradient", "no-hover-scale", "no-purple-pink"],
  );
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

test("ontology design surface reports missing workbench structure markers", () => {
  const root = makeFixture();
  writeCleanWorkbenchFixtures(root);
  // Break the current maintenance-board contract: five question tabs, one active
  // panel, and the tab-scoped agent handoff must all be present.
  writeFixture(
    root,
    "src/views/ontology-insights/lib/insights-tab-state.ts",
    'export const INSIGHTS_TABS = ["overview", "relations", "freshness"] as const;',
  );
  writeFixture(
    root,
    "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
    "// no maintenance board, no question model, no tabs, no active panel, no handoff row",
  );
  writeFixture(
    root,
    "src/views/ontology-insights/ui/tabs/OverviewTab.tsx",
    "function OverviewTab() {}",
  );
  writeFixture(
    root,
    "src/views/ontology-insights/ui/parts/InsightsHandoffRow.tsx",
    "function Nothing() {}",
  );

  const report = evaluateOntologyDesignSurface({
    root,
    targetDirs: ["src/views/ontology-view", "src/features/ontology-meaning-editor", "src/views/ontology-insights"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    Array.from(new Set(report.violations.map((violation) => violation.check.id))),
    ["insights-maintenance-board"],
  );
  assert.deepEqual(
    report.violations.map((violation) => violation.source),
    [
      [
        "missing marker: export const INSIGHTS_TABS = [",
        '  "do-next",',
        '  "composition",',
        '  "connections",',
        '  "boundaries",',
        '  "freshness",',
        "] as const;",
      ].join("\n"),
      'missing marker: data-insights-surface="maintenance-board"',
      'missing marker: data-insights-question-model="one-tab-one-question"',
      "missing marker: TabBar",
      'missing marker: role="tabpanel"',
      "missing marker: InsightsHandoffRow",
      'missing marker: data-insights-handoff="tab-query"',
      "missing marker: CopyAgentTextButton",
    ],
  );
});

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
    ["insights-maintenance-board"],
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

test("ontology design surface requires the PO-linked product design operating system", () => {
  const root = makeFixture();
  writeCleanWorkbenchFixtures(root);
  writeFixture(
    root,
    "docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md",
    [
      "Design Council",
      "Atlas Designer Bench",
      "Lead Product Designer",
      "Reference source packet:",
      "Apple HIG",
    ].join("\n"),
  );

  const report = evaluateOntologyDesignSurface({
    root,
    targetDirs: ["src/widgets/docs-vault"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    Array.from(new Set(report.violations.map((violation) => violation.check.id))),
    ["product-design-operating-system"],
  );
  assert.match(
    report.violations.map((violation) => violation.source).join("\n"),
    /missing marker: Source -> Atlas rule -> verifier/,
  );
  assert.match(
    report.violations.map((violation) => violation.source).join("\n"),
    /missing marker: Computer Use/,
  );
});
