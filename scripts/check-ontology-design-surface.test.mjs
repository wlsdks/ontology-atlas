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
      "function GraphWorkbenchSummary() {}",
      "<GraphProofRail model={graphProofRailModel} />",
      "formatAgentPostChangeSyncPacket",
    ].join("\n"),
  );
  writeFixture(
    root,
    "src/views/ontology-edit/ui/OntologyEditPage.tsx",
    [
      "function BuilderWriteSummary() {}",
      "function BuilderCanvasEntryRail() {}",
      "formatBuilderProofPacket",
      "formatAgentPostChangeSyncPacket",
    ].join("\n"),
  );
  writeFixture(
    root,
    "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
    [
      "function InsightsQueryPackCockpit() {}",
      "AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND",
      "AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND",
      "queryCockpitContractsAriaLabel",
    ].join("\n"),
  );
}

test("ontology design surface passes when visual and workbench contracts are present", () => {
  const root = makeFixture();
  writeCleanWorkbenchFixtures(root);

  const report = evaluateOntologyDesignSurface({
    root,
    targetDirs: ["src/views/ontology-view", "src/views/ontology-edit", "src/views/ontology-insights"],
  });

  assert.equal(report.ok, true);
  assert.equal(report.requiredSurfaceMarkerCount, 3);
  assert.equal(report.violations.length, 0);
  assert.match(renderOntologyDesignSurfaceReport(report).join("\n"), /3 workbench structure contracts/);
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

test("ontology design surface reports missing workbench structure markers", () => {
  const root = makeFixture();
  writeCleanWorkbenchFixtures(root);
  writeFixture(
    root,
    "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
    [
      "function InsightsQueryPackCockpit() {}",
      "AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND",
      "AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND",
    ].join("\n"),
  );

  const report = evaluateOntologyDesignSurface({
    root,
    targetDirs: ["src/views/ontology-view", "src/views/ontology-edit", "src/views/ontology-insights"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.violations.map((violation) => violation.check.id),
    ["query-cockpit-runtime-gate"],
  );
  assert.match(report.violations[0].source, /missing marker: queryCockpitContractsAriaLabel/);
});
