// Shared test fixtures for the dogfood MCP walk test suite: mock MCP
// responses (initialize, tools/list, per-tool "ok" shapes) used across the
// split test modules in this directory.
// Split out of scripts/dogfood-mcp-walk.test.mjs (structural decomposition, logic unchanged).
import { readFileSync } from "node:fs";

import {
  EXPECTED_DESTRUCTIVE_TOOLS,
  EXPECTED_IDEMPOTENT_TOOLS,
  EXPECTED_TOOLS,
  IMPORT_EDGE_KIND_VALUES,
  IMPORT_UNRESOLVED_REASON_VALUES,
  VAULT_ISSUE_CODE_VALUES,
  expectedToolTitle,
} from "../../../mcp/scripts/verify.mjs";
import {
  EDGE_TARGET_KIND_VALUES,
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  NODE_KIND_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  QUERY_PLAN_TARGET_OPERATIONS,
  RELATION_TYPE_VALUES,
  WRITE_RELATION_TYPE_VALUES,
} from "../../../mcp/src/ontology-engine.mjs";
import { GRAPH_ARRAY_KEYS } from "../../../mcp/src/vault.mjs";
import { IMPORT_SOURCE_ROLE_VALUES, IMPORT_USAGE_VALUES } from "../../../mcp/src/infer-imports.mjs";

export const WRITE_TOOL_NAMES = new Set([
  "git_snapshot",
  "add_concept",
  "add_concepts",
  "add_relation",
  "add_relations",
  "remove_relation",
  "replace_relation",
  "patch_concept",
  "reclassify_concept",
  "delete_concept",
  "rename_concept",
  "merge_concepts",
  "absorb_document",
  "finalize_project_meaning",
  "connect_project_source",
  "disconnect_project_source",
]);
export const ROOT_PKG = JSON.parse(readFileSync("package.json", "utf-8"));
const DOGFOOD_UID = "11111111-1111-4111-8111-111111111111";
const NON_BLANK_STRING_PATTERN = "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$";

function rustConfigurationEvidenceFixture() {
  return {
    contract: "rustFeatureConfigurationEvidence:v1",
    status: "not_present",
    claimBoundary: {
      compileTimePredicateLocations: false,
      predicateEvaluation: false,
      runtimeImpact: false,
      importDependency: false,
      macroConsumers: false,
      semanticDependency: false,
    },
    coverage: {
      predicateEvaluation: false,
      macroExpansion: false,
      buildScriptsExecuted: false,
    },
    packages: [],
    unsupportedWorkspaceMembers: [],
    writePolicy: {
      automaticRelation: false,
      writeAllowed: false,
      humanApprovalRequired: true,
    },
    limitations: ["No Cargo manifest was observed."],
  };
}

function importScanCoverageFixture() {
  return {
    contract: "importScanCoverage:v1",
    supportedLanguages: ["javascript", "python", "typescript"],
    supportedExtensions: [".js", ".py", ".ts"],
    detectedUnsupportedLanguages: [],
    allDetectedLanguagesSupported: true,
    zeroEdgesMeaning: "no_supported_static_import_edges_observed",
    limitations: ["Static source evidence is not semantic dependency approval."],
  };
}

function meaningAssessmentSchemaFixture() {
  const provenanceFields = [
    "evaluator",
    "graphHash",
    "competencyContract",
    "competencyEvaluator",
    "competencyGraphHash",
    "witnessInventoryContract",
    "witnessInventoryGraphHash",
    "witnessInventorySourceFingerprint",
    "sourceGraphHash",
    "sourceReceiptContractVersion",
    "sourceId",
    "sourceRevision",
    "sourceFingerprint",
    "sourceMeasuredAt",
    "sourceGapId",
  ];
  return {
    type: "object",
    properties: {
      contract: { type: "string", enum: ["meaningAssessment:v1"] },
      projectSlug: { type: ["string", "null"] },
      status: { type: "string", enum: ["verified_current", "review_required", "needs_evidence", "invalid"] },
      dimensions: {
        type: "object",
        properties: {
          structure: {
            type: "object",
            properties: { status: { enum: ["ready", "needs_structure", "invalid"] }, basis: { enum: ["structure_only"] } },
            required: ["status", "basis"],
            additionalProperties: false,
          },
          competency: {
            type: "object",
            properties: {
              status: { enum: ["answered", "needs_evidence"] },
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", minLength: 1, pattern: NON_BLANK_STRING_PATTERN },
                    status: { enum: ["answered", "partial", "visible-gap", "unassessed"] },
                    witnessStatus: { enum: ["resolved", "missing", "unavailable"] },
                  },
                  required: ["id", "status", "witnessStatus"],
                  additionalProperties: false,
                },
              },
            },
            required: ["status", "questions"],
            additionalProperties: false,
          },
          source: {
            type: "object",
            properties: {
              status: { enum: ["not_measured", "needs_evidence", "review_required", "invalid", "verified_current"] },
              currentness: { enum: ["current", "stale", "unavailable"] },
            },
            required: ["status", "currentness"],
            additionalProperties: false,
          },
        },
        required: ["structure", "competency", "source"],
        additionalProperties: false,
      },
      topGap: {
        type: ["object", "null"],
        properties: { dimension: { type: "string" }, id: { type: "string" }, questionId: { type: "string" } },
        required: ["dimension", "id"],
        additionalProperties: false,
      },
      nextAction: {
        type: "object",
        properties: { id: { type: "string" }, target: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
      provenance: {
        type: "object",
        properties: Object.fromEntries(provenanceFields.map((field) => [field, { type: "string" }])),
        required: provenanceFields,
        additionalProperties: false,
      },
    },
    required: ["contract", "projectSlug", "status", "dimensions", "topGap", "nextAction", "provenance"],
    additionalProperties: false,
  };
}

export function makeDogfoodInitialize() {
  return {
    protocolVersion: "2024-11-05",
    serverInfo: { name: "ontology-atlas-mcp", version: "0.12.0" },
    instructions: [
      "Use read-only first-contact diagnosis before write tools.",
      `Tool inventory includes ${EXPECTED_TOOLS.join(", ")}.`,
      "rename_concept refuses an existing `newSlug` unless overwrite: true is explicit.",
      "delete_concept force: true means accepting dangling referrers.",
      "Use expected_mtime when patching a previously-read concept.",
      "Tool schemas reject unknown arguments with nearest hints.",
      "unknown arguments are rejected instead of being ignored.",
      'unknown tool names are rejected with closest tool-name hints such as Unknown tool: list_concept. Did you mean "list_concepts"?',
      "Tool errors include structuredContent.errorCode values such as unknown_tool, unknown_argument, and invalid_arguments.",
      "Tool errors include structuredContent repair fields such as receivedTool, receivedArgument, unknownArguments, rowName, receivedField, unknownFields, allowedFields, receivedFields, firstSeenAt, receivedValue, suggestion, allowedTools, allowedArguments, and allowedValues.",
      "Missing node errors include structuredContent repair fields such as missingSlug, similarSlugs, recoveryTools, and createTool.",
      "Slug conflict errors include structuredContent repair fields such as conflictSlug, recoveryTools, and overwriteOption.",
      'Unknown argument "lmit" for list_concepts. Did you mean "limit"?',
      'Unknown arguments for list_concepts: "lmit" (did you mean "limit"?), "summry" (did you mean "summary"?)',
      "Batch add_concepts and add_relations isolate each non-object row and unknown row fields as ok:false.",
      "Invalid-only batches return no row-level write metadata and no top-level `postWriteMaintenance`; if every row failed, treat the call as dry validation evidence and retry corrected rows.",
      "Invalid-only batches return no row-level `changed` / `alreadyExists` write metadata and no top-level `postWriteMaintenance`; if every row failed, treat the call as dry validation evidence and retry corrected rows.",
      'Batch add_relations unknown type row errors include a closest-value hint such as Did you mean "depends_on"?',
      "Duplicate add_concepts input slugs report concepts[n] duplicate slug in input batch; first seen at concepts[m].",
      'operation must be one of: ... Invalid value: overveiw. Did you mean "overview"?',
      "maintenance_plan phases, severities, and kinds filters are enum-validated.",
      "health and workspace_brief tune probes with componentLimit, cycleLimit, recommendationLimit, orderLimit, nodeLimit, dependencyTypes, and componentTypes.",
      "dependencyTypes / componentTypes accept relation types domains, domain, capabilities, elements, dependencies, depends_on, relates, contains, describes; typoed values fail with nearest-value hints.",
      "maintenance_plan ready pages return cursor.found=true with cursor.reason=null.",
      "maintenance_plan ready pages set cursor.nextAfterActionId to the last returned action id and cursor.hasMore for remaining pages.",
      "maintenance_plan nextExecutableAction and nextReviewAction point only at the first executable/review action in the current returned page.",
      "maintenance_plan afterActionId cursor misses return cursor.found=false and cursor.reason.",
      "maintenance_plan missing cursors return cursor.nextAfterActionId=null and cursor.hasMore=false.",
      "query_ontology agent_brief returns relationDecisionGuide for relation_check outcomes skip_existing, review_inverse, safe_to_add, and review_new_schema.",
      "query_ontology agent_brief returns graphDbQueryPack for facets, schema, match_nodes, match_edges, domain_matrix, centrality, all_paths, and explain_relation.",
      "query_ontology agent_brief returns traversalStrategy plan_before_enumeration, bounded_path_evidence, and containment_cross_check.",
      "query_ontology agent_brief resultContracts describe all_paths limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete.",
    ].join("\n"),
  };
}

export function paginationSchemaFixture() {
  return {
    type: "object",
    required: ["offset", "limit", "total", "returned", "hasMore", "nextOffset"],
    properties: {
      offset: { type: "integer", minimum: 0 },
      limit: { type: "integer", minimum: 0 },
      total: { type: "integer", minimum: 0 },
      returned: { type: "integer", minimum: 0 },
      hasMore: { type: "boolean" },
      nextOffset: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
    },
    additionalProperties: false,
  };
}

export function stringArrayMapSchemaFixture() {
  return {
    type: "object",
    additionalProperties: {
      type: "array",
      items: { type: "string" },
    },
  };
}

export function conceptNeighborsSchemaFixture() {
  return {
    type: "object",
    required: ["domains", "domain", "capabilities", "elements", "dependencies", "relates", "contains", "describes"],
    properties: {
      domains: { type: "array", items: { type: "string" } },
      domain: { type: ["string", "null"] },
      capabilities: { type: "array", items: { type: "string" } },
      elements: { type: "array", items: { type: "string" } },
      dependencies: { type: "array", items: { type: "string" } },
      relates: { type: "array", items: { type: "string" } },
      contains: { type: "array", items: { type: "string" } },
      describes: { type: "array", items: { type: "string" } },
    },
    additionalProperties: false,
  };
}

export function outgoingEdgesSchemaFixture() {
  return {
    type: "array",
    items: {
      type: "object",
      required: ["to", "via"],
      properties: {
        to: { type: "string" },
        via: { type: "string" },
      },
      additionalProperties: false,
    },
  };
}

export function vaultWarningsSchemaFixture() {
  return {
    type: "array",
    items: {
      type: "object",
      required: ["code", "severity", "message"],
      properties: {
        code: { type: "string", enum: VAULT_ISSUE_CODE_VALUES },
        severity: { type: "string", enum: ["error", "warning"] },
        message: { type: "string" },
      },
      additionalProperties: false,
    },
  };
}

export function nonBlankStringSchemaFixture() {
  return {
    type: "string",
    minLength: 1,
    pattern: "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$",
  };
}

export function backlinkRewritePlanSchemaFixture() {
  const nonBlankString = nonBlankStringSchemaFixture();
  const nonBlankStringOrArray = {
    type: ["array", "string"],
    minLength: 1,
    pattern: "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$",
    items: nonBlankString,
  };
  const keyChange = {
    type: "object",
    required: ["key"],
    properties: {
      key: nonBlankString,
      before: nonBlankStringOrArray,
      after: nonBlankStringOrArray,
    },
    additionalProperties: false,
  };
  return {
    type: "object",
    required: ["updates", "totalUpdated"],
    properties: {
      updates: {
        type: "array",
        items: {
          type: "object",
          required: ["slug", "title", "beforeKeys", "afterKeys", "bodyChanged"],
          properties: {
            slug: nonBlankString,
            title: nonBlankString,
            beforeKeys: { type: "array", items: keyChange },
            afterKeys: { type: "array", items: keyChange },
            bodyChanged: { type: "boolean" },
          },
          additionalProperties: false,
        },
      },
      totalUpdated: { type: "integer", minimum: 0 },
    },
    additionalProperties: false,
  };
}

export function capturedDocSchemaFixture() {
  return {
    type: "object",
    required: ["frontmatter"],
    properties: {
      frontmatter: { type: "object" },
      body: { type: "string" },
      bodyExcerpt: { type: "string" },
    },
    additionalProperties: false,
  };
}

export function backlinkRowSchemaFixture() {
  return {
    type: "object",
    required: ["uid", "slug", "kind", "title", "mtime"],
    properties: {
      uid: {
        type: "string",
        pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
      },
      slug: nonBlankStringSchemaFixture(),
      kind: nonBlankStringSchemaFixture(),
      title: nonBlankStringSchemaFixture(),
      domain: nonBlankStringSchemaFixture(),
      mtime: { type: "number", minimum: 0 },
      matchedKeys: { type: "array", items: nonBlankStringSchemaFixture() },
      matchedInBody: { type: "boolean" },
    },
    additionalProperties: false,
  };
}

export function relationArrayPatchSchemaFixture() {
  return {
    type: "object",
    properties: Object.fromEntries(
      GRAPH_ARRAY_KEYS.map((key) => [key, { type: "array", items: { type: "string", minLength: 1 } }]),
    ),
    additionalProperties: false,
  };
}

export function postWriteMaintenanceSchemaFixture() {
  const compactProposedActionTools = ["add_concept", "add_relation", "patch_concept"];
  const maintenanceSummaryRequired = [
    "totalActions",
    "filteredActions",
    "remainingActions",
    "executableActions",
    "reviewActions",
    "compileIssues",
    "dependencyCycles",
    "canonicalizationActions",
    "danglingReferences",
    "relationRecommendations",
    "externalElementRefs",
    "externalElementRefsIgnored",
    "unassignedNodes",
    "emptyDomains",
  ];
  const compactProposedActionArgsSchema = {
    oneOf: [
      {
        type: "object",
        required: ["slug", "kind", "title"],
        properties: {
          slug: { type: "string" },
          kind: { type: "string", enum: NODE_KIND_VALUES },
          title: { type: "string" },
        },
        additionalProperties: false,
      },
      {
        type: "object",
        required: ["from", "to", "type"],
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          type: { type: "string", enum: WRITE_RELATION_TYPE_VALUES },
        },
        additionalProperties: false,
      },
      {
        type: "object",
        required: ["slug", "frontmatter", "expected_mtime"],
        properties: {
          slug: { type: "string" },
          frontmatter: relationArrayPatchSchemaFixture(),
          expected_mtime: { type: "number", minimum: 0 },
        },
        additionalProperties: false,
      },
    ],
  };
  const compactProposedActionSchema = {
    type: ["object", "null"],
    required: ["tool", "args"],
    properties: {
      tool: { type: "string", enum: compactProposedActionTools },
      args: compactProposedActionArgsSchema,
    },
    additionalProperties: false,
  };
  const compactNodeSchema = {
    type: "object",
    required: ["slug", "kind", "title"],
    properties: {
      slug: { type: "string" },
      kind: { type: "string", enum: NODE_KIND_VALUES },
      title: { type: "string" },
    },
    additionalProperties: false,
  };
  const compactActionProperties = {
    id: { type: "string" },
    phase: { type: "string", enum: MAINTENANCE_PHASE_VALUES },
    kind: { type: "string", enum: MAINTENANCE_KIND_VALUES },
    severity: { type: "string", enum: MAINTENANCE_SEVERITY_VALUES },
    score: { type: "number", minimum: 0 },
    executable: { type: "boolean" },
    reason: { type: "string" },
    proposedAction: compactProposedActionSchema,
    node: compactNodeSchema,
    nodes: {
      type: ["array", "object"],
      items: compactNodeSchema,
      additionalProperties: compactNodeSchema,
    },
  };
  return {
    type: "object",
    required: [
      "operation",
      "sideEffect",
      "graphHash",
      "summary",
      "filters",
      "cursor",
      "byPhase",
      "bySeverity",
      "byKind",
      "limited",
      "nextExecutableAction",
      "nextReviewAction",
      "actions",
    ],
    properties: {
      operation: { type: "string", enum: ["maintenance_plan"] },
      sideEffect: { type: "boolean" },
      graphHash: { type: "string" },
      summary: {
        type: "object",
        required: maintenanceSummaryRequired,
        properties: Object.fromEntries(
          maintenanceSummaryRequired.map((key) => [key, { type: "integer", minimum: 0 }]),
        ),
        additionalProperties: false,
      },
      filters: {
        type: "object",
        required: ["executableOnly", "phases", "severities", "kinds"],
        properties: {
          executableOnly: { type: "boolean" },
          phases: { type: "array", items: { type: "string", enum: MAINTENANCE_PHASE_VALUES } },
          severities: { type: "array", items: { type: "string", enum: MAINTENANCE_SEVERITY_VALUES } },
          kinds: { type: "array", items: { type: "string", enum: MAINTENANCE_KIND_VALUES } },
        },
        additionalProperties: false,
      },
      cursor: {
        type: "object",
        required: ["afterActionId", "found", "reason", "startIndex", "nextAfterActionId", "hasMore"],
        properties: {
          afterActionId: { type: ["string", "null"] },
          found: { type: "boolean" },
          reason: { type: ["string", "null"] },
          startIndex: { type: ["integer", "null"], minimum: 0 },
          nextAfterActionId: { type: ["string", "null"] },
          hasMore: { type: "boolean" },
        },
        additionalProperties: false,
      },
      byPhase: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
      bySeverity: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
      byKind: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
      limited: { type: "boolean" },
      actions: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "phase", "kind", "severity", "score", "executable", "reason", "proposedAction"],
          properties: compactActionProperties,
          additionalProperties: false,
        },
      },
      nextExecutableAction: {
        type: ["object", "null"],
        required: ["id", "phase", "kind", "severity", "score", "executable", "reason", "proposedAction"],
        properties: compactActionProperties,
        additionalProperties: false,
      },
      nextReviewAction: {
        type: ["object", "null"],
        required: ["id", "phase", "kind", "severity", "score", "executable", "reason", "proposedAction"],
        properties: compactActionProperties,
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  };
}

