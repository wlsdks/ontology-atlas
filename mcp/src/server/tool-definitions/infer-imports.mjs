import {
  IMPORT_EDGE_KIND_VALUES,
  IMPORT_SOURCE_ROLE_VALUES,
  IMPORT_UNRESOLVED_REASON_VALUES,
  IMPORT_USAGE_VALUES,
} from '../../infer-imports.mjs';
import {
  IGNORE_ARRAY_MAX_ITEMS,
  SOURCE_FOLDER_ARRAY_MAX_ITEMS,
} from '../tool-schemas/array-limits.mjs';
import { IMPORT_EDGE_KIND_DESCRIPTION } from '../tool-schemas/enum-descriptions.mjs';
import { NON_BLANK_STRING_SCHEMA } from '../tool-schemas/field-primitives.mjs';
import {
  GO_PACKAGE_IMPORT_EVIDENCE_OUTPUT_SCHEMA,
  GO_PACKAGE_IMPORT_EVIDENCE_SUMMARY_SCHEMA,
  IMPORT_RECONCILIATION_EDGE_SCHEMA,
  IMPORT_RECONCILIATION_SUMMARY_SCHEMA,
  IMPORT_SCAN_COVERAGE_OUTPUT_SCHEMA,
  IMPORT_STALE_EDGE_FOLLOW_UP_SCHEMA,
} from '../tool-schemas/repository-evidence.mjs';

