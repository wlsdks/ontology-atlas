/**
 * The public tool surface: the `TOOLS` table with every name, description and
 * schema, the annotation sets that decide `readOnlyHint` / `destructiveHint` /
 * `idempotentHint`, and the read-only and write-consent modes that decide which
 * of them `tools/list` shows.
 *
 * This is the file `pnpm docs:surface:check` measures and the decision ledger
 * gate watches; a change here changes what every connected agent sees.
 */

import { AGENT_BRIEF_TASK_MAX_CHARS } from '../agent-brief-compact.mjs';
import { CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA } from '../construction-qualification.mjs';
import {
  ELEMENT_NAMING_RULE_BATCH_EN,
  ELEMENT_NAMING_RULE_EN,
} from '../construction-rules.mjs';
import {
  IMPORT_EDGE_KIND_VALUES,
  IMPORT_SOURCE_ROLE_VALUES,
  IMPORT_UNRESOLVED_REASON_VALUES,
  IMPORT_USAGE_VALUES,
} from '../infer-imports.mjs';
import {
  EDGE_TARGET_KIND_VALUES,
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  NODE_KIND_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  QUERY_PLAN_TARGET_OPERATIONS,
  RELATION_TYPE_VALUES,
} from '../ontology-engine.mjs';
import { NODE_UID_PATTERN } from '../schema.mjs';
import {
  READ_SOURCE_DEFAULT_LIMIT,
  READ_SOURCE_MAX_LIMIT,
} from '../source-text.mjs';
import { VAULT_ISSUE_CODE_VALUES } from '../validate.mjs';
import { GRAPH_ARRAY_KEYS } from '../vault.mjs';
import { parseConsentEnv } from '../write-consent.mjs';
import {
  ADD_RELATION_TYPE_SCHEMA,
  BACKLINK_REWRITE_PLAN_OUTPUT_SCHEMA,
  BACKLINK_ROW_OUTPUT_SCHEMA,
  BODY_DELIVERY_MODES,
  BODY_INFO_OUTPUT_SCHEMA,
  BUSINESS_EVIDENCE_ROW_SCHEMA,
  CAPTURED_DOC_OUTPUT_SCHEMA,
  CONCEPT_NEIGHBORS_OUTPUT_SCHEMA,
  DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
  DESTRUCTIVE_PREVIEW_REQUIRED,
  EDGE_RATIONALE_OUTPUT_SCHEMA,
  EDGE_TARGET_KIND_DESCRIPTION,
  EXTRACTION_CONTRACT_OUTPUT_SCHEMA,
  GIT_HISTORY_OUTPUT_SCHEMA,
  GIT_RESULT_OUTPUT_SCHEMA,
  GIT_SNAPSHOT_OUTPUT_SCHEMA,
  GO_PACKAGE_IMPORT_EVIDENCE_OUTPUT_SCHEMA,
  GO_PACKAGE_IMPORT_EVIDENCE_SUMMARY_SCHEMA,
  GRAPH_REF_ARRAY_MAX_ITEMS,
  GROWTH_HINT_OUTPUT_SCHEMA,
  IGNORE_ARRAY_MAX_ITEMS,
  IMPORT_EDGE_KIND_DESCRIPTION,
  IMPORT_RECONCILIATION_EDGE_SCHEMA,
  IMPORT_RECONCILIATION_SUMMARY_SCHEMA,
  IMPORT_SCAN_COVERAGE_OUTPUT_SCHEMA,
  IMPORT_STALE_EDGE_FOLLOW_UP_SCHEMA,
  LOCALE_LABELS_SCHEMA,
  MEANING_ASSESSMENT_OUTPUT_SCHEMA,
  MEANING_GATE_EVIDENCE_ROW_LIMIT,
  MEANING_GATE_REVIEW_ROW_LIMIT,
  MEANING_PROPOSAL_INPUT_SCHEMA,
  MEANING_PROPOSAL_VALIDATION_OUTPUT_SCHEMA,
  NODE_KIND_DESCRIPTION,
  NON_BLANK_STRING_SCHEMA,
  OUTGOING_EDGE_OUTPUT_SCHEMA,
  POST_WRITE_MAINTENANCE_GUIDANCE,
  POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
  PROJECT_SOURCE_BINDING_VIEW_SCHEMA,
  PROJECT_SOURCE_NEXT_CALL_SCHEMA,
  PROJECT_SOURCE_RECEIPT_SCHEMA,
  PROJECT_SOURCE_REMEDY_SCHEMA,
  PROJECT_SOURCE_VIEW_SCHEMA,
  PROPOSED_BUSINESS_CONCEPT_ROW_SCHEMA,
  RELATION_ARRAY_PATCH_SCHEMA,
  RELATION_RESULT_SCHEMA,
  REVIEW_REQUIRED_CAPABILITY_ROW_SCHEMA,
  RUST_FEATURE_CONFIGURATION_EVIDENCE_OUTPUT_SCHEMA,
  SEMANTIC_EVIDENCE_ROW_SCHEMA,
  SOURCE_FOLDER_ARRAY_MAX_ITEMS,
  VAULT_ISSUE_CODE_DESCRIPTION,
  VAULT_WARNING_OUTPUT_SCHEMA,
  nonBlankStringSchema,
  paginationOutputSchema,
} from './tool-schemas.mjs';