export function makeDogfoodToolsList() {
  return {
    tools: EXPECTED_TOOLS.map((name) => {
      const tool = {
        name,
        description: WRITE_TOOL_NAMES.has(name)
          ? "Write tool returns postWriteMaintenance with byPhase bySeverity byKind queue buckets, action score, executable proposedAction, and nextExecutableAction / nextReviewAction current-page pointers."
          : `${name} read tool.`,
        annotations: {
          title: expectedToolTitle(name),
          readOnlyHint: !WRITE_TOOL_NAMES.has(name),
          destructiveHint: EXPECTED_DESTRUCTIVE_TOOLS.includes(name),
          idempotentHint: EXPECTED_IDEMPOTENT_TOOLS.includes(name),
          openWorldHint: false,
        },
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      };
      if (name === "query_ontology") {
        tool.description = "Graph query tool with current-page `nextExecutableAction` / `nextReviewAction` pointers and cursor `nextAfterActionId`/`hasMore` pagination metadata. `agent_brief` includes graphDbQueryPack for facets, schema, match_nodes, match_edges, domain_matrix, centrality, all_paths, and explain_relation, traversalStrategy plan_before_enumeration, bounded_path_evidence, and containment_cross_check guidance plus resultContracts for all_paths completeness. `all_paths` responses include limit/searchBudget/exhaustive/truncatedByBudget/totalPathsExact metadata and evidence guidance.";
        tool.inputSchema.required = ["operation"];
        tool.inputSchema.properties = {
          operation: { enum: QUERY_ONTOLOGY_OPERATIONS },
          targetOperation: { enum: QUERY_PLAN_TARGET_OPERATIONS },
          phases: { type: "array", maxItems: MAINTENANCE_PHASE_VALUES.length, items: { enum: MAINTENANCE_PHASE_VALUES } },
          severities: { type: "array", maxItems: MAINTENANCE_SEVERITY_VALUES.length, items: { enum: MAINTENANCE_SEVERITY_VALUES } },
          kinds: { type: "array", maxItems: MAINTENANCE_KIND_VALUES.length, items: { enum: MAINTENANCE_KIND_VALUES } },
          afterActionId: {
            description:
              "nextExecutableAction/nextReviewAction point only at the first executable/review action in the current returned page and preserve that action id, executable flag, phase, kind, and severity. cursor.nextAfterActionId matches the last returned action id, cursor.hasMore matches whether more remaining actions exist after this page, and unknown cursors return cursor.nextAfterActionId=null, cursor.hasMore=false.",
          },
          componentLimit: { type: "integer", minimum: 1, maximum: 500, description: "health/workspace_brief tuning" },
          cycleLimit: { type: "integer", minimum: 1, maximum: 500, description: "health/workspace_brief tuning" },
          recommendationLimit: { type: "integer", minimum: 1, maximum: 500, description: "health/workspace_brief tuning" },
          orderLimit: { type: "integer", minimum: 1, maximum: 500, description: "health/workspace_brief tuning" },
          nodeLimit: { type: "integer", minimum: 1, maximum: 500, description: "health/workspace_brief tuning" },
          types: { type: "array", maxItems: RELATION_TYPE_VALUES.length, items: { type: "string", enum: RELATION_TYPE_VALUES } },
          pattern: { type: "array", maxItems: RELATION_TYPE_VALUES.length, items: { type: "string", enum: RELATION_TYPE_VALUES } },
          type: { type: "string", enum: RELATION_TYPE_VALUES },
          relation: { type: "string", enum: RELATION_TYPE_VALUES },
          kind: {
            type: "string",
            enum: NODE_KIND_VALUES,
            description:
              "match_nodes: optional node kind filter (project, domain, capability, element, document, vault-readme). recommend_relations currently supports capability or element.",
          },
          fromKind: {
            type: "string",
            enum: NODE_KIND_VALUES,
            description:
              "match_edges only: optional source node kind filter (project, domain, capability, element, document, vault-readme). Source must be a real ontology node, not external/unresolved.",
          },
          toKind: {
            type: "string",
            enum: EDGE_TARGET_KIND_VALUES,
            description:
              "match_edges only: optional target kind filter (project, domain, capability, element, document, vault-readme, external, unresolved). Use external or unresolved for non-node refs.",
          },
          dependencyTypes: { type: "array", maxItems: RELATION_TYPE_VALUES.length, items: { type: "string", enum: RELATION_TYPE_VALUES }, description: "health/workspace_brief tuning" },
          componentTypes: { type: "array", maxItems: RELATION_TYPE_VALUES.length, items: { type: "string", enum: RELATION_TYPE_VALUES }, description: "health/workspace_brief tuning" },
        };
        tool.outputSchema = {
          type: "object",
          properties: {
            operation: { type: "string", enum: QUERY_ONTOLOGY_OPERATIONS },
            compiledSummary: { type: "object" },
          },
          required: ["operation"],
          additionalProperties: true,
        };
      }
      if (name === "finalize_project_meaning") {
        tool.inputSchema.properties = {
          projectSlug: { type: "string", minLength: 1, pattern: NON_BLANK_STRING_PATTERN },
          expected_mtime: { type: "number", minimum: 0 },
        };
        tool.inputSchema.required = ["projectSlug", "expected_mtime"];
        tool.outputSchema = {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            changed: { type: "boolean" },
            contract: { type: "string", enum: ["projectMeaningReceipt:v1"] },
            projectSlug: { type: "string", minLength: 1, pattern: NON_BLANK_STRING_PATTERN },
            bodyDigest: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
            graphHash: { type: "string", pattern: "^project-graph-v1:[a-f0-9]{8}$" },
            sourceFingerprint: { type: "string", minLength: 1, pattern: NON_BLANK_STRING_PATTERN },
            measuredAt: { type: "string", format: "date-time" },
            meaningAssessment: meaningAssessmentSchemaFixture(),
          },
          required: ["ok", "changed", "contract", "projectSlug", "bodyDigest", "graphHash", "sourceFingerprint", "measuredAt", "meaningAssessment"],
          additionalProperties: false,
        };
      }
      if (name === "list_concepts") {
        tool.inputSchema.properties = {
          kind: {
            type: "string",
            minLength: 1,
            enum: NODE_KIND_VALUES,
            description:
              "Filter to one canonical ontology kind (project, domain, capability, element, document, vault-readme). Invalid kind typos fail closed.",
          },
          domain: { type: "string", minLength: 1 },
          since: {
            type: "number",
            minimum: 0,
            description:
              "Non-negative mtime threshold. Filter to nodes with mtime > since for incremental sync and does not double-fetch rows already seen.",
          },
          summary: {
            type: "boolean",
            description:
              "When true, each node row includes a summary max 200 chars without N follow-up `get_concept` calls. Default false.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            description: "Positive integer max rows to return. Defaults to 100, max 500.",
          },
          offset: {
            type: "integer",
            minimum: 0,
            description: "Zero-based page offset. Use pagination.nextOffset until hasMore is false.",
          },
        };
        tool.outputSchema = {
          type: "object",
          required: ["total", "vaultRoot", "nodes", "pagination"],
          properties: {
            total: { type: "integer", minimum: 0 },
            vaultRoot: { type: "string", minLength: 1 },
            nodes: {
              type: "array",
              items: {
                type: "object",
                required: ["uid", "slug", "kind", "title", "mtime"],
                properties: {
                  uid: { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" },
                  slug: { type: "string" },
                  kind: { type: "string" },
                  title: { type: "string" },
                  mtime: { type: "number", minimum: 0 },
                },
                additionalProperties: false,
              },
            },
            pagination: {
              type: "object",
              required: ["offset", "limit", "total", "returned", "hasMore", "nextOffset"],
              properties: {
                offset: { type: "integer", minimum: 0 },
                limit: { type: "integer", minimum: 1, maximum: 500 },
                total: { type: "integer", minimum: 0 },
                returned: { type: "integer", minimum: 0 },
                hasMore: { type: "boolean" },
                nextOffset: { type: ["integer", "null"], minimum: 0 },
              },
              additionalProperties: false,
            },
            vaultWarnings: {
              type: "object",
              required: ["errorCount", "warningCount"],
              properties: {
                errorCount: { type: "integer", minimum: 0 },
                warningCount: { type: "integer", minimum: 0 },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        };
      }
      if (name === "get_concepts") {
        tool.description =
          "Fetch multiple nodes in one call and saves K-1 round-trips. Use exactly one selector array: immutable `uids` or current canonical `slugs`, never together; each returned row carries the permanent `uid` plus current canonical `slug`, while graph-operation inputs remain slug-based. Order of `concepts[]` matches input `slugs[]`; Missing or invalid slug rows return errors while later valid slugs still resolve.";
        delete tool.inputSchema.required;
        // 실서버는 top-level oneOf 를 지웠다 — 런타임에서 exactly-one 강제.
        tool.inputSchema.properties.slugs = {
          type: "array",
          maxItems: 50,
          items: { type: "string" },
          description:
            'Vault-relative slugs, unique tail slugs, or frontmatter `slug` aliases. Max 50 per call.',
        };
        tool.inputSchema.properties.uids = {
          type: "array",
          maxItems: 50,
          items: { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" },
          description: "Immutable permanent node UIDs; never together with slugs.",
        };
        tool.outputSchema = {
          type: "object",
          required: ["concepts"],
          properties: {
            concepts: {
              type: "array",
              items: {
                type: "object",
                required: ["ok"],
                properties: {
                  ok: { type: "boolean" },
                  slug: { type: "string" },
                  uid: {
                    type: "string",
                    pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
                  },
                  frontmatter: { type: "object" },
                  excerpt: { type: "string" },
                  neighbors: conceptNeighborsSchemaFixture(),
                  outgoingEdges: outgoingEdgesSchemaFixture(),
                  mtime: { type: "number", minimum: 0 },
                  warnings: vaultWarningsSchemaFixture(),
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        };
      }
      if (name === "get_concept") {
        tool.description =
          "Fetch one node by exactly one selector: `slug` (canonical slug or unique alias) or immutable `uid`.";
        tool.inputSchema.properties.slug = { type: "string", minLength: 1 };
        tool.inputSchema.properties.uid = {
          type: "string",
          pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
          description: "Immutable permanent node UID; never together with slug.",
        };
        // 실서버는 top-level oneOf 를 지웠다(Claude Code 가 통째로 드랍) — 픽스처도 미러.
        tool.inputSchema.properties.body = {
          type: "string",
          enum: ["excerpt", "full"],
        };
        tool.outputSchema = {
          type: "object",
          required: ["uid", "slug", "frontmatter", "bodyInfo", "neighbors", "outgoingEdges", "mtime"],
          properties: {
            uid: { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" },
            slug: { type: "string" },
            frontmatter: { type: "object" },
            excerpt: { type: "string" },
            body: { type: "string" },
            bodyInfo: {
              type: "object",
              required: ["mode", "totalChars", "returnedChars", "truncated"],
              properties: {
                mode: { type: "string", enum: ["excerpt", "full"] },
                totalChars: { type: "integer", minimum: 0 },
                returnedChars: { type: "integer", minimum: 0 },
                truncated: { type: "boolean" },
                omittedChars: { type: "integer", minimum: 0 },
                hint: { type: "string" },
              },
              additionalProperties: false,
            },
            neighbors: conceptNeighborsSchemaFixture(),
            outgoingEdges: outgoingEdgesSchemaFixture(),
            mtime: { type: "number", minimum: 0 },
            warnings: vaultWarningsSchemaFixture(),
          },
          additionalProperties: false,
        };
      }
      if (name === "find_evidence") {
        tool.description =
          "Find vault docs that mention a given concept by title. Each match includes a prose `excerpt` so agents see the matching doc without an extra get_concept call.";
        tool.inputSchema.required = ["title"];
        tool.inputSchema.properties.title = {
          type: "string",
          minLength: 1,
          description: "Concept title to search for (case-insensitive substring match).",
        };
        tool.outputSchema = {
          type: "object",
          required: ["query", "matches"],
          properties: {
            query: { type: "string" },
            matches: {
              type: "array",
              items: {
                type: "object",
                required: ["uid", "slug", "kind", "title", "mtime", "matchedIn", "score", "excerpt"],
                properties: {
                  uid: {
                    type: "string",
                    pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
                  },
                  slug: { type: "string" },
                  kind: { type: "string" },
                  title: { type: "string" },
                  mtime: { type: "number", minimum: 0 },
                  matchedIn: { enum: ["frontmatter", "body"] },
                  score: { type: "number", minimum: 0 },
                  excerpt: { type: "string" },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        };
      }
      if (name === "find_backlinks") {
        tool.description =
          "Return every node that points to the target slug. Scans both frontmatter keys and wikilinks / markdown links in the body so agents can walk the graph from a node to its dependents.";
        tool.inputSchema.required = ["slug"];
        tool.inputSchema.properties.slug = {
          type: "string",
          minLength: 1,
          description: "Target vault-relative slug (omit the .md extension).",
        };
        tool.outputSchema = {
          type: "object",
          required: ["target", "total", "matches"],
          properties: {
            target: { type: "string" },
            total: { type: "integer", minimum: 0 },
            matches: {
              type: "array",
              items: {
                type: "object",
                required: ["uid", "slug", "kind", "title", "mtime"],
                properties: {
                  uid: {
                    type: "string",
                    pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
                  },
                  slug: { type: "string" },
                  kind: { type: "string" },
                  title: { type: "string" },
                  mtime: { type: "number", minimum: 0 },
                  matchedKeys: { type: "array", items: { type: "string" } },
                  matchedInBody: { type: "boolean" },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        };
      }
      if (name === "find_neighbors") {
        tool.inputSchema.required = ["slug"];
        tool.inputSchema.properties = {
          slug: { type: "string", minLength: 1 },
          direction: {
            type: "string",
            enum: ["outgoing", "incoming", "both"],
            description: "Edge direction to include. Defaults to both.",
          },
          types: {
            type: "array",
            maxItems: RELATION_TYPE_VALUES.length,
            items: { type: "string", enum: RELATION_TYPE_VALUES },
            description:
              'Optional relation types, e.g. ["domain", "depends_on"]. Public add_relation types are normalized to stored graph keys.',
          },
          includeNodes: {
            type: "boolean",
            description: "When true (default), include neighbor node summaries for resolved edges.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            description: "Positive integer max edges to return. Defaults to 100, max 500.",
          },
        };
        tool.outputSchema = {
          type: "object",
          required: ["center", "requested", "direction", "totalEdges", "limited", "edges"],
          properties: {
            center: { type: "string" },
            requested: { type: "string" },
            direction: { enum: ["outgoing", "incoming", "both"] },
            types: { type: "array", items: { type: "string" } },
            totalEdges: { type: "integer", minimum: 0 },
            limited: { type: "boolean" },
            edges: {
              type: "array",
              items: {
                type: "object",
                required: ["direction", "from", "to", "via", "ref", "resolved"],
                properties: {
                  direction: { enum: ["outgoing", "incoming"] },
                  from: { type: "string" },
                  to: { type: "string" },
                  via: { type: "string" },
                  ref: { type: "string" },
                  resolved: { type: "boolean" },
                },
                additionalProperties: false,
              },
            },
            nodes: {
              type: "array",
              items: {
                type: "object",
                required: ["uid", "slug", "kind", "title", "mtime"],
                properties: {
                  uid: {
                    type: "string",
                    pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
                  },
                  slug: { type: "string" },
                  kind: { type: "string" },
                  title: { type: "string" },
                  mtime: { type: "number", minimum: 0 },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        };
      }
      if (name === "find_path") {
        tool.inputSchema.required = ["from", "to"];
        tool.inputSchema.properties = {
          from: { type: "string" },
          to: { type: "string" },
          maxHops: {
            type: "integer",
            minimum: 0,
            maximum: 20,
            description: "Non-negative integer maximum hop count (default 5, max 20).",
          },
        };
        tool.outputSchema = {
          type: "object",
          required: ["from", "to", "found"],
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            found: { type: "boolean" },
            reason: { type: "string" },
            hopCount: { type: "integer", minimum: 0 },
            hops: { type: "array", items: { type: "string" } },
            nodes: {
              type: "array",
              items: {
                type: "object",
                required: ["uid", "slug", "kind", "title"],
                properties: {
                  uid: {
                    type: "string",
                    pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
                  },
                  slug: { type: "string" },
                  kind: { type: "string" },
                  title: { type: "string" },
                  domain: { type: "string" },
                },
                additionalProperties: false,
              },
            },
            edges: {
              type: "array",
              items: {
                type: "object",
                required: ["from", "to", "via"],
                properties: {
                  from: { type: "string" },
                  to: { type: "string" },
                  via: { type: "string" },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        };
      }
      if (name === "list_kinds") {
        tool.description =
          "Vault kind distribution for quick census; size up the vault without paging through list_concepts.";
        tool.outputSchema = {
          type: "object",
          required: ["total", "byKind"],
          properties: {
            total: { type: "integer", minimum: 0 },
            byKind: {
              type: "object",
              additionalProperties: { type: "integer", minimum: 0 },
            },
          },
          additionalProperties: false,
        };
      }
      if (name === "validate_vault") {
        tool.description =
          "Validate every doc in the vault with per-doc + per-code aggregate, side effect 0. Run first-contact before writes and before / after a batch write.";
        tool.outputSchema = {
          type: "object",
          required: ["scanned", "problems", "summary", "pathDrift"],
          properties: {
            scanned: { type: "integer", minimum: 0 },
            pathDrift: {
              type: "object",
              required: ["repoRoot", "nodesScanned", "pathsChecked", "drifts", "hint"],
              additionalProperties: false,
              properties: {
                repoRoot: { type: "string" },
                nodesScanned: { type: "integer", minimum: 0 },
                pathsChecked: { type: "integer", minimum: 0 },
                drifts: { type: "array", items: { type: "object" } },
                hint: { type: "string" },
              },
            },
            problems: {
              type: "array",
              items: {
                type: "object",
                required: ["slug", "issues"],
                properties: {
                  slug: { type: "string" },
                  issues: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["code", "severity", "message"],
                      properties: {
                        code: { type: "string", enum: VAULT_ISSUE_CODE_VALUES },
                        severity: { type: "string", enum: ["error", "warning"] },
                        message: { type: "string" },
                      },
                      additionalProperties: false,
                    },
                  },
                },
                additionalProperties: false,
              },
            },
            summary: {
              type: "object",
              required: ["problemFiles", "errorFiles", "warningFiles", "byCode"],
              properties: {
                problemFiles: { type: "integer", minimum: 0 },
                errorFiles: { type: "integer", minimum: 0 },
                warningFiles: { type: "integer", minimum: 0 },
                byCode: {
                  type: "object",
                  propertyNames: { enum: VAULT_ISSUE_CODE_VALUES },
                  additionalProperties: {
                    type: "object",
                    required: ["severity", "count", "files"],
                    properties: {
                      severity: { enum: ["error", "warning"] },
                      count: { type: "integer", minimum: 0 },
                      files: { type: "array", items: { type: "string" } },
                    },
                    additionalProperties: false,
                  },
                },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        };
      }
      if (name === "find_orphans") {
        tool.description =
          "List orphan nodes: docs that no other node references via any frontmatter array key. Useful cleanup starting point. Root/sentinel kinds like project and vault-readme are excluded by default.";
        tool.inputSchema.properties.kind = {
          type: "string",
          minLength: 1,
          enum: NODE_KIND_VALUES,
          description: "Restrict to one kind. Omit for all kinds.",
        };
        tool.inputSchema.properties.excludeKinds = {
          type: "array",
          maxItems: NODE_KIND_VALUES.length,
          items: { type: "string", enum: NODE_KIND_VALUES },
          description: "Defaults exclude project and vault-readme. Typos fail with nearest-value hints.",
        };
        tool.outputSchema = {
          type: "object",
          required: ["total", "orphans"],
          properties: {
            total: { type: "integer", minimum: 0 },
            orphans: {
              type: "array",
              items: {
                type: "object",
                required: ["uid", "slug", "kind", "title", "mtime"],
                properties: {
                  uid: {
                    type: "string",
                    pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
                  },
                  slug: { type: "string" },
                  kind: { type: "string" },
                  title: { type: "string" },
                  mtime: { type: "number", minimum: 0 },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        };
      }
      if (name === "query_concepts") {
        tool.description =
          "Typed filter DSL. Grammar: filter := atom (AND|OR atom)*; predicate := key=value | key!=value | has(key). Example: kind=capability AND domain=auth AND NOT has(elements).";
        tool.inputSchema.required = ["filter"];
        tool.inputSchema.properties = {
          filter: {
            type: "string",
            description:
              "Filter expression. Supports NOT / AND / OR. Wrap values containing whitespace or special characters with quotes.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            description: "Positive integer max rows to return. Defaults to 100, max 500.",
          },
        };
        tool.outputSchema = {
          type: "object",
          required: ["filter", "parsedAs", "total", "matches", "limited"],
          properties: {
            filter: { type: "string" },
            parsedAs: { type: "string" },
            total: { type: "integer", minimum: 0 },
            matches: {
              type: "array",
              items: {
                type: "object",
                required: ["uid", "slug", "kind", "title", "mtime"],
                properties: {
                  uid: {
                    type: "string",
                    pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
                  },
                  slug: { type: "string" },
                  kind: { type: "string" },
                  title: { type: "string" },
                  mtime: { type: "number", minimum: 0 },
                },
                additionalProperties: false,
              },
            },
            limited: { type: "boolean" },
          },
          additionalProperties: false,
        };
      }
      if (name === "compile_ontology") {
        tool.description =
          "Compile a deterministic graph artifact with stable semantic graphHash and maxMtime. Large vaults (100+ nodes) can exceed the MCP token cap; use summary: true or nodesLimit/nodesOffset and edgesLimit/edgesOffset.";
        tool.inputSchema.properties = {
          summary: {
            type: "boolean",
            description: "When true, omit `nodes` / `edges` / `aliases`. Cheap polling for cache invalidation.",
          },
          nodesLimit: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            description: "Pair with `nodesOffset` to paginate nodes, max 500.",
          },
        };
        tool.outputSchema = {
          type: "object",
          required: [
            "version",
            "graphHash",
            "maxMtime",
            "nodeCount",
            "edgeCount",
            "resolvedEdgeCount",
            "externalEdgeCount",
            "unresolvedEdgeCount",
            "aliasCount",
            "ambiguousAliasCount",
            "issueCount",
            "canonicalizationActionCount",
            "byKind",
            "byDomain",
          ],
          properties: {
            version: { type: "integer", minimum: 1 },
            graphHash: { type: "string" },
            maxMtime: { type: "number", minimum: 0 },
            nodeCount: { type: "integer", minimum: 0 },
            edgeCount: { type: "integer", minimum: 0 },
            resolvedEdgeCount: { type: "integer", minimum: 0 },
            externalEdgeCount: { type: "integer", minimum: 0 },
            unresolvedEdgeCount: { type: "integer", minimum: 0 },
            aliasCount: { type: "integer", minimum: 0 },
            ambiguousAliasCount: { type: "integer", minimum: 0 },
            issueCount: { type: "integer", minimum: 0 },
            canonicalizationActionCount: { type: "integer", minimum: 0 },
            byKind: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
            byDomain: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
            nodes: {
              type: "array",
              items: {
                type: "object",
                required: ["uid", "slug", "kind", "title", "mtime", "outDegree", "inDegree"],
                properties: {
                  uid: {
                    type: "string",
                    pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
                  },
                  slug: { type: "string" },
                  kind: { type: "string" },
                  title: { type: "string" },
                  path: { type: "string" },
                  mtime: { type: "number", minimum: 0 },
                  outDegree: { type: "integer", minimum: 0 },
                  inDegree: { type: "integer", minimum: 0 },
                  merged_uids: {
                    type: "array",
                    items: {
                      type: "string",
                      pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
                    },
                  },
                },
                additionalProperties: false,
              },
            },
            edges: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "from", "to", "via", "ref", "resolved", "external"],
                properties: {
                  id: { type: "string" },
                  from: { type: "string" },
                  to: { type: "string" },
                  via: { type: "string" },
                  ref: { type: "string" },
                  resolved: { type: "boolean" },
                  external: { type: "boolean" },
                },
                additionalProperties: false,
              },
            },
            nodesPagination: paginationSchemaFixture(),
            edgesPagination: paginationSchemaFixture(),
            aliases: {
              type: "array",
              items: {
                type: "object",
                required: ["alias", "slug"],
                properties: {
                  alias: { type: "string" },
                  slug: { type: "string" },
                },
                additionalProperties: false,
              },
            },
            ambiguousAliases: {
              type: "array",
              items: {
                type: "object",
                required: ["alias", "slugs"],
                properties: {
                  alias: { type: "string" },
                  slugs: { type: "array", items: { type: "string" } },
                },
                additionalProperties: false,
              },
            },
            issues: {
              type: "array",
              items: {
                type: "object",
                required: ["code", "severity", "message"],
                properties: {
                  code: { type: "string", enum: ["ambiguous-alias", "dangling-graph-reference"] },
                  severity: { type: "string", enum: ["warning"] },
                  message: { type: "string" },
                  alias: { type: "string" },
                  slugs: { type: "array", items: { type: "string" } },
                  slug: { type: "string" },
                  via: { type: "string" },
                  ref: { type: "string" },
                },
                additionalProperties: false,
              },
            },
            canonicalizationActions: {
              type: "array",
              items: {
                type: "object",
                required: ["slug", "keys", "frontmatter", "expected_mtime"],
                properties: {
                  slug: { type: "string" },
                  keys: { type: "array", items: { type: "string", enum: GRAPH_ARRAY_KEYS } },
                  frontmatter: relationArrayPatchSchemaFixture(),
                  expected_mtime: { type: "number", minimum: 0 },
                },
                additionalProperties: false,
              },
            },
            indexes: {
              type: "object",
              properties: {
                out: stringArrayMapSchemaFixture(),
                in: stringArrayMapSchemaFixture(),
                byKind: stringArrayMapSchemaFixture(),
                byDomain: stringArrayMapSchemaFixture(),
                uidToSlug: { type: "object", additionalProperties: { type: "string" } },
                slugToUid: {
                  type: "object",
                  additionalProperties: {
                    type: "string",
                    pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
                  },
                },
                mergedUidToSlug: { type: "object", additionalProperties: { type: "string" } },
                edgeById: {
                  type: "object",
                  additionalProperties: {
                    type: "object",
                    required: ["id", "from", "to", "via", "ref", "resolved", "external"],
                    properties: {
                      id: { type: "string" },
                      from: { type: "string" },
                      to: { type: "string" },
                      via: { type: "string" },
                      ref: { type: "string" },
                      resolved: { type: "boolean" },
                      external: { type: "boolean" },
                    },
                    additionalProperties: false,
                  },
                },
                aliasToSlug: { type: "object", additionalProperties: { type: "string" } },
              },
              additionalProperties: false,
            },
            summary: {
              type: "object",
              required: ["nodes", "edges", "graphHash", "maxMtime", "resolvedEdges", "externalEdges", "unresolvedEdges", "aliases", "ambiguousAliases", "issues"],
              properties: {
                nodes: { type: "integer", minimum: 0 },
                edges: { type: "integer", minimum: 0 },
                graphHash: { type: "string" },
                maxMtime: { type: "number", minimum: 0 },
                resolvedEdges: { type: "integer", minimum: 0 },
                externalEdges: { type: "integer", minimum: 0 },
                unresolvedEdges: { type: "integer", minimum: 0 },
                aliases: { type: "integer", minimum: 0 },
                ambiguousAliases: { type: "integer", minimum: 0 },
                issues: { type: "integer", minimum: 0 },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        };
      }
      if (name === "analyze_repo_structure") {
        tool.description =
          "Analyze a code repository and propose ontology node candidates; side effect 0 (vault frontmatter NOT modified). Returns deterministic candidates agents should review and selectively pass to add_concept to bootstrap the ontology. This construction lifecycle exposes reviewPlan, writePlan, an independent evaluator, and constructionQualification:v1 before any write. Single source of truth preserved.";
        tool.inputSchema.properties.rootPath = {
          type: "string",
          minLength: 1,
          description: "Repository root to analyze. Defaults to the MCP server cwd.",
        };
        tool.outputSchema = {
          type: "object",
          required: [
            "rootPath",
            "framework",
            "domains",
            "capabilities",
            "elements",
            "meaningGate",
            "extractionContract",
            "semanticEvidence",
            "configurationEvidence",
            "proposalValidation",
            "suggestedRelations",
            "skipped",
          ],
          properties: {
            rootPath: { type: "string" },
            project: {
              type: "object",
              required: ["slug", "title"],
              properties: {
                slug: { type: "string" },
                title: { type: "string" },
              },
              additionalProperties: false,
            },
            framework: { enum: ["fsd", "next", "generic"] },
            domains: {
              type: "array",
              items: {
                type: "object",
                required: ["slug", "title", "evidence"],
                properties: {
                  slug: { type: "string" },
                  title: { type: "string" },
                  evidence: {
                    type: "object",
                    required: ["source"],
                    properties: { source: { type: "string" } },
                    additionalProperties: false,
                  },
                },
                additionalProperties: false,
              },
            },
            capabilities: {
              type: "array",
              items: {
                type: "object",
                required: ["slug", "title", "evidence"],
                properties: {
                  slug: { type: "string" },
                  title: { type: "string" },
                  evidence: {
                    type: "object",
                    required: ["source"],
                    properties: { source: { type: "string" } },
                    additionalProperties: false,
                  },
                },
                additionalProperties: false,
              },
            },
            elements: {
              type: "array",
              items: {
                type: "object",
                required: ["slug", "title", "path", "evidence"],
                properties: {
                  slug: { type: "string" },
                  title: { type: "string" },
                  path: { type: "string" },
                  evidence: {
                    type: "object",
                    required: ["source"],
                    properties: { source: { type: "string" } },
                    additionalProperties: false,
                  },
                },
                additionalProperties: false,
              },
            },
            meaningGate: {
              type: "object",
              required: ["policy", "sourceStructureRole", "businessOntology", "implementationEvidence", "reviewQuestions"],
              properties: {
                policy: { type: "string" },
                sourceStructureRole: { type: "string" },
                businessOntology: {
                  type: "object",
                  required: ["domains", "capabilities", "evidence"],
                  properties: {
                    domains: { type: "array", items: { type: "string" } },
                    capabilities: { type: "array", items: { type: "string" } },
                    evidence: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["slug", "kind", "source"],
                        properties: {
                          slug: { type: "string" },
                          kind: { type: "string", enum: ["domain", "capability"] },
                          source: { type: "string" },
                        },
                        additionalProperties: false,
                      },
                    },
                  },
                  additionalProperties: false,
                },
                implementationEvidence: {
                  type: "object",
                  required: ["elements", "reviewRequiredCapabilities"],
                  properties: {
                    elements: { type: "array", items: { type: "string" } },
                    reviewRequiredCapabilities: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["slug", "reason", "evidence"],
                        properties: {
                          slug: { type: "string" },
                          reason: { type: "string" },
                          evidence: {
                            type: "object",
                            required: ["source"],
                            properties: { source: { type: "string" } },
                            additionalProperties: false,
                          },
                        },
                        additionalProperties: false,
                      },
                    },
                  },
                  additionalProperties: false,
                },
                reviewQuestions: { type: "array", items: { type: "string" } },
              },
              additionalProperties: false,
            },
            suggestedRelations: {
              type: "array",
              items: {
                type: "object",
                required: ["from", "to", "type"],
                properties: {
                  from: { type: "string" },
                  to: { type: "string" },
                  type: { type: "string" },
                },
                additionalProperties: false,
              },
            },
            skipped: {
              type: "array",
              items: {
                type: "object",
                required: ["path", "reason"],
                properties: {
                  path: { type: "string" },
                  reason: { type: "string" },
                },
                additionalProperties: false,
              },
            },
            configurationEvidence: {
              type: "object",
              properties: {
                contract: { type: "string", enum: ["rustFeatureConfigurationEvidence:v1"] },
                writePolicy: {
                  type: "object",
                  required: ["automaticRelation", "writeAllowed", "humanApprovalRequired"],
                  properties: {
                    automaticRelation: { type: "boolean", enum: [false] },
                    writeAllowed: { type: "boolean", enum: [false] },
                    humanApprovalRequired: { type: "boolean", enum: [true] },
                  },
                },
              },
            },
          },
          additionalProperties: false,
        };
      }
      if (name === "infer_imports") {
        // 실서버 tools/list 에서 통째로 추출해 미러 (2026-08-14) — 손 미러가
        // 새 계약(자동 128 KiB 압축 배달 · focus 모드)을 못 따라와 17개
        // 평가기 테스트가 빨갰다. 서버 계약이 바뀌면 이 JSON 을 다시 추출한다.
        const realInferImports = {
  "description": "R17 (autonomous ingest deeper) — walk TS/JS files in a code repo and infer file-level + module-level import edges. It also walks bounded root Python packages and bounded src/source-layout Python packages. Structured `coverage` names the supported languages and, when Cargo is detected, states that Rust use/mod and macro dependency graphs are unsupported; zero edges never proves that a Rust repository has no dependencies. side effect 0 (vault frontmatter NOT modified). `moduleEdges` are source-backed review candidates, never self-approving semantic `depends_on` relations. When you know an implementation file, set `focusPath` (or `reviewMode:\"focus\"`) before considering `full`: Atlas returns bounded exact incoming/outgoing static import receipts, counts, and a cursor without requiring a vault. This focused source boundary is not runtime impact or a semantic relation. Omit `reviewMode` for size-safe automatic delivery: scans whose estimated full MCP result is at most 128 KiB keep the complete response; larger reconciled scans return exactly one compact, non-writing `nextRelationReview:v1` packet plus a delivery receipt and stateless cursor. Use `reviewMode:\"next\"` to request that bounded packet explicitly. `reviewMode:\"full\"` preserves the complete shape, but a result over 128 KiB additionally requires `allowLargeResponse:true`; this second confirmation prevents coding agents from accidentally opting into a multi-megabyte response. Oversized raw scans without a loadable reconciliation vault fail with an actionable error instead of emitting an unbounded default response. Every compact candidate carries `absentEndpoints`. If an endpoint is missing, `nextCalls` is empty and `endpointModelling` separates an evidence-only analysis call from the complete `rootPath + proposal` validation contract, source-bound drafts, and queue resume. It never calls `get_concepts` or `relation_check` on a missing slug, never claims the analysis call created an endpoint, and never promotes a path-derived slug into a business kind or definition. Each module edge includes whole-edge source-role/import-usage counts, `productValueCount`, `kindCounts`, and a bounded exact file-edge `evidence` receipt. Missing vault edges remain `rationale_review_required`: inspect both concepts and the observed direction, ask the user, then call `add_relation` with an explicit `why`. Test-only or type-only evidence stays visible but must not be framed as a product depends_on approval question without separate product meaning evidence. Detects:\n  - relative imports (./, ../) → resolved to file paths\n  - dynamic import() / require() / export ... from\n  - bare side-effect imports (import \"X\")\n  - apps/* and packages/* workspace imports collapse to analyzer-compatible element slugs\n  - bounded static Python import / from ... import statements in root or src/source-layout packages with __init__.py; imports nested under an explicit TYPE_CHECKING guard are type_only; source is parsed as text and never executed\n  - external package imports listed separately\n  - tsconfig.json compilerOptions.paths aliases first, then fallback common @/* aliases → resolved to internal files when the target exists; otherwise unresolved as alias-not-found\n\nUse after analyze_repo_structure to pull *real* dependency edges from the code, not just suggestedRelations heuristics. Unless reconcile:false, also returns `reconciliation` (+ `reconciliationSummary` counts): the module edges diffed against the vault's compiled depends_on edges into `inBoth` / review-required missing edges / `inVaultNotInCode` (possibly-stale vault edges). Missing edges carry source evidence and a `rationale_review_required` gate, never a write action. Single source of truth preserved — inspect both concepts, explain why the semantic dependency holds, and ask the user before one explicit add_relation call with `why`.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "rootPath": {
        "type": "string",
        "minLength": 1,
        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$",
        "description": "Repository root to analyze. Defaults to the active resolved repository root from connection_info."
      },
      "sourceFolders": {
        "type": "array",
        "maxItems": 50,
        "items": {
          "type": "string",
          "minLength": 1,
          "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
        },
        "description": "Source folders to walk (default: ['src','source','lib','app','apps','packages']). Nested scopes preserve repository-relative ontology endpoints. If none exist, falls back to rootPath."
      },
      "ignore": {
        "type": "array",
        "maxItems": 200,
        "items": {
          "type": "string",
          "minLength": 1,
          "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
        },
        "description": "Extra folder names to skip (added to defaults: node_modules, dist, build, …)."
      },
      "maxFiles": {
        "type": "integer",
        "minimum": 1,
        "maximum": 50000,
        "description": "Positive integer cap on files walked (default 5000, max 50000). Hard stop to avoid pathological monorepos."
      },
      "reconcile": {
        "type": "boolean",
        "description": "Default true. When true, diff the inferred module edges against the vault's compiled depends_on edges and include `reconciliation` + `reconciliationSummary`. Set false to skip (raw scan only / no vault)."
      },
      "reviewMode": {
        "type": "string",
        "enum": [
          "full",
          "next",
          "focus"
        ],
        "description": "Omit for automatic delivery unless focusPath is present. `focus` returns a bounded exact file-level import neighborhood for focusPath. Otherwise responses estimated at or below 128 KiB keep the complete scan, while larger reconciled scans return one compact, non-writing review packet. `full` requests the complete scan; when it exceeds 128 KiB, also pass allowLargeResponse:true. `next` explicitly requests one compact packet and requires reconciliation."
      },
      "allowLargeResponse": {
        "type": "boolean",
        "description": "Confirmation for reviewMode:\"full\" only. Required when the estimated complete MCP result exceeds 128 KiB. It never changes scan contents or writes the vault."
      },
      "afterReviewId": {
        "type": "string",
        "minLength": 1,
        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$",
        "description": "`reviewMode:\"next\"` only. Pass the prior packet cursor.nextAfterReviewId to advance deterministically; omit to start at the first current candidate."
      },
      "focusPath": {
        "type": "string",
        "minLength": 1,
        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$",
        "description": "Repository-relative implementation file to inspect. Supplying focusPath with omitted reviewMode selects focus mode automatically. Returns bounded incoming/outgoing supported static import receipts; it does not claim runtime or semantic impact."
      },
      "focusDirection": {
        "type": "string",
        "enum": [
          "incoming",
          "outgoing",
          "both"
        ],
        "description": "Focus mode only. Which exact file-level import direction to page (default both)."
      },
      "focusLimit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100,
        "description": "Focus mode only. Maximum exact import receipts returned in one page (default 50, max 100)."
      },
      "focusAfterEdgeId": {
        "type": "string",
        "minLength": 1,
        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$",
        "description": "Focus mode only. Pass the prior focusReview.cursor.nextAfterEdgeId to advance deterministically; omit to start at the first current edge."
      }
    },
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "rootPath": {
        "type": "string",
        "minLength": 1,
        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
      },
      "filesScanned": {
        "type": "integer",
        "minimum": 0
      },
      "coverage": {
        "type": "object",
        "properties": {
          "contract": {
            "type": "string",
            "enum": [
              "importScanCoverage:v1"
            ]
          },
          "supportedLanguages": {
            "type": "array",
            "uniqueItems": true,
            "items": {
              "type": "string",
              "enum": [
                "javascript",
                "python",
                "typescript"
              ]
            }
          },
          "supportedExtensions": {
            "type": "array",
            "uniqueItems": true,
            "items": {
              "type": "string",
              "minLength": 1,
              "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
            }
          },
          "detectedUnsupportedLanguages": {
            "type": "array",
            "uniqueItems": true,
            "items": {
              "type": "string",
              "enum": [
                "rust"
              ]
            }
          },
          "allDetectedLanguagesSupported": {
            "type": "boolean"
          },
          "zeroEdgesMeaning": {
            "type": "string",
            "enum": [
              "no_supported_static_import_edges_observed"
            ]
          },
          "limitations": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "string",
              "minLength": 1,
              "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
            }
          }
        },
        "required": [
          "contract",
          "supportedLanguages",
          "supportedExtensions",
          "detectedUnsupportedLanguages",
          "allDetectedLanguagesSupported",
          "zeroEdgesMeaning",
          "limitations"
        ],
        "additionalProperties": false
      },
      "edges": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "from": {
              "type": "string",
              "minLength": 1,
              "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
            },
            "to": {
              "type": "string",
              "minLength": 1,
              "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
            },
            "kind": {
              "type": "string",
              "enum": [
                "static",
                "dynamic",
                "require",
                "reexport",
                "side"
              ]
            },
            "sourceRole": {
              "type": "string",
              "enum": [
                "production",
                "test",
                "unknown"
              ]
            },
            "importUsage": {
              "type": "string",
              "enum": [
                "value",
                "type_only",
                "unknown"
              ]
            }
          },
          "required": [
            "from",
            "to",
            "kind",
            "sourceRole",
            "importUsage"
          ],
          "additionalProperties": false
        }
      },
      "externalImports": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "from": {
              "type": "string",
              "minLength": 1,
              "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
            },
            "spec": {
              "type": "string",
              "minLength": 1,
              "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
            }
          },
          "required": [
            "from",
            "spec"
          ],
          "additionalProperties": false
        }
      },
      "unresolved": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "from": {
              "type": "string",
              "minLength": 1,
              "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
            },
            "spec": {
              "type": "string"
            },
            "reason": {
              "type": "string",
              "enum": [
                "empty",
                "relative-not-found",
                "alias-not-found"
              ],
              "description": "Why the import could not resolve. `empty` may have an empty spec; other reasons preserve the original import spec."
            }
          },
          "required": [
            "from",
            "spec",
            "reason"
          ],
          "additionalProperties": false
        }
      },
      "moduleEdges": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "from": {
              "type": "string",
              "minLength": 1,
              "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
            },
            "to": {
              "type": "string",
              "minLength": 1,
              "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
            },
            "count": {
              "type": "integer",
              "minimum": 1
            },
            "kindCounts": {
              "type": "object",
              "properties": {
                "static": {
                  "type": "integer",
                  "minimum": 1
                },
                "dynamic": {
                  "type": "integer",
                  "minimum": 1
                },
                "require": {
                  "type": "integer",
                  "minimum": 1
                },
                "reexport": {
                  "type": "integer",
                  "minimum": 1
                },
                "side": {
                  "type": "integer",
                  "minimum": 1
                }
              },
              "additionalProperties": false,
              "minProperties": 1,
              "description": "Import kind histogram for this collapsed module edge. Allowed keys: static, dynamic, require, reexport, side."
            },
            "sourceRoleCounts": {
              "type": "object",
              "properties": {
                "production": {
                  "type": "integer",
                  "minimum": 0
                },
                "test": {
                  "type": "integer",
                  "minimum": 0
                },
                "unknown": {
                  "type": "integer",
                  "minimum": 0
                }
              },
              "required": [
                "production",
                "test",
                "unknown"
              ],
              "additionalProperties": false,
              "description": "Whole-edge importer role histogram using deterministic path conventions."
            },
            "importUsageCounts": {
              "type": "object",
              "properties": {
                "value": {
                  "type": "integer",
                  "minimum": 0
                },
                "type_only": {
                  "type": "integer",
                  "minimum": 0
                },
                "unknown": {
                  "type": "integer",
                  "minimum": 0
                }
              },
              "required": [
                "value",
                "type_only",
                "unknown"
              ],
              "additionalProperties": false,
              "description": "Whole-edge import usage histogram. `value` means the import is not explicit type-only syntax; it does not claim runtime execution."
            },
            "productValueCount": {
              "type": "integer",
              "minimum": 0,
              "description": "Whole-edge joint count where sourceRole=production and importUsage=value. Never derive this intersection from marginal histograms."
            },
            "evidence": {
              "type": "array",
              "maxItems": 5,
              "description": "Bounded exact file-level import receipts supporting this collapsed module edge.",
              "items": {
                "type": "object",
                "properties": {
                  "from": {
                    "type": "string",
                    "minLength": 1,
                    "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                  },
                  "to": {
                    "type": "string",
                    "minLength": 1,
                    "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                  },
                  "kind": {
                    "type": "string",
                    "enum": [
                      "static",
                      "dynamic",
                      "require",
                      "reexport",
                      "side"
                    ]
                  },
                  "sourceRole": {
                    "type": "string",
                    "enum": [
                      "production",
                      "test",
                      "unknown"
                    ]
                  },
                  "importUsage": {
                    "type": "string",
                    "enum": [
                      "value",
                      "type_only",
                      "unknown"
                    ]
                  }
                },
                "required": [
                  "from",
                  "to",
                  "kind",
                  "sourceRole",
                  "importUsage"
                ],
                "additionalProperties": false
              }
            },
            "evidenceLimited": {
              "type": "boolean",
              "description": "True when more file edges exist than the bounded evidence receipt includes."
            }
          },
          "required": [
            "from",
            "to",
            "count",
            "kindCounts",
            "sourceRoleCounts",
            "importUsageCounts",
            "productValueCount",
            "evidence",
            "evidenceLimited"
          ],
          "additionalProperties": false
        }
      },
      "reconciliation": {
        "type": [
          "object",
          "null"
        ],
        "description": "Module edges diffed against the vault's compiled depends_on edges (alias-normalized). null when no vault is loadable (e.g. scanning a foreign repo). Absent when reconcile:false.",
        "properties": {
          "inBoth": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "from": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                },
                "to": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                }
              },
              "required": [
                "from",
                "to"
              ],
              "additionalProperties": false
            }
          },
          "inCodeMissingFromVault": {
            "type": "array",
            "description": "Import-backed review candidates missing from the vault whose endpoints already exist. Each carries exact source evidence plus `rationale_review_required`; no write action is emitted.",
            "items": {
              "type": "object",
              "properties": {
                "from": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                },
                "to": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                },
                "count": {
                  "type": "integer",
                  "minimum": 1
                },
                "absentEndpoints": {
                  "type": "array",
                  "maxItems": 2,
                  "uniqueItems": true,
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                  }
                },
                "sourceEvidence": {
                  "type": "array",
                  "maxItems": 5,
                  "items": {
                    "type": "object",
                    "properties": {
                      "from": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                      },
                      "to": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                      },
                      "kind": {
                        "type": "string",
                        "enum": [
                          "static",
                          "dynamic",
                          "require",
                          "reexport",
                          "side"
                        ]
                      },
                      "sourceRole": {
                        "type": "string",
                        "enum": [
                          "production",
                          "test",
                          "unknown"
                        ]
                      },
                      "importUsage": {
                        "type": "string",
                        "enum": [
                          "value",
                          "type_only",
                          "unknown"
                        ]
                      }
                    },
                    "required": [
                      "from",
                      "to",
                      "kind",
                      "sourceRole",
                      "importUsage"
                    ],
                    "additionalProperties": false
                  }
                },
                "sourceEvidenceLimited": {
                  "type": "boolean"
                },
                "evidenceQualification": {
                  "type": "object",
                  "properties": {
                    "basis": {
                      "type": "string",
                      "enum": [
                        "whole_module_edge"
                      ]
                    },
                    "sourceRoleCounts": {
                      "type": "object",
                      "properties": {
                        "production": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "test": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "unknown": {
                          "type": "integer",
                          "minimum": 0
                        }
                      },
                      "required": [
                        "production",
                        "test",
                        "unknown"
                      ],
                      "additionalProperties": false
                    },
                    "importUsageCounts": {
                      "type": "object",
                      "properties": {
                        "value": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "type_only": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "unknown": {
                          "type": "integer",
                          "minimum": 0
                        }
                      },
                      "required": [
                        "value",
                        "type_only",
                        "unknown"
                      ],
                      "additionalProperties": false
                    },
                    "productValueCount": {
                      "type": "integer",
                      "minimum": 0
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "product_value_observed",
                        "product_value_not_observed"
                      ]
                    }
                  },
                  "required": [
                    "basis",
                    "sourceRoleCounts",
                    "importUsageCounts",
                    "productValueCount",
                    "status"
                  ],
                  "additionalProperties": false
                },
                "review": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "enum": [
                        "rationale_review_required"
                      ]
                    },
                    "writeAllowed": {
                      "type": "boolean",
                      "enum": [
                        false
                      ]
                    },
                    "required": {
                      "type": "array",
                      "minItems": 1,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                      }
                    },
                    "next": {
                      "type": "string",
                      "minLength": 1,
                      "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                    }
                  },
                  "required": [
                    "status",
                    "writeAllowed",
                    "required",
                    "next"
                  ],
                  "additionalProperties": false
                },
                "ref": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                },
                "via": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                }
              },
              "required": [
                "from",
                "to"
              ],
              "additionalProperties": false
            }
          },
          "inCodeMissingEndpointAbsent": {
            "type": "array",
            "description": "Import-backed review candidates whose from/to includes a slug not yet modelled as a vault node (`absentEndpoints`). Model endpoints, inspect evidence, supply semantic rationale, and obtain human approval before any relation write.",
            "items": {
              "type": "object",
              "properties": {
                "from": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                },
                "to": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                },
                "count": {
                  "type": "integer",
                  "minimum": 1
                },
                "absentEndpoints": {
                  "type": "array",
                  "maxItems": 2,
                  "uniqueItems": true,
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                  }
                },
                "sourceEvidence": {
                  "type": "array",
                  "maxItems": 5,
                  "items": {
                    "type": "object",
                    "properties": {
                      "from": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                      },
                      "to": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                      },
                      "kind": {
                        "type": "string",
                        "enum": [
                          "static",
                          "dynamic",
                          "require",
                          "reexport",
                          "side"
                        ]
                      },
                      "sourceRole": {
                        "type": "string",
                        "enum": [
                          "production",
                          "test",
                          "unknown"
                        ]
                      },
                      "importUsage": {
                        "type": "string",
                        "enum": [
                          "value",
                          "type_only",
                          "unknown"
                        ]
                      }
                    },
                    "required": [
                      "from",
                      "to",
                      "kind",
                      "sourceRole",
                      "importUsage"
                    ],
                    "additionalProperties": false
                  }
                },
                "sourceEvidenceLimited": {
                  "type": "boolean"
                },
                "evidenceQualification": {
                  "type": "object",
                  "properties": {
                    "basis": {
                      "type": "string",
                      "enum": [
                        "whole_module_edge"
                      ]
                    },
                    "sourceRoleCounts": {
                      "type": "object",
                      "properties": {
                        "production": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "test": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "unknown": {
                          "type": "integer",
                          "minimum": 0
                        }
                      },
                      "required": [
                        "production",
                        "test",
                        "unknown"
                      ],
                      "additionalProperties": false
                    },
                    "importUsageCounts": {
                      "type": "object",
                      "properties": {
                        "value": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "type_only": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "unknown": {
                          "type": "integer",
                          "minimum": 0
                        }
                      },
                      "required": [
                        "value",
                        "type_only",
                        "unknown"
                      ],
                      "additionalProperties": false
                    },
                    "productValueCount": {
                      "type": "integer",
                      "minimum": 0
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "product_value_observed",
                        "product_value_not_observed"
                      ]
                    }
                  },
                  "required": [
                    "basis",
                    "sourceRoleCounts",
                    "importUsageCounts",
                    "productValueCount",
                    "status"
                  ],
                  "additionalProperties": false
                },
                "review": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "enum": [
                        "rationale_review_required"
                      ]
                    },
                    "writeAllowed": {
                      "type": "boolean",
                      "enum": [
                        false
                      ]
                    },
                    "required": {
                      "type": "array",
                      "minItems": 1,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                      }
                    },
                    "next": {
                      "type": "string",
                      "minLength": 1,
                      "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                    }
                  },
                  "required": [
                    "status",
                    "writeAllowed",
                    "required",
                    "next"
                  ],
                  "additionalProperties": false
                },
                "ref": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                },
                "via": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                }
              },
              "required": [
                "from",
                "to"
              ],
              "additionalProperties": false
            }
          },
          "inVaultNotInCode": {
            "type": "array",
            "description": "vault depends_on edges with no matching code import — possibly stale, review before removing.",
            "items": {
              "type": "object",
              "properties": {
                "from": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                },
                "to": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                },
                "count": {
                  "type": "integer",
                  "minimum": 1
                },
                "absentEndpoints": {
                  "type": "array",
                  "maxItems": 2,
                  "uniqueItems": true,
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                  }
                },
                "sourceEvidence": {
                  "type": "array",
                  "maxItems": 5,
                  "items": {
                    "type": "object",
                    "properties": {
                      "from": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                      },
                      "to": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                      },
                      "kind": {
                        "type": "string",
                        "enum": [
                          "static",
                          "dynamic",
                          "require",
                          "reexport",
                          "side"
                        ]
                      },
                      "sourceRole": {
                        "type": "string",
                        "enum": [
                          "production",
                          "test",
                          "unknown"
                        ]
                      },
                      "importUsage": {
                        "type": "string",
                        "enum": [
                          "value",
                          "type_only",
                          "unknown"
                        ]
                      }
                    },
                    "required": [
                      "from",
                      "to",
                      "kind",
                      "sourceRole",
                      "importUsage"
                    ],
                    "additionalProperties": false
                  }
                },
                "sourceEvidenceLimited": {
                  "type": "boolean"
                },
                "evidenceQualification": {
                  "type": "object",
                  "properties": {
                    "basis": {
                      "type": "string",
                      "enum": [
                        "whole_module_edge"
                      ]
                    },
                    "sourceRoleCounts": {
                      "type": "object",
                      "properties": {
                        "production": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "test": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "unknown": {
                          "type": "integer",
                          "minimum": 0
                        }
                      },
                      "required": [
                        "production",
                        "test",
                        "unknown"
                      ],
                      "additionalProperties": false
                    },
                    "importUsageCounts": {
                      "type": "object",
                      "properties": {
                        "value": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "type_only": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "unknown": {
                          "type": "integer",
                          "minimum": 0
                        }
                      },
                      "required": [
                        "value",
                        "type_only",
                        "unknown"
                      ],
                      "additionalProperties": false
                    },
                    "productValueCount": {
                      "type": "integer",
                      "minimum": 0
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "product_value_observed",
                        "product_value_not_observed"
                      ]
                    }
                  },
                  "required": [
                    "basis",
                    "sourceRoleCounts",
                    "importUsageCounts",
                    "productValueCount",
                    "status"
                  ],
                  "additionalProperties": false
                },
                "review": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "enum": [
                        "rationale_review_required"
                      ]
                    },
                    "writeAllowed": {
                      "type": "boolean",
                      "enum": [
                        false
                      ]
                    },
                    "required": {
                      "type": "array",
                      "minItems": 1,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                      }
                    },
                    "next": {
                      "type": "string",
                      "minLength": 1,
                      "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                    }
                  },
                  "required": [
                    "status",
                    "writeAllowed",
                    "required",
                    "next"
                  ],
                  "additionalProperties": false
                },
                "ref": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                },
                "via": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                }
              },
              "required": [
                "from",
                "to"
              ],
              "additionalProperties": false
            }
          }
        }
      },
      "reconciliationSummary": {
        "type": "object",
        "properties": {
          "inBoth": {
            "type": "integer",
            "minimum": 0
          },
          "inCodeMissingFromVault": {
            "type": "integer",
            "minimum": 0
          },
          "inCodeMissingEndpointAbsent": {
            "type": "integer",
            "minimum": 0
          },
          "inVaultNotInCode": {
            "type": "integer",
            "minimum": 0
          },
          "unresolvedImports": {
            "type": "integer",
            "minimum": 0
          },
          "hint": {
            "type": "string"
          }
        },
        "required": [
          "inBoth",
          "inCodeMissingFromVault",
          "inCodeMissingEndpointAbsent",
          "inVaultNotInCode",
          "unresolvedImports",
          "hint"
        ],
        "additionalProperties": false
      },
      "contract": {
        "type": "string",
        "enum": [
          "inferImportsReview:v1",
          "inferImportsFocus:v1"
        ]
      },
      "delivery": {
        "type": "object",
        "description": "Present only when omitted reviewMode was automatically compacted because the estimated full MCP result exceeded the safe delivery boundary.",
        "properties": {
          "selection": {
            "type": "string",
            "enum": [
              "automatic_compact"
            ]
          },
          "reason": {
            "type": "string",
            "enum": [
              "estimated_full_response_exceeds_limit"
            ]
          },
          "estimatedFullResponseBytes": {
            "type": "integer",
            "minimum": 1
          },
          "automaticLimitBytes": {
            "type": "integer",
            "enum": [
              131072
            ]
          },
          "explicitFullAvailable": {
            "type": "boolean",
            "enum": [
              true
            ]
          },
          "explicitFullArguments": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "reviewMode": {
                "type": "string",
                "enum": [
                  "full"
                ]
              },
              "allowLargeResponse": {
                "type": "boolean",
                "enum": [
                  true
                ]
              }
            },
            "required": [
              "reviewMode",
              "allowLargeResponse"
            ]
          }
        },
        "required": [
          "selection",
          "reason",
          "estimatedFullResponseBytes",
          "automaticLimitBytes",
          "explicitFullAvailable",
          "explicitFullArguments"
        ],
        "additionalProperties": false
      },
      "scanSummary": {
        "type": "object",
        "properties": {
          "fileEdges": {
            "type": "integer",
            "minimum": 0
          },
          "externalImports": {
            "type": "integer",
            "minimum": 0
          },
          "unresolvedImports": {
            "type": "integer",
            "minimum": 0
          },
          "moduleEdges": {
            "type": "integer",
            "minimum": 0
          }
        },
        "required": [
          "fileEdges",
          "externalImports",
          "unresolvedImports",
          "moduleEdges"
        ],
        "additionalProperties": false
      },
      "reviewQueue": {
        "type": "object",
        "properties": {
          "total": {
            "type": "integer",
            "minimum": 0
          },
          "returned": {
            "type": "integer",
            "enum": [
              0,
              1
            ]
          },
          "exhausted": {
            "type": "boolean"
          },
          "afterReviewId": {
            "type": [
              "string",
              "null"
            ]
          }
        },
        "required": [
          "total",
          "returned",
          "exhausted",
          "afterReviewId"
        ],
        "additionalProperties": false
      },
      "nextReview": {
        "type": [
          "object",
          "null"
        ],
        "properties": {
          "contract": {
            "type": "string",
            "enum": [
              "nextRelationReview:v1"
            ]
          },
          "reviewId": {
            "type": "string",
            "minLength": 1,
            "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
          },
          "status": {
            "type": "string",
            "enum": [
              "rationale_review_required"
            ]
          },
          "writeAllowed": {
            "type": "boolean",
            "enum": [
              false
            ]
          },
          "sourceQualification": {
            "type": "string",
            "enum": [
              "observed_this_call_not_relation_receipt"
            ]
          },
          "ordering": {
            "type": "object",
            "properties": {
              "basis": {
                "type": "string",
                "enum": [
                  "canonical_from_to"
                ]
              },
              "meaningConfidence": {
                "type": "boolean",
                "enum": [
                  false
                ]
              },
              "note": {
                "type": "string",
                "minLength": 1,
                "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
              }
            },
            "required": [
              "basis",
              "meaningConfidence",
              "note"
            ],
            "additionalProperties": false
          },
          "candidate": {
            "type": "object",
            "properties": {
              "from": {
                "type": "string",
                "minLength": 1,
                "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
              },
              "to": {
                "type": "string",
                "minLength": 1,
                "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
              },
              "relationType": {
                "type": "string",
                "enum": [
                  "depends_on"
                ]
              },
              "absentEndpoints": {
                "type": "array",
                "maxItems": 2,
                "uniqueItems": true,
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                }
              },
              "importCount": {
                "type": "integer",
                "minimum": 0
              },
              "sourceEvidence": {
                "type": "array",
                "maxItems": 5,
                "items": {
                  "type": "object",
                  "properties": {
                    "from": {
                      "type": "string",
                      "minLength": 1,
                      "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                    },
                    "to": {
                      "type": "string",
                      "minLength": 1,
                      "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                    },
                    "kind": {
                      "type": "string",
                      "enum": [
                        "static",
                        "dynamic",
                        "require",
                        "reexport",
                        "side"
                      ]
                    },
                    "sourceRole": {
                      "type": "string",
                      "enum": [
                        "production",
                        "test",
                        "unknown"
                      ]
                    },
                    "importUsage": {
                      "type": "string",
                      "enum": [
                        "value",
                        "type_only",
                        "unknown"
                      ]
                    }
                  },
                  "required": [
                    "from",
                    "to",
                    "kind",
                    "sourceRole",
                    "importUsage"
                  ],
                  "additionalProperties": false
                }
              },
              "sourceEvidenceLimited": {
                "type": "boolean"
              },
              "evidenceQualification": {
                "type": "object",
                "properties": {
                  "basis": {
                    "type": "string",
                    "enum": [
                      "whole_module_edge"
                    ]
                  },
                  "sourceRoleCounts": {
                    "type": "object",
                    "properties": {
                      "production": {
                        "type": "integer",
                        "minimum": 0
                      },
                      "test": {
                        "type": "integer",
                        "minimum": 0
                      },
                      "unknown": {
                        "type": "integer",
                        "minimum": 0
                      }
                    },
                    "required": [
                      "production",
                      "test",
                      "unknown"
                    ],
                    "additionalProperties": false
                  },
                  "importUsageCounts": {
                    "type": "object",
                    "properties": {
                      "value": {
                        "type": "integer",
                        "minimum": 0
                      },
                      "type_only": {
                        "type": "integer",
                        "minimum": 0
                      },
                      "unknown": {
                        "type": "integer",
                        "minimum": 0
                      }
                    },
                    "required": [
                      "value",
                      "type_only",
                      "unknown"
                    ],
                    "additionalProperties": false
                  },
                  "productValueCount": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "status": {
                    "type": "string",
                    "enum": [
                      "product_value_observed",
                      "product_value_not_observed"
                    ]
                  }
                },
                "required": [
                  "basis",
                  "sourceRoleCounts",
                  "importUsageCounts",
                  "productValueCount",
                  "status"
                ],
                "additionalProperties": false
              }
            },
            "required": [
              "from",
              "to",
              "relationType",
              "absentEndpoints",
              "importCount",
              "sourceEvidence",
              "sourceEvidenceLimited",
              "evidenceQualification"
            ],
            "additionalProperties": false
          },
          "endpointModelling": {
            "type": [
              "object",
              "null"
            ],
            "properties": {
              "status": {
                "type": "string",
                "enum": [
                  "required_before_relation_review"
                ]
              },
              "writeAllowed": {
                "type": "boolean",
                "enum": [
                  false
                ]
              },
              "absentEndpoints": {
                "type": "array",
                "minItems": 1,
                "maxItems": 2,
                "uniqueItems": true,
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                }
              },
              "observedPathsByEndpoint": {
                "type": "array",
                "minItems": 1,
                "maxItems": 2,
                "items": {
                  "type": "object",
                  "properties": {
                    "endpoint": {
                      "type": "string",
                      "minLength": 1,
                      "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                    },
                    "paths": {
                      "type": "array",
                      "uniqueItems": true,
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                      }
                    }
                  },
                  "required": [
                    "endpoint",
                    "paths"
                  ],
                  "additionalProperties": false
                }
              },
              "analysisCall": {
                "type": "object",
                "properties": {
                  "tool": {
                    "type": "string",
                    "enum": [
                      "analyze_repo_structure"
                    ]
                  },
                  "arguments": {
                    "type": "object",
                    "properties": {
                      "rootPath": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                      }
                    },
                    "required": [
                      "rootPath"
                    ],
                    "additionalProperties": false
                  },
                  "purpose": {
                    "type": "string",
                    "minLength": 1,
                    "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                  }
                },
                "required": [
                  "tool",
                  "arguments",
                  "purpose"
                ],
                "additionalProperties": false
              },
              "proposalValidation": {
                "type": "object",
                "properties": {
                  "tool": {
                    "type": "string",
                    "enum": [
                      "analyze_repo_structure"
                    ]
                  },
                  "requiredArguments": {
                    "type": "array",
                    "minItems": 2,
                    "maxItems": 2,
                    "uniqueItems": true,
                    "items": {
                      "type": "string",
                      "enum": [
                        "rootPath",
                        "proposal"
                      ]
                    }
                  },
                  "requiredProposalFields": {
                    "type": "array",
                    "minItems": 6,
                    "maxItems": 6,
                    "uniqueItems": true,
                    "items": {
                      "type": "string",
                      "enum": [
                        "project",
                        "domains",
                        "capabilities",
                        "elements",
                        "relations",
                        "competencyAnswers"
                      ]
                    }
                  },
                  "fieldsAfterKindDecision": {
                    "type": "object",
                    "properties": {
                      "common": {
                        "type": "array",
                        "minItems": 5,
                        "maxItems": 5,
                        "uniqueItems": true,
                        "items": {
                          "type": "string",
                          "enum": [
                            "slug",
                            "title",
                            "definition",
                            "evidence",
                            "confidence"
                          ]
                        }
                      },
                      "byKind": {
                        "type": "object",
                        "properties": {
                          "project": {
                            "type": "array",
                            "maxItems": 0
                          },
                          "domain": {
                            "type": "array",
                            "maxItems": 0
                          },
                          "capability": {
                            "type": "array",
                            "minItems": 1,
                            "maxItems": 1,
                            "items": {
                              "type": "string",
                              "enum": [
                                "domain"
                              ]
                            }
                          },
                          "element": {
                            "type": "array",
                            "minItems": 2,
                            "maxItems": 2,
                            "uniqueItems": true,
                            "items": {
                              "type": "string",
                              "enum": [
                                "domain",
                                "path"
                              ]
                            }
                          }
                        },
                        "required": [
                          "project",
                          "domain",
                          "capability",
                          "element"
                        ],
                        "additionalProperties": false
                      }
                    },
                    "required": [
                      "common",
                      "byKind"
                    ],
                    "additionalProperties": false
                  },
                  "endpointDrafts": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 2,
                    "items": {
                      "type": "object",
                      "properties": {
                        "endpoint": {
                          "type": "string",
                          "minLength": 1,
                          "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                        },
                        "observedPaths": {
                          "type": "array",
                          "uniqueItems": true,
                          "items": {
                            "type": "string",
                            "minLength": 1,
                            "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                          }
                        },
                        "slugCandidate": {
                          "type": "string",
                          "minLength": 1,
                          "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                        },
                        "kindDecision": {
                          "type": "string",
                          "enum": [
                            "human_meaning_required"
                          ]
                        }
                      },
                      "required": [
                        "endpoint",
                        "observedPaths",
                        "slugCandidate",
                        "kindDecision"
                      ],
                      "additionalProperties": false
                    }
                  },
                  "purpose": {
                    "type": "string",
                    "minLength": 1,
                    "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                  }
                },
                "required": [
                  "tool",
                  "requiredArguments",
                  "requiredProposalFields",
                  "fieldsAfterKindDecision",
                  "endpointDrafts",
                  "purpose"
                ],
                "additionalProperties": false
              },
              "resumeCall": {
                "type": "object",
                "properties": {
                  "tool": {
                    "type": "string",
                    "enum": [
                      "infer_imports"
                    ]
                  },
                  "arguments": {
                    "type": "object",
                    "properties": {
                      "rootPath": {
                        "type": "string",
                        "minLength": 1,
                        "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                      },
                      "reviewMode": {
                        "type": "string",
                        "enum": [
                          "next"
                        ]
                      }
                    },
                    "required": [
                      "rootPath",
                      "reviewMode"
                    ],
                    "additionalProperties": false
                  },
                  "purpose": {
                    "type": "string",
                    "minLength": 1,
                    "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                  }
                },
                "required": [
                  "tool",
                  "arguments",
                  "purpose"
                ],
                "additionalProperties": false
              }
            },
            "required": [
              "status",
              "writeAllowed",
              "absentEndpoints",
              "observedPathsByEndpoint",
              "analysisCall",
              "proposalValidation",
              "resumeCall"
            ],
            "additionalProperties": false
          },
          "nextCalls": {
            "type": "array",
            "minItems": 0,
            "maxItems": 2,
            "items": {
              "type": "object",
              "properties": {
                "tool": {
                  "type": "string",
                  "enum": [
                    "get_concepts",
                    "query_ontology"
                  ]
                },
                "arguments": {
                  "type": "object",
                  "additionalProperties": true
                },
                "purpose": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                }
              },
              "required": [
                "tool",
                "arguments",
                "purpose"
              ],
              "additionalProperties": false
            }
          },
          "decision": {
            "type": "object",
            "properties": {
              "questionEligibility": {
                "type": "string",
                "enum": [
                  "blocked_missing_vault_endpoints",
                  "eligible_after_semantic_review",
                  "additional_product_meaning_evidence_required"
                ]
              },
              "required": {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                },
                "minItems": 1
              },
              "ask": {
                "type": "string",
                "minLength": 1,
                "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
              },
              "stopWhen": {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                },
                "minItems": 1
              }
            },
            "required": [
              "questionEligibility",
              "required",
              "ask",
              "stopWhen"
            ],
            "additionalProperties": false
          },
          "cursor": {
            "type": "object",
            "properties": {
              "afterReviewId": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "total": {
                "type": "integer",
                "minimum": 1
              },
              "remaining": {
                "type": "integer",
                "minimum": 0
              },
              "hasMore": {
                "type": "boolean"
              },
              "nextAfterReviewId": {
                "type": "string",
                "minLength": 1,
                "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
              }
            },
            "required": [
              "afterReviewId",
              "total",
              "remaining",
              "hasMore",
              "nextAfterReviewId"
            ],
            "additionalProperties": false
          }
        },
        "required": [
          "contract",
          "reviewId",
          "status",
          "writeAllowed",
          "sourceQualification",
          "ordering",
          "candidate",
          "endpointModelling",
          "nextCalls",
          "decision",
          "cursor"
        ],
        "additionalProperties": false
      },
      "focusReview": {
        "type": "object",
        "properties": {
          "contract": {
            "type": "string",
            "enum": [
              "importImpactFocus:v1"
            ]
          },
          "focusPath": {
            "type": "string",
            "minLength": 1,
            "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
          },
          "direction": {
            "type": "string",
            "enum": [
              "incoming",
              "outgoing",
              "both"
            ]
          },
          "sourceQualification": {
            "type": "string",
            "enum": [
              "observed_static_imports_not_runtime_or_semantic_impact"
            ]
          },
          "writeAllowed": {
            "type": "boolean",
            "enum": [
              false
            ]
          },
          "summary": {
            "type": "object",
            "properties": {
              "incoming": {
                "type": "integer",
                "minimum": 0
              },
              "outgoing": {
                "type": "integer",
                "minimum": 0
              },
              "selected": {
                "type": "integer",
                "minimum": 0
              },
              "returned": {
                "type": "integer",
                "minimum": 0,
                "maximum": 100
              },
              "limited": {
                "type": "boolean"
              }
            },
            "required": [
              "incoming",
              "outgoing",
              "selected",
              "returned",
              "limited"
            ],
            "additionalProperties": false
          },
          "edges": {
            "type": "array",
            "maxItems": 100,
            "items": {
              "type": "object",
              "properties": {
                "edgeId": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                },
                "from": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                },
                "to": {
                  "type": "string",
                  "minLength": 1,
                  "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
                },
                "kind": {
                  "type": "string",
                  "enum": [
                    "static",
                    "dynamic",
                    "require",
                    "reexport",
                    "side"
                  ]
                },
                "sourceRole": {
                  "type": "string",
                  "enum": [
                    "production",
                    "test",
                    "unknown"
                  ]
                },
                "importUsage": {
                  "type": "string",
                  "enum": [
                    "value",
                    "type_only",
                    "unknown"
                  ]
                }
              },
              "required": [
                "edgeId",
                "from",
                "to",
                "kind",
                "sourceRole",
                "importUsage"
              ],
              "additionalProperties": false
            }
          },
          "cursor": {
            "type": "object",
            "properties": {
              "afterEdgeId": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "total": {
                "type": "integer",
                "minimum": 0
              },
              "remaining": {
                "type": "integer",
                "minimum": 0
              },
              "hasMore": {
                "type": "boolean"
              },
              "nextAfterEdgeId": {
                "type": [
                  "string",
                  "null"
                ]
              }
            },
            "required": [
              "afterEdgeId",
              "total",
              "remaining",
              "hasMore",
              "nextAfterEdgeId"
            ],
            "additionalProperties": false
          },
          "interpretation": {
            "type": "string",
            "minLength": 1,
            "pattern": "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$"
          }
        },
        "required": [
          "contract",
          "focusPath",
          "direction",
          "sourceQualification",
          "writeAllowed",
          "summary",
          "edges",
          "cursor",
          "interpretation"
        ],
        "additionalProperties": false
      }
    },
    "required": [
      "rootPath",
      "filesScanned",
      "coverage"
    ],
    "oneOf": [
      {
        "required": [
          "edges",
          "externalImports",
          "unresolved",
          "moduleEdges"
        ]
      },
      {
        "required": [
          "contract",
          "scanSummary",
          "reconciliationSummary",
          "reviewQueue",
          "nextReview"
        ]
      },
      {
        "required": [
          "contract",
          "scanSummary",
          "focusReview"
        ]
      }
    ],
    "additionalProperties": false
  }
};
        tool.description = realInferImports.description;
        tool.inputSchema = realInferImports.inputSchema;
        tool.outputSchema = realInferImports.outputSchema;
      }
      if (name === "get_concepts") {
        // 실서버는 top-level required/oneOf 를 지웠다 — 런타임 exactly-one 강제.
        tool.inputSchema.properties.slugs = {
          ...tool.inputSchema.properties.slugs,
          type: "array",
          maxItems: 50,
        };
      }
      if (name === "add_concepts") {
        tool.description += " Batch rows isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels, single unknown-field rows include `receivedField` plus one-row `unknownFields`, multi unknown-field rows report every unknown field with nearest hints and Received fields, and duplicate input slugs report the later concepts[n] row plus first-seen `concepts[m]` with structured `rowName` / `firstSeenAt`. Invalid-only batches return no row-level write metadata and no top-level `postWriteMaintenance`.";
        tool.inputSchema.required = ["concepts"];
        tool.inputSchema.properties.concepts = { type: "array", maxItems: 50 };
        tool.outputSchema = {
          type: "object",
          required: ["concepts"],
          properties: {
            concepts: {
              type: "array",
              items: {
                type: "object",
                required: ["slug", "ok"],
                properties: {
                  slug: { type: "string" },
                  ok: { type: "boolean" },
                  filePath: { type: "string" },
                  changed: { type: "boolean" },
                  warnings: { type: "array", items: { type: "string" } },
                  error: { type: "string" },
                  errorCode: { type: "string" },
                  valueName: { type: "string" },
                  suggestion: { type: "string" },
                  rowName: { type: "string" },
                  receivedField: { type: "string" },
                  unknownFields: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["name"],
                      properties: {
                        name: { type: "string" },
                        suggestion: { type: "string" },
                      },
                      additionalProperties: false,
                    },
                  },
                  allowedFields: { type: "array", items: { type: "string" } },
                  receivedFields: { type: "array", items: { type: "string" } },
                  conflictSubject: { type: "string" },
                  conflictSlug: { type: "string" },
                  firstSeenAt: { type: "string" },
                  receivedValue: { type: "string" },
                  allowedValues: { type: "array", items: { type: "string" } },
                  recoveryTools: { type: "array", items: { type: "string" } },
                  avoidTools: { type: "array", items: { type: "string" } },
                },
                additionalProperties: false,
              },
            },
            postWriteMaintenance: postWriteMaintenanceSchemaFixture(),
          },
          additionalProperties: false,
        };
      }
      if (name === "add_concept") {
        tool.outputSchema = {
          type: "object",
          required: ["ok", "slug", "filePath", "changed"],
          properties: {
            ok: { type: "boolean" },
            slug: { type: "string" },
            filePath: { type: "string" },
            changed: { type: "boolean" },
            warnings: { type: "array", items: { type: "string" } },
            postWriteMaintenance: postWriteMaintenanceSchemaFixture(),
          },
          additionalProperties: false,
        };
      }
      if (name === "add_relations") {
        tool.description += " Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`; unknown type rows include a closest-value hint with structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`; single unknown-field rows include `receivedField` plus one-row `unknownFields`; multi unknown-field rows report every unknown field with nearest hints, `allowedFields`, `receivedFields`, and Received fields. Invalid-only batches return no row-level `changed` / `alreadyExists` write metadata and no top-level `postWriteMaintenance`.";
        tool.inputSchema.required = ["relations"];
        tool.inputSchema.properties.relations = {
          type: "array",
          maxItems: 50,
          items: {
            properties: {
              type: {
                type: "string",
                enum: WRITE_RELATION_TYPE_VALUES,
              },
              expected_mtime: { type: "number", minimum: 0 },
            },
          },
        };
        tool.outputSchema = {
          type: "object",
          required: ["relations"],
          properties: {
            relations: {
              type: "array",
              items: {
                type: "object",
                required: ["ok", "from", "to", "type"],
                properties: {
                  ok: { type: "boolean" },
                  from: { type: "string" },
                  to: { type: "string" },
                  type: { type: "string" },
                  alreadyExists: { type: "boolean" },
                  key: { type: "string" },
                  changed: { type: "boolean" },
                  error: { type: "string" },
                  errorCode: { type: "string" },
                  valueName: { type: "string" },
                  receivedValue: { type: "string" },
                  suggestion: { type: "string" },
                  rowName: { type: "string" },
                  receivedField: { type: "string" },
                  unknownFields: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["name"],
                      properties: {
                        name: { type: "string" },
                        suggestion: { type: "string" },
                      },
                      additionalProperties: false,
                    },
                  },
                  allowedValues: { type: "array", items: { type: "string" } },
                  allowedFields: { type: "array", items: { type: "string" } },
                  receivedFields: { type: "array", items: { type: "string" } },
                  missingSubject: { type: "string" },
                  missingSlug: { type: "string" },
                  similarSlugs: { type: "array", items: { type: "string" } },
                  recoveryTools: { type: "array", items: { type: "string" } },
                  createTool: { type: "string" },
                },
                additionalProperties: false,
              },
            },
            postWriteMaintenance: postWriteMaintenanceSchemaFixture(),
          },
          additionalProperties: false,
        };
      }
      if (name === "add_relation") {
        tool.description += " Invalid relation `type` is rejected before endpoint slug resolution with a closest-value hint and structured `valueName` / `receivedValue` / `suggestion` / `allowedValues` repair fields, with no `changed`, `alreadyExists`, or `postWriteMaintenance` write metadata.";
        tool.inputSchema.properties.type = {
          type: "string",
          enum: WRITE_RELATION_TYPE_VALUES,
        };
        tool.inputSchema.properties.why = {
          type: "string",
          maxLength: 300,
        };
        tool.outputSchema = {
          type: "object",
          required: ["ok", "from", "to", "type"],
          properties: {
            ok: { type: "boolean" },
            from: { type: "string" },
            to: { type: "string" },
            type: { type: "string" },
            key: { type: "string" },
            changed: { type: "boolean" },
            alreadyExists: { type: "boolean" },
            postWriteMaintenance: postWriteMaintenanceSchemaFixture(),
          },
          additionalProperties: false,
        };
      }
      if (name === "patch_concept") {
        tool.outputSchema = {
          type: "object",
          required: ["ok", "slug", "filePath", "changed", "postWriteMaintenance"],
          properties: {
            ok: { type: "boolean" },
            slug: { type: "string" },
            filePath: { type: "string" },
            changed: { type: "boolean" },
            postWriteMaintenance: postWriteMaintenanceSchemaFixture(),
          },
          additionalProperties: false,
        };
      }
      if (["add_relation", "patch_concept", "rename_concept", "merge_concepts", "delete_concept"].includes(name)) {
        tool.inputSchema.properties.expected_mtime = { type: "number", minimum: 0 };
      }
      if (name === "merge_concepts") {
        tool.inputSchema.properties.expected_into_mtime = { type: "number", minimum: 0 };
      }
      if (["rename_concept", "merge_concepts", "delete_concept"].includes(name)) {
        tool.inputSchema.properties.confirm = { type: "boolean" };
      }
      if (name === "absorb_document") {
        tool.inputSchema.properties.allowOutsideRepo = { type: "boolean" };
      }
      if (name === "rename_concept") {
        tool.inputSchema.properties.overwrite = { type: "boolean" };
        tool.outputSchema = {
          type: "object",
          required: ["ok", "dryRun", "previewReady", "canConfirm", "wouldChange", "blockedReasons", "uid", "oldSlug", "newSlug", "sourcePath", "targetPath", "moved", "backlinkUpdates"],
          properties: {
            ok: { type: "boolean" },
            dryRun: { type: "boolean" },
            previewReady: { type: "boolean" },
            canConfirm: { type: "boolean" },
            wouldChange: { type: "boolean" },
            blockedReasons: { type: "array", items: nonBlankStringSchemaFixture() },
            uid: {
              type: "string",
              pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
            },
            oldSlug: { type: "string" },
            newSlug: { type: "string" },
            sourcePath: { type: "string" },
            targetPath: { type: "string" },
            moved: { type: "boolean" },
            backlinkUpdates: backlinkRewritePlanSchemaFixture(),
            message: { type: "string" },
            changed: { type: "boolean" },
            postWriteMaintenance: postWriteMaintenanceSchemaFixture(),
          },
          additionalProperties: false,
        };
      }
      if (name === "merge_concepts") {
        tool.outputSchema = {
          type: "object",
          required: ["ok", "dryRun", "previewReady", "canConfirm", "wouldChange", "blockedReasons", "fromUid", "intoUid", "absorbedUids", "fromSlug", "intoSlug", "fromPath", "deleted", "backlinkUpdates", "capturedFrom"],
          properties: {
            ok: { type: "boolean" },
            dryRun: { type: "boolean" },
            previewReady: { type: "boolean" },
            canConfirm: { type: "boolean" },
            wouldChange: { type: "boolean" },
            blockedReasons: { type: "array", items: nonBlankStringSchemaFixture() },
            fromUid: {
              type: "string",
              pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
            },
            intoUid: {
              type: "string",
              pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
            },
            absorbedUids: {
              type: "array",
              items: {
                type: "string",
                pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
              },
            },
            fromSlug: { type: "string" },
            intoSlug: { type: "string" },
            fromPath: { type: "string" },
            deleted: { type: "boolean" },
            backlinkUpdates: backlinkRewritePlanSchemaFixture(),
            capturedFrom: capturedDocSchemaFixture(),
            message: { type: "string" },
            changed: { type: "boolean" },
            postWriteMaintenance: postWriteMaintenanceSchemaFixture(),
          },
          additionalProperties: false,
        };
      }
      if (name === "delete_concept") {
        tool.inputSchema.properties.force = { type: "boolean" };
        tool.outputSchema = {
          type: "object",
          required: ["ok", "dryRun", "previewReady", "canConfirm", "wouldChange", "blockedReasons", "uid", "slug", "filePath"],
          properties: {
            ok: { type: "boolean" },
            dryRun: { type: "boolean" },
            previewReady: { type: "boolean" },
            canConfirm: { type: "boolean" },
            wouldChange: { type: "boolean" },
            blockedReasons: { type: "array", items: nonBlankStringSchemaFixture() },
            uid: {
              type: "string",
              pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
            },
            slug: nonBlankStringSchemaFixture(),
            filePath: nonBlankStringSchemaFixture(),
            backlinks: { type: "array", items: backlinkRowSchemaFixture() },
            message: nonBlankStringSchemaFixture(),
            forced: { type: "boolean" },
            backlinksAtDelete: { type: "array", items: backlinkRowSchemaFixture() },
            changed: { type: "boolean" },
            captured: capturedDocSchemaFixture(),
            postWriteMaintenance: postWriteMaintenanceSchemaFixture(),
          },
          additionalProperties: false,
        };
      }
      if (EXPECTED_DESTRUCTIVE_TOOLS.includes(name) && !tool.outputSchema) {
        tool.outputSchema = {
          type: "object",
          required: ["previewReady", "canConfirm", "wouldChange", "blockedReasons"],
          properties: {
            previewReady: { type: "boolean" },
            canConfirm: { type: "boolean" },
            wouldChange: { type: "boolean" },
            blockedReasons: { type: "array", items: nonBlankStringSchemaFixture() },
          },
          additionalProperties: false,
        };
      }
      return tool;
    }),
  };
}

