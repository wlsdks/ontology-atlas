#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildDogfoodRequests,
  componentSummary,
  createUtf8Accumulator,
  DOGFOOD_TUNED_HEALTH_ARGS,
  DOGFOOD_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
  DOGFOOD_RESPONSE_LABELS,
  dogfoodTimeoutErrorMessage,
  dogfoodUsage,
  evaluateDogfoodGate,
  expectedResponseIds,
  formatWorkspaceNextActionRows,
  graphStructuredContentSummary,
  healthCheckStatusSummary,
  importModuleEdgeKindSummary,
  maintenanceBucketSummary,
  maintenanceNextActionSummary,
  missingResponseLabels,
  parseDogfoodArgs,
  parseDogfoodTimeoutMs,
  parseRpcResponses,
  recordResult,
  rpcTimeoutFailure,
  shouldFinishRpc,
  shouldPrintDogfoodHelp,
  stderrWarningLines,
  stderrWarningFailures,
  strictClosestValueSummary,
  structuredContentStatus,
  toolsListInventoryStatus,
  toolsListSchemaStatus,
  toolsListAnnotationSummary,
  tunedHealthScopeSummary,
  tunedWorkspaceBriefScopeSummary,
  workspaceNextActionAnalysisLabel,
  workspaceNextActionSummary,
  writeRowLabelGuidanceSummary,
} from "./dogfood-mcp-walk.mjs";
import {
  compileIndexesSummary,
  EXPECTED_DESTRUCTIVE_TOOLS,
  EXPECTED_IDEMPOTENT_TOOLS,
  EXPECTED_TOOLS,
  IMPORT_EDGE_KIND_VALUES,
  IMPORT_UNRESOLVED_REASON_VALUES,
  VAULT_ISSUE_CODE_VALUES,
  VERIFY_TUNED_HEALTH_ARGS,
  VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
  expectedToolsListAnnotationSummary,
  expectedToolTitle,
  TOOLS_LIST_SCHEMA_CONTRACT_SUMMARY,
} from "../mcp/scripts/verify.mjs";
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
} from "../mcp/src/ontology-engine.mjs";
import { GRAPH_ARRAY_KEYS } from "../mcp/src/vault.mjs";

const WRITE_TOOL_NAMES = new Set([
  "add_concept",
  "add_concepts",
  "add_relation",
  "add_relations",
  "patch_concept",
  "delete_concept",
  "rename_concept",
  "merge_concepts",
]);
const ROOT_PKG = JSON.parse(readFileSync("package.json", "utf-8"));

function makeDogfoodInitialize() {
  return {
    protocolVersion: "2024-11-05",
    serverInfo: { name: "oh-my-ontology-mcp", version: "0.12.0" },
    instructions: [
      "Use read-only first-contact diagnosis before write tools.",
      "rename_concept refuses an existing `newSlug` unless overwrite: true is explicit.",
      "delete_concept force: true means accepting dangling referrers.",
      "Use expected_mtime when patching a previously-read concept.",
      "Tool schemas reject unknown arguments with nearest hints.",
      "unknown arguments are rejected instead of being ignored.",
      "Tool errors include structuredContent.errorCode values such as unknown_argument and invalid_arguments.",
      'Unknown argument "lmit" for list_concepts. Did you mean "limit"?',
      'Unknown arguments for list_concepts: "lmit" (did you mean "limit"?), "summry" (did you mean "summary"?)',
      "Batch add_concepts and add_relations isolate each non-object row and unknown row fields as ok:false.",
      'Batch add_relations unknown type row errors include a closest-value hint such as Did you mean "depends_on"?',
      "Duplicate add_concepts input slugs report concepts[n] duplicate slug in input batch; first seen at concepts[m].",
      'operation must be one of: overview, health. Invalid value: overveiw. Did you mean "overview"?',
      "maintenance_plan phases, severities, and kinds filters are enum-validated.",
      "health and workspace_brief tune probes with componentLimit, cycleLimit, recommendationLimit, orderLimit, nodeLimit, dependencyTypes, and componentTypes.",
      "dependencyTypes / componentTypes accept relation types domains, domain, capabilities, elements, dependencies, depends_on, relates, contains, describes; typoed values fail with nearest-value hints.",
      "maintenance_plan ready pages return cursor.found=true with cursor.reason=null.",
      "maintenance_plan ready pages set cursor.nextAfterActionId to the last returned action id and cursor.hasMore for remaining pages.",
      "maintenance_plan nextExecutableAction and nextReviewAction point only at the first executable/review action in the current returned page.",
      "maintenance_plan afterActionId cursor misses return cursor.found=false and cursor.reason.",
      "maintenance_plan missing cursors return cursor.nextAfterActionId=null and cursor.hasMore=false.",
    ].join("\n"),
  };
}

function assertPnpmScriptsExist(text) {
  for (const [, script] of text.matchAll(/pnpm ([\w:-]+)/g)) {
    assert.equal(typeof ROOT_PKG.scripts?.[script], "string", `${script} exists in package.json`);
  }
}

