#!/usr/bin/env node
// Tests for the dogfood MCP walk's human-readable summary/format helpers:
// rpc response completion helpers, maintenanceBucketSummary, and
// maintenanceNextActionSummary.
// Split out of scripts/dogfood/dogfood-mcp-walk.test.mjs (structural decomposition, logic unchanged).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { assertPnpmScriptsExist } from "../pnpm-script-refs.mjs";

import {
  batchNoWriteMetadataCoverageSummary,
  batchRowRepairSummary,
  batchWriteMetadataAbsenceSummary,
  buildDogfoodDiscoveryRequests,
  buildDogfoodRequests,
  componentSummary,
  createUtf8Accumulator,
  DOGFOOD_TUNED_HEALTH_ARGS,
  DOGFOOD_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
  DOGFOOD_RESPONSE_LABELS,
  dogfoodTimeoutErrorMessage,
  dogfoodUsage,
  expectedResponseIds,
  formatWorkspaceNextActionRows,
  graphStructuredContentSummary,
  healthCheckStatusSummary,
  importModuleEdgeKindSummary,
  initializeInstructionStatus,
  maintenanceBucketSummary,
  maintenanceNextActionSummary,
  missingResponseLabels,
  parseDogfoodArgs,
  parseDogfoodTimeoutMs,
  parseRpcResponses,
  rpcTimeoutFailure,
  shouldFinishRpc,
  shouldPrintDogfoodHelp,
  selectDogfoodTargets,
  stderrWarningLines,
  stderrWarningFailures,
  strictClosestValueSummary,
  strictRepairSummary,
  structuredContentStatus,
  toolsListInventoryStatus,
  toolsListSchemaStatus,
  toolsListAnnotationSummary,
  tunedHealthScopeSummary,
  tunedWorkspaceBriefScopeSummary,
  workspaceNextActionAnalysisLabel,
  workspaceNextActionSummary,
  writeMetadataAbsenceSummary,
  writeRowLabelGuidanceSummary,
} from "../../dogfood/dogfood-mcp-walk.mjs";
import {
  EXPECTED_TOOLS,
  expectedToolsListAnnotationSummary,
} from "../../../mcp/scripts/verify/tools-list/inventory.mjs";
import {
  VERIFY_TUNED_HEALTH_ARGS,
  VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
} from "../../../mcp/scripts/verify/requests/first-contact.mjs";
import {
  TOOLS_LIST_SCHEMA_CONTRACT_SUMMARY,
} from "../../../mcp/scripts/verify/tools-list/schema.mjs";
import { QUERY_ONTOLOGY_OPERATIONS } from "../../../mcp/src/ontology-engine.mjs";
import { ROOT_PKG, makeDogfoodToolsList, okShape } from "./fixtures.mjs";

const TEST_TARGETS = {
  projectSlug: "project",
  domainSlug: "domains/ai-agent-partner",
  capabilitySlug: "capabilities/mcp-server",
  capabilityTitle: "MCP Server",
  mergeTargetSlug: "capabilities/vault-validator",
  pathTargetSlug: "domains/vault-local-first",
  patternStartSlug: "project",
  pattern: ["domain"],
  relationType: "domain",
  slugNeedle: "mcp",
  similarCandidateSlug: "capabilities/mcp-server-dogfood-candidate",
};

