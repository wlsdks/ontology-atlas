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
    "src/views/ontology-edit/ui/OntologyEditPage.tsx",
    [
      "function BuilderWriteSummary() {}",
      "function BuilderCanvasEntryRail() {}",
      "formatBuilderGuardPacket",
      "formatBuilderProofPacket",
      "formatAgentPostChangeSyncPacket",
      "aria-label={t(\"ariaLabel\"",
      "anchorAriaLabel",
      "anchorSlugLabel",
      "data-anchor-slug",
      "activeFocusAriaLabel",
      "activeFocus",
      "proofChipSelected",
    ].join("\n"),
  );
  writeFixture(
    root,
    "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
    ["<InsightsQueryPackCockpit />"].join("\n"),
  );
  writeFixture(
    root,
    "src/views/ontology-insights/ui/parts/InsightsQueryPackCockpit.tsx",
    [
      "function InsightsQueryPackCockpit() {}",
      "AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND",
      "AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND",
      "queryCockpitCopyRuntimeGate",
      "queryCockpitContractsAriaLabel",
      "queryCockpitLiveProofAriaLabel",
      "queryCockpitEvidenceAriaLabel",
      "focused_blast_radius",
      "relation_name_parity",
      "pattern_walk/project_map",
      "--type depends_on",
    ].join("\n"),
  );
  writeFixture(
    root,
    "src/views/ontology-insights/ui/parts/InsightsFocusedNodeProofPanel.tsx",
    "relationType and via",
  );
  writeFixture(
    root,
    "src/views/docs-vault/ui/DocsVaultPage.tsx",
    [
      "function DocsVaultSourceContractBar() {}",
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
    "src/widgets/topology-map-sigma/ui/SigmaTopology.tsx",
    [
      "kindLegendProjectRole",
      "kindLegendDomainRole",
      "kindLegendCapabilityRole",
      "kindLegendElementRole",
      "kindLegendUnknownRole",
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
      "src/views/ontology-edit",
      "src/views/ontology-insights",
    ],
  });

  assert.equal(report.ok, true);
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
      "src/views/ontology-edit",
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
    targetDirs: ["src/views/ontology-view", "src/views/ontology-edit", "src/views/ontology-insights"],
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
  writeFixture(
    root,
    "src/views/ontology-insights/ui/parts/InsightsQueryPackCockpit.tsx",
    [
      "function InsightsQueryPackCockpit() {}",
      "AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND",
      "AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND",
    ].join("\n"),
  );
  writeFixture(
    root,
    "src/views/ontology-insights/ui/parts/InsightsFocusedNodeProofPanel.tsx",
    "",
  );

  const report = evaluateOntologyDesignSurface({
    root,
    targetDirs: ["src/views/ontology-view", "src/views/ontology-edit", "src/views/ontology-insights"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    Array.from(new Set(report.violations.map((violation) => violation.check.id))),
    ["query-cockpit-runtime-gate"],
  );
  assert.deepEqual(
    report.violations.map((violation) => violation.source),
    [
      "missing marker: queryCockpitCopyRuntimeGate",
      "missing marker: queryCockpitContractsAriaLabel",
      "missing marker: queryCockpitLiveProofAriaLabel",
      "missing marker: queryCockpitEvidenceAriaLabel",
      "missing marker: focused_blast_radius",
      "missing marker: relation_name_parity",
      "missing marker: pattern_walk/project_map",
      "missing marker: --type depends_on",
      "missing marker: relationType and via",
    ],
  );
});

test("ontology design surface reports missing workspace execution cells", () => {
  const root = makeFixture();
  writeCleanWorkbenchFixtures(root);
  writeFixture(
    root,
    "src/views/docs-vault/ui/DocsVaultPage.tsx",
    [
      "function DocsVaultSourceContractBar() {}",
      "AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND",
      "sourceContract.agentCopyGate",
    ].join("\n"),
  );

  const report = evaluateOntologyDesignSurface({
    root,
    targetDirs: ["src/views/ontology-view", "src/views/ontology-edit", "src/views/ontology-insights"],
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

test("ontology design surface reports missing topology kind role descriptions", () => {
  const root = makeFixture();
  writeCleanWorkbenchFixtures(root);
  writeFixture(
    root,
    "src/widgets/topology-map-sigma/ui/SigmaTopology.tsx",
    [
      "kindLegendProjectRole",
      "kindLegendDomainRole",
      "kindLegendCapabilityRole",
    ].join("\n"),
  );

  const report = evaluateOntologyDesignSurface({
    root,
    targetDirs: ["src/widgets/topology-map-sigma"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    Array.from(new Set(report.violations.map((violation) => violation.check.id))),
    ["topology-kind-legend-role-copy"],
  );
  assert.deepEqual(
    report.violations.map((violation) => violation.source),
    [
      "missing marker: kindLegendElementRole",
      "missing marker: kindLegendUnknownRole",
    ],
  );
});