export function batchCapError(noun) {
  const text = `Too many ${noun}: 51. Max 50 per call.`;
  return {
    result: {
      isError: true,
      content: [{ text }],
      structuredContent: { ok: false, errorCode: "invalid_arguments", error: text },
    },
  };
}

export function strictValueErrorResponse(valueName, allowedValues, receivedValue, suggestion) {
  const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : "";
  const text = `${valueName} must be one of: ${allowedValues.join(", ")}. Received: "${receivedValue}".${suggestionText}`;
  return {
    result: {
      isError: true,
      content: [{ text }],
      structuredContent: {
        ok: false,
        errorCode: "invalid_arguments",
        error: text,
        valueName,
        receivedValue,
        ...(suggestion ? { suggestion } : {}),
        allowedValues,
      },
    },
  };
}

export const dogfoodTargets = {
  projectSlug: "project",
  domainSlug: "domains/ai-agent-partner",
  capabilitySlug: "capabilities/mcp-server",
  capabilityTitle: "MCP Server",
  mergeTargetSlug: "capabilities/vault-validator",
  pathTargetSlug: "domains/vault-local-first",
  patternStartSlug: "project",
  pattern: ["domains", "capabilities"],
  relationType: "domain",
  slugNeedle: "mcp",
  similarCandidateSlug: "capabilities/mcp-server-v2",
};