// ── Tool definitions ──────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'connection_info',
    description:
      'Return the exact active vault root and code-repository root used by this MCP process, including how each root was resolved. Call first when a client may have stale configuration or multiple workspaces. Root changes require restarting the MCP process.',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: {
        vaultRoot: NON_BLANK_STRING_SCHEMA,
        repoRoot: NON_BLANK_STRING_SCHEMA,
        vaultResolution: { type: 'string', enum: ['OATLAS_VAULT', 'process.cwd'] },
        repoResolution: {
          type: 'string',
          enum: ['OATLAS_REPO_ROOT', 'git.rev-parse', 'process.cwd'],
        },
        sameRoot: { type: 'boolean' },
        restartRequiredForRootChange: { type: 'boolean' },
        server: {
          type: 'object',
          properties: {
            name: NON_BLANK_STRING_SCHEMA,
            version: NON_BLANK_STRING_SCHEMA,
            readOnly: { type: 'boolean' },
            toolCount: { type: 'integer', minimum: 1 },
            toolNames: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
            toolsetHash: NON_BLANK_STRING_SCHEMA,
          },
          required: ['name', 'version', 'readOnly', 'toolCount', 'toolNames', 'toolsetHash'],
          additionalProperties: false,
        },
      },
      required: ['vaultRoot', 'repoRoot', 'vaultResolution', 'repoResolution', 'sameRoot', 'restartRequiredForRootChange', 'server'],
      additionalProperties: false,
    },
  },
  {
    name: 'git_status',
    description:
      'Inspect local Git state for the active vault only. Returns HEAD/branch, vault files, outside-vault change counts, staged-outside-vault warnings, and in-progress operation risk. Read-only; never initializes, stages, commits, or pushes.',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: GIT_RESULT_OUTPUT_SCHEMA,
  },
  {
    name: 'git_history',
    description:
      'Read commit history scoped to the active vault path only. Returns bounded newest-first hashes, subjects, and authored timestamps plus limited/hasMore, shallow-repository state, and historyComplete so agents do not mistake a truncated or shallow view for complete evidence. Commits that touched only files outside the vault are excluded. Read-only; never initializes, fetches, pulls, commits, or pushes.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum newest-first vault commits to return. Defaults to 20; maximum 100.',
        },
      },
    },
    outputSchema: GIT_HISTORY_OUTPUT_SCHEMA,
  },
  {
    name: 'git_snapshot',
    description:
      'Create a local, vault-scoped Git checkpoint. Dry-run by default and returns exact expectedHead, files, validation, risk, and the shared previewReady/canConfirm/wouldChange/blockedReasons safety contract. confirm:true requires that expectedHead, blocks validator errors and Git operations in progress, commits only the vault pathspec, leaves outside files untouched, and never pushes.',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Default false. Set true only after reviewing the dry-run preview and its risk/validation fields.',
        },
        expectedHead: nonBlankStringSchema(
          'Required with confirm:true. Copy the exact expectedHead returned by the immediately preceding dry-run; this prevents committing after a concurrent HEAD change.',
        ),
        message: nonBlankStringSchema(
          'Optional local commit subject, one line and at most 200 characters. A deterministic ontology snapshot subject is generated when omitted.',
          { maxLength: 200, pattern: '^[^\\r\\n]+$' },
        ),
      },
    },
    outputSchema: GIT_SNAPSHOT_OUTPUT_SCHEMA,
  },
  {
    name: 'list_concepts',
    description:
      'List every ontology node in the vault (each .md file with a frontmatter `kind:`). ' +
      'Filter by `kind`, `domain`, and/or `since` (mtime-based incremental sync). ' +
      'Large vaults are resumable with `offset` + `limit`; always follow `pagination.nextOffset` while `hasMore` is true. ' +
      "AI agents call this first to grasp the codebase's mental model.",
    inputSchema: {
      type: 'object',
      properties: {
        kind: nonBlankStringSchema(
          `Filter to one canonical ontology kind (${NODE_KIND_DESCRIPTION}). Omit to return all. Invalid kind typos fail closed with nearest-value hints instead of returning an empty list.`,
          { enum: NODE_KIND_VALUES },
        ),
        domain: nonBlankStringSchema(
          'Filter to nodes whose frontmatter `domain:` matches this slug (e.g. "auth"). Combine with `kind` for "all capabilities under auth" in one call. Use the domain *slug*, not the title.',
        ),
        since: {
          type: 'number',
          minimum: 0,
          description:
            'Non-negative mtime threshold. Filter to nodes with `mtime > since` (ms). Pair with the `mtime` returned in earlier `list_concepts` / `get_concept` responses for incremental sync — "what changed since I last looked". Strict greater-than (mtime === since is excluded) so re-passing the max from a previous response does not double-fetch.',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          description:
            'Zero-based page offset applied after kind/domain/since filters. Resume at pagination.nextOffset until hasMore is false; ordering is deterministic by canonical slug.',
        },
        summary: {
          type: 'boolean',
          description:
            'When true, each node row includes a `summary` (max 200 chars, prose-only — heading / table / code block / image / divider / list / quote are skipped and only the first paragraph is kept, same `extractSummaryExcerpt` helper as `get_concept` / `find_evidence`). Useful for "scan + overview" without N follow-up `get_concept` calls. Default false to keep payload small.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Positive integer max rows to return. Defaults to 100, max 500.',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        total: {
          type: 'integer',
          minimum: 0,
          description: 'Total number of matching ontology nodes before the limit is applied.',
        },
        returned: {
          type: 'integer',
          minimum: 0,
          description: 'Number of rows returned in this page.',
        },
        limited: {
          type: 'boolean',
          description: 'True when this page does not contain every matching row.',
        },
        pagination: {
          type: 'object',
          properties: {
            offset: { type: 'integer', minimum: 0 },
            limit: { type: 'integer', minimum: 1 },
            total: { type: 'integer', minimum: 0 },
            returned: { type: 'integer', minimum: 0 },
            hasMore: { type: 'boolean' },
            nextOffset: { type: ['integer', 'null'], minimum: 0 },
          },
          required: ['offset', 'limit', 'total', 'returned', 'hasMore', 'nextOffset'],
          additionalProperties: false,
        },
        vaultRoot: {
          type: 'string',
          minLength: 1,
          description: 'Resolved vault root path used for the listing.',
        },
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              uid: {
                ...NON_BLANK_STRING_SCHEMA,
                pattern: NODE_UID_PATTERN,
                description: 'Permanent immutable node identity. Slug remains the current human-readable address.',
              },
              slug: NON_BLANK_STRING_SCHEMA,
              kind: NON_BLANK_STRING_SCHEMA,
              title: NON_BLANK_STRING_SCHEMA,
              domain: { type: 'string' },
              capabilities: {
                type: 'array',
                items: NON_BLANK_STRING_SCHEMA,
              },
              elements: {
                type: 'array',
                items: NON_BLANK_STRING_SCHEMA,
              },
              mtime: {
                type: 'number',
                minimum: 0,
              },
              summary: { type: 'string' },
              summaryTruncated: {
                type: 'boolean',
                description: 'Only present (and always true) when the body carries more than this summary shows.',
              },
            },
            required: ['uid', 'slug', 'kind', 'title', 'mtime'],
            additionalProperties: false,
          },
        },
        summaryHint: {
          type: 'string',
          description: 'Only present when at least one row carries a partial summary — names the follow-up call that returns the full bodies.',
        },
        vaultWarnings: {
          type: 'object',
          properties: {
            errorCount: { type: 'integer', minimum: 0 },
            warningCount: { type: 'integer', minimum: 0 },
          },
          required: ['errorCount', 'warningCount'],
          additionalProperties: false,
        },
      },
      required: ['total', 'vaultRoot', 'nodes', 'returned', 'limited', 'pagination'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_concept',
    description:
      'Fetch one node by exactly one selector: `slug` (canonical slug or unique alias) or immutable `uid`. Successful responses always carry both the permanent `uid` and current canonical `slug`; graph relations and graph-operation inputs remain slug-based. Returns frontmatter, body, direct graph neighbors, outgoingEdges (each `{to, via, rationale?}`, the rationale being the stored `relation_notes` sentence when one exists), and mtime. **By default you get `excerpt` — the first prose paragraph only. The node body is where the construction rules put definition, evidence, confidence, and in-scope/out-of-scope, so pass `body: "full"` whenever you are reading a node to answer a question rather than just to identify it.** `bodyInfo` always reports `totalChars` / `returnedChars` / `truncated`, so a partial read is never silent. **For K specific selectors in one call use `get_concepts({slugs: [...]})` or `get_concepts({uids: [...]})`.** When a slug does not resolve, structured growth guidance remains available.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: nonBlankStringSchema(
          'Vault-relative slug (e.g. projects/auth-platform), unique tail slug, or frontmatter `slug` alias. Omit the .md extension.',
        ),
        uid: {
          ...NON_BLANK_STRING_SCHEMA,
          pattern: NODE_UID_PATTERN,
          description: 'Exact permanent node UID. Use instead of `slug`, never together with it.',
        },
        body: {
          type: 'string',
          enum: BODY_DELIVERY_MODES,
          description:
            '`excerpt` (default) returns the first prose paragraph as `excerpt`. `full` returns the entire markdown body as `body` and omits `excerpt`. Use `full` when the answer depends on what the node actually says — evidence paths, confidence, scope boundaries.',
        },
      },
      // Claude Code's Anthropic tool schema rejects a top-level `oneOf` and
      // silently drops the whole tool. Both selectors stay optional in the
      // published schema; getConcept enforces exactly-one at runtime.
    },
    outputSchema: {
      type: 'object',
      properties: {
        uid: {
          ...NON_BLANK_STRING_SCHEMA,
          pattern: NODE_UID_PATTERN,
          description: 'Permanent immutable node identity.',
        },
        slug: NON_BLANK_STRING_SCHEMA,
        frontmatter: {
          type: 'object',
          description: 'Resolved markdown frontmatter.',
          additionalProperties: true,
        },
        excerpt: {
          type: 'string',
          description: 'First prose paragraph. Present only when `body` is `excerpt` (the default).',
        },
        body: {
          type: 'string',
          description: 'Entire markdown body. Present only when the caller passed `body: "full"`.',
        },
        bodyInfo: {
          ...BODY_INFO_OUTPUT_SCHEMA,
          description: 'How much of the body this response carries — always present, so truncation is never silent.',
        },
        neighbors: {
          ...CONCEPT_NEIGHBORS_OUTPUT_SCHEMA,
          description: 'Direct graph neighbor buckets.',
        },
        outgoingEdges: {
          type: 'array',
          items: OUTGOING_EDGE_OUTPUT_SCHEMA,
        },
        mtime: {
          type: 'number',
          minimum: 0,
        },
        warnings: {
          type: 'array',
          items: VAULT_WARNING_OUTPUT_SCHEMA,
        },
      },
      // `excerpt` is no longer required: with `body: "full"` the body arrives in
      // `body` and no excerpt is sent at all (never ship the same text twice).
      required: ['uid', 'slug', 'frontmatter', 'bodyInfo', 'neighbors', 'outgoingEdges', 'mtime'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_concepts',
    description:
      'Fetch multiple nodes by exactly one selector array: `slugs` (canonical slugs or unique aliases) or immutable `uids`. Same per-row shape as `get_concept`; successful rows always return permanent `uid` plus current canonical `slug`. Order matches the selected input array. Missing or invalid slug rows return partial `{slug, ok:false, error, ...repairFields}` rows, so later valid slugs still resolve; UID misses likewise return `{uid, ok:false, error, ...repairFields}` without aborting the batch. Graph relations and graph-operation inputs remain slug-based.',
    inputSchema: {
      type: 'object',
      properties: {
        slugs: {
          type: 'array',
          maxItems: 50,
          items: NON_BLANK_STRING_SCHEMA,
          description: 'Vault-relative slugs, unique tail slugs, or frontmatter `slug` aliases (e.g. ["capabilities/x", "elements/y"]). Omit the .md extension. Max 50 per call (max 20 when body is `full`).',
        },
        uids: {
          type: 'array',
          maxItems: 50,
          items: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
          description: 'Exact permanent node UIDs. Use instead of `slugs`, never together with it. Max 50 (max 20 with body `full`).',
        },
        body: {
          type: 'string',
          enum: BODY_DELIVERY_MODES,
          description:
            'Applies to every row. `excerpt` (default) returns the first prose paragraph per row; `full` returns the entire markdown body per row and caps the batch at 20 slugs.',
        },
      },
      // Same cross-client boundary as get_concept: keep the published input
      // schema flat and enforce exactly-one in getConceptsBatch at runtime.
    },
    outputSchema: {
      type: 'object',
      properties: {
        concepts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ok: {
                type: 'boolean',
                description: 'True for resolved concept rows; false for missing or invalid input rows.',
              },
              uid: {
                ...NON_BLANK_STRING_SCHEMA,
                pattern: NODE_UID_PATTERN,
                description: 'Canonical permanent UID for successful rows; requested UID for UID-selector error rows.',
              },
              slug: {
                ...NON_BLANK_STRING_SCHEMA,
                description:
                  'Canonical slug for successful rows; the original input value for invalid partial rows.',
              },
              frontmatter: {
                type: 'object',
                description: 'Resolved markdown frontmatter for successful rows.',
                additionalProperties: true,
              },
              excerpt: {
                type: 'string',
                description: 'First prose paragraph — successful rows in `excerpt` mode (the default).',
              },
              body: {
                type: 'string',
                description: 'Entire markdown body — successful rows in `full` mode.',
              },
              bodyInfo: BODY_INFO_OUTPUT_SCHEMA,
              neighbors: {
                ...CONCEPT_NEIGHBORS_OUTPUT_SCHEMA,
                description: 'Direct graph neighbor buckets for successful rows.',
              },
              outgoingEdges: {
                type: 'array',
                items: OUTGOING_EDGE_OUTPUT_SCHEMA,
              },
              mtime: {
                type: 'number',
                minimum: 0,
              },
              warnings: {
                type: 'array',
                items: VAULT_WARNING_OUTPUT_SCHEMA,
              },
              error: {
                type: 'string',
                description: 'Human-readable error for partial rows.',
              },
              errorCode: { type: 'string' },
              missingSubject: { type: 'string' },
              missingSlug: { type: 'string' },
              missingUid: { type: 'string', pattern: NODE_UID_PATTERN },
              similarSlugs: { type: 'array', items: { type: 'string' } },
              recoveryTools: { type: 'array', items: { type: 'string' } },
              createTool: { type: 'string' },
              growthHint: GROWTH_HINT_OUTPUT_SCHEMA,
            },
            required: ['ok'],
            additionalProperties: false,
          },
        },
      },
      required: ['concepts'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_evidence',
    description:
      "Find vault docs that mention a given concept by title. Useful when an AI agent asks where a capability is realized in code or docs. Each match includes a prose `excerpt` (max 200 chars, headings/tables/code skipped) so agents see *what the matching doc says* without an extra get_concept call. Matches are RANKED by a deterministic relevance `score` (title match > frontmatter ref > body, plus a title token-overlap tiebreaker), then by whether the doc is a graph node, then slug — best-first. **A vault holds ordinary markdown too** (meeting notes, memos, drafts have no `kind:` and are not graph nodes); every row says which it is via `isNode`, non-nodes rank below nodes of equal relevance, and `nodesOnly: true` filters them out. Do not cite a non-node as graph evidence without saying so. Pass `limit` for the top-N. When zero docs mention the title, the response includes a `growthHint` — near-titled vault nodes to check first, or an add_concept scaffold if the concept looks genuinely new.",
    inputSchema: {
      type: 'object',
      properties: {
        title: nonBlankStringSchema('Concept title to search for (case-insensitive substring match).'),
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Return only the top-N highest-scoring matches. Omit for all matches (still ranked).',
        },
        nodesOnly: {
          type: 'boolean',
          description:
            'Return only graph nodes (docs with a `kind:`). Default false — ordinary markdown in the same folder is included and marked `isNode: false`.',
        },
      },
      required: ['title'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        query: NON_BLANK_STRING_SCHEMA,
        nonNodeHint: { type: 'string' },
        matches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              uid: {
                ...NON_BLANK_STRING_SCHEMA,
                pattern: NODE_UID_PATTERN,
              },
              slug: NON_BLANK_STRING_SCHEMA,
              kind: NON_BLANK_STRING_SCHEMA,
              isNode: {
                type: 'boolean',
                description:
                  'True when this doc is a graph node (has `kind:`). False for ordinary markdown that lives in the same folder — still searchable, but not part of the graph.',
              },
              title: NON_BLANK_STRING_SCHEMA,
              domain: { type: 'string' },
              mtime: { type: 'number', minimum: 0 },
              matchedIn: {
                type: 'string',
                enum: ['frontmatter', 'body'],
              },
              score: {
                type: 'number',
                minimum: 0,
                description: 'Relevance score (higher = better). matches are sorted by this descending.',
              },
              excerpt: { type: 'string' },
              excerptTruncated: {
                type: 'boolean',
                description: 'Only present (and always true) when the body carries more than this excerpt shows — including, possibly, the text that matched.',
              },
              bodyChars: {
                type: 'integer',
                minimum: 0,
                description: 'Only present alongside excerptTruncated — the full body length.',
              },
            },
            required: ['slug', 'isNode', 'title', 'mtime', 'matchedIn', 'score', 'excerpt'],
            oneOf: [
              {
                properties: { isNode: { const: true } },
                required: ['uid', 'kind'],
              },
              {
                properties: { isNode: { const: false } },
                not: { anyOf: [{ required: ['uid'] }, { required: ['kind'] }] },
              },
            ],
            additionalProperties: false,
          },
        },
        bodyHint: {
          type: 'string',
          description: 'Only present when at least one match returned a partial excerpt — names the get_concepts({ body: "full" }) call that returns the rest.',
        },
        growthHint: {
          ...GROWTH_HINT_OUTPUT_SCHEMA,
          description: 'Only present when matches is empty — near-titled vault node(s) to check, or an add_concept scaffold, derived from the real vault title set.',
        },
      },
      required: ['query', 'matches'],
      additionalProperties: false,
    },
  },
  {
    name: 'finalize_project_meaning',
    description:
      'Finalize the current project competency Markdown after concept/relation writes, vault validation, and a complete project compile. ' +
      'The server derives the current body digest, project graph hash, source fingerprint, and witness inventory itself; callers cannot submit or restamp those values. ' +
      'This writes only a small provenance receipt to `.ontology-atlas/project-meaning.json`. It never stores raw answers, witness text, absolute source roots, or remote coordinates. ' +
      '`ok: true` means the receipt was written, not that source currentness is verified; read `meaningAssessment` or a fresh `agent_brief` for the fail-closed categorical result.',
    inputSchema: {
      type: 'object',
      properties: {
        projectSlug: nonBlankStringSchema(
          'Exact project node slug (or an unambiguous vault alias) whose current Competency answers section should be finalized.',
        ),
        expected_mtime: {
          type: 'number',
          minimum: 0,
          description:
            'Required conflict guard. Pass the project node mtime from get_concept; any intervening human or agent edit blocks finalization.',
        },
      },
      required: ['projectSlug', 'expected_mtime'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        changed: { type: 'boolean' },
        contract: { type: 'string', enum: ['projectMeaningReceipt:v1'] },
        projectSlug: NON_BLANK_STRING_SCHEMA,
        bodyDigest: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
        graphHash: { type: 'string', pattern: '^project-graph-v1:[a-f0-9]{8}$' },
        sourceFingerprint: NON_BLANK_STRING_SCHEMA,
        measuredAt: { type: 'string', format: 'date-time' },
        meaningAssessment: MEANING_ASSESSMENT_OUTPUT_SCHEMA,
      },
      required: [
        'ok',
        'changed',
        'contract',
        'projectSlug',
        'bodyDigest',
        'graphHash',
        'sourceFingerprint',
        'measuredAt',
        'meaningAssessment',
      ],
      additionalProperties: false,
    },
  },
  {
    name: 'connect_project_source',
    description:
      'Bind a project node to the local code folder it describes, measure it, and write the source receipt. '
      + 'This is what `nextAction: connect_source` (and `repair_source_binding` / `measure_source` / `remeasure_source`) asks for. '
      + 'Omit `rootPath` and the server infers it: the git repository enclosing the vault wins, otherwise the nearest ancestor folder carrying a project manifest. '
      + 'Without `confirm: true` nothing is written — you get the proposed folder, how many declared `path:` claims actually land in it, and the exact confirming call. '
      + 'Re-running with a different `rootPath` replaces the binding; `disconnect_project_source` removes it. '
      + 'The absolute root stays in the local gitignored sidecar `.ontology-atlas/project-sources.json` and never enters the receipt, the graph markdown, or any handoff.',
    inputSchema: {
      type: 'object',
      properties: {
        projectSlug: nonBlankStringSchema(
          'Exact project node slug (or an unambiguous vault alias) to bind.',
        ),
        rootPath: nonBlankStringSchema(
          'Absolute local folder holding the code. Omit to auto-infer, or to re-measure an existing binding.',
        ),
        confirm: {
          type: 'boolean',
          description: 'Required to write. Default false returns the proposal and changes nothing.',
        },
        repair: {
          type: 'boolean',
          description:
            'Discard a malformed .ontology-atlas/project-sources.json instead of refusing to write over it.',
        },
      },
      required: ['projectSlug'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        changed: { type: 'boolean' },
        confirmed: { type: 'boolean' },
        contract: { type: 'string', enum: ['projectSourceConnect:v1'] },
        projectSlug: NON_BLANK_STRING_SCHEMA,
        mode: { type: 'string', enum: ['connect', 'replace', 'remeasure'] },
        binding: PROJECT_SOURCE_BINDING_VIEW_SCHEMA,
        inference: { type: ['object', 'null'], additionalProperties: true },
        previewReceipt: PROJECT_SOURCE_RECEIPT_SCHEMA,
        projectSource: PROJECT_SOURCE_VIEW_SCHEMA,
        remedy: PROJECT_SOURCE_REMEDY_SCHEMA,
        previousBindingCount: { type: 'number' },
        nextCall: PROJECT_SOURCE_NEXT_CALL_SCHEMA,
        undo: { type: ['object', 'null'] },
      },
      required: ['ok', 'changed', 'confirmed', 'contract', 'projectSlug', 'mode', 'binding'],
      additionalProperties: false,
    },
  },
  {
    name: 'disconnect_project_source',
    description:
      'Remove a project node\'s local source binding and its receipt. The reversal of connect_project_source — use it when the wrong folder was bound, or to stop measuring. '
      + 'Without `confirm: true` it only reports what would be removed. Other projects\' bindings are never touched, and no ontology markdown changes.',
    inputSchema: {
      type: 'object',
      properties: {
        projectSlug: nonBlankStringSchema('Project node slug whose source binding should be removed.'),
        confirm: {
          type: 'boolean',
          description: 'Required to write. Default false lists the binding that would be removed.',
        },
      },
      required: ['projectSlug'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        changed: { type: 'boolean' },
        confirmed: { type: 'boolean' },
        contract: { type: 'string', enum: ['projectSourceDisconnect:v1'] },
        projectSlug: NON_BLANK_STRING_SCHEMA,
        removed: { type: 'number' },
        bindings: { type: 'array' },
        projectSource: PROJECT_SOURCE_VIEW_SCHEMA,
        remedy: PROJECT_SOURCE_REMEDY_SCHEMA,
        nextCall: PROJECT_SOURCE_NEXT_CALL_SCHEMA,
      },
      required: ['ok', 'changed', 'confirmed', 'contract', 'projectSlug', 'removed', 'bindings'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_concept',
    description:
      'Create a new ontology node (.md file). Call when an AI agent finds a new ' +
      'capability / element / project from code analysis. Throws if the slug ' +
      'already exists — use patch_concept in that case. The frontmatter is ' +
      'normalized per kind (project gets `domains/capabilities/elements` empty ' +
      'arrays; capability gets `elements: []`; capability/element should also ' +
      'set `domain:` so the tree has a parent — missing extras come back as ' +
      '`warnings` in the response, not as an error. ' +
      'If another node already has the same title, a near-duplicate `warning` is ' +
      'included too — prefer patch_concept on the existing node over forking a duplicate. ' +
      'Successful writes return ' + POST_WRITE_MAINTENANCE_GUIDANCE + ' so agents can immediately see graph cleanup / relation suggestions after the new node lands. ' +
      '**For bulk creation (e.g. bootstrap flow with 5+ nodes) use `add_concepts({concepts: [...]})` (batch, max 50, partial result) — saves K-1 round-trips.**' + ' ' + ELEMENT_NAMING_RULE_EN,
    inputSchema: {
      type: 'object',
      properties: {
        slug: nonBlankStringSchema(
          'Vault-relative slug (omit the .md extension), flat under the kind folder — e.g. "elements/jwt-token", "capabilities/token-issue". A slug is the node\'s name, never a code path: "elements/src/views/home" is rejected (put the file location in path: instead).',
        ),
        kind: {
          ...NON_BLANK_STRING_SCHEMA,
          enum: ['project', 'domain', 'capability', 'element', 'document'],
          description: 'project / domain / capability / element / document. (vault-readme is reserved for the auto-generated README.md and should not be set by agents.)',
        },
        title: nonBlankStringSchema('Display title for the node.'),
        domain: nonBlankStringSchema(
          'Parent domain slug. Strongly expected for kind=capability and kind=element — without it the node floats orphaned in the tree.',
        ),
        capabilities: {
          type: 'array',
          maxItems: GRAPH_REF_ARRAY_MAX_ITEMS,
          items: NON_BLANK_STRING_SCHEMA,
          description: 'Capability slugs this node owns (project / domain).',
        },
        elements: {
          type: 'array',
          maxItems: GRAPH_REF_ARRAY_MAX_ITEMS,
          items: NON_BLANK_STRING_SCHEMA,
          description: 'Element slugs this node uses (project / capability).',
        },
        path: nonBlankStringSchema(
          'One canonical implementation entrypoint for a capability or element (repo-relative file or directory). Preserved as evidence and checked by validate_vault path drift.',
        ),
        body: {
          type: 'string',
          description: 'Markdown body (optional). When omitted a kind-specific starter body is written so the file is self-explanatory in the editor.',
        },
        labels: LOCALE_LABELS_SCHEMA,
      },
      required: ['slug', 'kind', 'title'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        slug: { type: 'string' },
        filePath: { type: 'string' },
        changed: { type: 'boolean' },
        warnings: { type: 'array', items: { type: 'string' } },
        postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
      },
      required: ['ok', 'slug', 'filePath', 'changed'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_concepts',
    description:
      'Batch-create multiple nodes in one call — same per-row shape as `add_concept`. ' +
      'Use after `analyze_repo_structure` or another reviewed proposal flow ' +
      'when the agent has K accepted candidates from the user — replaces K×`add_concept` ' +
      'round-trips. Each row is processed independently: existing-slug / invalid-kind / ' +
      'missing-required-fields / non-object row shape / unknown row fields surface as `{ slug, ok: false, error }` rows whose errors include a `concepts[n]` row label, single unknown-field rows include `receivedField` plus one-row `unknownFields`, multi unknown-field rows report every unknown field with nearest hints and `Received fields: ...`, and duplicate input slugs report the later `concepts[n]` row plus first-seen `concepts[m]` with structured `rowName` / `firstSeenAt`; the rest ' +
      'still land. A row whose normalized title matches an earlier landed row in the same batch still lands but carries a near-duplicate `warning` — `patch_concept` the earlier node instead of forking the same concept (duplicates are the #1 growing-vault failure mode). '
      + '`concepts[]` order in the response matches the input. Cap = 50 per ' +
      'call (split into multiple batches for larger sets). NO atomic rollback — if you ' +
      'need all-or-nothing semantics use single `add_concept` calls. Invalid-only batches return no row-level write metadata and no top-level `postWriteMaintenance`. When at least one row changes the vault, the response includes one ' + POST_WRITE_MAINTENANCE_GUIDANCE + ' for the final graph.' + ' ' + ELEMENT_NAMING_RULE_BATCH_EN,
    inputSchema: {
      type: 'object',
      properties: {
        concepts: {
          type: 'array',
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              slug: NON_BLANK_STRING_SCHEMA,
              kind: {
                ...NON_BLANK_STRING_SCHEMA,
                enum: ['project', 'domain', 'capability', 'element', 'document'],
              },
              title: NON_BLANK_STRING_SCHEMA,
              domain: NON_BLANK_STRING_SCHEMA,
              capabilities: { type: 'array', maxItems: GRAPH_REF_ARRAY_MAX_ITEMS, items: NON_BLANK_STRING_SCHEMA },
              elements: { type: 'array', maxItems: GRAPH_REF_ARRAY_MAX_ITEMS, items: NON_BLANK_STRING_SCHEMA },
              path: nonBlankStringSchema(
                'One canonical implementation entrypoint for a capability or element (repo-relative file or directory).',
              ),
              body: { type: 'string' },
              labels: LOCALE_LABELS_SCHEMA,
            },
            required: ['slug', 'kind', 'title'],
            additionalProperties: false,
          },
          description: 'Array of concept specs (max 50). Each row uses the same shape as `add_concept` input.',
        },
      },
      required: ['concepts'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        concepts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slug: { type: 'string' },
              ok: { type: 'boolean' },
              filePath: { type: 'string' },
              changed: { type: 'boolean' },
              warnings: { type: 'array', items: { type: 'string' } },
              error: { type: 'string' },
              errorCode: { type: 'string' },
              valueName: { type: 'string' },
              receivedValue: { type: 'string' },
              suggestion: { type: 'string' },
              allowedValues: { type: 'array', items: { type: 'string' } },
              rowName: { type: 'string' },
              receivedField: { type: 'string' },
              unknownFields: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    suggestion: { type: 'string' },
                  },
                  required: ['name'],
                  additionalProperties: false,
                },
              },
              allowedFields: { type: 'array', items: { type: 'string' } },
              receivedFields: { type: 'array', items: { type: 'string' } },
              conflictSubject: { type: 'string' },
              conflictSlug: { type: 'string' },
              firstSeenAt: { type: 'string' },
              recoveryTools: { type: 'array', items: { type: 'string' } },
              avoidTools: { type: 'array', items: { type: 'string' } },
            },
            required: ['slug', 'ok'],
            additionalProperties: false,
          },
        },
        postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
      },
      required: ['concepts'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_relation',
    description:
      'Add a semantic relation between two nodes. Appends to the matching ' +
      'frontmatter graph key (domains / capabilities / elements / dependencies / relates / contains / describes); ' +
      '`domain` sets the source node\'s inline parent domain. The relation type picks which key receives the entry. ' +
      'A new `depends_on` relation requires a nonblank `why`; an already-existing edge remains an idempotent read even if legacy data has no rationale. **R11**: optional ' +
      '`expected_mtime` — pass the source-side `mtime` from a prior get_concept ' +
      'so concurrent external edits throw VaultConflictError. ' +
      'Invalid relation `type` is rejected before endpoint slug resolution with a closest-value hint and structured `valueName` / `receivedValue` / `suggestion` / `allowedValues` repair fields in `structuredContent`, with no `changed`, `alreadyExists`, or `postWriteMaintenance` write metadata. ' +
      'Changed writes return ' + POST_WRITE_MAINTENANCE_GUIDANCE + ' so agents can immediately see graph cleanup / relation suggestions after the edge lands. ' +
      '**For multiple already-approved semantic edges use `add_relations({relations: [...]})` (batch, idempotent, max 50). `infer_imports.moduleEdges` require exact-evidence review, a semantic rationale, and human approval first.**',
    inputSchema: {
      type: 'object',
      properties: {
        from: nonBlankStringSchema('Source slug.'),
        to: nonBlankStringSchema('Target slug.'),
        type: {
          ...ADD_RELATION_TYPE_SCHEMA,
          description: 'Relation type.',
        },
        // Restores a regression where only the schema block vanished in a merge
        // (the handler already accepted `why`). strict-args derives its argument
        // allowlist from the schema, so without this `why` is rejected as
        // `unknown_argument`.
        why: {
          type: 'string',
          maxLength: 300,
          description:
            'One-line rationale for this relation ("A leans on B because ..."). Stored in the SAME frontmatter write as the ref (relation_notes map) — write it whenever you know the reason; a graph edge without a why is a mind-map line, not an ontology claim.',
        },
        expected_mtime: {
          type: 'number',
          minimum: 0,
          description:
            'Optional conflict guard for the source slug. If the source mtimeMs differs at write time, the call throws.',
        },
      },
      required: ['from', 'to', 'type'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        from: { type: 'string' },
        to: { type: 'string' },
        type: { type: 'string' },
        key: { type: 'string' },
        changed: { type: 'boolean' },
        alreadyExists: { type: 'boolean' },
        postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
      },
      required: ['ok', 'from', 'to', 'type'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_relations',
    description:
      'Batch-add multiple relations in one call — same per-row shape as `add_relation`. ' +
      'Use after `analyze_repo_structure` or another review flow when the agent has K semantic edges accepted by the user — replaces K×`add_relation` round-trips. Inferred module edges are not accepted merely because imports exist; review exact evidence and include the required nonblank `why` for every new `depends_on`. ' +
      'Each row is processed independently and idempotently: existing edges return `{ok: true, alreadyExists: true}`; ' +
      'missing source/target slugs / unknown type / non-object row shape / unknown row fields surface as `{ok: false, error}` with a `relations[n]` row label and structured `rowName`; unknown type rows include a closest-value hint with structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`; single unknown-field rows include `receivedField` plus one-row `unknownFields`; multi unknown-field rows report every unknown field with nearest hints, `allowedFields`, `receivedFields`, and `Received fields: ...`. ' +
      '`relations[]` order in the response matches the input. Cap = 50 per call. ' +
      'NO atomic rollback — for all-or-nothing semantics use single `add_relation` calls. ' +
      'Tip: avoid `expected_mtime` in batch when multiple rows share the same `from` slug — ' +
      'the first row mutates that file so the second would see a stale mtime. Invalid-only batches return no row-level `changed` / `alreadyExists` write metadata and no top-level `postWriteMaintenance`. When at least one row changes the vault, the response includes one ' + POST_WRITE_MAINTENANCE_GUIDANCE + ' for the final graph.',
    inputSchema: {
      type: 'object',
      properties: {
        relations: {
          type: 'array',
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              from: NON_BLANK_STRING_SCHEMA,
              to: NON_BLANK_STRING_SCHEMA,
              type: ADD_RELATION_TYPE_SCHEMA,
              why: {
                type: 'string',
                maxLength: 300,
                description: 'One-line rationale stored with the relation in relation_notes. Required at runtime for every new depends_on row.',
              },
              expected_mtime: { type: 'number', minimum: 0 },
            },
            required: ['from', 'to', 'type'],
            additionalProperties: false,
          },
          description: 'Array of relation specs (max 50). Each row uses the same shape as `add_relation` input.',
        },
      },
      required: ['relations'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        relations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              from: { type: 'string' },
              to: { type: 'string' },
              type: { type: 'string' },
              key: { type: 'string' },
              changed: { type: 'boolean' },
              alreadyExists: { type: 'boolean' },
              error: { type: 'string' },
              errorCode: { type: 'string' },
              valueName: { type: 'string' },
              receivedValue: { type: 'string' },
              suggestion: { type: 'string' },
              allowedValues: { type: 'array', items: { type: 'string' } },
              rowName: { type: 'string' },
              receivedField: { type: 'string' },
              unknownFields: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    suggestion: { type: 'string' },
                  },
                  required: ['name'],
                  additionalProperties: false,
                },
              },
              allowedFields: { type: 'array', items: { type: 'string' } },
              receivedFields: { type: 'array', items: { type: 'string' } },
              missingSubject: { type: 'string' },
              missingSlug: { type: 'string' },
              similarSlugs: { type: 'array', items: { type: 'string' } },
              recoveryTools: { type: 'array', items: { type: 'string' } },
              createTool: { type: 'string' },
            },
            required: ['ok', 'from', 'to', 'type'],
            additionalProperties: false,
          },
        },
        postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
      },
      required: ['relations'],
      additionalProperties: false,
    },
  },
  {
    name: 'remove_relation',
    description:
      'Safely remove one exact typed relation and its `relation_notes` rationale from a source node. Defaults to dry-run; pass confirm:true to write. Supports expected_mtime conflict protection. Use this instead of replacing a whole frontmatter array with patch_concept.',
    inputSchema: {
      type: 'object',
      properties: {
        from: nonBlankStringSchema('Source slug.'),
        to: nonBlankStringSchema('Target slug.'),
        type: ADD_RELATION_TYPE_SCHEMA,
        confirm: { type: 'boolean', description: 'Actually remove when true; default is dry-run.' },
        expected_mtime: { type: 'number', minimum: 0 },
      },
      required: ['from', 'to', 'type'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' }, dryRun: { type: 'boolean' }, changed: { type: 'boolean' },
        ...DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
        exists: { type: 'boolean' }, from: NON_BLANK_STRING_SCHEMA, to: NON_BLANK_STRING_SCHEMA,
        type: NON_BLANK_STRING_SCHEMA, key: NON_BLANK_STRING_SCHEMA,
        removedRationale: { type: 'string' }, postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
      },
      required: ['ok', 'dryRun', 'changed', ...DESTRUCTIVE_PREVIEW_REQUIRED, 'exists', 'from', 'to', 'type', 'key'],
      additionalProperties: false,
    },
  },
  {
    name: 'replace_relation',
    description:
      'Atomically replace one exact relation with a new target and/or type, moving or replacing its rationale in the same frontmatter write. Defaults to dry-run; pass confirm:true to write. Supports expected_mtime.',
    inputSchema: {
      type: 'object',
      properties: {
        from: nonBlankStringSchema('Source slug.'), oldTo: nonBlankStringSchema('Current target slug.'),
        oldType: ADD_RELATION_TYPE_SCHEMA, newTo: nonBlankStringSchema('Replacement target slug.'),
        newType: ADD_RELATION_TYPE_SCHEMA, why: { type: 'string', maxLength: 300 },
        confirm: { type: 'boolean' }, expected_mtime: { type: 'number', minimum: 0 },
      },
      required: ['from', 'oldTo', 'oldType', 'newTo', 'newType'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' }, dryRun: { type: 'boolean' }, changed: { type: 'boolean' },
        ...DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
        from: NON_BLANK_STRING_SCHEMA,
        oldRelation: RELATION_RESULT_SCHEMA, newRelation: RELATION_RESULT_SCHEMA,
        postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
      },
      required: ['ok', 'dryRun', 'changed', ...DESTRUCTIVE_PREVIEW_REQUIRED, 'from', 'oldRelation', 'newRelation'],
      additionalProperties: false,
    },
  },
  {
    name: 'patch_concept',
    description:
      'Update the frontmatter and/or body of an existing ontology node. Use ' +
      'when an AI agent revises, deepens, or reclassifies a node. Frontmatter ' +
      'patches are key-by-key — null deletes a key, omission preserves it. ' +
      'Body is fully replaced when provided, otherwise preserved. Pass ' +
      '`expected_mtime` (from the previous get_concept response) to detect ' +
      'concurrent external edits — throws VaultConflictError if the file has ' +
      'changed on disk since you read it. Changed writes return ' +
      POST_WRITE_MAINTENANCE_GUIDANCE + ' so agents can immediately continue graph cleanup.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: nonBlankStringSchema('Vault-relative slug (omit the .md extension).'),
        frontmatter: {
          type: 'object',
          description:
            'Frontmatter key/value patches (e.g. { kind: "capability", domain: "views" }). null removes the key. Per-locale display names go here as `display_ko` / `display_en` — fill every locale the vault serves so both audiences read a native name (`title` stays the search/matching source).',
          additionalProperties: true,
        },
        body: {
          type: 'string',
          description: 'Full replacement markdown body (optional). Preserved when omitted.',
        },
        expected_mtime: {
          type: 'number',
          minimum: 0,
          description:
            'Optional conflict guard. If the file mtimeMs differs at write time, the call throws so the caller can re-read and retry. Pass the `mtime` field from the most recent get_concept response.',
        },
      },
      required: ['slug'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        slug: { type: 'string' },
        filePath: { type: 'string' },
        changed: { type: 'boolean' },
        postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
      },
      required: ['ok', 'slug', 'filePath', 'changed', 'postWriteMaintenance'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_backlinks',
    description:
      'Return every node that points to the target slug. Scans both frontmatter ' +
      'array keys (capabilities / elements / dependencies / relates / contains / ' +
      'describes etc.) and the wikilinks / markdown links in the body. Used by ' +
      'AI agents to walk the graph from a node to its dependents.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: nonBlankStringSchema('Target vault-relative slug (omit the .md extension).'),
      },
      required: ['slug'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        target: NON_BLANK_STRING_SCHEMA,
        total: { type: 'integer', minimum: 0 },
        matches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
              slug: NON_BLANK_STRING_SCHEMA,
              kind: NON_BLANK_STRING_SCHEMA,
              title: NON_BLANK_STRING_SCHEMA,
              domain: { type: 'string' },
              mtime: { type: 'number', minimum: 0 },
              matchedKeys: {
                type: 'array',
                items: NON_BLANK_STRING_SCHEMA,
              },
              matchedInBody: { type: 'boolean' },
            },
            required: ['uid', 'slug', 'kind', 'title', 'mtime'],
            additionalProperties: false,
          },
        },
      },
      required: ['target', 'total', 'matches'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_neighbors',
    description:
      'Return the one-hop graph neighborhood around a node. Unlike find_backlinks, ' +
      'this is graph-frontmatter only and can include outgoing, incoming, or both ' +
      'directions. Returns canonical edges plus neighbor node summaries so agents ' +
      'can inspect a local subgraph in one call.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: nonBlankStringSchema(
          'Center node slug, unique tail slug, or frontmatter `slug` alias.',
        ),
        direction: {
          type: 'string',
          enum: ['outgoing', 'incoming', 'both'],
          description: 'Edge direction to include. Defaults to both.',
        },
        types: {
          type: 'array',
          maxItems: RELATION_TYPE_VALUES.length,
          items: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
          description:
            'Optional relation types/frontmatter keys to include, e.g. ["domain", "depends_on", "contains"]. Public add_relation types are normalized to stored graph keys.',
        },
        includeNodes: {
          type: 'boolean',
          description:
            'When true (default), include neighbor node summaries for resolved edges.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Positive integer max edges to return. Defaults to 100, max 500.',
        },
      },
      required: ['slug'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        center: NON_BLANK_STRING_SCHEMA,
        requested: NON_BLANK_STRING_SCHEMA,
        direction: {
          type: 'string',
          enum: ['outgoing', 'incoming', 'both'],
        },
        types: {
          type: 'array',
          items: NON_BLANK_STRING_SCHEMA,
        },
        totalEdges: { type: 'integer', minimum: 0 },
        limited: { type: 'boolean' },
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              direction: {
                type: 'string',
                enum: ['outgoing', 'incoming'],
              },
              from: NON_BLANK_STRING_SCHEMA,
              to: NON_BLANK_STRING_SCHEMA,
              via: NON_BLANK_STRING_SCHEMA,
              ref: NON_BLANK_STRING_SCHEMA,
              resolved: { type: 'boolean' },
              unresolvedReason: { type: 'string' },
            },
            required: ['direction', 'from', 'to', 'via', 'ref', 'resolved'],
            additionalProperties: false,
          },
        },
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
              slug: NON_BLANK_STRING_SCHEMA,
              kind: NON_BLANK_STRING_SCHEMA,
              title: NON_BLANK_STRING_SCHEMA,
              domain: { type: 'string' },
              mtime: { type: 'number', minimum: 0 },
            },
            required: ['uid', 'slug', 'kind', 'title', 'mtime'],
            additionalProperties: false,
          },
        },
      },
      required: ['center', 'requested', 'direction', 'totalEdges', 'limited', 'edges'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_path',
    description:
      'Shortest path between two nodes (undirected BFS). Returns ' +
      '`{ from, to, hops: [slug...], nodes: [{uid, slug, kind, title, domain?}], edges: [{from, to, via, rationale?}] }` where each ' +
      '`via` is the frontmatter key (`domains` / `domain` / `capabilities` / `elements` / `dependencies` / ' +
      '`relates` / `contains` / `describes`) that linked the two slugs and `rationale` is the one-line ' +
      '`relation_notes` sentence the declaring document stores for that pair (present only when one is stored) — so the ' +
      'agent sees not just *that* A and B are connected but by which key and, when someone wrote it down, *why*. ' +
      'Returns `{ found: false }` when no path is found within maxHops, plus a `growthHint` — a concrete add_relation (both endpoints exist) or add_concept (an endpoint is missing) example so the unanswered question becomes a vault-growth signal instead of a dead end. maxHops defaults to 5 and is capped at 20.',
    inputSchema: {
      type: 'object',
      properties: {
        from: nonBlankStringSchema('Source slug.'),
        to: nonBlankStringSchema('Target slug.'),
        maxHops: {
          type: 'integer',
          minimum: 0,
          maximum: 20,
          description: 'Non-negative integer maximum hop count (default 5, max 20).',
        },
      },
      required: ['from', 'to'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        from: NON_BLANK_STRING_SCHEMA,
        to: NON_BLANK_STRING_SCHEMA,
        found: { type: 'boolean' },
        reason: { type: 'string' },
        hopCount: { type: 'integer', minimum: 0 },
        hops: {
          type: 'array',
          items: NON_BLANK_STRING_SCHEMA,
        },
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from: NON_BLANK_STRING_SCHEMA,
              to: NON_BLANK_STRING_SCHEMA,
              via: NON_BLANK_STRING_SCHEMA,
              rationale: EDGE_RATIONALE_OUTPUT_SCHEMA,
            },
            required: ['from', 'to', 'via'],
            additionalProperties: false,
          },
        },
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
              slug: NON_BLANK_STRING_SCHEMA,
              kind: NON_BLANK_STRING_SCHEMA,
              title: NON_BLANK_STRING_SCHEMA,
              domain: { type: 'string' },
            },
            required: ['uid', 'slug', 'kind', 'title'],
            additionalProperties: false,
          },
        },
        growthHint: {
          ...GROWTH_HINT_OUTPUT_SCHEMA,
          description:
            'Only present when found=false — a candidate add_relation (both endpoints exist) or add_concept (an endpoint is missing) suggestion, derived from the real vault, not invented.',
        },
      },
      required: ['from', 'to', 'found'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_kinds',
    description:
      "Vault kind distribution — { total, byKind: { capability: N, ... } }. " +
      'A quick census so AI agents can size up the vault without paging through ' +
      'list_concepts.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    outputSchema: {
      type: 'object',
      properties: {
        total: {
          type: 'integer',
          minimum: 0,
          description: 'Total number of vault docs that declare a kind.',
        },
        byKind: {
          type: 'object',
          additionalProperties: {
            type: 'integer',
            minimum: 0,
          },
          description: 'Node counts keyed by frontmatter kind.',
        },
      },
      required: ['total', 'byKind'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_orphans',
    description:
      'List orphan nodes — docs that no other node references via any frontmatter ' +
      'array key. Useful as a cleanup starting point or to answer "which nodes ' +
      'are unused?". Same matching policy as find_backlinks (full slug or final ' +
      'segment). Root/sentinel kinds like project and vault-readme are excluded by default.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: nonBlankStringSchema(
          'Restrict to one kind (e.g. capability). Omit for all kinds.',
          { enum: NODE_KIND_VALUES },
        ),
        excludeKinds: {
          type: 'array',
          maxItems: NODE_KIND_VALUES.length,
          items: { ...NON_BLANK_STRING_SCHEMA, enum: NODE_KIND_VALUES },
          description:
            "Kinds to exclude from results. Defaults to ['project', 'vault-readme']. Pass [] to include every kind. Typos fail with nearest-value hints.",
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        total: { type: 'integer', minimum: 0 },
        orphans: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
              slug: NON_BLANK_STRING_SCHEMA,
              kind: NON_BLANK_STRING_SCHEMA,
              title: NON_BLANK_STRING_SCHEMA,
              domain: { type: 'string' },
              mtime: { type: 'number', minimum: 0 },
            },
            required: ['uid', 'slug', 'kind', 'title', 'mtime'],
            additionalProperties: false,
          },
        },
      },
      required: ['total', 'orphans'],
      additionalProperties: false,
    },
  },
  {
    name: 'query_concepts',
    description:
      'Typed filter DSL — search vault nodes by predicate. Built for saved-filter / ' +
      'smart-list cases that find_path (BFS) cannot answer, such as "which ' +
      'capabilities have zero elements?", "stub-only nodes in domain=auth", or ' +
      '"has(depends_on) excluding vault-readme".\n\n' +
      'Grammar (case-insensitive keywords, whitespace-tolerant):\n' +
      '  filter    := atom (AND|OR atom)*\n' +
      '  atom      := NOT? predicate\n' +
      '  predicate := key=value | key!=value | has(key)\n\n' +
      'Keys: kind / domain / slug / title for equality, plus any graph frontmatter array key for has(...). kind and has(...) keys are enum-validated with nearest-value hints.\n' +
      'Example: `kind=capability AND domain=auth AND NOT has(elements)` — ' +
      'capabilities under domain auth that have zero elements (= unfinished caps). ' +
      'When total=0, the response includes a `growthHint` — it names any referenced kind/domain that has 0 nodes in this vault, or nudges you to loosen the filter.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: nonBlankStringSchema(
          'Filter expression. Example: kind=capability AND has(elements). Supports NOT / AND / OR. ' +
            "Wrap values containing whitespace or special characters with \"...\" or '...'.",
        ),
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Positive integer max rows to return. Defaults to 100, max 500.',
        },
      },
      required: ['filter'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        filter: NON_BLANK_STRING_SCHEMA,
        parsedAs: NON_BLANK_STRING_SCHEMA,
        total: { type: 'integer', minimum: 0 },
        matches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
              slug: NON_BLANK_STRING_SCHEMA,
              kind: NON_BLANK_STRING_SCHEMA,
              title: NON_BLANK_STRING_SCHEMA,
              domain: { type: 'string' },
              capabilities: {
                type: 'array',
                items: NON_BLANK_STRING_SCHEMA,
              },
              elements: {
                type: 'array',
                items: NON_BLANK_STRING_SCHEMA,
              },
              mtime: { type: 'number', minimum: 0 },
            },
            required: ['uid', 'slug', 'kind', 'title', 'mtime'],
            additionalProperties: false,
          },
        },
        limited: { type: 'boolean' },
        growthHint: {
          ...GROWTH_HINT_OUTPUT_SCHEMA,
          description: 'Only present when total=0 — flags a referenced kind/domain with 0 nodes in this vault census, or a generic loosen-the-filter nudge otherwise.',
        },
      },
      required: ['filter', 'parsedAs', 'total', 'matches', 'limited'],
      additionalProperties: false,
    },
  },
  {
    name: 'compile_ontology',
    description:
      'Compile the whole markdown vault into a deterministic graph artifact: canonical nodes, edges, aliases, graph issues, graph-array canonicalization actions, and optional adjacency indexes. ' +
      'This is the compiler-style read path for graph-database-like use: call it before advanced reasoning, indexing, export, or non-developer-friendly graph views. Includes a stable semantic graphHash and maxMtime for cache invalidation. side effect 0. ' +
      'Large vaults (100+ nodes) can exceed the MCP token cap with the default full payload — use `summary: true` for cheap polling (counts + graphHash, no arrays), or `nodesLimit/nodesOffset` / `edgesLimit/edgesOffset` to slice arrays. The response includes `nodesPagination` / `edgesPagination` meta with `{offset, limit, total, returned, hasMore, nextOffset}` when sliced.',
    inputSchema: {
      type: 'object',
      properties: {
        includeIndexes: {
          type: 'boolean',
          description:
            'When true, include indexes `{out, in, byKind, byDomain, edgeById, aliasToSlug, uidToSlug, slugToUid, mergedUidToSlug}`. Graph traversal remains slug-based; UID indexes provide exact identity resolution. Defaults false to keep payload smaller.',
        },
        summary: {
          type: 'boolean',
          description:
            'When true, omit `nodes` / `edges` / `aliases` / `ambiguousAliases` / `canonicalizationActions` / `indexes` arrays — return only `graphHash`, `maxMtime`, counts (`nodeCount`/`edgeCount`/`aliasCount`/...), and aggregate `byKind`/`byDomain` as counts. Cheap polling for cache invalidation and graph-size assessment.',
        },
        nodesLimit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Positive integer max nodes to return. Pair with `nodesOffset` to paginate. Omit for unlimited (backward compat), max 500 when provided.',
        },
        nodesOffset: {
          type: 'integer',
          minimum: 0,
          description: 'Non-negative integer starting index in the sorted nodes array. Defaults 0.',
        },
        edgesLimit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Positive integer max edges to return. Pair with `edgesOffset` to paginate. Max 500.',
        },
        edgesOffset: {
          type: 'integer',
          minimum: 0,
          description: 'Non-negative integer starting index in the sorted edges array. Defaults 0.',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        version: { type: 'integer', minimum: 1 },
        graphHash: NON_BLANK_STRING_SCHEMA,
        maxMtime: { type: 'number', minimum: 0 },
        nodeCount: { type: 'integer', minimum: 0 },
        edgeCount: { type: 'integer', minimum: 0 },
        resolvedEdgeCount: { type: 'integer', minimum: 0 },
        externalEdgeCount: { type: 'integer', minimum: 0 },
        unresolvedEdgeCount: { type: 'integer', minimum: 0 },
        aliasCount: { type: 'integer', minimum: 0 },
        ambiguousAliasCount: { type: 'integer', minimum: 0 },
        issueCount: { type: 'integer', minimum: 0 },
        canonicalizationActionCount: { type: 'integer', minimum: 0 },
        byKind: {
          type: 'object',
          additionalProperties: { type: 'integer', minimum: 0 },
        },
        byDomain: {
          type: 'object',
          additionalProperties: { type: 'integer', minimum: 0 },
        },
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
              merged_uids: {
                type: 'array',
                items: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
              },
              slug: NON_BLANK_STRING_SCHEMA,
              kind: { type: 'string' },
              title: { type: 'string' },
              domain: { type: 'string' },
              path: NON_BLANK_STRING_SCHEMA,
              mtime: { type: 'number' },
              outDegree: { type: 'integer', minimum: 0 },
              inDegree: { type: 'integer', minimum: 0 },
            },
            required: ['uid', 'slug', 'kind', 'title', 'mtime', 'outDegree', 'inDegree'],
            additionalProperties: false,
          },
        },
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: NON_BLANK_STRING_SCHEMA,
              from: NON_BLANK_STRING_SCHEMA,
              to: NON_BLANK_STRING_SCHEMA,
              via: NON_BLANK_STRING_SCHEMA,
              ref: NON_BLANK_STRING_SCHEMA,
              resolved: { type: 'boolean' },
              external: { type: 'boolean' },
            },
            required: ['id', 'from', 'to', 'via', 'ref', 'resolved', 'external'],
            additionalProperties: false,
          },
        },
        nodesPagination: paginationOutputSchema(),
        edgesPagination: paginationOutputSchema(),
        aliases: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              alias: NON_BLANK_STRING_SCHEMA,
              slug: NON_BLANK_STRING_SCHEMA,
            },
            required: ['alias', 'slug'],
            additionalProperties: false,
          },
        },
        ambiguousAliases: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              alias: NON_BLANK_STRING_SCHEMA,
              slugs: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
            },
            required: ['alias', 'slugs'],
            additionalProperties: false,
          },
        },
        issues: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              code: { ...NON_BLANK_STRING_SCHEMA, enum: ['ambiguous-alias', 'dangling-graph-reference'] },
              severity: { ...NON_BLANK_STRING_SCHEMA, enum: ['warning'] },
              message: NON_BLANK_STRING_SCHEMA,
              alias: NON_BLANK_STRING_SCHEMA,
              slugs: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
              slug: NON_BLANK_STRING_SCHEMA,
              via: NON_BLANK_STRING_SCHEMA,
              ref: NON_BLANK_STRING_SCHEMA,
            },
            required: ['code', 'severity', 'message'],
            additionalProperties: false,
          },
        },
        canonicalizationActions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slug: NON_BLANK_STRING_SCHEMA,
              keys: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA, enum: GRAPH_ARRAY_KEYS } },
              frontmatter: RELATION_ARRAY_PATCH_SCHEMA,
              expected_mtime: { type: 'number', minimum: 0 },
            },
            required: ['slug', 'keys', 'frontmatter', 'expected_mtime'],
            additionalProperties: false,
          },
        },
        indexes: {
          type: 'object',
          properties: {
            out: {
              type: 'object',
              additionalProperties: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
            },
            in: {
              type: 'object',
              additionalProperties: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
            },
            byKind: {
              type: 'object',
              additionalProperties: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
            },
            byDomain: {
              type: 'object',
              additionalProperties: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
            },
            edgeById: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  id: NON_BLANK_STRING_SCHEMA,
                  from: NON_BLANK_STRING_SCHEMA,
                  to: NON_BLANK_STRING_SCHEMA,
                  via: NON_BLANK_STRING_SCHEMA,
                  ref: NON_BLANK_STRING_SCHEMA,
                  resolved: { type: 'boolean' },
                  external: { type: 'boolean' },
                },
                required: ['id', 'from', 'to', 'via', 'ref', 'resolved', 'external'],
                additionalProperties: false,
              },
            },
            aliasToSlug: {
              type: 'object',
              additionalProperties: NON_BLANK_STRING_SCHEMA,
            },
            uidToSlug: {
              type: 'object',
              additionalProperties: NON_BLANK_STRING_SCHEMA,
            },
            slugToUid: {
              type: 'object',
              additionalProperties: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
            },
            mergedUidToSlug: {
              type: 'object',
              additionalProperties: NON_BLANK_STRING_SCHEMA,
            },
          },
          additionalProperties: false,
        },
        summary: {
          type: 'object',
          properties: {
            nodes: { type: 'integer', minimum: 0 },
            edges: { type: 'integer', minimum: 0 },
            graphHash: NON_BLANK_STRING_SCHEMA,
            maxMtime: { type: 'number', minimum: 0 },
            resolvedEdges: { type: 'integer', minimum: 0 },
            externalEdges: { type: 'integer', minimum: 0 },
            unresolvedEdges: { type: 'integer', minimum: 0 },
            aliases: { type: 'integer', minimum: 0 },
            ambiguousAliases: { type: 'integer', minimum: 0 },
            issues: { type: 'integer', minimum: 0 },
          },
          required: ['nodes', 'edges', 'graphHash', 'maxMtime', 'resolvedEdges', 'externalEdges', 'unresolvedEdges', 'aliases', 'ambiguousAliases', 'issues'],
          additionalProperties: false,
        },
      },
      required: [
        'version',
        'graphHash',
        'maxMtime',
        'nodeCount',
        'edgeCount',
        'resolvedEdgeCount',
        'externalEdgeCount',
        'unresolvedEdgeCount',
        'aliasCount',
        'ambiguousAliasCount',
        'issueCount',
        'canonicalizationActionCount',
        'byKind',
        'byDomain',
      ],
      additionalProperties: false,
    },
  },
  {
    name: 'query_ontology',
    description:
      'Analysis archive: `analysis_history` reads immutable diagnostic Markdown summaries without compiling the graph; use analysisMode, project, limit (1–100 scanned files, default 30), and analysisCursor. `analysis_record` reads one exact run or review with recordId (UUID). Records retain raw answers, full-body evidence when available, request scope and uncertainty. They are not approved ontology facts; stored qualification describes captured evidence, never current source validity. Reviews are joined to their exact run/finding id. Follow pagination even if a filtered page is empty. These archive operations do not support query_plan. ' +
      'Run graph-engine queries over the freshly compiled ontology artifact. Operations: `neighbors` (local graph neighborhood), `path` (one compiled-edge route between two nodes with aligned `nodes[]` summaries), `all_paths` (bounded simple paths between two nodes with per-path `nodes[]` summaries plus limit/searchBudget/exhaustive/truncatedByBudget/totalPathsExact metadata and evidence guidance), `query_plan` (EXPLAIN-style side-effect-free cost/index estimate plus execution advice before a target operation, filter-preserving suggestedQuery, and filter-aware estimate.totalMatches for match_nodes/match_edges), `centrality` (PageRank-style core-node ranking plus bridge/authority/hub lists), `communities` (label-propagation clusters inside the graph), `similar_nodes` (duplicate/overlap candidates before writes), `explain_relation` (direct edges, shortest path, and shared-neighbor explanation between two nodes), `reachability` (transitive graph closure from a start node), `pattern_walk` (explicit relation-sequence paths such as project → domains → capabilities), `impact` (incoming by default: what depends on this node), `blast_radius` (impact grouped by kind/domain with cross-domain edge risk), `subgraph` (bounded N-hop graph slice for UI/agent views), `builder_context` (persisted Workshop focus, layout positions, direct graph slice, and safe write handoff; unsaved UI drafts are explicitly excluded; operation name retained for compatibility), `overview` (counts, relation distribution, and hubs), `schema` (kind-relation-kind patterns), `facets` (filter/dashboard aggregates), `match_nodes` (graph DB-style node rows with degree filters plus a followUp packet for the first returned row), `match_edges` (graph DB-style edge pattern rows plus a followUp packet for the first returned real edge), `node_profile` (single node detail dashboard), `domain_profile` (domain detail dashboard), `domain_matrix` (domain-to-domain coupling), `project_scope` (project-contained graph slice), `project_map` (domain-by-domain project map), `relation_check` (schema-aware preflight before add_relation), `components` (connected graph islands), `lineage` and `containment_tree` (project/domain/capability containment), `cycles` (directed dependency-cycle checks), `topological_order` (prerequisite-first dependency ordering), `recommend_relations` (safe domain-containment suggestions), `growth_plan` (side-effect-free ontology expansion candidates), `maintenance_plan` (ordered post-write graph cleanup/repair actions with stable action `id`, count-safe summary fields, `byPhase` / `bySeverity` / `byKind` remaining-queue buckets, ready cursor `cursor.found=true` / `cursor.reason=null`, cursor `nextAfterActionId`/`hasMore` pagination metadata, afterActionId resume, unknown-cursor empty page with `cursor.nextAfterActionId=null` / `cursor.hasMore=false`, kind filters, executable graph-array canonicalization, `executable` flags, and current-page `nextExecutableAction` / `nextReviewAction` pointers), `agent_brief` (Claude Code/Codex handoff prompt, structured businessOntologyLens with business-first outcome → domain → capability → element read order, graphDbQueryPack for facets, schema, match_nodes, match_edges, domain_matrix, centrality, all_paths, explain_relation, and business_questions scans for outcome / domain boundary / capability claim nodes / implementation evidence edges, structured cliFallbackCommands, recipes, graph entrypoints, graph_traversal playbook, traversalStrategy plan_before_enumeration/bounded_path_evidence/containment_cross_check guidance, playbook evidence/stopWhen checklists, write guardrails, relationDecisionGuide, resultContracts for all_paths completeness and match_nodes/match_edges followUp evidence, and read-first write policy), `meaning_repair_review` (provenance-bound, byte-bounded typed evidence pages and literal full-body read calls for the compact meaning repair manifest), `workspace_brief` (first-contact status + next actions), and `health` (one-shot graph integrity dashboard whose `relationCensus` labels compiler declaration counts and the nonnumeric canonical app-map comparison unit). ' +
      'For `agent_brief`, select `project` explicitly when the vault has more than one project. Omitted `detail` and `detail:"full"` return the complete project-scoped diagnostic contract. For a known coding task, call `detail:"compact"` directly after `connection_info`; do not precede it with `workspace_brief` or a full inventory unless the question needs whole-vault health. Compact v2 requires a nonblank request-local `task` (max 2000 characters) and returns at most 12000 UTF-8 JSON bytes: final source/meaning currentness, claim-compatible broad capability selection, persisted element/path evidence, explicit unknown impact and verification, exact full-body next reads, and a `detail:"full"` follow-up. Definition and Includes support desired work; Excludes may align with explicit non-goals, while a desired/negative boundary conflict, an unsupported claim, or a tied top claim returns no capability. Its `content[0].text` is the bounded handoff prompt while `structuredContent` carries the typed facts once. When the selected element Markdown contains reviewed Primary implementation / Supporting implementation / Focused test coordinates and the bound source is current, taskNavigation verifies only those named files and returns exact current lines plus the reviewed non-exhaustive IN/OUT boundary. After those reads, Atlas rechecks the same source identity, fingerprint, revision, and graph hash; any mismatch removes the exact target and downgrades the complete outer currentness contract. A ready prompt reads primary, supporting, focused tests, and a verified manifest together; requires named positive and negative regression tests with exact observable output; and runs the focused check once followed by one non-overlapping full check. Missing, ambiguous, stale, unsafe, or unrecorded coordinates emit no exact target. Task matching selects evidence only; it never searches the repository, never proves source behavior, never persists task text, never approves meaning, and never writes the vault. ' +
      'For `impact` and `blast_radius`, only declared `depends_on` is allowed; use reachability/subgraph for structure. Blast radius reports unknown risk/completeness plus review_required or declared_with_rationale edge qualification until relation-level source receipts exist. A missing `depends_on` preflight is schema-only: `relation_check` returns `proposedAction:null` plus a non-writing `approvalGate` until the agent explains the observable ability and semantic rationale and receives explicit human approval. ' +
      'Accepts canonical slugs or unique aliases. side effect 0. Use this when you need graph-database-like answers without pulling the full compile_ontology payload.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          ...NON_BLANK_STRING_SCHEMA,
          enum: QUERY_ONTOLOGY_OPERATIONS,
          description: 'Query operation to run.',
        },
        targetOperation: {
          ...NON_BLANK_STRING_SCHEMA,
          enum: QUERY_PLAN_TARGET_OPERATIONS,
          description:
            'query_plan only: read-only graph operation to explain before execution. Excludes query_plan, meaning_repair_review, analysis_history and analysis_record.',
        },
        recordId: nonBlankStringSchema('analysis_record only: immutable analysis or diagnostic-review UUID.'),
        analysisMode: { type: 'string', enum: ['meaning', 'architecture'], description: 'analysis_history only: optional analysis subject filter.' },
        analysisCursor: nonBlankStringSchema('analysis_history only: nextCursor from the preceding scanned-file page.'),
        iterations: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description:
            'centrality/communities only: positive integer PageRank or label-propagation iteration count. Defaults to 20, max 100.',
        },
        slug: nonBlankStringSchema(
          'Center/root node slug or unique alias. builder_context also accepts its own canonical Workshop focusParam (for example domain:auth). Required for neighbors, reachability, pattern_walk, impact, blast_radius, subgraph, builder_context, lineage, node_profile, and domain_profile; optional root for containment_tree.',
        ),
        seed: nonBlankStringSchema('Alias for slug when operation is subgraph or builder_context.'),
        candidateSlug: nonBlankStringSchema(
          'similar_nodes only: proposed slug for a not-yet-written concept candidate.',
        ),
        title: nonBlankStringSchema(
          'similar_nodes only: proposed title for a not-yet-written concept candidate.',
        ),
        from: nonBlankStringSchema(
          'Source node slug or unique alias. Required for path, all_paths, and explain_relation.',
        ),
        project: nonBlankStringSchema(
          'domain_matrix/project_scope/project_map/agent_brief/meaning_repair_review: project root slug or unique alias. Required for meaning_repair_review; optional when exactly one kind: project node exists for the other operations.',
        ),
        detail: {
          type: 'string',
          enum: ['compact', 'full'],
          description:
            'agent_brief only: compact v2 returns a task-scoped, selected-project handoff capped at 12000 UTF-8 JSON bytes, including exact reviewed taskNavigation only when the bound source is current; full returns the complete diagnostic manuals and graph packs. Omit to keep the current full response while compact is being qualified.',
        },
        task: {
          ...NON_BLANK_STRING_SCHEMA,
          maxLength: AGENT_BRIEF_TASK_MAX_CHARS,
          description:
            'agent_brief detail:"compact" only: request-local coding task used to select persisted capability, element, and reviewed navigation evidence after Definition/Includes/Excludes compatibility. Conflicting, unsupported, or tied claims return no capability. Never persisted, never used to invent a coordinate, and never treated as behavior proof or semantic approval.',
        },
        expectedGraphHash: nonBlankStringSchema(
          'meaning_repair_review first page: exact graphHash from meaningRepair:v2 provenance. Later nextCall values are revision-bound and omit it.',
        ),
        expectedSourceFingerprint: nonBlankStringSchema(
          'meaning_repair_review first page: exact current sourceFingerprint from meaningRepair:v2 provenance. Later nextCall values are revision-bound and omit it.',
        ),
        reviewRevision: nonBlankStringSchema(
          'meaning_repair_review only: sha256 revision from meaningRepair:v2, binding graph/source/typed rows/target mtimes.',
        ),
        cursor: nonBlankStringSchema(
          'meaning_repair_review only: opaque stateless cursor returned as pagination.nextCursor. Omit for the first page.',
        ),
        to: nonBlankStringSchema(
          'Target node slug or unique alias. Required for path, all_paths, and explain_relation.',
        ),
        direction: {
          type: 'string',
          enum: ['incoming', 'outgoing', 'both', 'undirected'],
          description:
            'neighbors/reachability/impact/blast_radius/subgraph/builder_context: incoming, outgoing, or both. path/all_paths/explain_relation/reachability also accepts undirected.',
        },
        types: {
          type: 'array',
          maxItems: RELATION_TYPE_VALUES.length,
          items: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
          description:
            'Optional relation types to include, e.g. ["dependencies"] or ["depends_on"].',
        },
        pattern: {
          type: 'array',
          maxItems: RELATION_TYPE_VALUES.length,
          items: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
          description:
            'pattern_walk only: required relation sequence to follow, e.g. ["domains", "capabilities", "elements"]. depends_on is normalized to dependencies.',
        },
        type: {
          ...nonBlankStringSchema(
            'Relation type for relation_check/match_edges, e.g. depends_on, relates, contains, describes, domains, capabilities, elements, or domain.',
          ),
          enum: RELATION_TYPE_VALUES,
        },
        kind: {
          ...nonBlankStringSchema(
            `match_nodes: optional node kind filter (${NODE_KIND_DESCRIPTION}). recommend_relations currently supports capability or element.`,
          ),
          enum: NODE_KIND_VALUES,
        },
        domain: nonBlankStringSchema(
          'match_nodes: optional exact domain filter. domain_profile: domain root slug or unique alias.',
        ),
        slugContains: nonBlankStringSchema(
          'match_nodes only: optional case-insensitive substring filter on canonical slug.',
        ),
        minDegree: {
          type: 'integer',
          minimum: 0,
          description: 'match_nodes only: non-negative integer minimum total graph degree.',
        },
        maxDegree: {
          type: 'integer',
          minimum: 0,
          description: 'match_nodes only: non-negative integer maximum total graph degree.',
        },
        minInDegree: {
          type: 'integer',
          minimum: 0,
          description: 'match_nodes only: non-negative integer minimum incoming graph degree.',
        },
        minOutDegree: {
          type: 'integer',
          minimum: 0,
          description: 'match_nodes only: non-negative integer minimum outgoing graph degree.',
        },
        hasIncoming: {
          type: 'boolean',
          description: 'match_nodes only: require presence or absence of incoming graph edges.',
        },
        hasOutgoing: {
          type: 'boolean',
          description: 'match_nodes only: require presence or absence of outgoing graph edges.',
        },
        sort: {
          type: 'string',
          enum: ['degree', 'inDegree', 'outDegree', 'slug'],
          description:
            'match_nodes only: sort rows by degree, inDegree, outDegree, or slug. Defaults to degree.',
        },
        fromKind: {
          ...nonBlankStringSchema(
            `match_edges only: optional source node kind filter (${NODE_KIND_DESCRIPTION}). Source must be a real ontology node, not external/unresolved.`,
          ),
          enum: NODE_KIND_VALUES,
        },
        toKind: {
          ...nonBlankStringSchema(
            `match_edges only: optional target kind filter (${EDGE_TARGET_KIND_DESCRIPTION}). Use external or unresolved for non-node refs.`,
          ),
          enum: EDGE_TARGET_KIND_VALUES,
        },
        relation: {
          ...nonBlankStringSchema('Alias for type when operation is relation_check.'),
          enum: RELATION_TYPE_VALUES,
        },
        depth: {
          type: 'integer',
          minimum: 0,
          maximum: 20,
          description: 'reachability/impact/blast_radius/subgraph/lineage/containment_tree traversal depth. Defaults to 3 for reachability, 2 for impact/blast_radius/subgraph, and 20 for lineage/containment_tree; capped at 20.',
        },
        maxHops: {
          type: 'integer',
          minimum: 0,
          maximum: 20,
          description: 'path/all_paths/explain_relation traversal hop cap or cycles max depth. Defaults to 5 for path/all_paths/explain_relation and 8 for cycles; capped at 20.',
        },
        searchBudget: {
          type: 'integer',
          minimum: 1,
          maximum: 50000,
          description:
            'all_paths, query_plan(all_paths), and cycles: maximum DFS states to expand before returning partial results. Defaults to 5000. For cycles this is the only bound that fires on an ACYCLIC graph — when truncatedByBudget is true, zero cycles does NOT mean acyclic (check totalCyclesExact).',
        },
        includeExternal: {
          type: 'boolean',
          description:
            'neighbors only: include external path-like element refs. Defaults false.',
        },
        includeUnresolved: {
          type: 'boolean',
          description:
            'neighbors only: include dangling unresolved refs. Defaults false.',
        },
        includeIsolated: {
          type: 'boolean',
          description:
            'topological_order only: include nodes that are not connected by the selected relation types. Defaults false.',
        },
        includeOrphans: {
          type: 'boolean',
          description:
            'containment_tree only: include ancestorless nodes not reached from project roots. Defaults false.',
        },
        executableOnly: {
          type: 'boolean',
          description:
            'maintenance_plan only: when true, return only actions with a proposed tool call.',
        },
        phases: {
          type: 'array',
          maxItems: MAINTENANCE_PHASE_VALUES.length,
          items: {
            ...NON_BLANK_STRING_SCHEMA,
            enum: MAINTENANCE_PHASE_VALUES,
          },
          description:
            'maintenance_plan only: optional phase filter, e.g. ["repair", "link", "materialize"].',
        },
        severities: {
          type: 'array',
          maxItems: MAINTENANCE_SEVERITY_VALUES.length,
          items: {
            ...NON_BLANK_STRING_SCHEMA,
            enum: MAINTENANCE_SEVERITY_VALUES,
          },
          description:
            'maintenance_plan only: optional severity filter, e.g. ["fail", "warn"].',
        },
        kinds: {
          type: 'array',
          maxItems: MAINTENANCE_KIND_VALUES.length,
          items: {
            ...NON_BLANK_STRING_SCHEMA,
            enum: MAINTENANCE_KIND_VALUES,
          },
          description:
            'maintenance_plan only: optional action-kind filter, e.g. ["add_missing_relation", "canonicalize_graph_arrays"].',
        },
        afterActionId: nonBlankStringSchema(
          'maintenance_plan only: stable action id cursor; return actions after this id. Without afterActionId the ready page reports cursor.found=true and cursor.reason=null; cursor.nextAfterActionId matches the last returned action id (or null for an empty page), and cursor.hasMore matches whether more remaining actions exist after this page. nextExecutableAction/nextReviewAction point only at the first executable/review action in the current returned page and preserve that action id, executable flag, phase, kind, and severity. Bucket totals (byPhase, bySeverity, byKind) match remainingActions for the returned cursor. Unknown cursors return an empty page with cursor.found=false, cursor.reason, zero remaining actions, cursor.nextAfterActionId=null, cursor.hasMore=false, and no next actions.',
        ),
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Positive integer max rows/components/order entries to return. Defaults to 100, capped at 500.',
        },
        nodeLimit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description:
            'components/communities/health/workspace_brief/agent_brief only: positive integer max node summaries per component/community group. Defaults to 25 for components/communities and 10 for health, capped at 500.',
        },
        itemLimit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description:
            'project_map only: positive integer max capability/element/hotspot summaries per domain. Defaults to 20, capped at 500.',
        },
        componentLimit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description:
            'health/workspace_brief/agent_brief only: positive integer max connected components to inspect. Defaults to 5, capped at 500.',
        },
        cycleLimit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description:
            'health/workspace_brief/agent_brief only: positive integer max dependency cycles to inspect. Defaults to 5, capped at 500.',
        },
        recommendationLimit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description:
            'health/workspace_brief/agent_brief only: positive integer max relation recommendations to inspect. Defaults to 20, capped at 500.',
        },
        orderLimit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description:
            'health/workspace_brief/agent_brief only: positive integer max topological-order rows to inspect. Defaults to 20, capped at 500.',
        },
        dependencyTypes: {
          type: 'array',
          maxItems: RELATION_TYPE_VALUES.length,
          items: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
          description:
            'health/workspace_brief/agent_brief only: dependency relation types used for cycle and topological-order checks. Defaults to ["dependencies"].',
        },
        componentTypes: {
          type: 'array',
          maxItems: RELATION_TYPE_VALUES.length,
          items: { ...NON_BLANK_STRING_SCHEMA, enum: RELATION_TYPE_VALUES },
          description:
            'health/workspace_brief/agent_brief only: relation types used for connected-component checks. Defaults to the full graph relation set.',
        },
      },
      required: ['operation'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: QUERY_ONTOLOGY_OPERATIONS },
            compiledSummary: { type: 'object', additionalProperties: true },
      },
      required: ['operation'],
      // The graph engine is intentionally polymorphic: each operation owns its
      // payload contract. This envelope gives MCP clients a stable discriminator
      // without pretending all 36 payloads share one shape.
      additionalProperties: true,
    },
  },
  {
    name: 'validate_vault',
    description:
      'R+ (cycle 46) — validate every doc in the vault, return per-doc + per-code aggregate. ' +
      'Replaces the K-round-trip pattern of `list_concepts` then per-doc `get_concept` (whose `warnings: [...]` is per-file). ' +
      `8 issue codes — ${VAULT_ISSUE_CODE_DESCRIPTION}. ` +
      'Returns `{ scanned, problems: [{slug, issues: [{code, severity, message}]}], summary: { problemFiles, errorFiles, warningFiles, byCode: { code: { severity, count, files } } } }`. ' +
      'Also returns `pathDrift`: frontmatter `path:` / `elements:` source paths that no longer exist on disk (vault→code drift), resolved against `repoRoot` (default: the active resolved repository root from connection_info). Ontology-slug references are never flagged. Fix via `patch_concept` or remove the stale entry. ' +
      'side effect 0. Use when an agent needs the *whole-vault* health view: first-contact before writes, before / after a batch write, or surfacing issues to the user.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: {
          ...NON_BLANK_STRING_SCHEMA,
          description:
            'Repository root that frontmatter source paths resolve against, for the pathDrift check. Defaults to the active resolved repository root from connection_info. Pass this if the vault lives apart from the code repo.',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        scanned: {
          type: 'integer',
          minimum: 0,
          description: 'Number of vault markdown files scanned.',
        },
        problems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slug: NON_BLANK_STRING_SCHEMA,
              issues: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    code: { ...NON_BLANK_STRING_SCHEMA, enum: VAULT_ISSUE_CODE_VALUES },
                    severity: {
                      type: 'string',
                      enum: ['error', 'warning'],
                    },
                    message: NON_BLANK_STRING_SCHEMA,
                  },
                  required: ['code', 'severity', 'message'],
                  additionalProperties: false,
                },
              },
            },
            required: ['slug', 'issues'],
            additionalProperties: false,
          },
        },
        summary: {
          type: 'object',
          properties: {
            problemFiles: { type: 'integer', minimum: 0 },
            errorFiles: { type: 'integer', minimum: 0 },
            warningFiles: { type: 'integer', minimum: 0 },
            byCode: {
              type: 'object',
              propertyNames: { enum: VAULT_ISSUE_CODE_VALUES },
              additionalProperties: {
                type: 'object',
                properties: {
                  severity: {
                    type: 'string',
                    enum: ['error', 'warning'],
                  },
                  count: { type: 'integer', minimum: 0 },
                  files: {
                    type: 'array',
                    items: NON_BLANK_STRING_SCHEMA,
                  },
                },
                required: ['severity', 'count', 'files'],
                additionalProperties: false,
              },
            },
          },
          required: ['problemFiles', 'errorFiles', 'warningFiles', 'byCode'],
          additionalProperties: false,
        },
        pathDrift: {
          type: 'object',
          description:
            'Vault→code path drift: frontmatter source paths missing on disk, resolved against repoRoot.',
          properties: {
            repoRoot: NON_BLANK_STRING_SCHEMA,
            checked: {
              type: 'boolean',
              description:
                'False when the repository this vault describes could not be determined (vault outside any git repo and no repoRoot given). Then `drifts` is empty because nothing was measured — NOT because nothing drifted.',
            },
            nodesScanned: { type: 'integer', minimum: 0 },
            pathsChecked: { type: 'integer', minimum: 0 },
            drifts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  slug: { type: 'string' },
                  kind: { type: 'string' },
                  key: { type: 'string', enum: ['path', 'elements[]'] },
                  missingPath: { type: 'string' },
                  suggestedPath: {
                    type: 'string',
                    description:
                      'Reconcile hint (Track A #3): a unique existing repo file sharing the missing file\'s basename — likely where the source moved. Present only on a unique match.',
                  },
                },
                required: ['slug', 'kind', 'key', 'missingPath'],
                additionalProperties: false,
              },
            },
            hint: { type: 'string' },
          },
          required: ['repoRoot', 'checked', 'nodesScanned', 'pathsChecked', 'drifts', 'hint'],
          additionalProperties: false,
        },
      },
      required: ['scanned', 'problems', 'summary', 'pathDrift'],
      additionalProperties: false,
    },
  },
  {
    name: 'validate_wiki',
    description:
      'Judge the pages under `wiki/` against the wiki page contract (`docs/ONTOLOGY-ATLAS-SPEC.md` §11): ' +
      'no `kind:`, the seven required frontmatter fields, the five sections in order, a citation on every ' +
      'bullet under `## Facts`, and a cited path that is both declared in `sources:` and present in the folder. ' +
      'A wiki page is **not** an ontology node — it carries no `kind:` by contract, which is what keeps it out ' +
      'of the graph — so `validate_vault` says nothing about whether one fits its own shape. This is that answer. ' +
      'Problem codes: kind-present, missing-field:<key>, section-order, uncited-fact, bad-citation, ' +
      'bad-truncation-record, citation-target-missing, describes-needs-approval. ' +
      'The optional `sources_truncated:` key lists which paths in `sources:` the run read only part of; ' +
      'it is what lets a reader tell a document written up whole from one written up in part. ' +
      'Returns `{ pageCount, failingCount, pages: [{path, problems: [{code, message, line?}]}] }` — the same shape ' +
      '`ontology-atlas wiki-validate --json` prints, so a person and an agent read one report. ' +
      'side effect 0. Use it after writing or editing a page, and before claiming a compile finished.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          maxItems: 50,
          items: { type: 'string', minLength: 1 },
          description:
            'Vault-relative page paths to judge (`wiki/quarter-plan.md`). Omit to judge every page under `wiki/`, ' +
            'which has no cap because the folder decides how many there are. Max 50 when naming them, the same ' +
            'ceiling `get_concepts.uids` uses: past that, asking for the whole folder is one call instead of a ' +
            'list somebody has to assemble. A path outside `wiki/` is reported as a problem rather than silently skipped.',
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        pageCount: { type: 'integer', minimum: 0, description: 'Pages judged.' },
        failingCount: {
          type: 'integer',
          minimum: 0,
          description: 'Pages with at least one problem. Zero means every page judged fits.',
        },
        pages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              ok: { type: 'boolean' },
              problems: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    code: { type: 'string' },
                    message: { type: 'string' },
                    line: { type: 'integer', minimum: 1 },
                  },
                  required: ['code', 'message'],
                  additionalProperties: false,
                },
              },
            },
            required: ['path', 'ok', 'problems'],
            additionalProperties: false,
          },
        },
      },
      required: ['pageCount', 'failingCount', 'pages'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_source',
    description:
      'Read the text of one raw source under `sources/`, cut into the units a wiki citation names ' +
      '(`docs/ONTOLOGY-ATLAS-SPEC.md` §11): a DOCX by heading (`h:<slug>`; paragraphs before the first ' +
      'heading are `p1`), an XLSX by sheet and row (`s<n>r<m>`), a CSV by row (`r<n>`), a text or HTML file by ' +
      'line (`l<n>`). Each unit carries the exact anchor to write into `[[src:sources/<file>#<anchor>]]`, so a ' +
      'page cites what it quotes. A PDF returns no text: the agent runtime reads PDFs natively, page by page, ' +
      'and cites `#p<n>`. Nothing is converted and kept — the file is read on request and the text returned ' +
      'once. Paging: `from` (1-based unit index) and `limit` (default ' +
      `${READ_SOURCE_DEFAULT_LIMIT}, max ${READ_SOURCE_MAX_LIMIT}` +
      '); when `truncated` is true, `next` is the `from` to continue with. `sheet` narrows a workbook to one ' +
      'sheet number. Returns `{ path, format, unitCount, from, units: [{anchor, text, kind, heading?, sheet?}], ' +
      'truncated, next?, sha256, note? }`. side effect 0. Use it in place of a shell command when a Compile, ' +
      'Check or ask turn needs what a DOCX or XLSX says.',
    inputSchema: {
      type: 'object',
      properties: {
        path: nonBlankStringSchema('Vault-relative path under `sources/` (`sources/plan.docx`).'),
        from: { type: 'integer', minimum: 1, description: '1-based index of the first unit to return. Default 1.' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: READ_SOURCE_MAX_LIMIT,
          description: `Units to return at most. Default ${READ_SOURCE_DEFAULT_LIMIT}.`,
        },
        sheet: { type: 'integer', minimum: 1, description: 'XLSX only: return one sheet, by its number in workbook order.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        format: { type: 'string', enum: ['docx', 'xlsx', 'csv', 'text', 'html', 'pdf', 'binary'] },
        unitCount: { type: 'integer', minimum: 0 },
        from: { type: 'integer', minimum: 1 },
        units: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              anchor: { type: 'string' },
              text: { type: 'string' },
              kind: { type: 'string' },
              heading: { type: ['string', 'null'] },
              sheet: { type: 'string' },
            },
            required: ['anchor', 'text', 'kind'],
          },
        },
        truncated: { type: 'boolean' },
        next: { type: 'integer', minimum: 1 },
        sha256: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['path', 'format', 'unitCount', 'from', 'units', 'truncated', 'sha256'],
    },
  },
  {
    name: 'inspect_architecture',
    description:
      'Read one reviewed architecture-profile/v1 document from the active vault, scan the connected repository with the existing bounded static import analyzer, and return an architectureBrief:v1 for humans and coding agents. The profile declares scoped roles, intended dependency rules, and which known import usages those rules govern; source imports remain observed evidence with usage-qualified receipts. The result distinguishes conforms, violated, and unknown, and never treats unsupported languages, unclassified import usage, empty role mappings, or unmapped edges as compliance. Pattern labels are human/document declarations, not folder-name inference. side effect 0.',
    inputSchema: {
      type: 'object',
      properties: {
        rootPath: {
          ...NON_BLANK_STRING_SCHEMA,
          description:
            'Repository root to inspect. Defaults to the active resolved repository root from connection_info.',
        },
        profileSlug: {
          ...NON_BLANK_STRING_SCHEMA,
          description:
            'Architecture profile_slug. Optional only when the vault contains exactly one architecture profile.',
        },
        maxFiles: {
          type: 'integer',
          minimum: 1,
          maximum: 50000,
          description: 'Positive source-file scan cap (default 5000, max 50000).',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        contract: { type: 'string', enum: ['architectureBrief:v1'] },
        sideEffect: { type: 'integer', enum: [0] },
        profile: {
          type: 'object',
          properties: {
            uid: { ...NON_BLANK_STRING_SCHEMA },
            slug: { ...NON_BLANK_STRING_SCHEMA },
            projectUid: { ...NON_BLANK_STRING_SCHEMA },
            title: { ...NON_BLANK_STRING_SCHEMA },
            patterns: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  axis: { ...NON_BLANK_STRING_SCHEMA },
                  name: { ...NON_BLANK_STRING_SCHEMA },
                },
                required: ['axis', 'name'],
                additionalProperties: false,
              },
            },
            scopePaths: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
            excludePaths: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
            roles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { ...NON_BLANK_STRING_SCHEMA },
                  paths: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
                  allowedDependencies: {
                    type: ['array', 'null'],
                    items: { ...NON_BLANK_STRING_SCHEMA },
                  },
                },
                required: ['id', 'paths', 'allowedDependencies'],
                additionalProperties: false,
              },
            },
            dependencyPolicy: { type: 'string', enum: ['explicit', 'lower-only'] },
            dependencyUsages: {
              type: 'array',
              minItems: 1,
              uniqueItems: true,
              items: { type: 'string', enum: ['value', 'type_only'] },
            },
            evidence: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
          },
          required: [
            'uid',
            'slug',
            'projectUid',
            'title',
            'patterns',
            'scopePaths',
            'excludePaths',
            'roles',
            'dependencyPolicy',
            'dependencyUsages',
            'evidence',
          ],
          additionalProperties: false,
        },
        conformance: {
          type: 'object',
          properties: {
            contract: { type: 'string', enum: ['architectureConformance:v1'] },
            status: { type: 'string', enum: ['conforms', 'violated', 'unknown'] },
            roles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { ...NON_BLANK_STRING_SCHEMA },
                  paths: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
                  matchedFileCount: { type: 'integer', minimum: 0 },
                  matchedFiles: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
                  matchedFilesLimited: { type: 'boolean' },
                },
                required: ['id', 'paths', 'matchedFileCount', 'matchedFiles', 'matchedFilesLimited'],
                additionalProperties: false,
              },
            },
            observedRoleEdges: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  fromRole: { ...NON_BLANK_STRING_SCHEMA },
                  toRole: { ...NON_BLANK_STRING_SCHEMA },
                  count: { type: 'integer', minimum: 0 },
                  importUsageCounts: {
                    type: 'object',
                    properties: {
                      value: { type: 'integer', minimum: 0 },
                      type_only: { type: 'integer', minimum: 0 },
                      unknown: { type: 'integer', minimum: 0 },
                    },
                    required: ['value', 'type_only', 'unknown'],
                    additionalProperties: false,
                  },
                  evidence: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        from: { ...NON_BLANK_STRING_SCHEMA },
                        to: { ...NON_BLANK_STRING_SCHEMA },
                        kind: { ...NON_BLANK_STRING_SCHEMA },
                        importUsage: {
                          type: 'string',
                          enum: ['value', 'type_only', 'unknown'],
                        },
                      },
                      required: ['from', 'to', 'kind', 'importUsage'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['fromRole', 'toRole', 'count', 'importUsageCounts', 'evidence'],
                additionalProperties: false,
              },
            },
            excludedByUsage: { type: 'integer', minimum: 0 },
            violationCount: { type: 'integer', minimum: 0 },
            violations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  fromRole: { ...NON_BLANK_STRING_SCHEMA },
                  toRole: { ...NON_BLANK_STRING_SCHEMA },
                  from: { ...NON_BLANK_STRING_SCHEMA },
                  to: { ...NON_BLANK_STRING_SCHEMA },
                  kind: { ...NON_BLANK_STRING_SCHEMA },
                  importUsage: { type: 'string', enum: ['value', 'type_only'] },
                  rule: { ...NON_BLANK_STRING_SCHEMA },
                },
                required: ['fromRole', 'toRole', 'from', 'to', 'kind', 'importUsage', 'rule'],
                additionalProperties: false,
              },
            },
            violationsLimited: { type: 'boolean' },
            unknown: {
              type: 'object',
              properties: {
                coverageIncomplete: { type: 'boolean' },
                unmappedEdges: { type: 'integer', minimum: 0 },
                unruledEdges: { type: 'integer', minimum: 0 },
                unknownImportUsages: { type: 'integer', minimum: 0 },
                emptyRoles: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
              },
              required: [
                'coverageIncomplete',
                'unmappedEdges',
                'unruledEdges',
                'unknownImportUsages',
                'emptyRoles',
              ],
              additionalProperties: false,
            },
            source: {
              type: 'object',
              properties: {
                rootPath: { type: ['string', 'null'] },
                filesScanned: { type: 'integer', minimum: 0 },
                supportedLanguages: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
              },
              required: ['rootPath', 'filesScanned', 'supportedLanguages'],
              additionalProperties: false,
            },
          },
          required: [
            'contract',
            'status',
            'roles',
            'observedRoleEdges',
            'excludedByUsage',
            'violationCount',
            'violations',
            'violationsLimited',
            'unknown',
            'source',
          ],
          additionalProperties: false,
        },
        agentPlanContract: {
          type: 'object',
          properties: {
            contract: { type: 'string', enum: ['architectureChangePlan:v1'] },
            requiredFields: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'touchedRoles',
                  'plannedPaths',
                  'expectedNewDependencies',
                  'crossedBoundaries',
                  'preservedInterfaces',
                  'verificationCommands',
                  'unknowns',
                ],
              },
            },
          },
          required: ['contract', 'requiredFields'],
          additionalProperties: false,
        },
        nextActions: {
          type: 'array',
          items: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  id: { type: 'string', enum: ['inspect_violations'] },
                  count: { type: 'integer', minimum: 0 },
                },
                required: ['id', 'count'],
                additionalProperties: false,
              },
              {
                type: 'object',
                properties: {
                  id: { type: 'string', enum: ['close_measurement_gaps'] },
                  unknown: {
                    type: 'object',
                    properties: {
                      coverageIncomplete: { type: 'boolean' },
                      unmappedEdges: { type: 'integer', minimum: 0 },
                      unruledEdges: { type: 'integer', minimum: 0 },
                      unknownImportUsages: { type: 'integer', minimum: 0 },
                      emptyRoles: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA } },
                    },
                    required: [
                      'coverageIncomplete',
                      'unmappedEdges',
                      'unruledEdges',
                      'unknownImportUsages',
                      'emptyRoles',
                    ],
                    additionalProperties: false,
                  },
                },
                required: ['id', 'unknown'],
                additionalProperties: false,
              },
              {
                type: 'object',
                properties: {
                  id: { type: 'string', enum: ['plan_within_architecture'] },
                  profileSlug: { ...NON_BLANK_STRING_SCHEMA },
                },
                required: ['id', 'profileSlug'],
                additionalProperties: false,
              },
            ],
          },
        },
      },
      required: ['contract', 'sideEffect', 'profile', 'conformance', 'agentPlanContract', 'nextActions'],
      additionalProperties: false,
    },
  },
  {
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
                  // Each suggested call has a different strict input shape;
                  // preserve the repair packet without inventing one shared
                  // argument contract.
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
  },
  {
    name: 'index_project',
    description:
      'Project ontology indexing plan — run analyze_repo_structure + infer_imports + validate_vault in one read-only call. ' +
      'Use for large or already-existing projects where the agent needs a resumable ontology indexing checkpoint before writing. ' +
      'Its extractionContract treats source facts as observed evidence, README/folder meanings as proposals, and only persisted ontology meanings as shared; it also returns competency questions, uncertainty, approval gates, and whether active-vault validation actually applies to the analyzed project. ' +
      'The plan distinguishes raw candidates into existing, ambiguous-alias review, and genuinely new buckets, then returns exact reviewCalls for retrieving full rows. ' +
      'side effect 0: this tool never writes markdown. CLI `index --apply` may write analyzer-proposed concepts and containment, but inferred imports remain review-only and are never auto-promoted to depends_on.',
    inputSchema: {
      type: 'object',
      properties: {
        rootPath: {
          ...NON_BLANK_STRING_SCHEMA,
          description: 'Repository root to index. Defaults to the active resolved repository root from connection_info.',
        },
        maxDepth: {
          type: 'integer',
          minimum: 0,
          maximum: 10,
          description: 'Folder walk depth forwarded to analyze_repo_structure (default 2, max 10).',
        },
        maxFiles: {
          type: 'integer',
          minimum: 1,
          maximum: 50000,
          description: 'File cap forwarded to infer_imports (default 5000, max 50000).',
        },
        threshold: {
          type: 'integer',
          minimum: 1,
          description: 'Optional module-edge count threshold for the returned import relation plan.',
        },
        skipImports: {
          type: 'boolean',
          description: 'When true, skip infer_imports and return an analyze + validate plan only.',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['plan'] },
        sideEffect: { type: 'integer', enum: [0] },
        rootPath: NON_BLANK_STRING_SCHEMA,
        vaultRoot: NON_BLANK_STRING_SCHEMA,
        analyze: {
          type: 'object',
          properties: {
            framework: { type: 'string', enum: ['fsd', 'next', 'generic'] },
            project: { type: ['object', 'null'] },
            domains: { type: 'integer', minimum: 0 },
            capabilities: { type: 'integer', minimum: 0 },
            elements: { type: 'integer', minimum: 0 },
            suggestedRelations: { type: 'integer', minimum: 0 },
          },
          required: ['framework', 'project', 'domains', 'capabilities', 'elements', 'suggestedRelations'],
          additionalProperties: false,
        },
        imports: {
          type: ['object', 'null'],
          properties: {
            filesScanned: { type: 'integer', minimum: 0 },
            moduleEdges: { type: 'integer', minimum: 0 },
            packageImports: { type: 'integer', minimum: 0 },
            packageModuleEdges: { type: 'integer', minimum: 0 },
            coverage: IMPORT_SCAN_COVERAGE_OUTPUT_SCHEMA,
            thresholdApplied: {
              type: 'object',
              properties: {
                threshold: { type: 'integer', minimum: 1 },
                filteredOut: { type: 'integer', minimum: 0 },
              },
              required: ['threshold', 'filteredOut'],
              additionalProperties: false,
            },
            reconciliationSummary: IMPORT_RECONCILIATION_SUMMARY_SCHEMA,
            staleEdgeFollowUp: IMPORT_STALE_EDGE_FOLLOW_UP_SCHEMA,
          },
          required: ['filesScanned', 'moduleEdges', 'packageImports', 'packageModuleEdges', 'coverage'],
          additionalProperties: false,
        },
        plan: {
          type: 'object',
          properties: {
            concepts: { type: 'integer', minimum: 0 },
            conceptDelta: {
              type: 'object',
              properties: {
                candidates: { type: 'integer', minimum: 0 },
                existing: { type: 'integer', minimum: 0 },
                ambiguous: { type: 'integer', minimum: 0 },
                new: { type: 'integer', minimum: 0 },
                limited: { type: 'boolean' },
                sampleAmbiguousSlugs: {
                  type: 'array',
                  maxItems: 10,
                  items: NON_BLANK_STRING_SCHEMA,
                },
                sampleNewSlugs: {
                  type: 'array',
                  maxItems: 10,
                  items: NON_BLANK_STRING_SCHEMA,
                },
              },
              required: [
                'candidates',
                'existing',
                'ambiguous',
                'new',
                'limited',
                'sampleAmbiguousSlugs',
                'sampleNewSlugs',
              ],
              additionalProperties: false,
            },
            suggestedRelations: { type: 'integer', minimum: 0 },
            importRelations: { type: 'integer', minimum: 0 },
            phases: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
          },
          required: ['concepts', 'conceptDelta', 'suggestedRelations', 'importRelations', 'phases'],
          additionalProperties: false,
        },
        validation: {
          type: 'object',
          properties: {
            scanned: { type: 'integer', minimum: 0 },
            problemFiles: { type: 'integer', minimum: 0 },
            errorFiles: { type: 'integer', minimum: 0 },
            warningFiles: { type: 'integer', minimum: 0 },
            pathDrift: { type: 'integer', minimum: 0 },
            appliesToAnalyzedProject: { type: 'boolean' },
            alignment: {
              type: 'string',
              enum: ['matching-project', 'uninitialized-vault', 'mismatched-project', 'unknown'],
            },
            note: NON_BLANK_STRING_SCHEMA,
          },
          required: [
            'scanned',
            'problemFiles',
            'errorFiles',
            'warningFiles',
            'pathDrift',
            'appliesToAnalyzedProject',
            'alignment',
            'note',
          ],
          additionalProperties: false,
        },
        meaningGate: {
          type: 'object',
          properties: {
            policy: NON_BLANK_STRING_SCHEMA,
            sourceStructureRole: NON_BLANK_STRING_SCHEMA,
            businessOntology: {
              type: 'object',
              properties: {
                domains: { type: 'integer', minimum: 0 },
                capabilities: { type: 'integer', minimum: 0 },
                evidence: { type: 'integer', minimum: 0 },
                evidenceRows: {
                  type: 'array',
                  maxItems: MEANING_GATE_EVIDENCE_ROW_LIMIT,
                  items: BUSINESS_EVIDENCE_ROW_SCHEMA,
                },
              },
              required: ['domains', 'capabilities', 'evidence', 'evidenceRows'],
              additionalProperties: false,
            },
            proposedBusinessOntology: {
              type: 'object',
              properties: {
                domains: { type: 'integer', minimum: 0 },
                capabilities: { type: 'integer', minimum: 0 },
                domainRows: {
                  type: 'array',
                  maxItems: MEANING_GATE_REVIEW_ROW_LIMIT,
                  items: PROPOSED_BUSINESS_CONCEPT_ROW_SCHEMA,
                },
                capabilityRows: {
                  type: 'array',
                  maxItems: MEANING_GATE_REVIEW_ROW_LIMIT,
                  items: PROPOSED_BUSINESS_CONCEPT_ROW_SCHEMA,
                },
              },
              required: ['domains', 'capabilities', 'domainRows', 'capabilityRows'],
              additionalProperties: false,
            },
            implementationEvidence: {
              type: 'object',
              properties: {
                elements: { type: 'integer', minimum: 0 },
                reviewRequiredCapabilities: { type: 'integer', minimum: 0 },
                reviewRequiredRows: {
                  type: 'array',
                  maxItems: MEANING_GATE_REVIEW_ROW_LIMIT,
                  items: REVIEW_REQUIRED_CAPABILITY_ROW_SCHEMA,
                },
              },
              required: ['elements', 'reviewRequiredCapabilities', 'reviewRequiredRows'],
              additionalProperties: false,
            },
            reviewQuestions: {
              type: 'array',
              items: NON_BLANK_STRING_SCHEMA,
            },
          },
          required: [
            'policy',
            'sourceStructureRole',
            'businessOntology',
            'proposedBusinessOntology',
            'implementationEvidence',
            'reviewQuestions',
          ],
          additionalProperties: false,
        },
        extractionContract: EXTRACTION_CONTRACT_OUTPUT_SCHEMA,
        semanticEvidence: {
          type: 'array',
          items: SEMANTIC_EVIDENCE_ROW_SCHEMA,
        },
        configurationEvidence: RUST_FEATURE_CONFIGURATION_EVIDENCE_OUTPUT_SCHEMA,
        next: {
          type: 'object',
          properties: {
            applyTool: NON_BLANK_STRING_SCHEMA,
            cliApply: NON_BLANK_STRING_SCHEMA,
            review: NON_BLANK_STRING_SCHEMA,
            reviewCalls: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tool: {
                    type: 'string',
                    enum: ['analyze_repo_structure', 'infer_imports'],
                  },
                  arguments: {
                    type: 'object',
                    properties: {
                      rootPath: NON_BLANK_STRING_SCHEMA,
                      maxDepth: { type: 'integer', minimum: 0, maximum: 10 },
                      maxFiles: { type: 'integer', minimum: 1, maximum: 50000 },
                    },
                    required: ['rootPath'],
                    additionalProperties: false,
                  },
                },
                required: ['tool', 'arguments'],
                additionalProperties: false,
              },
            },
          },
          required: ['applyTool', 'cliApply', 'review', 'reviewCalls'],
          additionalProperties: false,
        },
      },
      required: ['mode', 'sideEffect', 'rootPath', 'vaultRoot', 'analyze', 'imports', 'plan', 'validation', 'meaningGate', 'extractionContract', 'semanticEvidence', 'configurationEvidence', 'next'],
      additionalProperties: false,
    },
  },
  {
    name: 'analyze_repo_structure',
    description:
      'R16 (autonomous ingest base) — analyze a code repository and propose ontology node candidates. ' +
      'side effect 0 (vault frontmatter NOT modified). Returns deterministic candidates the agent ' +
      'must turn into an evidence-backed proposal and move through the construction lifecycle before ' +
      'any exact batch-writer rows are released. Repository structure is implementation evidence, not automatic business meaning: extractionContract and proposedBusinessOntology make that uncertainty explicit. Detects:\n' +
      '  - package.json `name` → project candidate\n' +
      '  - README.md first H1 → project title fallback\n' +
      '  - README.md H2 sections (skipping generic "Usage"/"Installation"/etc) → domain candidates\n' +
      '  - src/features|entities|widgets|views/* (FSD) → capability/element candidates\n' +
      '  - src/* depth-1 folders (generic) → capability candidates + index entry → element\n' +
      '  - apps/* and packages/* members with package.json → implementation element candidates\n\n' +
      '  - README.rst + bounded static setup.py → Python project/package evidence without execution\n' +
      '  - mixed current and future/negated/deprecated README prose → exact current candidate excerpt plus bounded line-scoped `reviewRequiredEvidence`; review units stay visible but cannot support a proposal claim\n' +
      '  - selected safe README sections share the existing 1,200-character budget deterministically; no document, heading, or excerpt cap grows\n' +
      '  - root Python packages plus at most 12 import-connected implementation boundaries → direct modules plus up to 2 exact security/policy/risk file anchors; unused files are not mirrored and no capability is inferred from imports\n' +
      '  - bounded root Cargo package or repo-contained literal direct workspace members → typed feature declaration + literal cfg/cfg_attr source provenance; predicates are not evaluated and no runtime/import/semantic dependency is inferred\n' +
      '  - a complete proposal may select at most 4 additional exact TypeScript, JavaScript, Python, or Rust file endpoints already observed by infer_imports for distinct navigation roles; exact dependency direction is validated and these files never become automatic candidates\n\n' +
      '  - when the packet identifies an implementation path but omits the rule or effect needed for review, optional `sourceReads` returns bounded exact source lines with a full-file hash and continuation coordinates. Follow-up reads carry the returned `expectedSha256`; every proposal or qualification call replays all selected ranges with that hash. Raw source remains untrusted observed evidence and never establishes semantic meaning, approval, or write authority\n\n' +
      '  - an element proposal may keep an ordinary citation and append reviewed `navigation:primary|supporting|test:<path>#<symbol>` evidence strings (limits 1/1/3); the server verifies only those named current files, renders human-readable Evidence bullets, and rejects missing, ambiguous, unsafe, or task-inferred coordinates without treating them as behavior proof\n\n' +
      'Optionally pass a complete `proposal` to validate project/domain/capability/element definitions, ' +
      'typed relations, citations, risk controls, domain placement, implementation paths, confidence, ' +
      'and typed competency answers with resolvable concept/relation/evidence/path witnesses. Partial ' +
      'or visible-gap answers remain warnings instead of disappearing behind findings 0. A ' +
      '`unqualified-project-exclusion` warning is an exact human-acceptance gap, while an ' +
      'evidence-limit exclusion remains an error. Source-hidden review may leave exact source-body ' +
      'detail partial; source-aware citation verification decides support before evidence provenance can pass. ' +
      'A mandatory non-gap warning blocks the first review before qualification begins. ' +
      'For a bounded first pass, freeze claim id, statement, and proposalRefs before isolated source-hidden ' +
      'and source-aware lanes run in parallel; separately audit material Definition, Includes, Excludes, and ' +
      'Uncertainty assertions even when several claims share one proposal ref. Join sealed receipts without ' +
      'mutation before human acceptance. A passing ' +
      'validation first returns a deterministic non-writing `reviewPlan`, `planDigest`, ' +
      '`sourceDigest`, and eight-phase construction lifecycle. An independent evaluator must ' +
      'measure the approved competency questions and source-hidden task, then a human may declare ' +
      'acceptance bound to that exact plan digest/revision and every visible gap. Pass the resulting ' +
      '`constructionQualification:v1` packet as `qualification`; only a current, admissible packet ' +
      'releases the exact reviewed rows as `writePlan`. The lifecycle also reports a shadow-only ' +
      '`admission` tier; `self_qualified` is an observation, not a write permission. Declared approval provenance is not identity ' +
      'authentication. Do not call write tools unless proposalValidation.canWrite is true and a ' +
      '`writePlan` is present; write every concept row successfully before writing relations.\n\n' +
      'Use the initial discovery call when a user asks "이 codebase 분석해줘" / "bootstrap the ontology"; repeat the same analysis call only for explicit source continuations and digest-bound proposal or qualification replay. ' +
      'Single source of truth preserved — only the user (via your subsequent add_concept calls) ' +
      'writes to the vault.',
    inputSchema: {
      type: 'object',
      properties: {
        rootPath: {
          ...NON_BLANK_STRING_SCHEMA,
          description:
            'Repository root to analyze. Defaults to the MCP server cwd.',
        },
        maxDepth: {
          type: 'integer',
          minimum: 0,
          maximum: 10,
          description: 'Non-negative integer folder walk depth (default 2, max 10). Higher → more elements.',
        },
        ignore: {
          type: 'array',
          maxItems: IGNORE_ARRAY_MAX_ITEMS,
          items: NON_BLANK_STRING_SCHEMA,
          description:
            "Extra folder names to skip (added to defaults: node_modules, .git, dist, build, …).",
        },
        sourceReads: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          description: 'Optional 1–8 exact repository source ranges. The 8 KiB range, 32 KiB aggregate text, and 64 KiB serialized limits apply only to the returned sourceEvidence subpacket, not to the rest of this analysis result. Returned text is bounded untrusted data, not accepted meaning. Repeat every selector with expectedSha256 when proposal or qualification is present.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', minLength: 1, maxLength: 1024, description: 'Literal repository-relative source path, at most 1,024 Unicode characters; no glob or directory traversal.' },
              startLine: { type: 'integer', minimum: 1, description: 'One-based first source line to return.' },
              maxLines: { type: 'integer', minimum: 1, maximum: 200, description: 'Maximum complete source lines requested, from 1 through 200.' },
              expectedSha256: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Optional 64-character lowercase SHA-256 of the complete file. Required on every selector when proposal or qualification is present.' },
            },
            required: ['path', 'startLine', 'maxLines'],
            additionalProperties: false,
          },
        },
        proposal: {
          ...MEANING_PROPOSAL_INPUT_SCHEMA,
          description:
            'Optional business ontology proposal to validate against repository evidence before any write call. Python proposals may select at most 4 exact observed import endpoints beyond the analyzer candidates.',
        },
        qualification: {
          ...CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA,
          description:
            'Optional independent evaluation and declared human acceptance bound to the exact planDigest, planRevision, and sourceDigest returned for this proposal. Omit it on the first review call.',
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        rootPath: NON_BLANK_STRING_SCHEMA,
        framework: {
          type: 'string',
          enum: ['fsd', 'next', 'generic'],
        },
        project: {
          type: 'object',
          properties: {
            slug: NON_BLANK_STRING_SCHEMA,
            title: NON_BLANK_STRING_SCHEMA,
            definition: { type: 'string', minLength: 1, maxLength: 1200 },
            evidence: { type: 'array', maxItems: 6, items: NON_BLANK_STRING_SCHEMA },
            includes: { type: 'array', maxItems: 12, items: NON_BLANK_STRING_SCHEMA },
            excludes: { type: 'array', maxItems: 12, items: NON_BLANK_STRING_SCHEMA },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            uncertainty: NON_BLANK_STRING_SCHEMA,
          },
          required: ['slug', 'title'],
          additionalProperties: false,
        },
        domains: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slug: NON_BLANK_STRING_SCHEMA,
              title: NON_BLANK_STRING_SCHEMA,
              evidence: {
                type: 'object',
                properties: {
                  source: NON_BLANK_STRING_SCHEMA,
                  line: { type: 'integer', minimum: 1 },
                },
                required: ['source'],
                additionalProperties: false,
              },
            },
            required: ['slug', 'title', 'evidence'],
            additionalProperties: false,
          },
        },
        capabilities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slug: NON_BLANK_STRING_SCHEMA,
              title: NON_BLANK_STRING_SCHEMA,
              domain: { type: 'string' },
              evidence: {
                type: 'object',
                properties: {
                  source: NON_BLANK_STRING_SCHEMA,
                },
                required: ['source'],
                additionalProperties: false,
              },
            },
            required: ['slug', 'title', 'evidence'],
            additionalProperties: false,
          },
        },
        elements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slug: NON_BLANK_STRING_SCHEMA,
              title: NON_BLANK_STRING_SCHEMA,
              domain: { type: 'string' },
              path: NON_BLANK_STRING_SCHEMA,
              evidence: {
                type: 'object',
                properties: {
                  source: NON_BLANK_STRING_SCHEMA,
                },
                required: ['source'],
                additionalProperties: false,
              },
            },
            required: ['slug', 'title', 'path', 'evidence'],
            additionalProperties: false,
          },
        },
        suggestedRelations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from: NON_BLANK_STRING_SCHEMA,
              to: NON_BLANK_STRING_SCHEMA,
              type: NON_BLANK_STRING_SCHEMA,
              why: { type: 'string', minLength: 1, maxLength: 600 },
              evidence: { type: 'array', maxItems: 4, items: NON_BLANK_STRING_SCHEMA },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              uncertainty: NON_BLANK_STRING_SCHEMA,
            },
            required: ['from', 'to', 'type'],
            additionalProperties: false,
          },
        },
        meaningGate: {
          type: 'object',
          properties: {
            policy: NON_BLANK_STRING_SCHEMA,
            sourceStructureRole: NON_BLANK_STRING_SCHEMA,
            businessOntology: {
              type: 'object',
              properties: {
                domains: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
                capabilities: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
                evidence: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      slug: NON_BLANK_STRING_SCHEMA,
                      kind: {
                        type: 'string',
                        enum: ['domain', 'capability'],
                      },
                      source: NON_BLANK_STRING_SCHEMA,
                    },
                    required: ['slug', 'kind', 'source'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['domains', 'capabilities', 'evidence'],
              additionalProperties: false,
            },
            proposedBusinessOntology: {
              type: 'object',
              properties: {
                domains: {
                  type: 'array',
                  items: PROPOSED_BUSINESS_CONCEPT_ROW_SCHEMA,
                },
                capabilities: {
                  type: 'array',
                  items: PROPOSED_BUSINESS_CONCEPT_ROW_SCHEMA,
                },
              },
              required: ['domains', 'capabilities'],
              additionalProperties: false,
            },
            implementationEvidence: {
              type: 'object',
              properties: {
                elements: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
                reviewRequiredCapabilities: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      slug: NON_BLANK_STRING_SCHEMA,
                      reason: NON_BLANK_STRING_SCHEMA,
                      evidence: {
                        type: 'object',
                        properties: {
                          source: NON_BLANK_STRING_SCHEMA,
                        },
                        required: ['source'],
                        additionalProperties: false,
                      },
                    },
                    required: ['slug', 'reason', 'evidence'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['elements', 'reviewRequiredCapabilities'],
              additionalProperties: false,
            },
            reviewQuestions: {
              type: 'array',
              items: NON_BLANK_STRING_SCHEMA,
            },
          },
          required: [
            'policy',
            'sourceStructureRole',
            'businessOntology',
            'proposedBusinessOntology',
            'implementationEvidence',
            'reviewQuestions',
          ],
          additionalProperties: false,
        },
        extractionContract: EXTRACTION_CONTRACT_OUTPUT_SCHEMA,
        semanticEvidence: {
          type: 'array',
          items: SEMANTIC_EVIDENCE_ROW_SCHEMA,
        },
        configurationEvidence: RUST_FEATURE_CONFIGURATION_EVIDENCE_OUTPUT_SCHEMA,
        sourceEvidence: {
          type: 'object',
          description: 'Bounded sourceEvidence:v1 subpacket. Its byte and row ceilings cover this subpacket only; they do not describe or truncate the complete analyze_repo_structure response.',
          properties: {
            contract: { type: 'string', enum: ['sourceEvidence:v1'] },
            trust: { type: 'string', enum: ['untrusted-source-data'] },
            limits: { type: 'object', additionalProperties: { type: 'integer', minimum: 1 } },
            coverage: { type: 'string', enum: ['requested-ranges-only'] },
            repositoryComplete: { type: 'boolean', enum: [false] },
            rows: {
              type: 'array', minItems: 1, maxItems: 8,
              items: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['read', 'refused', 'omitted'] }, path: NON_BLANK_STRING_SCHEMA,
                  fullFileSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, fileBytes: { type: 'integer', minimum: 0 }, fileLines: { type: 'integer', minimum: 0 },
                  requestedRange: { type: 'object', properties: { startLine: { type: 'integer', minimum: 1 }, maxLines: { type: 'integer', minimum: 1, maximum: 200 } }, required: ['startLine', 'maxLines'], additionalProperties: false },
                  actualRange: { type: 'object', properties: { startLine: { type: 'integer', minimum: 1 }, endLine: { type: 'integer', minimum: 1 } }, required: ['startLine', 'endLine'], additionalProperties: false },
                  text: { type: 'string' }, returnedBytes: { type: 'integer', minimum: 0 }, truncated: { type: 'boolean' }, requestComplete: { type: 'boolean' }, fileComplete: { type: 'boolean' }, citation: NON_BLANK_STRING_SCHEMA, reason: NON_BLANK_STRING_SCHEMA,
                  next: { anyOf: [{ type: 'null' }, { type: 'object', properties: { path: NON_BLANK_STRING_SCHEMA, startLine: { type: 'integer', minimum: 1 }, maxLines: { type: 'integer', minimum: 1, maximum: 200 }, expectedSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' } }, required: ['path', 'startLine', 'maxLines', 'expectedSha256'], additionalProperties: false }] },
                },
                required: ['status', 'path', 'requestedRange', 'requestComplete', 'next'], additionalProperties: false,
                oneOf: [
                  {
                    properties: { status: { const: 'read' } },
                    required: ['actualRange', 'text', 'citation', 'fullFileSha256', 'fileBytes', 'fileLines', 'returnedBytes', 'truncated', 'fileComplete'],
                  },
                  {
                    properties: { status: { enum: ['refused', 'omitted'] } },
                    required: ['reason'],
                    not: { anyOf: [{ required: ['text'] }, { required: ['citation'] }] },
                  },
                ],
              },
            },
            totalReturnedBytes: { type: 'integer', minimum: 0, maximum: 32768 }, serializedBytes: { type: 'integer', minimum: 0, maximum: 65536 },
          },
          required: ['contract', 'trust', 'limits', 'coverage', 'repositoryComplete', 'rows', 'totalReturnedBytes', 'serializedBytes'], additionalProperties: false,
        },
        proposalValidation: MEANING_PROPOSAL_VALIDATION_OUTPUT_SCHEMA,
        skipped: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: NON_BLANK_STRING_SCHEMA,
              reason: NON_BLANK_STRING_SCHEMA,
            },
            required: ['path', 'reason'],
            additionalProperties: false,
          },
        },
      },
      required: [
        'rootPath',
        'framework',
        'domains',
        'capabilities',
        'elements',
        'meaningGate',
        'extractionContract',
        'semanticEvidence',
        'configurationEvidence',
        'proposalValidation',
        'suggestedRelations',
        'skipped',
      ],
      additionalProperties: false,
    },
  },
  {
    name: 'rename_concept',
    description:
      '⚠ MULTI-FILE WRITE — change a slug and update every backlink in one atomic graph-level operation. ' +
      'The node UID is preserved; only its current human-readable slug changes. ' +
      'Renames the .md file (oldSlug → newSlug, directory move OK), updates the moved file\'s ' +
      'frontmatter `slug:` key, and rewrites every backlink — frontmatter array entries (capabilities / ' +
      'elements / dependencies / relates / contains / describes), inline-string keys, and body links ' +
      '`[[oldSlug]]` / `(oldSlug.md)`. Tail-only references (`mcp-server` for `capabilities/mcp-server`) ' +
      'are also redirected to the new tail. Two-stage safety:\n' +
      '  1. Without confirm: true the call is a dry-run — returns `updates` (each affected file with ' +
      'before/after array keys + bodyChanged flag) without writing.\n' +
      '  2. With confirm: true the file is moved and all backlinks are rewritten in one pass.\n' +
      'Throws if oldSlug missing or newSlug already taken (unless overwrite: true). Use this instead ' +
      'of patch_concept + N find_backlinks + N patch_concept loops. Confirmed writes return ' +
      POST_WRITE_MAINTENANCE_GUIDANCE + ' for the final graph.',
    inputSchema: {
      type: 'object',
      properties: {
        oldSlug: nonBlankStringSchema('Current vault-relative slug (omit the .md extension).'),
        newSlug: nonBlankStringSchema(
          'Target vault-relative slug (omit the .md extension). Directories are created if needed.',
        ),
        confirm: {
          type: 'boolean',
          description:
            'Actually perform the rename when true. Omit or false for a dry-run preview.',
        },
        overwrite: {
          type: 'boolean',
          description:
            'Allow overwriting an existing file at newSlug. Defaults to false (throws if newSlug exists).',
        },
        expected_mtime: {
          type: 'number',
          minimum: 0,
          description:
            'Optional conflict guard for oldSlug. Pass the `mtime` from get_concept; throws VaultConflictError if the source has been modified externally since you read it.',
        },
      },
      required: ['oldSlug', 'newSlug'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        dryRun: { type: 'boolean' },
        ...DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
        uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
        oldSlug: { type: 'string' },
        newSlug: { type: 'string' },
        sourcePath: { type: 'string' },
        targetPath: { type: 'string' },
        moved: { type: 'boolean' },
        backlinkUpdates: BACKLINK_REWRITE_PLAN_OUTPUT_SCHEMA,
        message: { type: 'string' },
        changed: { type: 'boolean' },
        postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
      },
      required: ['ok', 'dryRun', ...DESTRUCTIVE_PREVIEW_REQUIRED, 'uid', 'oldSlug', 'newSlug', 'sourcePath', 'targetPath', 'moved', 'backlinkUpdates'],
      additionalProperties: false,
    },
  },
  {
    name: 'reclassify_concept',
    description:
      '⚠ MULTI-FILE WRITE — change a concept kind and optionally its canonical slug/domain in one previewable transaction. The permanent UID is preserved. Redirects backlinks like rename_concept and replaces a generated starter body with the new kind template while preserving custom prose. Defaults to dry-run.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: nonBlankStringSchema('Current canonical slug.'),
        newKind: { type: 'string', enum: ['project', 'domain', 'capability', 'element', 'document'] },
        newSlug: nonBlankStringSchema('Optional new canonical slug.'),
        domain: { type: ['string', 'null'], description: 'New domain; required for capability/element.' },
        body: { type: 'string', description: 'Optional explicit replacement body.' },
        confirm: { type: 'boolean' }, expected_mtime: { type: 'number', minimum: 0 },
      },
      required: ['slug', 'newKind'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' }, dryRun: { type: 'boolean' }, changed: { type: 'boolean' },
        ...DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
        uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
        oldSlug: NON_BLANK_STRING_SCHEMA, newSlug: NON_BLANK_STRING_SCHEMA,
        oldKind: NON_BLANK_STRING_SCHEMA, newKind: NON_BLANK_STRING_SCHEMA,
        sourcePath: NON_BLANK_STRING_SCHEMA, targetPath: NON_BLANK_STRING_SCHEMA,
        bodyAction: { type: 'string', enum: ['preserved', 'replaced_explicitly', 'regenerated_starter'] },
        backlinkUpdates: BACKLINK_REWRITE_PLAN_OUTPUT_SCHEMA,
        postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
      },
      required: ['ok', 'dryRun', 'changed', ...DESTRUCTIVE_PREVIEW_REQUIRED, 'uid', 'oldSlug', 'newSlug', 'oldKind', 'newKind', 'sourcePath', 'targetPath', 'bodyAction', 'backlinkUpdates'],
      additionalProperties: false,
    },
  },
  {
    name: 'merge_concepts',
    description:
      '⚠ DESTRUCTIVE MULTI-FILE WRITE — fold one node into another. Every backlink to fromSlug is ' +
      'redirected to intoSlug (frontmatter array entries + body links), then fromSlug is deleted. The ' +
      'survivor keeps its UID while the source UID/history is recorded in canonical `merged_uids`. The ' +
      'intoSlug prose and non-identity frontmatter are preserved as-is — they are not merged automatically (use ' +
      'patch_concept after if you want to combine descriptions). Tail-only references are also ' +
      'redirected. Two-stage safety:\n' +
      '  1. Without confirm: true the call is a dry-run — returns the redirect plan + list of deletions ' +
      'without writing.\n' +
      '  2. With confirm: true the rewrites and the delete happen in one pass.\n' +
      'Throws if either slug is missing. Confirmed writes return ' + POST_WRITE_MAINTENANCE_GUIDANCE + ' for the final graph.',
    inputSchema: {
      type: 'object',
      properties: {
        fromSlug: nonBlankStringSchema('Slug to dissolve. Its file is deleted after backlinks redirect.'),
        intoSlug: nonBlankStringSchema('Slug to keep. Receives every redirected backlink.'),
        confirm: {
          type: 'boolean',
          description:
            'Actually perform the merge when true. Omit or false for a dry-run.',
        },
        expected_mtime: {
          type: 'number',
          minimum: 0,
          description:
            'Optional conflict guard for fromSlug. Throws if the source has been modified externally.',
        },
        expected_into_mtime: {
          type: 'number',
          minimum: 0,
          description:
            'Optional conflict guard for intoSlug. Pass the survivor mtime from get_concept so a concurrent edit or identity-history change is never overwritten.',
        },
      },
      required: ['fromSlug', 'intoSlug'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        dryRun: { type: 'boolean' },
        ...DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
        fromUid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
        intoUid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
        absorbedUids: {
          type: 'array',
          items: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
        },
        fromSlug: { type: 'string' },
        intoSlug: { type: 'string' },
        fromPath: { type: 'string' },
        deleted: { type: 'boolean' },
        backlinkUpdates: BACKLINK_REWRITE_PLAN_OUTPUT_SCHEMA,
        capturedFrom: CAPTURED_DOC_OUTPUT_SCHEMA,
        message: { type: 'string' },
        changed: { type: 'boolean' },
        postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
      },
      required: ['ok', 'dryRun', ...DESTRUCTIVE_PREVIEW_REQUIRED, 'fromUid', 'intoUid', 'absorbedUids', 'fromSlug', 'intoSlug', 'fromPath', 'deleted', 'backlinkUpdates', 'capturedFrom'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_concept',
    description:
      '⚠ DESTRUCTIVE — permanently deletes the vault .md file. Two-stage safety:\n' +
      'Both preview and confirmed responses identify the node by permanent `uid` plus current `slug`. ' +
      '  1. Without confirm: true the call is a dry-run — returns a backlinks preview without deleting.\n' +
      '  2. If any backlinks exist the call throws — refuses while other nodes still reference this slug. ' +
      'Pass force: true to delete anyway (the referrers become dangling).\n' +
      'Successful deletion returns the frontmatter + body so a user who deleted by mistake ' +
      'can recreate the node via add_concept. Directories are left untouched. Pass ' +
      '`expected_mtime` to guard against concurrent external edits — throws if the file ' +
      'changed on disk since you read it. Confirmed deletes return ' + POST_WRITE_MAINTENANCE_GUIDANCE + ' for the final graph.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: nonBlankStringSchema('Vault-relative slug (omit the .md extension).'),
        confirm: {
          type: 'boolean',
          description:
            'Actually delete when true. Omit or false for a dry-run (backlinks preview, no delete).',
        },
        force: {
          type: 'boolean',
          description:
            'Delete even when backlinks exist (referrers become dangling). Defaults to false.',
        },
        expected_mtime: {
          type: 'number',
          minimum: 0,
          description:
            'Optional conflict guard — file mtimeMs at read time. If it differs at delete time, the call throws.',
        },
      },
      required: ['slug'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        dryRun: { type: 'boolean' },
        ...DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
        uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
        slug: NON_BLANK_STRING_SCHEMA,
        filePath: NON_BLANK_STRING_SCHEMA,
        backlinks: { type: 'array', items: BACKLINK_ROW_OUTPUT_SCHEMA },
        message: NON_BLANK_STRING_SCHEMA,
        forced: { type: 'boolean' },
        backlinksAtDelete: { type: 'array', items: BACKLINK_ROW_OUTPUT_SCHEMA },
        changed: { type: 'boolean' },
        captured: CAPTURED_DOC_OUTPUT_SCHEMA,
        postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
      },
      required: ['ok', 'dryRun', ...DESTRUCTIVE_PREVIEW_REQUIRED, 'uid', 'slug', 'filePath'],
      additionalProperties: false,
    },
  },
  {
    name: 'absorb_document',
    description:
      'Slice 0 (PRODUCT-PLAN-2026-07.md §4/§9) — the "absorption tool". Converts a CLAUDE.md/AGENTS.md-style ' +
      'markdown file into typed vault nodes so a tech lead\'s existing agent-instruction file stops needing ' +
      'dual maintenance. Splits the file by `##` sections and classifies each:\n' +
      '  - rule/policy/decision sections → `kind: document` nodes with a `role: policy` frontmatter extra.\n' +
      '  - architecture/component sections → element/capability SUGGESTIONS only — never auto-written; ' +
      'review and land with add_concept if useful.\n' +
      '  - sections matching an injection-suspect pattern (Tier 1 — imperative instruction-hijack phrasing, ' +
      'shell/SQL fragments) are excluded from absorption regardless of category and reported for human review. ' +
      'The file body is always treated as untrusted data; parsing never executes or evaluates its content.\n' +
      'Two-stage safety, same shape as delete_concept:\n' +
      '  1. Without confirm: true the call is a dry-run — returns the classification plan per section, no writes.\n' +
      '  2. With confirm: true, absorbed sections are written as document nodes, the source file is backed up ' +
      'to `<file>.pre-absorb.bak`, then rewritten into a "slim pointer" that reproduces every non-absorbed ' +
      'section (suggested, unclassified, or injection-suspect) verbatim — content is never destroyed. ' +
      'Throws instead of overwriting an existing backup file. The canonical source path must be inside repoRoot; ' +
      'outside paths (including symlink escapes) require an reviewed dry-run plus explicit allowOutsideRepo:true.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: nonBlankStringSchema('Path to the CLAUDE.md/AGENTS.md-style markdown file to absorb (absolute, or relative to the MCP server cwd).'),
        confirm: {
          type: 'boolean',
          description: 'Actually write when true. Omit or false for a dry-run (plan only, no writes).',
        },
        allowOutsideRepo: {
          type: 'boolean',
          description:
            'Explicit destructive opt-in required only when filePath resolves outside repoRoot. Dry-run reports outsideRepo and keeps canConfirm:false without it.',
        },
      },
      required: ['filePath'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        dryRun: { type: 'boolean' },
        ...DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
        filePath: NON_BLANK_STRING_SCHEMA,
        outsideRepo: { type: 'boolean' },
        sourceLabel: NON_BLANK_STRING_SCHEMA,
        title: { type: ['string', 'null'] },
        summary: {
          type: 'object',
          properties: {
            total: { type: 'integer', minimum: 0 },
            absorbed: { type: 'integer', minimum: 0 },
            suggested: { type: 'integer', minimum: 0 },
            injectionSuspect: { type: 'integer', minimum: 0 },
            unclassified: { type: 'integer', minimum: 0 },
          },
          required: ['total', 'absorbed', 'suggested', 'injectionSuspect', 'unclassified'],
          additionalProperties: false,
        },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: NON_BLANK_STRING_SCHEMA,
              category: { type: 'string', enum: ['policy', 'architecture', 'unclassified'] },
              kind: { type: ['string', 'null'] },
              role: { type: ['string', 'null'] },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              action: { type: 'string', enum: ['absorb', 'suggest', 'skip'] },
              targetSlug: { type: ['string', 'null'] },
              injectionSuspect: { type: 'boolean' },
              injectionMatches: { type: 'array', items: { type: 'string' } },
            },
            required: ['heading', 'category', 'confidence', 'action', 'injectionSuspect', 'injectionMatches'],
            additionalProperties: false,
          },
        },
        written: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slug: NON_BLANK_STRING_SCHEMA,
              filePath: NON_BLANK_STRING_SCHEMA,
            },
            required: ['slug', 'filePath'],
            additionalProperties: false,
          },
        },
        backupPath: { type: 'string' },
        changed: { type: 'boolean' },
        message: NON_BLANK_STRING_SCHEMA,
        postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
      },
      required: ['ok', 'dryRun', ...DESTRUCTIVE_PREVIEW_REQUIRED, 'filePath', 'outsideRepo', 'sourceLabel', 'summary', 'sections', 'message'],
      additionalProperties: false,
    },
  },
];

