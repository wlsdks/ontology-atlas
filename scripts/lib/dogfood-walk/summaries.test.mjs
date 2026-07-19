#!/usr/bin/env node
// Tests for the dogfood MCP walk's human-readable summary/format helpers:
// rpc response completion helpers, maintenanceBucketSummary, and
// maintenanceNextActionSummary.
// Split out of scripts/dogfood-mcp-walk.test.mjs (structural decomposition, logic unchanged).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { assertPnpmScriptsExist } from "../pnpm-script-refs.mjs";

import {
  batchNoWriteMetadataCoverageSummary,
  batchRowRepairSummary,
  batchWriteMetadataAbsenceSummary,
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
} from "../../dogfood-mcp-walk.mjs";
import {
  EXPECTED_TOOLS,
  VERIFY_TUNED_HEALTH_ARGS,
  VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
  expectedToolsListAnnotationSummary,
  TOOLS_LIST_SCHEMA_CONTRACT_SUMMARY,
} from "../../../mcp/scripts/verify.mjs";
import { QUERY_ONTOLOGY_OPERATIONS } from "../../../mcp/src/ontology-engine.mjs";
import { ROOT_PKG, makeDogfoodToolsList, okShape } from "./fixtures.mjs";

describe("rpc response completion helpers", () => {
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
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows.";
    assert.equal(writeRowLabelGuidanceSummary(missingConcepts), "missing add_concepts concepts[n], add_concepts single-field repair, add_concepts multi-field Received fields, add_concepts duplicate first-seen, add_concepts duplicate structured row repair");

    const missingConceptsReceivedFields = makeDogfoodToolsList().tools;
    missingConceptsReceivedFields.find((tool) => tool.name === "add_concepts").description =
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels.";
    assert.equal(writeRowLabelGuidanceSummary(missingConceptsReceivedFields), "missing add_concepts single-field repair, add_concepts multi-field Received fields, add_concepts duplicate first-seen, add_concepts duplicate structured row repair");

    const missingConceptsSingleFieldRepair = makeDogfoodToolsList().tools;
    missingConceptsSingleFieldRepair.find((tool) => tool.name === "add_concepts").description =
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels, multi unknown-field rows report every unknown field with nearest hints and Received fields, and duplicate input slugs report the later concepts[n] row plus first-seen `concepts[m]` with structured `rowName` / `firstSeenAt`.";
    assert.equal(writeRowLabelGuidanceSummary(missingConceptsSingleFieldRepair), "missing add_concepts single-field repair");

    const missingConceptsEveryUnknownField = makeDogfoodToolsList().tools;
    missingConceptsEveryUnknownField.find((tool) => tool.name === "add_concepts").description =
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels, single unknown-field rows include `receivedField` plus one-row `unknownFields`, unknown-field rows include Received fields, and duplicate input slugs report the later concepts[n] row plus first-seen `concepts[m]` with structured `rowName` / `firstSeenAt`.";
    assert.equal(writeRowLabelGuidanceSummary(missingConceptsEveryUnknownField), "missing add_concepts multi-field Received fields");

    const missingConceptsDuplicate = makeDogfoodToolsList().tools;
    missingConceptsDuplicate.find((tool) => tool.name === "add_concepts").description =
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels, single unknown-field rows include `receivedField` plus one-row `unknownFields`, and multi unknown-field rows report every unknown field with nearest hints and Received fields.";
    assert.equal(writeRowLabelGuidanceSummary(missingConceptsDuplicate), "missing add_concepts duplicate first-seen, add_concepts duplicate structured row repair");

    const missingConceptsDuplicateStructured = makeDogfoodToolsList().tools;
    missingConceptsDuplicateStructured.find((tool) => tool.name === "add_concepts").description =
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels, single unknown-field rows include `receivedField` plus one-row `unknownFields`, multi unknown-field rows report every unknown field with nearest hints and Received fields, and duplicate input slugs report the later concepts[n] row plus first-seen `concepts[m]`.";
    assert.equal(writeRowLabelGuidanceSummary(missingConceptsDuplicateStructured), "missing add_concepts duplicate structured row repair");

    const missingRelations = makeDogfoodToolsList().tools;
    missingRelations.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows.";
    assert.equal(writeRowLabelGuidanceSummary(missingRelations), "missing add_relations relations[n], add_relations structured rowName, add_relations single-field repair, add_relations multi-field Received fields, add_relations structured field lists, add_relations closest-value type hint, add_relations structured value repair");

    const missingRelationsReceivedFields = makeDogfoodToolsList().tools;
    missingRelationsReceivedFields.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows with relations[n] labels.";
    assert.equal(writeRowLabelGuidanceSummary(missingRelationsReceivedFields), "missing add_relations structured rowName, add_relations single-field repair, add_relations multi-field Received fields, add_relations structured field lists, add_relations closest-value type hint, add_relations structured value repair");

    const missingRelationsSingleFieldRepair = makeDogfoodToolsList().tools;
    missingRelationsSingleFieldRepair.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`; unknown type rows include a closest-value hint with structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`; multi unknown-field rows report every unknown field with nearest hints, `allowedFields`, `receivedFields`, and Received fields.";
    assert.equal(writeRowLabelGuidanceSummary(missingRelationsSingleFieldRepair), "missing add_relations single-field repair");

    const missingRelationsEveryUnknownField = makeDogfoodToolsList().tools;
    missingRelationsEveryUnknownField.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`; unknown type rows include a closest-value hint with structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`; single unknown-field rows include `receivedField` plus one-row `unknownFields`; unknown-field rows include Received fields.";
    assert.equal(writeRowLabelGuidanceSummary(missingRelationsEveryUnknownField), "missing add_relations multi-field Received fields, add_relations structured field lists");

    const missingRelationsStructuredFieldLists = makeDogfoodToolsList().tools;
    missingRelationsStructuredFieldLists.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`; unknown type rows include a closest-value hint with structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`; single unknown-field rows include `receivedField` plus one-row `unknownFields`; multi unknown-field rows report every unknown field with nearest hints and Received fields.";
    assert.equal(writeRowLabelGuidanceSummary(missingRelationsStructuredFieldLists), "missing add_relations structured field lists");

    const missingRelationsClosestValue = makeDogfoodToolsList().tools;
    missingRelationsClosestValue.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`; single unknown-field rows include `receivedField` plus one-row `unknownFields`; multi unknown-field rows report every unknown field with nearest hints, `allowedFields`, `receivedFields`, and Received fields.";
    assert.equal(writeRowLabelGuidanceSummary(missingRelationsClosestValue), "missing add_relations closest-value type hint, add_relations structured value repair");

    const missingRelationsStructuredValueRepair = makeDogfoodToolsList().tools;
    missingRelationsStructuredValueRepair.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`; unknown type rows include a closest-value hint; single unknown-field rows include `receivedField` plus one-row `unknownFields`; multi unknown-field rows report every unknown field with nearest hints, `allowedFields`, `receivedFields`, and Received fields.";
    assert.equal(writeRowLabelGuidanceSummary(missingRelationsStructuredValueRepair), "missing add_relations structured value repair");

    assert.equal(writeRowLabelGuidanceSummary(null), "missing tools/list");
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
      "25/25 titled; 16/16 read; 9/9 write; 4/4 destructive; 2/2 idempotent; 24/25 local-only",
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
      toolsListSchemaStatus("add_relation inputSchema type enum drift"),
      "add_relation inputSchema type enum drift",
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
      "rejected true (arg lmit->limit; allowed 5)",
    );
    assert.equal(
      strictRepairSummary(okShape.strictMultiArgs),
      "rejected true (args lmit->limit, summry->summary; allowed 5)",
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
      strictRepairSummary(okShape.strictAddRelation),
      "rejected true (type depend_on->depends_on; allowed 8)",
    );
    assert.equal(
      strictRepairSummary(okShape.strictFindOrphansKindFilter),
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
      strictClosestValueSummary(okShape.strictFindNeighborsTypeFilter),
      "rejected true (depend_on -> depends_on)",
    );
    assert.equal(
      strictClosestValueSummary(okShape.strictFindOrphansKindFilter),
      "rejected true (capabilty -> capability)",
    );
    assert.equal(
      strictClosestValueSummary(okShape.strictFindOrphansExcludeKindFilter),
      "rejected true (capabilty -> capability)",
    );
    assert.equal(
      strictClosestValueSummary(okShape.strictQueryConceptsKindFilter),
      "rejected true (capabilty -> capability)",
    );
    assert.equal(
      strictClosestValueSummary(okShape.strictQueryConceptsHasKeyFilter),
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

  it("summarizes strict add_relation no-write metadata evidence", () => {
    assert.equal(writeMetadataAbsenceSummary(okShape.strictAddRelation), "absent");
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
    assert.match(usage, /node scripts\/dogfood-mcp-walk\.mjs \[--help\]/);
    assert.match(usage, /Print this help without starting the MCP server/);
    assert.match(usage, /No positional vault argument is accepted/);
    assert.match(usage, /OATLAS_DOGFOOD_TIMEOUT_MS/);
    assert.match(usage, /OATLAS_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk/);
    assert.match(usage, /Lighter dogfood gates:/);
    assert.match(usage, /pnpm dogfood:compile\s+Fast compile_ontology summary over docs\/ontology/);
    assert.match(
      usage,
      /pnpm dogfood:compile-fix\s+compile --fix idempotence gate over docs\/ontology; changed vaults need pnpm docs-vault:build; success ends with \[dogfood:compile-fix\] docs\/ontology unchanged/,
    );
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
    assert.match(usage, /pnpm test:dogfood:compile-fix\s+Narrow dogfood compile --fix idempotence runner contract/);
    assert.match(usage, /pnpm test:dogfood:status\s+Narrow dogfood status shortcut runner contract/);
    assert.match(usage, /pnpm test:mcp:registration\s+Narrow source-checkout .mcp.json\/.mcp.json.example\/.codex\/config.toml registration template contract/);
    assert.match(usage, /pnpm test:mcp:maintenance\s+Narrow maintenance_plan filter\/cursor\/resume\/work-queue formatter gates/);
    assert.match(usage, /pnpm test:mcp:dogfood:timeout/);
    assert.match(usage, /Narrow dogfood timeout\/help retry diagnostics/);
    assert.match(usage, /pnpm dogfood:test\s+Full dogfood helper regression suite when focused checks are not enough/);
    assert.match(usage, /Dogfood helper, compile\/index gates, tools\/list inventory names \+ annotation coverage, row-label guidance, batch cap gates, invalid-only batch row repair \+ no-write metadata smoke, strict closest-value and unknown-tool repair summary, vault warning and validate_vault problem gates, first-contact health\/growth\/sample-shape gates, maintenance work-queue shape \+ formatter checks, initialize tool-inventory \+ safety\/recovery guidance, destructive dry-run, help\/argument\/timeout handling, structuredContent, strict relation filters, strict add_relation type-preflight \+ no-write metadata, strict graph kind filters, stderr warning checks/);
    assertPnpmScriptsExist(usage, ROOT_PKG.scripts);
  });

  it("dogfood help — helper uses natural exit so verbose stdout can flush", () => {
    // Structural decomposition (scripts/lib/dogfood-walk/*.mjs) split the walk
    // across an entry orchestrator (spawn/rpc client + exit-code guard) and a
    // console report module (the return-code branches) — check each seam.
    const entrySource = readFileSync("scripts/dogfood-mcp-walk.mjs", "utf-8");
    const rpcClientSource = readFileSync("scripts/lib/dogfood-walk/rpc-client.mjs", "utf-8");
    const reportSource = readFileSync("scripts/lib/dogfood-walk/report.mjs", "utf-8");

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
      [2, "list_kinds"],
      [3, "list_concepts"],
    ]);
    const missing = missingResponseLabels([{ id: 1, result: {} }], labels);
    assert.deepEqual(missing, ["list_kinds", "list_concepts"]);
    const failure = rpcTimeoutFailure(5000, missing);
    assert.match(failure, /rpc: timed out after 5000ms waiting for list_kinds, list_concepts\./);
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
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(56), "query_concepts");
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
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(70), "strict_add_relation");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(71), "strict_recommend_relations_kind_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(72), "strict_recommend_relations_unsupported_kind_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(73), "strict_match_nodes_sort_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(74), "strict_match_edges_type_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(75), "strict_find_neighbors_type_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(76), "strict_find_orphans_kind_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(77), "strict_find_orphans_exclude_kind_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(78), "strict_query_concepts_kind_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(79), "strict_query_concepts_has_key_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(80), "strict_list_concepts_kind_filter");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(81), "get_concepts_batch_cap");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(82), "add_concepts_batch_cap");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(83), "add_relations_batch_cap");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(84), "strict_unknown_tool");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(85), "add_concepts_row_repair");
    assert.equal(DOGFOOD_RESPONSE_LABELS.get(86), "add_relations_row_repair");
    assert.deepEqual(
      [...expectedResponseIds(buildDogfoodRequests())].sort((a, b) => a - b),
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
    const requests = buildDogfoodRequests();
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
    const requests = buildDogfoodRequests();
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
        intoSlug: "domains/ai-agent-partner",
      },
    });
    assert.deepEqual(requests.find((request) => request.id === 65)?.params, {
      name: "delete_concept",
      arguments: { slug: "capabilities/mcp-server" },
    });
  });

  it("keeps strict relation_check dogfood request endpoint-independent", () => {
    const requests = buildDogfoodRequests();
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

  it("keeps strict find_neighbors types dogfood request endpoint-independent", () => {
    const requests = buildDogfoodRequests();
    assert.deepEqual(requests.find((request) => request.id === 75)?.params, {
      name: "find_neighbors",
      arguments: {
        slug: "missing-find-neighbors-type-source",
        types: ["depend_on"],
      },
    });
  });

  it("keeps strict find_orphans kind dogfood requests endpoint-independent", () => {
    const requests = buildDogfoodRequests();
    assert.deepEqual(requests.find((request) => request.id === 76)?.params, {
      name: "find_orphans",
      arguments: {
        kind: "capabilty",
      },
    });
    assert.deepEqual(requests.find((request) => request.id === 77)?.params, {
      name: "find_orphans",
      arguments: {
        excludeKinds: ["capabilty"],
      },
    });
  });

  it("keeps strict query_concepts filter dogfood requests endpoint-independent", () => {
    const requests = buildDogfoodRequests();
    assert.deepEqual(requests.find((request) => request.id === 78)?.params, {
      name: "query_concepts",
      arguments: {
        filter: "kind=capabilty",
      },
    });
    assert.deepEqual(requests.find((request) => request.id === 79)?.params, {
      name: "query_concepts",
      arguments: {
        filter: "has(capabilties)",
      },
    });
  });

  it("keeps strict list_concepts kind dogfood request endpoint-independent", () => {
    const requests = buildDogfoodRequests();
    assert.deepEqual(requests.find((request) => request.id === 80)?.params, {
      name: "list_concepts",
      arguments: {
        kind: "capabilty",
      },
    });
  });

  it("keeps strict match_edges type dogfood request endpoint-independent", () => {
    const requests = buildDogfoodRequests();
    assert.deepEqual(requests.find((request) => request.id === 74)?.params, {
      name: "query_ontology",
      arguments: {
        operation: "match_edges",
        type: "depend_on",
      },
    });
  });

  it("keeps strict add_relation dogfood request endpoint-independent and non-writing", () => {
    const requests = buildDogfoodRequests();
    assert.deepEqual(requests.find((request) => request.id === 70)?.params, {
      name: "add_relation",
      arguments: {
        from: "missing-add-relation-source",
        to: "missing-add-relation-target",
        type: "depend_on",
      },
    });
  });

  it("keeps tuned health dogfood requests aligned with the printed scope", () => {
    const requests = buildDogfoodRequests();
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
    const ids = buildDogfoodRequests()
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
      "maint_link link/add_missing_relation:warn -> add_relation",
    );
    assert.equal(
      maintenanceNextActionSummary(okShape.maintenancePlan.nextReviewAction),
      "maint_review review/unassigned_node:info",
    );
  });
});