function paginationSchemaFixture() {
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

function stringArrayMapSchemaFixture() {
  return {
    type: "object",
    additionalProperties: {
      type: "array",
      items: { type: "string" },
    },
  };
}

function conceptNeighborsSchemaFixture() {
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

function outgoingEdgesSchemaFixture() {
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

function vaultWarningsSchemaFixture() {
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

function backlinkRewritePlanSchemaFixture() {
  const keyChange = {
    type: "object",
    required: ["key"],
    properties: {
      key: { type: "string" },
      before: { type: ["array", "string"], items: { type: "string" } },
      after: { type: ["array", "string"], items: { type: "string" } },
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
          required: ["slug", "beforeKeys", "afterKeys", "bodyChanged"],
          properties: {
            slug: { type: "string" },
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

function capturedDocSchemaFixture() {
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

function backlinkRowSchemaFixture() {
  return {
    type: "object",
    required: ["slug", "kind", "title", "mtime"],
    properties: {
      slug: { type: "string" },
      kind: { type: "string" },
      title: { type: "string" },
      domain: { type: "string" },
      mtime: { type: "number", minimum: 0 },
      matchedKeys: { type: "array", items: { type: "string" } },
      matchedInBody: { type: "boolean" },
    },
    additionalProperties: false,
  };
}

function relationArrayPatchSchemaFixture() {
  return {
    type: "object",
    properties: Object.fromEntries(
      GRAPH_ARRAY_KEYS.map((key) => [key, { type: "array", items: { type: "string", minLength: 1 } }]),
    ),
    additionalProperties: false,
  };
}

function postWriteMaintenanceSchemaFixture() {
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

function makeDogfoodToolsList() {
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
        tool.description = "Graph query tool with current-page `nextExecutableAction` / `nextReviewAction` pointers and cursor `nextAfterActionId`/`hasMore` pagination metadata.";
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
        };
        tool.outputSchema = {
          type: "object",
          required: ["total", "vaultRoot", "nodes"],
          properties: {
            total: { type: "integer", minimum: 0 },
            vaultRoot: { type: "string", minLength: 1 },
            nodes: {
              type: "array",
              items: {
                type: "object",
                required: ["slug", "kind", "title", "mtime"],
                properties: {
                  slug: { type: "string" },
                  kind: { type: "string" },
                  title: { type: "string" },
                  mtime: { type: "number", minimum: 0 },
                },
                additionalProperties: false,
              },
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
          "Fetch multiple nodes in one call and saves K-1 round-trips. Order of `concepts[]` matches input `slugs[]`; Missing or invalid slug rows return errors while later valid slugs still resolve.";
        tool.inputSchema.required = ["slugs"];
        tool.inputSchema.properties.slugs = {
          type: "array",
          maxItems: 50,
          items: { type: "string" },
          description:
            'Vault-relative slugs, unique tail slugs, or frontmatter `slug` aliases. Max 50 per call.',
        };
        tool.outputSchema = {
          type: "object",
          required: ["concepts"],
          properties: {
            concepts: {
              type: "array",
              items: {
                type: "object",
                required: ["ok", "slug"],
                properties: {
                  ok: { type: "boolean" },
                  slug: { type: "string" },
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
        tool.outputSchema = {
          type: "object",
          required: ["slug", "frontmatter", "excerpt", "neighbors", "outgoingEdges", "mtime"],
          properties: {
            slug: { type: "string" },
            frontmatter: { type: "object" },
            excerpt: { type: "string" },
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
                required: ["slug", "kind", "title", "mtime", "matchedIn", "excerpt"],
                properties: {
                  slug: { type: "string" },
                  kind: { type: "string" },
                  title: { type: "string" },
                  mtime: { type: "number", minimum: 0 },
                  matchedIn: { enum: ["frontmatter", "body"] },
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
                required: ["slug", "kind", "title", "mtime"],
                properties: {
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
                required: ["slug", "kind", "title", "mtime"],
                properties: {
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
          required: ["scanned", "problems", "summary"],
          properties: {
            scanned: { type: "integer", minimum: 0 },
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
                required: ["slug", "kind", "title", "mtime"],
                properties: {
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
                required: ["slug", "kind", "title", "mtime"],
                properties: {
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
                required: ["slug", "kind", "title", "mtime", "outDegree", "inDegree"],
                properties: {
                  slug: { type: "string" },
                  kind: { type: "string" },
                  title: { type: "string" },
                  mtime: { type: "number", minimum: 0 },
                  outDegree: { type: "integer", minimum: 0 },
                  inDegree: { type: "integer", minimum: 0 },
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
          "Analyze a code repository and propose ontology node candidates; side effect 0 (vault frontmatter NOT modified). Returns deterministic candidates agents should review and selectively pass to add_concept to bootstrap the ontology. Single source of truth preserved.";
        tool.inputSchema.properties.rootPath = {
          type: "string",
          minLength: 1,
          description: "Repository root to analyze. Defaults to the MCP server cwd.",
        };
        tool.outputSchema = {
          type: "object",
          required: ["rootPath", "framework", "domains", "capabilities", "elements", "suggestedRelations", "skipped"],
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
          },
          additionalProperties: false,
        };
      }
      if (name === "infer_imports") {
        tool.description =
          "Walk TS/JS files in a code repo and infer file-level + module-level import edges; side effect 0 (vault frontmatter NOT modified). Agent reviews moduleEdges with kindCounts and selectively passes accepted edges to add_relation as `depends_on`. Use after analyze_repo_structure, not just suggestedRelations heuristics. Single source of truth preserved.";
        tool.inputSchema.properties.maxFiles = {
          type: "integer",
          minimum: 1,
          maximum: 50000,
          description: "Hard stop, default 5000, max 50000 to avoid pathological monorepos.",
        };
        tool.outputSchema = {
          type: "object",
          required: ["rootPath", "filesScanned", "edges", "externalImports", "unresolved", "moduleEdges"],
          properties: {
            rootPath: { type: "string" },
            filesScanned: { type: "integer", minimum: 0 },
            edges: {
              type: "array",
              items: {
                type: "object",
                required: ["from", "to", "kind"],
                properties: {
                  from: { type: "string" },
                  to: { type: "string" },
                  kind: { enum: IMPORT_EDGE_KIND_VALUES },
                },
                additionalProperties: false,
              },
            },
            externalImports: {
              type: "array",
              items: {
                type: "object",
                required: ["from", "spec"],
                properties: {
                  from: { type: "string" },
                  spec: { type: "string" },
                },
                additionalProperties: false,
              },
            },
            unresolved: {
              type: "array",
              items: {
                type: "object",
                required: ["from", "spec", "reason"],
                properties: {
                  from: { type: "string" },
                  spec: { type: "string" },
                  reason: { enum: IMPORT_UNRESOLVED_REASON_VALUES },
                },
                additionalProperties: false,
              },
            },
            moduleEdges: {
              type: "array",
              items: {
                type: "object",
                required: ["from", "to", "count", "kindCounts"],
                properties: {
                  from: { type: "string" },
                  to: { type: "string" },
                  count: { type: "integer", minimum: 1 },
                  kindCounts: {
                    type: "object",
                    properties: {
                      ...Object.fromEntries(
                        IMPORT_EDGE_KIND_VALUES.map((kind) => [kind, { type: "integer", minimum: 1 }]),
                      ),
                    },
                    additionalProperties: false,
                    minProperties: 1,
                  },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        };
      }
      if (name === "get_concepts") {
        tool.inputSchema.required = ["slugs"];
        tool.inputSchema.properties.slugs = {
          ...tool.inputSchema.properties.slugs,
          type: "array",
          maxItems: 50,
        };
      }
      if (name === "add_concepts") {
        tool.description += " Batch rows isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels, unknown-field rows report every unknown field with nearest hints and Received fields, and duplicate input slugs report the later concepts[n] row plus first-seen `concepts[m]`.";
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
        tool.description += " Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels; unknown type rows include a closest-value hint and unknown-field rows report every unknown field with nearest hints and Received fields.";
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
        tool.inputSchema.properties.type = {
          type: "string",
          enum: WRITE_RELATION_TYPE_VALUES,
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
      if (["rename_concept", "merge_concepts", "delete_concept"].includes(name)) {
        tool.inputSchema.properties.confirm = { type: "boolean" };
      }
      if (name === "rename_concept") {
        tool.inputSchema.properties.overwrite = { type: "boolean" };
        tool.outputSchema = {
          type: "object",
          required: ["ok", "oldSlug", "newSlug", "sourcePath", "targetPath", "moved", "backlinkUpdates"],
          properties: {
            ok: { type: "boolean" },
            dryRun: { type: "boolean" },
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
          required: ["ok", "fromSlug", "intoSlug", "fromPath", "deleted", "backlinkUpdates", "capturedFrom"],
          properties: {
            ok: { type: "boolean" },
            dryRun: { type: "boolean" },
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
          required: ["ok", "slug", "filePath"],
          properties: {
            ok: { type: "boolean" },
            dryRun: { type: "boolean" },
            slug: { type: "string" },
            filePath: { type: "string" },
            backlinks: { type: "array", items: backlinkRowSchemaFixture() },
            message: { type: "string" },
            forced: { type: "boolean" },
            backlinksAtDelete: { type: "array", items: backlinkRowSchemaFixture() },
            changed: { type: "boolean" },
            captured: capturedDocSchemaFixture(),
            postWriteMaintenance: postWriteMaintenanceSchemaFixture(),
          },
          additionalProperties: false,
        };
      }
      return tool;
    }),
  };
}

function batchCapError(noun) {
  const text = `Too many ${noun}: 51. Max 50 per call.`;
  return {
    result: {
      isError: true,
      content: [{ text }],
      structuredContent: { ok: false, errorCode: "invalid_arguments", error: text },
    },
  };
}

const okShape = {
  initialize: makeDogfoodInitialize(),
  toolsList: makeDogfoodToolsList(),
  kinds: { total: 1, byKind: { project: 1 } },
  kindsStructured: { total: 1, byKind: { project: 1 } },
  list: {
    total: 1,
    vaultRoot: "/tmp/vault",
    nodes: [{ slug: "project", kind: "project", title: "Project", mtime: 1 }],
  },
  listStructured: {
    total: 1,
    vaultRoot: "/tmp/vault",
    nodes: [{ slug: "project", kind: "project", title: "Project", mtime: 1 }],
  },
  projectProbe: {
    total: 1,
    vaultRoot: "/tmp/vault",
    nodes: [{ slug: "project", kind: "project", title: "Project", mtime: 1 }],
  },
  projectProbeStructured: {
    total: 1,
    vaultRoot: "/tmp/vault",
    nodes: [{ slug: "project", kind: "project", title: "Project", mtime: 1 }],
  },
  batch: {
    concepts: [
      {
        ok: true,
        slug: "project",
        frontmatter: { kind: "project", title: "Project" },
        excerpt: "Project excerpt",
        mtime: 1,
      },
      {
        ok: true,
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
        slug: "project",
        frontmatter: { kind: "project", title: "Project" },
        excerpt: "Project excerpt",
        mtime: 1,
      },
      {
        ok: true,
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
    elements: [{ slug: "elements/src/views/home", title: "Home", evidence: { source: "src/views/home" } }],
    suggestedRelations: [{ from: "sample", to: "capabilities/auth", type: "contains" }],
    skipped: [{ path: "src/.cache", reason: "dotfile/ignore" }],
  },
  analyzedRepoStructured: {
    rootPath: "/repo",
    framework: "fsd",
    project: { slug: "sample", title: "Sample" },
    domains: [{ slug: "domains/auth", title: "Auth", evidence: { source: "README.md", line: 3 } }],
    capabilities: [{ slug: "capabilities/auth", title: "Auth", evidence: { source: "src/features/auth" } }],
    elements: [{ slug: "elements/src/views/home", title: "Home", evidence: { source: "src/views/home" } }],
    suggestedRelations: [{ from: "sample", to: "capabilities/auth", type: "contains" }],
    skipped: [{ path: "src/.cache", reason: "dotfile/ignore" }],
  },
  inferredImports: {
    rootPath: "/repo",
    filesScanned: 2,
    edges: [{ from: "src/features/auth/index.ts", to: "src/entities/user/index.ts", kind: "static" }],
    externalImports: [{ from: "src/features/auth/index.ts", spec: "zod" }],
    unresolved: [{ from: "src/features/auth/index.ts", spec: "@/missing", reason: "alias-not-found" }],
    moduleEdges: [{ from: "capabilities/auth", to: "capabilities/user", count: 1, kindCounts: { static: 1 } }],
  },
  inferredImportsStructured: {
    rootPath: "/repo",
    filesScanned: 2,
    edges: [{ from: "src/features/auth/index.ts", to: "src/entities/user/index.ts", kind: "static" }],
    externalImports: [{ from: "src/features/auth/index.ts", spec: "zod" }],
    unresolved: [{ from: "src/features/auth/index.ts", spec: "@/missing", reason: "alias-not-found" }],
    moduleEdges: [{ from: "capabilities/auth", to: "capabilities/user", count: 1, kindCounts: { static: 1 } }],
  },
  renameDryRunRes: {
    result: {
      content: [
        {
          text: JSON.stringify({
            ok: false,
            dryRun: true,
            oldSlug: "capabilities/mcp-server",
            newSlug: "capabilities/mcp-server-dogfood-dry-run",
            sourcePath: "/tmp/vault/capabilities/mcp-server.md",
            targetPath: "/tmp/vault/capabilities/mcp-server-dogfood-dry-run.md",
            moved: false,
            backlinkUpdates: {},
            message: "dry-run — confirm:true to apply",
          }),
        },
      ],
      structuredContent: {
        ok: false,
        dryRun: true,
        oldSlug: "capabilities/mcp-server",
        newSlug: "capabilities/mcp-server-dogfood-dry-run",
        sourcePath: "/tmp/vault/capabilities/mcp-server.md",
        targetPath: "/tmp/vault/capabilities/mcp-server-dogfood-dry-run.md",
        moved: false,
        backlinkUpdates: {},
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
            fromSlug: "capabilities/mcp-server",
            intoSlug: "domains/ai-agent-partner",
            fromPath: "/tmp/vault/capabilities/mcp-server.md",
            deleted: false,
            backlinkUpdates: {},
            capturedFrom: {},
            message: "dry-run — confirm:true to apply",
          }),
        },
      ],
      structuredContent: {
        ok: false,
        dryRun: true,
        fromSlug: "capabilities/mcp-server",
        intoSlug: "domains/ai-agent-partner",
        fromPath: "/tmp/vault/capabilities/mcp-server.md",
        deleted: false,
        backlinkUpdates: {},
        capturedFrom: {},
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
    nodes: [{ slug: "project", kind: "project", title: "Project", mtime: 1, outDegree: 2, inDegree: 0 }],
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
    totalPaths: 2,
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
    matchingEdges: [
      {
        from: "capabilities/mcp-server",
        to: "domains/ai-agent-partner",
        via: "domain",
      },
    ],
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
      content: [{ text: 'Unknown argument "lmit" for list_concepts. Did you mean "limit"? Allowed arguments: kind, limit. Received arguments: lmit.' }],
      structuredContent: {
        ok: false,
        errorCode: "unknown_argument",
        error: 'Unknown argument "lmit" for list_concepts. Did you mean "limit"? Allowed arguments: kind, limit. Received arguments: lmit.',
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
      },
    },
  },
  strictEnum: {
    result: {
      isError: true,
      content: [{ text: 'operation must be one of: overview, health. Received: "overveiw". Did you mean "overview"?' }],
    },
  },
  strictMaintenancePhaseFilter: {
    result: {
      isError: true,
      content: [{ text: 'phases items must be one of: validate, repair, link, materialize, review. Received: "repiar". Did you mean "repair"?' }],
    },
  },
  strictMaintenanceSeverityFilter: {
    result: {
      isError: true,
      content: [{ text: 'severities items must be one of: fail, warn, info. Received: "fatal". Did you mean "fail"?' }],
    },
  },
  strictMaintenanceKindFilter: {
    result: {
      isError: true,
      content: [{ text: 'kinds items must be one of: inspect_compile_issue, break_dependency_cycle, canonicalize_graph_arrays, resolve_dangling_reference, add_missing_relation, materialize_external_element, unassigned_node, empty_domain. Received: "add_mising_relation". Did you mean "add_missing_relation"?' }],
    },
  },
  strictRelationFilter: {
    result: {
      isError: true,
      content: [{ text: 'dependencyTypes items must be one of: domains, domain, capabilities, elements, dependencies, depends_on, relates, contains, describes. Received: "depend_on". Did you mean "depends_on"?' }],
    },
  },
  strictFindNeighborsTypeFilter: {
    result: {
      isError: true,
      content: [{ text: 'types items must be one of: domains, domain, capabilities, elements, dependencies, depends_on, relates, contains, describes. Received: "depend_on". Did you mean "depends_on"?' }],
    },
  },
  strictFindOrphansKindFilter: {
    result: {
      isError: true,
      content: [{ text: 'kind must be one of: project, domain, capability, element, document, vault-readme. Received: "capabilty". Did you mean "capability"?' }],
    },
  },
  strictFindOrphansExcludeKindFilter: {
    result: {
      isError: true,
      content: [{ text: 'excludeKinds items must be one of: project, domain, capability, element, document, vault-readme. Received: "capabilty". Did you mean "capability"?' }],
    },
  },
  strictQueryConceptsKindFilter: {
    result: {
      isError: true,
      content: [{ text: 'kind must be one of: project, domain, capability, element, document, vault-readme. Received: "capabilty". Did you mean "capability"?' }],
    },
  },
  strictQueryConceptsHasKeyFilter: {
    result: {
      isError: true,
      content: [{ text: 'has key must be one of: domains, capabilities, elements, dependencies, relates, contains, describes, depends_on. Received: "capabilties". Did you mean "capabilities"?' }],
    },
  },
  strictListConceptsKindFilter: {
    result: {
      isError: true,
      content: [{ text: 'kind must be one of: project, domain, capability, element, document, vault-readme. Received: "capabilty". Did you mean "capability"?' }],
    },
  },
  strictRelationCheck: {
    result: {
      isError: true,
      content: [{ text: 'type must be one of: domains, domain, capabilities, elements, dependencies, depends_on, relates, contains, describes. Received: "depend_on". Did you mean "depends_on"?' }],
    },
  },
  strictAddRelation: {
    result: {
      isError: true,
      content: [{ text: 'type must be one of: depends_on, relates, contains, describes, domains, capabilities, elements, domain. Received: "depend_on". Did you mean "depends_on"?' }],
    },
  },
  strictGraphKindFilter: {
    result: {
      isError: true,
      content: [{ text: 'kind must be one of: project, domain, capability, element, document, vault-readme. Received: "capabilty". Did you mean "capability"?' }],
    },
  },
  strictRecommendRelationsKindFilter: {
    result: {
      isError: true,
      content: [{ text: 'kind must be one of: capability, element. Received: "capabilty". Did you mean "capability"?' }],
    },
  },
  strictRecommendRelationsUnsupportedKindFilter: {
    result: {
      isError: true,
      content: [{ text: 'kind must be one of: capability, element. Received: "domain".' }],
    },
  },
  strictMatchNodesSortFilter: {
    result: {
      isError: true,
      content: [{ text: 'sort must be one of: degree, inDegree, outDegree, slug. Received: "outDegre". Did you mean "outDegree"?' }],
    },
  },
  strictMatchEdgesTypeFilter: {
    result: {
      isError: true,
      content: [{ text: 'type must be one of: domains, domain, capabilities, elements, dependencies, depends_on, relates, contains, describes. Received: "depend_on". Did you mean "depends_on"?' }],
    },
  },
  strictGraphFromKindFilter: {
    result: {
      isError: true,
      content: [{ text: 'fromKind must be one of: project, domain, capability, element, document, vault-readme. Received: "capabilty". Did you mean "capability"?' }],
    },
  },
  strictGraphToKindFilter: {
    result: {
      isError: true,
      content: [{ text: 'toKind must be one of: project, domain, capability, element, document, vault-readme, external, unresolved. Received: "externl". Did you mean "external"?' }],
    },
  },
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
        { id: "components", severity: "info", count: 6 },
        { kind: "materialize_external_elements", severity: "warn", count: 2 },
        { kind: "resolve_dangling_references", severity: "fail" },
        { kind: "add_missing_relations", severity: "warn", count: 4 },
      ]),
      "components:info:6, materialize_external_elements:warn:2, resolve_dangling_references:fail, +1 more",
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
    assert.equal(writeRowLabelGuidanceSummary(missingConcepts), "missing add_concepts concepts[n], add_concepts multi-field Received fields, add_concepts duplicate first-seen");

    const missingConceptsReceivedFields = makeDogfoodToolsList().tools;
    missingConceptsReceivedFields.find((tool) => tool.name === "add_concepts").description =
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels.";
    assert.equal(writeRowLabelGuidanceSummary(missingConceptsReceivedFields), "missing add_concepts multi-field Received fields, add_concepts duplicate first-seen");

    const missingConceptsEveryUnknownField = makeDogfoodToolsList().tools;
    missingConceptsEveryUnknownField.find((tool) => tool.name === "add_concepts").description =
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels, unknown-field rows include Received fields, and duplicate input slugs report the later concepts[n] row plus first-seen `concepts[m]`.";
    assert.equal(writeRowLabelGuidanceSummary(missingConceptsEveryUnknownField), "missing add_concepts multi-field Received fields");

    const missingConceptsDuplicate = makeDogfoodToolsList().tools;
    missingConceptsDuplicate.find((tool) => tool.name === "add_concepts").description =
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels and unknown-field rows report every unknown field with nearest hints and Received fields.";
    assert.equal(writeRowLabelGuidanceSummary(missingConceptsDuplicate), "missing add_concepts duplicate first-seen");

    const missingRelations = makeDogfoodToolsList().tools;
    missingRelations.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows.";
    assert.equal(writeRowLabelGuidanceSummary(missingRelations), "missing add_relations relations[n], add_relations multi-field Received fields, add_relations closest-value type hint");

    const missingRelationsReceivedFields = makeDogfoodToolsList().tools;
    missingRelationsReceivedFields.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape and unknown row fields as ok:false rows with relations[n] labels.";
    assert.equal(writeRowLabelGuidanceSummary(missingRelationsReceivedFields), "missing add_relations multi-field Received fields, add_relations closest-value type hint");

    const missingRelationsEveryUnknownField = makeDogfoodToolsList().tools;
    missingRelationsEveryUnknownField.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels; unknown type rows include a closest-value hint and unknown-field rows include Received fields.";
    assert.equal(writeRowLabelGuidanceSummary(missingRelationsEveryUnknownField), "missing add_relations multi-field Received fields");

    const missingRelationsClosestValue = makeDogfoodToolsList().tools;
    missingRelationsClosestValue.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels and unknown-field rows report every unknown field with nearest hints and Received fields.";
    assert.equal(writeRowLabelGuidanceSummary(missingRelationsClosestValue), "missing add_relations closest-value type hint");

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
      "23/23 titled; 15/15 read; 8/8 write; 3/3 destructive; 2/2 idempotent; 22/23 local-only",
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

  it("summarizes strict closest-value smoke details for final dogfood output", () => {
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
    assert.match(dogfoodTimeoutErrorMessage("1000ms"), /OMOT_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk/);
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
    assert.match(usage, /OMOT_DOGFOOD_TIMEOUT_MS/);
    assert.match(usage, /OMOT_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk/);
    assert.match(usage, /Lighter dogfood gates:/);
    assert.match(usage, /pnpm dogfood:compile\s+Fast compile_ontology summary over docs\/ontology/);
    assert.match(usage, /pnpm dogfood:health\s+Fail-closed health JSON gate over docs\/ontology/);
    assert.match(usage, /pnpm dogfood:brief\s+First-contact workspace_brief JSON snapshot over docs\/ontology/);
    assert.match(usage, /pnpm dogfood:verify\s+Installed-style verify gate over docs\/ontology before the full walk/);
    assert.match(usage, /pnpm test:mcp:dogfood:timeout/);
    assert.match(usage, /Narrow dogfood timeout\/help retry diagnostics/);
    assert.match(usage, /pnpm dogfood:test\s+Full dogfood helper regression suite when focused checks are not enough/);
    assert.match(usage, /Dogfood helper, compile\/index gates, tools\/list inventory names \+ annotation coverage, row-label guidance, batch cap gates, strict closest-value summary, vault warning and validate_vault problem gates, first-contact health\/growth\/sample-shape gates, maintenance work-queue shape \+ formatter checks, initialize safety\/recovery guidance, destructive dry-run, help\/argument\/timeout handling, structuredContent, strict relation filters, strict add_relation type-preflight, strict graph kind filters, stderr warning checks/);
    assertPnpmScriptsExist(usage);
  });

  it("dogfood help — helper uses natural exit so verbose stdout can flush", () => {
    const source = readFileSync("scripts/dogfood-mcp-walk.mjs", "utf-8");

    assert.doesNotMatch(source, /\bprocess\.exit\s*\(/);
    assert.doesNotMatch(source, /spawn\("node", \[SERVER\]/);
    assert.match(source, /spawn\(process\.execPath, \[SERVER\]/);
    assert.match(source, /process\.exitCode\s*=\s*await main\(\)\.catch/);
    assert.match(source, /return 2/);
    assert.match(source, /return 1/);
  });

  it("rejects unsupported dogfood arguments before starting MCP", () => {
    assert.deepEqual(parseDogfoodArgs(["docs/ontology"]), {
      help: false,
      error: "dogfood:walk does not accept arguments: docs/ontology",
    });
    assert.deepEqual(parseDogfoodArgs(["--", "docs/ontology"]), {
      help: false,
      error: "dogfood:walk does not accept arguments: docs/ontology",
    });
    assert.deepEqual(parseDogfoodArgs(["--vault", "docs/ontology"]), {
      help: false,
      error: "dogfood:walk does not accept arguments: --vault, docs/ontology",
    });
    assert.deepEqual(parseDogfoodArgs(["--hlep"]), {
      help: false,
      error: "dogfood:walk does not accept arguments: --hlep. Did you mean --help?",
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
    assert.match(failure, /Increase OMOT_DOGFOOD_TIMEOUT_MS for slow dogfood runs\./);
    assert.match(failure, /OMOT_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk/);
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
    assert.match(failure, /OMOT_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk/);
  });

  it("keeps dogfood batch cap requests read-safe or rejected before writes", () => {
    const requests = buildDogfoodRequests();
    const getConceptsBatchCap = requests.find((request) => request.id === 81);
    const addConceptsBatchCap = requests.find((request) => request.id === 82);
    const addRelationsBatchCap = requests.find((request) => request.id === 83);

    assert.equal(getConceptsBatchCap?.params?.name, "get_concepts");
    assert.equal(getConceptsBatchCap?.params?.arguments?.slugs?.length, 51);
    assert.equal(addConceptsBatchCap?.params?.name, "add_concepts");
    assert.equal(addConceptsBatchCap?.params?.arguments?.concepts?.length, 51);
    assert.equal(addRelationsBatchCap?.params?.name, "add_relations");
    assert.equal(addRelationsBatchCap?.params?.arguments?.relations?.length, 51);
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
    assert.deepEqual(stderrWarningLines("[oh-my-ontology-mcp] connected. vault=/tmp/x"), []);
    assert.deepEqual(stderrWarningFailures("[oh-my-ontology-mcp] connected. vault=/tmp/x"), []);
    assert.deepEqual(
      stderrWarningLines(
        "[oh-my-ontology-mcp] connected. vault=/tmp/x\n(node:1) MaxListenersExceededWarning: Possible EventEmitter memory leak detected",
      ),
      ["(node:1) MaxListenersExceededWarning: Possible EventEmitter memory leak detected"],
    );
    assert.deepEqual(
      stderrWarningFailures(
        "[oh-my-ontology-mcp] connected. vault=/tmp/x\n(node:1) MaxListenersExceededWarning: Possible EventEmitter memory leak detected",
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
          instructions: okShape.initialize.instructions.replace("Tool errors include structuredContent.errorCode values such as unknown_argument and invalid_arguments.", "Tool errors are plain text."),
        },
      }),
      ["initialize: initialize instructions missing structured errorCode guidance"],
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
      ["tools/list: tools mismatch — missing: (none), extra: (none), duplicates: list_concepts, invalidNames: 0"],
    );
    const invalidInventory = makeDogfoodToolsList();
    invalidInventory.tools.push({ name: "" }, {});
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: invalidInventory }),
      [
        "tools/list: tools mismatch — missing: (none), extra: (none), duplicates: (none), invalidNames: 2",
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
      ["tools/list: add_relations description missing multi-field received fields guidance"],
    );
    const addRelationsClosestValueGuidanceDrifted = makeDogfoodToolsList();
    addRelationsClosestValueGuidanceDrifted.tools.find((tool) => tool.name === "add_relations").description =
      "Batch rows isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels and unknown-field rows report every unknown field with nearest hints and Received fields.";
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, toolsList: addRelationsClosestValueGuidanceDrifted }),
      ["tools/list: add_relations description missing closest-value type guidance"],
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
      ["strict_args: strict arguments structured error code mismatch — expected unknown_argument, got invalid_arguments"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictArgs: structuredError('Unknown argument "lmit" for list_concepts.') }),
      ["strict_args: strict arguments response did not suggest the closest list_concepts argument"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({ ...okShape, strictArgs: structuredError('Unknown argument "lmit" for list_concepts. Did you mean "limit"?') }),
      ["strict_args: strict arguments response did not report the received list_concepts arguments"],
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
      ["add_relations_batch_cap: add_relations batch cap structured error code mismatch — expected invalid_arguments, got unknown_argument"],
    );
  });

  it("fails on malformed list_kinds payloads", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      kinds: { total: 2, byKind: { project: 1 } },
    });
    assert.deepEqual(failures, ["list_kinds response total mismatch — total 2, byKind 1"]);
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
        projectProbe: { total: 0, vaultRoot: "/tmp/vault", nodes: [] },
      }),
      ["project_probe response missing project node"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectProbe: { total: 1, nodes: [{ slug: "project", kind: "project", title: "Project", mtime: 1 }] },
      }),
      ["project_probe: list_concepts response missing vaultRoot"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectProbe: {
          total: 1,
          vaultRoot: "/tmp/vault",
          nodes: [{ slug: "capabilities/not-project", kind: "capability", title: "Wrong", mtime: 1 }],
        },
      }),
      ["project_probe returned non-project node: capabilities/not-project"],
    );
    assert.deepEqual(
      evaluateDogfoodGate({
        ...okShape,
        projectProbe: {
          total: 2,
          vaultRoot: "/tmp/vault",
          nodes: [{ slug: "project", kind: "project", title: "Project", mtime: 1 }],
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
        'get_concepts structuredContent mismatch — $.concepts[1]: parsed {"ok":true,"slug":"capabilities/mcp-server","frontmatter":{"kind":"capability","title":"MCP S..., structuredContent undefined',
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
          nextActions: [{ kind: "add_missing_relations", severity: "info", count: 1 }],
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
          nextActions: [{ id: "compile_issues" }],
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
          nextActions: [{ id: "compile_issues", severity: "fatal" }],
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
          nextActions: [{ id: "components", severity: "info", count: -1 }],
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
          nextActions: [{ id: "components", severity: "info", count: 1.5 }],
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
      ["compile_ontology response byKind mismatch — nodeCount 1, byKind 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate(withCompiled({ ...okShape.compiled, edgeCount: 2, resolvedEdgeCount: 1, externalEdgeCount: 0, unresolvedEdgeCount: 1 })),
      [],
    );
    assert.deepEqual(
      evaluateDogfoodGate(withCompiled({ ...okShape.compiled, edgeCount: 3, resolvedEdgeCount: 1, externalEdgeCount: 1 })),
      ["compile_ontology response edge count mismatch — edgeCount 3, resolved+external+unresolved 2"],
    );
    assert.deepEqual(
      evaluateDogfoodGate(withCompiled({ ...okShape.compiled, edgeCount: 1, resolvedEdgeCount: 1, externalEdgeCount: 1 })),
      ["compile_ontology response edge count mismatch — edgeCount 1, resolved+external+unresolved 2"],
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
      ["overview response edge count mismatch — edges 3, resolved+external+unresolved 2"],
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
      evaluateDogfoodGate({ ...okShape, relationCheck: { ...okShape.relationCheck, matchingEdges: [] } }),
      ["relation_check exists without matchingEdges"],
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
      ["similar_nodes response missing existing mcp-server match"],
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
      ["path operation expected mcp-server → vault-local-first path"],
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
      evaluateDogfoodGate({ ...okShape, list: { ...okShape.list, total: 2 } }),
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
      "list_concepts vaultWarnings present — errors 0, warnings 1. Run validate_vault for file-level diagnostics before writing.",
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
      "validate_vault found 1 problem file — errors 1, warnings 0 — codes missing-kind:error:1",
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
      "find_path: expected mcp-server → vault-local-first path",
    ]);
  });

  it("fails on unhealthy first-contact diagnosis", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      brief: { ...okShape.brief, status: "needs_attention" },
      health: { ...okShape.health, status: "needs_attention" },
    });
    assert.deepEqual(failures, [
      "workspace_brief: status needs_attention (1 node, 0 next actions, 1 health check, growth actions:0 external:0 ignoredExternal:0)",
      "health: status needs_attention (issues:0, unresolved:0, cycles:0, 1 check)",
    ]);
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
          { kind: "materialize_external_elements", severity: "warn", count: 2 },
          { kind: "resolve_dangling_references", severity: "fail", count: 1 },
        ],
      },
    });
    assert.deepEqual(failures, [
      "workspace_brief: actionable nextActions materialize_external_elements:warn:2, resolve_dangling_references:fail:1",
    ]);
  });
});