export const INFER_IMPORTS_TOOL = {
  name: 'infer_imports',
  description:
    'R17 (autonomous ingest deeper) — walk TS/JS files in a code repo and infer file-level + module-level import edges. It also walks bounded root Python packages, bounded src/source-layout Python packages, and deterministic Rust use/file-module/literal-include dependencies. A valid root Go module additionally exposes typed local package-import evidence; it stays separate from legacy file edges and never self-approves a semantic relation. ' +
    'Structured `coverage` names the supported languages; Rust support is bounded static text evidence and does not expand macros, evaluate cfg, resolve symbols, or prove runtime impact. ' +
    'side effect 0 (vault frontmatter NOT modified). `moduleEdges` are source-backed review candidates, never self-approving semantic `depends_on` relations. ' +
    'When you know an implementation file, set `focusPath` (or `reviewMode:"focus"`) before considering `full`: Atlas returns bounded exact incoming/outgoing static import receipts, counts, and a cursor without requiring a vault. This focused source boundary is not runtime impact or a semantic relation. ' +
    'Omit `reviewMode` for size-safe automatic delivery: scans whose estimated full MCP result is at most 128 KiB keep the complete response; larger reconciled scans return exactly one compact, non-writing `nextRelationReview:v1` packet plus a delivery receipt and stateless cursor. Use `reviewMode:"next"` to request that bounded packet explicitly. `reviewMode:"full"` preserves the complete shape, but a result over 128 KiB additionally requires `allowLargeResponse:true`; this second confirmation prevents coding agents from accidentally opting into a multi-megabyte response. Oversized raw scans without a loadable reconciliation vault fail with an actionable error instead of emitting an unbounded default response. Every compact candidate carries `absentEndpoints`. If an endpoint is missing, `nextCalls` is empty and `endpointModelling` separates an evidence-only analysis call from the complete `rootPath + proposal` validation contract, source-bound drafts, and queue resume. It never calls `get_concepts` or `relation_check` on a missing slug, never claims the analysis call created an endpoint, and never promotes a path-derived slug into a business kind or definition. ' +
    'Each module edge includes whole-edge source-role/import-usage counts, `productValueCount`, `kindCounts`, and a bounded exact file-edge `evidence` receipt. Missing vault edges remain `rationale_review_required`: inspect both concepts and the observed direction, ask the user, then call `add_relation` with an explicit `why`. Test-only or type-only evidence stays visible but must not be framed as a product depends_on approval question without separate product meaning evidence. ' +
    'Detects:\n' +
    '  - relative imports (./, ../) → resolved to file paths\n' +
    '  - dynamic import() / require() / export ... from\n' +
    '  - bare side-effect imports (import "X")\n' +
    '  - apps/* and packages/* workspace imports collapse to analyzer-compatible element slugs\n' +
    '  - bounded static Python import / from ... import statements in root or src/source-layout packages with __init__.py; imports nested under an explicit TYPE_CHECKING guard are type_only; source is parsed as text and never executed\n' +
    '  - external package imports listed separately\n' +
    '  - tsconfig.json compilerOptions.paths aliases first, then fallback common @/* aliases → resolved to internal files when the target exists; otherwise unresolved as alias-not-found\n\n' +
    'Use after analyze_repo_structure to pull *real* dependency edges from the code, not just suggestedRelations heuristics. ' +
    'Unless reconcile:false, also returns `reconciliation` (+ `reconciliationSummary` counts): the module edges diffed against the vault\'s compiled depends_on edges into `inBoth` / review-required missing edges / `inVaultNotInCode` (possibly-stale vault edges). Missing edges carry source evidence and a `rationale_review_required` gate, never a write action. ' +
    'Single source of truth preserved — inspect both concepts, explain why the semantic dependency holds, and ask the user before one explicit add_relation call with `why`.',
  inputSchema: {
    type: 'object',
    properties: {
      rootPath: {
        ...NON_BLANK_STRING_SCHEMA,
        description: 'Repository root to analyze. Defaults to the active resolved repository root from connection_info.',
      },
      sourceFolders: {
        type: 'array',
        maxItems: SOURCE_FOLDER_ARRAY_MAX_ITEMS,
        items: NON_BLANK_STRING_SCHEMA,
        description:
          "Source folders to walk (default: ['src','source','lib','app','apps','packages']). Nested scopes preserve repository-relative ontology endpoints. " +
          'If none exist, falls back to rootPath.',
      },
      ignore: {
        type: 'array',
        maxItems: IGNORE_ARRAY_MAX_ITEMS,
        items: NON_BLANK_STRING_SCHEMA,
        description:
          "Extra folder names to skip (added to defaults: node_modules, dist, build, …).",
      },
      maxFiles: {
        type: 'integer',
        minimum: 1,
        maximum: 50000,
        description:
          'Positive integer cap on files walked (default 5000, max 50000). Hard stop to avoid pathological monorepos.',
      },
      reconcile: {
        type: 'boolean',
        description:
          'Default true. When true, diff the inferred module edges against the vault\'s compiled depends_on edges and include `reconciliation` + `reconciliationSummary`. Set false to skip (raw scan only / no vault).',
      },
      reviewMode: {
        type: 'string',
        enum: ['full', 'next', 'focus'],
        description:
          'Omit for automatic delivery unless focusPath is present. `focus` returns a bounded exact file-level import neighborhood for focusPath. Otherwise responses estimated at or below 128 KiB keep the complete scan, while larger reconciled scans return one compact, non-writing review packet. `full` requests the complete scan; when it exceeds 128 KiB, also pass allowLargeResponse:true. `next` explicitly requests one compact packet and requires reconciliation.',
      },
      allowLargeResponse: {
        type: 'boolean',
        description:
          'Confirmation for reviewMode:"full" only. Required when the estimated complete MCP result exceeds 128 KiB. It never changes scan contents or writes the vault.',
      },
      afterReviewId: {
        ...NON_BLANK_STRING_SCHEMA,
        description:
          '`reviewMode:"next"` only. Pass the prior packet cursor.nextAfterReviewId to advance deterministically; omit to start at the first current candidate.',
      },
      focusPath: {
        ...NON_BLANK_STRING_SCHEMA,
        description:
          'Repository-relative implementation file to inspect. Supplying focusPath with omitted reviewMode selects focus mode automatically. Returns bounded incoming/outgoing supported static import receipts; it does not claim runtime or semantic impact.',
      },
      focusDirection: {
        type: 'string',
        enum: ['incoming', 'outgoing', 'both'],
        description: 'Focus mode only. Which exact file-level import direction to page (default both).',
      },
      focusLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Focus mode only. Maximum exact import receipts returned in one page (default 50, max 100).',
      },
      focusAfterEdgeId: {
        ...NON_BLANK_STRING_SCHEMA,
        description:
          'Focus mode only. Pass the prior focusReview.cursor.nextAfterEdgeId to advance deterministically; omit to start at the first current edge.',
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      rootPath: NON_BLANK_STRING_SCHEMA,
      filesScanned: { type: 'integer', minimum: 0 },
      coverage: IMPORT_SCAN_COVERAGE_OUTPUT_SCHEMA,
      edges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            from: NON_BLANK_STRING_SCHEMA,
            to: NON_BLANK_STRING_SCHEMA,
            kind: {
              type: 'string',
              enum: IMPORT_EDGE_KIND_VALUES,
            },
            sourceRole: { type: 'string', enum: IMPORT_SOURCE_ROLE_VALUES },
            importUsage: { type: 'string', enum: IMPORT_USAGE_VALUES },
          },
          required: ['from', 'to', 'kind', 'sourceRole', 'importUsage'],
          additionalProperties: false,
        },
      },
      externalImports: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            from: NON_BLANK_STRING_SCHEMA,
            spec: NON_BLANK_STRING_SCHEMA,
          },
          required: ['from', 'spec'],
          additionalProperties: false,
        },
      },
      unresolved: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            from: NON_BLANK_STRING_SCHEMA,
            spec: { type: 'string' },
            reason: {
              type: 'string',
              enum: IMPORT_UNRESOLVED_REASON_VALUES,
              description:
                'Why the import could not resolve. `empty` may have an empty spec; other reasons preserve the original import spec.',
            },
          },
          required: ['from', 'spec', 'reason'],
          additionalProperties: false,
        },
      },
      moduleEdges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            from: NON_BLANK_STRING_SCHEMA,
            to: NON_BLANK_STRING_SCHEMA,
            count: { type: 'integer', minimum: 1 },
            kindCounts: {
              type: 'object',
              properties: {
                ...Object.fromEntries(
                  IMPORT_EDGE_KIND_VALUES.map((kind) => [kind, { type: 'integer', minimum: 1 }]),
                ),
              },
              additionalProperties: false,
              minProperties: 1,
              description:
                `Import kind histogram for this collapsed module edge. Allowed keys: ${IMPORT_EDGE_KIND_DESCRIPTION}.`,
            },
            sourceRoleCounts: {
              type: 'object',
              properties: Object.fromEntries(
                IMPORT_SOURCE_ROLE_VALUES.map((role) => [role, { type: 'integer', minimum: 0 }]),
              ),
              required: IMPORT_SOURCE_ROLE_VALUES,
              additionalProperties: false,
              description: 'Whole-edge importer role histogram using deterministic path conventions.',
            },
            importUsageCounts: {
              type: 'object',
              properties: Object.fromEntries(
                IMPORT_USAGE_VALUES.map((usage) => [usage, { type: 'integer', minimum: 0 }]),
              ),
              required: IMPORT_USAGE_VALUES,
              additionalProperties: false,
              description: 'Whole-edge import usage histogram. `value` means the import is not explicit type-only syntax; it does not claim runtime execution.',
            },
            productValueCount: {
              type: 'integer',
              minimum: 0,
              description: 'Whole-edge joint count where sourceRole=production and importUsage=value. Never derive this intersection from marginal histograms.',
            },
            evidence: {
              type: 'array',
              maxItems: 5,
              description: 'Bounded exact file-level import receipts supporting this collapsed module edge.',
              items: {
                type: 'object',
                properties: {
                  from: NON_BLANK_STRING_SCHEMA,
                  to: NON_BLANK_STRING_SCHEMA,
                  kind: { type: 'string', enum: IMPORT_EDGE_KIND_VALUES },
                  sourceRole: { type: 'string', enum: IMPORT_SOURCE_ROLE_VALUES },
                  importUsage: { type: 'string', enum: IMPORT_USAGE_VALUES },
                },
                required: ['from', 'to', 'kind', 'sourceRole', 'importUsage'],
                additionalProperties: false,
              },
            },
            evidenceLimited: {
              type: 'boolean',
              description: 'True when more file edges exist than the bounded evidence receipt includes.',
            },
          },
          required: [
            'from',
            'to',
            'count',
            'kindCounts',
            'sourceRoleCounts',
            'importUsageCounts',
            'productValueCount',
            'evidence',
            'evidenceLimited',
          ],
          additionalProperties: false,
        },
      },
      packageImportEvidence: GO_PACKAGE_IMPORT_EVIDENCE_OUTPUT_SCHEMA,
      packageImportEvidenceSummary: GO_PACKAGE_IMPORT_EVIDENCE_SUMMARY_SCHEMA,
          reconciliation: {
        type: ['object', 'null'],
        description:
          'Module edges diffed against the vault\'s compiled depends_on edges (alias-normalized). null when no vault is loadable (e.g. scanning a foreign repo). Absent when reconcile:false.',
        properties: {
          inBoth: {
            type: 'array',
            items: {
              type: 'object',
              properties: { from: NON_BLANK_STRING_SCHEMA, to: NON_BLANK_STRING_SCHEMA },
              required: ['from', 'to'],
              additionalProperties: false,
            },
          },
          inCodeMissingFromVault: {
            type: 'array',
            description: 'Import-backed review candidates missing from the vault whose endpoints already exist. Each carries exact source evidence plus `rationale_review_required`; no write action is emitted.',
            items: IMPORT_RECONCILIATION_EDGE_SCHEMA,
          },
          inCodeMissingEndpointAbsent: {
            type: 'array',
            description: 'Import-backed review candidates whose from/to includes a slug not yet modelled as a vault node (`absentEndpoints`). Model endpoints, inspect evidence, supply semantic rationale, and obtain human approval before any relation write.',
            items: IMPORT_RECONCILIATION_EDGE_SCHEMA,
          },
          inVaultNotInCode: {
            type: 'array',
            description: 'vault depends_on edges with no matching code import — possibly stale, review before removing.',
            items: IMPORT_RECONCILIATION_EDGE_SCHEMA,
          },
        },
      },
      reconciliationSummary: IMPORT_RECONCILIATION_SUMMARY_SCHEMA,
      staleEdgeFollowUp: IMPORT_STALE_EDGE_FOLLOW_UP_SCHEMA,
      contract: { type: 'string', enum: ['inferImportsReview:v1', 'inferImportsFocus:v1'] },
      delivery: {
        type: 'object',
        description:
          'Present only when omitted reviewMode was automatically compacted because the estimated full MCP result exceeded the safe delivery boundary.',
        properties: {
          selection: { type: 'string', enum: ['automatic_compact'] },
          reason: { type: 'string', enum: ['estimated_full_response_exceeds_limit'] },
          estimatedFullResponseBytes: { type: 'integer', minimum: 1 },
          automaticLimitBytes: { type: 'integer', enum: [131072] },
          explicitFullAvailable: { type: 'boolean', enum: [true] },
          explicitFullArguments: {
            type: 'object',
            additionalProperties: false,
            properties: {
              reviewMode: { type: 'string', enum: ['full'] },
              allowLargeResponse: { type: 'boolean', enum: [true] },
            },
            required: ['reviewMode', 'allowLargeResponse'],
          },
        },
        required: [
          'selection',
          'reason',
          'estimatedFullResponseBytes',
          'automaticLimitBytes',
          'explicitFullAvailable',
          'explicitFullArguments',
        ],
        additionalProperties: false,
      },
      scanSummary: {
        type: 'object',
        properties: {
          fileEdges: { type: 'integer', minimum: 0 },
          externalImports: { type: 'integer', minimum: 0 },
          unresolvedImports: { type: 'integer', minimum: 0 },
          moduleEdges: { type: 'integer', minimum: 0 },
        },
        required: ['fileEdges', 'externalImports', 'unresolvedImports', 'moduleEdges'],
        additionalProperties: false,
      },
      reviewQueue: {
        type: 'object',
        properties: {
          total: { type: 'integer', minimum: 0 },
          returned: { type: 'integer', enum: [0, 1] },
          exhausted: { type: 'boolean' },
          afterReviewId: { type: ['string', 'null'] },
        },
        required: ['total', 'returned', 'exhausted', 'afterReviewId'],
        additionalProperties: false,
      },
      nextReview: {
        type: ['object', 'null'],
        properties: {
          contract: { type: 'string', enum: ['nextRelationReview:v1'] },
          reviewId: NON_BLANK_STRING_SCHEMA,
          status: { type: 'string', enum: ['rationale_review_required'] },
          writeAllowed: { type: 'boolean', enum: [false] },
          sourceQualification: {
            type: 'string',
            enum: ['observed_this_call_not_relation_receipt'],
          },
          ordering: {
            type: 'object',
            properties: {
              basis: { type: 'string', enum: ['canonical_from_to'] },
              meaningConfidence: { type: 'boolean', enum: [false] },
              note: NON_BLANK_STRING_SCHEMA,
            },
            required: ['basis', 'meaningConfidence', 'note'],
            additionalProperties: false,
          },
          candidate: {
            type: 'object',
            properties: {
              from: NON_BLANK_STRING_SCHEMA,
              to: NON_BLANK_STRING_SCHEMA,
              relationType: { type: 'string', enum: ['depends_on'] },
              absentEndpoints: {
                type: 'array',
                maxItems: 2,
                uniqueItems: true,
                items: NON_BLANK_STRING_SCHEMA,
              },
              importCount: { type: 'integer', minimum: 0 },
              sourceEvidence: {
                type: 'array',
                maxItems: 5,
                items: {
                  type: 'object',
                  properties: {
                    from: NON_BLANK_STRING_SCHEMA,
                    to: NON_BLANK_STRING_SCHEMA,
                    kind: { type: 'string', enum: IMPORT_EDGE_KIND_VALUES },
                    sourceRole: { type: 'string', enum: IMPORT_SOURCE_ROLE_VALUES },
                    importUsage: { type: 'string', enum: IMPORT_USAGE_VALUES },
                  },
                  required: ['from', 'to', 'kind', 'sourceRole', 'importUsage'],
                  additionalProperties: false,
                },
              },
              sourceEvidenceLimited: { type: 'boolean' },
              evidenceQualification: {
                type: 'object',
                properties: {
                  basis: { type: 'string', enum: ['whole_module_edge'] },
                  sourceRoleCounts: {
                    type: 'object',
                    properties: Object.fromEntries(
                      IMPORT_SOURCE_ROLE_VALUES.map((role) => [role, { type: 'integer', minimum: 0 }]),
                    ),
                    required: IMPORT_SOURCE_ROLE_VALUES,
                    additionalProperties: false,
                  },
                  importUsageCounts: {
                    type: 'object',
                    properties: Object.fromEntries(
                      IMPORT_USAGE_VALUES.map((usage) => [usage, { type: 'integer', minimum: 0 }]),
                    ),
                    required: IMPORT_USAGE_VALUES,
                    additionalProperties: false,
                  },
                  productValueCount: { type: 'integer', minimum: 0 },
                  status: {
                    type: 'string',
                    enum: ['product_value_observed', 'product_value_not_observed'],
                  },
                },
                required: [
                  'basis',
                  'sourceRoleCounts',
                  'importUsageCounts',
                  'productValueCount',
                  'status',
                ],
                additionalProperties: false,
              },
            },
            required: [
              'from',
              'to',
              'relationType',
              'absentEndpoints',
              'importCount',
              'sourceEvidence',
              'sourceEvidenceLimited',
              'evidenceQualification',
            ],
            additionalProperties: false,
          },
          endpointModelling: {
            type: ['object', 'null'],
            properties: {
              status: { type: 'string', enum: ['required_before_relation_review'] },
              writeAllowed: { type: 'boolean', enum: [false] },
              absentEndpoints: {
                type: 'array',
                minItems: 1,
                maxItems: 2,
                uniqueItems: true,
                items: NON_BLANK_STRING_SCHEMA,
              },
              observedPathsByEndpoint: {
                type: 'array',
                minItems: 1,
                maxItems: 2,
                items: {
                  type: 'object',
                  properties: {
                    endpoint: NON_BLANK_STRING_SCHEMA,
                    paths: { type: 'array', uniqueItems: true, items: NON_BLANK_STRING_SCHEMA },
                  },
                  required: ['endpoint', 'paths'],
                  additionalProperties: false,
                },
              },
              analysisCall: {
                type: 'object',
                properties: {
                  tool: { type: 'string', enum: ['analyze_repo_structure'] },
                  arguments: {
                    type: 'object',
                    properties: { rootPath: NON_BLANK_STRING_SCHEMA },
                    required: ['rootPath'],
                    additionalProperties: false,
                  },
                  purpose: NON_BLANK_STRING_SCHEMA,
                },
                required: ['tool', 'arguments', 'purpose'],
                additionalProperties: false,
              },
              proposalValidation: {
                type: 'object',
                properties: {
                  tool: { type: 'string', enum: ['analyze_repo_structure'] },
                  requiredArguments: {
                    type: 'array',
                    minItems: 2,
                    maxItems: 2,
                    uniqueItems: true,
                    items: { type: 'string', enum: ['rootPath', 'proposal'] },
                  },
                  requiredProposalFields: {
                    type: 'array',
                    minItems: 6,
                    maxItems: 6,
                    uniqueItems: true,
                    items: {
                      type: 'string',
                      enum: ['project', 'domains', 'capabilities', 'elements', 'relations', 'competencyAnswers'],
                    },
                  },
                  fieldsAfterKindDecision: {
                    type: 'object',
                    properties: {
                      common: {
                        type: 'array',
                        minItems: 5,
                        maxItems: 5,
                        uniqueItems: true,
                        items: { type: 'string', enum: ['slug', 'title', 'definition', 'evidence', 'confidence'] },
                      },
                      byKind: {
                        type: 'object',
                        properties: {
                          project: { type: 'array', maxItems: 0 },
                          domain: { type: 'array', maxItems: 0 },
                          capability: {
                            type: 'array',
                            minItems: 1,
                            maxItems: 1,
                            items: { type: 'string', enum: ['domain'] },
                          },
                          element: {
                            type: 'array',
                            minItems: 2,
                            maxItems: 2,
                            uniqueItems: true,
                            items: { type: 'string', enum: ['domain', 'path'] },
                          },
                        },
                        required: ['project', 'domain', 'capability', 'element'],
                        additionalProperties: false,
                      },
                    },
                    required: ['common', 'byKind'],
                    additionalProperties: false,
                  },
                  endpointDrafts: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 2,
                    items: {
                      type: 'object',
                      properties: {
                        endpoint: NON_BLANK_STRING_SCHEMA,
                        observedPaths: { type: 'array', uniqueItems: true, items: NON_BLANK_STRING_SCHEMA },
                        slugCandidate: NON_BLANK_STRING_SCHEMA,
                        kindDecision: { type: 'string', enum: ['human_meaning_required'] },
                      },
                      required: ['endpoint', 'observedPaths', 'slugCandidate', 'kindDecision'],
                      additionalProperties: false,
                    },
                  },
                  purpose: NON_BLANK_STRING_SCHEMA,
                },
                required: ['tool', 'requiredArguments', 'requiredProposalFields', 'fieldsAfterKindDecision', 'endpointDrafts', 'purpose'],
                additionalProperties: false,
              },
              resumeCall: {
                type: 'object',
                properties: {
                  tool: { type: 'string', enum: ['infer_imports'] },
                  arguments: {
                    type: 'object',
                    properties: {
                      rootPath: NON_BLANK_STRING_SCHEMA,
                      reviewMode: { type: 'string', enum: ['next'] },
                    },
                    required: ['rootPath', 'reviewMode'],
                    additionalProperties: false,
                  },
                  purpose: NON_BLANK_STRING_SCHEMA,
                },
                required: ['tool', 'arguments', 'purpose'],
                additionalProperties: false,
              },
            },
            required: [
              'status',
              'writeAllowed',
              'absentEndpoints',
              'observedPathsByEndpoint',
              'analysisCall',
              'proposalValidation',
              'resumeCall',
            ],
            additionalProperties: false,
          },
          nextCalls: {
            type: 'array',
            minItems: 0,
            maxItems: 2,
            items: {
              type: 'object',
              properties: {
                tool: { type: 'string', enum: ['get_concepts', 'query_ontology'] },
                // Each suggested call has its own strict input shape, so there is no shared contract.
                arguments: { type: 'object', additionalProperties: true },
                purpose: NON_BLANK_STRING_SCHEMA,
              },
              required: ['tool', 'arguments', 'purpose'],
              additionalProperties: false,
            },
          },
          decision: {
            type: 'object',
            properties: {
              questionEligibility: {
                type: 'string',
                enum: [
                  'blocked_missing_vault_endpoints',
                  'eligible_after_semantic_review',
                  'additional_product_meaning_evidence_required',
                ],
              },
              required: { type: 'array', items: NON_BLANK_STRING_SCHEMA, minItems: 1 },
              ask: NON_BLANK_STRING_SCHEMA,
              stopWhen: { type: 'array', items: NON_BLANK_STRING_SCHEMA, minItems: 1 },
            },
            required: ['questionEligibility', 'required', 'ask', 'stopWhen'],
            additionalProperties: false,
          },
          cursor: {
            type: 'object',
            properties: {
              afterReviewId: { type: ['string', 'null'] },
              total: { type: 'integer', minimum: 1 },
              remaining: { type: 'integer', minimum: 0 },
              hasMore: { type: 'boolean' },
              nextAfterReviewId: NON_BLANK_STRING_SCHEMA,
            },
            required: ['afterReviewId', 'total', 'remaining', 'hasMore', 'nextAfterReviewId'],
            additionalProperties: false,
          },
        },
        required: [
          'contract',
          'reviewId',
          'status',
          'writeAllowed',
          'sourceQualification',
          'ordering',
          'candidate',
          'endpointModelling',
          'nextCalls',
          'decision',
          'cursor',
        ],
        additionalProperties: false,
      },
      focusReview: {
        type: 'object',
        properties: {
          contract: { type: 'string', enum: ['importImpactFocus:v1'] },
          focusPath: NON_BLANK_STRING_SCHEMA,
          direction: { type: 'string', enum: ['incoming', 'outgoing', 'both'] },
          sourceQualification: {
            type: 'string',
            enum: ['observed_static_imports_not_runtime_or_semantic_impact'],
          },
          writeAllowed: { type: 'boolean', enum: [false] },
          summary: {
            type: 'object',
            properties: {
              incoming: { type: 'integer', minimum: 0 },
              outgoing: { type: 'integer', minimum: 0 },
              selected: { type: 'integer', minimum: 0 },
              returned: { type: 'integer', minimum: 0, maximum: 100 },
              limited: { type: 'boolean' },
            },
            required: ['incoming', 'outgoing', 'selected', 'returned', 'limited'],
            additionalProperties: false,
          },
          edges: {
            type: 'array',
            maxItems: 100,
            items: {
              type: 'object',
              properties: {
                edgeId: NON_BLANK_STRING_SCHEMA,
                from: NON_BLANK_STRING_SCHEMA,
                to: NON_BLANK_STRING_SCHEMA,
                kind: { type: 'string', enum: IMPORT_EDGE_KIND_VALUES },
                sourceRole: { type: 'string', enum: IMPORT_SOURCE_ROLE_VALUES },
                importUsage: { type: 'string', enum: IMPORT_USAGE_VALUES },
              },
              required: ['edgeId', 'from', 'to', 'kind', 'sourceRole', 'importUsage'],
              additionalProperties: false,
            },
          },
          cursor: {
            type: 'object',
            properties: {
              afterEdgeId: { type: ['string', 'null'] },
              total: { type: 'integer', minimum: 0 },
              remaining: { type: 'integer', minimum: 0 },
              hasMore: { type: 'boolean' },
              nextAfterEdgeId: { type: ['string', 'null'] },
            },
            required: ['afterEdgeId', 'total', 'remaining', 'hasMore', 'nextAfterEdgeId'],
            additionalProperties: false,
          },
          interpretation: NON_BLANK_STRING_SCHEMA,
        },
        required: [
          'contract',
          'focusPath',
          'direction',
          'sourceQualification',
          'writeAllowed',
          'summary',
          'edges',
          'cursor',
          'interpretation',
        ],
        additionalProperties: false,
      },
    },
    required: ['rootPath', 'filesScanned', 'coverage'],
    oneOf: [
      { required: ['edges', 'externalImports', 'unresolved', 'moduleEdges'] },
      {
        required: [
          'contract',
          'scanSummary',
          'reconciliationSummary',
          'reviewQueue',
          'nextReview',
        ],
      },
      { required: ['contract', 'scanSummary', 'focusReview'] },
    ],
    additionalProperties: false,
  },
};