describe("rpc response completion helpers", () => {
  it("derives live dogfood targets from kind probes instead of repository slugs", () => {
    const targets = selectDogfoodTargets({
      projects: {
        nodes: [{ slug: "products/nova", kind: "project", title: "Nova" }],
      },
      domains: {
        nodes: [{ slug: "domains/runtime", kind: "domain", title: "Runtime" }],
      },
      capabilities: {
        nodes: [
          {
            slug: "capabilities/runtime-a",
            kind: "capability",
            title: "Runtime A",
            domain: "domains/runtime",
          },
          {
            slug: "capabilities/runtime-b",
            kind: "capability",
            title: "Runtime B",
            domain: "domains/runtime",
          },
        ],
      },
    });

    assert.deepEqual(targets, {
      projectSlug: "products/nova",
      domainSlug: "domains/runtime",
      capabilitySlug: "capabilities/runtime-a",
      capabilityTitle: "Runtime A",
      mergeTargetSlug: "capabilities/runtime-b",
      pathTargetSlug: "domains/runtime",
      patternStartSlug: "capabilities/runtime-a",
      pattern: ["domain"],
      relationType: "domain",
      slugNeedle: "runtime-a",
      similarCandidateSlug: "capabilities/runtime-a-dogfood-candidate",
    });

    const requests = buildDogfoodRequests(targets);
    assert.deepEqual(requests.find((request) => request.id === 44)?.params.arguments, {
      operation: "path",
      from: "capabilities/runtime-a",
      to: "domains/runtime",
      maxHops: 4,
    });
    assert.deepEqual(requests.find((request) => request.id === 12)?.params.arguments, {
      operation: "pattern_walk",
      slug: "capabilities/runtime-a",
      pattern: ["domain"],
      limit: 5,
    });
    assert.equal(requests.find((request) => request.id === 45)?.params.arguments.project, "products/nova");
    assert.equal(JSON.stringify(requests).includes("ai-agent-partner"), false);
    assert.equal(JSON.stringify(requests).includes("vault-local-first"), false);
  });

  it("arms discovery with non-empty project, domain, and capability probes", () => {
    const requests = buildDogfoodDiscoveryRequests();
    const calls = requests.filter((request) => request.method === "tools/call");

    assert.deepEqual(
      calls.map((request) => request.params.arguments),
      [
        { kind: "project", limit: 500 },
        { kind: "domain", limit: 500 },
        { kind: "capability", limit: 500 },
      ],
    );
    assert.equal(new Set(calls.map((request) => request.id)).size, 3);
  });

  it("fails closed when discovery cannot form a real capability-domain relation", () => {
    assert.throws(
      () => selectDogfoodTargets({
        projects: { nodes: [{ slug: "products/nova", kind: "project", title: "Nova" }] },
        domains: { nodes: [{ slug: "domains/runtime", kind: "domain", title: "Runtime" }] },
        capabilities: {
          nodes: [{ slug: "capabilities/orphan", kind: "capability", title: "Orphan" }],
        },
      }),
      /capability with a resolved domain and a second merge target/,
    );
  });

  it("formats workspace next actions with actionable detail", () => {
    assert.deepEqual(
      formatWorkspaceNextActionRows([
        {
          kind: "health_check",
          severity: "info",
          id: "components",
          count: 6,
          message: "Inspect disconnected components.",
        },
        {
          kind: "materialize_external_elements",
          severity: "warn",
          count: 2,
        },
      ]),
      [
        "  info  health_check                   components x6 - Inspect disconnected components.",
        "  warn  materialize_external_elements   x2",
      ],
    );
  });

  it("summarizes workspace next actions for the final dogfood analysis", () => {
    assert.equal(workspaceNextActionSummary(null), "none");
    assert.equal(workspaceNextActionSummary([]), "none");
    assert.equal(
      workspaceNextActionSummary([
        { id: "components", kind: "health_check", severity: "info", count: 6 },
        { id: "materialize_external_elements", kind: "materialize_external_elements", severity: "warn", count: 2 },
        { id: "resolve_dangling_references", kind: "resolve_dangling_references", severity: "fail" },
        { id: "add_missing_relations", kind: "add_missing_relations", severity: "warn", count: 4 },
      ]),
      "components/health_check:info:6, materialize_external_elements:warn:2, resolve_dangling_references:fail, +1 more",
    );
  });

  it("labels final workspace next actions as non-blocking dogfood output", () => {
    assert.equal(
      workspaceNextActionAnalysisLabel("workspace_brief"),
      "workspace_brief non-blocking nextActions",
    );
    assert.equal(
      workspaceNextActionAnalysisLabel("workspace_brief_tuned"),
      "workspace_brief_tuned non-blocking nextActions",
    );
  });

  it("summarizes batch writer row-label guidance for dogfood output", () => {
    const tools = makeDogfoodToolsList().tools;
    assert.equal(writeRowLabelGuidanceSummary(tools), "pass");

    const missingConcepts = makeDogfoodToolsList().tools;
    missingConcepts.find((tool) => tool.name === "add_concepts").description =
      "Batch rows are written independently.";
    assert.equal(writeRowLabelGuidanceSummary(missingConcepts), "missing add_concepts concepts[n], add_concepts repair fields, add_concepts duplicate input slug");

    const missingConceptsRepair = makeDogfoodToolsList().tools;
    missingConceptsRepair.find((tool) => tool.name === "add_concepts").description =
      "A row with a duplicate input slug returns ok:false labelled concepts[n].";
    assert.equal(writeRowLabelGuidanceSummary(missingConceptsRepair), "missing add_concepts repair fields");

    const missingRelations = makeDogfoodToolsList().tools;
    missingRelations.find((tool) => tool.name === "add_relations").description =
      "Batch rows are written independently.";
    assert.equal(writeRowLabelGuidanceSummary(missingRelations), "missing add_relations relations[n], add_relations repair fields, add_relations closest-value type hint");

    const missingRelationsClosestValue = makeDogfoodToolsList().tools;
    missingRelationsClosestValue.find((tool) => tool.name === "add_relations").description =
      "A row with an unknown type returns ok:false labelled relations[n] with repair fields.";
    assert.equal(writeRowLabelGuidanceSummary(missingRelationsClosestValue), "missing add_relations closest-value type hint");
  });

  it("summarizes tools/list annotation coverage for dogfood output", () => {
    const tools = makeDogfoodToolsList().tools;
    assert.equal(
      toolsListAnnotationSummary(tools),
      expectedToolsListAnnotationSummary(),
    );

    const drifted = makeDogfoodToolsList().tools;
    drifted.find((tool) => tool.name === "list_concepts").annotations.openWorldHint = true;
    assert.equal(
      toolsListAnnotationSummary(drifted),
      "23/23 titled; 13/13 read; 10/10 write; 6/6 destructive; 2/2 idempotent; 22/23 local-only",
    );
    assert.equal(toolsListAnnotationSummary(null), "missing tools/list");
  });

  it("summarizes tools/list schema coverage for dogfood output", () => {
    assert.equal(
      toolsListInventoryStatus(null),
      "pass (missing/extra/duplicate/invalid names)",
    );
    assert.equal(
      toolsListInventoryStatus("tools mismatch — missing: (none), extra: (none), duplicates: list_concepts, invalidNames: 0"),
      "tools mismatch — missing: (none), extra: (none), duplicates: list_concepts, invalidNames: 0",
    );
    assert.equal(
      toolsListSchemaStatus(null),
      `pass (${TOOLS_LIST_SCHEMA_CONTRACT_SUMMARY})`,
    );
    assert.equal(
      toolsListSchemaStatus("add_relations inputSchema type enum drift"),
      "add_relations inputSchema type enum drift",
    );
    assert.match(
      toolsListSchemaStatus(null, { color: true }),
      /pass/,
    );
    assert.ok(
      toolsListSchemaStatus(null, { color: true }).includes(TOOLS_LIST_SCHEMA_CONTRACT_SUMMARY),
    );
  });

  it("summarizes initialize instruction inventory and safety coverage for dogfood output", () => {
    assert.equal(
      initializeInstructionStatus(okShape.initialize),
      "pass (tool inventory + safety/recovery guidance)",
    );

    assert.equal(
      initializeInstructionStatus({
        ...okShape.initialize,
        instructions: okShape.initialize.instructions.replace("infer_imports", "infer imports"),
      }),
      "initialize instructions missing tool inventory entry: infer_imports",
    );

    assert.match(initializeInstructionStatus(okShape.initialize, { color: true }), /pass/);
  });

  it("summarizes strict closest-value smoke details for final dogfood output", () => {
    assert.equal(
      strictRepairSummary(okShape.strictArgs),
      "rejected true (arg lmit->limit; allowed 8)",
    );
    assert.equal(
      strictRepairSummary(okShape.strictMultiArgs),
      "rejected true (args lmit->limit, summry->summary; allowed 8)",
    );
    assert.equal(
      strictRepairSummary(okShape.strictEnum),
      `rejected true (operation overveiw->overview; allowed ${QUERY_ONTOLOGY_OPERATIONS.length})`,
    );
    assert.equal(
      strictRepairSummary(okShape.strictUnknownTool),
      `rejected true (tool list_concept->list_concepts; allowed ${EXPECTED_TOOLS.length})`,
    );
    assert.equal(
      strictRepairSummary(okShape.strictMaintenancePhaseFilter),
      "rejected true (phases items repiar->repair; allowed 5)",
    );
    assert.equal(
      strictRepairSummary(okShape.strictRelationFilter),
      "rejected true (dependencyTypes items depend_on->depends_on; allowed 9)",
    );
    assert.equal(
      strictRepairSummary(okShape.strictRelationCheck),
      "rejected true (type depend_on->depends_on; allowed 9)",
    );
    assert.equal(
      strictRepairSummary(okShape.strictOrphanMatchNodesKindFilter),
      "rejected true (kind capabilty->capability; allowed 6)",
    );
    assert.equal(
      strictRepairSummary(okShape.strictRecommendRelationsUnsupportedKindFilter),
      "rejected true (kind domain->?; allowed 2)",
    );
    assert.equal(
      batchRowRepairSummary(okShape.addConceptsRowRepair.concepts),
      "5/5 failed (titel->title, domian->domain, titel->title, kind capabilty->capability, verify-duplicate-slug first concepts[2]; rows concepts[1], concepts[3], concepts[4])",
    );
    assert.equal(
      batchRowRepairSummary(okShape.addRelationsRowRepair.relations),
      "4/4 failed (relation->type, frm->from, relation->type, type depend_on->depends_on; rows relations[1], relations[3])",
    );
    assert.equal(
      strictClosestValueSummary(okShape.strictRelationFilter),
      "rejected true (depend_on -> depends_on)",
    );
    assert.equal(
      strictClosestValueSummary(okShape.strictOrphanMatchNodesKindFilter),
      "rejected true (capabilty -> capability)",
    );
    assert.equal(
      strictClosestValueSummary(okShape.strictFindOrphansExcludeKindFilter),
      "rejected true (capabilty -> capability)",
    );
    assert.equal(
      strictClosestValueSummary(okShape.strictListConceptsFilterKind),
      "rejected true (capabilty -> capability)",
    );
    assert.equal(
      strictClosestValueSummary(okShape.strictListConceptsFilterHasKey),
      "rejected true (capabilties -> capabilities)",
    );
    assert.equal(
      strictClosestValueSummary(okShape.strictListConceptsKindFilter),
      "rejected true (capabilty -> capability)",
    );
    assert.equal(
      strictClosestValueSummary(okShape.strictRecommendRelationsKindFilter),
      "rejected true (capabilty -> capability)",
    );
    assert.equal(
      strictClosestValueSummary(okShape.strictRecommendRelationsUnsupportedKindFilter),
      "rejected true (domain; no suggestion)",
    );
    assert.equal(
      strictClosestValueSummary(okShape.strictMatchNodesSortFilter),
      "rejected true (outDegre -> outDegree)",
    );
    assert.equal(
      strictClosestValueSummary(okShape.strictMatchEdgesTypeFilter),
      "rejected true (depend_on -> depends_on)",
    );
    assert.equal(
      strictClosestValueSummary({ result: { isError: true, content: [{ text: 'Received: "depend_on".' }] } }),
      "rejected true (depend_on; no suggestion)",
    );
    assert.equal(
      strictClosestValueSummary({ result: { isError: true, content: [{ text: "different error" }] } }),
      "rejected true",
    );
    assert.equal(
      strictClosestValueSummary({ result: { isError: false, content: [{ text: "ok" }] } }),
      "rejected false",
    );
    assert.equal(
      strictRepairSummary({ result: { isError: true, content: [{ text: 'Received: "depend_on". Did you mean "depends_on"?' }] } }),
      "rejected true (depend_on -> depends_on)",
    );
  });

  it("summarizes no-write metadata evidence of a strict add_relations rejection", () => {
    assert.equal(writeMetadataAbsenceSummary({ result: { isError: true, structuredContent: { ok: false } } }), "absent");
    assert.equal(
      writeMetadataAbsenceSummary({
        result: {
          isError: true,
          changed: false,
          structuredContent: { ok: false, postWriteMaintenance: { summary: {} } },
        },
      }),
      "present changed, postWriteMaintenance",
    );
  });

  it("summarizes invalid-only batch no-write metadata evidence", () => {
    assert.equal(
      batchWriteMetadataAbsenceSummary(okShape.addRelationsRowRepair, okShape.addRelationsRowRepairStructured, "relations"),
      "absent",
    );
    assert.equal(
      batchNoWriteMetadataCoverageSummary({
        addConceptsPayload: okShape.addConceptsRowRepair,
        addConceptsStructuredPayload: okShape.addConceptsRowRepairStructured,
        addRelationsPayload: okShape.addRelationsRowRepair,
        addRelationsStructuredPayload: okShape.addRelationsRowRepairStructured,
      }),
      "2/2 absent",
    );
    assert.equal(
      batchWriteMetadataAbsenceSummary(
        {
          relations: [
            okShape.addRelationsRowRepair.relations[0],
            { ...okShape.addRelationsRowRepair.relations[1], changed: false },
          ],
        },
        { relations: okShape.addRelationsRowRepair.relations.slice(0, 2) },
        "relations",
      ),
      "present parsed.relations[1].changed",
    );
    assert.equal(
      batchWriteMetadataAbsenceSummary(
        { relations: okShape.addRelationsRowRepair.relations.slice(0, 2) },
        {
          relations: [
            okShape.addRelationsRowRepair.relations[0],
            { ...okShape.addRelationsRowRepair.relations[1], alreadyExists: false },
          ],
          postWriteMaintenance: {},
        },
        "relations",
      ),
      "present structuredContent.postWriteMaintenance, structuredContent.relations[1].alreadyExists",
    );
    assert.equal(
      batchNoWriteMetadataCoverageSummary({
        addConceptsPayload: okShape.addConceptsRowRepair,
        addConceptsStructuredPayload: okShape.addConceptsRowRepairStructured,
        addRelationsPayload: { relations: okShape.addRelationsRowRepair.relations.slice(0, 2) },
        addRelationsStructuredPayload: {
          relations: [
            okShape.addRelationsRowRepair.relations[0],
            { ...okShape.addRelationsRowRepair.relations[1], alreadyExists: false },
          ],
          postWriteMaintenance: {},
        },
      }),
      "1/2 absent (add_relations present structuredContent.postWriteMaintenance, structuredContent.relations[1].alreadyExists)",
    );
  });

  it("summarizes health check statuses for the final dogfood analysis", () => {
    assert.equal(healthCheckStatusSummary(null), "none");
    assert.equal(healthCheckStatusSummary([]), "none");
    assert.equal(
      healthCheckStatusSummary([
        { id: "compile_issues", status: "pass", count: 0 },
        { id: "components", status: "info", count: 6 },
        { id: "dependency_cycles", status: "fail", count: 1 },
      ], 2),
      "compile_issues:pass:0, components:info:6, +1 more",
    );
  });

  it("summarizes tuned health scope so dogfood output explains scoped component checks", () => {
    assert.equal(DOGFOOD_TUNED_HEALTH_ARGS, VERIFY_TUNED_HEALTH_ARGS);
    assert.equal(DOGFOOD_TUNED_WORKSPACE_BRIEF_NODE_LIMIT, VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT);
    assert.deepEqual(DOGFOOD_TUNED_HEALTH_ARGS.componentTypes, ["domains", "domain", "capabilities", "dependencies"]);
    assert.equal(
      tunedHealthScopeSummary(),
      "dependencyTypes=dependencies; componentTypes=domains/domain/capabilities/dependencies",
    );
    assert.equal(
      tunedWorkspaceBriefScopeSummary(),
      "dependencyTypes=dependencies; componentTypes=domains/domain/capabilities/dependencies; nodeLimit=3",
    );
    assert.equal(
      tunedHealthScopeSummary({ dependencyTypes: [], componentTypes: null }),
      "dependencyTypes=all; componentTypes=all",
    );
    assert.equal(
      tunedWorkspaceBriefScopeSummary({ dependencyTypes: [], componentTypes: null }, 1),
      "dependencyTypes=all; componentTypes=all; nodeLimit=1",
    );
  });

  it("summarizes infer_imports module edge kind evidence", () => {
    assert.equal(
      importModuleEdgeKindSummary([
        {
          from: "capabilities/auth",
          to: "capabilities/user",
          count: 3,
          kindCounts: { static: 2, dynamic: 1 },
        },
        {
          from: "capabilities/billing",
          to: "elements/src/shared/api",
          count: 1,
          kindCounts: { reexport: 1 },
        },
      ]),
      "capabilities/auth->capabilities/user x3 (static:2/dynamic:1), capabilities/billing->elements/src/shared/api x1 (reexport:1)",
    );
    assert.equal(
      importModuleEdgeKindSummary([
        { from: "a", to: "b", count: 1, kindCounts: { static: 1 } },
        { from: "c", to: "d", count: 1, kindCounts: { require: 1 } },
        { from: "e", to: "f", count: 1, kindCounts: { side: 1 } },
      ], 2),
      "a->b x1 (static:1), c->d x1 (require:1), +1 more",
    );
    assert.equal(importModuleEdgeKindSummary([]), "none");
  });

  it("summarizes component rows for the final dogfood analysis", () => {
    assert.equal(componentSummary(null), "none");
    assert.equal(componentSummary({ components: [] }), "none");
    assert.equal(
      componentSummary({
        components: [
          { id: 1, size: 27, nodes: [{ slug: "project" }] },
          { id: 2, size: 1, nodeLimited: true, nodes: [{ slug: "external/foo" }] },
          { id: 3, size: 1, nodes: [] },
          { id: 4, size: 1, nodes: [{ slug: "orphan" }] },
        ],
      }),
      "1:27:project, 2:1+:external/foo, 3:1:unknown, +1 more",
    );
  });

  it("summarizes graph structuredContent coverage for the final dogfood analysis", () => {
    assert.equal(graphStructuredContentSummary([]), "n/a");
    assert.equal(
      graphStructuredContentSummary([
        ["overview", { ok: true }, { ok: true }],
        ["health", { status: "healthy" }, { status: "healthy" }],
      ]),
      "pass 2/2",
    );
    assert.equal(
      graphStructuredContentSummary([
        ["overview", { ok: true }, undefined],
        ["health", { status: "healthy" }, null],
        ["path", { found: true }, { found: false }],
      ]),
      "fail 0/3 (missing 2: overview, health; mismatch 1: path)",
    );
  });

  it("formats per-section structuredContent status distinctly", () => {
    assert.match(structuredContentStatus({ ok: true }, { ok: true }), /pass/);
    assert.match(structuredContentStatus({ operation: "overview", graph: { nodes: 1 } }, { graph: { nodes: 1 }, operation: "overview" }), /pass/);
    assert.match(structuredContentStatus({ ok: true }, null), /missing/);
    assert.match(structuredContentStatus({ ok: true }, undefined), /missing/);
    assert.match(structuredContentStatus({ ok: true }, { ok: false }), /mismatch/);
    assert.match(structuredContentStatus({ ok: true }, { ok: false }), /\$\.ok: parsed true, structuredContent false/);
  });

  it("parses dogfood timeout env as a strict positive integer", () => {
    assert.equal(parseDogfoodTimeoutMs(undefined), 5000);
    assert.equal(parseDogfoodTimeoutMs(""), 5000);
    assert.equal(parseDogfoodTimeoutMs("12000"), 12000);
    assert.equal(parseDogfoodTimeoutMs("1000ms"), false);
    assert.equal(parseDogfoodTimeoutMs("0"), false);
    assert.match(dogfoodTimeoutErrorMessage("1000ms"), /Received: "1000ms"/);
    assert.match(dogfoodTimeoutErrorMessage("1000ms"), /OATLAS_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk/);
  });

  it("prints dogfood help without requiring an MCP server", () => {
    assert.equal(shouldPrintDogfoodHelp(["--help"]), true);
    assert.equal(shouldPrintDogfoodHelp(["-h"]), true);
    assert.equal(shouldPrintDogfoodHelp(["--", "--help"]), true);
    assert.equal(shouldPrintDogfoodHelp([]), false);
    assert.deepEqual(parseDogfoodArgs([]), { help: false, error: null });
    assert.deepEqual(parseDogfoodArgs(["--"]), { help: false, error: null });
    assert.deepEqual(parseDogfoodArgs(["--help"]), { help: true, error: null });
    assert.deepEqual(parseDogfoodArgs(["-h"]), { help: true, error: null });
    assert.deepEqual(parseDogfoodArgs(["--", "--help"]), { help: true, error: null });
    const usage = dogfoodUsage();
    assert.match(usage, /pnpm dogfood:help/);
    assert.match(usage, /pnpm dogfood:walk -- \[--help\]/);
    assert.match(usage, /node scripts\/dogfood\/dogfood-mcp-walk\.mjs \[--help\]/);
    assert.match(usage, /Print this help without starting the MCP server/);
    assert.match(usage, /No positional vault argument is accepted/);
    assert.match(usage, /OATLAS_DOGFOOD_TIMEOUT_MS/);
    assert.match(usage, /OATLAS_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk/);
    assert.match(usage, /Lighter dogfood gates:/);
    assert.match(usage, /pnpm dogfood:compile\s+Fast compile_ontology summary over docs\/ontology/);
    assert.match(usage, /pnpm dogfood:health\s+Fail-closed health JSON gate over docs\/ontology/);
    assert.match(usage, /pnpm dogfood:agent\s+Claude Code\/Codex agent_brief JSON handoff over docs\/ontology/);
    assert.match(usage, /pnpm dogfood:brief\s+First-contact workspace_brief JSON snapshot over docs\/ontology/);
    assert.match(usage, /pnpm dogfood:growth\s+growth_plan JSON snapshot over docs\/ontology/);
    assert.match(usage, /pnpm dogfood:maintenance\s+maintenance_plan JSON snapshot over docs\/ontology/);
    assert.match(
      usage,
      /pnpm dogfood:status\s+Human-readable health \+ workspace_brief \+ maintenance over docs\/ontology; ends with \[dogfood:status\] health:N · workspace-brief:N · maintenance:N and focused hints before pnpm dogfood:verify on failure/,
    );
    assert.match(usage, /pnpm dogfood:verify\s+Installed-style verify gate over docs\/ontology before the full walk/);
    assert.match(usage, /pnpm test:dogfood:args\s+Shared dogfood shortcut argument helper contract/);
    assert.match(usage, /pnpm test:dogfood:script-refs\s+Shared help\/package-script reference \+ focused filter parser\/wrapper summary contract/);
    assert.match(usage, /pnpm test:dogfood:status\s+Narrow dogfood status shortcut runner contract/);
    assert.match(usage, /pnpm test:mcp:registration\s+Narrow source-checkout .mcp.json\/.mcp.json.example\/.codex\/config.toml registration template contract/);
    assert.match(usage, /pnpm test:mcp:maintenance\s+Narrow maintenance_plan filter\/cursor\/resume\/work-queue formatter gates/);
    assert.match(usage, /pnpm test:mcp:dogfood:timeout/);
    assert.match(usage, /Narrow dogfood timeout\/help retry diagnostics/);
    assert.match(usage, /pnpm dogfood:test\s+Full dogfood helper regression suite when focused checks are not enough/);
    assert.match(usage, /Dogfood helper, compile\/index gates, tools\/list inventory names \+ annotation coverage, row-label guidance, batch cap gates, invalid-only batch row repair \+ no-write metadata smoke, strict closest-value and unknown-tool repair summary, vault warning and validate_vault problem gates, first-contact health\/growth\/sample-shape gates, maintenance work-queue shape \+ formatter checks, initialize tool-inventory \+ safety\/recovery guidance, destructive dry-run, help\/argument\/timeout handling, structuredContent, strict relation filters, strict graph kind filters, stderr warning checks/);
    assertPnpmScriptsExist(usage, ROOT_PKG.scripts);
  });

  it("dogfood help — helper uses natural exit so verbose stdout can flush", () => {
    // Structural decomposition (scripts/lib/dogfood-walk/*.mjs) split the walk
    // across an entry orchestrator (spawn/rpc client + exit-code guard) and a
    // console report module (the return-code branches) — check each seam.
    const entrySource = readFileSync("scripts/dogfood/dogfood-mcp-walk.mjs", "utf-8");
    const rpcClientSource = readFileSync("scripts/lib/dogfood-walk/rpc-client.mjs", "utf-8");
    const reportSource = readFileSync("scripts/lib/dogfood-walk/run-dogfood-walk.mjs", "utf-8");

    for (const source of [entrySource, rpcClientSource, reportSource]) {
      assert.doesNotMatch(source, /\bprocess\.exit\s*\(/);
    }
    assert.doesNotMatch(rpcClientSource, /spawn\("node", \[SERVER\]/);
    assert.match(rpcClientSource, /spawn\(process\.execPath, \[SERVER\]/);
    assert.match(entrySource, /process\.exitCode\s*=\s*await main\(\)\.catch/);
    assert.match(reportSource, /return 2/);
    assert.match(entrySource, /return 1/);
    assert.match(reportSource, /return 1/);
  });

  it("rejects unsupported dogfood arguments before starting MCP", () => {
    assert.deepEqual(parseDogfoodArgs(["docs/ontology"]), {
      help: false,
      error: "dogfood:walk does not accept arguments: docs/ontology\nRun pnpm dogfood:walk -- --help for usage.",
    });
    assert.deepEqual(parseDogfoodArgs(["--", "docs/ontology"]), {
      help: false,
      error: "dogfood:walk does not accept arguments: docs/ontology\nRun pnpm dogfood:walk -- --help for usage.",
    });
    assert.deepEqual(parseDogfoodArgs(["--vault", "docs/ontology"]), {
      help: false,
      error: "dogfood:walk does not accept arguments: --vault, docs/ontology\nRun pnpm dogfood:walk -- --help for usage.",
    });
    assert.deepEqual(parseDogfoodArgs(["--hlep"]), {
      help: false,
      error: "dogfood:walk does not accept arguments: --hlep. Did you mean --help?\nRun pnpm dogfood:walk -- --help for usage.",
    });
  });

  it("derives response ids from requests with JSON-RPC ids", () => {
    assert.deepEqual(
      [...expectedResponseIds([{ id: 1 }, { method: "notifications/initialized" }, { id: 2 }])],
      [1, 2],
    );
  });

  it("parses newline-delimited JSON-RPC responses", () => {
    assert.deepEqual(
      parseRpcResponses('{"id":1,"result":{}}\nnot-json\n{"id":2,"error":{"message":"bad"}}\n'),
      [
        { id: 1, result: {} },
        { id: 2, error: { message: "bad" } },
      ],
    );
  });

  it("keeps UTF-8 characters intact across stream chunk boundaries", () => {
    const wire = Buffer.from('{"id":1,"result":{"text":"채팅 로그"}}\n', "utf8");
    const splitAt = wire.indexOf(Buffer.from("팅", "utf8")) + 1;
    const accumulator = createUtf8Accumulator();

    accumulator.write(wire.subarray(0, splitAt));
    const stdout = accumulator.write(wire.subarray(splitAt));

    assert.equal(accumulator.end(), stdout);
    assert.deepEqual(parseRpcResponses(stdout), [
      { id: 1, result: { text: "채팅 로그" } },
    ]);
    assert.equal(stdout.includes("�"), false);
  });

  it("finishes after all expected responses or any error response", () => {
    const expectedIds = new Set([1, 2]);
    assert.equal(shouldFinishRpc('{"id":1,"result":{}}\n', expectedIds), false);
    assert.equal(shouldFinishRpc('{"id":1,"result":{}}\n{"id":2,"result":{}}\n', expectedIds), true);
    assert.equal(shouldFinishRpc('{"id":1,"error":{"message":"bad"}}\n', expectedIds), true);
  });

  it("formats timeout failures with missing response labels", () => {
    const labels = new Map([
      [1, "initialize"],
      [2, "list_concepts_census"],
      [3, "list_concepts"],
    ]);
    const missing = missingResponseLabels([{ id: 1, result: {} }], labels);
    assert.deepEqual(missing, ["list_concepts_census", "list_concepts"]);
    const failure = rpcTimeoutFailure(5000, missing);
    assert.match(failure, /rpc: timed out after 5000ms waiting for list_concepts_census, list_concepts\./);
    assert.match(failure, /Increase OATLAS_DOGFOOD_TIMEOUT_MS for slow dogfood runs\./);
    assert.match(failure, /OATLAS_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk/);
    assert.match(
      rpcTimeoutFailure(5000, []),
      /rpc: timed out after 5000ms waiting for unknown JSON-RPC responses\./,
    );
  });

  it("keeps dogfood response labels aligned with the get_concepts smoke", () => {
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(16), "get_concepts");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(17), "project_map_query_plan");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(18), "project_map");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(19), "domain_profile");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(20), "domain_matrix");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(21), "components");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(22), "relation_check");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(23), "maintenance_plan");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(24), "growth_plan");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(25), "recommend_relations");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(26), "cycles");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(27), "topological_order");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(28), "lineage");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(29), "containment_tree");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(30), "reachability");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(31), "impact");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(32), "blast_radius");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(33), "subgraph");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(34), "schema");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(35), "facets");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(36), "match_nodes");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(37), "match_edges");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(38), "node_profile");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(39), "centrality");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(40), "communities");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(41), "similar_nodes");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(42), "explain_relation");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(43), "neighbors");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(44), "path");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(45), "project_scope");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(46), "strict_args");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(47), "strict_enum");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(48), "project_probe");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(49), "health_tuned");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(50), "workspace_brief_tuned");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(51), "strict_maintenance_phase_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(52), "strict_maintenance_severity_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(53), "strict_maintenance_kind_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(54), "maintenance_plan_missing_cursor");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(55), "tools_list");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(56), "list_concepts_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(57), "analyze_repo_structure");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(58), "infer_imports");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(59), "strict_multi_args");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(61), "strict_relation_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(62), "compile_ontology_indexes");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(63), "rename_concept_dry_run");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(64), "merge_concepts_dry_run");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(65), "delete_concept_dry_run");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(66), "strict_relation_check");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(67), "strict_graph_kind_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(68), "strict_graph_from_kind_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(69), "strict_graph_to_kind_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(71), "strict_recommend_relations_kind_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(72), "strict_recommend_relations_unsupported_kind_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(73), "strict_match_nodes_sort_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(74), "strict_match_edges_type_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(76), "strict_orphan_match_nodes_kind_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(78), "strict_list_concepts_filter_kind");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(79), "strict_list_concepts_filter_has_key");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(80), "strict_list_concepts_kind_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(81), "get_concepts_batch_cap");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(82), "add_concepts_batch_cap");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(83), "add_relations_batch_cap");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(84), "strict_unknown_tool");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(85), "add_concepts_row_repair");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(86), "add_relations_row_repair");
    assert.deepEqual(
      [...expectedResponseIds(buildDogfoodRequests(TEST_TARGETS))].sort((a, b) => a - b),
      [...DOGFOOD_RESPONSE_LABELS.keys()].sort((a, b) => a - b),
    );
    const responsesWithoutGetConcepts = [...DOGFOOD_RESPONSE_LABELS.keys()]
      .filter((id) => id !== 16)
      .map((id) => ({ id, result: {} }));
    const missing = missingResponseLabels(responsesWithoutGetConcepts, DOGFOOD_RESPONSE_LABELS);
    assert.deepEqual(missing, ["get_concepts"]);
    const failure = rpcTimeoutFailure(5000, missing);
    assert.match(failure, /rpc: timed out after 5000ms waiting for get_concepts\./);
    assert.match(failure, /OATLAS_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk/);
  });

  it("keeps dogfood batch cap requests read-safe or rejected before writes", () => {
    const requests = buildDogfoodRequests(TEST_TARGETS);
    const getConceptsBatchCap = requests.find((request) => request.id === 81);
    const addConceptsBatchCap = requests.find((request) => request.id === 82);
    const addRelationsBatchCap = requests.find((request) => request.id === 83);
    const addConceptsRowRepair = requests.find((request) => request.id === 85);
    const addRelationsRowRepair = requests.find((request) => request.id === 86);

    assert.equal(getConceptsBatchCap?.params?.name, "get_concepts");
    assert.equal(getConceptsBatchCap?.params?.arguments?.slugs?.length, 51);
    assert.equal(addConceptsBatchCap?.params?.name, "add_concepts");
    assert.equal(addConceptsBatchCap?.params?.arguments?.concepts?.length, 51);
    assert.equal(addRelationsBatchCap?.params?.name, "add_relations");
    assert.equal(addRelationsBatchCap?.params?.arguments?.relations?.length, 51);
    assert.equal(addConceptsRowRepair?.params?.name, "add_concepts");
    assert.deepEqual(addConceptsRowRepair?.params?.arguments?.concepts?.map((row) => row?.kind ?? null), [
      null,
      "capability",
      "capabilty",
      "capability",
      "capability",
    ]);
    assert.equal(addRelationsRowRepair?.params?.name, "add_relations");
    assert.deepEqual(addRelationsRowRepair?.params?.arguments?.relations?.map((row) => row?.type ?? null), [
      null,
      "relates",
      "depend_on",
      "relates",
    ]);
  });

  it("keeps destructive dogfood dry-run requests non-writing", () => {
    const requests = buildDogfoodRequests(TEST_TARGETS);
    assert.deepEqual(requests.find((request) => request.id === 63)?.params, {
      name: "rename_concept",
      arguments: {
        oldSlug: "capabilities/mcp-server",
        newSlug: "capabilities/mcp-server-dogfood-dry-run",
      },
    });
    assert.deepEqual(requests.find((request) => request.id === 64)?.params, {
      name: "merge_concepts",
      arguments: {
        fromSlug: "capabilities/mcp-server",
        intoSlug: "capabilities/vault-validator",
      },
    });
    assert.deepEqual(requests.find((request) => request.id === 65)?.params, {
      name: "delete_concept",
      arguments: { slug: "capabilities/mcp-server" },
    });
  });

  it("keeps strict relation_check dogfood request endpoint-independent", () => {
    const requests = buildDogfoodRequests(TEST_TARGETS);
    assert.deepEqual(requests.find((request) => request.id === 66)?.params, {
      name: "query_ontology",
      arguments: {
        operation: "relation_check",
        from: "missing-relation-check-source",
        to: "missing-relation-check-target",
        type: "depend_on",
      },
    });
  });

  it("keeps the strict orphan match_nodes kind dogfood request endpoint-independent", () => {
    const requests = buildDogfoodRequests(TEST_TARGETS);
    assert.deepEqual(requests.find((request) => request.id === 76)?.params, {
      name: "query_ontology",
      arguments: {
        operation: "match_nodes",
        hasIncoming: false,
        kind: "capabilty",
      },
    });
    assert.equal(requests.some((request) => request.id === 77), false);
  });

  it("keeps strict list_concepts filter dogfood requests endpoint-independent", () => {
    const requests = buildDogfoodRequests(TEST_TARGETS);
    assert.deepEqual(requests.find((request) => request.id === 78)?.params, {
      name: "list_concepts",
      arguments: {
        filter: "kind=capabilty",
      },
    });
    assert.deepEqual(requests.find((request) => request.id === 79)?.params, {
      name: "list_concepts",
      arguments: {
        filter: "has(capabilties)",
      },
    });
  });

  it("keeps strict list_concepts kind dogfood request endpoint-independent", () => {
    const requests = buildDogfoodRequests(TEST_TARGETS);
    assert.deepEqual(requests.find((request) => request.id === 80)?.params, {
      name: "list_concepts",
      arguments: {
        kind: "capabilty",
      },
    });
  });

  it("keeps strict match_edges type dogfood request endpoint-independent", () => {
    const requests = buildDogfoodRequests(TEST_TARGETS);
    assert.deepEqual(requests.find((request) => request.id === 74)?.params, {
      name: "query_ontology",
      arguments: {
        operation: "match_edges",
        type: "depend_on",
      },
    });
  });

  it("keeps tuned health dogfood requests aligned with the printed scope", () => {
    const requests = buildDogfoodRequests(TEST_TARGETS);
    assert.deepEqual(requests.find((request) => request.id === 49)?.params.arguments, {
      operation: "health",
      ...DOGFOOD_TUNED_HEALTH_ARGS,
    });
    assert.deepEqual(requests.find((request) => request.id === 50)?.params.arguments, {
      operation: "workspace_brief",
      limit: 5,
      ...DOGFOOD_TUNED_HEALTH_ARGS,
      nodeLimit: DOGFOOD_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
    });
  });

  it("keeps dogfood request ids unique", () => {
    const ids = buildDogfoodRequests(TEST_TARGETS)
      .map((request) => request.id)
      .filter((id) => Number.isInteger(id));
    assert.deepEqual(
      ids.filter((id, index) => ids.indexOf(id) !== index),
      [],
    );
  });

  it("flags stderr warnings without failing on normal connection logs", () => {
    assert.deepEqual(stderrWarningLines("[ontology-atlas-mcp] connected. vault=/tmp/x"), []);
    assert.deepEqual(stderrWarningFailures("[ontology-atlas-mcp] connected. vault=/tmp/x"), []);
    assert.deepEqual(
      stderrWarningLines(
        "[ontology-atlas-mcp] connected. vault=/tmp/x\n(node:1) MaxListenersExceededWarning: Possible EventEmitter memory leak detected",
      ),
      ["(node:1) MaxListenersExceededWarning: Possible EventEmitter memory leak detected"],
    );
    assert.deepEqual(
      stderrWarningFailures(
        "[ontology-atlas-mcp] connected. vault=/tmp/x\n(node:1) MaxListenersExceededWarning: Possible EventEmitter memory leak detected",
      ),
      ["stderr warning: (node:1) MaxListenersExceededWarning: Possible EventEmitter memory leak detected"],
    );
  });
});

describe("maintenanceBucketSummary", () => {
  it("formats remaining maintenance buckets for dogfood output", () => {
    assert.equal(maintenanceBucketSummary(null), "n/a");
    assert.equal(maintenanceBucketSummary({}), "none");
    assert.equal(
      maintenanceBucketSummary({
        review: 1,
        link: 2,
        materialize: 2,
        ignored: 0,
      }),
      "link:2, materialize:2, review:1",
    );
    assert.equal(
      maintenanceBucketSummary({
        zeta: 1,
        alpha: 1,
        beta: 1,
      }, 2),
      "alpha:1, beta:1, +1 more",
    );
  });
});

describe("maintenanceNextActionSummary", () => {
  it("formats current-page maintenance next actions for dogfood output", () => {
    assert.equal(maintenanceNextActionSummary(null), "none");
    assert.equal(maintenanceNextActionSummary(undefined), "n/a");
    assert.equal(
      maintenanceNextActionSummary(okShape.maintenancePlan.nextExecutableAction),
      "maint_link link/add_missing_relation:warn -> add_relations",
    );
    assert.equal(
      maintenanceNextActionSummary(okShape.maintenancePlan.nextReviewAction),
      "maint_review review/unassigned_node:info",
    );
  });
});