export const okShape = {
  targets: dogfoodTargets,
  initialize: makeDogfoodInitialize(),
  toolsList: makeDogfoodToolsList(),
  kinds: { total: 1, byKind: { project: 1 } },
  kindsStructured: { total: 1, byKind: { project: 1 } },
  list: {
    total: 1,
    vaultRoot: "/tmp/vault",
    nodes: [{ uid: DOGFOOD_UID, slug: "project", kind: "project", title: "Project", mtime: 1 }],
    pagination: { offset: 0, limit: 500, total: 1, returned: 1, hasMore: false, nextOffset: null },
  },
  listStructured: {
    total: 1,
    vaultRoot: "/tmp/vault",
    nodes: [{ uid: DOGFOOD_UID, slug: "project", kind: "project", title: "Project", mtime: 1 }],
    pagination: { offset: 0, limit: 500, total: 1, returned: 1, hasMore: false, nextOffset: null },
  },
  projectProbe: {
    total: 1,
    vaultRoot: "/tmp/vault",
    nodes: [{ uid: DOGFOOD_UID, slug: "project", kind: "project", title: "Project", mtime: 1 }],
    pagination: { offset: 0, limit: 500, total: 1, returned: 1, hasMore: false, nextOffset: null },
  },
  projectProbeStructured: {
    total: 1,
    vaultRoot: "/tmp/vault",
    nodes: [{ uid: DOGFOOD_UID, slug: "project", kind: "project", title: "Project", mtime: 1 }],
    pagination: { offset: 0, limit: 500, total: 1, returned: 1, hasMore: false, nextOffset: null },
  },
  batch: {
    concepts: [
      {
        ok: true,
        uid: DOGFOOD_UID,
        slug: "project",
        frontmatter: { kind: "project", title: "Project" },
        excerpt: "Project excerpt",
        mtime: 1,
      },
      {
        ok: true,
        uid: DOGFOOD_UID,
        slug: "capabilities/mcp-server",
        frontmatter: { kind: "capability", title: "MCP Server" },
        excerpt: "MCP Server excerpt",
        mtime: 1,
      },
      {
        ok: false,
        slug: "missing-dogfood-slug",
        error: "Doc not found: missing-dogfood-slug",
      },
    ],
  },
  batchStructured: {
    concepts: [
      {
        ok: true,
        uid: DOGFOOD_UID,
        slug: "project",
        frontmatter: { kind: "project", title: "Project" },
        excerpt: "Project excerpt",
        mtime: 1,
      },
      {
        ok: true,
        uid: DOGFOOD_UID,
        slug: "capabilities/mcp-server",
        frontmatter: { kind: "capability", title: "MCP Server" },
        excerpt: "MCP Server excerpt",
        mtime: 1,
      },
      {
        ok: false,
        slug: "missing-dogfood-slug",
        error: "Doc not found: missing-dogfood-slug",
      },
    ],
  },
  addConceptsRowRepair: {
    concepts: [
      { slug: "", ok: false, error: "concepts[0] must be an object", errorCode: "invalid_arguments" },
      {
        slug: "dogfood-row-repair-multi",
        ok: false,
        error: 'Unknown fields in concepts[1]: "titel" (did you mean "title"?), "domian" (did you mean "domain"?). Allowed fields: slug, kind, title, domain, capabilities, elements, path, body, labels. Received fields: domian, kind, slug, titel, title.',
        errorCode: "invalid_arguments",
        rowName: "concepts[1]",
        unknownFields: [
          { name: "titel", suggestion: "title" },
          { name: "domian", suggestion: "domain" },
        ],
        allowedFields: ["slug", "kind", "title", "domain", "capabilities", "elements", "path", "body", "labels"],
        receivedFields: ["domian", "kind", "slug", "titel", "title"],
      },
      {
        slug: "verify-duplicate-slug",
        ok: false,
        error: 'kind must be one of: project, domain, capability, element, document. Received: "capabilty". Did you mean "capability"?',
        errorCode: "invalid_arguments",
        valueName: "kind",
        receivedValue: "capabilty",
        suggestion: "capability",
        allowedValues: ["project", "domain", "capability", "element", "document"],
      },
      {
        slug: "verify-duplicate-slug",
        ok: false,
        error: "concepts[3] duplicate slug in input batch; first seen at concepts[2]",
        errorCode: "conflict",
        rowName: "concepts[3]",
        conflictSubject: "Duplicate slug in input batch",
        conflictSlug: "verify-duplicate-slug",
        firstSeenAt: "concepts[2]",
      },
      {
        slug: "dogfood-row-repair-single",
        ok: false,
        error: 'Unknown field "titel" in concepts[4]. Did you mean "title"? Allowed fields: slug, kind, title, domain, capabilities, elements, path, body, labels. Received fields: kind, slug, titel, title.',
        errorCode: "invalid_arguments",
        rowName: "concepts[4]",
        receivedField: "titel",
        suggestion: "title",
        unknownFields: [{ name: "titel", suggestion: "title" }],
        allowedFields: ["slug", "kind", "title", "domain", "capabilities", "elements", "path", "body", "labels"],
        receivedFields: ["kind", "slug", "titel", "title"],
      },
    ],
  },
  addConceptsRowRepairStructured: {
    concepts: [
      { slug: "", ok: false, error: "concepts[0] must be an object", errorCode: "invalid_arguments" },
      {
        slug: "dogfood-row-repair-multi",
        ok: false,
        error: 'Unknown fields in concepts[1]: "titel" (did you mean "title"?), "domian" (did you mean "domain"?). Allowed fields: slug, kind, title, domain, capabilities, elements, path, body, labels. Received fields: domian, kind, slug, titel, title.',
        errorCode: "invalid_arguments",
        rowName: "concepts[1]",
        unknownFields: [
          { name: "titel", suggestion: "title" },
          { name: "domian", suggestion: "domain" },
        ],
        allowedFields: ["slug", "kind", "title", "domain", "capabilities", "elements", "path", "body", "labels"],
        receivedFields: ["domian", "kind", "slug", "titel", "title"],
      },
      {
        slug: "verify-duplicate-slug",
        ok: false,
        error: 'kind must be one of: project, domain, capability, element, document. Received: "capabilty". Did you mean "capability"?',
        errorCode: "invalid_arguments",
        valueName: "kind",
        receivedValue: "capabilty",
        suggestion: "capability",
        allowedValues: ["project", "domain", "capability", "element", "document"],
      },
      {
        slug: "verify-duplicate-slug",
        ok: false,
        error: "concepts[3] duplicate slug in input batch; first seen at concepts[2]",
        errorCode: "conflict",
        rowName: "concepts[3]",
        conflictSubject: "Duplicate slug in input batch",
        conflictSlug: "verify-duplicate-slug",
        firstSeenAt: "concepts[2]",
      },
      {
        slug: "dogfood-row-repair-single",
        ok: false,
        error: 'Unknown field "titel" in concepts[4]. Did you mean "title"? Allowed fields: slug, kind, title, domain, capabilities, elements, path, body, labels. Received fields: kind, slug, titel, title.',
        errorCode: "invalid_arguments",
        rowName: "concepts[4]",
        receivedField: "titel",
        suggestion: "title",
        unknownFields: [{ name: "titel", suggestion: "title" }],
        allowedFields: ["slug", "kind", "title", "domain", "capabilities", "elements", "path", "body", "labels"],
        receivedFields: ["kind", "slug", "titel", "title"],
      },
    ],
  },
  addRelationsRowRepair: {
    relations: [
      { ok: false, from: "", to: "", type: "", error: "relations[0] must be an object", errorCode: "invalid_arguments" },
      {
        ok: false,
        from: "capabilities/mcp-server",
        to: "domains/ai-agent-partner",
        type: "relates",
        error: 'Unknown fields in relations[1]: "relation" (did you mean "type"?), "frm" (did you mean "from"?). Allowed fields: from, to, type, why, expected_mtime. Received fields: frm, from, relation, to, type.',
        errorCode: "invalid_arguments",
        rowName: "relations[1]",
        unknownFields: [
          { name: "relation", suggestion: "type" },
          { name: "frm", suggestion: "from" },
        ],
        allowedFields: ["from", "to", "type", "why", "expected_mtime"],
        receivedFields: ["frm", "from", "relation", "to", "type"],
      },
      {
        ok: false,
        from: "capabilities/mcp-server",
        to: "domains/ai-agent-partner",
        type: "depend_on",
        error: 'relations[2] type must be one of: depends_on, relates, contains, describes, domains, capabilities, elements, domain. Received: "depend_on". Did you mean "depends_on"?',
        errorCode: "invalid_arguments",
        valueName: "type",
        receivedValue: "depend_on",
        suggestion: "depends_on",
        allowedValues: WRITE_RELATION_TYPE_VALUES,
      },
      {
        ok: false,
        from: "capabilities/mcp-server",
        to: "domains/ai-agent-partner",
        type: "relates",
        error: 'Unknown field "relation" in relations[3]. Did you mean "type"? Allowed fields: from, to, type, why, expected_mtime. Received fields: from, relation, to, type.',
        errorCode: "invalid_arguments",
        rowName: "relations[3]",
        receivedField: "relation",
        suggestion: "type",
        unknownFields: [{ name: "relation", suggestion: "type" }],
        allowedFields: ["from", "to", "type", "why", "expected_mtime"],
        receivedFields: ["from", "relation", "to", "type"],
      },
    ],
  },
  addRelationsRowRepairStructured: {
    relations: [
      { ok: false, from: "", to: "", type: "", error: "relations[0] must be an object", errorCode: "invalid_arguments" },
      {
        ok: false,
        from: "capabilities/mcp-server",
        to: "domains/ai-agent-partner",
        type: "relates",
        error: 'Unknown fields in relations[1]: "relation" (did you mean "type"?), "frm" (did you mean "from"?). Allowed fields: from, to, type, why, expected_mtime. Received fields: frm, from, relation, to, type.',
        errorCode: "invalid_arguments",
        rowName: "relations[1]",
        unknownFields: [
          { name: "relation", suggestion: "type" },
          { name: "frm", suggestion: "from" },
        ],
        allowedFields: ["from", "to", "type", "why", "expected_mtime"],
        receivedFields: ["frm", "from", "relation", "to", "type"],
      },
      {
        ok: false,
        from: "capabilities/mcp-server",
        to: "domains/ai-agent-partner",
        type: "depend_on",
        error: 'relations[2] type must be one of: depends_on, relates, contains, describes, domains, capabilities, elements, domain. Received: "depend_on". Did you mean "depends_on"?',
        errorCode: "invalid_arguments",
        valueName: "type",
        receivedValue: "depend_on",
        suggestion: "depends_on",
        allowedValues: WRITE_RELATION_TYPE_VALUES,
      },
      {
        ok: false,
        from: "capabilities/mcp-server",
        to: "domains/ai-agent-partner",
        type: "relates",
        error: 'Unknown field "relation" in relations[3]. Did you mean "type"? Allowed fields: from, to, type, why, expected_mtime. Received fields: from, relation, to, type.',
        errorCode: "invalid_arguments",
        rowName: "relations[3]",
        receivedField: "relation",
        suggestion: "type",
        unknownFields: [{ name: "relation", suggestion: "type" }],
        allowedFields: ["from", "to", "type", "why", "expected_mtime"],
        receivedFields: ["from", "relation", "to", "type"],
      },
    ],
  },
  ev: { matches: [] },
  evStructured: { matches: [] },
  path: { found: true, hopCount: 1, hops: ["a", "b"], edges: [{ from: "a", to: "b", via: "relates" }] },
  pathStructured: { found: true, hopCount: 1, hops: ["a", "b"], edges: [{ from: "a", to: "b", via: "relates" }] },
  bl: {
    target: "capabilities/mcp-server",
    total: 1,
    matches: [{ slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" }],
  },
  blStructured: {
    target: "capabilities/mcp-server",
    total: 1,
    matches: [{ slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" }],
  },
  orph: { total: 0, orphans: [] },
  orphStructured: { total: 0, orphans: [] },
  queryConcepts: {
    filter: "kind=capability",
    parsedAs: "kind=capability",
    total: 1,
    matches: [{ slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server", mtime: 1 }],
    limited: false,
  },
  queryConceptsStructured: {
    filter: "kind=capability",
    parsedAs: "kind=capability",
    total: 1,
    matches: [{ slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server", mtime: 1 }],
    limited: false,
  },
  queryConceptsLimited: {
    filter: "slug!=project",
    parsedAs: "slug!=project",
    total: 1,
    matches: [{ slug: "README", kind: "vault-readme", title: "README", mtime: 1 }],
    limited: true,
  },
  queryConceptsLimitedStructured: {
    filter: "slug!=project",
    parsedAs: "slug!=project",
    total: 1,
    matches: [{ slug: "README", kind: "vault-readme", title: "README", mtime: 1 }],
    limited: true,
  },
  analyzedRepo: {
    rootPath: "/repo",
    framework: "fsd",
    project: { slug: "sample", title: "Sample" },
    domains: [{ slug: "domains/auth", title: "Auth", evidence: { source: "README.md", line: 3 } }],
    capabilities: [{ slug: "capabilities/auth", title: "Auth", evidence: { source: "src/features/auth" } }],
    elements: [{ slug: "elements/src/views/home", title: "Home", path: "src/views/home", evidence: { source: "src/views/home" } }],
    suggestedRelations: [{ from: "sample", to: "capabilities/auth", type: "contains" }],
    skipped: [{ path: "src/.cache", reason: "dotfile/ignore" }],
    configurationEvidence: rustConfigurationEvidenceFixture(),
  },
  analyzedRepoStructured: {
    rootPath: "/repo",
    framework: "fsd",
    project: { slug: "sample", title: "Sample" },
    domains: [{ slug: "domains/auth", title: "Auth", evidence: { source: "README.md", line: 3 } }],
    capabilities: [{ slug: "capabilities/auth", title: "Auth", evidence: { source: "src/features/auth" } }],
    elements: [{ slug: "elements/src/views/home", title: "Home", path: "src/views/home", evidence: { source: "src/views/home" } }],
    suggestedRelations: [{ from: "sample", to: "capabilities/auth", type: "contains" }],
    skipped: [{ path: "src/.cache", reason: "dotfile/ignore" }],
    configurationEvidence: rustConfigurationEvidenceFixture(),
  },
  inferredImports: {
    rootPath: "/repo",
    filesScanned: 2,
    edges: [{ from: "src/features/auth/index.ts", to: "src/entities/user/index.ts", kind: "static", sourceRole: "production", importUsage: "value" }],
    externalImports: [{ from: "src/features/auth/index.ts", spec: "zod" }],
    unresolved: [{ from: "src/features/auth/index.ts", spec: "@/missing", reason: "alias-not-found" }],
    coverage: importScanCoverageFixture(),
    moduleEdges: [{ from: "capabilities/auth", to: "capabilities/user", count: 1, kindCounts: { static: 1 }, sourceRoleCounts: { production: 1, test: 0, unknown: 0 }, importUsageCounts: { value: 1, type_only: 0, unknown: 0 }, productValueCount: 1, evidence: [{ from: "src/features/auth/index.ts", to: "src/entities/user/index.ts", kind: "static", sourceRole: "production", importUsage: "value" }], evidenceLimited: false }],
  },
  inferredImportsStructured: {
    rootPath: "/repo",
    filesScanned: 2,
    edges: [{ from: "src/features/auth/index.ts", to: "src/entities/user/index.ts", kind: "static", sourceRole: "production", importUsage: "value" }],
    externalImports: [{ from: "src/features/auth/index.ts", spec: "zod" }],
    unresolved: [{ from: "src/features/auth/index.ts", spec: "@/missing", reason: "alias-not-found" }],
    coverage: importScanCoverageFixture(),
    moduleEdges: [{ from: "capabilities/auth", to: "capabilities/user", count: 1, kindCounts: { static: 1 }, sourceRoleCounts: { production: 1, test: 0, unknown: 0 }, importUsageCounts: { value: 1, type_only: 0, unknown: 0 }, productValueCount: 1, evidence: [{ from: "src/features/auth/index.ts", to: "src/entities/user/index.ts", kind: "static", sourceRole: "production", importUsage: "value" }], evidenceLimited: false }],
  },
  renameDryRunRes: {
    result: {
      content: [
        {
          text: JSON.stringify({
            ok: false,
            dryRun: true,
            previewReady: true,
            canConfirm: true,
            wouldChange: true,
            blockedReasons: [],
            oldSlug: "capabilities/mcp-server",
            newSlug: "capabilities/mcp-server-dogfood-dry-run",
            sourcePath: "/tmp/vault/capabilities/mcp-server.md",
            targetPath: "/tmp/vault/capabilities/mcp-server-dogfood-dry-run.md",
            moved: false,
            backlinkUpdates: { updates: [], totalUpdated: 0 },
            message: "dry-run — confirm:true to apply",
          }),
        },
      ],
      structuredContent: {
        ok: false,
        dryRun: true,
        previewReady: true,
        canConfirm: true,
        wouldChange: true,
        blockedReasons: [],
        oldSlug: "capabilities/mcp-server",
        newSlug: "capabilities/mcp-server-dogfood-dry-run",
        sourcePath: "/tmp/vault/capabilities/mcp-server.md",
        targetPath: "/tmp/vault/capabilities/mcp-server-dogfood-dry-run.md",
        moved: false,
        backlinkUpdates: { updates: [], totalUpdated: 0 },
        message: "dry-run — confirm:true to apply",
      },
    },
  },
  mergeDryRunRes: {
    result: {
      content: [
        {
          text: JSON.stringify({
            ok: false,
            dryRun: true,
            previewReady: true,
            canConfirm: true,
            wouldChange: true,
            blockedReasons: [],
            fromSlug: "capabilities/mcp-server",
            intoSlug: "domains/ai-agent-partner",
            fromPath: "/tmp/vault/capabilities/mcp-server.md",
            deleted: false,
            backlinkUpdates: { updates: [], totalUpdated: 0 },
            capturedFrom: { frontmatter: {} },
            message: "dry-run — confirm:true to apply",
          }),
        },
      ],
      structuredContent: {
        ok: false,
        dryRun: true,
        previewReady: true,
        canConfirm: true,
        wouldChange: true,
        blockedReasons: [],
        fromSlug: "capabilities/mcp-server",
        intoSlug: "domains/ai-agent-partner",
        fromPath: "/tmp/vault/capabilities/mcp-server.md",
        deleted: false,
        backlinkUpdates: { updates: [], totalUpdated: 0 },
        capturedFrom: { frontmatter: {} },
        message: "dry-run — confirm:true to apply",
      },
    },
  },
  deleteDryRunRes: {
    result: {
      content: [
        {
          text: JSON.stringify({
            ok: false,
            dryRun: true,
            previewReady: true,
            canConfirm: true,
            wouldChange: true,
            blockedReasons: [],
            slug: "capabilities/mcp-server",
            filePath: "/tmp/vault/capabilities/mcp-server.md",
            backlinks: [],
            message: "dry-run — force:true to apply",
          }),
        },
      ],
      structuredContent: {
        ok: false,
        dryRun: true,
        previewReady: true,
        canConfirm: true,
        wouldChange: true,
        blockedReasons: [],
        slug: "capabilities/mcp-server",
        filePath: "/tmp/vault/capabilities/mcp-server.md",
        backlinks: [],
        message: "dry-run — force:true to apply",
      },
    },
  },
  validation: {
    scanned: 1,
    problems: [],
    summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: {} },
  },
  validationStructured: {
    scanned: 1,
    problems: [],
    summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: {} },
  },
  brief: {
    operation: "workspace_brief",
    status: "healthy",
    summary: { nodes: 1, edges: 0, issues: 0, growthActions: 0 },
    nextActions: [],
    growth: {
      relationRecommendations: 0,
      externalElementRefs: 0,
      danglingReferences: 0,
      unassignedNodes: 0,
      emptyDomains: 0,
      totalActions: 0,
    },
    health: { checks: [{ id: "compile_issues", status: "pass", count: 0 }] },
  },
  tunedBrief: {
    operation: "workspace_brief",
    status: "healthy",
    summary: { nodes: 1, edges: 0, issues: 0, growthActions: 0 },
    nextActions: [],
    growth: {
      relationRecommendations: 0,
      externalElementRefs: 0,
      danglingReferences: 0,
      unassignedNodes: 0,
      emptyDomains: 0,
      totalActions: 0,
    },
    health: { checks: [{ id: "compile_issues", status: "pass", count: 0 }] },
  },
  health: {
    operation: "health",
    status: "healthy",
    summary: { issues: 0, unresolvedEdges: 0, dependencyCycles: 0 },
    checks: [{ id: "compile_issues", status: "pass", count: 0 }],
  },
  tunedHealth: {
    operation: "health",
    status: "healthy",
    summary: { issues: 0, unresolvedEdges: 0, dependencyCycles: 0 },
    checks: [{ id: "compile_issues", status: "pass", count: 0 }],
  },
  compiled: {
    version: 1,
    graphHash: "abc123",
    maxMtime: 1,
    nodeCount: 1,
    edgeCount: 2,
    resolvedEdgeCount: 1,
    externalEdgeCount: 1,
    unresolvedEdgeCount: 0,
    aliasCount: 1,
    ambiguousAliasCount: 0,
    issueCount: 0,
    canonicalizationActionCount: 0,
    byKind: { project: 1 },
    byDomain: {},
  },
  compiledStructured: {
    version: 1,
    graphHash: "abc123",
    maxMtime: 1,
    nodeCount: 1,
    edgeCount: 2,
    resolvedEdgeCount: 1,
    externalEdgeCount: 1,
    unresolvedEdgeCount: 0,
    aliasCount: 1,
    ambiguousAliasCount: 0,
    issueCount: 0,
    canonicalizationActionCount: 0,
    byKind: { project: 1 },
    byDomain: {},
  },
  compiledIndexes: {
    version: 1,
    graphHash: "abc123",
    maxMtime: 1,
    nodeCount: 1,
    edgeCount: 2,
    resolvedEdgeCount: 1,
    externalEdgeCount: 1,
    unresolvedEdgeCount: 0,
    aliasCount: 1,
    ambiguousAliasCount: 0,
    issueCount: 0,
    canonicalizationActionCount: 0,
    byKind: { project: 1 },
    byDomain: {},
    nodes: [{ uid: DOGFOOD_UID, slug: "project", kind: "project", title: "Project", mtime: 1, outDegree: 2, inDegree: 0 }],
    edges: [{ id: "e1", from: "project", to: "domains/core", via: "domains", ref: "domains/core", resolved: true, external: false }],
    aliases: [{ alias: "project", slug: "project" }],
    ambiguousAliases: [],
    issues: [],
    canonicalizationActions: [],
    summary: {
      graphHash: "abc123",
      nodes: 1,
      edges: 2,
      resolvedEdges: 1,
      externalEdges: 1,
      unresolvedEdges: 0,
      aliases: 1,
      ambiguousAliases: 0,
      issues: 0,
    },
    nodesPagination: { offset: 0, limit: 1, total: 1, returned: 1, hasMore: false, nextOffset: null },
    edgesPagination: { offset: 0, limit: 1, total: 2, returned: 1, hasMore: true, nextOffset: 1 },
    indexes: {
      out: { project: ["e1", "e2"] },
      in: { "domains/core": ["e1"] },
      byKind: { project: ["project"] },
      byDomain: {},
      uidToSlug: { [DOGFOOD_UID]: "project" },
      slugToUid: { project: DOGFOOD_UID },
      mergedUidToSlug: {},
      edgeById: {
        e1: { id: "e1", from: "project", to: "domains/core", via: "domains", ref: "domains/core", resolved: true, external: false },
        e2: { id: "e2", from: "project", to: "external/npm", via: "dependencies", ref: "external/npm", resolved: false, external: true },
      },
      aliasToSlug: { project: "project" },
    },
  },
  compiledIndexesStructured: null,
  overview: {
    operation: "overview",
    graph: {
      nodes: 1,
      edges: 2,
      resolvedEdges: 1,
      externalEdges: 1,
      unresolvedEdges: 0,
      aliases: 1,
      ambiguousAliases: 0,
      issues: 0,
      graphHash: "abc123",
      maxMtime: 1,
    },
    byKind: { project: 1 },
    byRelation: {},
    hubs: [],
  },
  overviewStructured: {
    operation: "overview",
    graph: {
      nodes: 1,
      edges: 2,
      resolvedEdges: 1,
      externalEdges: 1,
      unresolvedEdges: 0,
      aliases: 1,
      ambiguousAliases: 0,
      issues: 0,
      graphHash: "abc123",
      maxMtime: 1,
    },
    byKind: { project: 1 },
    byRelation: {},
    hubs: [],
  },
  patternWalk: {
    operation: "pattern_walk",
    start: "project",
    pattern: ["domains", "capabilities"],
    layers: [
      {
        step: 1,
        relation: "domains",
        totalPaths: 1,
        totalNodes: 1,
        nodes: [{ slug: "domains/auth", kind: "domain", title: "Auth" }],
      },
    ],
    endNodes: [{ slug: "capabilities/login", kind: "capability", title: "Login" }],
    paths: {
      total: 1,
      limited: false,
      rows: [
        {
          end: "capabilities/login",
          path: ["project", "domains/auth", "capabilities/login"],
          edges: [],
        },
      ],
    },
  },
  allPaths: {
    operation: "all_paths",
    from: "capabilities/mcp-server",
    to: "domains/vault-local-first",
    found: true,
    direction: "undirected",
    maxHops: 4,
    searchBudget: 5000,
    expandedStates: 10,
    exhaustive: true,
    truncatedByBudget: false,
    totalPaths: 2,
    totalPathsExact: true,
    limited: false,
    shortestHopCount: 2,
    byLength: { 2: 2 },
    paths: [
      {
        hopCount: 2,
        hops: ["capabilities/mcp-server", "domains/ai-agent-partner", "domains/vault-local-first"],
        edges: [],
      },
      {
        hopCount: 2,
        hops: ["capabilities/mcp-server", "capabilities/vault-validator", "domains/vault-local-first"],
        edges: [],
      },
    ],
  },
  allPathsPlan: {
    operation: "query_plan",
    targetOperation: "all_paths",
    sideEffect: false,
    normalized: {
      targetOperation: "all_paths",
      types: null,
      limit: 25,
      from: "capabilities/mcp-server",
      to: "domains/vault-local-first",
      direction: "undirected",
      maxHops: 4,
      searchBudget: 5000,
    },
    indexesUsed: ["aliasToSlug", "in", "out"],
    estimate: {
      strategy: "bounded_path_enumeration",
      edgeScans: 20,
      reachableWithinDepth: 8,
      frontierByDepth: [],
      potentialPathUpperBound: 40,
      resultUpperBound: 25,
      costClass: "medium",
    },
    warnings: ["all_paths may be truncated by limit; reduce maxHops or add relation types."],
    execution: {
      shouldRun: false,
      nextStep: "review",
      recommendation: "Review warnings before running suggestedQuery.",
      suggestedQuery: {
        operation: "all_paths",
        from: "capabilities/mcp-server",
        to: "domains/vault-local-first",
        direction: "undirected",
        maxHops: 4,
        searchBudget: 5000,
        limit: 25,
      },
      saferQuery: {
        operation: "all_paths",
        from: "capabilities/mcp-server",
        to: "domains/vault-local-first",
        direction: "undirected",
        maxHops: 3,
        searchBudget: 1000,
        limit: 10,
        types: ["depends_on", "relates"],
      },
    },
  },
  projectMapPlan: {
    operation: "query_plan",
    targetOperation: "project_map",
    sideEffect: false,
    normalized: {
      targetOperation: "project_map",
      types: null,
      limit: 100,
    },
    indexesUsed: ["compiled_artifact"],
    estimate: {
      strategy: "aggregate_scan",
      nodeScans: 1,
      edgeScans: 2,
      costClass: "low",
    },
    warnings: [],
    execution: {
      shouldRun: true,
      nextStep: "run",
      recommendation: "Run suggestedQuery as planned.",
      suggestedQuery: {
        operation: "project_map",
        limit: 100,
      },
    },
  },
  projectMap: {
    operation: "project_map",
    project: "project",
    node: { slug: "project", kind: "project", title: "Project" },
    summary: {
      nodes: 3,
      domains: 1,
      capabilities: 1,
      elements: 0,
      unassignedNodes: 0,
      internalEdges: 2,
      boundaryEdges: 0,
      externalEdges: 0,
      unresolvedEdges: 0,
    },
    limited: false,
    domains: [
      {
        slug: "domains/auth",
        kind: "domain",
        title: "Auth",
        summary: {
          nodes: 2,
          capabilities: 1,
          elements: 0,
          internalEdges: 1,
          boundaryEdges: 0,
          externalEdges: 0,
          unresolvedEdges: 0,
        },
        capabilities: {
          total: 1,
          limited: false,
          nodes: [{ slug: "capabilities/login", kind: "capability", title: "Login" }],
        },
        elements: { total: 0, limited: false, nodes: [] },
      },
    ],
    unassigned: { total: 0, limited: false, nodes: [] },
    hotspots: [],
  },
  domainProfile: {
    operation: "domain_profile",
    domain: "domains/ai-agent-partner",
    node: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
    parents: {
      projects: [{ slug: "project", via: "domains", node: { slug: "project", kind: "project", title: "Project" } }],
    },
    summary: {
      nodes: 3,
      capabilities: 1,
      elements: 1,
      internalEdges: 2,
      boundaryEdges: 1,
      externalEdges: 1,
      unresolvedEdges: 0,
    },
    capabilities: {
      total: 1,
      limited: false,
      nodes: [{ slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" }],
    },
    elements: {
      total: 1,
      limited: false,
      nodes: [{ slug: "elements/mcp-sdk", kind: "element", title: "MCP SDK" }],
    },
    hotspots: [{ slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" }],
    edges: {
      boundary: {
        total: 1,
        limited: false,
        byRelation: { relates: 1 },
        edges: [{ from: "capabilities/mcp-server", to: "domains/vault-local-first", via: "relates" }],
      },
      external: {
        total: 1,
        limited: false,
        byRelation: { elements: 1 },
        edges: [{ from: "capabilities/mcp-server", to: "mcp/src/index.js", via: "elements" }],
      },
      unresolved: { total: 0, limited: false, byRelation: {}, edges: [] },
    },
  },
  domainMatrix: {
    operation: "domain_matrix",
    project: "project",
    summary: {
      domains: 2,
      nodes: 5,
      assignedNodes: 4,
      unassignedNodes: 1,
      crossDomainEdges: 1,
      selfDomainEdges: 2,
      externalEdges: 1,
      unresolvedEdges: 0,
    },
    domains: [
      {
        slug: "domains/ai-agent-partner",
        node: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
        nodes: 3,
        outgoing: 1,
        incoming: 0,
        selfEdges: 2,
        externalEdges: 1,
        unresolvedEdges: 0,
      },
      {
        slug: "domains/vault-local-first",
        node: { slug: "domains/vault-local-first", kind: "domain", title: "Vault Local First" },
        nodes: 1,
        outgoing: 0,
        incoming: 1,
        selfEdges: 0,
        externalEdges: 0,
        unresolvedEdges: 0,
      },
    ],
    connections: {
      total: 1,
      limited: false,
      rows: [
        {
          from: "domains/ai-agent-partner",
          to: "domains/vault-local-first",
          count: 1,
          byRelation: { relates: 1 },
          examples: [{ from: "capabilities/mcp-server", to: "domains/vault-local-first", via: "relates" }],
        },
      ],
    },
  },
  components: {
    operation: "components",
    totalComponents: 2,
    largestSize: 4,
    singletonCount: 1,
    limited: false,
    components: [
      {
        id: 1,
        size: 4,
        kinds: { project: 1, domain: 1, capability: 2 },
        nodeLimited: false,
        nodes: [
          { slug: "project", kind: "project", title: "Project" },
          { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
          { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
          { slug: "capabilities/ontology-sync-skill", kind: "capability", title: "Ontology Sync Skill" },
        ],
      },
      {
        id: 2,
        size: 1,
        kinds: { capability: 1 },
        nodeLimited: false,
        nodes: [{ slug: "capabilities/orphan", kind: "capability", title: "Orphan" }],
      },
    ],
  },
  relationCheck: {
    operation: "relation_check",
    from: "capabilities/mcp-server",
    to: "domains/ai-agent-partner",
    relation: "domain",
    fromKind: "capability",
    toKind: "domain",
    exists: true,
    verdict: "already_exists",
    recommendation: {
      decision: "skip_existing",
      severity: "info",
      reason: "Exact edge already exists; do not add another relation.",
    },
    matchingEdges: [
      {
        from: "capabilities/mcp-server",
        to: "domains/ai-agent-partner",
        via: "domain",
      },
    ],
    inverseEdges: [],
    schemaPattern: {
      fromKind: "capability",
      relation: "domain",
      toKind: "domain",
      count: 1,
    },
  },
  maintenancePlan: {
    operation: "maintenance_plan",
    sideEffect: false,
    graphHash: "abc123",
    summary: {
      totalActions: 2,
      filteredActions: 2,
      remainingActions: 2,
      executableActions: 1,
      reviewActions: 1,
      compileIssues: 0,
      dependencyCycles: 0,
      canonicalizationActions: 0,
      danglingReferences: 0,
      relationRecommendations: 1,
      externalElementRefs: 0,
      externalElementRefsIgnored: 0,
      unassignedNodes: 1,
      emptyDomains: 0,
    },
    filters: {
      executableOnly: false,
      phases: [],
      severities: [],
      kinds: [],
    },
    cursor: {
      afterActionId: null,
      found: true,
      reason: null,
      startIndex: 0,
      nextAfterActionId: "maint_review",
      hasMore: false,
    },
    byPhase: { link: 1, review: 1 },
    bySeverity: { warn: 1, info: 1 },
    byKind: { add_missing_relation: 1, unassigned_node: 1 },
    limited: false,
    nextExecutableAction: {
      id: "maint_link",
      phase: "link",
      kind: "add_missing_relation",
      severity: "warn",
      score: 1,
      reason: "Missing containment relation.",
      executable: true,
      proposedAction: {
        tool: "add_relation",
        args: { from: "domains/ai-agent-partner", to: "capabilities/mcp-server", type: "capabilities" },
      },
      nodes: {
        from: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
        to: { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
      },
    },
    nextReviewAction: {
      id: "maint_review",
      phase: "review",
      kind: "unassigned_node",
      severity: "info",
      score: 0.5,
      reason: "Node has no project assignment.",
      executable: false,
    },
    actions: [
      {
        id: "maint_link",
        phase: "link",
        kind: "add_missing_relation",
        severity: "warn",
        score: 1,
        reason: "Missing containment relation.",
        executable: true,
        proposedAction: {
          tool: "add_relation",
          args: { from: "domains/ai-agent-partner", to: "capabilities/mcp-server", type: "capabilities" },
        },
        nodes: {
          from: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
          to: { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
        },
      },
      {
        id: "maint_review",
        phase: "review",
        kind: "unassigned_node",
        severity: "info",
        score: 0.5,
        reason: "Node has no project assignment.",
        executable: false,
      },
    ],
  },
  maintenancePlanMissingCursor: {
    operation: "maintenance_plan",
    sideEffect: false,
    graphHash: "abc123",
    summary: {
      totalActions: 2,
      filteredActions: 2,
      remainingActions: 0,
      executableActions: 1,
      reviewActions: 1,
      compileIssues: 0,
      dependencyCycles: 0,
      canonicalizationActions: 0,
      danglingReferences: 0,
      relationRecommendations: 1,
      externalElementRefs: 0,
      externalElementRefsIgnored: 0,
      unassignedNodes: 1,
      emptyDomains: 0,
    },
    filters: {
      executableOnly: false,
      phases: [],
      severities: [],
      kinds: [],
    },
    cursor: {
      afterActionId: "maint_missing",
      found: false,
      reason: "afterActionId not found in filtered maintenance actions",
      startIndex: null,
      nextAfterActionId: null,
      hasMore: false,
    },
    byPhase: {},
    bySeverity: {},
    byKind: {},
    limited: false,
    nextExecutableAction: null,
    nextReviewAction: null,
    actions: [],
  },
  growthPlan: {
    operation: "growth_plan",
    summary: {
      relationRecommendations: 1,
      externalElementRefs: 1,
      externalElementRefsIgnored: 0,
      danglingReferences: 1,
      unassignedNodes: 1,
      emptyDomains: 1,
      totalActions: 3,
    },
    relationRecommendations: {
      operation: "recommend_relations",
      mode: "domain_containment",
      totalRecommendations: 1,
      limited: false,
      recommendations: [
        {
          kind: "missing_domain_containment",
          score: 1,
          from: "domains/ai-agent-partner",
          to: "capabilities/mcp-server",
          relation: "capabilities",
          reason: "Missing containment relation.",
          proposedAction: {
            tool: "add_relation",
            args: { from: "domains/ai-agent-partner", to: "capabilities/mcp-server", type: "capabilities" },
          },
        },
      ],
    },
    externalElementRefs: {
      total: 1,
      limited: false,
      rows: [
        {
          kind: "materialize_external_element",
          score: 0.8,
          from: "capabilities/mcp-server",
          ref: "mcp/src/index.js",
          suggestedSlug: "elements/mcp-src-index",
          reason: "Materialize external element.",
          proposedAction: {
            tool: "add_concept",
            args: { slug: "elements/mcp-src-index", kind: "element", title: "Index" },
          },
        },
      ],
    },
    danglingReferences: {
      total: 1,
      limited: false,
      rows: [
        {
          kind: "resolve_dangling_reference",
          score: 0.7,
          from: "capabilities/mcp-server",
          ref: "capabilities/missing",
          relation: "dependencies",
          inferredKind: "capability",
          suggestedSlug: "capabilities/missing",
          reason: "Resolve dangling reference.",
          proposedAction: {
            tool: "add_concept",
            args: { slug: "capabilities/missing", kind: "capability", title: "Missing" },
          },
        },
      ],
    },
    unassignedNodes: {
      total: 1,
      limited: false,
      rows: [
        {
          kind: "unassigned_node",
          score: 0.5,
          slug: "capabilities/orphan",
          reason: "Assign it to a domain.",
        },
      ],
    },
    emptyDomains: {
      total: 1,
      limited: false,
      rows: [
        {
          kind: "empty_domain",
          score: 0.4,
          slug: "domains/empty",
          reason: "Domain has no contained capability or element nodes yet.",
        },
      ],
    },
  },
  relationRecommendations: {
    operation: "recommend_relations",
    mode: "domain_containment",
    totalRecommendations: 1,
    limited: false,
    recommendations: [
      {
        kind: "missing_domain_containment",
        score: 1,
        from: "domains/ai-agent-partner",
        to: "capabilities/mcp-server",
        relation: "capabilities",
        reason: "Missing containment relation.",
        proposedAction: {
          tool: "add_relation",
          args: { from: "domains/ai-agent-partner", to: "capabilities/mcp-server", type: "capabilities" },
        },
      },
    ],
  },
  cycles: {
    operation: "cycles",
    relationTypes: ["dependencies"],
    maxDepth: 8,
    totalCycles: 1,
    limited: false,
    cycles: [
      {
        id: "capabilities/a>capabilities/b>capabilities/a",
        length: 2,
        nodes: ["capabilities/a", "capabilities/b", "capabilities/a"],
        edges: [
          { from: "capabilities/a", to: "capabilities/b", via: "dependencies" },
          { from: "capabilities/b", to: "capabilities/a", via: "dependencies" },
        ],
      },
    ],
  },
  topologicalOrder: {
    operation: "topological_order",
    relationTypes: ["dependencies"],
    prerequisiteFirst: true,
    includeIsolated: false,
    acyclic: true,
    totalNodes: 3,
    orderedCount: 3,
    selectedEdges: 2,
    limited: false,
    order: [
      { rank: 0, slug: "capabilities/storage", node: { slug: "capabilities/storage", kind: "capability", title: "Storage" } },
      { rank: 1, slug: "capabilities/auth", node: { slug: "capabilities/auth", kind: "capability", title: "Auth" } },
      { rank: 2, slug: "capabilities/app", node: { slug: "capabilities/app", kind: "capability", title: "App" } },
    ],
    layers: [
      { rank: 0, nodes: [{ slug: "capabilities/storage", kind: "capability", title: "Storage" }] },
      { rank: 1, nodes: [{ slug: "capabilities/auth", kind: "capability", title: "Auth" }] },
      { rank: 2, nodes: [{ slug: "capabilities/app", kind: "capability", title: "App" }] },
    ],
    blocked: [],
  },
  lineage: {
    operation: "lineage",
    center: "capabilities/mcp-server",
    node: { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
    depth: 3,
    ancestors: {
      total: 2,
      limited: false,
      nodes: [
        { slug: "domains/ai-agent-partner", distance: 1, via: "domain", node: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" } },
        { slug: "project", distance: 2, via: "domains", node: { slug: "project", kind: "project", title: "Project" } },
      ],
    },
    descendants: {
      total: 1,
      limited: false,
      nodes: [
        { slug: "elements/mcp-sdk", distance: 1, via: "elements", node: { slug: "elements/mcp-sdk", kind: "element", title: "MCP SDK" } },
      ],
    },
    edges: [
      { from: "capabilities/mcp-server", to: "domains/ai-agent-partner", via: "domain" },
      { from: "project", to: "domains/ai-agent-partner", via: "domains" },
      { from: "capabilities/mcp-server", to: "elements/mcp-sdk", via: "elements" },
    ],
  },
  containmentTree: {
    operation: "containment_tree",
    root: "project",
    depth: 3,
    totalRoots: 1,
    emittedNodes: 4,
    limited: false,
    roots: [
      {
        slug: "project",
        via: null,
        distance: 0,
        node: { slug: "project", kind: "project", title: "Project" },
        children: [
          {
            slug: "domains/ai-agent-partner",
            via: "domains",
            distance: 1,
            node: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
            children: [
              {
                slug: "capabilities/mcp-server",
                via: "capabilities",
                distance: 2,
                node: { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
                children: [
                  {
                    slug: "elements/mcp-sdk",
                    via: "elements",
                    distance: 3,
                    node: { slug: "elements/mcp-sdk", kind: "element", title: "MCP SDK" },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    cycles: [],
  },
  reachability: {
    operation: "reachability",
    start: "capabilities/mcp-server",
    node: { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
    direction: "outgoing",
    depth: 2,
    summary: {
      reachableNodes: 2,
      traversedEdges: 2,
      layers: 2,
      terminalNodes: 1,
    },
    byKind: { domain: 1, element: 1 },
    byRelation: { domain: 1, elements: 1 },
    layers: [
      {
        distance: 1,
        total: 1,
        nodes: [{ slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" }],
      },
      {
        distance: 2,
        total: 1,
        nodes: [{ slug: "elements/mcp-sdk", kind: "element", title: "MCP SDK" }],
      },
    ],
    paths: {
      total: 2,
      limited: false,
      rows: [
        {
          slug: "domains/ai-agent-partner",
          distance: 1,
          path: ["capabilities/mcp-server", "domains/ai-agent-partner"],
          edges: [{ from: "capabilities/mcp-server", to: "domains/ai-agent-partner", via: "domain" }],
          node: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
        },
        {
          slug: "elements/mcp-sdk",
          distance: 2,
          path: ["capabilities/mcp-server", "domains/ai-agent-partner", "elements/mcp-sdk"],
          edges: [
            { from: "capabilities/mcp-server", to: "domains/ai-agent-partner", via: "domain" },
            { from: "domains/ai-agent-partner", to: "elements/mcp-sdk", via: "elements" },
          ],
          node: { slug: "elements/mcp-sdk", kind: "element", title: "MCP SDK" },
        },
      ],
    },
    terminalNodes: [{ slug: "elements/mcp-sdk", kind: "element", title: "MCP SDK" }],
    edges: {
      total: 2,
      limited: false,
      rows: [
        { from: "capabilities/mcp-server", to: "domains/ai-agent-partner", via: "domain" },
        { from: "domains/ai-agent-partner", to: "elements/mcp-sdk", via: "elements" },
      ],
    },
  },
  impact: {
    operation: "impact",
    center: "capabilities/mcp-server",
    direction: "incoming",
    depth: 2,
    total: 2,
    limited: false,
    nodes: [
      { slug: "domains/ai-agent-partner", distance: 1, node: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" } },
      { slug: "capabilities/ontology-sync-skill", distance: 1, node: { slug: "capabilities/ontology-sync-skill", kind: "capability", title: "Ontology Sync Skill" } },
    ],
    edges: [
      { from: "domains/ai-agent-partner", to: "capabilities/mcp-server", via: "capabilities" },
      { from: "capabilities/ontology-sync-skill", to: "capabilities/mcp-server", via: "dependencies" },
    ],
  },
  blastRadius: {
    operation: "blast_radius",
    center: "capabilities/mcp-server",
    node: { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
    direction: "incoming",
    depth: 2,
    risk: "medium",
    summary: {
      affectedNodes: 2,
      affectedEdges: 2,
      affectedKinds: 2,
      affectedDomains: 1,
      crossDomainEdges: 0,
    },
    byKind: { capability: 1, domain: 1 },
    byDomain: { "domains/ai-agent-partner": 2 },
    nodes: {
      total: 2,
      limited: false,
      rows: [
        { slug: "domains/ai-agent-partner", distance: 1, domain: "domains/ai-agent-partner", node: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" } },
        { slug: "capabilities/ontology-sync-skill", distance: 1, domain: "domains/ai-agent-partner", node: { slug: "capabilities/ontology-sync-skill", kind: "capability", title: "Ontology Sync Skill" } },
      ],
    },
    edges: {
      total: 2,
      limited: false,
      rows: [
        { from: "domains/ai-agent-partner", to: "capabilities/mcp-server", via: "capabilities", fromDomain: "domains/ai-agent-partner", toDomain: "domains/ai-agent-partner", crossDomain: false },
        { from: "capabilities/ontology-sync-skill", to: "capabilities/mcp-server", via: "dependencies", fromDomain: "domains/ai-agent-partner", toDomain: "domains/ai-agent-partner", crossDomain: false },
      ],
    },
  },
  subgraph: {
    operation: "subgraph",
    seed: "capabilities/mcp-server",
    direction: "both",
    depth: 1,
    totalNodes: 3,
    totalEdges: 2,
    limited: false,
    nodes: [
      { slug: "capabilities/mcp-server", distance: 0, node: { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" } },
      { slug: "domains/ai-agent-partner", distance: 1, node: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" } },
      { slug: "elements/mcp-sdk", distance: 1, node: { slug: "elements/mcp-sdk", kind: "element", title: "MCP SDK" } },
    ],
    edges: [
      { from: "capabilities/mcp-server", to: "domains/ai-agent-partner", via: "domain" },
      { from: "capabilities/mcp-server", to: "elements/mcp-sdk", via: "elements" },
    ],
  },
  schema: {
    operation: "schema",
    totalPatterns: 2,
    limited: false,
    patterns: [
      { fromKind: "capability", relation: "domain", toKind: "domain", count: 1, resolved: 1, external: 0 },
      { fromKind: "capability", relation: "elements", toKind: "external", count: 1, resolved: 0, external: 1 },
    ],
  },
  facets: {
    operation: "facets",
    graph: {
      nodes: 3,
      edges: 2,
      resolvedEdges: 1,
      externalEdges: 1,
      unresolvedEdges: 0,
    },
    nodes: {
      byKind: { capability: 1, domain: 1, element: 1 },
      byDomain: { "domains/ai-agent-partner": 2 },
      byDegreeBucket: { "0": 0, "1": 2, "2-4": 1, "5-9": 0, "10+": 0 },
      topByDegree: [{ slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" }],
    },
    edges: {
      byRelation: { domain: 1, elements: 1 },
      byResolution: { resolved: 1, external: 1, unresolved: 0 },
      topPatterns: [
        { fromKind: "capability", relation: "domain", toKind: "domain", count: 1, resolved: 1, external: 0 },
      ],
    },
  },
  matchNodes: {
    operation: "match_nodes",
    filters: {
      kind: "capability",
      domain: null,
      slugContains: "mcp",
      minDegree: null,
      maxDegree: null,
      minInDegree: null,
      minOutDegree: null,
      hasIncoming: null,
      hasOutgoing: null,
      sort: "degree",
    },
    totalMatches: 1,
    limited: false,
    nodes: [
      {
        slug: "capabilities/mcp-server",
        kind: "capability",
        title: "MCP Server",
        inDegree: 3,
        outDegree: 4,
        degree: 7,
      },
    ],
  },
  matchEdges: {
    operation: "match_edges",
    filters: {
      from: "capabilities/mcp-server",
      to: null,
      fromKind: null,
      toKind: null,
      types: null,
      includeExternal: true,
      includeUnresolved: false,
    },
    totalMatches: 2,
    limited: false,
    edges: [
      {
        from: "capabilities/mcp-server",
        to: "domains/ai-agent-partner",
        via: "domain",
        resolved: true,
        external: false,
        fromNode: { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
        toNode: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
        toKind: "domain",
      },
      {
        from: "capabilities/mcp-server",
        to: "mcp/src/index.js",
        via: "elements",
        resolved: false,
        external: true,
        fromNode: { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
        toNode: null,
        toKind: "external",
      },
    ],
  },
  nodeProfile: {
    operation: "node_profile",
    center: "capabilities/mcp-server",
    node: { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
    aliases: ["mcp-server"],
    degree: { in: 2, out: 3, total: 5 },
    edges: {
      incoming: {
        total: 1,
        byRelation: { dependencies: 1 },
        limited: false,
        edges: [
          {
            from: "capabilities/ontology-sync-skill",
            to: "capabilities/mcp-server",
            via: "dependencies",
            resolved: true,
            external: false,
            otherNode: { slug: "capabilities/ontology-sync-skill", kind: "capability", title: "Ontology Sync Skill" },
            otherKind: "capability",
          },
        ],
      },
      outgoing: {
        total: 1,
        byRelation: { domain: 1 },
        limited: false,
        edges: [
          {
            from: "capabilities/mcp-server",
            to: "domains/ai-agent-partner",
            via: "domain",
            resolved: true,
            external: false,
            otherNode: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
            otherKind: "domain",
          },
        ],
      },
    },
    containment: {
      parents: [
        { slug: "domains/ai-agent-partner", via: "domain", node: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" } },
      ],
      parentLimited: false,
      children: [],
      childLimited: false,
    },
    lineage: {
      depth: 3,
      ancestors: {
        total: 1,
        limited: false,
        nodes: [
          { slug: "domains/ai-agent-partner", distance: 1, via: "domain", node: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" } },
        ],
      },
      descendants: { total: 0, limited: false, nodes: [] },
    },
  },
  centrality: {
    operation: "centrality",
    graph: { nodes: 3, edges: 4, resolvedEdges: 3, graphHash: "abc123" },
    parameters: { types: null, iterations: 20, limit: 8 },
    rankings: {
      pageRank: [
        {
          slug: "capabilities/mcp-server",
          kind: "capability",
          title: "MCP Server",
          inDegree: 2,
          outDegree: 3,
          degree: 5,
          pageRank: 0.42,
          bridgeScore: 6,
        },
        {
          slug: "domains/ai-agent-partner",
          kind: "domain",
          title: "AI Agent Partner",
          inDegree: 1,
          outDegree: 1,
          degree: 2,
          pageRank: 0.2,
          bridgeScore: 1,
        },
      ],
      bridges: [
        {
          slug: "capabilities/mcp-server",
          kind: "capability",
          title: "MCP Server",
          inDegree: 2,
          outDegree: 3,
          degree: 5,
          pageRank: 0.42,
          bridgeScore: 6,
        },
      ],
      authorities: [
        {
          slug: "capabilities/mcp-server",
          kind: "capability",
          title: "MCP Server",
          inDegree: 2,
          outDegree: 3,
          degree: 5,
          pageRank: 0.42,
          bridgeScore: 6,
        },
      ],
      hubs: [
        {
          slug: "capabilities/mcp-server",
          kind: "capability",
          title: "MCP Server",
          inDegree: 2,
          outDegree: 3,
          degree: 5,
          pageRank: 0.42,
          bridgeScore: 6,
        },
      ],
    },
  },
  communities: {
    operation: "communities",
    parameters: { types: null, iterations: 20, limit: 6, nodeLimit: 6 },
    summary: { communities: 2, largestSize: 3, singletonCount: 1, crossCommunityEdges: 1 },
    limited: false,
    communities: [
      {
        id: 1,
        label: "domains/ai-agent-partner",
        size: 3,
        internalEdges: 2,
        boundaryEdges: 1,
        kinds: { domain: 1, capability: 2 },
        domains: { "domains/ai-agent-partner": 3 },
        representative: { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
        nodeLimited: false,
        nodes: [
          { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
          { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
          { slug: "capabilities/ontology-sync-skill", kind: "capability", title: "Ontology Sync Skill" },
        ],
      },
      {
        id: 2,
        label: "README",
        size: 1,
        internalEdges: 0,
        boundaryEdges: 0,
        kinds: { "vault-readme": 1 },
        domains: {},
        representative: { slug: "README", kind: "vault-readme", title: "Readme" },
        nodeLimited: false,
        nodes: [{ slug: "README", kind: "vault-readme", title: "Readme" }],
      },
    ],
    crossCommunityEdges: {
      total: 1,
      limited: false,
      rows: [
        {
          from: "capabilities/mcp-server",
          to: "domains/vault-local-first",
          via: "relates",
          fromCommunity: 1,
          toCommunity: 2,
        },
      ],
    },
  },
  similarNodes: {
    operation: "similar_nodes",
    source: {
      mode: "candidate",
      slug: "capabilities/mcp-server-v2",
      kind: "capability",
      title: "MCP Server",
      domain: "domains/ai-agent-partner",
    },
    parameters: { types: null, limit: 5 },
    totalMatches: 1,
    limited: false,
    matches: [
      {
        node: { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
        score: 0.9,
        signals: { slug: 0.2, title: 0.35, kind: 0.1, domain: 0.1, neighbors: 0.15 },
        sharedNeighbors: [
          { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
        ],
      },
    ],
  },
  explainRelation: {
    operation: "explain_relation",
    from: "capabilities/mcp-server",
    to: "domains/vault-local-first",
    fromNode: { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
    toNode: { slug: "domains/vault-local-first", kind: "domain", title: "Vault Local First" },
    verdict: "path",
    domains: { from: "domains/ai-agent-partner", to: "domains/vault-local-first", sameDomain: false },
    direct: { total: 0, edges: [] },
    shortestPath: {
      found: true,
      direction: "undirected",
      maxHops: 4,
      hopCount: 2,
      hops: ["capabilities/mcp-server", "domains/ai-agent-partner", "domains/vault-local-first"],
      edges: [
        { from: "capabilities/mcp-server", to: "domains/ai-agent-partner", via: "domain" },
        { from: "domains/ai-agent-partner", to: "domains/vault-local-first", via: "relates" },
      ],
    },
    commonNeighbors: {
      total: 1,
      limited: false,
      rows: [
        {
          slug: "domains/ai-agent-partner",
          node: { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
          fromEdges: [
            {
              from: "capabilities/mcp-server",
              to: "domains/ai-agent-partner",
              via: "domain",
              direction: "outgoing",
            },
          ],
          toEdges: [
            {
              from: "domains/ai-agent-partner",
              to: "domains/vault-local-first",
              via: "relates",
              direction: "outgoing",
            },
          ],
        },
      ],
    },
  },
  neighbors: {
    operation: "neighbors",
    center: "capabilities/mcp-server",
    node: { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
    total: 2,
    limited: false,
    edges: [
      {
        direction: "outgoing",
        id: "capabilities/mcp-server:domain:domains/ai-agent-partner",
        from: "capabilities/mcp-server",
        to: "domains/ai-agent-partner",
        via: "domain",
        ref: "domains/ai-agent-partner",
        resolved: true,
        external: false,
      },
      {
        direction: "incoming",
        id: "capabilities/ontology-sync-skill:dependencies:capabilities/mcp-server",
        from: "capabilities/ontology-sync-skill",
        to: "capabilities/mcp-server",
        via: "dependencies",
        ref: "capabilities/mcp-server",
        resolved: true,
        external: false,
      },
    ],
    nodes: [
      { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
      { slug: "capabilities/ontology-sync-skill", kind: "capability", title: "Ontology Sync Skill" },
    ],
  },
  queryPath: {
    operation: "path",
    from: "capabilities/mcp-server",
    to: "domains/vault-local-first",
    found: true,
    hopCount: 2,
    hops: ["capabilities/mcp-server", "domains/ai-agent-partner", "domains/vault-local-first"],
    edges: [
      {
        from: "capabilities/mcp-server",
        to: "domains/ai-agent-partner",
        via: "domain",
        traversedFrom: "capabilities/mcp-server",
        traversedTo: "domains/ai-agent-partner",
      },
      {
        from: "domains/ai-agent-partner",
        to: "domains/vault-local-first",
        via: "relates",
        traversedFrom: "domains/ai-agent-partner",
        traversedTo: "domains/vault-local-first",
      },
    ],
  },
  projectScope: {
    operation: "project_scope",
    project: "project",
    node: { slug: "project", kind: "project", title: "Project" },
    summary: {
      nodes: 3,
      internalEdges: 2,
      boundaryEdges: 1,
      externalEdges: 1,
      unresolvedEdges: 0,
    },
    byKind: { project: 1, domain: 1, capability: 1 },
    byDomain: { "domains/ai-agent-partner": 2 },
    nodes: {
      total: 3,
      limited: false,
      rows: [
        { slug: "project", kind: "project", title: "Project" },
        { slug: "domains/ai-agent-partner", kind: "domain", title: "AI Agent Partner" },
        { slug: "capabilities/mcp-server", kind: "capability", title: "MCP Server" },
      ],
    },
    edges: {
      internal: {
        total: 2,
        byRelation: { domains: 1, capabilities: 1 },
        limited: false,
        edges: [
          { from: "project", to: "domains/ai-agent-partner", via: "domains", toScope: "internal" },
          { from: "domains/ai-agent-partner", to: "capabilities/mcp-server", via: "capabilities", toScope: "internal" },
        ],
      },
      boundary: {
        total: 1,
        byRelation: { relates: 1 },
        limited: false,
        edges: [
          { from: "capabilities/mcp-server", to: "domains/vault-local-first", via: "relates", toScope: "boundary" },
        ],
      },
      external: {
        total: 1,
        byRelation: { elements: 1 },
        limited: false,
        edges: [
          { from: "capabilities/mcp-server", to: "mcp/src/index.js", via: "elements", toScope: "external" },
        ],
      },
      unresolved: { total: 0, byRelation: {}, limited: false, edges: [] },
    },
  },
  strictArgs: {
    result: {
      isError: true,
      content: [{ text: 'Unknown argument "lmit" for list_concepts. Did you mean "limit"? Allowed arguments: domain, kind, limit, since, summary. Received arguments: lmit.' }],
      structuredContent: {
        ok: false,
        errorCode: "unknown_argument",
        error: 'Unknown argument "lmit" for list_concepts. Did you mean "limit"? Allowed arguments: domain, kind, limit, since, summary. Received arguments: lmit.',
        toolName: "list_concepts",
        receivedArgument: "lmit",
        suggestion: "limit",
        unknownArguments: [{ name: "lmit", suggestion: "limit" }],
        allowedArguments: ["domain", "kind", "limit", "offset", "since", "summary"],
        receivedArguments: ["lmit"],
      },
    },
  },
  strictMultiArgs: {
    result: {
      isError: true,
      content: [{ text: 'Unknown arguments for list_concepts: "lmit" (did you mean "limit"?), "summry" (did you mean "summary"?). Allowed arguments: domain, kind, limit, since, summary. Received arguments: lmit, summry.' }],
      structuredContent: {
        ok: false,
        errorCode: "unknown_argument",
        error: 'Unknown arguments for list_concepts: "lmit" (did you mean "limit"?), "summry" (did you mean "summary"?). Allowed arguments: domain, kind, limit, since, summary. Received arguments: lmit, summry.',
        toolName: "list_concepts",
        receivedArguments: ["lmit", "summry"],
        unknownArguments: [
          { name: "lmit", suggestion: "limit" },
          { name: "summry", suggestion: "summary" },
        ],
        allowedArguments: ["domain", "kind", "limit", "offset", "since", "summary"],
      },
    },
  },
  strictEnum: {
    result: {
      isError: true,
      content: [{ text: `operation must be one of: ${QUERY_ONTOLOGY_OPERATIONS.join(", ")}. Received: "overveiw". Did you mean "overview"?` }],
      structuredContent: {
        ok: false,
        errorCode: "invalid_arguments",
        error: `operation must be one of: ${QUERY_ONTOLOGY_OPERATIONS.join(", ")}. Received: "overveiw". Did you mean "overview"?`,
        valueName: "operation",
        receivedValue: "overveiw",
        suggestion: "overview",
        allowedValues: QUERY_ONTOLOGY_OPERATIONS,
      },
    },
  },
  strictUnknownTool: {
    result: {
      isError: true,
      content: [{ text: `Error: Unknown tool: list_concept. Did you mean "list_concepts"? Allowed tools: ${[...EXPECTED_TOOLS].sort().join(", ")}.` }],
      structuredContent: {
        ok: false,
        errorCode: "unknown_tool",
        error: `Unknown tool: list_concept. Did you mean "list_concepts"? Allowed tools: ${[...EXPECTED_TOOLS].sort().join(", ")}.`,
        receivedTool: "list_concept",
        suggestion: "list_concepts",
        allowedTools: [...EXPECTED_TOOLS].sort(),
      },
    },
  },
  strictMaintenancePhaseFilter: strictValueErrorResponse("phases items", ["validate", "repair", "link", "materialize", "review"], "repiar", "repair"),
  strictMaintenanceSeverityFilter: strictValueErrorResponse("severities items", ["fail", "warn", "info"], "fatal", "fail"),
  // Derived, not transcribed — a hand-copied list here silently stopped matching
  // the server the day the node-eligibility gate added two kinds (2026-07-31).
  strictMaintenanceKindFilter: strictValueErrorResponse("kinds items", [...MAINTENANCE_KIND_VALUES], "add_mising_relation", "add_missing_relation"),
  strictRelationFilter: strictValueErrorResponse("dependencyTypes items", ["domains", "domain", "capabilities", "elements", "dependencies", "depends_on", "relates", "contains", "describes"], "depend_on", "depends_on"),
  strictFindNeighborsTypeFilter: strictValueErrorResponse("types items", ["domains", "domain", "capabilities", "elements", "dependencies", "depends_on", "relates", "contains", "describes"], "depend_on", "depends_on"),
  strictFindOrphansKindFilter: strictValueErrorResponse("kind", ["project", "domain", "capability", "element", "document", "vault-readme"], "capabilty", "capability"),
  strictFindOrphansExcludeKindFilter: strictValueErrorResponse("excludeKinds items", ["project", "domain", "capability", "element", "document", "vault-readme"], "capabilty", "capability"),
  strictQueryConceptsKindFilter: strictValueErrorResponse("kind", ["project", "domain", "capability", "element", "document", "vault-readme"], "capabilty", "capability"),
  strictQueryConceptsHasKeyFilter: strictValueErrorResponse("has key", [...GRAPH_ARRAY_KEYS], "capabilties", "capabilities"),
  strictListConceptsKindFilter: strictValueErrorResponse("kind", ["project", "domain", "capability", "element", "document", "vault-readme"], "capabilty", "capability"),
  strictRelationCheck: strictValueErrorResponse("type", ["domains", "domain", "capabilities", "elements", "dependencies", "depends_on", "relates", "contains", "describes"], "depend_on", "depends_on"),
  strictAddRelation: strictValueErrorResponse("type", ["depends_on", "relates", "contains", "describes", "domains", "capabilities", "elements", "domain"], "depend_on", "depends_on"),
  strictGraphKindFilter: strictValueErrorResponse("kind", ["project", "domain", "capability", "element", "document", "vault-readme"], "capabilty", "capability"),
  strictRecommendRelationsKindFilter: strictValueErrorResponse("kind", ["capability", "element"], "capabilty", "capability"),
  strictRecommendRelationsUnsupportedKindFilter: strictValueErrorResponse("kind", ["capability", "element"], "domain"),
  strictMatchNodesSortFilter: strictValueErrorResponse("sort", ["degree", "inDegree", "outDegree", "slug"], "outDegre", "outDegree"),
  strictMatchEdgesTypeFilter: strictValueErrorResponse("type", ["domains", "domain", "capabilities", "elements", "dependencies", "depends_on", "relates", "contains", "describes"], "depend_on", "depends_on"),
  strictGraphFromKindFilter: strictValueErrorResponse("fromKind", ["project", "domain", "capability", "element", "document", "vault-readme"], "capabilty", "capability"),
  strictGraphToKindFilter: strictValueErrorResponse("toKind", ["project", "domain", "capability", "element", "document", "vault-readme", "external", "unresolved"], "externl", "external"),
  getConceptsBatchCap: batchCapError("slugs"),
  addConceptsBatchCap: batchCapError("concepts"),
  addRelationsBatchCap: batchCapError("relations"),
};

for (const value of Object.values(okShape)) {
  const result = value?.result;
  const text = result?.content?.[0]?.text;
  if (result?.isError === true && typeof text === "string" && !result.structuredContent) {
    result.structuredContent = { ok: false, errorCode: "invalid_arguments", error: text };
  }
}

for (const [resultField, structuredField] of [
  ["brief", "briefStructured"],
  ["tunedBrief", "tunedBriefStructured"],
  ["health", "healthStructured"],
  ["tunedHealth", "tunedHealthStructured"],
  ["compiledIndexes", "compiledIndexesStructured"],
  ["patternWalk", "patternWalkStructured"],
  ["allPaths", "allPathsStructured"],
  ["allPathsPlan", "allPathsPlanStructured"],
  ["projectMapPlan", "projectMapPlanStructured"],
  ["projectMap", "projectMapStructured"],
  ["domainProfile", "domainProfileStructured"],
  ["domainMatrix", "domainMatrixStructured"],
  ["components", "componentsStructured"],
  ["relationCheck", "relationCheckStructured"],
  ["maintenancePlan", "maintenancePlanStructured"],
  ["maintenancePlanMissingCursor", "maintenancePlanMissingCursorStructured"],
  ["growthPlan", "growthPlanStructured"],
  ["relationRecommendations", "relationRecommendationsStructured"],
  ["cycles", "cyclesStructured"],
  ["topologicalOrder", "topologicalOrderStructured"],
  ["lineage", "lineageStructured"],
  ["containmentTree", "containmentTreeStructured"],
  ["reachability", "reachabilityStructured"],
  ["impact", "impactStructured"],
  ["blastRadius", "blastRadiusStructured"],
  ["subgraph", "subgraphStructured"],
  ["schema", "schemaStructured"],
  ["facets", "facetsStructured"],
  ["matchNodes", "matchNodesStructured"],
  ["matchEdges", "matchEdgesStructured"],
  ["nodeProfile", "nodeProfileStructured"],
  ["centrality", "centralityStructured"],
  ["communities", "communitiesStructured"],
  ["similarNodes", "similarNodesStructured"],
  ["explainRelation", "explainRelationStructured"],
  ["neighbors", "neighborsStructured"],
  ["queryPath", "queryPathStructured"],
  ["projectScope", "projectScopeStructured"],
]) {
  okShape[structuredField] ??= structuredClone(okShape[resultField]);
}