const READ_TOOL_NAMES = new Set([
  'connection_info',
  'git_status',
  'git_history',
  'list_concepts',
  'get_concept',
  'get_concepts',
  'find_evidence',
  'find_backlinks',
  'find_neighbors',
  'find_path',
  'list_kinds',
  'find_orphans',
  'query_concepts',
  'compile_ontology',
  'query_ontology',
  'validate_vault',
  'validate_wiki',
  'read_source',
  'inspect_architecture',
  'analyze_repo_structure',
  'infer_imports',
  'index_project',
]);

const DESTRUCTIVE_TOOL_NAMES = new Set([
  'git_snapshot',
  // Removes a measured binding + its receipt. Reversible only by re-measuring.
  'disconnect_project_source',
  'delete_concept',
  'merge_concepts',
  'rename_concept',
  'remove_relation',
  'replace_relation',
  'reclassify_concept',
  // absorb_document overwrites the external source file in place (backed up
  // first to <file>.pre-absorb.bak, but still an irreversible-by-default
  // rewrite of a file outside the vault).
  'absorb_document',
]);

const IDEMPOTENT_TOOL_NAMES = new Set([
  'add_relation',
  'add_relations',
  'remove_relation',
]);

function toolTitle(name) {
  return String(name || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// OATLAS_READ_ONLY — when set, the server advertises and accepts only the read
// tools. Trust-charter aligned surface for third-party / untrusted registration
// (Fable interop memo): a consumer that only needs to *read* the vault (Neo4j
// loaders, dashboards, review bots) can register the server with zero risk of a
// write reaching the user's disk. Every write tool disappears from tools/list
// AND is rejected if called directly (defense in depth against cached lists).
// Recommended whenever the registrant is not the vault owner.
function parseReadOnlyEnv(value) {
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}
const READ_ONLY_MODE = parseReadOnlyEnv(process.env.OATLAS_READ_ONLY);

// The app-owned write checkpoint. Rationale, and the measurement that forced it,
// live in `write-consent.mjs`. Off unless the launcher asks for it, so a vault
// whose client already owns the gate is unchanged.
const WRITE_CONSENT_MODE = parseConsentEnv(process.env.OATLAS_WRITE_CONSENT);

const TOOLS_FOR_LIST_ALL = TOOLS.map((tool) => ({
  ...tool,
  annotations: {
    ...(tool.annotations || {}),
    title: toolTitle(tool.name),
    readOnlyHint: READ_TOOL_NAMES.has(tool.name),
    destructiveHint: DESTRUCTIVE_TOOL_NAMES.has(tool.name),
    idempotentHint: IDEMPOTENT_TOOL_NAMES.has(tool.name),
    openWorldHint: false,
  },
  inputSchema: {
    ...tool.inputSchema,
    additionalProperties: false,
  },
}));
// tools/list surface — filtered down to read tools in read-only mode.
const TOOLS_FOR_LIST = READ_ONLY_MODE
  ? TOOLS_FOR_LIST_ALL.filter((tool) => READ_TOOL_NAMES.has(tool.name))
  : TOOLS_FOR_LIST_ALL;
// Full registry stays complete so unknown-tool suggestions + the read-only
// guard can reason about every tool name regardless of what tools/list shows.
const TOOL_BY_NAME = new Map(TOOLS_FOR_LIST_ALL.map((tool) => [tool.name, tool]));

export {
  READ_TOOL_NAMES,
  READ_ONLY_MODE,
  WRITE_CONSENT_MODE,
  TOOLS_FOR_LIST,
  TOOL_BY_NAME,
};
