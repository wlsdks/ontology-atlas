#!/usr/bin/env node
// Tests for the dogfood MCP walk gate: recordResult + evaluateDogfoodGate.
// Split out of scripts/dogfood-mcp-walk.test.mjs (structural decomposition, logic unchanged).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateDogfoodGate, recordResult } from "../../dogfood-mcp-walk.mjs";
import { compileIndexesSummary, VAULT_ISSUE_CODE_VALUES } from "../../../mcp/scripts/verify.mjs";
import { makeDogfoodToolsList, okShape } from "./fixtures.mjs";

describe("recordResult", () => {
  it("records missing, error, and non-JSON responses", () => {
    const failures = [];
    assert.equal(recordResult(failures, "missing", null), false);
    assert.equal(recordResult(failures, "error", { error: { message: "bad" } }), false);
    assert.equal(recordResult(failures, "raw", { rawText: "not json" }), false);
    assert.deepEqual(failures, [
      "missing: missing response",
      "error: bad",
      "raw: non-JSON response",
    ]);
  });

  it("passes parsed JSON result objects", () => {
    const failures = [];
    assert.equal(recordResult(failures, "ok", { total: 1 }), true);
    assert.deepEqual(failures, []);
  });
});

describe("evaluateDogfoodGate", () => {
  it("passes the healthy dogfood shape", () => {
    assert.deepEqual(evaluateDogfoodGate(okShape), []);
  });

  it("fails malformed initialize instructions", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, initialize: null }),
      ["initialize: missing response", "initialize: initialize instructions missing or too short"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        initialize: {
          ...okShape.initialize,
          instructions: okShape.initialize.instructions.replace("infer_imports", "infer imports"),
        },
      }),
      ["initialize: initialize instructions missing tool inventory entry: infer_imports"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        initialize: {
          ...okShape.initialize,
          instructions: okShape.initialize.instructions.replace("Tool errors include structuredContent.errorCode values such as unknown_tool, unknown_argument, and invalid_arguments.", "Tool errors are plain text."),
        },
      }),
      ["initialize: initialize instructions missing structured errorCode guidance"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        initialize: {
          ...okShape.initialize,
          instructions: okShape.initialize.instructions.replace("Tool errors include structuredContent repair fields such as receivedTool, receivedArgument, unknownArguments, rowName, receivedField, unknownFields, allowedFields, receivedFields, firstSeenAt, receivedValue, suggestion, allowedTools, allowedArguments, and allowedValues.", "Tool errors are plain text."),
        },
      }),
      ["initialize: initialize instructions missing structured repair fields guidance"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        initialize: {
          ...okShape.initialize,
          instructions: okShape.initialize.instructions.replace("rowName, receivedField, unknownFields, allowedFields, receivedFields, firstSeenAt, ", ""),
        },
      }),
      ["initialize: initialize instructions missing structured row field repair guidance"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        initialize: {
          ...okShape.initialize,
          instructions: okShape.initialize.instructions.replace('unknown type row errors include a closest-value hint such as Did you mean "depends_on"?', "unknown type row errors fail"),
        },
      }),
      ["initialize: initialize instructions missing batch relation type hint guidance"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        initialize: {
          ...okShape.initialize,
          instructions: okShape.initialize.instructions.replace("depends_on, relates, contains, describes", "relation values"),
        },
      }),
      ["initialize: initialize instructions missing health relation filter enum guidance"],
    );
  });

  it("fails malformed destructive dogfood dry-run responses", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, renameDryRunRes: null }),
      ["rename_concept_dry_run: no rename_concept dry-run response"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        deleteDryRunRes: {
          result: {
            ...okShape.deleteDryRunRes.result,
            content: [
              {
                text: JSON.stringify({
                  ...okShape.deleteDryRunRes.result.structuredContent,
                  changed: false,
                }),
              },
            ],
            structuredContent: {
              ...okShape.deleteDryRunRes.result.structuredContent,
              changed: false,
            },
          },
        },
      }),
      ["delete_concept_dry_run: delete_concept dry-run response unexpectedly included changed"],
    );
  });

  it("fails malformed tools/list dogfood schema responses", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: null }),
      ["tools/list: missing response"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: { tools: null } }),
      ["tools/list: tools/list response missing tools array"],
    );
    const duplicateInventory = makeDogfoodToolsList();
    duplicateInventory.tools.push(duplicateInventory.tools.find((tool) => tool.name === "list_concepts"));
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: duplicateInventory }),
      ["tools/list: tools mismatch: missing: (none), extra: (none), duplicates: list_concepts, invalidNames: 0"],
    );
    const invalidInventory = makeDogfoodToolsList();
    invalidInventory.tools.push({ name: "" }, {});
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: invalidInventory }),
      [
        "tools/list: tools mismatch: missing: (none), extra: (none), duplicates: (none), invalidNames: 2",
        "tools/list: tools/list schema missing additionalProperties:false: (unknown)",
      ],
    );
    const titleDrifted = makeDogfoodToolsList();
    titleDrifted.tools.find((tool) => tool.name === "list_concepts").annotations.title = "List concept rows";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: titleDrifted }),
      ['tools/list: tools/list title annotation drift: list_concepts (expected "List Concepts", got "List concept rows")'],
    );
    const outputSchemaDrifted = makeDogfoodToolsList();
    outputSchemaDrifted.tools.find((tool) => tool.name === "list_kinds").outputSchema.properties.total.type = "number";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: outputSchemaDrifted }),
      ["tools/list: list_kinds outputSchema total drift"],
    );
    const listOutputSchemaDrifted = makeDogfoodToolsList();
    listOutputSchemaDrifted.tools.find((tool) => tool.name === "list_concepts").outputSchema.properties.nodes.items.properties.mtime.type = "integer";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: listOutputSchemaDrifted }),
      ["tools/list: list_concepts outputSchema node mtime drift"],
    );
    const batchOutputSchemaDrifted = makeDogfoodToolsList();
    batchOutputSchemaDrifted.tools.find((tool) => tool.name === "get_concepts").outputSchema.properties.concepts.items.properties.mtime.type = "integer";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: batchOutputSchemaDrifted }),
      ["tools/list: get_concepts outputSchema row mtime drift"],
    );
    const getConceptOutputSchemaDrifted = makeDogfoodToolsList();
    getConceptOutputSchemaDrifted.tools.find((tool) => tool.name === "get_concept").outputSchema.properties.neighbors.properties.relates.type = "object";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: getConceptOutputSchemaDrifted }),
      ["tools/list: get_concept outputSchema neighbors relates drift"],
    );
    const evidenceOutputSchemaDrifted = makeDogfoodToolsList();
    evidenceOutputSchemaDrifted.tools.find((tool) => tool.name === "find_evidence").outputSchema.properties.matches.items.properties.matchedIn.enum = ["frontmatter"];
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: evidenceOutputSchemaDrifted }),
      ["tools/list: find_evidence outputSchema match matchedIn drift"],
    );
    const backlinksOutputSchemaDrifted = makeDogfoodToolsList();
    backlinksOutputSchemaDrifted.tools.find((tool) => tool.name === "find_backlinks").outputSchema.properties.matches.items.properties.matchedKeys.items.type = "number";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: backlinksOutputSchemaDrifted }),
      ["tools/list: find_backlinks outputSchema match matchedKeys drift"],
    );
    const neighborsOutputSchemaDrifted = makeDogfoodToolsList();
    neighborsOutputSchemaDrifted.tools.find((tool) => tool.name === "find_neighbors").outputSchema.properties.edges.items.required = ["direction", "from", "to", "via", "resolved"];
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: neighborsOutputSchemaDrifted }),
      ["tools/list: find_neighbors outputSchema edges drift"],
    );
    const pathOutputSchemaDrifted = makeDogfoodToolsList();
    pathOutputSchemaDrifted.tools.find((tool) => tool.name === "find_path").outputSchema.properties.edges.items.properties.via.type = "number";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: pathOutputSchemaDrifted }),
      ["tools/list: find_path outputSchema edge via drift"],
    );
    const orphansOutputSchemaDrifted = makeDogfoodToolsList();
    orphansOutputSchemaDrifted.tools.find((tool) => tool.name === "find_orphans").outputSchema.properties.orphans.items.properties.mtime.type = "string";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: orphansOutputSchemaDrifted }),
      ["tools/list: find_orphans outputSchema row mtime drift"],
    );
    const queryConceptsOutputSchemaDrifted = makeDogfoodToolsList();
    queryConceptsOutputSchemaDrifted.tools.find((tool) => tool.name === "query_concepts").outputSchema.properties.matches.items.properties.mtime.type = "string";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: queryConceptsOutputSchemaDrifted }),
      ["tools/list: query_concepts outputSchema row mtime drift"],
    );
    const compileOutputSchemaDrifted = makeDogfoodToolsList();
    compileOutputSchemaDrifted.tools.find((tool) => tool.name === "compile_ontology").outputSchema.properties.byKind.additionalProperties.type = "number";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: compileOutputSchemaDrifted }),
      ["tools/list: compile_ontology outputSchema byKind drift"],
    );
    const compileActionSchemaDrifted = makeDogfoodToolsList();
    compileActionSchemaDrifted.tools.find((tool) => tool.name === "compile_ontology").outputSchema.properties.canonicalizationActions.items.properties.keys.items.enum = ["contains"];
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: compileActionSchemaDrifted }),
      ["tools/list: compile_ontology outputSchema canonicalizationActions drift"],
    );
    const compileActionMtimeSchemaDrifted = makeDogfoodToolsList();
    delete compileActionMtimeSchemaDrifted.tools.find((tool) => tool.name === "compile_ontology").outputSchema.properties.canonicalizationActions.items.properties.expected_mtime.minimum;
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: compileActionMtimeSchemaDrifted }),
      ["tools/list: compile_ontology outputSchema canonicalizationActions drift"],
    );
    const analyzeOutputSchemaDrifted = makeDogfoodToolsList();
    analyzeOutputSchemaDrifted.tools.find((tool) => tool.name === "analyze_repo_structure").outputSchema.properties.framework.enum = ["fsd", "generic"];
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: analyzeOutputSchemaDrifted }),
      ["tools/list: analyze_repo_structure outputSchema framework drift"],
    );
    const analyzeProjectSchemaDrifted = makeDogfoodToolsList();
    delete analyzeProjectSchemaDrifted.tools.find((tool) => tool.name === "analyze_repo_structure").outputSchema.properties.project.additionalProperties;
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: analyzeProjectSchemaDrifted }),
      ["tools/list: analyze_repo_structure outputSchema project drift"],
    );
    const inferOutputSchemaDrifted = makeDogfoodToolsList();
    inferOutputSchemaDrifted.tools.find((tool) => tool.name === "infer_imports").outputSchema.properties.edges.items.properties.kind.enum = ["static"];
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: inferOutputSchemaDrifted }),
      ["tools/list: infer_imports outputSchema edge kind drift"],
    );
    const inferCoverageSchemaDrifted = makeDogfoodToolsList();
    inferCoverageSchemaDrifted.tools.find((tool) =>
      tool.name === "infer_imports"
    ).outputSchema.properties.coverage.properties.detectedUnsupportedLanguages.items.enum = ["rust"];
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: inferCoverageSchemaDrifted }),
      ["tools/list: infer_imports outputSchema coverage safety drift"],
    );
    const inferUnresolvedReasonDrifted = makeDogfoodToolsList();
    inferUnresolvedReasonDrifted.tools.find((tool) => tool.name === "infer_imports").outputSchema.properties.unresolved.items.properties.reason = { type: "string" };
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: inferUnresolvedReasonDrifted }),
      ["tools/list: infer_imports outputSchema unresolved reason drift"],
    );
    const inferModuleKindCountsDrifted = makeDogfoodToolsList();
    inferModuleKindCountsDrifted.tools.find((tool) => tool.name === "infer_imports").outputSchema.properties.moduleEdges.items.properties.kindCounts.properties.side.type = "number";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: inferModuleKindCountsDrifted }),
      ["tools/list: infer_imports outputSchema moduleEdges kindCounts drift"],
    );
    const addConceptsOutputSchemaDrifted = makeDogfoodToolsList();
    addConceptsOutputSchemaDrifted.tools.find((tool) => tool.name === "add_concepts").outputSchema.properties.concepts.items.required = ["slug"];
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addConceptsOutputSchemaDrifted }),
      ["tools/list: add_concepts outputSchema rows drift"],
    );
    const addConceptsRowOpenSchemaDrifted = makeDogfoodToolsList();
    delete addConceptsRowOpenSchemaDrifted.tools.find((tool) => tool.name === "add_concepts").outputSchema.properties.concepts.items.additionalProperties;
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addConceptsRowOpenSchemaDrifted }),
      ["tools/list: add_concepts outputSchema row openness drift"],
    );
    const addConceptsRowLabelGuidanceDrifted = makeDogfoodToolsList();
    addConceptsRowLabelGuidanceDrifted.tools.find((tool) => tool.name === "add_concepts").description =
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows.";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addConceptsRowLabelGuidanceDrifted }),
      ["tools/list: add_concepts description missing row label guidance"],
    );
    const addConceptsReceivedFieldsGuidanceDrifted = makeDogfoodToolsList();
    addConceptsReceivedFieldsGuidanceDrifted.tools.find((tool) => tool.name === "add_concepts").description =
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels.";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addConceptsReceivedFieldsGuidanceDrifted }),
      ["tools/list: add_concepts description missing single-field repair guidance"],
    );
    const addConceptsSingleRepairGuidanceDrifted = makeDogfoodToolsList();
    addConceptsSingleRepairGuidanceDrifted.tools.find((tool) => tool.name === "add_concepts").description =
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels, multi unknown-field rows report every unknown field with nearest hints and Received fields, and duplicate input slugs report the later concepts[n] row plus first-seen `concepts[m]` with structured `rowName` / `firstSeenAt`.";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addConceptsSingleRepairGuidanceDrifted }),
      ["tools/list: add_concepts description missing single-field repair guidance"],
    );
    const addConceptsMultiFieldGuidanceDrifted = makeDogfoodToolsList();
    addConceptsMultiFieldGuidanceDrifted.tools.find((tool) => tool.name === "add_concepts").description =
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels, single unknown-field rows include `receivedField` plus one-row `unknownFields`, unknown-field rows include Received fields, and duplicate input slugs report the later concepts[n] row plus first-seen `concepts[m]` with structured `rowName` / `firstSeenAt`.";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addConceptsMultiFieldGuidanceDrifted }),
      ["tools/list: add_concepts description missing multi-field received fields guidance"],
    );
    const addRelationsOutputSchemaDrifted = makeDogfoodToolsList();
    addRelationsOutputSchemaDrifted.tools.find((tool) => tool.name === "add_relations").outputSchema.properties.relations.items.properties.alreadyExists.type = "string";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addRelationsOutputSchemaDrifted }),
      ["tools/list: add_relations outputSchema row alreadyExists drift"],
    );
    const addRelationsRowOpenSchemaDrifted = makeDogfoodToolsList();
    delete addRelationsRowOpenSchemaDrifted.tools.find((tool) => tool.name === "add_relations").outputSchema.properties.relations.items.additionalProperties;
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addRelationsRowOpenSchemaDrifted }),
      ["tools/list: add_relations outputSchema row openness drift"],
    );
    const addRelationsRowLabelGuidanceDrifted = makeDogfoodToolsList();
    addRelationsRowLabelGuidanceDrifted.tools.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with closest-value hints.";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addRelationsRowLabelGuidanceDrifted }),
      ["tools/list: add_relations description missing row label guidance"],
    );
    const addRelationsReceivedFieldsGuidanceDrifted = makeDogfoodToolsList();
    addRelationsReceivedFieldsGuidanceDrifted.tools.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels and closest-value hints.";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addRelationsReceivedFieldsGuidanceDrifted }),
      ["tools/list: add_relations description missing structured rowName guidance"],
    );
    const addRelationsStructuredRowNameGuidanceDrifted = makeDogfoodToolsList();
    addRelationsStructuredRowNameGuidanceDrifted.tools.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`; unknown type rows include a closest-value hint with structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`.";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addRelationsStructuredRowNameGuidanceDrifted }),
      ["tools/list: add_relations description missing single-field repair guidance"],
    );
    const addRelationsSingleRepairGuidanceDrifted = makeDogfoodToolsList();
    addRelationsSingleRepairGuidanceDrifted.tools.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`; unknown type rows include a closest-value hint with structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`; multi unknown-field rows report every unknown field with nearest hints, `allowedFields`, `receivedFields`, and Received fields.";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addRelationsSingleRepairGuidanceDrifted }),
      ["tools/list: add_relations description missing single-field repair guidance"],
    );
    const addRelationsMultiFieldGuidanceDrifted = makeDogfoodToolsList();
    addRelationsMultiFieldGuidanceDrifted.tools.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`; unknown type rows include a closest-value hint with structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`; single unknown-field rows include `receivedField` plus one-row `unknownFields`; unknown-field rows include Received fields.";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addRelationsMultiFieldGuidanceDrifted }),
      ["tools/list: add_relations description missing multi-field received fields guidance"],
    );
    const addRelationsStructuredFieldListGuidanceDrifted = makeDogfoodToolsList();
    addRelationsStructuredFieldListGuidanceDrifted.tools.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`; unknown type rows include a closest-value hint with structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`; single unknown-field rows include `receivedField` plus one-row `unknownFields`; multi unknown-field rows report every unknown field with nearest hints and Received fields.";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addRelationsStructuredFieldListGuidanceDrifted }),
      ["tools/list: add_relations description missing structured field-list guidance"],
    );
    const addRelationsClosestValueGuidanceDrifted = makeDogfoodToolsList();
    addRelationsClosestValueGuidanceDrifted.tools.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`, single unknown-field rows include `receivedField` plus one-row `unknownFields`, and multi unknown-field rows report every unknown field with nearest hints, `allowedFields`, `receivedFields`, and Received fields.";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addRelationsClosestValueGuidanceDrifted }),
      ["tools/list: add_relations description missing closest-value type guidance"],
    );
    const addRelationsStructuredValueRepairGuidanceDrifted = makeDogfoodToolsList();
    addRelationsStructuredValueRepairGuidanceDrifted.tools.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`, unknown type rows include a closest-value hint, single unknown-field rows include `receivedField` plus one-row `unknownFields`, and multi unknown-field rows report every unknown field with nearest hints, `allowedFields`, `receivedFields`, and Received fields.";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addRelationsStructuredValueRepairGuidanceDrifted }),
      ["tools/list: add_relations description missing structured value repair guidance"],
    );
    const writeNextReviewGuidanceDrifted = makeDogfoodToolsList();
    writeNextReviewGuidanceDrifted.tools.find((tool) => tool.name === "add_concept").description =
      "Write tool returns postWriteMaintenance with byPhase bySeverity byKind queue buckets, action score, executable proposedAction, and nextExecutableAction current-page pointers.";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: writeNextReviewGuidanceDrifted }),
      ["tools/list: add_concept description missing maintenance next action pointer guidance"],
    );
    const addConceptOutputSchemaDrifted = makeDogfoodToolsList();
    addConceptOutputSchemaDrifted.tools.find((tool) => tool.name === "add_concept").outputSchema.properties.warnings.items.type = "number";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addConceptOutputSchemaDrifted }),
      ["tools/list: add_concept outputSchema warnings drift"],
    );
    const addConceptOpenSchemaDrifted = makeDogfoodToolsList();
    delete addConceptOpenSchemaDrifted.tools.find((tool) => tool.name === "add_concept").outputSchema.additionalProperties;
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addConceptOpenSchemaDrifted }),
      ["tools/list: add_concept outputSchema root openness drift"],
    );
    const addRelationOutputSchemaDrifted = makeDogfoodToolsList();
    addRelationOutputSchemaDrifted.tools.find((tool) => tool.name === "add_relation").outputSchema.properties.alreadyExists.type = "string";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addRelationOutputSchemaDrifted }),
      ["tools/list: add_relation outputSchema alreadyExists drift"],
    );
    const patchConceptOutputSchemaDrifted = makeDogfoodToolsList();
    patchConceptOutputSchemaDrifted.tools.find((tool) => tool.name === "patch_concept").outputSchema.required = ["ok", "slug", "filePath", "changed"];
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: patchConceptOutputSchemaDrifted }),
      ["tools/list: patch_concept outputSchema required drift"],
    );
    const postWriteSummarySchemaDrifted = makeDogfoodToolsList();
    delete postWriteSummarySchemaDrifted.tools.find((tool) => tool.name === "patch_concept").outputSchema.properties.postWriteMaintenance.properties.summary.properties.remainingActions.minimum;
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: postWriteSummarySchemaDrifted }),
      ["tools/list: patch_concept outputSchema postWriteMaintenance summary drift"],
    );
    const postWriteRequiredSchemaDrifted = makeDogfoodToolsList();
    postWriteRequiredSchemaDrifted.tools.find((tool) => tool.name === "patch_concept").outputSchema.properties.postWriteMaintenance.required =
      ["operation", "sideEffect", "graphHash", "summary", "filters", "cursor", "actions"];
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: postWriteRequiredSchemaDrifted }),
      ["tools/list: patch_concept outputSchema postWriteMaintenance required drift"],
    );
    const postWriteCursorSchemaDrifted = makeDogfoodToolsList();
    postWriteCursorSchemaDrifted.tools.find((tool) => tool.name === "patch_concept").outputSchema.properties.postWriteMaintenance.properties.cursor.properties.hasMore.type = "string";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: postWriteCursorSchemaDrifted }),
      ["tools/list: patch_concept outputSchema postWriteMaintenance cursor drift"],
    );
    const postWriteActionsSchemaDrifted = makeDogfoodToolsList();
    postWriteActionsSchemaDrifted.tools.find((tool) => tool.name === "patch_concept").outputSchema.properties.postWriteMaintenance.properties.actions.items.properties.executable.type = "string";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: postWriteActionsSchemaDrifted }),
      ["tools/list: patch_concept outputSchema postWriteMaintenance actions drift"],
    );
    const postWriteProposedActionSchemaDrifted = makeDogfoodToolsList();
    postWriteProposedActionSchemaDrifted.tools.find((tool) => tool.name === "patch_concept").outputSchema.properties.postWriteMaintenance.properties.actions.items.properties.proposedAction.required =
      ["tool"];
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: postWriteProposedActionSchemaDrifted }),
      ["tools/list: patch_concept outputSchema postWriteMaintenance actions drift"],
    );
    const postWriteProposedActionToolEnumDrifted = makeDogfoodToolsList();
    postWriteProposedActionToolEnumDrifted.tools.find((tool) => tool.name === "patch_concept").outputSchema.properties.postWriteMaintenance.properties.actions.items.properties.proposedAction.properties.tool.enum =
      ["add_concept", "add_relation"];
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: postWriteProposedActionToolEnumDrifted }),
      ["tools/list: patch_concept outputSchema postWriteMaintenance actions drift"],
    );
    const postWriteNextExecutableSchemaDrifted = makeDogfoodToolsList();
    postWriteNextExecutableSchemaDrifted.tools.find((tool) => tool.name === "patch_concept").outputSchema.properties.postWriteMaintenance.properties.nextExecutableAction.required =
      ["id", "phase", "kind", "severity", "score", "executable", "reason"];
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: postWriteNextExecutableSchemaDrifted }),
      ["tools/list: patch_concept outputSchema postWriteMaintenance nextExecutableAction drift"],
    );
    const postWriteNextActionSchemaDrifted = makeDogfoodToolsList();
    postWriteNextActionSchemaDrifted.tools.find((tool) => tool.name === "patch_concept").outputSchema.properties.postWriteMaintenance.properties.nextReviewAction.type = "object";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: postWriteNextActionSchemaDrifted }),
      ["tools/list: patch_concept outputSchema postWriteMaintenance nextReviewAction drift"],
    );
    const renameConceptOutputSchemaDrifted = makeDogfoodToolsList();
    renameConceptOutputSchemaDrifted.tools.find((tool) => tool.name === "rename_concept").outputSchema.properties.backlinkUpdates.type = "array";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: renameConceptOutputSchemaDrifted }),
      ["tools/list: rename_concept outputSchema backlinkUpdates drift"],
    );
    const mergeConceptsOutputSchemaDrifted = makeDogfoodToolsList();
    mergeConceptsOutputSchemaDrifted.tools.find((tool) => tool.name === "merge_concepts").outputSchema.required = ["ok", "fromSlug", "intoSlug", "fromPath", "deleted", "backlinkUpdates"];
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: mergeConceptsOutputSchemaDrifted }),
      ["tools/list: merge_concepts outputSchema required drift"],
    );
    const deleteConceptOutputSchemaDrifted = makeDogfoodToolsList();
    deleteConceptOutputSchemaDrifted.tools.find((tool) => tool.name === "delete_concept").outputSchema.properties.backlinksAtDelete.items.type = "string";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: deleteConceptOutputSchemaDrifted }),
      ["tools/list: delete_concept outputSchema backlinksAtDelete drift"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, listStructured: { ...okShape.list, total: 2 } }),
      ["list_concepts structuredContent mismatch — $.total: parsed 1, structuredContent 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, listStructured: undefined }),
      ["list_concepts structuredContent missing"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, listStructured: null }),
      ["list_concepts structuredContent missing"],
    );
    const validateOutputSchemaDrifted = makeDogfoodToolsList();
    validateOutputSchemaDrifted.tools.find((tool) => tool.name === "validate_vault").outputSchema.properties.summary.properties.byCode.additionalProperties.properties.files.items.type = "number";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: validateOutputSchemaDrifted }),
      ["tools/list: validate_vault outputSchema byCode files drift"],
    );
    const validateIssueCodeSchemaDrifted = makeDogfoodToolsList();
    validateIssueCodeSchemaDrifted.tools.find((tool) => tool.name === "validate_vault").outputSchema.properties.problems.items.properties.issues.items.properties.code.enum = VAULT_ISSUE_CODE_VALUES.slice(0, -1);
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: validateIssueCodeSchemaDrifted }),
      ["tools/list: validate_vault outputSchema issue code drift"],
    );
    const validateByCodeKeySchemaDrifted = makeDogfoodToolsList();
    validateByCodeKeySchemaDrifted.tools.find((tool) => tool.name === "validate_vault").outputSchema.properties.summary.properties.byCode.propertyNames.enum = VAULT_ISSUE_CODE_VALUES.slice(0, -1);
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: validateByCodeKeySchemaDrifted }),
      ["tools/list: validate_vault outputSchema byCode key drift"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, kindsStructured: { total: 1, byKind: { project: 2 } } }),
      ["list_kinds structuredContent mismatch — $.byKind.project: parsed 1, structuredContent 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, projectProbeStructured: undefined }),
      ["project_probe structuredContent missing"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, validationStructured: { ...okShape.validation, scanned: 2 } }),
      ["validate_vault structuredContent mismatch — $.scanned: parsed 1, structuredContent 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, validationStructured: undefined }),
      ["validate_vault structuredContent missing"],
    );
    const openWorldDrifted = makeDogfoodToolsList();
    openWorldDrifted.tools.find((tool) => tool.name === "list_concepts").annotations.openWorldHint = true;
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: openWorldDrifted }),
      ["tools/list: tools/list openWorldHint annotation drift: list_concepts (expected false, got true)"],
    );
    const destructiveDrifted = makeDogfoodToolsList();
    destructiveDrifted.tools.find((tool) => tool.name === "delete_concept").annotations.destructiveHint = false;
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: destructiveDrifted }),
      ["tools/list: tools/list destructiveHint annotation drift: delete_concept (expected true, got false)"],
    );
    const idempotentDrifted = makeDogfoodToolsList();
    idempotentDrifted.tools.find((tool) => tool.name === "add_relation").annotations.idempotentHint = false;
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: idempotentDrifted }),
      ["tools/list: tools/list idempotentHint annotation drift: add_relation (expected true, got false)"],
    );
    const drifted = makeDogfoodToolsList();
    drifted.tools.find((tool) => tool.name === "query_ontology").inputSchema.properties.afterActionId.description =
      "nextExecutableAction/nextReviewAction point only at the first executable/review action in the current returned page.";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: drifted }),
      ["tools/list: query_ontology afterActionId description missing current-page next pointer detail fields"],
    );
  });

  it("fails malformed strict argument dogfood responses", () => {
    const structuredError = (text) => ({
      result: {
        isError: true,
        content: [{ text }],
        structuredContent: { ok: false, errorCode: "unknown_argument", error: text },
      },
    });
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictArgs: { result: { isError: false, content: [{ text: "ok" }] } } }),
      ["strict_args: strict arguments response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictArgs: { result: { isError: true, content: [{ text: "different error" }] } } }),
      ["strict_args: strict arguments structured error missing"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictArgs: {
          result: {
            isError: true,
            content: [{ text: 'Unknown argument "lmit" for list_concepts. Did you mean "limit"? Received arguments: lmit.' }],
            structuredContent: {
              ok: false,
              errorCode: "invalid_arguments",
              error: 'Unknown argument "lmit" for list_concepts. Did you mean "limit"? Received arguments: lmit.',
            },
          },
        },
      }),
      ["strict_args: strict arguments structured error code mismatch: expected unknown_argument, got invalid_arguments"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictArgs: structuredError('Unknown argument "lmit" for list_concepts.') }),
      ["strict_args: strict arguments response did not suggest the closest list_concepts argument"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictArgs: structuredError('Unknown argument "lmit" for list_concepts. Did you mean "limit"?') }),
      ["strict_args: strict arguments response did not report the received list_concepts arguments"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictArgs: structuredError('Unknown argument "lmit" for list_concepts. Did you mean "limit"? Allowed arguments: kind, limit. Received arguments: lmit.') }),
      ["strict_args: strict arguments structured error missing repair hint"],
    );
  });

  it("fails malformed strict multi-argument dogfood responses", () => {
    const structuredError = (text) => ({
      result: {
        isError: true,
        content: [{ text }],
        structuredContent: { ok: false, errorCode: "unknown_argument", error: text },
      },
    });
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictMultiArgs: { result: { isError: false, content: [{ text: "ok" }] } } }),
      ["strict_multi_args: strict multi-argument response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictMultiArgs: { result: { isError: true, content: [{ text: 'Unknown argument "lmit" for list_concepts. Did you mean "limit"?' }] } } }),
      ["strict_multi_args: strict multi-argument structured error missing"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictMultiArgs: structuredError('Unknown arguments for list_concepts: "lmit" (did you mean "limit"?), "summry".') }),
      ["strict_multi_args: strict multi-argument response did not suggest the closest summary argument"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictMultiArgs: structuredError('Unknown arguments for list_concepts: "lmit" (did you mean "limit"?), "summry" (did you mean "summary"?)') }),
      ["strict_multi_args: strict multi-argument response did not report all received list_concepts arguments"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictMultiArgs: structuredError('Unknown arguments for list_concepts: "lmit" (did you mean "limit"?), "summry" (did you mean "summary"?). Allowed arguments: domain, kind, limit, since, summary. Received arguments: lmit, summry.') }),
      ["strict_multi_args: strict multi-argument structured error missing received arguments"],
    );
  });

  it("fails malformed strict enum dogfood responses", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictEnum: { result: { isError: false, content: [{ text: "ok" }] } } }),
      ["strict_enum: strict enum response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictEnum: { result: { isError: true, content: [{ text: "different error" }] } } }),
      ["strict_enum: strict enum response did not report the invalid query_ontology operation"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictEnum: { result: { isError: true, content: [{ text: 'operation must be one of: overview. Received: "overveiw".' }] } } }),
      ["strict_enum: strict enum response did not suggest the closest query_ontology operation"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictEnum: {
          result: {
            isError: true,
            content: [{ text: 'operation must be one of: overview, health. Received: "overveiw". Did you mean "overview"?' }],
            structuredContent: {
              ok: false,
              errorCode: "invalid_arguments",
              error: 'operation must be one of: overview, health. Received: "overveiw". Did you mean "overview"?',
            },
          },
        },
      }),
      ["strict_enum: strict enum structured error missing repair hint"],
    );
  });

  it("fails malformed strict unknown-tool dogfood responses", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictUnknownTool: { result: { isError: false, content: [{ text: "ok" }] } } }),
      ["strict_unknown_tool: strict unknown-tool response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictUnknownTool: { result: { isError: true, content: [{ text: "different error" }] } } }),
      ["strict_unknown_tool: strict unknown-tool structured error missing"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictUnknownTool: {
          result: {
            isError: true,
            content: [{ text: 'Error: Unknown tool: list_concept. Did you mean "list_concepts"? Allowed tools: add_concept, list_concepts.' }],
            structuredContent: {
              ok: false,
              errorCode: "unknown_argument",
              error: 'Unknown tool: list_concept. Did you mean "list_concepts"? Allowed tools: add_concept, list_concepts.',
            },
          },
        },
      }),
      ["strict_unknown_tool: strict unknown-tool structured error code mismatch: expected unknown_tool, got unknown_argument"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictUnknownTool: {
          result: {
            isError: true,
            content: [{ text: 'Error: Unknown tool: list_concept. Did you mean "list_concepts"? Allowed tools: add_concept, list_concepts.' }],
            structuredContent: {
              ok: false,
              errorCode: "unknown_tool",
              error: 'Unknown tool: list_concept. Did you mean "list_concepts"? Allowed tools: add_concept, list_concepts.',
            },
          },
        },
      }),
      ["strict_unknown_tool: strict unknown-tool structured error missing repair hint"],
    );
  });

  it("fails malformed strict maintenance filter dogfood responses", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictMaintenancePhaseFilter: { result: { isError: false, content: [{ text: "ok" }] } } }),
      ["strict_maintenance_phase_filter: strict maintenance filter response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictMaintenancePhaseFilter: { result: { isError: true, content: [{ text: "different error" }] } } }),
      ["strict_maintenance_phase_filter: strict maintenance filter response did not report the invalid maintenance_plan phases filter"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictMaintenancePhaseFilter: {
          result: {
            isError: true,
            content: [{ text: 'phases items must be one of: validate, repair.' }],
          },
        },
      }),
      ["strict_maintenance_phase_filter: strict maintenance filter response did not list allowed maintenance_plan phases"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictMaintenanceSeverityFilter: {
          result: {
            isError: true,
            content: [{ text: 'severities items must be one of: fail, warn.' }],
          },
        },
      }),
      ["strict_maintenance_severity_filter: strict maintenance filter response did not list allowed maintenance_plan severities"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictMaintenanceKindFilter: {
          result: {
            isError: true,
            content: [{ text: 'kinds items must be one of: add_missing_relation.' }],
          },
        },
      }),
      ["strict_maintenance_kind_filter: strict maintenance filter response did not list allowed maintenance_plan kinds"],
    );
  });

  it("fails malformed strict relation filters dogfood responses", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictRelationFilter: { result: { isError: false, content: [{ text: "ok" }] } } }),
      ["strict_relation_filter: strict relation filter response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictRelationFilter: { result: { isError: true, content: [{ text: "different error" }] } } }),
      ["strict_relation_filter: strict relation filter response did not report the invalid dependencyTypes filter"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictRelationFilter: {
          result: {
            isError: true,
            content: [{ text: 'dependencyTypes items must be one of: domains, domain, capabilities, elements, dependencies.' }],
          },
        },
      }),
      ["strict_relation_filter: strict relation filter response did not report the invalid dependencyTypes value"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictRelationFilter: {
          result: {
            isError: true,
            content: [{ text: 'dependencyTypes items must be one of: domains, domain, capabilities, elements, dependencies. Received: "depend_on".' }],
          },
        },
      }),
      ["strict_relation_filter: strict relation filter response did not suggest the closest dependencyTypes value"],
    );
  });

  it("fails malformed strict find_neighbors types dogfood responses", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictFindNeighborsTypeFilter: { result: { isError: false, content: [{ text: "ok" }] } } }),
      ["strict_find_neighbors_type_filter: strict find_neighbors types response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictFindNeighborsTypeFilter: { result: { isError: true, content: [{ text: "different error" }] } } }),
      ["strict_find_neighbors_type_filter: strict find_neighbors types response did not report the invalid types filter"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictFindNeighborsTypeFilter: {
          result: {
            isError: true,
            content: [{ text: 'types items must be one of: domains, domain, capabilities, elements, dependencies.' }],
          },
        },
      }),
      ["strict_find_neighbors_type_filter: strict find_neighbors types response did not report the invalid types value"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictFindNeighborsTypeFilter: {
          result: {
            isError: true,
            content: [{ text: 'types items must be one of: domains, domain, capabilities, elements, dependencies. Received: "depend_on".' }],
          },
        },
      }),
      ["strict_find_neighbors_type_filter: strict find_neighbors types response did not suggest the closest types value"],
    );
  });

  it("fails malformed strict find_orphans kind dogfood responses", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictFindOrphansKindFilter: { result: { isError: false, content: [{ text: "ok" }] } } }),
      ["strict_find_orphans_kind_filter: strict find_orphans kind response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictFindOrphansKindFilter: { result: { isError: true, content: [{ text: "different error" }] } } }),
      ["strict_find_orphans_kind_filter: strict find_orphans kind response did not report the invalid kind filter"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictFindOrphansKindFilter: {
          result: {
            isError: true,
            content: [{ text: 'kind must be one of: project, domain, capability.' }],
          },
        },
      }),
      ["strict_find_orphans_kind_filter: strict find_orphans kind response did not report the invalid kind value"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictFindOrphansKindFilter: {
          result: {
            isError: true,
            content: [{ text: 'kind must be one of: project, domain, capability. Received: "capabilty".' }],
          },
        },
      }),
      ["strict_find_orphans_kind_filter: strict find_orphans kind response did not suggest the closest kind value"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictFindOrphansExcludeKindFilter: { result: { isError: true, content: [{ text: "different error" }] } } }),
      ["strict_find_orphans_exclude_kind_filter: strict find_orphans kind response did not report the invalid excludeKinds items filter"],
    );
  });

  it("fails malformed strict query_concepts filter dogfood responses", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictQueryConceptsKindFilter: { result: { isError: false, content: [{ text: "ok" }] } } }),
      ["strict_query_concepts_kind_filter: strict query_concepts filter response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictQueryConceptsKindFilter: { result: { isError: true, content: [{ text: "different error" }] } } }),
      ["strict_query_concepts_kind_filter: strict query_concepts filter response did not report the invalid kind"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictQueryConceptsKindFilter: {
          result: {
            isError: true,
            content: [{ text: 'kind must be one of: project, domain, capability.' }],
          },
        },
      }),
      ["strict_query_concepts_kind_filter: strict query_concepts filter response did not report the invalid kind value"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictQueryConceptsKindFilter: {
          result: {
            isError: true,
            content: [{ text: 'kind must be one of: project, domain, capability. Received: "capabilty".' }],
          },
        },
      }),
      ["strict_query_concepts_kind_filter: strict query_concepts filter response did not suggest the closest kind value"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictQueryConceptsHasKeyFilter: { result: { isError: true, content: [{ text: "different error" }] } } }),
      ["strict_query_concepts_has_key_filter: strict query_concepts filter response did not report the invalid has key"],
    );
  });

  it("fails malformed strict list_concepts kind dogfood responses", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictListConceptsKindFilter: { result: { isError: false, content: [{ text: "ok" }] } } }),
      ["strict_list_concepts_kind_filter: strict list_concepts kind response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictListConceptsKindFilter: { result: { isError: true, content: [{ text: "different error" }] } } }),
      ["strict_list_concepts_kind_filter: strict list_concepts kind response did not report the invalid kind filter"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictListConceptsKindFilter: {
          result: {
            isError: true,
            content: [{ text: 'kind must be one of: project, domain, capability.' }],
          },
        },
      }),
      ["strict_list_concepts_kind_filter: strict list_concepts kind response did not report the invalid kind value"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictListConceptsKindFilter: {
          result: {
            isError: true,
            content: [{ text: 'kind must be one of: project, domain, capability. Received: "capabilty".' }],
          },
        },
      }),
      ["strict_list_concepts_kind_filter: strict list_concepts kind response did not suggest the closest kind value"],
    );
  });

  it("fails malformed strict relation_check dogfood responses", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictRelationCheck: { result: { isError: false, content: [{ text: "ok" }] } } }),
      ["strict_relation_check: strict relation_check response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictRelationCheck: { result: { isError: true, content: [{ text: "different error" }] } } }),
      ["strict_relation_check: strict relation_check response did not report the invalid type filter"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictRelationCheck: {
          result: {
            isError: true,
            content: [{ text: 'type must be one of: domains, domain, capabilities, elements, dependencies.' }],
          },
        },
      }),
      ["strict_relation_check: strict relation_check response did not report the invalid type value"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictRelationCheck: {
          result: {
            isError: true,
            content: [{ text: 'type must be one of: domains, domain, capabilities, elements, dependencies. Received: "depend_on".' }],
          },
        },
      }),
      ["strict_relation_check: strict relation_check response did not suggest the closest type value"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictRelationCheck: {
          result: {
            isError: true,
            content: [{ text: 'type must be one of: domains, domain, capabilities, elements, dependencies, depends_on, relates, contains, describes. Received: "depend_on". Did you mean "depends_on"?' }],
            structuredContent: {
              ok: false,
              errorCode: "invalid_arguments",
              error: 'type must be one of: domains, domain, capabilities, elements, dependencies, depends_on, relates, contains, describes. Received: "depend_on". Did you mean "depends_on"?',
              valueName: "type",
              receivedValue: "depend_on",
              suggestion: "depends_on",
              allowedValues: ["domains", "domain"],
            },
          },
        },
      }),
      ["strict_relation_check: strict relation_check structured error missing allowed values"],
    );
  });

  it("fails malformed strict add_relation dogfood responses", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictAddRelation: { result: { isError: false, content: [{ text: "ok" }] } } }),
      ["strict_add_relation: strict add_relation response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictAddRelation: { result: { isError: true, content: [{ text: "different error" }] } } }),
      ["strict_add_relation: strict add_relation response did not report the invalid type filter"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictAddRelation: {
          result: {
            isError: true,
            content: [{ text: 'type must be one of: depends_on, relates, contains, describes.' }],
          },
        },
      }),
      ["strict_add_relation: strict add_relation response did not report the invalid type value"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictAddRelation: {
          result: {
            isError: true,
            content: [{ text: 'type must be one of: depends_on, relates, contains, describes. Received: "depend_on".' }],
          },
        },
      }),
      ["strict_add_relation: strict add_relation response did not suggest the closest type value"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictAddRelation: {
          result: {
            ...okShape.strictAddRelation.result,
            changed: false,
          },
        },
      }),
      ["strict_add_relation: strict add_relation response included write metadata"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictAddRelation: {
          result: {
            ...okShape.strictAddRelation.result,
            alreadyExists: false,
          },
        },
      }),
      ["strict_add_relation: strict add_relation response included write metadata"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictAddRelation: {
          result: {
            ...okShape.strictAddRelation.result,
            structuredContent: {
              ...okShape.strictAddRelation.result.structuredContent,
              postWriteMaintenance: { summary: {} },
            },
          },
        },
      }),
      ["strict_add_relation: strict add_relation structuredContent included write metadata"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictAddRelation: {
          result: {
            ...okShape.strictAddRelation.result,
            structuredContent: {
              ...okShape.strictAddRelation.result.structuredContent,
              alreadyExists: false,
            },
          },
        },
      }),
      ["strict_add_relation: strict add_relation structuredContent included write metadata"],
    );
  });

  it("fails malformed strict graph kind filter dogfood responses", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictGraphKindFilter: { result: { isError: false, content: [{ text: "ok" }] } } }),
      ["strict_graph_kind_filter: strict graph kind filter response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictGraphKindFilter: { result: { isError: true, content: [{ text: "different error" }] } } }),
      ["strict_graph_kind_filter: strict graph kind filter response did not report the invalid kind filter"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictGraphKindFilter: {
          result: {
            isError: true,
            content: [{ text: 'kind must be one of: project, domain, capability.' }],
          },
        },
      }),
      ["strict_graph_kind_filter: strict graph kind filter response did not report the invalid kind value"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictGraphKindFilter: {
          result: {
            isError: true,
            content: [{ text: 'kind must be one of: project, domain, capability. Received: "capabilty".' }],
          },
        },
      }),
      ["strict_graph_kind_filter: strict graph kind filter response did not suggest the closest kind value"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictRecommendRelationsKindFilter: {
          result: {
            isError: false,
            content: [{ text: "ok" }],
          },
        },
      }),
      ["strict_recommend_relations_kind_filter: strict recommend_relations kind filter response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictRecommendRelationsKindFilter: {
          result: {
            isError: true,
            content: [{ text: 'kind must be one of: project, domain, capability. Received: "capabilty". Did you mean "capability"?' }],
          },
        },
      }),
      ["strict_recommend_relations_kind_filter: strict recommend_relations kind filter response did not list the narrowed kind set"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictRecommendRelationsKindFilter: {
          result: {
            isError: true,
            content: [{ text: 'kind must be one of: capability, element. Received: "capabilty".' }],
          },
        },
      }),
      ["strict_recommend_relations_kind_filter: strict recommend_relations kind filter response did not suggest the closest kind value"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictRecommendRelationsUnsupportedKindFilter: {
          result: {
            isError: false,
            content: [{ text: "ok" }],
          },
        },
      }),
      ["strict_recommend_relations_unsupported_kind_filter: strict recommend_relations kind filter response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictRecommendRelationsUnsupportedKindFilter: {
          result: {
            isError: true,
            content: [{ text: 'kind must be one of: project, domain, capability. Received: "domain".' }],
          },
        },
      }),
      ["strict_recommend_relations_unsupported_kind_filter: strict recommend_relations kind filter response did not list the narrowed kind set"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictMatchNodesSortFilter: {
          result: {
            isError: false,
            content: [{ text: "ok" }],
          },
        },
      }),
      ["strict_match_nodes_sort_filter: strict match_nodes sort response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictMatchNodesSortFilter: {
          result: {
            isError: true,
            content: [{ text: 'sort must be one of: degree, slug. Received: "outDegre". Did you mean "outDegree"?' }],
          },
        },
      }),
      ["strict_match_nodes_sort_filter: strict match_nodes sort response did not list allowed sort values"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictMatchEdgesTypeFilter: {
          result: {
            isError: false,
            content: [{ text: "ok" }],
          },
        },
      }),
      ["strict_match_edges_type_filter: strict match_edges type response was not rejected"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictMatchEdgesTypeFilter: {
          result: {
            isError: true,
            content: [{ text: 'type must be one of: domains, domain, capabilities, elements, dependencies.' }],
          },
        },
      }),
      ["strict_match_edges_type_filter: strict match_edges type response did not report the invalid type value"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictGraphFromKindFilter: {
          result: {
            isError: true,
            content: [{ text: 'fromKind must be one of: project, domain, capability.' }],
          },
        },
      }),
      ["strict_graph_from_kind_filter: strict graph kind filter response did not report the invalid fromKind value"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        strictGraphToKindFilter: {
          result: {
            isError: true,
            content: [{ text: 'toKind must be one of: project, domain, capability, external. Received: "externl".' }],
          },
        },
      }),
      ["strict_graph_to_kind_filter: strict graph kind filter response did not suggest the closest toKind value"],
    );
  });

  it("fails malformed dogfood batch cap responses", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, getConceptsBatchCap: { result: { isError: false, content: [{ text: "ok" }] } } }),
      ["get_concepts_batch_cap: get_concepts batch-cap smoke did not reject over-cap batch"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, addConceptsBatchCap: { result: { isError: true, content: [{ text: "Too many concepts: 51. Max 50 per call." }] } } }),
      ["add_concepts_batch_cap: add_concepts batch cap structured error missing"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        addRelationsBatchCap: {
          result: {
            isError: true,
            content: [{ text: "Too many relations: 51. Max 50 per call." }],
            structuredContent: { ok: false, errorCode: "unknown_argument", error: "Too many relations: 51. Max 50 per call." },
          },
        },
      }),
      ["add_relations_batch_cap: add_relations batch cap structured error code mismatch: expected invalid_arguments, got unknown_argument"],
    );
  });

  it("fails malformed invalid-only batch row repair responses", () => {
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        addConceptsRowRepair: {
          concepts: okShape.addConceptsRowRepair.concepts.map((row, index) => (
            index === 4 ? { ...row, receivedField: undefined } : row
          )),
        },
      }),
      ["add_concepts_row_repair: add_concepts row-isolation response missing concept single-field structured repair"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        addRelationsRowRepair: {
          relations: okShape.addRelationsRowRepair.relations.map((row, index) => (
            index === 2 ? { ...row, suggestion: undefined } : row
          )),
        },
      }),
      ["add_relations_row_repair: add_relations row-isolation response missing relation type structured repair"],
    );
  });

  it("fails on malformed list_kinds payloads", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      kinds: { total: 2, byKind: { project: 1 } },
    });
    assert.deepEqual(failures, ["list_kinds response total mismatch: total 2, byKind 1"]);
  });

  it("fails on malformed list_concepts payloads", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      list: { total: 1, nodes: [] },
    });
    assert.deepEqual(failures, ["list_concepts response missing vaultRoot"]);
  });

  it("fails when the dogfood project probe cannot find a project node", () => {
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectProbe: {
          total: 0,
          returned: 0,
          limited: false,
          pagination: { offset: 0, limit: 100, total: 0, returned: 0, hasMore: false, nextOffset: null },
          vaultRoot: "/tmp/vault",
          nodes: [],
        },
      }),
      ["project_probe response missing project node"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectProbe: {
          total: 1,
          returned: 1,
          limited: false,
          pagination: { offset: 0, limit: 100, total: 1, returned: 1, hasMore: false, nextOffset: null },
          nodes: [{ uid: "11111111-1111-4111-8111-111111111111", slug: "project", kind: "project", title: "Project", mtime: 1 }],
        },
      }),
      ["project_probe: list_concepts response missing vaultRoot"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectProbe: {
          total: 1,
          returned: 1,
          limited: false,
          pagination: { offset: 0, limit: 100, total: 1, returned: 1, hasMore: false, nextOffset: null },
          vaultRoot: "/tmp/vault",
          nodes: [{ uid: "11111111-1111-4111-8111-111111111111", slug: "capabilities/not-project", kind: "capability", title: "Wrong", mtime: 1 }],
        },
      }),
      ["project_probe returned non-project node: capabilities/not-project"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectProbe: {
          total: 2,
          returned: 1,
          limited: true,
          pagination: { offset: 0, limit: 100, total: 2, returned: 1, hasMore: true, nextOffset: 1 },
          vaultRoot: "/tmp/vault",
          nodes: [{ uid: "11111111-1111-4111-8111-111111111111", slug: "project", kind: "project", title: "Project", mtime: 1 }],
        },
      }),
      ["project_probe count mismatch — list_kinds project 1, probe 2"],
    );
  });

  it("fails on malformed get_concepts dogfood payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, batch: {} }),
      ["get_concepts response missing concepts array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, batch: { concepts: [okShape.batch.concepts[0]] } }),
      ["get_concepts response row count mismatch — expected 3, got 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        batch: { concepts: [{ ...okShape.batch.concepts[0], ok: false }, okShape.batch.concepts[1], okShape.batch.concepts[2]] },
      }),
      ["get_concepts response expected success row at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        batch: { concepts: [{ ...okShape.batch.concepts[0], slug: "  " }, okShape.batch.concepts[1], okShape.batch.concepts[2]] },
      }),
      ["get_concepts response missing success slug at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        batch: { concepts: [okShape.batch.concepts[0], okShape.batch.concepts[1], null] },
      }),
      ["get_concepts response malformed missing row at index 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        batch: { concepts: [okShape.batch.concepts[0], okShape.batch.concepts[1], { slug: "missing-dogfood-slug", ok: true }] },
      }),
      ["get_concepts response expected missing row to be ok:false"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, batchStructured: { concepts: [okShape.batch.concepts[0]] } }),
      [
        'get_concepts structuredContent mismatch — $.concepts[1]: parsed {"ok":true,"uid":"11111111-1111-4111-8111-111111111111","slug":"capabilities/mcp-server","fro..., structuredContent undefined',
      ],
    );
  });

  it("fails on malformed find_evidence payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, ev: {} }),
      ["find_evidence response missing matches array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, ev: { matches: [{}] } }),
      ["find_evidence response missing row slug at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, evStructured: { matches: [{ slug: "other" }] } }),
      ['find_evidence structuredContent mismatch — $.matches[0]: parsed undefined, structuredContent {"slug":"other"}'],
    );
  });

  it("fails on malformed find_path payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, path: { hopCount: 1, hops: ["a", "b"] } }),
      ["find_path response missing found flag"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, path: { found: true, hops: ["a", "b"] } }),
      ["find_path response missing hopCount"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, path: { found: true, hopCount: 1 } }),
      ["find_path response missing hops array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, path: { found: true, hopCount: 2, hops: ["a", "b"] } }),
      ["find_path response hop mismatch — hopCount 2, hops 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, path: { found: true, hopCount: 1, hops: ["a", "  "], edges: [{ from: "a", to: "  ", via: "relates" }] } }),
      ["find_path response contains empty hop"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, path: { found: true, hopCount: 1, hops: ["a", "b"] } }),
      ["find_path response missing edges array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, path: { found: true, hopCount: 1, hops: ["a", "b"], edges: [] } }),
      ["find_path response edge mismatch — hopCount 1, edges 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, path: { found: true, hopCount: 1, hops: ["a", "b"], edges: [{}] } }),
      ["find_path response edge/hop mismatch at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        path: { found: true, hopCount: 1, hops: ["a", "b"], edges: [{ from: "a", to: "b" }] },
      }),
      ["find_path response missing edge via at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        path: { found: true, hopCount: 1, hops: ["a", "b"], edges: [{ from: "a", to: "b", via: "  " }] },
      }),
      ["find_path response missing edge via at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        pathStructured: { found: true, hopCount: 1, hops: ["a", "c"], edges: [{ from: "a", to: "c", via: "relates" }] },
      }),
      ['find_path structuredContent mismatch — $.hops[1]: parsed "b", structuredContent "c"'],
    );
  });

  it("fails on malformed find_backlinks payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, bl: { matches: [] } }),
      ["find_backlinks response missing total count"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, bl: { total: 0, matches: [{}] } }),
      ["find_backlinks response match count exceeds total — matches 1, total 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, bl: { total: 1, matches: [{}] } }),
      ["find_backlinks response missing row slug at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, blStructured: { total: 1, matches: [] } }),
      ['find_backlinks structuredContent mismatch — $.target: parsed "capabilities/mcp-server", structuredContent undefined'],
    );
  });

  it("fails on malformed find_orphans payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, orph: { orphans: [] } }),
      ["find_orphans response missing total count"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, orph: { total: 0 } }),
      ["find_orphans response missing orphans array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, orph: { total: 0, orphans: [{}] } }),
      ["find_orphans response orphan count exceeds total — orphans 1, total 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, orphStructured: { total: 1, orphans: [] } }),
      ["find_orphans structuredContent mismatch — $.total: parsed 0, structuredContent 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, queryConceptsStructured: { ...okShape.queryConcepts, total: 2 } }),
      ["query_concepts structuredContent mismatch — $.total: parsed 1, structuredContent 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, queryConceptsLimited: { ...okShape.queryConceptsLimited, limited: false } }),
      [
        "query_concepts_limited: expected limited=true",
        "query_concepts_limited structuredContent mismatch — $.limited: parsed false, structuredContent true",
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        queryConceptsLimited: {
          ...okShape.queryConceptsLimited,
          matches: [{ slug: "project", kind: "project", title: "Project", mtime: 1 }],
        },
      }),
      [
        "query_concepts_limited: excluded project slug was returned",
        'query_concepts_limited structuredContent mismatch — $.matches[0].slug: parsed "project", structuredContent "README"',
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, queryConceptsLimitedStructured: { ...okShape.queryConceptsLimited, total: 2 } }),
      ["query_concepts_limited structuredContent mismatch — $.total: parsed 1, structuredContent 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, analyzedRepo: { ...okShape.analyzedRepo, framework: "unknown" } }),
      ["analyze_repo_structure response unknown framework: unknown"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, analyzedRepo: { ...okShape.analyzedRepo, capabilities: [{ slug: "capabilities/auth", title: "Auth" }] } }),
      ["analyze_repo_structure response missing capabilities evidence source: capabilities/auth"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, analyzedRepoStructured: { ...okShape.analyzedRepo, framework: "generic" } }),
      ['analyze_repo_structure structuredContent mismatch — $.framework: parsed "fsd", structuredContent "generic"'],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, inferredImports: { ...okShape.inferredImports, filesScanned: -1 } }),
      ["infer_imports response missing filesScanned count"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, inferredImports: { ...okShape.inferredImports, edges: [{ from: "a", to: "b", kind: "unknown" }] } }),
      ["infer_imports response unknown edge kind: unknown"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, inferredImports: { ...okShape.inferredImports, unresolved: [{ from: "a", spec: "@/missing", reason: "unresolved-alias" }] } }),
      ["infer_imports response unknown unresolved reason at index 0: unresolved-alias"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, inferredImports: { ...okShape.inferredImports, moduleEdges: [{ from: "a", to: "b", count: 0 }] } }),
      ["infer_imports response missing module edge count at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, inferredImports: { ...okShape.inferredImports, moduleEdges: [{ from: "a", to: "b", count: 1 }] } }),
      ["infer_imports response missing module edge kindCounts at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, inferredImports: { ...okShape.inferredImports, moduleEdges: [{ from: "a", to: "b", count: 2, kindCounts: { static: 1 } }] } }),
      ["infer_imports response module edge kindCounts mismatch at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, inferredImports: { ...okShape.inferredImports, moduleEdges: [{ from: "a", to: "b", count: 1, kindCounts: { unknown: 1 } }] } }),
      ["infer_imports response malformed module edge kindCounts at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, inferredImportsStructured: { ...okShape.inferredImports, filesScanned: 3 } }),
      ["infer_imports structuredContent mismatch — $.filesScanned: parsed 2, structuredContent 3"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, overviewStructured: { ...okShape.overview, graph: { ...okShape.overview.graph, nodes: 2 } } }),
      ["overview structuredContent mismatch — $.graph.nodes: parsed 1, structuredContent 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, overviewStructured: undefined }),
      ["overview structuredContent missing"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, overviewStructured: null }),
      ["overview structuredContent missing"],
    );
  });

  it("fails on malformed workspace_brief payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, brief: { operation: "health", status: "healthy", summary: { nodes: 1, edges: 0, issues: 0 }, nextActions: [] } }),
      ["workspace_brief response operation mismatch — health"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, brief: { summary: { nodes: 1, edges: 0, issues: 0 }, nextActions: [] } }),
      ["workspace_brief response operation mismatch — undefined"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, brief: { operation: "workspace_brief", status: "healthy", nextActions: [] } }),
      ["workspace_brief response missing summary"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, brief: { operation: "workspace_brief", status: "healthy", summary: { nodes: 1, issues: 0 }, nextActions: [] } }),
      ["workspace_brief response missing summary.edges"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, brief: { operation: "workspace_brief", status: "healthy", summary: { nodes: 1, edges: 0, issues: 0 } } }),
      ["workspace_brief response missing nextActions array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, brief: { operation: "workspace_brief", status: "healthy", summary: { nodes: 1, edges: 0, issues: 0 }, nextActions: [] } }),
      ["workspace_brief response missing health block"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, brief: { operation: "workspace_brief", status: "healthy", summary: { nodes: 1, edges: 0, issues: 0 }, nextActions: [], health: { checks: [] } } }),
      ["workspace_brief response missing health checks"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, tunedBrief: { operation: "workspace_brief", status: "healthy", summary: { nodes: 1, edges: 0, issues: 0 }, nextActions: [], health: { checks: [] } } }),
      ["workspace_brief_tuned response missing health checks"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        brief: {
          ...okShape.brief,
          summary: { ...okShape.brief.summary, growthActions: 2 },
        },
      }),
      ["workspace_brief growthActions mismatch — summary 2, growth 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        brief: {
          ...okShape.brief,
          growth: { ...okShape.brief.growth, relationRecommendations: 2, totalActions: 2 },
          summary: { ...okShape.brief.summary, growthActions: 2 },
          nextActions: [{ id: "add_missing_relations", kind: "add_missing_relations", severity: "info", count: 1 }],
        },
      }),
      ["workspace_brief add_missing_relations count mismatch — nextAction 1, growth 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        brief: {
          operation: "workspace_brief",
          status: "healthy",
          summary: { nodes: 1, edges: 0, issues: 0 },
          nextActions: [{ id: "compile_issues", kind: "health_check" }],
          health: okShape.brief.health,
        },
      }),
      ["workspace_brief response missing nextAction severity at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        brief: {
          operation: "workspace_brief",
          status: "healthy",
          summary: { nodes: 1, edges: 0, issues: 0 },
          nextActions: [{ id: "compile_issues", kind: "health_check", severity: "fatal" }],
          health: okShape.brief.health,
        },
      }),
      ["workspace_brief response unknown nextAction severity at index 0: fatal"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        brief: {
          operation: "workspace_brief",
          status: "healthy",
          summary: { nodes: 1, edges: 0, issues: 0 },
          nextActions: [{ severity: "info" }],
          health: okShape.brief.health,
        },
      }),
      ["workspace_brief response missing nextAction identifier at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        brief: {
          operation: "workspace_brief",
          status: "healthy",
          summary: { nodes: 1, edges: 0, issues: 0 },
          nextActions: [{ id: "components", severity: "info" }],
          health: okShape.brief.health,
        },
      }),
      ["workspace_brief response missing nextAction identifier at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        brief: {
          operation: "workspace_brief",
          status: "healthy",
          summary: { nodes: 1, edges: 0, issues: 0 },
          nextActions: [{ id: "  ", kind: " ", severity: "info" }],
          health: okShape.brief.health,
        },
      }),
      ["workspace_brief response missing nextAction identifier at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        brief: {
          operation: "workspace_brief",
          status: "healthy",
          summary: { nodes: 1, edges: 0, issues: 0 },
          nextActions: [{ id: "components", kind: "health_check", severity: "info", count: -1 }],
          health: okShape.brief.health,
        },
      }),
      ["workspace_brief response malformed nextAction count at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        tunedBrief: {
          operation: "workspace_brief",
          status: "healthy",
          summary: { nodes: 1, edges: 0, issues: 0 },
          nextActions: [{ id: "components", kind: "health_check", severity: "info", count: 1.5 }],
          health: okShape.tunedBrief.health,
        },
      }),
      ["workspace_brief_tuned response malformed nextAction count at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        brief: {
          ...okShape.brief,
          nextActions: [
            {
              id: "add_missing_relations",
              kind: "add_missing_relations",
              severity: "info",
              count: 1,
              sample: [{ tool: "add_concept", args: { from: "domains/a", to: "capabilities/b", type: "capabilities" } }],
            },
          ],
          growth: { ...okShape.brief.growth, relationRecommendations: 1, totalActions: 1 },
          summary: { ...okShape.brief.summary, growthActions: 1 },
        },
      }),
      ["workspace_brief response nextAction add_missing_relations sample tool mismatch at index 0.0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        brief: {
          ...okShape.brief,
          nextActions: [
            {
              id: "materialize_external_elements",
              kind: "materialize_external_elements",
              severity: "info",
              count: 1,
              sample: [{ tool: "add_concept", args: { slug: "elements/file", kind: "capability" } }],
            },
          ],
          growth: { ...okShape.brief.growth, externalElementRefs: 1, totalActions: 1 },
          summary: { ...okShape.brief.summary, growthActions: 1 },
        },
      }),
      ["workspace_brief response malformed materialize_external_elements sample args at index 0.0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        brief: {
          ...okShape.brief,
          nextActions: [
            {
              id: "resolve_dangling_references",
              kind: "resolve_dangling_references",
              severity: "info",
              count: 1,
              sample: [{ kind: "materialize_external_element", score: 0.7, reason: "Resolve dangling reference." }],
            },
          ],
          growth: { ...okShape.brief.growth, danglingReferences: 1, totalActions: 1 },
          summary: { ...okShape.brief.summary, growthActions: 1 },
        },
      }),
      ["workspace_brief response malformed resolve_dangling_references sample kind at index 0.0"],
    );
  });

  it("fails on malformed health payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "workspace_brief", status: "healthy", summary: { issues: 0, unresolvedEdges: 0, dependencyCycles: 0 }, checks: okShape.health.checks } }),
      ["health response operation mismatch — workspace_brief"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { summary: { issues: 0, unresolvedEdges: 0, dependencyCycles: 0 }, checks: okShape.health.checks } }),
      ["health response operation mismatch — undefined"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "health", status: "healthy", checks: okShape.health.checks } }),
      ["health response missing summary"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "health", status: "healthy", summary: { issues: 0, dependencyCycles: 0 }, checks: okShape.health.checks } }),
      ["health response missing summary.unresolvedEdges"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "health", status: "healthy", summary: okShape.health.summary } }),
      ["health response missing checks array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "health", status: "healthy", summary: okShape.health.summary, checks: [] } }),
      ["health response missing health checks"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "health", status: "healthy", summary: okShape.health.summary, checks: [{ status: "pass", count: 0 }] } }),
      ["health response missing check id at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "health", status: "healthy", summary: okShape.health.summary, checks: [{ id: "  ", status: "pass", count: 0 }] } }),
      ["health response missing check id at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "health", status: "healthy", summary: okShape.health.summary, checks: [{ id: "compile_issues", count: 0 }] } }),
      ["health response missing check status: compile_issues"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "health", status: "healthy", summary: okShape.health.summary, checks: [{ id: "compile_issues", status: "warning", count: 0 }] } }),
      ["health response unknown check status: compile_issues=warning"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, health: { operation: "health", status: "healthy", summary: okShape.health.summary, checks: [{ id: "compile_issues", status: "pass" }] } }),
      ["health response missing check count: compile_issues"],
    );
  });

  it("fails on malformed tuned health payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, tunedHealth: { operation: "workspace_brief", status: "healthy", summary: okShape.tunedHealth.summary, checks: okShape.tunedHealth.checks } }),
      ["health_tuned response operation mismatch — workspace_brief"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, tunedHealth: { operation: "health", status: "healthy", summary: okShape.tunedHealth.summary, checks: [] } }),
      ["health_tuned response missing health checks"],
    );
  });

  it("fails on malformed compile_ontology summary payloads", () => {
    const withCompiled = (compiled) => ({ ...okShape, compiled, compiledStructured: compiled });
    assert.deepEqual(
      evaluateDogfoodGate(withCompiled({ ...okShape.compiled, version: 0 })),
      ["compile_ontology response missing version"],
    );
    assert.deepEqual(
      evaluateDogfoodGate(withCompiled({ ...okShape.compiled, graphHash: "" })),
      ["compile_ontology response missing graphHash"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, compiledStructured: { ...okShape.compiled, nodeCount: 2 } }),
      ["compile_ontology structuredContent mismatch — $.nodeCount: parsed 1, structuredContent 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate(withCompiled({ ...okShape.compiled, maxMtime: -1 })),
      ["compile_ontology response missing maxMtime"],
    );
    assert.deepEqual(
      evaluateDogfoodGate(withCompiled({ ...okShape.compiled, nodeCount: undefined })),
      ["compile_ontology response missing nodeCount"],
    );
    assert.deepEqual(
      evaluateDogfoodGate(withCompiled({ ...okShape.compiled, byKind: null })),
      ["compile_ontology response missing byKind aggregate"],
    );
    assert.deepEqual(
      evaluateDogfoodGate(withCompiled({ ...okShape.compiled, byDomain: { "": 1 } })),
      ["compile_ontology response has empty byDomain key"],
    );
    assert.deepEqual(
      evaluateDogfoodGate(withCompiled({ ...okShape.compiled, byKind: { project: 2 } })),
      ["compile_ontology response byKind mismatch: nodeCount 1, byKind 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate(withCompiled({ ...okShape.compiled, edgeCount: 2, resolvedEdgeCount: 1, externalEdgeCount: 0, unresolvedEdgeCount: 1 })),
      [],
    );
    assert.deepEqual(
      evaluateDogfoodGate(withCompiled({ ...okShape.compiled, edgeCount: 3, resolvedEdgeCount: 1, externalEdgeCount: 1 })),
      ["compile_ontology response edge count mismatch: edgeCount 3, resolved+external+unresolved 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate(withCompiled({ ...okShape.compiled, edgeCount: 1, resolvedEdgeCount: 1, externalEdgeCount: 1 })),
      ["compile_ontology response edge count mismatch: edgeCount 1, resolved+external+unresolved 2"],
    );
  });

  it("fails on malformed compile_ontology indexed payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, compiledIndexes: { ...okShape.compiledIndexes, indexes: undefined } }),
      ["compile_ontology indexes response missing indexes"],
    );
    assert.equal(
      compileIndexesSummary({ ...okShape.compiledIndexes, indexes: undefined }),
      "out n/a, in n/a, edgeById n/a, aliases n/a, edges 1/1/0",
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        compiledIndexes: {
          ...okShape.compiledIndexes,
          indexes: { ...okShape.compiledIndexes.indexes, out: { project: ["missing-edge"] } },
        },
      }),
      ["compile_ontology.indexes.out references unknown edge id"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, compiledIndexesStructured: { ...okShape.compiledIndexes, edgeCount: 3 } }),
      ["compile_ontology_indexes structuredContent mismatch — $.edgeCount: parsed 2, structuredContent 3"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        compiledIndexes: {
          ...okShape.compiledIndexes,
          canonicalizationActionCount: 1,
          canonicalizationActions: [{ slug: "", keys: ["contains"], frontmatter: { contains: ["domains/core"] }, expected_mtime: 1 }],
        },
      }),
      ["compile_ontology canonicalizationActions[0].slug must be a non-empty string"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        compiledIndexes: {
          ...okShape.compiledIndexes,
          canonicalizationActionCount: 1,
          canonicalizationActions: [{ slug: "project", keys: ["contains"], frontmatter: { title: ["Changed"] }, expected_mtime: 1 }],
        },
      }),
      ["compile_ontology canonicalizationActions[0].keys declares \"contains\" but frontmatter does not include it"],
    );
  });

  it("fails on malformed overview payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, overview: { ...okShape.overview, operation: "health" } }),
      ["overview returned unexpected operation: health"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, overview: { ...okShape.overview, graph: { ...okShape.overview.graph, graphHash: "" } } }),
      ["overview response missing graphHash"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, overview: { ...okShape.overview, graph: { ...okShape.overview.graph, edges: 3 } } }),
      ["overview response edge count mismatch: edges 3, resolved+external+unresolved 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, overview: { ...okShape.overview, hubs: null } }),
      ["overview response missing hubs array"],
    );
  });

  it("fails on malformed pattern_walk payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, patternWalk: { ...okShape.patternWalk, operation: "path" } }),
      ["pattern_walk response operation mismatch"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, patternWalk: { ...okShape.patternWalk, paths: { total: 1, limited: false } } }),
      ["pattern_walk response missing paths.rows array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        patternWalk: {
          ...okShape.patternWalk,
          paths: { total: 0, limited: false, rows: [] },
        },
      }),
      ["pattern_walk response returned no rows"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        patternWalk: {
          ...okShape.patternWalk,
          paths: { total: 1, limited: false, rows: [{ end: "capabilities/login" }] },
        },
      }),
      ["pattern_walk response missing path at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        patternWalk: {
          ...okShape.patternWalk,
          paths: {
            total: 1,
            limited: true,
            rows: okShape.patternWalk.paths.rows,
          },
        },
      }),
      ["pattern_walk response limited without hidden row — rows 1, total 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        patternWalk: {
          ...okShape.patternWalk,
          paths: {
            total: 2,
            limited: false,
            rows: okShape.patternWalk.paths.rows,
          },
        },
      }),
      ["pattern_walk response total mismatch — rows 1, total 2"],
    );
  });

  it("fails on malformed all_paths payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, allPaths: { ...okShape.allPaths, operation: "path" } }),
      ["all_paths response operation mismatch"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, allPaths: { ...okShape.allPaths, paths: null } }),
      ["all_paths response missing paths array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, allPaths: { ...okShape.allPaths, totalPaths: 1, limited: true, paths: [okShape.allPaths.paths[0]] } }),
      ["all_paths response limited without hidden path — rows 1, total 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, allPaths: { ...okShape.allPaths, totalPaths: 3, limited: false, paths: [okShape.allPaths.paths[0]] } }),
      ["all_paths response total mismatch — rows 1, total 3"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        allPaths: {
          ...okShape.allPaths,
          totalPaths: 1,
          paths: [{ edges: [] }],
        },
      }),
      ["all_paths response missing hops at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        allPaths: {
          ...okShape.allPaths,
          totalPaths: 3,
          paths: [
            ...okShape.allPaths.paths,
            {
              ...okShape.allPaths.paths[0],
              hops: [...okShape.allPaths.paths[0].hops],
              edges: [...okShape.allPaths.paths[0].edges],
            },
          ],
        },
      }),
      ["all_paths response duplicate path signature at index 2"],
    );
  });

  it("fails on malformed all_paths query_plan payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, allPathsPlan: { ...okShape.allPathsPlan, operation: "all_paths" } }),
      [
        "all_paths query_plan response operation mismatch",
        'all_paths_query_plan structuredContent mismatch — $.operation: parsed "all_paths", structuredContent "query_plan"',
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        allPathsPlan: {
          ...okShape.allPathsPlan,
          normalized: { ...okShape.allPathsPlan.normalized, limit: 100 },
        },
      }),
      [
        "all_paths query_plan default limit mismatch — expected 25, got 100",
        "all_paths_query_plan structuredContent mismatch — $.normalized.limit: parsed 100, structuredContent 25",
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        allPathsPlan: {
          ...okShape.allPathsPlan,
          estimate: { ...okShape.allPathsPlan.estimate, resultUpperBound: 26 },
        },
      }),
      [
        "all_paths query_plan resultUpperBound exceeds limit — upper 26, limit 25",
        "all_paths_query_plan structuredContent mismatch — $.estimate.resultUpperBound: parsed 26, structuredContent 25",
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        allPathsPlan: {
          ...okShape.allPathsPlan,
          warnings: null,
        },
      }),
      [
        "all_paths query_plan missing warnings array",
        'all_paths_query_plan structuredContent mismatch — $.warnings: parsed null, structuredContent ["all_paths may be truncated by limit; reduce maxHops or add relation types."]',
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        allPathsPlan: {
          ...okShape.allPathsPlan,
          execution: null,
        },
      }),
      [
        "all_paths query_plan missing execution advice",
        'all_paths_query_plan structuredContent mismatch — $.execution: parsed null, structuredContent {"shouldRun":false,"nextStep":"review","recommendation":"Review warnings before running sugge...',
      ],
    );
  });

  it("fails on malformed project_map query_plan payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectMapPlan: { ...okShape.projectMapPlan, operation: "project_map" },
      }),
      [
        "project_map query_plan returned unexpected operation: project_map",
        'project_map_query_plan structuredContent mismatch — $.operation: parsed "project_map", structuredContent "query_plan"',
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectMapPlan: { ...okShape.projectMapPlan, targetOperation: "overview" },
      }),
      [
        "project_map query_plan returned unexpected targetOperation: overview",
        'project_map_query_plan structuredContent mismatch — $.targetOperation: parsed "overview", structuredContent "project_map"',
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectMapPlan: {
          ...okShape.projectMapPlan,
          estimate: { ...okShape.projectMapPlan.estimate, strategy: "bounded_bfs" },
        },
      }),
      [
        "project_map query_plan missing aggregate_scan estimate",
        'project_map_query_plan structuredContent mismatch — $.estimate.strategy: parsed "bounded_bfs", structuredContent "aggregate_scan"',
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectMapPlan: { ...okShape.projectMapPlan, indexesUsed: [] },
      }),
      [
        "project_map query_plan missing compiled_artifact index hint",
        'project_map_query_plan structuredContent mismatch — $.indexesUsed[0]: parsed undefined, structuredContent "compiled_artifact"',
      ],
    );
  });

  it("fails on malformed project_map payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, projectMap: { ...okShape.projectMap, operation: "overview" } }),
      ["project_map response operation mismatch — overview"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, projectMap: { ...okShape.projectMap, domains: [] } }),
      ["project_map response returned no domains"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectMap: {
          ...okShape.projectMap,
          domains: [
            {
              ...okShape.projectMap.domains[0],
              capabilities: { total: 0, limited: false, nodes: okShape.projectMap.domains[0].capabilities.nodes },
            },
          ],
        },
      }),
      ["project_map capabilities: domains/auth nodes exceed total — nodes 1, total 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectMap: {
          ...okShape.projectMap,
          domains: [
            {
              ...okShape.projectMap.domains[0],
              summary: { ...okShape.projectMap.domains[0].summary, capabilities: 2 },
            },
          ],
        },
      }),
      ["project_map capabilities total mismatch — domains/auth: summary 2, bucket 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectMap: {
          ...okShape.projectMap,
          unassigned: { total: 1, limited: false, nodes: [] },
        },
      }),
      ["project_map unassigned node count mismatch — nodes 0, total 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, projectMap: { ...okShape.projectMap, hotspots: null } }),
      ["project_map response missing hotspots array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, projectMap: { ...okShape.projectMap, hotspots: [{}] } }),
      ["project_map hotspots response missing row slug at index 0"],
    );
  });

  it("fails on malformed domain_profile payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, domainProfile: { ...okShape.domainProfile, operation: "project_map" } }),
      ["domain_profile response operation mismatch — project_map"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, domainProfile: { ...okShape.domainProfile, domain: "domains/other" } }),
      ["domain_profile response domain mismatch — domains/other"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        domainProfile: {
          ...okShape.domainProfile,
          capabilities: { total: 0, limited: false, nodes: okShape.domainProfile.capabilities.nodes },
        },
      }),
      ["domain_profile capabilities nodes exceed total — nodes 1, total 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        domainProfile: {
          ...okShape.domainProfile,
          summary: { ...okShape.domainProfile.summary, elements: 2 },
        },
      }),
      ["domain_profile elements total mismatch — summary 2, bucket 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        domainProfile: {
          ...okShape.domainProfile,
          edges: {
            ...okShape.domainProfile.edges,
            boundary: { total: 1, limited: false, byRelation: {}, edges: [] },
          },
        },
      }),
      ["domain_profile boundary edges edge count mismatch — edges 0, total 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, domainProfile: { ...okShape.domainProfile, hotspots: [{}] } }),
      ["domain_profile hotspots response missing row slug at index 0"],
    );
  });

  it("fails on malformed domain_matrix payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, domainMatrix: { ...okShape.domainMatrix, operation: "project_map" } }),
      ["domain_matrix response operation mismatch — project_map"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, domainMatrix: { ...okShape.domainMatrix, domains: okShape.domainMatrix.domains.slice(0, 1) } }),
      ["domain_matrix response domain count mismatch — domains 1, summary 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        domainMatrix: {
          ...okShape.domainMatrix,
          summary: { ...okShape.domainMatrix.summary, assignedNodes: 5 },
        },
      }),
      ["domain_matrix assigned node mismatch — summary 5, domains 4"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        domainMatrix: {
          ...okShape.domainMatrix,
          domains: [{ ...okShape.domainMatrix.domains[0], outgoing: -1 }, okShape.domainMatrix.domains[1]],
        },
      }),
      ["domain_matrix domain missing outgoing: domains/ai-agent-partner"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        domainMatrix: {
          ...okShape.domainMatrix,
          connections: { total: 1, limited: false, rows: [] },
        },
      }),
      ["domain_matrix connections row count mismatch — rows 0, total 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        domainMatrix: {
          ...okShape.domainMatrix,
          connections: {
            ...okShape.domainMatrix.connections,
            rows: [{ ...okShape.domainMatrix.connections.rows[0], count: 0 }],
          },
        },
      }),
      ["domain_matrix connection missing count: domains/ai-agent-partner->domains/vault-local-first"],
    );
  });

  it("fails on malformed components payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, components: { ...okShape.components, operation: "health" } }),
      ["components response operation mismatch — health"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, components: { ...okShape.components, components: okShape.components.components.slice(0, 1) } }),
      ["components row count mismatch — rows 1, total 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, components: { ...okShape.components, largestSize: 2 } }),
      ["components largestSize below returned component — largest 2, observed 4"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        components: {
          ...okShape.components,
          components: [{ ...okShape.components.components[0], kinds: { project: 1 } }, okShape.components.components[1]],
        },
      }),
      ["components component kind count mismatch: 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        components: {
          ...okShape.components,
          components: [{ ...okShape.components.components[0], nodes: okShape.components.components[0].nodes.slice(0, 1) }, okShape.components.components[1]],
        },
      }),
      ["components component node count mismatch: 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        components: {
          ...okShape.components,
          components: [
            {
              ...okShape.components.components[0],
              nodeLimited: true,
              nodes: [{ ...okShape.components.components[0].nodes[0], slug: "" }],
            },
            okShape.components.components[1],
          ],
        },
      }),
      ["components component missing node slug: 1/0"],
    );
  });

  it("fails on malformed relation_check payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, relationCheck: { ...okShape.relationCheck, operation: "components" } }),
      ["relation_check response operation mismatch — components"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, relationCheck: { ...okShape.relationCheck, exists: "yes" } }),
      ["relation_check response missing exists flag"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, relationCheck: { ...okShape.relationCheck, verdict: "maybe" } }),
      ["relation_check response unknown verdict — maybe"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationCheck: { ...okShape.relationCheck, recommendation: null },
      }),
      ["relation_check response missing recommendation"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationCheck: {
          ...okShape.relationCheck,
          recommendation: { ...okShape.relationCheck.recommendation, decision: "maybe" },
        },
      }),
      ["relation_check response unknown recommendation decision — maybe"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationCheck: {
          ...okShape.relationCheck,
          recommendation: { ...okShape.relationCheck.recommendation, severity: "fail" },
        },
      }),
      ["relation_check response unknown recommendation severity — fail"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, relationCheck: { ...okShape.relationCheck, matchingEdges: [] } }),
      ["relation_check exists without matchingEdges"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationCheck: { ...okShape.relationCheck, inverseEdges: "nope" },
      }),
      ["relation_check response missing inverseEdges array"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationCheck: {
          ...okShape.relationCheck,
          exists: false,
          verdict: "new_schema_pattern",
        },
      }),
      ["relation_check new_schema_pattern should not include schemaPattern"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationCheck: {
          ...okShape.relationCheck,
          exists: false,
          verdict: "matches_existing_schema",
          matchingEdges: [],
          schemaPattern: { ...okShape.relationCheck.schemaPattern, count: 0 },
        },
      }),
      ["relation_check schemaPattern missing count"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationCheck: {
          ...okShape.relationCheck,
          schemaPattern: { ...okShape.relationCheck.schemaPattern, relation: "relates" },
        },
      }),
      ["relation_check schemaPattern mismatch"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationCheck: {
          ...okShape.relationCheck,
          matchingEdges: [{ ...okShape.relationCheck.matchingEdges[0], via: "" }],
        },
      }),
      ["relation_check matching edge missing via at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationCheck: {
          ...okShape.relationCheck,
          matchingEdges: [{ ...okShape.relationCheck.matchingEdges[0], to: "domains/other" }],
        },
      }),
      ["relation_check matching edge mismatch at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationCheck: {
          ...okShape.relationCheck,
          inverseEdges: [{ from: "domains/ai-agent-partner", to: "capabilities/mcp-server", via: "" }],
        },
      }),
      ["relation_check inverse edge missing via at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationCheck: {
          ...okShape.relationCheck,
          inverseEdges: [{ from: "domains/other", to: "capabilities/mcp-server", via: "domain" }],
        },
      }),
      ["relation_check inverse edge mismatch at index 0"],
    );
  });

  it("fails on malformed maintenance_plan payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, maintenancePlan: { ...okShape.maintenancePlan, operation: "growth_plan" } }),
      ["maintenance_plan response operation mismatch — growth_plan"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, maintenancePlan: { ...okShape.maintenancePlan, sideEffect: true } }),
      ["maintenance_plan must be side-effect free"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          summary: { ...okShape.maintenancePlan.summary, reviewActions: 2 },
        },
      }),
      ["maintenance_plan action count mismatch — executable 1, review 2, total 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          summary: { ...okShape.maintenancePlan.summary, filteredActions: 3 },
        },
      }),
      ["maintenance_plan filteredActions exceeds totalActions — filtered 3, total 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          summary: { ...okShape.maintenancePlan.summary, remainingActions: 3 },
        },
      }),
      ["maintenance_plan remainingActions exceeds filteredActions — remaining 3, filtered 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          byPhase: { link: 2, review: 1 },
        },
      }),
      ["maintenance_plan byPhase total mismatch — remaining 2, bucket 3"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          bySeverity: { warn: 1 },
        },
      }),
      ["maintenance_plan bySeverity total mismatch — remaining 2, bucket 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          byKind: { add_missing_relation: 1, other: 1 },
        },
      }),
      ["maintenance_plan byKind mismatch"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          byKind: { add_missing_relation: 1 },
        },
      }),
      ["maintenance_plan byKind total mismatch — remaining 2, bucket 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          cursor: { ...okShape.maintenancePlan.cursor, hasMore: "false" },
        },
      }),
      ["maintenance_plan cursor missing hasMore flag"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          cursor: { ...okShape.maintenancePlan.cursor, found: false, reason: null },
        },
      }),
      ["maintenance_plan cursor not found without reason"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          cursor: { ...okShape.maintenancePlan.cursor, found: false, reason: "afterActionId not found in filtered maintenance actions" },
        },
      }),
      ["maintenance_plan ready cursor did not report cursor.found=true"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          cursor: { ...okShape.maintenancePlan.cursor, reason: "afterActionId not found in filtered maintenance actions" },
        },
      }),
      ["maintenance_plan ready cursor did not expose cursor.reason=null"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          cursor: { ...okShape.maintenancePlan.cursor, nextAfterActionId: "maint_other" },
        },
      }),
      ["maintenance_plan cursor nextAfterActionId does not match last action"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          nextExecutableAction: { ...okShape.maintenancePlan.nextExecutableAction, executable: false },
        },
      }),
      ["maintenance_plan nextExecutableAction must be executable"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          nextReviewAction: { ...okShape.maintenancePlan.nextReviewAction, executable: true },
        },
      }),
      ["maintenance_plan executable action missing proposedAction: maint_review"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          nextReviewAction: {
            ...okShape.maintenancePlan.nextExecutableAction,
            id: "maint_review",
            executable: true,
          },
        },
      }),
      ["maintenance_plan nextReviewAction must be non-executable"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          nextExecutableAction: {
            ...okShape.maintenancePlan.nextExecutableAction,
            id: "maint_later",
          },
        },
      }),
      ["maintenance_plan nextExecutableAction does not match first executable page action"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          nextExecutableAction: {
            ...okShape.maintenancePlan.nextExecutableAction,
            phase: "repair",
          },
        },
      }),
      ["maintenance_plan nextExecutableAction phase mismatch"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          nextReviewAction: {
            ...okShape.maintenancePlan.nextReviewAction,
            kind: "empty_domain",
          },
        },
      }),
      ["maintenance_plan nextReviewAction kind mismatch"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          nextExecutableAction: {
            ...okShape.maintenancePlan.nextExecutableAction,
            severity: "info",
          },
        },
      }),
      ["maintenance_plan nextExecutableAction severity mismatch"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          actions: [okShape.maintenancePlan.actions[1]],
          cursor: { ...okShape.maintenancePlan.cursor, nextAfterActionId: "maint_review" },
          nextExecutableAction: okShape.maintenancePlan.nextExecutableAction,
          nextReviewAction: okShape.maintenancePlan.actions[1],
        },
      }),
      ["maintenance_plan unexpected nextExecutableAction outside current page"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          nextReviewAction: null,
        },
      }),
      ["maintenance_plan nextReviewAction does not match first review page action"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          actions: [okShape.maintenancePlan.actions[0]],
          cursor: { ...okShape.maintenancePlan.cursor, nextAfterActionId: "maint_link" },
          nextExecutableAction: okShape.maintenancePlan.actions[0],
          nextReviewAction: okShape.maintenancePlan.nextReviewAction,
        },
      }),
      ["maintenance_plan unexpected nextReviewAction outside current page"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          actions: [{ ...okShape.maintenancePlan.actions[0], proposedAction: null }, okShape.maintenancePlan.actions[1]],
        },
      }),
      ["maintenance_plan executable action missing proposedAction: maint_link"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          actions: [
            {
              ...okShape.maintenancePlan.actions[0],
              proposedAction: {
                ...okShape.maintenancePlan.actions[0].proposedAction,
                args: { ...okShape.maintenancePlan.actions[0].proposedAction.args, to: "capabilities/other" },
              },
            },
            okShape.maintenancePlan.actions[1],
          ],
        },
      }),
      ["maintenance_plan proposedAction endpoint mismatch: maint_link"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlan: {
          ...okShape.maintenancePlan,
          actions: [{ ...okShape.maintenancePlan.actions[0], score: Number.NaN }, okShape.maintenancePlan.actions[1]],
        },
      }),
      ["maintenance_plan action missing score: maint_link"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlanMissingCursor: {
          ...okShape.maintenancePlanMissingCursor,
          cursor: { ...okShape.maintenancePlanMissingCursor.cursor, found: true },
        },
      }),
      [
        "maintenance_plan missing-cursor smoke did not report cursor.found=false",
        "maintenance_plan_missing_cursor structuredContent mismatch — $.cursor.found: parsed true, structuredContent false",
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlanMissingCursor: {
          ...okShape.maintenancePlanMissingCursor,
          cursor: { ...okShape.maintenancePlanMissingCursor.cursor, reason: null },
        },
      }),
      [
        "missing-cursor smoke: maintenance_plan cursor not found without reason",
        "maintenance_plan_missing_cursor structuredContent mismatch — $.cursor.reason: parsed null, structuredContent \"afterActionId not found in filtered maintenance actions\"",
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        maintenancePlanMissingCursor: {
          ...okShape.maintenancePlanMissingCursor,
          summary: { ...okShape.maintenancePlanMissingCursor.summary, remainingActions: 1 },
          cursor: { ...okShape.maintenancePlanMissingCursor.cursor, nextAfterActionId: "maint_link" },
          byPhase: { link: 1 },
          bySeverity: { warn: 1 },
          byKind: { add_missing_relation: 1 },
          actions: okShape.maintenancePlan.actions.slice(0, 1),
        },
      }),
      [
        "maintenance_plan missing-cursor smoke returned actions",
        "maintenance_plan_missing_cursor structuredContent mismatch — $.summary.remainingActions: parsed 1, structuredContent 0",
      ],
    );
  });

  it("fails on malformed growth_plan payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, growthPlan: { ...okShape.growthPlan, operation: "maintenance_plan" } }),
      ["growth_plan response operation mismatch — maintenance_plan"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        growthPlan: {
          ...okShape.growthPlan,
          summary: { ...okShape.growthPlan.summary, totalActions: 2 },
        },
      }),
      ["growth_plan totalActions mismatch — summary 2, computed 3"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        growthPlan: {
          ...okShape.growthPlan,
          relationRecommendations: { ...okShape.growthPlan.relationRecommendations, totalRecommendations: 2 },
        },
      }),
      ["growth_plan relationRecommendations total mismatch — summary 1, group 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        growthPlan: {
          ...okShape.growthPlan,
          externalElementRefs: { ...okShape.growthPlan.externalElementRefs, rows: [] },
        },
      }),
      [
        "growth_plan.externalElementRefs row count mismatch — rows 0, total 1",
        'growth_plan structuredContent mismatch — $.externalElementRefs.rows[0]: parsed undefined, structuredContent {"kind":"materialize_external_element","score":0.8,"from":"capabilities/mcp-server","ref":"mc...',
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        growthPlan: {
          ...okShape.growthPlan,
          externalElementRefs: { ...okShape.growthPlan.externalElementRefs, ignored: 1 },
        },
      }),
      ["growth_plan ignored external refs mismatch — summary 0, group 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        growthPlan: {
          ...okShape.growthPlan,
          externalElementRefs: {
            ...okShape.growthPlan.externalElementRefs,
            rows: [
              {
                ...okShape.growthPlan.externalElementRefs.rows[0],
                proposedAction: {
                  ...okShape.growthPlan.externalElementRefs.rows[0].proposedAction,
                  args: { ...okShape.growthPlan.externalElementRefs.rows[0].proposedAction.args, slug: "elements/other" },
                },
              },
            ],
          },
        },
      }),
      [
        "growth_plan.externalElementRefs proposedAction slug mismatch: materialize_external_element",
        'growth_plan structuredContent mismatch — $.externalElementRefs.rows[0].proposedAction.args.slug: parsed "elements/other", structuredContent "elements/mcp-src-index"',
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        growthPlan: {
          ...okShape.growthPlan,
          danglingReferences: {
            ...okShape.growthPlan.danglingReferences,
            rows: [{ ...okShape.growthPlan.danglingReferences.rows[0], proposedAction: { tool: "", args: {} } }],
          },
        },
      }),
      [
        "growth_plan.danglingReferences proposedAction missing tool: resolve_dangling_reference",
        'growth_plan structuredContent mismatch — $.danglingReferences.rows[0].proposedAction.tool: parsed "", structuredContent "add_concept"',
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        growthPlan: {
          ...okShape.growthPlan,
          danglingReferences: {
            ...okShape.growthPlan.danglingReferences,
            rows: [
              {
                ...okShape.growthPlan.danglingReferences.rows[0],
                proposedAction: {
                  ...okShape.growthPlan.danglingReferences.rows[0].proposedAction,
                  args: { ...okShape.growthPlan.danglingReferences.rows[0].proposedAction.args, kind: "element" },
                },
              },
            ],
          },
        },
      }),
      [
        "growth_plan.danglingReferences proposedAction kind mismatch: resolve_dangling_reference",
        'growth_plan structuredContent mismatch — $.danglingReferences.rows[0].proposedAction.args.kind: parsed "element", structuredContent "capability"',
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        growthPlan: {
          ...okShape.growthPlan,
          unassignedNodes: {
            ...okShape.growthPlan.unassignedNodes,
            rows: [{ ...okShape.growthPlan.unassignedNodes.rows[0], score: -1 }],
          },
        },
      }),
      [
        "growth_plan.unassignedNodes row missing score: unassigned_node",
        "growth_plan structuredContent mismatch — $.unassignedNodes.rows[0].score: parsed -1, structuredContent 0.5",
      ],
    );
  });

  it("fails on malformed recommend_relations payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationRecommendations: { ...okShape.relationRecommendations, operation: "growth_plan" },
      }),
      ["recommend_relations operation mismatch — growth_plan"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationRecommendations: { ...okShape.relationRecommendations, totalRecommendations: 2 },
      }),
      ["recommend_relations row count mismatch — rows 1, total 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationRecommendations: { ...okShape.relationRecommendations, recommendations: [] },
      }),
      ["recommend_relations row count mismatch — rows 0, total 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationRecommendations: {
          ...okShape.relationRecommendations,
          recommendations: [{ ...okShape.relationRecommendations.recommendations[0], proposedAction: null }],
        },
      }),
      ["recommend_relations row missing proposedAction: missing_domain_containment"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationRecommendations: {
          ...okShape.relationRecommendations,
          recommendations: [
            {
              ...okShape.relationRecommendations.recommendations[0],
              proposedAction: {
                ...okShape.relationRecommendations.recommendations[0].proposedAction,
                args: { ...okShape.relationRecommendations.recommendations[0].proposedAction.args, to: "capabilities/other" },
              },
            },
          ],
        },
      }),
      ["recommend_relations proposedAction relation args mismatch: missing_domain_containment"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        relationRecommendations: {
          ...okShape.relationRecommendations,
          recommendations: [{ ...okShape.relationRecommendations.recommendations[0], score: -1 }],
        },
      }),
      ["recommend_relations row missing score: missing_domain_containment"],
    );
  });

  it("fails on malformed cycles payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, cycles: { ...okShape.cycles, operation: "health" } }),
      ["cycles response operation mismatch — health"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, cycles: { ...okShape.cycles, relationTypes: ["dependencies", ""] } }),
      ["cycles response missing relationTypes"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, cycles: { ...okShape.cycles, cycles: [] } }),
      ["cycles row count mismatch — rows 0, total 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        cycles: {
          ...okShape.cycles,
          cycles: [{ ...okShape.cycles.cycles[0], nodes: ["capabilities/a", "capabilities/b"] }],
        },
      }),
      ["cycles cycle node count mismatch: capabilities/a>capabilities/b>capabilities/a"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        cycles: {
          ...okShape.cycles,
          cycles: [{ ...okShape.cycles.cycles[0], nodes: ["capabilities/a", "capabilities/b", "capabilities/c"] }],
        },
      }),
      ["cycles cycle does not close: capabilities/a>capabilities/b>capabilities/a"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        cycles: {
          ...okShape.cycles,
          cycles: [{ ...okShape.cycles.cycles[0], edges: [{ ...okShape.cycles.cycles[0].edges[0], via: "" }, okShape.cycles.cycles[0].edges[1]] }],
        },
      }),
      ["cycles edge missing via: capabilities/a>capabilities/b>capabilities/a/0"],
    );
  });

  it("fails on malformed topological_order payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, topologicalOrder: { ...okShape.topologicalOrder, operation: "cycles" } }),
      ["topological_order response operation mismatch — cycles"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, topologicalOrder: { ...okShape.topologicalOrder, prerequisiteFirst: false } }),
      ["topological_order must be prerequisite-first"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, topologicalOrder: { ...okShape.topologicalOrder, totalNodes: 4, orderedCount: 4 } }),
      ["topological_order order count mismatch — rows 3, ordered 4"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, topologicalOrder: { ...okShape.topologicalOrder, blocked: [{ slug: "capabilities/a", remainingInDegree: 1 }] } }),
      ["topological_order acyclic result has blocked nodes"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        topologicalOrder: {
          ...okShape.topologicalOrder,
          order: [{ ...okShape.topologicalOrder.order[0], rank: -1 }, okShape.topologicalOrder.order[1], okShape.topologicalOrder.order[2]],
        },
      }),
      ["topological_order order row missing rank at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        topologicalOrder: {
          ...okShape.topologicalOrder,
          layers: [{ rank: 0, nodes: [{ kind: "capability", title: "Storage" }] }],
        },
      }),
      ["topological_order layer 0 row missing slug at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        topologicalOrder: {
          ...okShape.topologicalOrder,
          acyclic: false,
          blocked: [{ slug: "capabilities/a", remainingInDegree: 0 }],
        },
      }),
      ["topological_order blocked row missing remainingInDegree: capabilities/a"],
    );
  });

  it("fails on malformed lineage payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, lineage: { ...okShape.lineage, operation: "containment_tree" } }),
      ["lineage response operation mismatch — containment_tree"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, lineage: { ...okShape.lineage, center: "capabilities/other" } }),
      ["lineage response center mismatch — capabilities/other"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        lineage: {
          ...okShape.lineage,
          ancestors: { ...okShape.lineage.ancestors, nodes: okShape.lineage.ancestors.nodes.slice(0, 1) },
        },
      }),
      ["lineage ancestors node count mismatch — nodes 1, total 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        lineage: {
          ...okShape.lineage,
          ancestors: { ...okShape.lineage.ancestors, nodes: [{ ...okShape.lineage.ancestors.nodes[0], node: { slug: "domains/other" } }, okShape.lineage.ancestors.nodes[1]] },
        },
      }),
      ["lineage ancestors row missing node summary: domains/ai-agent-partner"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        lineage: {
          ...okShape.lineage,
          ancestors: { ...okShape.lineage.ancestors, nodes: [{ ...okShape.lineage.ancestors.nodes[0], distance: 0 }, okShape.lineage.ancestors.nodes[1]] },
        },
      }),
      ["lineage ancestors row missing distance: domains/ai-agent-partner"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        lineage: {
          ...okShape.lineage,
          ancestors: { ...okShape.lineage.ancestors, nodes: [{ ...okShape.lineage.ancestors.nodes[0], via: "" }, okShape.lineage.ancestors.nodes[1]] },
        },
      }),
      ["lineage ancestors row missing via: domains/ai-agent-partner"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        lineage: {
          ...okShape.lineage,
          edges: [{ ...okShape.lineage.edges[0], via: "" }],
        },
      }),
      ["lineage edge missing via at index 0"],
    );
  });

  it("fails on malformed containment_tree payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, containmentTree: { ...okShape.containmentTree, operation: "lineage" } }),
      ["containment_tree response operation mismatch — lineage"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, containmentTree: { ...okShape.containmentTree, root: "other" } }),
      ["containment_tree response root mismatch — other"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, containmentTree: { ...okShape.containmentTree, emittedNodes: 5 } }),
      ["containment_tree emitted node mismatch — emitted 5, counted 4"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        containmentTree: {
          ...okShape.containmentTree,
          roots: [{ ...okShape.containmentTree.roots[0], via: "domains" }],
        },
      }),
      ["containment_tree root should not have via: project"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        containmentTree: {
          ...okShape.containmentTree,
          roots: [
            {
              ...okShape.containmentTree.roots[0],
              children: [{ ...okShape.containmentTree.roots[0].children[0], distance: 2 }],
            },
          ],
        },
      }),
      ["containment_tree node distance mismatch: domains/ai-agent-partner"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        containmentTree: {
          ...okShape.containmentTree,
          roots: [
            {
              ...okShape.containmentTree.roots[0],
              children: [{ ...okShape.containmentTree.roots[0].children[0], node: { slug: "domains/other" } }],
            },
          ],
        },
      }),
      ["containment_tree node summary mismatch: domains/ai-agent-partner"],
    );
  });

  it("fails on malformed reachability payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, reachability: { ...okShape.reachability, operation: "impact" } }),
      ["reachability response operation mismatch — impact"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, reachability: { ...okShape.reachability, start: "capabilities/other" } }),
      ["reachability response start mismatch — capabilities/other"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        reachability: { ...okShape.reachability, summary: { ...okShape.reachability.summary, layers: 3 } },
      }),
      ["reachability layer count mismatch — layers 2, summary 3"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        reachability: {
          ...okShape.reachability,
          layers: [{ ...okShape.reachability.layers[0], total: 2 }, okShape.reachability.layers[1]],
        },
      }),
      ["reachability layer node count mismatch — distance 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        reachability: {
          ...okShape.reachability,
          paths: { ...okShape.reachability.paths, rows: [{ ...okShape.reachability.paths.rows[0], path: ["wrong", "domains/ai-agent-partner"] }, okShape.reachability.paths.rows[1]] },
        },
      }),
      ["reachability paths row path mismatch: domains/ai-agent-partner"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        reachability: { ...okShape.reachability, terminalNodes: [] },
      }),
      ["reachability terminal count mismatch — terminals 0, summary 1"],
    );
  });

  it("fails on malformed impact payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, impact: { ...okShape.impact, operation: "blast_radius" } }),
      ["impact response operation mismatch — blast_radius"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, impact: { ...okShape.impact, center: "capabilities/other" } }),
      ["impact response center mismatch — capabilities/other"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, impact: { ...okShape.impact, total: 3 } }),
      ["impact node count mismatch — nodes 2, total 3"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        impact: { ...okShape.impact, nodes: [{ ...okShape.impact.nodes[0], distance: 0 }, okShape.impact.nodes[1]] },
      }),
      ["impact node missing distance: domains/ai-agent-partner"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        impact: { ...okShape.impact, edges: [{ ...okShape.impact.edges[0], via: "" }] },
      }),
      ["impact edge missing via at index 0"],
    );
  });

  it("fails on malformed blast_radius payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, blastRadius: { ...okShape.blastRadius, operation: "impact" } }),
      ["blast_radius response operation mismatch — impact"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, blastRadius: { ...okShape.blastRadius, risk: "extreme" } }),
      ["blast_radius response unknown risk — extreme"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        blastRadius: { ...okShape.blastRadius, nodes: { ...okShape.blastRadius.nodes, total: 1 } },
      }),
      ["blast_radius nodes total mismatch — summary 2, bucket 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        blastRadius: { ...okShape.blastRadius, edges: { ...okShape.blastRadius.edges, rows: [{ ...okShape.blastRadius.edges.rows[0], crossDomain: "no" }, okShape.blastRadius.edges.rows[1]] } },
      }),
      ["blast_radius edge missing crossDomain at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        blastRadius: {
          ...okShape.blastRadius,
          summary: { ...okShape.blastRadius.summary, crossDomainEdges: 0 },
          edges: { ...okShape.blastRadius.edges, rows: [{ ...okShape.blastRadius.edges.rows[0], crossDomain: true }, okShape.blastRadius.edges.rows[1]] },
        },
      }),
      ["blast_radius cross-domain edge mismatch — rows 1, summary 0"],
    );
  });

  it("fails on malformed subgraph payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, subgraph: { ...okShape.subgraph, operation: "reachability" } }),
      ["subgraph response operation mismatch — reachability"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, subgraph: { ...okShape.subgraph, seed: "capabilities/other" } }),
      ["subgraph response seed mismatch — capabilities/other"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        subgraph: { ...okShape.subgraph, totalNodes: 2, nodes: okShape.subgraph.nodes.slice(1) },
      }),
      ["subgraph response missing seed node"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        subgraph: { ...okShape.subgraph, totalEdges: 3 },
      }),
      ["subgraph edge count mismatch — edges 2, total 3"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        subgraph: { ...okShape.subgraph, nodes: [{ ...okShape.subgraph.nodes[0], node: { slug: "capabilities/other" } }, okShape.subgraph.nodes[1], okShape.subgraph.nodes[2]] },
      }),
      ["subgraph node summary mismatch: capabilities/mcp-server"],
    );
  });

  it("fails on malformed schema payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, schema: { ...okShape.schema, operation: "facets" } }),
      ["schema response operation mismatch — facets"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, schema: { ...okShape.schema, patterns: [] } }),
      ["schema pattern count mismatch — patterns 0, total 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        schema: { ...okShape.schema, patterns: [{ ...okShape.schema.patterns[0], relation: "" }, okShape.schema.patterns[1]] },
      }),
      ["schema pattern missing relation at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        schema: { ...okShape.schema, patterns: [{ ...okShape.schema.patterns[0], resolved: 2 }, okShape.schema.patterns[1]] },
      }),
      ["schema pattern resolution exceeds count: capability-domain-domain"],
    );
  });

  it("fails on malformed facets payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, facets: { ...okShape.facets, operation: "schema" } }),
      ["facets response operation mismatch — schema"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        facets: { ...okShape.facets, graph: { ...okShape.facets.graph, edges: 3 } },
      }),
      ["facets graph edge count mismatch — edges 3, parts 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        facets: { ...okShape.facets, nodes: { ...okShape.facets.nodes, topByDegree: [{}] } },
      }),
      ["facets topByDegree response missing row slug at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        facets: { ...okShape.facets, edges: { ...okShape.facets.edges, byResolution: { resolved: 0, external: 1, unresolved: 0 } } },
      }),
      ["facets edge resolution mismatch with graph summary"],
    );
  });

  it("fails on malformed match_nodes payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, matchNodes: { ...okShape.matchNodes, operation: "match_edges" } }),
      ["match_nodes response operation mismatch — match_edges"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, matchNodes: { ...okShape.matchNodes, filters: { ...okShape.matchNodes.filters, slugContains: "cli" } } }),
      ["match_nodes filter slugContains mismatch — cli"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, matchNodes: { ...okShape.matchNodes, totalMatches: 2 } }),
      ["match_nodes row count mismatch — rows 1, total 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, matchNodes: { ...okShape.matchNodes, nodes: [{ ...okShape.matchNodes.nodes[0], degree: -1 }] } }),
      ["match_nodes row missing degree: capabilities/mcp-server"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, matchNodes: { ...okShape.matchNodes, nodes: [{ ...okShape.matchNodes.nodes[0], inDegree: -1 }] } }),
      ["match_nodes row missing inDegree: capabilities/mcp-server"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, matchNodes: { ...okShape.matchNodes, nodes: [{ ...okShape.matchNodes.nodes[0], outDegree: 1.5 }] } }),
      ["match_nodes row missing outDegree: capabilities/mcp-server"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, matchNodes: { ...okShape.matchNodes, nodes: [{ ...okShape.matchNodes.nodes[0], degree: 8 }] } }),
      ["match_nodes row degree mismatch: capabilities/mcp-server"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, matchNodes: { ...okShape.matchNodes, nodes: [{ ...okShape.matchNodes.nodes[0], slug: "capabilities/cli" }] } }),
      ["match_nodes row slug filter mismatch: capabilities/cli"],
    );
  });

  it("fails on malformed match_edges payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, matchEdges: { ...okShape.matchEdges, operation: "match_nodes" } }),
      ["match_edges response operation mismatch — match_nodes"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, matchEdges: { ...okShape.matchEdges, filters: { ...okShape.matchEdges.filters, includeExternal: false } } }),
      ["match_edges filter includeExternal mismatch"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, matchEdges: { ...okShape.matchEdges, totalMatches: 3 } }),
      ["match_edges row count mismatch — rows 2, total 3"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, matchEdges: { ...okShape.matchEdges, edges: [{ ...okShape.matchEdges.edges[0], from: "capabilities/other" }, okShape.matchEdges.edges[1]] } }),
      ["match_edges row from mismatch at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, matchEdges: { ...okShape.matchEdges, edges: [{ ...okShape.matchEdges.edges[0], toKind: "" }, okShape.matchEdges.edges[1]] } }),
      ["match_edges row missing toKind at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, matchEdges: { ...okShape.matchEdges, edges: [{ ...okShape.matchEdges.edges[0], toKind: "element" }, okShape.matchEdges.edges[1]] } }),
      ["match_edges row toKind mismatch at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, matchEdges: { ...okShape.matchEdges, edges: [okShape.matchEdges.edges[0], { ...okShape.matchEdges.edges[1], toNode: { slug: "mcp/src/index.js", kind: "element", title: "index.js" } }] } }),
      ["match_edges external row has toNode at index 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, matchEdges: { ...okShape.matchEdges, edges: [okShape.matchEdges.edges[0], { ...okShape.matchEdges.edges[1], toKind: "element" }] } }),
      ["match_edges external row toKind mismatch at index 1"],
    );
  });

  it("fails on malformed node_profile payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, nodeProfile: { ...okShape.nodeProfile, operation: "node_profile_old" } }),
      ["node_profile response operation mismatch — node_profile_old"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, nodeProfile: { ...okShape.nodeProfile, center: "capabilities/other" } }),
      ["node_profile response center mismatch — capabilities/other"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, nodeProfile: { ...okShape.nodeProfile, degree: { in: 2, out: 3, total: 6 } } }),
      ["node_profile degree mismatch — total 6, in+out 5"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        nodeProfile: {
          ...okShape.nodeProfile,
          edges: { ...okShape.nodeProfile.edges, incoming: { ...okShape.nodeProfile.edges.incoming, edges: [] } },
        },
      }),
      ["node_profile incoming edge count mismatch — edges 0, total 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        nodeProfile: {
          ...okShape.nodeProfile,
          edges: {
            ...okShape.nodeProfile.edges,
            incoming: {
              ...okShape.nodeProfile.edges.incoming,
              edges: [{ ...okShape.nodeProfile.edges.incoming.edges[0], to: "capabilities/other" }],
            },
          },
        },
      }),
      ["node_profile incoming edge target mismatch at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        nodeProfile: {
          ...okShape.nodeProfile,
          edges: {
            ...okShape.nodeProfile.edges,
            outgoing: {
              ...okShape.nodeProfile.edges.outgoing,
              edges: [{ ...okShape.nodeProfile.edges.outgoing.edges[0], from: "capabilities/other" }],
            },
          },
        },
      }),
      ["node_profile outgoing edge source mismatch at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        nodeProfile: {
          ...okShape.nodeProfile,
          edges: {
            ...okShape.nodeProfile.edges,
            outgoing: {
              ...okShape.nodeProfile.edges.outgoing,
              edges: [{ ...okShape.nodeProfile.edges.outgoing.edges[0], otherKind: "element" }],
            },
          },
        },
      }),
      ["node_profile outgoing edge otherKind mismatch at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        nodeProfile: {
          ...okShape.nodeProfile,
          containment: { ...okShape.nodeProfile.containment, parents: [{ ...okShape.nodeProfile.containment.parents[0], via: "" }] },
        },
      }),
      ["node_profile containment parents row missing via: domains/ai-agent-partner"],
    );
  });

  it("fails on malformed centrality payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, centrality: { ...okShape.centrality, operation: "overview" } }),
      ["centrality response operation mismatch — overview"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, centrality: { ...okShape.centrality, graph: { ...okShape.centrality.graph, graphHash: "" } } }),
      ["centrality graph missing graphHash"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        centrality: {
          ...okShape.centrality,
          rankings: {
            ...okShape.centrality.rankings,
            pageRank: [{ ...okShape.centrality.rankings.pageRank[0], degree: 6 }],
          },
        },
      }),
      ["centrality pageRank degree mismatch: capabilities/mcp-server"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        centrality: { ...okShape.centrality, rankings: { ...okShape.centrality.rankings, pageRank: [] } },
      }),
      ["centrality pageRank returned no rows"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        centrality: { ...okShape.centrality, rankings: { ...okShape.centrality.rankings, hubs: null } },
      }),
      ["centrality rankings missing hubs"],
    );
  });

  it("fails on malformed communities payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, communities: { ...okShape.communities, operation: "components" } }),
      ["communities response operation mismatch — components"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        communities: { ...okShape.communities, communities: okShape.communities.communities.slice(0, 1) },
      }),
      ["communities row count mismatch — rows 1, total 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, communities: { ...okShape.communities, summary: { ...okShape.communities.summary, largestSize: 2 } } }),
      ["communities largestSize below returned community — largest 2, observed 3"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        communities: {
          ...okShape.communities,
          communities: [{ ...okShape.communities.communities[0], nodes: okShape.communities.communities[0].nodes.slice(0, 1) }, okShape.communities.communities[1]],
        },
      }),
      ["communities community node count mismatch: 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        communities: {
          ...okShape.communities,
          crossCommunityEdges: {
            ...okShape.communities.crossCommunityEdges,
            rows: [{ ...okShape.communities.crossCommunityEdges.rows[0], fromCommunity: 0 }],
          },
        },
      }),
      ["communities crossCommunityEdges missing fromCommunity at index 0"],
    );
  });

  it("fails on malformed similar_nodes payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, similarNodes: { ...okShape.similarNodes, operation: "match_nodes" } }),
      ["similar_nodes response operation mismatch — match_nodes"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, similarNodes: { ...okShape.similarNodes, source: { ...okShape.similarNodes.source, slug: "capabilities/other" } } }),
      ["similar_nodes source slug mismatch — capabilities/other"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, similarNodes: { ...okShape.similarNodes, totalMatches: 2 } }),
      ["similar_nodes row count mismatch — rows 1, total 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        similarNodes: {
          ...okShape.similarNodes,
          matches: [{ ...okShape.similarNodes.matches[0], node: { slug: "capabilities/other", kind: "capability", title: "Other" } }],
        },
      }),
      ["similar_nodes response missing existing capabilities/mcp-server match"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        similarNodes: {
          ...okShape.similarNodes,
          matches: [{ ...okShape.similarNodes.matches[0], signals: { ...okShape.similarNodes.matches[0].signals, title: -1 } }],
        },
      }),
      ["similar_nodes match missing signal title: capabilities/mcp-server"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        similarNodes: {
          ...okShape.similarNodes,
          matches: [{ ...okShape.similarNodes.matches[0], score: 0.8 }],
        },
      }),
      ["similar_nodes match score mismatch: capabilities/mcp-server"],
    );
  });

  it("fails on malformed explain_relation payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, explainRelation: { ...okShape.explainRelation, operation: "path" } }),
      ["explain_relation response operation mismatch — path"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, explainRelation: { ...okShape.explainRelation, from: "capabilities/other" } }),
      ["explain_relation from mismatch — capabilities/other"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        explainRelation: {
          ...okShape.explainRelation,
          shortestPath: { ...okShape.explainRelation.shortestPath, found: false },
        },
      }),
      ["explain_relation expected shortestPath to be found"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        explainRelation: {
          ...okShape.explainRelation,
          shortestPath: { ...okShape.explainRelation.shortestPath, hopCount: 3 },
        },
      }),
      ["explain_relation shortestPath hop mismatch — hopCount 3, hops 3"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        explainRelation: {
          ...okShape.explainRelation,
          shortestPath: {
            ...okShape.explainRelation.shortestPath,
            edges: [
              { ...okShape.explainRelation.shortestPath.edges[0], to: "domains/other" },
              okShape.explainRelation.shortestPath.edges[1],
            ],
          },
        },
      }),
      ["explain_relation shortestPath edge endpoint mismatch at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        explainRelation: {
          ...okShape.explainRelation,
          commonNeighbors: { ...okShape.explainRelation.commonNeighbors, rows: [{}] },
        },
      }),
      ["explain_relation commonNeighbors row missing slug at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        explainRelation: {
          ...okShape.explainRelation,
          commonNeighbors: {
            ...okShape.explainRelation.commonNeighbors,
            rows: [
              {
                ...okShape.explainRelation.commonNeighbors.rows[0],
                fromEdges: [
                  {
                    ...okShape.explainRelation.commonNeighbors.rows[0].fromEdges[0],
                    to: "domains/other",
                  },
                ],
              },
            ],
          },
        },
      }),
      ["explain_relation commonNeighbors fromEdges endpoint mismatch at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        explainRelation: {
          ...okShape.explainRelation,
          commonNeighbors: {
            ...okShape.explainRelation.commonNeighbors,
            rows: [
              {
                ...okShape.explainRelation.commonNeighbors.rows[0],
                toEdges: [
                  {
                    ...okShape.explainRelation.commonNeighbors.rows[0].toEdges[0],
                    from: "domains/other",
                  },
                ],
              },
            ],
          },
        },
      }),
      ["explain_relation commonNeighbors toEdges endpoint mismatch at index 0"],
    );
  });

  it("fails on malformed neighbors payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, neighbors: { ...okShape.neighbors, operation: "path" } }),
      ["neighbors response operation mismatch — path"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, neighbors: { ...okShape.neighbors, center: "capabilities/other" } }),
      ["neighbors response center mismatch — capabilities/other"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, neighbors: { ...okShape.neighbors, total: 3 } }),
      ["neighbors edge count mismatch — edges 2, total 3"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        neighbors: {
          ...okShape.neighbors,
          edges: [{ ...okShape.neighbors.edges[0], direction: "sideways" }, okShape.neighbors.edges[1]],
        },
      }),
      ["neighbors edge missing direction at index 0"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        neighbors: {
          ...okShape.neighbors,
          edges: [{ ...okShape.neighbors.edges[0], from: "capabilities/other" }, okShape.neighbors.edges[1]],
        },
      }),
      ["neighbors outgoing edge does not start at center at index 0"],
    );
  });

  it("fails on malformed path operation payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, queryPath: { ...okShape.queryPath, operation: "find_path" } }),
      ["path operation response mismatch — find_path"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, queryPath: { ...okShape.queryPath, from: "capabilities/other" } }),
      ["path operation from mismatch — capabilities/other"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, queryPath: { ...okShape.queryPath, found: false } }),
      ["path operation expected capabilities/mcp-server → domains/vault-local-first path"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, queryPath: { ...okShape.queryPath, hopCount: 3 } }),
      ["path operation response hop mismatch — hopCount 3, hops 3"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        queryPath: {
          ...okShape.queryPath,
          edges: [{ ...okShape.queryPath.edges[0], traversedTo: "domains/other" }, okShape.queryPath.edges[1]],
        },
      }),
      ["path operation traversal mismatch at index 0"],
    );
  });

  it("fails on malformed project_scope payloads", () => {
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, projectScope: { ...okShape.projectScope, operation: "project_map" } }),
      ["project_scope response operation mismatch — project_map"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, projectScope: { ...okShape.projectScope, project: "other" } }),
      ["project_scope response project mismatch — other"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectScope: { ...okShape.projectScope, nodes: { ...okShape.projectScope.nodes, total: 2 } },
      }),
      ["project_scope nodes total mismatch — summary 3, bucket 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectScope: { ...okShape.projectScope, byKind: { project: 1 } },
      }),
      ["project_scope byKind count mismatch — summary 3, byKind 1"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectScope: {
          ...okShape.projectScope,
          edges: {
            ...okShape.projectScope.edges,
            boundary: { ...okShape.projectScope.edges.boundary, total: 2 },
          },
        },
      }),
      ["project_scope boundary edges edge count mismatch — edges 1, total 2"],
    );
  });

  it("fails when dogfood read surfaces disagree on counts", () => {
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        list: { ...okShape.list, total: 2, limited: true, pagination: { ...okShape.list.pagination, total: 2, hasMore: true, nextOffset: 1 }, },
      }),
      [
        "list_concepts structuredContent mismatch — $.total: parsed 2, structuredContent 1",
        "dogfood count mismatch — list_kinds.total 1, list_concepts.total 2",
      ],
    );
    assert.deepEqual(evaluateDogfoodGate({ ...okShape, validation: { ...okShape.validation, scanned: 2 } }), [
      "validate_vault structuredContent mismatch — $.scanned: parsed 2, structuredContent 1",
    ]);
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, compiled: { ...okShape.compiled, nodeCount: 2, byKind: { project: 2 } } }),
      [
        "compile_ontology structuredContent mismatch — $.nodeCount: parsed 2, structuredContent 1",
        "dogfood count mismatch — list_kinds.total 1, compile_ontology.nodeCount 2",
        "dogfood byKind mismatch — project: list_kinds 1, compile_ontology 2",
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        overview: { ...okShape.overview, graph: { ...okShape.overview.graph, nodes: 2 }, byKind: { project: 2 } },
      }),
      [
        "dogfood count mismatch — list_kinds.total 1, overview.graph.nodes 2",
        "dogfood byKind mismatch — project: list_kinds 1, overview 2",
        "overview structuredContent mismatch — $.graph.nodes: parsed 2, structuredContent 1",
      ],
    );
  });

  it("fails when list_kinds and graph summaries disagree by kind", () => {
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        kinds: { total: 1, byKind: { capability: 1 } },
        compiled: { ...okShape.compiled, byKind: { project: 1 } },
      }),
      [
        "list_kinds structuredContent mismatch — $.byKind.capability: parsed 1, structuredContent undefined",
        "dogfood byKind mismatch — capability: list_kinds 1, compile_ontology 0",
        "dogfood byKind mismatch — project: list_kinds 0, compile_ontology 1",
        "dogfood byKind mismatch — capability: list_kinds 1, overview 0",
        "dogfood byKind mismatch — project: list_kinds 0, overview 1",
      ],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        kinds: { total: 1, byKind: { capability: 1 } },
        compiled: { ...okShape.compiled, byKind: { capability: 1 } },
      }),
      [
        "list_kinds structuredContent mismatch — $.byKind.capability: parsed 1, structuredContent undefined",
        "compile_ontology structuredContent mismatch — $.byKind.capability: parsed 1, structuredContent undefined",
        "dogfood byKind mismatch — capability: list_kinds 1, overview 0",
        "dogfood byKind mismatch — project: list_kinds 0, overview 1",
      ],
    );
  });

  it("fails on vault warnings", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      list: { ...okShape.list, vaultWarnings: { errorCount: 0, warningCount: 1 } },
    });
    assert.deepEqual(failures, [
      "list_concepts vaultWarnings present: errors 0, warnings 1. Run validate_vault for file-level diagnostics before writing.",
    ]);
  });

  it("fails on malformed vault warnings", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      list: { ...okShape.list, vaultWarnings: { warningCount: 0 } },
    });
    assert.deepEqual(failures, ["list_concepts vaultWarnings missing errorCount"]);
  });

  it("fails on validate_vault problem files", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      validation: {
        scanned: 2,
        problems: [{ slug: "broken", issues: [{ code: "missing-kind", severity: "error" }] }],
        summary: {
          problemFiles: 1,
          errorFiles: 1,
          warningFiles: 0,
          byCode: {
            "missing-kind": { severity: "error", count: 1, files: ["broken"] },
          },
        },
      },
    });
    assert.deepEqual(failures, [
      "validate_vault found 1 problem file: errors 1, warnings 0 · codes missing-kind:error:1",
    ]);
  });

  it("fails when validate_vault reports problems without byCode entries", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      validation: {
        scanned: 2,
        problems: [{ slug: "broken", issues: [{ code: "missing-kind", severity: "error" }] }],
        summary: { problemFiles: 1, errorFiles: 1, warningFiles: 0, byCode: {} },
      },
    });
    assert.deepEqual(failures, [
      "validate_vault response missing byCode entries for problem files",
    ]);
  });

  it("fails on malformed validate_vault responses", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      validation: { scanned: 2, problems: [] },
    });
    assert.deepEqual(failures, ["validate_vault response missing summary"]);
  });

  it("fails when validate_vault omits the scanned count", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      validation: { problems: [], summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: {} } },
    });
    assert.deepEqual(failures, ["validate_vault response missing scanned count"]);
  });

  it("fails when validate_vault omits the problemFiles count", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      validation: { scanned: 2, problems: [], summary: { errorFiles: 0, warningFiles: 0, byCode: {} } },
    });
    assert.deepEqual(failures, ["validate_vault response missing problemFiles count"]);
  });

  it("fails when validate_vault omits error/warning counts", () => {
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        validation: { scanned: 2, problems: [], summary: { problemFiles: 0, warningFiles: 0, byCode: {} } },
      }),
      ["validate_vault response missing errorFiles count"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        validation: { scanned: 2, problems: [], summary: { problemFiles: 0, errorFiles: 0, byCode: {} } },
      }),
      ["validate_vault response missing warningFiles count"],
    );
  });

  it("fails when validate_vault omits byCode aggregate", () => {
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        validation: {
          scanned: 2,
          problems: [],
          summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0 },
        },
      }),
      ["validate_vault response missing byCode aggregate"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        validation: {
          scanned: 2,
          problems: [],
          summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: [] },
        },
      }),
      ["validate_vault response missing byCode aggregate"],
    );
  });

  it("fails when validate_vault reports an unknown issue code", () => {
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        validation: {
          scanned: 2,
          problems: [{ slug: "broken", issues: [{ code: "new-code", severity: "warning", message: "x" }] }],
          summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: {} },
        },
      }),
      ["validate_vault response unknown issue code at problems[0].issues[0]: new-code"],
    );
  });

  it("fails when validate_vault reports an unknown byCode key", () => {
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        validation: {
          scanned: 2,
          problems: [],
          summary: {
            problemFiles: 0,
            errorFiles: 0,
            warningFiles: 0,
            byCode: { "new-code": { severity: "warning", count: 1, files: ["broken"] } },
          },
        },
      }),
      ["validate_vault response unknown byCode key: new-code"],
    );
  });

  it("fails on missing graph path", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      path: { found: false, reason: "not connected" },
    });
    assert.deepEqual(failures, [
      "find_path structuredContent mismatch — $.found: parsed false, structuredContent true",
      "find_path: expected capabilities/mcp-server → domains/vault-local-first path",
    ]);
  });

  it("fails on unhealthy first-contact diagnosis", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      brief: { ...okShape.brief, status: "needs_attention", health: { checks: [{ id: "compile_issues", status: "fail", count: 1 }] } },
      briefStructured: { ...okShape.briefStructured, status: "needs_attention", health: { checks: [{ id: "compile_issues", status: "fail", count: 1 }] } },
      health: { ...okShape.health, status: "needs_attention", checks: [{ id: "compile_issues", status: "fail", count: 1 }] },
      healthStructured: { ...okShape.healthStructured, status: "needs_attention", checks: [{ id: "compile_issues", status: "fail", count: 1 }] },
    });
    assert.deepEqual(failures, [
      "workspace_brief: status needs_attention (1 node, 0 next actions, 1 health check, growth actions:0 external:0 ignoredExternal:0)",
      "workspace_brief: failing health checks compile_issues:fail:1",
      "health: status needs_attention (issues:0, unresolved:0, cycles:0, 1 check)",
      "health: failing health checks compile_issues:fail:1",
    ]);
  });

  it("keeps an honest semantic advisory non-blocking while preserving structural health gates", () => {
    const semanticAdvisory = {
      operation: "workspace_brief",
      status: "needs_attention",
      summary: { nodes: 1, edges: 0, issues: 0 },
      nextActions: [{ id: "meaning_assessment", kind: "meaning_assessment", severity: "warn", count: 1 }],
      health: {
        checks: [
          { id: "compile_issues", status: "pass", count: 0 },
          { id: "meaning_assessment", status: "warn", count: 1 },
        ],
      },
    };
    const semanticHealth = {
      operation: "health",
      status: "needs_attention",
      summary: { issues: 0, unresolvedEdges: 0, dependencyCycles: 0 },
      checks: [
        { id: "compile_issues", status: "pass", count: 0 },
        { id: "meaning_assessment", status: "warn", count: 1 },
      ],
    };
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        brief: semanticAdvisory,
        briefStructured: semanticAdvisory,
        tunedBrief: semanticAdvisory,
        tunedBriefStructured: semanticAdvisory,
        health: semanticHealth,
        healthStructured: semanticHealth,
        tunedHealth: semanticHealth,
        tunedHealthStructured: semanticHealth,
      }),
      [],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        brief: {
          ...semanticAdvisory,
          health: { checks: [...semanticAdvisory.health.checks, { id: "vault_validation", status: "warn", count: 1 }] },
        },
        briefStructured: {
          ...semanticAdvisory,
          health: { checks: [...semanticAdvisory.health.checks, { id: "vault_validation", status: "warn", count: 1 }] },
        },
      }),
      ["workspace_brief: status needs_attention (1 node, 1 next action, 3 health checks)"],
    );
  });

  it("accepts the bounded infer_imports review branch used for large scans", () => {
    const packet = {
      contract: "inferImportsReview:v1",
      rootPath: "/tmp/repo",
      filesScanned: 5000,
      coverage: { contract: "importScanCoverage:v1" },
      scanSummary: { fileEdges: 100, externalImports: 3, unresolvedImports: 2, moduleEdges: 20 },
      reconciliationSummary: {
        inBoth: 1,
        inCodeMissingFromVault: 2,
        inCodeMissingEndpointAbsent: 3,
        inVaultNotInCode: 4,
        unresolvedImports: 2,
        hint: "Review observed import candidates before writing semantic relations.",
      },
      reviewQueue: { total: 5, returned: 1, exhausted: false, afterReviewId: null },
      nextReview: { contract: "nextRelationReview:v1" },
    };
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        inferredImports: packet,
        inferredImportsStructured: packet,
      }),
      [],
    );
  });

  it("fails on failing health checks even when top-level status is healthy", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      brief: {
        ...okShape.brief,
        health: { checks: [{ id: "dependency_cycles", status: "fail", count: 1 }] },
      },
      health: {
        ...okShape.health,
        checks: [{ id: "compile_issues", status: "fail", count: 1 }],
      },
      tunedHealth: {
        ...okShape.tunedHealth,
        checks: [{ id: "components", status: "fail", count: 1 }],
      },
      tunedBrief: {
        ...okShape.tunedBrief,
        health: { checks: [{ id: "components", status: "fail", count: 1 }] },
      },
    });
    assert.deepEqual(failures, [
      "workspace_brief: failing health checks dependency_cycles:fail:1",
      "workspace_brief_tuned: failing health checks components:fail:1",
      "health: failing health checks compile_issues:fail:1",
      "health_tuned: failing health checks components:fail:1",
    ]);
  });

  it("fails when workspace brief leaves warn/fail next actions", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      brief: {
        ...okShape.brief,
        growth: { ...okShape.brief.growth, externalElementRefs: 2, danglingReferences: 1, totalActions: 3 },
        summary: { ...okShape.brief.summary, growthActions: 3 },
        nextActions: [
          { kind: "health_check", severity: "info", id: "components" },
          { id: "materialize_external_elements", kind: "materialize_external_elements", severity: "warn", count: 2 },
          { id: "resolve_dangling_references", kind: "resolve_dangling_references", severity: "fail", count: 1 },
        ],
      },
    });
    assert.deepEqual(failures, [
      "workspace_brief: actionable nextActions materialize_external_elements:warn:2, resolve_dangling_references:fail:1",
    ]);
  });
});
