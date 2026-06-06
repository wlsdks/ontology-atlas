#!/usr/bin/env node
/**
 * ontology-atlas-mcp — MCP 서버 (도구 24종 = read 16 + write 8).
 *
 * AI agent (Claude Code 등) 가 vault 의 ontology 를 읽고 쓸 수 있게.
 *
 * read 16:
 *   - list_concepts          — vault 의 노드 목록 (kind / domain / since / summary)
 *   - get_concept            — 단일 노드 + graph 이웃 + mtime
 *   - get_concepts           — 배치 read (slugs[] → concepts[], partial 허용)
 *   - find_evidence          — title / capabilities / elements / body 부분매칭
 *   - find_backlinks         — 특정 slug 를 가리키는 다른 노드들
 *   - find_neighbors         — 특정 slug 주변의 incoming/outgoing graph edge
 *   - find_path              — 두 slug 사이 BFS 최단 경로 + nodes[] + edges[via] (R+)
 *   - list_kinds             — vault kind 분포 census
 *   - find_orphans           — 어느 다른 노드도 frontmatter 에서 가리키지 않는 doc
 *   - query_concepts         — typed filter DSL (kind=X AND has(Y) AND NOT ...)
 *   - compile_ontology       — vault 를 deterministic graph artifact 로 compile
 *   - query_ontology         — compiled graph engine query (neighbors / path / all_paths / query_plan / centrality / communities / similar_nodes / explain_relation / reachability / pattern_walk / impact / blast_radius / subgraph / overview / schema / facets / match_nodes / match_edges / node_profile / domain_profile / domain_matrix / project_scope / project_map / relation_check / components / lineage / containment_tree / cycles / topological_order / recommend_relations / growth_plan / maintenance_plan / agent_brief / workspace_brief / health)
 *   - validate_vault         — vault 전체 health 한 호출 (per-doc + byCode aggregate)
 *   - analyze_repo_structure — R16, code repo 분석 → ontology 후보 (side effect 0)
 *   - infer_imports          — R17, TS/JS import graph → depends_on 후보 (side effect 0)
 *   - index_project          — repo 분석 + import graph + vault validation plan (side effect 0)
 *
 * write 8:
 *   - add_concept       — 새 노드 (.md 파일 작성, 기존 slug 면 throw)
 *   - add_concepts      — 배치 write (concepts[] → results[], partial 허용)
 *   - add_relation      — 두 노드 사이 edge (frontmatter 배열 키 append)
 *   - add_relations     — 배치 edge write (relations[] → results[], partial 허용)
 *   - patch_concept     — 기존 노드 frontmatter (key 단위, null = 삭제) + body
 *   - delete_concept    — 노드 영구 삭제 (dry-run + backlinks 가드 + force)
 *   - rename_concept    — slug 변경 + 모든 backlink 의 array/body 자동 redirect
 *   - merge_concepts    — 두 노드 합치기 (from 의 모든 backlink 를 into 로 redirect 후 from 삭제)
 *
 * 환경 변수:
 *   OATLAS_VAULT=/abs/path/to/vault   — vault root 디렉토리. 미지정 시 cwd.
 *
 * 사용:
 *   $ npx ontology-atlas-mcp
 *   또는 .mcp.json 에 등록 (README 참고).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { relative, resolve } from 'node:path';

import { existsSync, readFileSync } from 'node:fs';
import {
  GRAPH_ARRAY_KEYS,
  VaultConflictError,
  collectNeighborRefs,
  deleteDoc,
  ensureVaultRoot,
  extractSummaryExcerpt,
  findBacklinks,
  findOrphans,
  detectDuplicateTitle,
  findPath,
  listKinds,
  loadVaultDocs,
  normalizeRelationRefs,
  readDoc,
  redirectBacklinks,
  slugToPath,
  patchFrontmatter,
  suggestSimilarSlugs,
  updateDoc,
  vaultSlugExists,
  writeDoc,
} from './vault.mjs';
import { writeFileSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { buildMarkdown } from './parser.mjs';
import { analyzeRepoStructure } from './analyze.mjs';
import {
  IMPORT_EDGE_KIND_VALUES,
  IMPORT_UNRESOLVED_REASON_VALUES,
  inferImports,
  listSourceFiles,
} from './infer-imports.mjs';
import { compileOntology } from './ontology-compiler.mjs';
import { reconcileImportEdges } from './reconcile-imports.mjs';
import { detectVaultPathDrift, suggestPathReconciliations } from './detect-drift.mjs';
import { scoreEvidence } from './evidence-rank.mjs';
import { createCompiledOntologyCache } from './compiled-cache.mjs';
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
  queryCompiledOntology,
} from './ontology-engine.mjs';
import { loadOntologyAtlasIgnore } from './ontology-atlas-ignore.mjs';
import { parseFilter } from './query.mjs';
import {
  VAULT_ISSUE_CODE_VALUES,
  isValidVaultTitle,
  validateVaultDocument,
} from './validate.mjs';
import {
  buildFrontmatter,
  defaultBody,
  missingExpectedFields,
} from './schema.mjs';
import {
  closestAllowedValue,
  formatAllowedValueError,
} from './suggestions.mjs';

const STDIO_MAX_LISTENERS = 50;
process.stdout.setMaxListeners(Math.max(process.stdout.getMaxListeners(), STDIO_MAX_LISTENERS));
process.stderr.setMaxListeners(Math.max(process.stderr.getMaxListeners(), STDIO_MAX_LISTENERS));

const VAULT_ROOT = resolve(process.env.OATLAS_VAULT || process.cwd());
const SERVER_VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
const COMPILED_ONTOLOGY_CACHE = createCompiledOntologyCache({
  loadDocs: () => loadVaultDocs(VAULT_ROOT),
  compile: (docs, options) => compileOntology(docs, options),
});
const NON_BLANK_STRING_SCHEMA = Object.freeze({
  type: 'string',
  minLength: 1,
  pattern: '^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$',
});
const NON_BLANK_STRING_OR_ARRAY_SCHEMA = Object.freeze({
  type: ['array', 'string'],
  minLength: NON_BLANK_STRING_SCHEMA.minLength,
  pattern: NON_BLANK_STRING_SCHEMA.pattern,
  items: NON_BLANK_STRING_SCHEMA,
});
const GRAPH_REF_ARRAY_MAX_ITEMS = 500;
const IGNORE_ARRAY_MAX_ITEMS = 200;
const SOURCE_FOLDER_ARRAY_MAX_ITEMS = 50;
const RELATION_ARRAY_PATCH_SCHEMA = Object.freeze({
  type: 'object',
  properties: Object.fromEntries(
    GRAPH_ARRAY_KEYS.map((key) => [
      key,
      { type: 'array', maxItems: GRAPH_REF_ARRAY_MAX_ITEMS, items: NON_BLANK_STRING_SCHEMA },
    ]),
  ),
  additionalProperties: false,
});
const BACKLINK_REWRITE_KEY_CHANGE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    key: NON_BLANK_STRING_SCHEMA,
    before: NON_BLANK_STRING_OR_ARRAY_SCHEMA,
    after: NON_BLANK_STRING_OR_ARRAY_SCHEMA,
  },
  required: ['key'],
  additionalProperties: false,
});
const BACKLINK_REWRITE_UPDATE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    slug: NON_BLANK_STRING_SCHEMA,
    title: NON_BLANK_STRING_SCHEMA,
    beforeKeys: { type: 'array', items: BACKLINK_REWRITE_KEY_CHANGE_OUTPUT_SCHEMA },
    afterKeys: { type: 'array', items: BACKLINK_REWRITE_KEY_CHANGE_OUTPUT_SCHEMA },
    bodyChanged: { type: 'boolean' },
  },
  required: ['slug', 'title', 'beforeKeys', 'afterKeys', 'bodyChanged'],
  additionalProperties: false,
});
const BACKLINK_REWRITE_PLAN_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    updates: { type: 'array', items: BACKLINK_REWRITE_UPDATE_OUTPUT_SCHEMA },
    totalUpdated: { type: 'integer', minimum: 0 },
  },
  required: ['updates', 'totalUpdated'],
  additionalProperties: false,
});
const BACKLINK_ROW_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    slug: NON_BLANK_STRING_SCHEMA,
    kind: NON_BLANK_STRING_SCHEMA,
    title: NON_BLANK_STRING_SCHEMA,
    domain: NON_BLANK_STRING_SCHEMA,
    mtime: { type: 'number', minimum: 0 },
    matchedKeys: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    matchedInBody: { type: 'boolean' },
  },
  required: ['slug', 'kind', 'title', 'mtime'],
  additionalProperties: false,
});
const CAPTURED_DOC_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    frontmatter: { type: 'object' },
    body: { type: 'string' },
    bodyExcerpt: { type: 'string' },
  },
  required: ['frontmatter'],
  additionalProperties: false,
});
const VAULT_WARNING_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    code: { ...NON_BLANK_STRING_SCHEMA, enum: VAULT_ISSUE_CODE_VALUES },
    severity: { ...NON_BLANK_STRING_SCHEMA, enum: ['error', 'warning'] },
    message: NON_BLANK_STRING_SCHEMA,
  },
  required: ['code', 'severity', 'message'],
  additionalProperties: false,
});
const CONCEPT_NEIGHBORS_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    domains: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    domain: { type: ['string', 'null'] },
    capabilities: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    elements: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    dependencies: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    relates: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    contains: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    describes: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
  },
  required: ['domains', 'domain', 'capabilities', 'elements', 'dependencies', 'relates', 'contains', 'describes'],
  additionalProperties: false,
});
const OUTGOING_EDGE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    to: NON_BLANK_STRING_SCHEMA,
    via: NON_BLANK_STRING_SCHEMA,
  },
  required: ['to', 'via'],
  additionalProperties: false,
});
const VAULT_ISSUE_CODE_DESCRIPTION = VAULT_ISSUE_CODE_VALUES.map((code) => `\`${code}\``).join(', ');
const IMPORT_EDGE_KIND_DESCRIPTION = IMPORT_EDGE_KIND_VALUES.join(', ');
const NODE_KIND_DESCRIPTION = NODE_KIND_VALUES.join(', ');
const EDGE_TARGET_KIND_DESCRIPTION = EDGE_TARGET_KIND_VALUES.join(', ');
const POST_WRITE_MAINTENANCE_GUIDANCE =
  'compact `postWriteMaintenance` (maintenance_plan) with count-safe `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page `nextExecutableAction` / `nextReviewAction` pointers';
const COMPACT_MAINTENANCE_PROPOSED_ACTION_TOOLS = Object.freeze(['add_concept', 'add_relation', 'patch_concept']);
const COMPACT_MAINTENANCE_PROPOSED_ACTION_ARGS_OUTPUT_SCHEMA = Object.freeze({
  oneOf: [
    {
      type: 'object',
      properties: {
        slug: NON_BLANK_STRING_SCHEMA,
        kind: { ...NON_BLANK_STRING_SCHEMA, enum: NODE_KIND_VALUES },
        title: NON_BLANK_STRING_SCHEMA,
      },
      required: ['slug', 'kind', 'title'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        from: NON_BLANK_STRING_SCHEMA,
        to: NON_BLANK_STRING_SCHEMA,
        type: { ...NON_BLANK_STRING_SCHEMA, enum: WRITE_RELATION_TYPE_VALUES },
      },
      required: ['from', 'to', 'type'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        slug: NON_BLANK_STRING_SCHEMA,
        frontmatter: RELATION_ARRAY_PATCH_SCHEMA,
        expected_mtime: { type: 'number', minimum: 0 },
      },
      required: ['slug', 'frontmatter', 'expected_mtime'],
      additionalProperties: false,
    },
  ],
});
const COMPACT_MAINTENANCE_NODE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    slug: NON_BLANK_STRING_SCHEMA,
    kind: { ...NON_BLANK_STRING_SCHEMA, enum: NODE_KIND_VALUES },
    title: NON_BLANK_STRING_SCHEMA,
  },
  required: ['slug', 'kind', 'title'],
  additionalProperties: false,
});
const COMPACT_MAINTENANCE_PROPOSED_ACTION_OUTPUT_SCHEMA = Object.freeze({
  type: ['object', 'null'],
  properties: {
    tool: { ...NON_BLANK_STRING_SCHEMA, enum: COMPACT_MAINTENANCE_PROPOSED_ACTION_TOOLS },
    args: COMPACT_MAINTENANCE_PROPOSED_ACTION_ARGS_OUTPUT_SCHEMA,
  },
  required: ['tool', 'args'],
  additionalProperties: false,
});
const COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    id: NON_BLANK_STRING_SCHEMA,
    phase: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_PHASE_VALUES },
    kind: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_KIND_VALUES },
    severity: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_SEVERITY_VALUES },
    score: { type: 'number', minimum: 0 },
    executable: { type: 'boolean' },
    reason: NON_BLANK_STRING_SCHEMA,
    proposedAction: COMPACT_MAINTENANCE_PROPOSED_ACTION_OUTPUT_SCHEMA,
    node: COMPACT_MAINTENANCE_NODE_OUTPUT_SCHEMA,
    nodes: {
      type: ['array', 'object'],
      items: COMPACT_MAINTENANCE_NODE_OUTPUT_SCHEMA,
      additionalProperties: COMPACT_MAINTENANCE_NODE_OUTPUT_SCHEMA,
    },
  },
  required: ['id', 'phase', 'kind', 'severity', 'score', 'executable', 'reason', 'proposedAction'],
  additionalProperties: false,
});
const NULLABLE_COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA = Object.freeze({
  ...COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA,
  type: ['object', 'null'],
});
const POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  description:
    'Compact maintenance_plan summary for post-write follow-up. Bucket maps describe the remaining queue after the write.',
  properties: {
    operation: { type: 'string', enum: ['maintenance_plan'] },
    sideEffect: { type: 'boolean' },
    graphHash: { type: 'string' },
    summary: {
      type: 'object',
      properties: {
        totalActions: { type: 'integer', minimum: 0 },
        filteredActions: { type: 'integer', minimum: 0 },
        remainingActions: { type: 'integer', minimum: 0 },
        executableActions: { type: 'integer', minimum: 0 },
        reviewActions: { type: 'integer', minimum: 0 },
        compileIssues: { type: 'integer', minimum: 0 },
        dependencyCycles: { type: 'integer', minimum: 0 },
        canonicalizationActions: { type: 'integer', minimum: 0 },
        danglingReferences: { type: 'integer', minimum: 0 },
        relationRecommendations: { type: 'integer', minimum: 0 },
        externalElementRefs: { type: 'integer', minimum: 0 },
        externalElementRefsIgnored: { type: 'integer', minimum: 0 },
        unassignedNodes: { type: 'integer', minimum: 0 },
        emptyDomains: { type: 'integer', minimum: 0 },
      },
      required: [
        'totalActions',
        'filteredActions',
        'remainingActions',
        'executableActions',
        'reviewActions',
        'compileIssues',
        'dependencyCycles',
        'canonicalizationActions',
        'danglingReferences',
        'relationRecommendations',
        'externalElementRefs',
        'externalElementRefsIgnored',
        'unassignedNodes',
        'emptyDomains',
      ],
      additionalProperties: false,
    },
    filters: {
      type: 'object',
      properties: {
        executableOnly: { type: 'boolean' },
        phases: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_PHASE_VALUES } },
        severities: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_SEVERITY_VALUES } },
        kinds: { type: 'array', items: { ...NON_BLANK_STRING_SCHEMA, enum: MAINTENANCE_KIND_VALUES } },
      },
      required: ['executableOnly', 'phases', 'severities', 'kinds'],
      additionalProperties: false,
    },
    cursor: {
      type: 'object',
      properties: {
        afterActionId: { type: ['string', 'null'] },
        found: { type: 'boolean' },
        reason: { type: ['string', 'null'] },
        startIndex: { type: ['integer', 'null'], minimum: 0 },
        nextAfterActionId: { type: ['string', 'null'] },
        hasMore: { type: 'boolean' },
      },
      required: ['afterActionId', 'found', 'reason', 'startIndex', 'nextAfterActionId', 'hasMore'],
      additionalProperties: false,
    },
    byPhase: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
    bySeverity: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
    byKind: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
    limited: { type: 'boolean' },
    nextExecutableAction: {
      ...NULLABLE_COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA,
      description: 'First executable action in the current compact page, or null.',
    },
    nextReviewAction: {
      ...NULLABLE_COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA,
      description: 'First review action in the current compact page, or null.',
    },
    actions: { type: 'array', items: COMPACT_MAINTENANCE_ACTION_OUTPUT_SCHEMA },
  },
  required: [
    'operation',
    'sideEffect',
    'graphHash',
    'summary',
    'filters',
    'cursor',
    'byPhase',
    'bySeverity',
    'byKind',
    'limited',
    'nextExecutableAction',
    'nextReviewAction',
    'actions',
  ],
  additionalProperties: false,
});

function nonBlankStringSchema(description, extra = {}) {
  return {
    ...NON_BLANK_STRING_SCHEMA,
    ...extra,
    description,
  };
}

function paginationOutputSchema() {
  return {
    type: 'object',
    properties: {
      offset: { type: 'integer', minimum: 0 },
      limit: { type: 'integer', minimum: 0 },
      total: { type: 'integer', minimum: 0 },
      returned: { type: 'integer', minimum: 0 },
      hasMore: { type: 'boolean' },
      nextOffset: { type: ['integer', 'null'], minimum: 0 },
    },
    required: ['offset', 'limit', 'total', 'returned', 'hasMore', 'nextOffset'],
    additionalProperties: false,
  };
}

const QUERY_ONTOLOGY_OPERATION_UNION = QUERY_ONTOLOGY_OPERATIONS
  .map((operation) => `'${operation}'`)
  .join('|');
const QUERY_PLAN_TARGET_OPERATION_UNION = QUERY_PLAN_TARGET_OPERATIONS
  .map((operation) => `'${operation}'`)
  .join('|');
const RELATION_TYPE_UNION = RELATION_TYPE_VALUES
  .map((type) => `'${type}'`)
  .join('|');
const ADD_RELATION_TYPE_SCHEMA = { ...NON_BLANK_STRING_SCHEMA, enum: WRITE_RELATION_TYPE_VALUES };

// import-time throw 면 stdio transport 가 붙기 전 stack trace 가 stderr 로
// 새고 클라이언트 (Claude Code 등) 에선 silent crash 로 보인다. 친절한 한
// 줄 메시지 + non-zero exit 로 server log 에 명확히 노출.
try {
  ensureVaultRoot(VAULT_ROOT);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[ontology-atlas-mcp] vault root 검증 실패: ${msg}\n`);
  process.stderr.write(
    `[ontology-atlas-mcp] OATLAS_VAULT 환경 변수가 markdown vault 디렉토리를 가리키게 설정해 주세요. (현재: ${VAULT_ROOT})\n`,
  );
  process.exit(1);
}

// MCP `instructions` field — initialize 응답에 포함되어 연결된 AI agent
// (Claude Code, Cursor, …) 가 항상 보는 시스템-prompt 수준 안내. tool
// description 만으로는 (1) 호출 순서, (2) kind 계층의 의미, (3) write 도구의
// dry-run/confirm 패턴, (4) mtime 충돌 가드, (5) R16/R17 bootstrap workflow,
// (6) error message 가 다음 tool 을 직접 가리킨다는 사실 — agent UX 가
// 매번 시행착오로 학습되는 문제를 단번에 해소.
const SERVER_INSTRUCTIONS = `ontology-atlas — vault of markdown files where each \`.md\` with a frontmatter \`kind:\` is an ontology node. The graph encodes the codebase's mental model and is shared with the human via plain markdown.

## Tool inventory (24 tools = read 16 + write 8)

**read** — \`list_concepts\` · \`get_concept\` · \`get_concepts\` · \`find_evidence\` · \`find_backlinks\` · \`find_neighbors\` · \`find_path\` · \`list_kinds\` · \`find_orphans\` · \`query_concepts\` · \`compile_ontology\` · \`query_ontology\` · \`validate_vault\` · \`analyze_repo_structure\` · \`infer_imports\` · \`index_project\`.
**write** — \`add_concept\` · \`add_concepts\` · \`add_relation\` · \`add_relations\` · \`patch_concept\` · \`delete_concept\` · \`rename_concept\` · \`merge_concepts\`.

## Kind hierarchy (top → leaf)

- **project** — top-level deliverable (e.g. "auth-platform"). Owns domains / capabilities / elements.
- **domain** — functional grouping (e.g. "auth", "billing"). Parent of capabilities.
- **capability** — a coherent unit of behavior (e.g. "token-issue"). Often realized by elements.
- **element** — concrete piece (library, API, schema, file). Leaf-level.
- **document** — narrative or reference doc tied to the graph but not a domain object.
- (\`vault-readme\` is reserved for the auto-generated README.md — agents should not set this kind.)

## Two starting workflows

### A. Vault already has nodes (typical) — orient first

1. \`list_kinds\` — see the kind census (how many projects/domains/capabilities/…).
2. \`list_concepts\` — full node table. Pass \`summary: true\` for prose previews per row (avoid N follow-up \`get_concept\` calls). Pass \`since: <prevMaxMtime>\` for incremental sync. Watch \`vaultWarnings\` — if non-zero, surface it to the user before making decisions on stale data.
3. \`validate_vault({})\` — read-only frontmatter health check. Run this during first-contact before proposing writes; report blocking errors separately from advisory warnings.
4. \`query_ontology({operation:'agent_brief'})\` — Claude Code/Codex handoff: readiness, copyable \`handoffPrompt\`, structured \`cliFallbackCommands[]\` for connector-less sessions, graph entrypoints, first MCP calls, \`graphDbQueryPack\` for \`facets\`, \`schema\`, \`match_nodes\`, \`match_edges\`, \`domain_matrix\`, \`centrality\`, \`all_paths\`, and \`explain_relation\`, investigation playbooks including \`graph_traversal\` (\`schema\` → \`query_plan(all_paths)\` → \`all_paths\` → \`pattern_walk\` → \`project_map\`) with \`evidence[]\` and \`stopWhen[]\` checklists, \`traversalStrategy\` (\`plan_before_enumeration\` / \`bounded_path_evidence\` / \`containment_cross_check\`) for performance-aware graph traversal, write guardrails (\`preflight_relation\` / \`preflight_rename\` / \`post_change_sync\`), \`relationDecisionGuide\` for \`relation_check\` outcomes (\`skip_existing\` / \`review_inverse\` / \`safe_to_add\` / \`review_new_schema\`), \`resultContracts\` requiring \`all_paths\` callers to report \`limit\`, \`searchBudget\`, \`expandedStates\`, \`exhaustive\`, \`truncatedByBudget\`, \`totalPathsExact\`, \`evidence.status\`, \`evidence.reason\`, and \`evidence.pathsComplete\`, plus \`match_nodes\` / \`match_edges\` callers to report \`totalMatches\`, \`limited\`, and \`followUp\` details before treating scan rows as evidence, embedded health, and read-first write policy in one response.
5. \`query_ontology({operation:'workspace_brief'})\` — read-only first-contact diagnosis: project shape, health status, and next actions without fetching the full graph. Use \`query_ontology({operation:'health'})\` when you need a deeper integrity dashboard.
6. \`query_ontology({operation:'overview', limit: 5})\` — cheap graph-query smoke: counts, relation distribution, and hubs without fetching the full compile artifact.
7. \`query_ontology({operation:'query_plan', targetOperation:'overview'})\` and \`query_ontology({operation:'query_plan', targetOperation:'project_map'})\` — side-effect-free cost/index contracts before heavier graph exploration, including \`execution.shouldRun\`, \`nextStep\`, \`suggestedQuery\`, and narrowed \`saferQuery\` guidance when the planned traversal is too broad. \`targetOperation\` accepts ${QUERY_PLAN_TARGET_OPERATION_UNION}.
8. \`get_concept(slug)\` — frontmatter + body excerpt + graph neighbors / outgoingEdges + \`mtime\`. **Capture the \`mtime\`** if you plan to write later. **For K specific slugs use \`get_concepts({slugs: [...]})\` (max 50) to fetch all in one call instead of K round-trips.**
9. \`find_backlinks(slug)\` — understand how a node is referenced (run *before* rename / merge). Each row already includes \`domain\` + \`mtime\` — no follow-up \`get_concept\` needed for sort/filter.
10. \`find_neighbors(slug)\` — one-hop graph subgraph around a node; use \`direction\` / \`types\` to inspect incoming, outgoing, or both.
11. \`find_path(from, to)\` — "how does A relate to B?" (BFS, undirected). Returns \`hops: [slug...]\`, aligned \`nodes: [{slug, kind, title, domain?}]\`, **and \`edges: [{from, to, via}]\` where \`via\` is the frontmatter key (\`domains\` / \`domain\` / \`capabilities\` / \`elements\` / \`dependencies\` / \`relates\` / \`contains\` / \`describes\`) that linked the pair** — so you see not just *that* A and B are connected but *why*.
12. \`find_orphans\` — spot nodes that no other node points to (cleanup or deletion candidates; project roots and vault README are excluded by default).
13. \`query_concepts(filter)\` — structured questions like \`kind=capability AND domain=auth AND NOT has(elements)\` (= "unfinished caps under auth").
14. \`compile_ontology({includeIndexes:true})\` — compiler-style graph artifact: canonical nodes, edges, aliases, issues, stable \`graphHash\`, \`maxMtime\`, and query indexes.
15. \`query_ontology({operation:${QUERY_ONTOLOGY_OPERATION_UNION}, ...})\` — graph-engine query over the compiled artifact. Use \`neighbors\` for local graph view, \`path\` for one relation route, \`all_paths\` for bounded simple paths between two nodes, \`query_plan\` for an EXPLAIN-style side-effect-free cost/index estimate before running a target operation (including filter-preserving \`suggestedQuery\` and \`estimate.totalMatches\` for \`match_nodes\` / \`match_edges\`), \`centrality\` for PageRank-style core-node ranking plus bridge/authority/hub lists, \`communities\` for label-propagation clusters inside the graph, \`similar_nodes\` before writes to catch likely duplicate or overlapping concepts, \`explain_relation\` for direct edges + shortest path + shared-neighbor explanation between two nodes, \`reachability\` for transitive graph closure from a start node, \`pattern_walk\` for explicit relation-sequence paths such as project → domains → capabilities, \`impact\` for "what depends on this?" change analysis, \`blast_radius\` for impact grouped by kind/domain with cross-domain edge risk, \`subgraph\` for a bounded N-hop graph slice, \`overview\` for dashboard-style graph aggregates, \`schema\` for \`(:kind)-[:relation]->(:kind)\` patterns, \`facets\` for filter/dashboard aggregates, \`match_nodes\` for graph DB-style node rows with degree filters plus a \`followUp\` packet for focused next queries, \`match_edges\` for graph DB-style edge pattern rows plus a \`followUp\` packet for focused relation evidence and preflight, \`node_profile\` for a single node detail dashboard, \`domain_profile\` for a domain detail dashboard, \`domain_matrix\` for domain-to-domain coupling, \`project_scope\` for a project-contained graph slice, \`project_map\` for a domain-by-domain project map, \`relation_check\` before writes, \`components\` to find disconnected graph islands, \`lineage\` and \`containment_tree\` for project/domain/capability containment, \`cycles\` for directed dependency-cycle checks, \`topological_order\` for prerequisite-first dependency ordering, \`recommend_relations\` for safe domain-containment suggestions, \`growth_plan\` for side-effect-free ontology expansion candidates, \`maintenance_plan\` for ordered post-write graph cleanup/repair actions, \`agent_brief\` for Claude Code/Codex handoff prompt, recipes, graph entrypoints, playbook evidence/stopWhen checklists, write guardrails, \`graph_traversal\` playbook, \`traversalStrategy\` for plan-first bounded traversal, \`relationDecisionGuide\`, \`resultContracts\` for interpreting \`all_paths\` completeness (\`limit\` / \`searchBudget\` / \`expandedStates\` / \`exhaustive\` / \`truncatedByBudget\` / \`totalPathsExact\` plus \`evidence.status\` / \`evidence.reason\` / \`evidence.pathsComplete\`) and \`match_nodes\` / \`match_edges\` followUp evidence, and read-first write policy, \`workspace_brief\` for first-contact status + next actions, and \`health\` for a one-shot graph integrity dashboard.
16. \`index_project({rootPath, maxFiles, threshold})\` — one read-only indexing checkpoint for large projects. It combines \`analyze_repo_structure\`, \`infer_imports\`, and \`validate_vault\` into counts, phases, validation status, and next write actions. It never writes markdown; land accepted candidates with \`add_concepts\` / \`add_relations\` or CLI \`ontology-atlas index --apply\`.

All read-tool match rows share the same shape \`{slug, kind, title, domain, mtime, ...}\` — same sort/filter logic works across every read tool.

All tool input schemas are strict: unknown arguments are rejected instead of being ignored, unknown tool names are rejected with the closest tool-name hint, and invalid enum values are rejected too. Tool-level error responses include \`structuredContent: { ok: false, errorCode, error, ...repairFields }\`; \`unknown_tool\` means fix the reported tool name, \`unknown_argument\` means fix reported argument names, while \`invalid_arguments\` means fix reported enum/filter/type values. For repairable strict-input errors, read structured fields such as \`receivedTool\`, \`receivedArgument\`, \`unknownArguments\`, \`rowName\`, \`receivedField\`, \`unknownFields\`, \`allowedFields\`, \`receivedFields\`, \`firstSeenAt\`, \`receivedValue\`, \`suggestion\`, \`allowedTools\`, \`allowedArguments\`, \`allowedValues\` before retrying. For missing node errors, read \`missingSlug\`, \`similarSlugs\`, \`recoveryTools\`, and optional \`createTool\` instead of parsing prose. For slug conflicts, read \`conflictSlug\`, \`recoveryTools\`, and optional \`overwriteOption\`. Do not parse the human-readable text unless a client cannot read \`structuredContent\`. If you see an error like \`Unknown tool: list_concept. Did you mean "list_concepts"?\`, \`Unknown argument "lmit" for list_concepts. Did you mean "limit"?\`, \`Unknown arguments for list_concepts: "lmit" (did you mean "limit"?), "summry" (did you mean "summary"?)\`, or \`operation must be one of: ... Did you mean "overview"?\`, fix every reported key/value before retrying; do not assume the server fell back to a default.

\`health\`, \`workspace_brief\`, and \`agent_brief\` can tune their internal graph probes with \`componentLimit\`, \`cycleLimit\`, \`recommendationLimit\`, \`orderLimit\`, \`nodeLimit\`, \`dependencyTypes\`, and \`componentTypes\`. \`dependencyTypes\` / \`componentTypes\` accept relation types ${RELATION_TYPE_UNION}; typoed values fail with nearest-value hints. Use these controls for large vaults or focused diagnostics instead of pulling the full compile artifact.

\`maintenance_plan\` is an agent work queue. Its \`phases\`, \`severities\`, and \`kinds\` filters are enum-validated, so typoed filters fail instead of returning an empty plan. Summary counts (\`totalActions\`, \`filteredActions\`, \`remainingActions\`, \`executableActions\`, \`reviewActions\`) and \`byPhase\` / \`bySeverity\` / \`byKind\` buckets are count-safe; bucket totals describe the remaining queue and match \`remainingActions\`. A ready page reports \`cursor.found=true\` with \`cursor.reason=null\`; \`cursor.nextAfterActionId\` is the last returned action id (or null for an empty page), and \`cursor.hasMore\` reflects whether more remaining actions exist after the current page. \`nextExecutableAction\` and \`nextReviewAction\` point only at the first executable/review action in the current returned page. When resuming with \`afterActionId\`, an unknown cursor returns an empty page with \`cursor.found=false\`, \`cursor.reason\`, zero remaining actions, \`cursor.nextAfterActionId=null\`, \`cursor.hasMore=false\`, and no next actions — surface that to the user instead of silently restarting the queue.

### B. Vault is empty / cold-start — bootstrap from code (R16 / R17 / R+)

When the user says "이 codebase 분석해줘" or you find only the 5 starter nodes. **Modern path is 3 round-trips total — analyze + add_concepts + add_relations** (down from per-row K calls):

1. \`analyze_repo_structure\` — walk \`package.json\` / \`README.md\` H2 / \`src/\` (FSD vs generic detect). Returns deterministic candidates (project + domains[] + capabilities[] + elements[] + suggestedRelations[]). **side effect 0 — vault NOT modified.** Show the candidates compactly, let the user prune / refine.
2. \`add_concepts({concepts: [...]})\` — assemble the accepted project + domains + capabilities + elements into one array (max 50) and land them in **one batch call**. Each row processed independently: existing-slug / invalid-kind / missing-required / non-object row / unknown row fields surface as \`{ok: false, error}\` with a \`concepts[n]\` row label; single unknown-field rows include \`receivedField\` plus one-row \`unknownFields\`; multi unknown-field rows report every unknown field with nearest hints and \`Received fields: ...\`; the rest still land. Pre-checks duplicate slugs *within input batch*: the later row fails with \`concepts[n] duplicate slug in input batch; first seen at concepts[m]\`, so remove or rename the later row before retrying. Invalid-only batches return no row-level write metadata and no top-level \`postWriteMaintenance\`; if every row failed, treat the call as dry validation evidence and retry corrected rows. Use single \`add_concept\` only when you need atomic per-call semantics.
3. \`add_relations({relations: [...]})\` — convert \`suggestedRelations\` into the same shape and land all edges in **one batch call**. Each row processed independently: missing source/target / unknown type / non-object row / unknown row fields surface as \`{ok: false, error}\` with a \`relations[n]\` row label; unknown type row errors include a closest-value hint such as \`Did you mean "depends_on"?\`; single unknown-field rows include \`receivedField\` plus one-row \`unknownFields\`; multi unknown-field rows report every unknown field with nearest hints and \`Received fields: ...\`; the rest still land. Invalid-only batches return no row-level \`changed\` / \`alreadyExists\` write metadata and no top-level \`postWriteMaintenance\`; if every row failed, treat the call as dry validation evidence and retry corrected rows. Idempotent (\`alreadyExists: true\` on second run); 50-row chunk if you have more.
4. (Optional, R17) \`infer_imports\` for TS/JS \`depends_on\` edges from the actual import graph. Then another \`add_relations\` batch with \`type: 'depends_on'\`. The CLI \`ontology-atlas bootstrap\` packages all 4 steps into one command.

Throughout: the user (via your add_concepts / add_relations calls) is the single source of truth — never auto-write proposals without their confirmation.

## Write tools — safety patterns

- **\`add_concept\`** throws on duplicate slug — use \`patch_concept\` to update an existing node, never delete-then-add (that loses backlinks).
- **\`rename_concept\` / \`merge_concepts\`** are dry-run by default. The first call returns an \`updates\` preview (every affected file's before/after). To commit, repeat the call with \`confirm: true\`. \`rename_concept\` refuses an existing \`newSlug\` unless you intentionally pass \`overwrite: true\`. Backlinks are redirected atomically — much safer than \`patch_concept\` + N find_backlinks loops.
- **\`delete_concept\`** refuses by default if any backlinks remain. The error response captures the deleted frontmatter + body so a mistake is recoverable. Pass \`force: true\` only after confirming with the user that dangling referrers are acceptable.
- **\`expected_mtime\` (all write tools)** — to guard against concurrent edits by the human or another agent: capture \`mtime\` from \`get_concept\`, pass it as \`expected_mtime\` on the next write. If the file changed in between, the call throws \`VaultConflictError\` instead of silently overwriting.

## When a tool throws — read the error suffix

Every error message ends with the canonical fix tool. Examples:
- \`Doc already exists at "X". To update fields, use **patch_concept**(...).\`
- \`Doc not found: "Y". Use **list_concepts**() to see all slugs, or **find_evidence**(query) to search by title. Similar slugs in this vault: ...\`
- \`Source slug does not exist in vault: "Z". Use list_concepts() to see all slugs, or find_evidence(query) to search by title. If the endpoint is real but absent, create it first with add_concept(slug, kind, title). Similar slugs in this vault: ...\`

Don't retry blindly — parse the suffix and pivot to the suggested tool.

## What to write back

When code introduces a new capability / element / domain, mirror it in the vault with \`add_concept\` (and \`add_relation\` to wire it). When code is renamed / refactored, use \`rename_concept\` (one atomic call) instead of patch + manual backlink updates. The vault is the *shared* mental model — keeping it in sync is the point.`;

const server = new Server(
  { name: 'ontology-atlas-mcp', version: SERVER_VERSION },
  {
    capabilities: { tools: {} },
    instructions: SERVER_INSTRUCTIONS,
  },
);

// ── 도구 정의 ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_concepts',
    description:
      'List every ontology node in the vault (each .md file with a frontmatter `kind:`). ' +
      'Filter by `kind`, `domain`, and/or `since` (mtime-based incremental sync). ' +
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
            'Non-negative mtime threshold. Filter to nodes with `mtime > since` (ms). Pair with the `mtime` returned in earlier `list_concepts` / `get_concept` responses for incremental sync — "what changed since I last looked". Strict greater-than (mtime === since 는 제외) so re-passing the max from a previous response does not double-fetch.',
        },
        summary: {
          type: 'boolean',
          description:
            'When true, each node row includes a `summary` (max 200 chars, prose-only — heading / 표 / 코드블록 / 이미지 / 구분선 / 리스트 / 인용 skip 후 첫 단락만, same `extractSummaryExcerpt` helper as `get_concept` / `find_evidence`). Useful for "scan + overview" without N follow-up `get_concept` calls. Default false to keep payload small.',
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
            },
            required: ['slug', 'kind', 'title', 'mtime'],
            additionalProperties: false,
          },
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
      required: ['total', 'vaultRoot', 'nodes'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_concept',
    description:
      'Fetch a single node by slug or unique alias — its frontmatter, a body excerpt, direct graph neighbors, outgoingEdges, and mtime. Accepts exact vault-relative slugs, unique tail slugs, or frontmatter `slug` aliases; response slug is canonical. **For K specific slugs in one call use `get_concepts({slugs: [...]})` (max 50) instead of K round-trips.**',
    inputSchema: {
      type: 'object',
      properties: {
        slug: nonBlankStringSchema(
          'Vault-relative slug (e.g. projects/auth-platform), unique tail slug, or frontmatter `slug` alias. Omit the .md extension.',
        ),
      },
      required: ['slug'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        slug: NON_BLANK_STRING_SCHEMA,
        frontmatter: {
          type: 'object',
          description: 'Resolved markdown frontmatter.',
        },
        excerpt: {
          type: 'string',
          description: 'Short body excerpt.',
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
      required: ['slug', 'frontmatter', 'excerpt', 'neighbors', 'outgoingEdges', 'mtime'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_concepts',
    description:
      'Fetch *multiple* nodes in one call — same per-row shape as `get_concept` (frontmatter + excerpt + neighbors + mtime + warnings?), but accepts an array of slugs or unique aliases. Use when you have K specific slugs from `list_concepts` / `find_path` / `find_orphans` etc. and need their full details — saves K-1 round-trips. Order of `concepts[]` matches input `slugs[]`; successful rows return canonical `slug`. Missing or invalid slug rows return `{ slug, ok: false, error }` rather than aborting the batch, so later valid slugs still resolve — agents handle partial results gracefully.',
    inputSchema: {
      type: 'object',
      properties: {
        slugs: {
          type: 'array',
          maxItems: 50,
          items: NON_BLANK_STRING_SCHEMA,
          description: 'Vault-relative slugs, unique tail slugs, or frontmatter `slug` aliases (e.g. ["capabilities/x", "elements/y"]). Omit the .md extension. Max 50 per call.',
        },
      },
      required: ['slugs'],
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
              slug: NON_BLANK_STRING_SCHEMA,
              frontmatter: {
                type: 'object',
                description: 'Resolved markdown frontmatter for successful rows.',
              },
              excerpt: {
                type: 'string',
                description: 'Short body excerpt for successful rows.',
              },
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
            },
            required: ['ok', 'slug'],
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
      "Find vault docs that mention a given concept by title. Useful when an AI agent asks where a capability is realized in code or docs. Each match includes a prose `excerpt` (max 200 chars, heading/표/코드 skip) so agents see *what the matching doc says* without an extra get_concept call. Matches are RANKED by a deterministic relevance `score` (title match > frontmatter ref > body, plus a title token-overlap tiebreaker) and returned best-first — so the most relevant node is `matches[0]`, not buried in walk order. Pass `limit` for the top-N.",
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
      },
      required: ['title'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        query: NON_BLANK_STRING_SCHEMA,
        matches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slug: NON_BLANK_STRING_SCHEMA,
              kind: NON_BLANK_STRING_SCHEMA,
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
            },
            required: ['slug', 'kind', 'title', 'mtime', 'matchedIn', 'score', 'excerpt'],
            additionalProperties: false,
          },
        },
      },
      required: ['query', 'matches'],
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
      '**For bulk creation (e.g. bootstrap flow with 5+ nodes) use `add_concepts({concepts: [...]})` (batch, max 50, partial result) — saves K-1 round-trips.**',
    inputSchema: {
      type: 'object',
      properties: {
        slug: nonBlankStringSchema('Vault-relative slug (omit the .md extension).'),
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
        body: {
          type: 'string',
          description: 'Markdown body (optional). When omitted a kind-specific starter body is written so the file is self-explanatory in the editor.',
        },
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
      'Use after `analyze_repo_structure` / `infer_imports` (or any bootstrap flow) ' +
      'when the agent has K accepted candidates from the user — replaces K×`add_concept` ' +
      'round-trips. Each row is processed independently: existing-slug / invalid-kind / ' +
      'missing-required-fields / non-object row shape / unknown row fields surface as `{ slug, ok: false, error }` rows whose errors include a `concepts[n]` row label, single unknown-field rows include `receivedField` plus one-row `unknownFields`, multi unknown-field rows report every unknown field with nearest hints and `Received fields: ...`, and duplicate input slugs report the later `concepts[n]` row plus first-seen `concepts[m]` with structured `rowName` / `firstSeenAt`; the rest ' +
      'still land. A row whose normalized title matches an earlier landed row in the same batch still lands but carries a near-duplicate `warning` — `patch_concept` the earlier node instead of forking the same concept (duplicates are the #1 growing-vault failure mode). '
      + '`concepts[]` order in the response matches the input. Cap = 50 per ' +
      'call (split into multiple batches for larger sets). NO atomic rollback — if you ' +
      'need all-or-nothing semantics use single `add_concept` calls. Invalid-only batches return no row-level write metadata and no top-level `postWriteMaintenance`. When at least one row changes the vault, the response includes one ' + POST_WRITE_MAINTENANCE_GUIDANCE + ' for the final graph.',
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
              body: { type: 'string' },
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
      '`domain` sets the source node\'s inline parent domain. The relation type picks which key receives the entry. **R11**: optional ' +
      '`expected_mtime` — pass the source-side `mtime` from a prior get_concept ' +
      'so concurrent external edits throw VaultConflictError. ' +
      'Invalid relation `type` is rejected before endpoint slug resolution with a closest-value hint and structured `valueName` / `receivedValue` / `suggestion` / `allowedValues` repair fields in `structuredContent`, with no `changed`, `alreadyExists`, or `postWriteMaintenance` write metadata. ' +
      'Changed writes return ' + POST_WRITE_MAINTENANCE_GUIDANCE + ' so agents can immediately see graph cleanup / relation suggestions after the edge lands. ' +
      '**For multiple edges (e.g. all suggestedRelations from analyze, or all moduleEdges from infer_imports) use `add_relations({relations: [...]})` (batch, idempotent, max 50).**',
    inputSchema: {
      type: 'object',
      properties: {
        from: nonBlankStringSchema('Source slug.'),
        to: nonBlankStringSchema('Target slug.'),
        type: {
          ...ADD_RELATION_TYPE_SCHEMA,
          description: 'Relation type.',
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
      'Use after `analyze_repo_structure` (suggestedRelations) / `infer_imports` (moduleEdges) ' +
      'when the agent has K accepted edges from the user — replaces K×`add_relation` round-trips. ' +
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
            'Frontmatter key/value patches (e.g. { kind: "capability", domain: "views" }). null removes the key.',
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
            required: ['slug', 'kind', 'title', 'mtime'],
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
              slug: NON_BLANK_STRING_SCHEMA,
              kind: NON_BLANK_STRING_SCHEMA,
              title: NON_BLANK_STRING_SCHEMA,
              domain: { type: 'string' },
              mtime: { type: 'number', minimum: 0 },
            },
            required: ['slug', 'kind', 'title', 'mtime'],
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
      '`{ from, to, hops: [slug...], nodes: [{slug, kind, title, domain?}], edges: [{from, to, via}] }` where each ' +
      '`via` is the frontmatter key (`domains` / `domain` / `capabilities` / `elements` / `dependencies` / ' +
      '`relates` / `contains` / `describes`) that linked the two slugs — so the ' +
      'agent sees not just *that* A and B are connected but *why*. ' +
      'Returns `{ found: false }` when no path is found within maxHops. maxHops defaults to 5 and is capped at 20.',
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
              slug: NON_BLANK_STRING_SCHEMA,
              kind: NON_BLANK_STRING_SCHEMA,
              title: NON_BLANK_STRING_SCHEMA,
              domain: { type: 'string' },
            },
            required: ['slug', 'kind', 'title'],
            additionalProperties: false,
          },
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
              slug: NON_BLANK_STRING_SCHEMA,
              kind: NON_BLANK_STRING_SCHEMA,
              title: NON_BLANK_STRING_SCHEMA,
              domain: { type: 'string' },
              mtime: { type: 'number', minimum: 0 },
            },
            required: ['slug', 'kind', 'title', 'mtime'],
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
      'capabilities under domain auth that have zero elements (= unfinished caps).',
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
            required: ['slug', 'kind', 'title', 'mtime'],
            additionalProperties: false,
          },
        },
        limited: { type: 'boolean' },
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
            'When true, include indexes `{out, in, byKind, byDomain, edgeById, aliasToSlug}`. Defaults false to keep payload smaller.',
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
              slug: NON_BLANK_STRING_SCHEMA,
              kind: { type: 'string' },
              title: { type: 'string' },
              domain: { type: 'string' },
              mtime: { type: 'number' },
              outDegree: { type: 'integer', minimum: 0 },
              inDegree: { type: 'integer', minimum: 0 },
            },
            required: ['slug', 'kind', 'title', 'mtime', 'outDegree', 'inDegree'],
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
      'Run graph-engine queries over the freshly compiled ontology artifact. Operations: `neighbors` (local graph neighborhood), `path` (one compiled-edge route between two nodes with aligned `nodes[]` summaries), `all_paths` (bounded simple paths between two nodes with per-path `nodes[]` summaries plus limit/searchBudget/exhaustive/truncatedByBudget/totalPathsExact metadata and evidence guidance), `query_plan` (EXPLAIN-style side-effect-free cost/index estimate plus execution advice before a target operation, filter-preserving suggestedQuery, and filter-aware estimate.totalMatches for match_nodes/match_edges), `centrality` (PageRank-style core-node ranking plus bridge/authority/hub lists), `communities` (label-propagation clusters inside the graph), `similar_nodes` (duplicate/overlap candidates before writes), `explain_relation` (direct edges, shortest path, and shared-neighbor explanation between two nodes), `reachability` (transitive graph closure from a start node), `pattern_walk` (explicit relation-sequence paths such as project → domains → capabilities), `impact` (incoming by default: what depends on this node), `blast_radius` (impact grouped by kind/domain with cross-domain edge risk), `subgraph` (bounded N-hop graph slice for UI/agent views), `overview` (counts, relation distribution, and hubs), `schema` (kind-relation-kind patterns), `facets` (filter/dashboard aggregates), `match_nodes` (graph DB-style node rows with degree filters plus a followUp packet for the first returned row), `match_edges` (graph DB-style edge pattern rows plus a followUp packet for the first returned real edge), `node_profile` (single node detail dashboard), `domain_profile` (domain detail dashboard), `domain_matrix` (domain-to-domain coupling), `project_scope` (project-contained graph slice), `project_map` (domain-by-domain project map), `relation_check` (schema-aware preflight before add_relation), `components` (connected graph islands), `lineage` and `containment_tree` (project/domain/capability containment), `cycles` (directed dependency-cycle checks), `topological_order` (prerequisite-first dependency ordering), `recommend_relations` (safe domain-containment suggestions), `growth_plan` (side-effect-free ontology expansion candidates), `maintenance_plan` (ordered post-write graph cleanup/repair actions with stable action `id`, count-safe summary fields, `byPhase` / `bySeverity` / `byKind` remaining-queue buckets, ready cursor `cursor.found=true` / `cursor.reason=null`, cursor `nextAfterActionId`/`hasMore` pagination metadata, afterActionId resume, unknown-cursor empty page with `cursor.nextAfterActionId=null` / `cursor.hasMore=false`, kind filters, executable graph-array canonicalization, `executable` flags, and current-page `nextExecutableAction` / `nextReviewAction` pointers), `agent_brief` (Claude Code/Codex handoff prompt, graphDbQueryPack for facets, schema, match_nodes, match_edges, domain_matrix, centrality, all_paths, and explain_relation, structured cliFallbackCommands, recipes, graph entrypoints, graph_traversal playbook, traversalStrategy plan_before_enumeration/bounded_path_evidence/containment_cross_check guidance, playbook evidence/stopWhen checklists, write guardrails, relationDecisionGuide, resultContracts for all_paths completeness and match_nodes/match_edges followUp evidence, and read-first write policy), `workspace_brief` (first-contact status + next actions), and `health` (one-shot graph integrity dashboard). ' +
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
            'query_plan only: read-only graph operation to explain before execution. Supports every query_ontology operation except query_plan itself.',
        },
        iterations: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description:
            'centrality/communities only: positive integer PageRank or label-propagation iteration count. Defaults to 20, max 100.',
        },
        slug: nonBlankStringSchema(
          'Center/root node slug or unique alias. Required for neighbors, reachability, pattern_walk, impact, blast_radius, subgraph, lineage, node_profile, and domain_profile; optional root for containment_tree.',
        ),
        seed: nonBlankStringSchema('Alias for slug when operation is subgraph.'),
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
          'domain_matrix/project_scope/project_map only: project root slug or unique alias. Optional for domain_matrix; optional for project_scope/project_map when exactly one kind: project node exists.',
        ),
        to: nonBlankStringSchema(
          'Target node slug or unique alias. Required for path, all_paths, and explain_relation.',
        ),
        direction: {
          type: 'string',
          enum: ['incoming', 'outgoing', 'both', 'undirected'],
          description:
            'neighbors/reachability/impact/blast_radius/subgraph: incoming, outgoing, or both. path/all_paths/explain_relation/reachability also accepts undirected.',
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
            'all_paths and query_plan(all_paths) only: maximum DFS states to expand before returning partial bounded paths. Defaults to 5000.',
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
  },
  {
    name: 'validate_vault',
    description:
      'R+ (cycle 46) — validate every doc in the vault, return per-doc + per-code aggregate. ' +
      'Replaces the K-round-trip pattern of `list_concepts` then per-doc `get_concept` (whose `warnings: [...]` is per-file). ' +
      `8 issue codes — ${VAULT_ISSUE_CODE_DESCRIPTION}. ` +
      'Returns `{ scanned, problems: [{slug, issues: [{code, severity, message}]}], summary: { problemFiles, errorFiles, warningFiles, byCode: { code: { severity, count, files } } } }`. ' +
      'Also returns `pathDrift`: frontmatter `path:` / `elements:` source paths that no longer exist on disk (vault→code drift), resolved against `repoRoot` (default: server cwd). Ontology-slug references are never flagged. Fix via `patch_concept` or remove the stale entry. ' +
      'side effect 0. Use when an agent needs the *whole-vault* health view: first-contact before writes, before / after a batch write, or surfacing issues to the user.',
    inputSchema: {
      type: 'object',
      properties: {
        repoRoot: {
          ...NON_BLANK_STRING_SCHEMA,
          description:
            'Repository root that frontmatter source paths resolve against, for the pathDrift check. Defaults to the MCP server cwd. Pass this if the vault lives apart from the code repo.',
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
          required: ['repoRoot', 'nodesScanned', 'pathsChecked', 'drifts', 'hint'],
          additionalProperties: false,
        },
      },
      required: ['scanned', 'problems', 'summary', 'pathDrift'],
      additionalProperties: false,
    },
  },
  {
    name: 'infer_imports',
    description:
      'R17 (autonomous ingest deeper) — walk TS/JS files in a code repo and infer file-level + module-level import edges. ' +
      'side effect 0 (vault frontmatter NOT modified). The agent reviews moduleEdges (capability A → capability B from import count) and selectively passes accepted edges to add_relation as `depends_on`. ' +
      'Each module edge includes `kindCounts` so the agent can distinguish static-heavy edges from dynamic/require/reexport/side-effect evidence before writing. ' +
      'Detects:\n' +
      '  - relative imports (./, ../) → resolved to file paths\n' +
      '  - dynamic import() / require() / export ... from\n' +
      '  - bare side-effect imports (import "X")\n' +
      '  - external (npm) imports listed separately\n' +
      '  - tsconfig.json compilerOptions.paths aliases first, then fallback common @/* aliases → resolved to internal files when the target exists; otherwise unresolved as alias-not-found\n\n' +
      'Use after analyze_repo_structure to pull *real* dependency edges from the code, not just suggestedRelations heuristics. ' +
      'Unless reconcile:false, also returns `reconciliation` (+ `reconciliationSummary` counts): the module edges diffed against the vault\'s compiled depends_on edges into `inBoth` / `inCodeMissingFromVault` (each with an add_relation `proposedAction`) / `inVaultNotInCode` (possibly-stale vault edges) — i.e. EXACTLY what to sync toward code↔vault drift 0, not a raw firehose. ' +
      'Single source of truth preserved — only the user (via your subsequent add_relation calls) writes to the vault.',
    inputSchema: {
      type: 'object',
      properties: {
        rootPath: {
          ...NON_BLANK_STRING_SCHEMA,
          description: 'Repository root to analyze. Defaults to MCP server cwd.',
        },
        sourceFolders: {
          type: 'array',
          maxItems: SOURCE_FOLDER_ARRAY_MAX_ITEMS,
          items: NON_BLANK_STRING_SCHEMA,
          description:
            "Source folders to walk (default: ['src','lib','app','packages']). " +
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
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        rootPath: NON_BLANK_STRING_SCHEMA,
        filesScanned: { type: 'integer', minimum: 0 },
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
            },
            required: ['from', 'to', 'kind'],
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
            },
            required: ['from', 'to', 'count', 'kindCounts'],
            additionalProperties: false,
          },
        },
        reconciliation: {
          type: ['object', 'null'],
          description:
            'Module edges diffed against the vault\'s compiled depends_on edges (alias-normalized). null when no vault is loadable (e.g. scanning a foreign repo). Absent when reconcile:false.',
          properties: {
            inBoth: { type: 'array', items: { type: 'object' } },
            inCodeMissingFromVault: {
              type: 'array',
              description: 'depends_on edges present in the code import graph but missing from the vault, with BOTH endpoints already existing vault nodes (directly landable). Each has a `proposedAction` for add_relations.',
              items: { type: 'object' },
            },
            inCodeMissingEndpointAbsent: {
              type: 'array',
              description: 'code import edges whose from/to includes a slug that is not yet a vault node (`absentEndpoints`) — create the node(s) before adding the relation.',
              items: { type: 'object' },
            },
            inVaultNotInCode: {
              type: 'array',
              description: 'vault depends_on edges with no matching code import — possibly stale, review before removing.',
              items: { type: 'object' },
            },
          },
        },
        reconciliationSummary: {
          type: 'object',
          description: 'Counts + a one-line hint. Present only when reconciliation ran successfully.',
          properties: {
            inBoth: { type: 'integer', minimum: 0 },
            inCodeMissingFromVault: { type: 'integer', minimum: 0 },
            inCodeMissingEndpointAbsent: { type: 'integer', minimum: 0 },
            inVaultNotInCode: { type: 'integer', minimum: 0 },
            hint: { type: 'string' },
          },
        },
      },
      required: ['rootPath', 'filesScanned', 'edges', 'externalImports', 'unresolved', 'moduleEdges'],
      additionalProperties: false,
    },
  },
  {
    name: 'index_project',
    description:
      'Project ontology indexing plan — run analyze_repo_structure + infer_imports + validate_vault in one read-only call. ' +
      'Use for large or already-existing projects where the agent needs a resumable ontology indexing checkpoint before writing. ' +
      'side effect 0: this tool never writes markdown. To land accepted candidates, use add_concepts/add_relations explicitly or the CLI `ontology-atlas index --apply` command.',
    inputSchema: {
      type: 'object',
      properties: {
        rootPath: {
          ...NON_BLANK_STRING_SCHEMA,
          description: 'Repository root to index. Defaults to MCP server cwd.',
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
            thresholdApplied: { type: 'object' },
            reconciliationSummary: { type: 'object' },
          },
        },
        plan: {
          type: 'object',
          properties: {
            concepts: { type: 'integer', minimum: 0 },
            suggestedRelations: { type: 'integer', minimum: 0 },
            importRelations: { type: 'integer', minimum: 0 },
            phases: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
          },
          required: ['concepts', 'suggestedRelations', 'importRelations', 'phases'],
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
          },
          required: ['scanned', 'problemFiles', 'errorFiles', 'warningFiles', 'pathDrift'],
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
              },
              required: ['domains', 'capabilities'],
              additionalProperties: false,
            },
            implementationEvidence: {
              type: 'object',
              properties: {
                elements: { type: 'integer', minimum: 0 },
              },
              required: ['elements'],
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
            'implementationEvidence',
            'reviewQuestions',
          ],
          additionalProperties: false,
        },
        next: {
          type: 'object',
          properties: {
            applyTool: NON_BLANK_STRING_SCHEMA,
            cliApply: NON_BLANK_STRING_SCHEMA,
            review: NON_BLANK_STRING_SCHEMA,
          },
          required: ['applyTool', 'cliApply', 'review'],
          additionalProperties: false,
        },
      },
      required: ['mode', 'sideEffect', 'rootPath', 'vaultRoot', 'analyze', 'imports', 'plan', 'validation', 'meaningGate', 'next'],
      additionalProperties: false,
    },
  },
  {
    name: 'analyze_repo_structure',
    description:
      'R16 (autonomous ingest base) — analyze a code repository and propose ontology node candidates. ' +
      'side effect 0 (vault frontmatter NOT modified). Returns deterministic candidates the agent ' +
      'should review and selectively pass to add_concept. Detects:\n' +
      '  - package.json `name` → project candidate\n' +
      '  - README.md first H1 → project title fallback\n' +
      '  - README.md H2 sections (skipping generic "Usage"/"Installation"/etc) → domain candidates\n' +
      '  - src/features|entities|widgets|views/* (FSD) → capability/element candidates\n' +
      '  - src/* depth-1 folders (generic) → capability candidates + index entry → element\n\n' +
      'Use this once when a user asks "이 codebase 분석해줘" / "bootstrap the ontology". ' +
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
      },
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
        suggestedRelations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from: NON_BLANK_STRING_SCHEMA,
              to: NON_BLANK_STRING_SCHEMA,
              type: NON_BLANK_STRING_SCHEMA,
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
              },
              required: ['domains', 'capabilities'],
              additionalProperties: false,
            },
            implementationEvidence: {
              type: 'object',
              properties: {
                elements: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
              },
              required: ['elements'],
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
            'implementationEvidence',
            'reviewQuestions',
          ],
          additionalProperties: false,
        },
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
      required: ['ok', 'oldSlug', 'newSlug', 'sourcePath', 'targetPath', 'moved', 'backlinkUpdates'],
      additionalProperties: false,
    },
  },
  {
    name: 'merge_concepts',
    description:
      '⚠ DESTRUCTIVE MULTI-FILE WRITE — fold one node into another. Every backlink to fromSlug is ' +
      'redirected to intoSlug (frontmatter array entries + body links), then fromSlug is deleted. The ' +
      'intoSlug node is preserved as-is — its frontmatter / body are not merged automatically (use ' +
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
      },
      required: ['fromSlug', 'intoSlug'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        dryRun: { type: 'boolean' },
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
      required: ['ok', 'fromSlug', 'intoSlug', 'fromPath', 'deleted', 'backlinkUpdates', 'capturedFrom'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_concept',
    description:
      '⚠ DESTRUCTIVE — permanently deletes the vault .md file. Two-stage safety:\n' +
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
      required: ['ok', 'slug', 'filePath'],
      additionalProperties: false,
    },
  },
];

const READ_TOOL_NAMES = new Set([
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
  'analyze_repo_structure',
  'infer_imports',
  'index_project',
]);

const DESTRUCTIVE_TOOL_NAMES = new Set([
  'delete_concept',
  'merge_concepts',
  'rename_concept',
]);

const IDEMPOTENT_TOOL_NAMES = new Set([
  'add_relation',
  'add_relations',
]);

function toolTitle(name) {
  return String(name || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const TOOLS_FOR_LIST = TOOLS.map((tool) => ({
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
const TOOL_BY_NAME = new Map(TOOLS_FOR_LIST.map((tool) => [tool.name, tool]));

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS_FOR_LIST }));

// ── 도구 핸들러 ───────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  try {
    const args = normalizeToolArguments(request.params.arguments, name);
    switch (name) {
      case 'list_concepts':
        return ok(listConcepts(args));
      case 'get_concept':
        return ok(getConcept(args));
      case 'get_concepts':
        return ok(getConceptsBatch(args));
      case 'find_evidence':
        return ok(findEvidence(args));
      case 'add_concept':
        return ok(addConcept(args));
      case 'add_concepts':
        return ok(addConceptsBatch(args));
      case 'add_relation':
        return ok(addRelation(args));
      case 'add_relations':
        return ok(addRelationsBatch(args));
      case 'patch_concept':
        return ok(patchConcept(args));
      case 'find_backlinks':
        return ok(findBacklinksTool(args));
      case 'find_neighbors':
        return ok(findNeighborsTool(args));
      case 'find_path':
        return ok(findPathTool(args));
      case 'list_kinds':
        return ok(listKindsTool());
      case 'find_orphans':
        return ok(findOrphansTool(args));
      case 'query_concepts':
        return ok(queryConceptsTool(args));
      case 'compile_ontology':
        return ok(compileOntologyTool(args));
      case 'query_ontology':
        return ok(queryOntologyTool(args));
      case 'validate_vault':
        return ok(validateVaultTool(args));
      case 'analyze_repo_structure':
        return ok(analyzeRepoStructureTool(args));
      case 'infer_imports':
        return ok(inferImportsTool(args));
      case 'index_project':
        return ok(indexProjectTool(args));
      case 'rename_concept':
        return ok(renameConcept(args));
      case 'merge_concepts':
        return ok(mergeConcepts(args));
      case 'delete_concept':
        return ok(deleteConcept(args));
      default:
        throw new Error(formatUnknownToolError(name));
    }
  } catch (err) {
    return error(err);
  }
});

function formatUnknownToolError(name) {
  const allowedNames = [...TOOL_BY_NAME.keys()].sort();
  const suggestion = closestAllowedValue(name, allowedNames);
  const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : '';
  return `Unknown tool: ${name}.${suggestionText} Allowed tools: ${allowedNames.join(', ')}.`;
}

function ok(result) {
  const response = {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    response.structuredContent = result;
  }
  return response;
}

function error(err) {
  const message = err instanceof Error ? err.message : String(err);
  const details = structuredErrorDetails(message);
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
    structuredContent: {
      ok: false,
      errorCode: classifyErrorCode(err, message),
      error: message,
      ...details,
    },
  };
}

function structuredErrorDetails(message) {
  const unknownTool = message.match(/^Unknown tool: ([^.]+)\.(?: Did you mean "([^"]+)"\?)? Allowed tools: (.+)\.$/i);
  if (unknownTool) {
    const [, receivedTool, suggestion, allowedText] = unknownTool;
    return omitUndefined({
      receivedTool,
      suggestion,
      allowedTools: splitCommaList(allowedText),
    });
  }

  const unknownArgument = message.match(
    /^Unknown argument "([^"]+)" for ([^.]+)\.(?: Did you mean "([^"]+)"\?)? Allowed arguments: (.+)\. Received arguments: (.+)\.$/i,
  );
  if (unknownArgument) {
    const [, receivedArgument, toolName, suggestion, allowedText, receivedText] = unknownArgument;
    return omitUndefined({
      toolName,
      receivedArgument,
      suggestion,
      unknownArguments: [omitUndefined({ name: receivedArgument, suggestion })],
      allowedArguments: splitCommaList(allowedText),
      receivedArguments: splitCommaList(receivedText),
    });
  }

  const unknownArguments = message.match(
    /^Unknown arguments for ([^:]+): (.+)\. Allowed arguments: (.+)\. Received arguments: (.+)\.$/i,
  );
  if (unknownArguments) {
    const [, toolName, unknownText, allowedText, receivedText] = unknownArguments;
    return {
      toolName,
      receivedArguments: splitCommaList(receivedText),
      unknownArguments: extractUnknownArgumentHints(unknownText),
      allowedArguments: splitCommaList(allowedText),
    };
  }

  const unknownField = message.match(
    /^Unknown field "([^"]+)" in ([^.]+)\.(?: Did you mean "([^"]+)"\?)? Allowed fields: (.+)\. Received fields: (.+)\.$/i,
  );
  if (unknownField) {
    const [, receivedField, rowName, suggestion, allowedText, receivedText] = unknownField;
    return omitUndefined({
      rowName,
      receivedField,
      suggestion,
      unknownFields: [omitUndefined({ name: receivedField, suggestion })],
      allowedFields: splitCommaList(allowedText),
      receivedFields: splitCommaList(receivedText),
    });
  }

  const unknownFields = message.match(
    /^Unknown fields in ([^:]+): (.+)\. Allowed fields: (.+)\. Received fields: (.+)\.$/i,
  );
  if (unknownFields) {
    const [, rowName, unknownText, allowedText, receivedText] = unknownFields;
    return {
      rowName,
      unknownFields: extractUnknownArgumentHints(unknownText),
      allowedFields: splitCommaList(allowedText),
      receivedFields: splitCommaList(receivedText),
    };
  }

  const allowedValue = message.match(/^(.+?) must be one of: (.+)\. Received: (.+)\.(?: Did you mean "([^"]+)"\?)?$/i);
  if (allowedValue) {
    const [, valueName, allowedText, receivedText, suggestion] = allowedValue;
    return omitUndefined({
      valueName,
      receivedValue: parseReceivedValueText(receivedText),
      suggestion,
      allowedValues: splitCommaList(allowedText),
    });
  }

  const missingSlug = message.match(
    /^(.+?): "([^"]+)"\. Use list_concepts\(\) to see all slugs, or find_evidence\(query\) to search by title\.(?: If the endpoint is real but absent, create it first with add_concept\(slug, kind, title\)\.)?(?: Similar slugs in this vault: (.+)\.)?$/i,
  );
  if (missingSlug) {
    const [, subject, slug, similarText] = missingSlug;
    const hasCreateHint = /add_concept\(slug, kind, title\)/.test(message);
    return omitUndefined({
      missingSubject: subject,
      missingSlug: slug,
      recoveryTools: ['list_concepts', 'find_evidence'],
      createTool: hasCreateHint ? 'add_concept' : undefined,
      similarSlugs: similarText ? extractQuotedList(similarText) : [],
    });
  }

  const existingDoc = message.match(
    /^Doc already exists at "([^"]+)"\. To update fields, use patch_concept\(slug, frontmatter, body, expected_mtime\)\. To rename, use rename_concept\(oldSlug, newSlug\)\. Never delete-then-add/i,
  );
  if (existingDoc) {
    return {
      conflictSubject: 'Doc already exists',
      conflictSlug: existingDoc[1],
      recoveryTools: ['patch_concept', 'rename_concept'],
      avoidTools: ['delete_concept'],
    };
  }

  const existingTarget = message.match(
    /^Target slug already exists: "([^"]+)"\. Pass overwrite: true to replace it\.$/i,
  );
  if (existingTarget) {
    return {
      conflictSubject: 'Target slug already exists',
      conflictSlug: existingTarget[1],
      recoveryTools: ['rename_concept'],
      overwriteOption: 'overwrite',
    };
  }

  return {};
}

function structuredRowErrorDetails(err, message) {
  return {
    errorCode: classifyErrorCode(err, message),
    ...structuredErrorDetails(message),
  };
}

function extractUnknownArgumentHints(text) {
  return [...text.matchAll(/"([^"]+)"(?: \(did you mean "([^"]+)"\?\))?/g)].map((match) => omitUndefined({
    name: match[1],
    suggestion: match[2],
  }));
}

function splitCommaList(text) {
  if (text === 'no arguments' || text === 'none') return [];
  return String(text)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractQuotedList(text) {
  return [...String(text).matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function parseReceivedValueText(text) {
  const value = String(text).trim();
  const quoted = value.match(/^"([\s\S]*)"$/);
  return quoted ? quoted[1] : value;
}

function omitUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function classifyErrorCode(err, message) {
  if (err instanceof VaultConflictError || err?.code === 'VAULT_CONFLICT') {
    return 'vault_conflict';
  }
  if (/^Unknown tool:/i.test(message)) return 'unknown_tool';
  if (/^Unknown argument /i.test(message) || /^Unknown arguments for /i.test(message)) {
    return 'unknown_argument';
  }
  if (/^Unknown field /i.test(message) || /^Unknown fields in /i.test(message)) {
    return 'invalid_arguments';
  }
  if (/not found|does not exist/i.test(message)) return 'not_found';
  if (/already exists|conflict|identical/i.test(message)) return 'conflict';
  if (/must be|must not|cannot be|At least one|Invalid value|Received:|points outside|Too many/i.test(message)) {
    return 'invalid_arguments';
  }
  return 'tool_error';
}

// ── 도구 구현 ─────────────────────────────────────────────────────────────

function normalizeToolArguments(args, toolName) {
  if (args === undefined) return {};
  if (args === null || Array.isArray(args) || typeof args !== 'object') {
    throw new Error('tool arguments must be an object.');
  }
  const tool = TOOL_BY_NAME.get(toolName);
  if (tool) {
    const allowed = new Set(Object.keys(tool.inputSchema?.properties ?? {}));
    const unknown = Object.keys(args).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
      const allowedNames = [...allowed].sort();
      const allowedText = allowedNames.length > 0 ? allowedNames.join(', ') : 'no arguments';
      const receivedNames = Object.keys(args).sort();
      const receivedText = receivedNames.length > 0 ? receivedNames.join(', ') : 'none';
      if (unknown.length === 1) {
        const [key] = unknown;
        const suggestion = closestAllowedValue(key, allowedNames);
        const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : '';
        throw new Error(
          `Unknown argument "${key}" for ${toolName}.${suggestionText} Allowed arguments: ${allowedText}. Received arguments: ${receivedText}.`,
        );
      }
      const unknownText = unknown
        .map((key) => {
          const suggestion = closestAllowedValue(key, allowedNames);
          return suggestion ? `"${key}" (did you mean "${suggestion}"?)` : `"${key}"`;
        })
        .join(', ');
      throw new Error(
        `Unknown arguments for ${toolName}: ${unknownText}. Allowed arguments: ${allowedText}. Received arguments: ${receivedText}.`,
      );
    }
  }
  return args;
}

function requireOptionalNonNegativeNumber(value, name) {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number.`);
  }
}

function requireOptionalNonNegativeInteger(value, name, options = {}) {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`${name} must be <= ${options.max}.`);
  }
}

function requireOptionalPositiveInteger(value, name, options = {}) {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`${name} must be <= ${options.max}.`);
  }
}

function requireOptionalDirection(value, name, allowed) {
  if (value === undefined) return;
  if (!allowed.includes(value)) {
    throw new Error(formatAllowedValueError(name, value, allowed));
  }
}

function requireOptionalEnum(value, name, allowed) {
  if (value === undefined) return;
  if (!allowed.includes(value)) {
    throw new Error(formatAllowedValueError(name, value, allowed));
  }
}

function requireOptionalBoolean(value, name) {
  if (value === undefined) return;
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be a boolean.`);
  }
}

function listConcepts({ kind, domain, since, summary, limit = 100 }) {
  requireOptionalNonBlankString(kind, 'kind');
  requireOptionalEnum(kind, 'kind', NODE_KIND_VALUES);
  requireOptionalNonBlankString(domain, 'domain');
  requireOptionalNonNegativeNumber(since, 'since');
  requireOptionalBoolean(summary, 'summary');
  requireOptionalPositiveInteger(limit, 'limit', { max: 500 });
  const docs = loadVaultDocs(VAULT_ROOT);

  // R11 #23 — vault-wide validation 카운트. raw 모두 검증해 silent corruption
  // 가시화. AI agent 가 vault 상태를 한 번에 인지 가능 (UI banner #14 의 짝).
  let errorCount = 0;
  let warningCount = 0;
  for (const doc of docs) {
    if (!doc.raw) continue;
    const report = validateVaultDocument(doc.raw);
    for (const issue of report.issues) {
      if (issue.severity === 'error') errorCount += 1;
      else warningCount += 1;
    }
  }
  for (const issues of groupDanglingIssuesBySlug(docs).values()) {
    for (const issue of issues) {
      if (issue.severity === 'error') errorCount += 1;
      else warningCount += 1;
    }
  }

  // R+ — `since` (ms) 가 number 면 mtime > since 만 통과. AI agent 의 incremental
  // sync 시나리오: 이전 list 응답에서 최대 mtime 을 캡처 → 다음 호출에 since 로
  // 패스 → vault 의 *바뀐 것만* 전송. 같은 mtime 은 strict 으로 제외 (max 를
  // 재전송해도 double-fetch 안 됨).
  const sinceMs = typeof since === 'number' && Number.isFinite(since) ? since : null;
  const filtered = docs.filter((doc) => {
    const docKind = doc.frontmatter.kind;
    if (kind && docKind !== kind) return false;
    if (!docKind) return false; // frontmatter `kind:` 가 있어야 ontology 노드.
    // domain 필터 — frontmatter `domain:` 매칭. "auth 도메인 모든 capability"
    // 처럼 흔한 query 를 query_concepts DSL 없이 한 호출로. 모든 kind 에 일관
    // 적용 — 매칭 없으면 자연스럽게 빈 결과.
    if (domain && doc.frontmatter.domain !== domain) return false;
    if (sinceMs !== null && (typeof doc.mtime !== 'number' || doc.mtime <= sinceMs)) return false;
    return true;
  });
  return {
    total: filtered.length,
    vaultRoot: VAULT_ROOT,
    nodes: filtered.slice(0, limit).map((doc) => ({
      slug: doc.slug,
      kind: doc.frontmatter.kind,
      title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
      domain: doc.frontmatter.domain,
      capabilities: doc.frontmatter.capabilities,
      elements: doc.frontmatter.elements,
      // R+ — per-node mtime (ms). agent 가 list 응답만으로 "어느 노드가 최근에
      // 변경됐나" 파악 가능. get_concept 의 mtime field 와 일관 — 같은 의미.
      // sort 가능 + 외부 변경 감지에도 활용.
      mtime: doc.mtime,
      // R+ — opt-in summary. agent 가 list 한 호출로 "각 노드 무슨 내용인가?"
      // 파악 가능. 200자 cap 으로 페이로드 부풀림 방지 (find_evidence 와 동일).
      // 호출자가 summary:true 명시 안 하면 비활성 (기존 동작 보존).
      ...(summary === true
        ? { summary: extractSummaryExcerpt(doc.body, 200) }
        : {}),
    })),
    vaultWarnings:
      errorCount + warningCount > 0
        ? { errorCount, warningCount }
        : undefined,
  };
}

function getConcept({ slug }, context = {}) {
  requireNonBlankString(slug, 'slug');
  const canonicalSlug = resolveExistingVaultSlug(slug, context.docs);
  if (!canonicalSlug) {
    throw new Error(`Doc not found: ${slug}`);
  }
  let doc;
  try {
    doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, canonicalSlug));
  } catch (err) {
    // ENOENT 등 fs 오류는 사용자 친화 메시지로 surface — 절대 경로 leak 회피
    // (Panel E audit 2026-05-02 finding).
    if (err && (err.code === 'ENOENT' || /no such file/i.test(err.message))) {
      throw new Error(`Doc not found: ${slug}`);
    }
    throw err;
  }
  // R11 #23 — 이 doc 의 frontmatter corruption 검출. AI agent 가 응답에서
  // warnings 보고 사용자에게 안내 / vault:validate 권장 가능.
  const validation = doc.raw ? validateVaultDocument(doc.raw) : null;
  const warnings = validation ? [...validation.issues] : [];
  const danglingIssuesBySlug =
    context.danglingIssuesBySlug ??
    groupDanglingIssuesBySlug(context.docs ?? loadVaultDocs(VAULT_ROOT));
  warnings.push(...(danglingIssuesBySlug.get(doc.slug) ?? []));
  const outgoingEdges = collectNeighborRefs(doc).map(({ key, ref }) => ({
    to: ref,
    via: key,
  }));
  return {
    slug: doc.slug,
    frontmatter: doc.frontmatter,
    excerpt: extractSummaryExcerpt(doc.body),
    neighbors: {
      domains: doc.frontmatter.domains || [],
      domain: doc.frontmatter.domain || null,
      capabilities: doc.frontmatter.capabilities || [],
      elements: doc.frontmatter.elements || [],
      dependencies: doc.frontmatter.dependencies || [],
      relates: doc.frontmatter.relates || [],
      contains: doc.frontmatter.contains || [],
      describes: doc.frontmatter.describes || [],
    },
    outgoingEdges,
    // R11 #8 — read-modify-write 흐름에서 caller (AI agent) 가 후속
    // patch_concept / delete_concept 의 expected_mtime 으로 그대로 넘겨
    // 외부 변경 감지 가능. ms 단위 fs mtime.
    mtime: doc.mtime,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// R+ — get_concept 의 batch 변종. 입력 slugs[] 순서를 보존하고 missing slug 는
// 배치를 abort 하지 않고 { ok: false, error } 행으로 surface — agent 가
// partial result 받아 핸들링 (예: list_concepts 결과를 재검증 없이 그대로
// 사용하다 stale slug 한두 개 있어도 배치 전체가 죽지 않음). 50 cap 은
// payload 폭주 방지 (vault 가 더 큰 경우 청크 분할).
function getConceptsBatch({ slugs }) {
  if (!Array.isArray(slugs)) {
    throw new Error('slugs must be an array of strings');
  }
  if (slugs.length === 0) {
    return { concepts: [] };
  }
  if (slugs.length > 50) {
    throw new Error(
      `Too many slugs: ${slugs.length}. Max 50 per call — split into multiple get_concepts batches.`
    );
  }
  const docs = loadVaultDocs(VAULT_ROOT);
  const danglingIssuesBySlug = groupDanglingIssuesBySlug(docs);
  const concepts = slugs.map((slug) => {
    try {
      requireNonBlankString(slug, 'slug');
      const result = getConcept({ slug }, { docs, danglingIssuesBySlug });
      return { ok: true, ...result };
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      // Doc not found 같은 친화 메시지를 그대로 surface — 절대 경로 leak 방지.
      return { slug, ok: false, error: msg };
    }
  });
  return { concepts };
}

function findEvidence({ title, limit } = {}) {
  requireNonBlankString(title, 'title');
  requireOptionalPositiveInteger(limit, 'limit', { max: 500 });
  const docs = loadVaultDocs(VAULT_ROOT);
  const matches = [];
  for (const doc of docs) {
    const docTitle = String(doc.frontmatter.title || doc.frontmatter.name || '');
    // capabilities/elements joined with \n so a needle can't false-match across
    // the field boundary — keeps inclusion identical to the prior per-field sweep.
    const frontmatterHaystack = `${String(doc.frontmatter.capabilities ?? '')}\n${String(doc.frontmatter.elements ?? '')}`;
    // Atlas Track A #4 — relevance score (title > frontmatter ref > body + title
    // token-overlap). Inclusion unchanged: score>0 ⟺ a substring matched.
    const { score, matchedIn } = scoreEvidence(title, {
      title: docTitle,
      frontmatterHaystack,
      body: doc.body,
    });
    if (score <= 0) continue;
    matches.push({
      slug: doc.slug,
      kind: doc.frontmatter.kind,
      title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
      // R+ — list_concepts / find_backlinks / find_orphans / query_concepts
      // 와 동일 shape. read tool 5종 응답 일관성 — agent 가 어느 read tool
      // 결과든 같은 sort/filter 로직 재사용.
      domain: doc.frontmatter.domain,
      mtime: doc.mtime,
      matchedIn,
      score,
      // R+ — 매치된 doc 의 prose 한 줄 요약 (max 200 chars). agent 가 매치를
      // 받자마자 "이 doc 이 무슨 내용인가?" 추가 get_concept 없이 파악.
      // get_concept 의 800자 helper 와 같은 prose-aware 추출 + 더 짧은 cap.
      excerpt: extractSummaryExcerpt(doc.body, 200),
    });
  }
  // Best match first: score desc, then slug asc for deterministic ties.
  matches.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  const limited = typeof limit === 'number' ? matches.slice(0, limit) : matches;
  return { query: title, matches: limited };
}

const ADD_CONCEPT_KINDS = new Set(['project', 'domain', 'capability', 'element', 'document']);
const GRAPH_ARRAY_KEY_SET = new Set(GRAPH_ARRAY_KEYS);

function requireNonBlankString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string.`);
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must not have leading or trailing whitespace.`);
  }
  if (value.includes('\0')) {
    throw new Error(`${name} must not contain a null byte.`);
  }
  return value;
}

function requireOptionalNonBlankString(value, name) {
  if (value === undefined) return;
  requireNonBlankString(value, name);
}

function requireOptionalStringArray(value, name, options = {}) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array of strings.`);
  }
  if (options.max !== undefined && value.length > options.max) {
    throw new Error(`${name} must contain at most ${options.max} items.`);
  }
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new Error(`${name} must be an array of strings.`);
    }
    if (item.trim() === '') {
      throw new Error(`${name} items must be non-empty strings.`);
    }
    if (item !== item.trim()) {
      throw new Error(`${name} items must not have leading or trailing whitespace.`);
    }
    if (item.includes('\0')) {
      throw new Error(`${name} items must not contain a null byte.`);
    }
  }
}

function requireOptionalRelationTypeArray(value, name) {
  requireOptionalStringArray(value, name, { max: RELATION_TYPE_VALUES.length });
  if (value === undefined) return;
  for (const item of value) {
    if (!RELATION_TYPE_VALUES.includes(item)) {
      throw new Error(formatAllowedValueError(`${name} items`, item, RELATION_TYPE_VALUES));
    }
  }
}

function requireOptionalNodeKindArray(value, name) {
  requireOptionalStringArray(value, name, { max: NODE_KIND_VALUES.length });
  if (value === undefined) return;
  for (const item of value) {
    if (!NODE_KIND_VALUES.includes(item)) {
      throw new Error(formatAllowedValueError(`${name} items`, item, NODE_KIND_VALUES));
    }
  }
}

function requireOptionalPlainObject(value, name) {
  if (value === undefined) return;
  requirePlainObject(value, name);
}

function requirePlainObject(value, name) {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${name} must be an object.`);
  }
}

function requireAllowedObjectKeys(value, name, allowedKeys) {
  const allowed = new Set(allowedKeys);
  const receivedFields = Object.keys(value).sort();
  const receivedText = receivedFields.length > 0 ? receivedFields.join(', ') : 'none';
  const unknownFields = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknownFields.length === 0) return;
  if (unknownFields.length === 1) {
    const [key] = unknownFields;
    const suggestion = closestAllowedObjectField(key, allowedKeys);
    const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : '';
    throw new Error(
      `Unknown field "${key}" in ${name}.${suggestionText} Allowed fields: ${allowedKeys.join(', ')}. Received fields: ${receivedText}.`,
    );
  }
  const unknownText = unknownFields
    .map((key) => {
      const suggestion = closestAllowedObjectField(key, allowedKeys);
      return suggestion ? `"${key}" (did you mean "${suggestion}"?)` : `"${key}"`;
    })
    .join(', ');
  throw new Error(
    `Unknown fields in ${name}: ${unknownText}. Allowed fields: ${allowedKeys.join(', ')}. Received fields: ${receivedText}.`,
  );
}

function closestAllowedObjectField(key, allowedKeys) {
  if (key === 'relation' && allowedKeys.includes('type')) return 'type';
  return closestAllowedValue(key, allowedKeys);
}

function requireValidFrontmatterPatch(frontmatter) {
  if (frontmatter === undefined) return;
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!GRAPH_ARRAY_KEY_SET.has(key) || value === null || value === undefined) {
      continue;
    }
    requireOptionalStringArray(value, `frontmatter.${key}`, { max: GRAPH_REF_ARRAY_MAX_ITEMS });
  }
  if (Object.prototype.hasOwnProperty.call(frontmatter, 'kind')) {
    const kind = frontmatter.kind;
    if (kind === null) {
      throw new Error('kind cannot be deleted from a vault node — pass a valid kind instead.');
    }
    requireNonBlankString(kind, 'frontmatter.kind');
    if (!ADD_CONCEPT_KINDS.has(kind)) {
      throw new Error(
        `frontmatter.kind must be one of: ${[...ADD_CONCEPT_KINDS].join(', ')}.`,
      );
    }
  }
  for (const key of ['domain', 'slug']) {
    if (!Object.prototype.hasOwnProperty.call(frontmatter, key)) continue;
    const value = frontmatter[key];
    if (value === null || value === undefined) continue;
    requireNonBlankString(value, `frontmatter.${key}`);
  }
}

function addConcept({ slug, kind, title, domain, capabilities, elements, body }, options = {}) {
  requireNonBlankString(slug, 'slug');
  requireNonBlankString(kind, 'kind');
  requireNonBlankString(title, 'title');
  if (domain !== undefined) requireNonBlankString(domain, 'domain');
  requireOptionalStringArray(capabilities, 'capabilities', { max: GRAPH_REF_ARRAY_MAX_ITEMS });
  requireOptionalStringArray(elements, 'elements', { max: GRAPH_REF_ARRAY_MAX_ITEMS });
  if (body !== undefined && typeof body !== 'string') {
    throw new Error('body must be a string.');
  }
  // 공백-only title 도 silent pollution 위험. UI 의 isUntitledTitle 가
  // 같은 가드를 한다 — MCP 도 parity 유지.
  if (!isValidVaultTitle(title)) {
    throw new Error('title must be a non-empty string.');
  }
  if (!ADD_CONCEPT_KINDS.has(kind)) {
    throw new Error(formatAllowedValueError('kind', kind, [...ADD_CONCEPT_KINDS]));
  }
  // R14 — schema 가 kind 별 양식 (project: domains/capabilities/elements 빈
  // 배열, capability: elements 빈 배열, …) 을 채워 호출자가 부분 정보만 줘도
  // 일관된 frontmatter 가 디스크에 남도록. CLI add 와 같은 schema 모듈을
  // 공유 (contract test 가 drift 차단).
  const fm = buildFrontmatter({
    slug,
    kind,
    title,
    domain,
    capabilities,
    elements,
  });
  // 성장하는 vault 의 #1 실패 모드(중복 노드) 안전망 — write *전* 기존 노드를
  // 훑어 같은 title 이 있으면 advisory 경고. write 를 막지 않는다. batch
  // (includePostWriteMaintenance === false, /ontology-bootstrap 처럼 사용자가
  // 후보를 이미 검수한 흐름)에서는 per-node full vault load 비용을 피하려 skip.
  const duplicateWarning =
    options.includePostWriteMaintenance === false
      ? null
      : detectDuplicateTitle(title, slug, loadVaultDocs(VAULT_ROOT));
  const filePath = writeDoc(VAULT_ROOT, slug, {
    frontmatter: fm,
    body: body === undefined ? defaultBody(kind, title) : body,
  });
  // schema 의 requiredExtras 누락 검사 → 응답에 advisory 로 포함.
  // throw 하지 않음 — agent 흐름 자연스럽게, 사용자가 후속 patch_concept 로
  // 보완 가능. (capability/element 의 domain 누락 등이 흔한 케이스)
  const missing = missingExpectedFields(kind, fm);
  const warnings = [
    ...missing.map((k) => `expected field "${k}" missing for kind "${kind}"`),
    ...(duplicateWarning ? [duplicateWarning] : []),
  ];
  return {
    ok: true,
    slug,
    filePath,
    changed: true,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(options.includePostWriteMaintenance === false
      ? {}
      : { postWriteMaintenance: compactPostWriteMaintenance() }),
  };
}

// R+ — add_concept 의 batch 변종. /ontology-bootstrap 흐름이 5~15 노드를
// 단번에 land 할 때 K round-trip → 1. 입력 순서 보존. 각 row 는 독립적으로
// 처리되어 한 row 의 실패 (existing slug / invalid kind / missing required)
// 가 나머지를 abort 하지 않음 — 그 row 만 ok:false 로 surface. atomic
// rollback 없음 (필요하면 single add_concept 직렬 호출).
function addConceptsBatch({ concepts }) {
  if (!Array.isArray(concepts)) {
    throw new Error('concepts must be an array of concept specs');
  }
  if (concepts.length === 0) {
    return { concepts: [] };
  }
  if (concepts.length > 50) {
    throw new Error(
      `Too many concepts: ${concepts.length}. Max 50 per call — split into multiple add_concepts batches.`
    );
  }
  // 입력 내 중복 slug 사전 감지 — 두번째 row 가 "이미 존재" 로 fail 하는
  // 혼동을 줄임. 같은 slug 의 첫 row 만 land 시도, 후속 동일 slug 는 input
  // 단계에서 ok:false.
  const seenInBatch = new Map();
  // 이 batch 안에서 이미 land 한 행들({slug, frontmatter}) — 같은 title 의
  // 후속 행을 near-duplicate 로 잡는 in-memory 비교 대상(vault load 0).
  const landed = [];
  const results = concepts.map((spec, index) => {
    let slug = '';
    try {
      requirePlainObject(spec, `concepts[${index}]`);
      slug = typeof spec.slug === 'string' ? spec.slug : '';
      requireAllowedObjectKeys(spec, `concepts[${index}]`, [
        'slug',
        'kind',
        'title',
        'domain',
        'capabilities',
        'elements',
        'body',
      ]);
      if (slug && seenInBatch.has(slug)) {
        const firstSeenAt = `concepts[${seenInBatch.get(slug)}]`;
        return {
          slug,
          ok: false,
          error: `concepts[${index}] duplicate slug in input batch; first seen at ${firstSeenAt}`,
          errorCode: 'conflict',
          rowName: `concepts[${index}]`,
          conflictSubject: 'Duplicate slug in input batch',
          conflictSlug: slug,
          firstSeenAt,
        };
      }
      if (slug) seenInBatch.set(slug, index);
      const result = addConcept(spec, { includePostWriteMaintenance: false });
      // 같은 batch 안에서 이미 land 한 노드와 정규화 title 이 같으면 advisory
      // 경고(막지 않음 — 합당할 수도 있으니). bootstrap 의 #1 실패 모드(같은
      // 개념을 두 노드로 쪼갬)를 vault load 없이 in-batch 비교로 차단. single
      // add_concept 의 vs-existing dup 검사(iter R+)와 같은 helper 재사용.
      if (result.ok) {
        const dupWarning = detectDuplicateTitle(spec.title, result.slug ?? slug, landed);
        if (dupWarning) result.warnings = [...(result.warnings ?? []), dupWarning];
        landed.push({
          slug: result.slug ?? slug,
          frontmatter: { title: spec.title, kind: spec.kind },
        });
      }
      return result;
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      return {
        slug: slug || String(slug),
        ok: false,
        error: msg,
        ...structuredRowErrorDetails(err, msg),
      };
    }
  });
  return {
    concepts: results,
    postWriteMaintenance: results.some((row) => row.ok && row.changed !== false)
      ? compactPostWriteMaintenance()
      : undefined,
  };
}

const RELATION_KEY = {
  depends_on: 'dependencies',
  relates: 'relates',
  contains: 'contains',
  describes: 'describes',
  domains: 'domains',
  capabilities: 'capabilities',
  elements: 'elements',
  domain: 'domain',
};
const RELATION_TYPES = WRITE_RELATION_TYPE_VALUES;

function addRelation({ from, to, type, expected_mtime }, options = {}) {
  requireNonBlankString(from, 'from');
  requireNonBlankString(to, 'to');
  requireNonBlankString(type, 'type');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  const key = RELATION_KEY[type];
  if (!key) {
    throw new Error(formatAllowedValueError('type', type, RELATION_TYPES));
  }
  const canonicalFrom = resolveExistingVaultSlug(from);
  const canonicalTo = resolveExistingVaultSlug(to);
  // vault 에 실재하는 slug 인지 양쪽 검증. 누락 시 frontmatter array 에
  // dangling reference 가 silently 추가되는 걸 차단 (AI agent 가 typo /
  // hallucinated slug 보낼 때 깔끔한 에러로 노출). direct slug 뿐 아니라
  // read/path 와 같은 tail/frontmatter slug alias 도 canonical slug 로 저장.
  if (!canonicalFrom) {
    throw new Error(missingSlugMessage('Source slug does not exist in vault', from, {
      createHint: true,
    }));
  }
  if (!canonicalTo) {
    throw new Error(missingSlugMessage('Target slug does not exist in vault', to, {
      createHint: true,
    }));
  }
  const doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, canonicalFrom));
  if (key === 'domain') {
    const existingDomain = doc.frontmatter.domain;
    if (existingDomain === canonicalTo) {
      return { ok: true, alreadyExists: true, changed: false, from: canonicalFrom, to: canonicalTo, type };
    }
    if (typeof existingDomain === 'string' && existingDomain.trim()) {
      throw new Error(`Source slug already has domain "${existingDomain}". Use patch_concept to change it explicitly.`);
    }
    patchFrontmatter(VAULT_ROOT, canonicalFrom, { domain: canonicalTo }, {
      expectedMtime:
        typeof expected_mtime === 'number' ? expected_mtime : undefined,
    });
    return {
      ok: true,
      changed: true,
      from: canonicalFrom,
      to: canonicalTo,
      type,
      key,
      ...(options.includePostWriteMaintenance === false
        ? {}
        : { postWriteMaintenance: compactPostWriteMaintenance() }),
    };
  }
  const existing = Array.isArray(doc.frontmatter[key]) ? doc.frontmatter[key] : [];
  if (existing.includes(canonicalTo)) {
    return { ok: true, alreadyExists: true, changed: false, from: canonicalFrom, to: canonicalTo, type };
  }
  const next = normalizeRelationRefs([...existing, canonicalTo]);
  patchFrontmatter(VAULT_ROOT, canonicalFrom, { [key]: next }, {
    expectedMtime:
      typeof expected_mtime === 'number' ? expected_mtime : undefined,
  });
  return {
    ok: true,
    changed: true,
    from: canonicalFrom,
    to: canonicalTo,
    type,
    key,
    ...(options.includePostWriteMaintenance === false
      ? {}
      : { postWriteMaintenance: compactPostWriteMaintenance() }),
  };
}

function resolveExistingVaultSlug(slug, docs = null) {
  if (typeof slug !== 'string' || slug.trim() === '') return null;
  if (vaultSlugExists(VAULT_ROOT, slug)) return slug;
  const vaultDocs = docs ?? loadVaultDocs(VAULT_ROOT);
  const tailMatches = [];
  const frontmatterMatches = [];
  for (const doc of vaultDocs) {
    const tail = doc.slug.split('/').pop();
    if (tail === slug) tailMatches.push(doc.slug);
    const fmSlug = doc.frontmatter.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim() === slug) {
      frontmatterMatches.push(doc.slug);
    }
  }
  if (frontmatterMatches.length > 1) {
    throw new Error(
      `Ambiguous frontmatter slug alias "${slug}" matches: ${frontmatterMatches.join(', ')}. Use an exact vault-relative slug.`
    );
  }
  if (frontmatterMatches.length === 1) return frontmatterMatches[0];
  if (tailMatches.length > 1) {
    throw new Error(
      `Ambiguous tail slug alias "${slug}" matches: ${tailMatches.join(', ')}. Use an exact vault-relative slug.`
    );
  }
  if (tailMatches.length === 1) return tailMatches[0];
  return null;
}

// R+ — add_relation 의 batch 변종. analyze_repo_structure (suggestedRelations)
// / infer_imports (moduleEdges) 의 출력을 한 호출에 land. 각 row 는
// addRelation 으로 직렬 호출 — 같은 from 슬러그가 여러 row 에 등장해도
// readDoc 이 매번 디스크를 다시 읽어 누락 없이 누적 됨 (단, expected_mtime
// 을 같이 넘기면 첫 row 후 stale 이라 fail — tool description 에 명시).
// 입력 순서 보존, partial result, atomic rollback 없음.
function addRelationsBatch({ relations }) {
  if (!Array.isArray(relations)) {
    throw new Error('relations must be an array of relation specs');
  }
  if (relations.length === 0) {
    return { relations: [] };
  }
  if (relations.length > 50) {
    throw new Error(
      `Too many relations: ${relations.length}. Max 50 per call — split into multiple add_relations batches.`
    );
  }
  const results = relations.map((spec, index) => {
    let from = '';
    let to = '';
    let type = '';
    try {
      requirePlainObject(spec, `relations[${index}]`);
      from = typeof spec.from === 'string' ? spec.from : '';
      to = typeof spec.to === 'string' ? spec.to : '';
      type = typeof spec.type === 'string' ? spec.type : '';
      requireAllowedObjectKeys(spec, `relations[${index}]`, [
        'from',
        'to',
        'type',
        'expected_mtime',
      ]);
      return addRelation(spec, { includePostWriteMaintenance: false });
    } catch (err) {
      const rawMessage = err && err.message ? err.message : String(err);
      const rowLabel = `relations[${index}]`;
      const msg = rawMessage.includes(rowLabel) ? rawMessage : `${rowLabel} ${rawMessage}`;
      return {
        ok: false,
        from,
        to,
        type,
        error: msg,
        ...structuredRowErrorDetails(err, rawMessage),
      };
    }
  });
  return {
    relations: results,
    postWriteMaintenance: results.some((row) => row.ok && row.changed !== false)
      ? compactPostWriteMaintenance()
      : undefined,
  };
}

function patchConcept({ slug, frontmatter, body, expected_mtime }) {
  requireNonBlankString(slug, 'slug');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  if (frontmatter === undefined && body === undefined) {
    throw new Error('At least one of `frontmatter` or `body` is required.');
  }
  requireOptionalPlainObject(frontmatter, 'frontmatter');
  requireValidFrontmatterPatch(frontmatter);
  if (body !== undefined && typeof body !== 'string') {
    throw new Error('body must be a string.');
  }
  // title 을 포함한 patch 라면 비-빈 문자열 강제. UI 의 renameVaultDoc 은
  // blank reject 하는데 MCP 가 무방비면 AI agent 실수로 vault 에 untitled
  // 노드가 생겨 ontology drift. null 은 키 삭제 의도라 별도 — title 자체
  // 삭제는 frontmatter 깨짐이라 막는다.
  if (frontmatter !== undefined && Object.prototype.hasOwnProperty.call(frontmatter, 'title')) {
    const t = frontmatter.title;
    if (t === null) {
      throw new Error('title cannot be deleted from a vault node — pass a new non-empty string instead.');
    }
    if (!isValidVaultTitle(t)) {
      throw new Error('title must be a non-empty string.');
    }
  }
  const filePath = updateDoc(VAULT_ROOT, slug, {
    frontmatter,
    body,
    expectedMtime: typeof expected_mtime === 'number' ? expected_mtime : undefined,
  });
  return {
    ok: true,
    slug,
    filePath,
    changed: true,
    postWriteMaintenance: compactPostWriteMaintenance(),
  };
}

function findBacklinksTool({ slug }) {
  requireNonBlankString(slug, 'slug');
  const matches = findBacklinks(VAULT_ROOT, slug);
  return { target: slug, total: matches.length, matches };
}

function findNeighborsTool({ slug, direction = 'both', types, includeNodes = true, limit = 100 }) {
  requireNonBlankString(slug, 'slug');
  requireOptionalDirection(direction, 'direction', ['outgoing', 'incoming', 'both']);
  requireOptionalRelationTypeArray(types, 'types');
  requireOptionalBoolean(includeNodes, 'includeNodes');
  requireOptionalPositiveInteger(limit, 'limit', { max: 500 });
  const docs = loadVaultDocs(VAULT_ROOT);
  const center = resolveExistingVaultSlug(slug, docs);
  if (!center) {
    throw new Error(`Doc not found: ${slug}`);
  }
  const docBySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const centerDoc = docBySlug.get(center);
  const typeSet = Array.isArray(types) && types.length > 0
    ? new Set(types.map(normalizeGraphRelationKey).filter(Boolean))
    : null;
  const edgeLimit = limit;
  const edges = [];
  const seen = new Set();
  const pushEdge = (edge) => {
    if (typeSet && !typeSet.has(edge.via)) return;
    const key = `${edge.direction}\0${edge.from}\0${edge.to}\0${edge.via}\0${edge.ref || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(edge);
  };

  if (direction === 'outgoing' || direction === 'both') {
    for (const { key, ref } of collectNeighborRefs(centerDoc)) {
      const resolved = resolveGraphRef(ref, docs);
      pushEdge({
        direction: 'outgoing',
        from: center,
        to: resolved.slug || ref,
        via: key,
        ref,
        resolved: Boolean(resolved.slug),
        ...(resolved.error ? { unresolvedReason: resolved.error } : {}),
      });
    }
  }

  if (direction === 'incoming' || direction === 'both') {
    for (const doc of docs) {
      if (doc.slug === center) continue;
      for (const { key, ref } of collectNeighborRefs(doc)) {
        const resolved = resolveGraphRef(ref, docs);
        if (resolved.slug !== center) continue;
        pushEdge({
          direction: 'incoming',
          from: doc.slug,
          to: center,
          via: key,
          ref,
          resolved: true,
        });
      }
    }
  }

  edges.sort((a, b) =>
    `${a.direction}:${a.via}:${a.from}:${a.to}`.localeCompare(
      `${b.direction}:${b.via}:${b.from}:${b.to}`,
    )
  );
  const limitedEdges = edges.slice(0, edgeLimit);
  const neighborSlugs = new Set();
  for (const edge of limitedEdges) {
    if (edge.resolved && edge.from !== center) neighborSlugs.add(edge.from);
    if (edge.resolved && edge.to !== center) neighborSlugs.add(edge.to);
  }

  return {
    center,
    requested: slug,
    direction,
    types: typeSet ? [...typeSet].sort() : undefined,
    totalEdges: edges.length,
    limited: edges.length > limitedEdges.length,
    edges: limitedEdges,
    nodes:
      includeNodes === false
        ? undefined
        : [...neighborSlugs].sort().map((neighborSlug) => summarizeDoc(docBySlug.get(neighborSlug))),
  };
}

function normalizeGraphRelationKey(type) {
  if (typeof type !== 'string') return null;
  const trimmed = type.trim();
  if (!trimmed) return null;
  return RELATION_KEY[trimmed] || trimmed;
}

function summarizeDoc(doc) {
  return {
    slug: doc.slug,
    kind: doc.frontmatter.kind,
    title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
    domain: doc.frontmatter.domain,
    mtime: doc.mtime,
  };
}

function resolveGraphRef(ref, docs) {
  try {
    return { slug: resolveExistingVaultSlug(ref, docs) };
  } catch (err) {
    return { slug: null, error: err && err.message ? err.message : String(err) };
  }
}

function findPathTool({ from, to, maxHops }) {
  requireNonBlankString(from, 'from');
  requireNonBlankString(to, 'to');
  requireOptionalNonNegativeInteger(maxHops, 'maxHops', { max: 20 });
  const result = findPath(VAULT_ROOT, from, to, maxHops ?? 5);
  if (!result) {
    return { from, to, found: false, reason: '경로 없음 (또는 maxHops 초과)' };
  }
  const docs = loadVaultDocs(VAULT_ROOT);
  const docsBySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const nodes = result.hops.map((slug) => summarizePathNode(docsBySlug.get(slug), slug));
  return { ...result, nodes, found: true, hopCount: result.hops.length - 1 };
}

function summarizePathNode(doc, slug) {
  if (!doc) {
    return { slug, kind: 'unknown', title: slug };
  }
  const frontmatter = doc.frontmatter || {};
  const summary = {
    slug: doc.slug || slug,
    kind: String(frontmatter.kind || 'document'),
    title: String(frontmatter.title || frontmatter.name || doc.slug || slug),
  };
  if (typeof frontmatter.domain === 'string') {
    summary.domain = frontmatter.domain;
  }
  return summary;
}

function listKindsTool() {
  return listKinds(VAULT_ROOT);
}

function findOrphansTool({ kind, excludeKinds } = {}) {
  requireOptionalNonBlankString(kind, 'kind');
  requireOptionalEnum(kind, 'kind', NODE_KIND_VALUES);
  requireOptionalNodeKindArray(excludeKinds, 'excludeKinds');
  return findOrphans(VAULT_ROOT, {
    kind: typeof kind === 'string' ? kind : undefined,
    excludeKinds: Array.isArray(excludeKinds) ? excludeKinds : undefined,
  });
}

function queryConceptsTool({ filter, limit }) {
  requireNonBlankString(filter, 'filter');
  requireOptionalPositiveInteger(limit, 'limit', { max: 500 });
  const parsed = parseFilter(filter);
  const cap = limit ?? 100;
  const docs = loadVaultDocs(VAULT_ROOT).filter((d) => Boolean(d.frontmatter?.kind));
  const matches = [];
  let total = 0;
  for (const doc of docs) {
    if (!parsed.match(doc)) continue;
    total += 1;
    if (matches.length < cap) {
      matches.push({
        slug: doc.slug,
        kind: doc.frontmatter.kind,
        title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
        domain: doc.frontmatter.domain,
        capabilities: doc.frontmatter.capabilities,
        elements: doc.frontmatter.elements,
        // R+ — list_concepts / find_backlinks / find_orphans 와 동일 shape.
        // agent 가 query 결과에서 staleness sort/filter 가능, 후속 호출 없이.
        mtime: doc.mtime,
      });
    }
  }
  return {
    filter,
    parsedAs: parsed.repr,
    total,
    matches,
    limited: total > matches.length,
  };
}

function compileOntologyTool({
  includeIndexes,
  summary,
  nodesLimit,
  nodesOffset,
  edgesLimit,
  edgesOffset,
} = {}) {
  requireOptionalBoolean(includeIndexes, 'includeIndexes');
  requireOptionalBoolean(summary, 'summary');
  requireOptionalPositiveInteger(nodesLimit, 'nodesLimit', { max: 500 });
  requireOptionalNonNegativeInteger(nodesOffset, 'nodesOffset');
  requireOptionalPositiveInteger(edgesLimit, 'edgesLimit', { max: 500 });
  requireOptionalNonNegativeInteger(edgesOffset, 'edgesOffset');
  const artifact = compileOntology(loadVaultDocs(VAULT_ROOT), {
    includeIndexes: includeIndexes === true,
    summary: summary === true,
    nodesLimit: typeof nodesLimit === 'number' ? nodesLimit : undefined,
    nodesOffset: typeof nodesOffset === 'number' ? nodesOffset : undefined,
    edgesLimit: typeof edgesLimit === 'number' ? edgesLimit : undefined,
    edgesOffset: typeof edgesOffset === 'number' ? edgesOffset : undefined,
  });
  // summary mode — artifact 자체가 카운트/aggregate. wrapper 의 추가 summary
  // stats 불필요 (carter 가 중복됨). 그대로 반환.
  if (summary === true) return artifact;
  return {
    ...artifact,
    summary: {
      nodes: artifact.nodeCount,
      edges: artifact.edgeCount,
      graphHash: artifact.graphHash,
      maxMtime: artifact.maxMtime,
      resolvedEdges: artifact.resolvedEdgeCount,
      externalEdges: artifact.externalEdgeCount,
      unresolvedEdges: artifact.unresolvedEdgeCount,
      aliases: artifact.aliases.length,
      ambiguousAliases: artifact.ambiguousAliases.length,
      issues: artifact.issues.length,
    },
  };
}

function queryOntologyTool(args = {}) {
  validateQueryOntologyArgs(args);
  const artifact = COMPILED_ONTOLOGY_CACHE.get({ includeIndexes: true });
  const ontologyAtlasIgnorePatterns = loadOntologyAtlasIgnore(VAULT_ROOT);
  return {
    ...queryCompiledOntology(artifact, args, { ontologyAtlasIgnorePatterns }),
    compiledSummary: {
      nodes: artifact.nodeCount,
      edges: artifact.edgeCount,
      graphHash: artifact.graphHash,
      maxMtime: artifact.maxMtime,
      resolvedEdges: artifact.resolvedEdgeCount,
      externalEdges: artifact.externalEdgeCount,
      unresolvedEdges: artifact.unresolvedEdgeCount,
      issues: artifact.issues.length,
    },
  };
}

function validateQueryOntologyArgs(args = {}) {
  requireNonBlankString(args.operation, 'operation');
  requireOptionalEnum(args.operation, 'operation', QUERY_ONTOLOGY_OPERATIONS);
  requireOptionalNonBlankString(args.targetOperation, 'targetOperation');
  requireOptionalEnum(args.targetOperation, 'targetOperation', QUERY_PLAN_TARGET_OPERATIONS);

  for (const key of [
    'slug',
    'seed',
    'candidateSlug',
    'title',
    'from',
    'project',
    'to',
    'type',
    'kind',
    'domain',
    'slugContains',
    'fromKind',
    'toKind',
    'relation',
    'afterActionId',
  ]) {
    requireOptionalNonBlankString(args[key], key);
  }
  for (const key of [
    'limit',
    'itemLimit',
    'nodeLimit',
    'componentLimit',
    'cycleLimit',
    'recommendationLimit',
    'orderLimit',
  ]) {
    requireOptionalPositiveInteger(args[key], key, { max: 500 });
  }
  requireOptionalPositiveInteger(args.iterations, 'iterations', { max: 100 });
  requireOptionalNonNegativeInteger(args.maxHops, 'maxHops', { max: 20 });
  requireOptionalNonNegativeInteger(args.depth, 'depth', { max: 20 });
  for (const key of ['minDegree', 'maxDegree', 'minInDegree', 'minOutDegree']) {
    requireOptionalNonNegativeInteger(args[key], key);
  }
  requireOptionalDirection(args.direction, 'direction', ['incoming', 'outgoing', 'both', 'undirected']);
  requireOptionalEnum(args.sort, 'sort', ['degree', 'inDegree', 'outDegree', 'slug']);
  if (args.operation === 'recommend_relations') {
    requireOptionalEnum(args.kind, 'kind', ['capability', 'element']);
  } else if (args.operation === 'match_nodes') {
    requireOptionalEnum(args.kind, 'kind', NODE_KIND_VALUES);
  }
  if (args.operation === 'match_edges') {
    requireOptionalEnum(args.fromKind, 'fromKind', NODE_KIND_VALUES);
    requireOptionalEnum(args.toKind, 'toKind', EDGE_TARGET_KIND_VALUES);
  }
  for (const key of [
    'includeExternal',
    'includeUnresolved',
    'includeIsolated',
    'includeOrphans',
    'executableOnly',
    'hasIncoming',
    'hasOutgoing',
  ]) {
    requireOptionalBoolean(args[key], key);
  }
  requireOptionalStringArray(args.types, 'types', { max: RELATION_TYPE_VALUES.length });
  requireOptionalStringArray(args.pattern, 'pattern', { max: RELATION_TYPE_VALUES.length });
  requireOptionalStringArray(args.phases, 'phases', { max: MAINTENANCE_PHASE_VALUES.length });
  requireOptionalStringArray(args.severities, 'severities', { max: MAINTENANCE_SEVERITY_VALUES.length });
  requireOptionalStringArray(args.kinds, 'kinds', { max: MAINTENANCE_KIND_VALUES.length });
  requireOptionalStringArray(args.dependencyTypes, 'dependencyTypes', { max: RELATION_TYPE_VALUES.length });
  requireOptionalStringArray(args.componentTypes, 'componentTypes', { max: RELATION_TYPE_VALUES.length });
}

function compactPostWriteMaintenance(limit = 5) {
  COMPILED_ONTOLOGY_CACHE.clear();
  const artifact = COMPILED_ONTOLOGY_CACHE.get({ includeIndexes: true });
  const ontologyAtlasIgnorePatterns = loadOntologyAtlasIgnore(VAULT_ROOT);
  const result = queryCompiledOntology(artifact, {
    operation: 'maintenance_plan',
    limit,
  }, { ontologyAtlasIgnorePatterns });
  return {
    operation: result.operation,
    sideEffect: result.sideEffect,
    graphHash: result.graphHash,
    summary: result.summary,
    filters: result.filters,
    cursor: result.cursor,
    byPhase: result.byPhase,
    bySeverity: result.bySeverity,
    byKind: result.byKind,
    limited: result.limited,
    nextExecutableAction: compactMaintenanceAction(result.nextExecutableAction),
    nextReviewAction: compactMaintenanceAction(result.nextReviewAction),
    actions: result.actions.map(compactMaintenanceAction),
  };
}

function compactMaintenanceAction(action) {
  if (!action) return null;
  return {
    id: action.id,
    phase: action.phase,
    kind: action.kind,
    severity: action.severity,
    score: action.score,
    executable: action.executable,
    reason: action.reason,
    proposedAction: action.proposedAction,
    node: action.node
      ? {
          slug: action.node.slug,
          kind: action.node.kind,
          title: action.node.title,
        }
      : undefined,
    nodes: compactMaintenanceNodes(action.nodes),
  };
}

function compactMaintenanceNodes(nodesValue) {
  if (!nodesValue) return undefined;
  const compactNode = (node) => ({
    slug: node.slug,
    kind: node.kind,
    title: node.title,
  });
  if (Array.isArray(nodesValue)) {
    return nodesValue.map(compactNode);
  }
  if (typeof nodesValue === 'object') {
    return Object.fromEntries(
      Object.entries(nodesValue).map(([key, node]) => [key, compactNode(node)]),
    );
  }
  return undefined;
}

// R+ — cycle 46: validate_vault tool. agent 가 vault 전체 health 를 한
// 호출에 받음. CLI `ontology-atlas validate --json` 와 같은 shape.
// per-doc \`warnings\` (get_concept) + vault aggregate (\`vaultWarnings\` in
// list_concepts) 의 빠진 중간 — 둘 다 합친 detailed report.
function validateVaultTool({ repoRoot } = {}) {
  requireOptionalNonBlankString(repoRoot, 'repoRoot');
  const docs = loadVaultDocs(VAULT_ROOT);
  const docIssues = new Map();
  for (const doc of docs) {
    const result = validateVaultDocument(doc.raw || '');
    docIssues.set(doc.slug, result.issues || []);
  }
  for (const [slug, danglingIssues] of groupDanglingIssuesBySlug(docs)) {
    const issues = docIssues.get(slug) || [];
    issues.push(...danglingIssues);
    docIssues.set(slug, issues);
  }
  const problems = [];
  let errorFiles = 0;
  let warningFiles = 0;
  // byCode aggregation: { code → { severity, count, files: Set<slug> } }
  const byCodeMap = new Map();
  for (const doc of docs) {
    const issues = docIssues.get(doc.slug) || [];
    if (issues.length === 0) continue;
    let hasError = false;
    const seenInDoc = new Set();
    for (const issue of issues) {
      if (issue.severity === 'error') hasError = true;
      if (!byCodeMap.has(issue.code)) {
        byCodeMap.set(issue.code, {
          severity: issue.severity,
          count: 0,
          files: new Set(),
        });
      }
      const entry = byCodeMap.get(issue.code);
      // severity escalates if any issue of this code is error
      if (issue.severity === 'error') entry.severity = 'error';
      // count = file count (per-file), not per-issue
      if (!seenInDoc.has(issue.code)) {
        seenInDoc.add(issue.code);
        entry.count += 1;
        entry.files.add(doc.slug);
      }
    }
    if (hasError) errorFiles += 1;
    else warningFiles += 1;
    problems.push({
      slug: doc.slug,
      issues: issues.map((i) => ({
        code: i.code,
        severity: i.severity,
        message: i.message,
      })),
    });
  }
  const byCode = {};
  for (const [code, entry] of byCodeMap.entries()) {
    byCode[code] = {
      severity: entry.severity,
      count: entry.count,
      files: [...entry.files],
    };
  }
  // Atlas roadmap Track A #2 — vault→code path drift: frontmatter path:/elements:
  // entries that no longer exist on disk. Read-only; resolves against repoRoot
  // (default: server cwd). Surfaced here because it is a vault-health signal the
  // agent already runs validate_vault for at first-contact. The agent fixes via
  // patch_concept (correct the path) or by removing the stale entry.
  const driftRoot = repoRoot ? resolve(repoRoot) : process.cwd();
  const drift = detectVaultPathDrift({
    docs,
    repoRoot: driftRoot,
    fileExists: existsSync,
  });
  // Atlas roadmap Track A #3 — reconcile suggestion. A drifted path is usually a
  // MOVE; when exactly one existing repo source file shares the missing file's
  // basename, annotate the drift with `suggestedPath` so the fix is "did you
  // mean X?". Only walk the repo when there IS drift (zero cost on a clean vault),
  // and only suggest on a unique basename match (ambiguous names never guess).
  let drifts = drift.drifts;
  let suggestedCount = 0;
  if (drifts.length > 0) {
    try {
      const repoFiles = listSourceFiles(driftRoot).map((abs) => relative(driftRoot, abs));
      drifts = suggestPathReconciliations(drift.drifts, repoFiles);
      suggestedCount = drifts.filter((d) => typeof d.suggestedPath === 'string').length;
    } catch {
      // walk failure (perms / not a dir) — keep plain drifts, never break validate.
      drifts = drift.drifts;
    }
  }
  return {
    scanned: docs.length,
    problems,
    summary: {
      problemFiles: problems.length,
      errorFiles,
      warningFiles,
      byCode,
    },
    pathDrift: {
      repoRoot: drift.repoRoot,
      nodesScanned: drift.nodesScanned,
      pathsChecked: drift.pathsChecked,
      drifts,
      hint:
        drift.drifts.length > 0
          ? `${drift.drifts.length} frontmatter path(s) point at files missing under repoRoot — fix the .md (patch_concept) or remove the stale entry.${suggestedCount > 0 ? ` ${suggestedCount} have a same-named file elsewhere in the repo (see suggestedPath — likely a move).` : ''} If repoRoot is wrong, re-run validate_vault with the correct repoRoot.`
          : drift.pathsChecked > 0
            ? `all ${drift.pathsChecked} frontmatter source path(s) exist under repoRoot (no code drift).`
            : 'no frontmatter path:/elements: source paths to check.',
    },
  };
}

function findDanglingGraphReferenceIssues(docs) {
  const slugs = new Set(docs.map((d) => d.slug));
  const tailToFull = new Map();
  const frontmatterSlugToFull = new Map();
  for (const slug of slugs) {
    const tail = slug.split('/').pop();
    if (tail && tail !== slug && !tailToFull.has(tail)) {
      tailToFull.set(tail, slug);
    }
  }
  for (const doc of docs) {
    const fmSlug = doc.frontmatter.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim() && !frontmatterSlugToFull.has(fmSlug)) {
      frontmatterSlugToFull.set(fmSlug, doc.slug);
    }
  }
  const resolveRef = (ref) => {
    if (typeof ref !== 'string') return null;
    if (slugs.has(ref)) return ref;
    if (frontmatterSlugToFull.has(ref)) return frontmatterSlugToFull.get(ref);
    if (tailToFull.has(ref)) return tailToFull.get(ref);
    for (const slug of slugs) {
      if (slug.endsWith(`/${ref}`)) return slug;
    }
    return null;
  };
  const issues = [];
  for (const doc of docs) {
    for (const { key, ref } of collectNeighborRefs(doc)) {
      if (typeof ref !== 'string' || ref.trim() === '') continue;
      if (key === 'elements' && isPathLikeGraphRef(ref)) continue;
      if (resolveRef(ref)) continue;
      issues.push({
        slug: doc.slug,
        issue: {
          code: 'dangling-graph-reference',
          severity: 'warning',
          message: `\`${key}:\` graph reference "${ref}" 가 vault 의 어떤 node 로도 resolve 되지 않습니다.`,
        },
      });
    }
  }
  return issues;
}

function groupDanglingIssuesBySlug(docs) {
  const bySlug = new Map();
  for (const { slug, issue } of findDanglingGraphReferenceIssues(docs)) {
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(issue);
  }
  return bySlug;
}

function isPathLikeGraphRef(ref) {
  return (
    ref.startsWith('src/') ||
    ref.startsWith('mcp/') ||
    ref.startsWith('cli/') ||
    ref.startsWith('scripts/') ||
    ref.startsWith('.claude/') ||
    /\.[A-Za-z0-9]+$/.test(ref)
  );
}

// R16 (b3) — analyze_repo_structure thin wrapper. side effect 0 — vault
// frontmatter 절대 안 건드림. 사용자 검토 후 별도 add_concept 호출이 진실
// 진입.
function analyzeRepoStructureTool({ rootPath, maxDepth, ignore } = {}) {
  requireOptionalNonBlankString(rootPath, 'rootPath');
  requireOptionalNonNegativeInteger(maxDepth, 'maxDepth', { max: 10 });
  requireOptionalStringArray(ignore, 'ignore', { max: IGNORE_ARRAY_MAX_ITEMS });
  const target = rootPath
    ? resolve(rootPath)
    : process.cwd();
  return analyzeRepoStructure(target, {
    maxDepth,
    ignore,
  });
}

// R17 — infer_imports thin wrapper. side effect 0. 결과 moduleEdges 가
// agent 의 add_relation depends_on 후보.
function inferImportsTool({ rootPath, sourceFolders, ignore, maxFiles, reconcile = true } = {}) {
  requireOptionalNonBlankString(rootPath, 'rootPath');
  requireOptionalStringArray(sourceFolders, 'sourceFolders', { max: SOURCE_FOLDER_ARRAY_MAX_ITEMS });
  requireOptionalStringArray(ignore, 'ignore', { max: IGNORE_ARRAY_MAX_ITEMS });
  requireOptionalPositiveInteger(maxFiles, 'maxFiles', { max: 50000 });
  requireOptionalBoolean(reconcile, 'reconcile');
  const target = rootPath ? resolve(rootPath) : process.cwd();
  const result = inferImports(target, {
    sourceFolders,
    ignore,
    maxFiles,
  });

  // Atlas roadmap Track A #1 — reconcile the code-derived module edges against
  // the vault's compiled depends_on edges so the agent gets "exactly what to
  // sync", not a raw firehose. Read-only; the agent still lands via add_relation.
  // Guarded: a missing/unreadable vault must never fail the import scan.
  if (reconcile !== false) {
    try {
      const artifact = compileOntology(loadVaultDocs(VAULT_ROOT), { includeIndexes: true });
      const nodeSlugs = new Set((artifact.nodes ?? []).map((n) => n.slug).filter(Boolean));
      const r = reconcileImportEdges({
        moduleEdges: result.moduleEdges,
        compiledEdges: artifact.edges,
        aliasToSlug: artifact.indexes?.aliasToSlug,
        nodeSlugs,
      });
      result.reconciliation = r;
      // Factual, never-lie hint: only report "in sync" when there is genuinely
      // no drift in any bucket (the prior version falsely claimed "match" while
      // silently swallowing real edges — the bug the gate caught).
      const parts = [];
      if (r.inCodeMissingFromVault.length > 0) {
        parts.push(
          `${r.inCodeMissingFromVault.length} depends_on edge(s) in the code import graph are missing from the vault with both endpoints already nodes — each carries a proposedAction; land with add_relations (batch)`,
        );
      }
      if (r.inCodeMissingEndpointAbsent.length > 0) {
        parts.push(
          `${r.inCodeMissingEndpointAbsent.length} code edge(s) reference a slug that is not yet a vault node (create the node first)`,
        );
      }
      if (r.inVaultNotInCode.length > 0) {
        parts.push(
          `${r.inVaultNotInCode.length} vault depends_on edge(s) have no matching code import (review for stale)`,
        );
      }
      result.reconciliationSummary = {
        inBoth: r.inBoth.length,
        inCodeMissingFromVault: r.inCodeMissingFromVault.length,
        inCodeMissingEndpointAbsent: r.inCodeMissingEndpointAbsent.length,
        inVaultNotInCode: r.inVaultNotInCode.length,
        hint:
          parts.length > 0
            ? `${parts.join('; ')}.`
            : `code import graph and vault depends_on edges are in sync (${r.inBoth.length} shared, no drift).`,
      };
    } catch {
      // No loadable vault (e.g. scanning a foreign repo) — skip reconciliation silently.
      result.reconciliation = null;
    }
  }

  return result;
}

function indexProjectTool({ rootPath, maxDepth, maxFiles, threshold, skipImports = false } = {}) {
  requireOptionalNonBlankString(rootPath, 'rootPath');
  requireOptionalNonNegativeInteger(maxDepth, 'maxDepth', { max: 10 });
  requireOptionalPositiveInteger(maxFiles, 'maxFiles', { max: 50000 });
  requireOptionalPositiveInteger(threshold, 'threshold');
  requireOptionalBoolean(skipImports, 'skipImports');

  const target = rootPath ? resolve(rootPath) : process.cwd();
  const analyze = analyzeRepoStructure(target, { maxDepth });
  let imports = null;
  if (!skipImports) {
    imports = inferImportsTool({ rootPath: target, maxFiles });
    if (threshold && threshold > 1 && Array.isArray(imports.moduleEdges)) {
      const before = imports.moduleEdges.length;
      imports.moduleEdges = imports.moduleEdges.filter((edge) => Number(edge.count) >= threshold);
      imports.thresholdApplied = {
        threshold,
        filteredOut: before - imports.moduleEdges.length,
      };
    }
  }
  const validation = validateVaultTool({ repoRoot: target });

  const conceptCount =
    (analyze.project ? 1 : 0) +
    analyze.domains.length +
    analyze.capabilities.length +
    analyze.elements.length;
  const importRelations = imports?.moduleEdges?.length ?? 0;

  return {
    mode: 'plan',
    sideEffect: 0,
    rootPath: analyze.rootPath,
    vaultRoot: VAULT_ROOT,
    analyze: {
      framework: analyze.framework,
      project: analyze.project ?? null,
      domains: analyze.domains.length,
      capabilities: analyze.capabilities.length,
      elements: analyze.elements.length,
      suggestedRelations: analyze.suggestedRelations.length,
    },
    imports: imports
      ? {
          filesScanned: imports.filesScanned,
          moduleEdges: importRelations,
          ...(imports.thresholdApplied ? { thresholdApplied: imports.thresholdApplied } : {}),
          ...(imports.reconciliationSummary ? { reconciliationSummary: imports.reconciliationSummary } : {}),
        }
      : null,
    plan: {
      concepts: conceptCount,
      suggestedRelations: analyze.suggestedRelations.length,
      importRelations,
      phases: [
        'analyze_repo_structure',
        imports ? 'infer_imports' : 'infer_imports skipped',
        'validate_vault',
        'write only through explicit add_concepts/add_relations or CLI index --apply',
      ],
    },
    validation: {
      scanned: validation.scanned,
      problemFiles: validation.summary?.problemFiles ?? 0,
      errorFiles: validation.summary?.errorFiles ?? 0,
      warningFiles: validation.summary?.warningFiles ?? 0,
      pathDrift: validation.pathDrift?.drifts?.length ?? 0,
    },
    meaningGate: {
      policy: analyze.meaningGate.policy,
      sourceStructureRole: analyze.meaningGate.sourceStructureRole,
      businessOntology: {
        domains: analyze.meaningGate.businessOntology.domains.length,
        capabilities: analyze.meaningGate.businessOntology.capabilities.length,
      },
      implementationEvidence: {
        elements: analyze.meaningGate.implementationEvidence.elements.length,
      },
      reviewQuestions: analyze.meaningGate.reviewQuestions,
    },
    next: {
      applyTool: 'add_concepts + add_relations',
      cliApply: 'ontology-atlas index [rootPath] --apply --vault [vault]',
      review: 'Review candidates before applying on large or noisy repos.',
    },
  };
}

function renameConcept({ oldSlug, newSlug, confirm = false, overwrite = false, expected_mtime }) {
  requireNonBlankString(oldSlug, 'oldSlug');
  requireNonBlankString(newSlug, 'newSlug');
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalBoolean(overwrite, 'overwrite');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  if (oldSlug === newSlug) {
    throw new Error('oldSlug and newSlug are identical.');
  }
  if (!vaultSlugExists(VAULT_ROOT, oldSlug)) {
    throw new Error(missingSlugMessage('Source slug does not exist in vault', oldSlug));
  }
  if (!overwrite && vaultSlugExists(VAULT_ROOT, newSlug)) {
    throw new Error(
      `Target slug already exists: "${newSlug}". Pass overwrite: true to replace it.`,
    );
  }

  const sourcePath = slugToPath(VAULT_ROOT, oldSlug);
  const targetPath = slugToPath(VAULT_ROOT, newSlug);
  const sourceDoc = readDoc(VAULT_ROOT, sourcePath);

  // R11 closeout — source mtime conflict guard. read 직후 expected 와 비교.
  if (typeof expected_mtime === 'number' && sourceDoc.mtime !== expected_mtime) {
    throw new VaultConflictError(oldSlug, expected_mtime, sourceDoc.mtime);
  }

  // Step 1 — dry-run preview of every backlink rewrite.
  const preview = redirectBacklinks(VAULT_ROOT, oldSlug, newSlug, { dryRun: true });

  if (!confirm) {
    return {
      ok: false,
      dryRun: true,
      oldSlug,
      newSlug,
      sourcePath,
      targetPath,
      moved: false,
      backlinkUpdates: preview,
      message: `dry-run — confirm:true 를 주면 파일 이동 + ${preview.totalUpdated} 곳 backlink redirect 가 실제 적용됩니다.`,
    };
  }

  // Step 2 — write target with updated frontmatter (slug key reflects new path).
  const nextFrontmatter = { ...sourceDoc.frontmatter };
  if (typeof nextFrontmatter.slug === 'string') {
    nextFrontmatter.slug = newSlug;
  }
  mkdirSync(dirname(targetPath), { recursive: true });
  const md = buildMarkdown({ frontmatter: nextFrontmatter, body: sourceDoc.body });
  writeFileSync(targetPath, md, 'utf-8');

  // Step 3 — redirect all backlinks (write mode).
  const result = redirectBacklinks(VAULT_ROOT, oldSlug, newSlug, { dryRun: false });

  // Step 4 — remove the old file last (so partial failure doesn't lose data).
  if (sourcePath !== targetPath) {
    unlinkSync(sourcePath);
  }

  return {
    ok: true,
    oldSlug,
    newSlug,
    sourcePath,
    targetPath,
    moved: true,
    backlinkUpdates: result,
    changed: true,
    postWriteMaintenance: compactPostWriteMaintenance(),
  };
}

function mergeConcepts({ fromSlug, intoSlug, confirm = false, expected_mtime }) {
  requireNonBlankString(fromSlug, 'fromSlug');
  requireNonBlankString(intoSlug, 'intoSlug');
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  if (fromSlug === intoSlug) {
    throw new Error('fromSlug and intoSlug are identical.');
  }
  if (!vaultSlugExists(VAULT_ROOT, fromSlug)) {
    throw new Error(missingSlugMessage('fromSlug does not exist in vault', fromSlug));
  }
  if (!vaultSlugExists(VAULT_ROOT, intoSlug)) {
    throw new Error(missingSlugMessage('intoSlug does not exist in vault', intoSlug));
  }

  const fromPath = slugToPath(VAULT_ROOT, fromSlug);
  const fromDoc = readDoc(VAULT_ROOT, fromPath);

  // R11 closeout — fromSlug mtime conflict guard.
  if (typeof expected_mtime === 'number' && fromDoc.mtime !== expected_mtime) {
    throw new VaultConflictError(fromSlug, expected_mtime, fromDoc.mtime);
  }

  const preview = redirectBacklinks(VAULT_ROOT, fromSlug, intoSlug, { dryRun: true });

  if (!confirm) {
    return {
      ok: false,
      dryRun: true,
      fromSlug,
      intoSlug,
      fromPath,
      deleted: false,
      backlinkUpdates: preview,
      capturedFrom: {
        frontmatter: fromDoc.frontmatter,
        bodyExcerpt: extractSummaryExcerpt(fromDoc.body, 200),
      },
      message: `dry-run — confirm:true 를 주면 ${preview.totalUpdated} 곳 backlink redirect 후 ${fromSlug}.md 가 영구 삭제됩니다.`,
    };
  }

  const result = redirectBacklinks(VAULT_ROOT, fromSlug, intoSlug, { dryRun: false });
  unlinkSync(fromPath);

  return {
    ok: true,
    fromSlug,
    intoSlug,
    fromPath,
    deleted: true,
    backlinkUpdates: result,
    changed: true,
    capturedFrom: {
      frontmatter: fromDoc.frontmatter,
      body: fromDoc.body,
      bodyExcerpt: extractSummaryExcerpt(fromDoc.body, 200),
    },
    postWriteMaintenance: compactPostWriteMaintenance(),
  };
}

function deleteConcept({ slug, confirm = false, force = false, expected_mtime }) {
  requireNonBlankString(slug, 'slug');
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalBoolean(force, 'force');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  // 존재 검사 — dry-run 이 \"삭제 가능\" 이라고 거짓 안내 안 하도록.
  // (실제 삭제 단계의 deleteDoc 도 다시 throw 하지만, dry-run path 는
  // deleteDoc 까지 가지 않으므로 별도 확인.)
  const filePath = slugToPath(VAULT_ROOT, slug);
  if (!existsSync(filePath)) {
    throw new Error(missingSlugMessage('Doc not found', slug));
  }
  const backlinks = findBacklinks(VAULT_ROOT, slug);

  if (!confirm) {
    return {
      ok: false,
      dryRun: true,
      slug,
      filePath,
      backlinks,
      message:
        backlinks.length > 0
          ? `dry-run — ${backlinks.length} 개 backlink 가 있어 confirm:true 만으로는 거부됩니다. force:true 까지 줘야 강행.`
          : 'dry-run — confirm:true 를 주면 실제 삭제됩니다.',
    };
  }

  if (backlinks.length > 0 && !force) {
    throw new Error(
      `${backlinks.length} 개 backlink 가 있어 삭제 거부: ` +
        backlinks.map((b) => b.slug).join(', ') +
        ' — force:true 로 강행 가능 (참조 노드 dangling).',
    );
  }

  const deleted = deleteDoc(VAULT_ROOT, slug, {
    expectedMtime: typeof expected_mtime === 'number' ? expected_mtime : undefined,
  });
  return {
    ok: true,
    slug,
    filePath: deleted.filePath ?? filePath,
    forced: backlinks.length > 0 ? true : undefined,
    backlinksAtDelete: backlinks.length > 0 ? backlinks : undefined,
    changed: true,
    captured: {
      frontmatter: deleted.frontmatter,
      body: deleted.body,
      bodyExcerpt: extractSummaryExcerpt(deleted.body, 200),
    },
    postWriteMaintenance: compactPostWriteMaintenance(),
  };
}

function missingSlugMessage(prefix, slug, { createHint = false } = {}) {
  const suggestions = suggestSimilarSlugs(VAULT_ROOT, slug);
  const lines = [
    `${prefix}: "${slug}". Use list_concepts() to see all slugs, or find_evidence(query) to search by title.`,
  ];
  if (createHint) {
    lines.push('If the endpoint is real but absent, create it first with add_concept(slug, kind, title).');
  }
  if (suggestions.length > 0) {
    lines.push(`Similar slugs in this vault: ${suggestions.map((s) => `"${s}"`).join(', ')}.`);
  }
  return lines.join(' ');
}

// ── 부팅 ──────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[ontology-atlas-mcp] connected. vault=${VAULT_ROOT}`);
