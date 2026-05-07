#!/usr/bin/env node
/**
 * oh-my-ontology-mcp — MCP 서버 (도구 16종 = read 10 + write 6).
 *
 * AI agent (Claude Code 등) 가 vault 의 ontology 를 읽고 쓸 수 있게.
 *
 * read 10:
 *   - list_concepts          — vault 의 노드 목록 (kind / project_filter)
 *   - get_concept            — 단일 노드 + 이웃 (dependencies / relates) + mtime
 *   - find_evidence          — title / capabilities / elements / body 부분매칭
 *   - find_backlinks         — 특정 slug 를 가리키는 다른 노드들
 *   - find_path              — 두 slug 사이 BFS 최단 경로 + edges[via] (R+)
 *   - list_kinds             — vault kind 분포 census
 *   - find_orphans           — 어느 다른 노드도 frontmatter 에서 가리키지 않는 doc
 *   - query_concepts         — typed filter DSL (kind=X AND has(Y) AND NOT ...)
 *   - analyze_repo_structure — R16, code repo 분석 → ontology 후보 (side effect 0)
 *   - infer_imports          — R17, TS/JS import graph → depends_on 후보 (side effect 0)
 *
 * write 6:
 *   - add_concept       — 새 노드 (.md 파일 작성, 기존 slug 면 throw)
 *   - add_relation      — 두 노드 사이 edge (frontmatter 배열 키 append)
 *   - patch_concept     — 기존 노드 frontmatter (key 단위, null = 삭제) + body
 *   - delete_concept    — 노드 영구 삭제 (dry-run + backlinks 가드 + force)
 *   - rename_concept    — slug 변경 + 모든 backlink 의 array/body 자동 redirect
 *   - merge_concepts    — 두 노드 합치기 (from 의 모든 backlink 를 into 로 redirect 후 from 삭제)
 *
 * 환경 변수:
 *   OMOT_VAULT=/abs/path/to/vault   — vault root 디렉토리. 미지정 시 cwd.
 *
 * 사용:
 *   $ npx oh-my-ontology-mcp
 *   또는 .mcp.json 에 등록 (README 참고).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { resolve } from 'node:path';

import { existsSync } from 'node:fs';
import {
  VaultConflictError,
  deleteDoc,
  ensureVaultRoot,
  extractSummaryExcerpt,
  findBacklinks,
  findOrphans,
  findPath,
  listKinds,
  loadVaultDocs,
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
import { inferImports } from './infer-imports.mjs';
import { parseFilter } from './query.mjs';
import { isValidVaultTitle, validateVaultDocument } from './validate.mjs';
import {
  buildFrontmatter,
  defaultBody,
  missingExpectedFields,
} from './schema.mjs';

const VAULT_ROOT = resolve(process.env.OMOT_VAULT || process.cwd());
// import-time throw 면 stdio transport 가 붙기 전 stack trace 가 stderr 로
// 새고 클라이언트 (Claude Code 등) 에선 silent crash 로 보인다. 친절한 한
// 줄 메시지 + non-zero exit 로 server log 에 명확히 노출.
try {
  ensureVaultRoot(VAULT_ROOT);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[oh-my-ontology-mcp] vault root 검증 실패: ${msg}\n`);
  process.stderr.write(
    `[oh-my-ontology-mcp] OMOT_VAULT 환경 변수가 markdown vault 디렉토리를 가리키게 설정해 주세요. (현재: ${VAULT_ROOT})\n`,
  );
  process.exit(1);
}

// MCP `instructions` field — initialize 응답에 포함되어 연결된 AI agent
// (Claude Code, Cursor, …) 가 항상 보는 시스템-prompt 수준 안내. 16 tool
// description 만으로는 (1) 호출 순서, (2) kind 계층의 의미, (3) write 도구의
// dry-run/confirm 패턴, (4) mtime 충돌 가드, (5) R16/R17 bootstrap workflow,
// (6) error message 가 다음 tool 을 직접 가리킨다는 사실 — agent UX 가
// 매번 시행착오로 학습되는 문제를 단번에 해소.
const SERVER_INSTRUCTIONS = `oh-my-ontology — vault of markdown files where each \`.md\` with a frontmatter \`kind:\` is an ontology node. The graph encodes the codebase's mental model and is shared with the human via plain markdown.

## Tool inventory (16 tools = read 10 + write 6)

**read** — \`list_concepts\` · \`get_concept\` · \`find_evidence\` · \`find_backlinks\` · \`find_path\` · \`list_kinds\` · \`find_orphans\` · \`query_concepts\` · \`analyze_repo_structure\` · \`infer_imports\`.
**write** — \`add_concept\` · \`add_relation\` · \`patch_concept\` · \`delete_concept\` · \`rename_concept\` · \`merge_concepts\`.

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
2. \`list_concepts\` — full node table. Watch \`vaultWarnings\` — if non-zero, surface it to the user before making decisions on stale data.
3. \`get_concept(slug)\` — frontmatter + body excerpt + neighbors (dependencies / relates) + \`mtime\`. **Capture the \`mtime\`** if you plan to write later.
4. \`find_backlinks(slug)\` — understand how a node is referenced (run *before* rename / merge).
5. \`find_path(from, to)\` — "how does A relate to B?" (BFS, undirected). Returns \`hops: [slug...]\` **and \`edges: [{from, to, via}]\` where \`via\` is the frontmatter key (\`capabilities\` / \`elements\` / \`dependencies\` / \`relates\` / \`contains\` / \`describes\`) that linked the pair** — so you see not just *that* A and B are connected but *why*.
6. \`find_orphans\` — spot nodes that no other node points to (cleanup or deletion candidates).
7. \`query_concepts(filter)\` — structured questions like \`kind=capability AND domain=auth AND NOT has(elements)\` (= "unfinished caps under auth").

### B. Vault is empty / cold-start — bootstrap from code (R16 / R17)

When the user says "이 codebase 분석해줘" or you find only the 5 starter nodes:

1. \`analyze_repo_structure\` — walk \`package.json\` / \`README.md\` H2 / \`src/\` (FSD vs generic detect). Returns deterministic candidates (project + domains[] + capabilities[] + elements[] + suggestedRelations[]). **side effect 0 — vault NOT modified.** You review & prune the list with the user.
2. \`infer_imports\` — walk TS/JS source, collapse to module-level edges with import counts. **side effect 0.** You review \`moduleEdges\` with the user, then convert accepted ones into \`add_relation(..., type: 'depends_on')\` calls.
3. Land accepted candidates with \`add_concept\` / \`add_relation\`. The user (via your subsequent calls) is the single source of truth — never auto-write the proposals.

## Write tools — safety patterns

- **\`add_concept\`** throws on duplicate slug — use \`patch_concept\` to update an existing node, never delete-then-add (that loses backlinks).
- **\`rename_concept\` / \`merge_concepts\`** are dry-run by default. The first call returns an \`updates\` preview (every affected file's before/after). To commit, repeat the call with \`confirm: true\`. Backlinks are redirected atomically — much safer than \`patch_concept\` + N find_backlinks loops.
- **\`delete_concept\`** refuses by default if any backlinks remain. The error response captures the deleted frontmatter + body so a mistake is recoverable. Pass \`force: true\` only after confirming with the user.
- **\`expected_mtime\` (all write tools)** — to guard against concurrent edits by the human or another agent: capture \`mtime\` from \`get_concept\`, pass it as \`expected_mtime\` on the next write. If the file changed in between, the call throws \`VaultConflictError\` instead of silently overwriting.

## When a tool throws — read the error suffix

Every error message ends with the canonical fix tool. Examples:
- \`Doc already exists at "X". To update fields, use **patch_concept**(...).\`
- \`Doc not found: "Y". Use **list_concepts**() to see all slugs, or **find_evidence**(query) to search by title. Similar slugs in this vault: ...\`
- \`Source slug does not exist in vault: "Z". Did you mean: ...?\`

Don't retry blindly — parse the suffix and pivot to the suggested tool.

## What to write back

When code introduces a new capability / element / domain, mirror it in the vault with \`add_concept\` (and \`add_relation\` to wire it). When code is renamed / refactored, use \`rename_concept\` (one atomic call) instead of patch + manual backlink updates. The vault is the *shared* mental model — keeping it in sync is the point.`;

const server = new Server(
  { name: 'oh-my-ontology-mcp', version: '0.7.1' },
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
        kind: {
          type: 'string',
          description:
            'Filter to one kind (e.g. project, domain, capability, element). Omit to return all.',
        },
        domain: {
          type: 'string',
          description:
            'Filter to nodes whose frontmatter `domain:` matches this slug (e.g. "auth"). Combine with `kind` for "all capabilities under auth" in one call. Use the domain *slug*, not the title.',
        },
        since: {
          type: 'number',
          description:
            'Filter to nodes with `mtime > since` (ms). Pair with the `mtime` returned in earlier `list_concepts` / `get_concept` responses for incremental sync — "what changed since I last looked". Strict greater-than (mtime === since 는 제외) so re-passing the max from a previous response does not double-fetch.',
        },
        limit: {
          type: 'number',
          description: 'Max rows to return. Defaults to 100.',
        },
      },
    },
  },
  {
    name: 'get_concept',
    description:
      'Fetch a single node by slug — its frontmatter, a body excerpt, and direct neighbors (dependencies / relates).',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Vault-relative slug (e.g. projects/auth-platform). Omit the .md extension.',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'find_evidence',
    description:
      "Find vault docs that mention a given concept by title. Useful when an AI agent asks where a capability is realized in code or docs. Each match includes a prose `excerpt` (max 200 chars, heading/표/코드 skip) so agents see *what the matching doc says* without an extra get_concept call.",
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Concept title to search for (case-insensitive substring match).',
        },
      },
      required: ['title'],
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
      '`warnings` in the response, not as an error.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Vault-relative slug (omit the .md extension).' },
        kind: {
          type: 'string',
          enum: ['project', 'domain', 'capability', 'element', 'document'],
          description: 'project / domain / capability / element / document. (vault-readme is reserved for the auto-generated README.md and should not be set by agents.)',
        },
        title: { type: 'string', description: 'Display title for the node.' },
        domain: {
          type: 'string',
          description:
            'Parent domain slug. Strongly expected for kind=capability and kind=element — without it the node floats orphaned in the tree.',
        },
        capabilities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Capability slugs this node owns (project / domain).',
        },
        elements: {
          type: 'array',
          items: { type: 'string' },
          description: 'Element slugs this node uses (project / capability).',
        },
        body: {
          type: 'string',
          description: 'Markdown body (optional). When omitted a kind-specific starter body is written so the file is self-explanatory in the editor.',
        },
      },
      required: ['slug', 'kind', 'title'],
    },
  },
  {
    name: 'add_relation',
    description:
      'Add a semantic relation between two nodes. Appends to the matching ' +
      'frontmatter array (dependencies / relates / contains / describes); the ' +
      'relation type picks which key receives the entry. **R11**: optional ' +
      '`expected_mtime` — pass the source-side `mtime` from a prior get_concept ' +
      'so concurrent external edits throw VaultConflictError.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source slug.' },
        to: { type: 'string', description: 'Target slug.' },
        type: {
          type: 'string',
          enum: ['depends_on', 'relates', 'contains', 'describes'],
          description: 'Relation type.',
        },
        expected_mtime: {
          type: 'number',
          description:
            'Optional conflict guard for the source slug. If the source mtimeMs differs at write time, the call throws.',
        },
      },
      required: ['from', 'to', 'type'],
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
      'changed on disk since you read it.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Vault-relative slug (omit the .md extension).' },
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
          description:
            'Optional conflict guard. If the file mtimeMs differs at write time, the call throws so the caller can re-read and retry. Pass the `mtime` field from the most recent get_concept response.',
        },
      },
      required: ['slug'],
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
        slug: {
          type: 'string',
          description: 'Target vault-relative slug (omit the .md extension).',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'find_path',
    description:
      'Shortest path between two nodes (undirected BFS). Returns ' +
      '`{ from, to, hops: [slug...], edges: [{from, to, via}] }` where each ' +
      '`via` is the frontmatter key (`capabilities` / `elements` / `dependencies` / ' +
      '`relates` / `contains` / `describes`) that linked the two slugs — so the ' +
      'agent sees not just *that* A and B are connected but *why*. ' +
      'Returns `{ found: false }` when no path is found within maxHops. maxHops defaults to 5.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source slug.' },
        to: { type: 'string', description: 'Target slug.' },
        maxHops: {
          type: 'number',
          description: 'Maximum hop count (default 5).',
        },
      },
      required: ['from', 'to'],
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
  },
  {
    name: 'find_orphans',
    description:
      'List orphan nodes — docs that no other node references via any frontmatter ' +
      'array key. Useful as a cleanup starting point or to answer "which nodes ' +
      'are unused?". Same matching policy as find_backlinks (full slug or final ' +
      'segment). Sentinel kinds like vault-readme are excluded by default.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description:
            'Restrict to one kind (e.g. capability). Omit for all kinds.',
        },
        excludeKinds: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Kinds to exclude from results. Defaults to ['vault-readme'].",
        },
      },
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
      'Keys: kind / domain / slug / title for equality, plus any frontmatter array key for has(...).\n' +
      'Example: `kind=capability AND domain=auth AND NOT has(elements)` — ' +
      'capabilities under domain auth that have zero elements (= unfinished caps).',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description:
            'Filter expression. Example: kind=capability AND has(elements). Supports NOT / AND / OR. ' +
            "Wrap values containing whitespace or special characters with \"...\" or '...'.",
        },
        limit: {
          type: 'number',
          description: 'Max rows to return. Defaults to 100.',
        },
      },
      required: ['filter'],
    },
  },
  {
    name: 'infer_imports',
    description:
      'R17 (autonomous ingest deeper) — walk TS/JS files in a code repo and infer file-level + module-level import edges. ' +
      'side effect 0 (vault frontmatter NOT modified). The agent reviews moduleEdges (capability A → capability B from import count) and selectively passes accepted edges to add_relation as `depends_on`. ' +
      'Detects:\n' +
      '  - relative imports (./, ../) → resolved to file paths\n' +
      '  - dynamic import() / require() / export ... from\n' +
      '  - bare side-effect imports (import "X")\n' +
      '  - external (npm) imports listed separately\n' +
      '  - tsconfig path aliases (@/) → external (not resolved)\n\n' +
      'Use after analyze_repo_structure to pull *real* dependency edges from the code, not just suggestedRelations heuristics. ' +
      'Single source of truth preserved — only the user (via your subsequent add_relation calls) writes to the vault.',
    inputSchema: {
      type: 'object',
      properties: {
        rootPath: {
          type: 'string',
          description: 'Repository root to analyze. Defaults to MCP server cwd.',
        },
        sourceFolders: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Source folders to walk (default: ['src','lib','app','packages']). " +
            'If none exist, falls back to rootPath.',
        },
        ignore: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Extra folder names to skip (added to defaults: node_modules, dist, build, …).",
        },
        maxFiles: {
          type: 'number',
          description:
            'Cap on files walked (default 5000). Hard stop to avoid pathological monorepos.',
        },
      },
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
          type: 'string',
          description:
            'Repository root to analyze. Defaults to the MCP server cwd.',
        },
        maxDepth: {
          type: 'number',
          description: 'Folder walk depth (default 2). Higher → more elements.',
        },
        ignore: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Extra folder names to skip (added to defaults: node_modules, .git, dist, build, …).",
        },
      },
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
      'of patch_concept + N find_backlinks + N patch_concept loops.',
    inputSchema: {
      type: 'object',
      properties: {
        oldSlug: {
          type: 'string',
          description: 'Current vault-relative slug (omit the .md extension).',
        },
        newSlug: {
          type: 'string',
          description: 'Target vault-relative slug (omit the .md extension). Directories are created if needed.',
        },
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
          description:
            'Optional conflict guard for oldSlug. Pass the `mtime` from get_concept; throws VaultConflictError if the source has been modified externally since you read it.',
        },
      },
      required: ['oldSlug', 'newSlug'],
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
      'Throws if either slug is missing.',
    inputSchema: {
      type: 'object',
      properties: {
        fromSlug: {
          type: 'string',
          description: 'Slug to dissolve. Its file is deleted after backlinks redirect.',
        },
        intoSlug: {
          type: 'string',
          description: 'Slug to keep. Receives every redirected backlink.',
        },
        confirm: {
          type: 'boolean',
          description:
            'Actually perform the merge when true. Omit or false for a dry-run.',
        },
        expected_mtime: {
          type: 'number',
          description:
            'Optional conflict guard for fromSlug. Throws if the source has been modified externally.',
        },
      },
      required: ['fromSlug', 'intoSlug'],
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
      'changed on disk since you read it.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Vault-relative slug (omit the .md extension).',
        },
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
          description:
            'Optional conflict guard — file mtimeMs at read time. If it differs at delete time, the call throws.',
        },
      },
      required: ['slug'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

// ── 도구 핸들러 ───────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    switch (name) {
      case 'list_concepts':
        return ok(listConcepts(args));
      case 'get_concept':
        return ok(getConcept(args));
      case 'find_evidence':
        return ok(findEvidence(args));
      case 'add_concept':
        return ok(addConcept(args));
      case 'add_relation':
        return ok(addRelation(args));
      case 'patch_concept':
        return ok(patchConcept(args));
      case 'find_backlinks':
        return ok(findBacklinksTool(args));
      case 'find_path':
        return ok(findPathTool(args));
      case 'list_kinds':
        return ok(listKindsTool());
      case 'find_orphans':
        return ok(findOrphansTool(args));
      case 'query_concepts':
        return ok(queryConceptsTool(args));
      case 'analyze_repo_structure':
        return ok(analyzeRepoStructureTool(args));
      case 'infer_imports':
        return ok(inferImportsTool(args));
      case 'rename_concept':
        return ok(renameConcept(args));
      case 'merge_concepts':
        return ok(mergeConcepts(args));
      case 'delete_concept':
        return ok(deleteConcept(args));
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

function ok(result) {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

// ── 도구 구현 ─────────────────────────────────────────────────────────────

function listConcepts({ kind, domain, since, limit = 100 }) {
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
    })),
    vaultWarnings:
      errorCount + warningCount > 0
        ? { errorCount, warningCount }
        : undefined,
  };
}

function getConcept({ slug }) {
  let doc;
  try {
    doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, slug));
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
  return {
    slug: doc.slug,
    frontmatter: doc.frontmatter,
    excerpt: extractSummaryExcerpt(doc.body),
    neighbors: {
      dependencies: doc.frontmatter.dependencies || [],
      relates: doc.frontmatter.relates || [],
    },
    // R11 #8 — read-modify-write 흐름에서 caller (AI agent) 가 후속
    // patch_concept / delete_concept 의 expected_mtime 으로 그대로 넘겨
    // 외부 변경 감지 가능. ms 단위 fs mtime.
    mtime: doc.mtime,
    warnings:
      validation && validation.issues.length > 0 ? validation.issues : undefined,
  };
}

function findEvidence({ title }) {
  const docs = loadVaultDocs(VAULT_ROOT);
  const needle = title.toLowerCase();
  const matches = [];
  for (const doc of docs) {
    const docTitle =
      String(doc.frontmatter.title || doc.frontmatter.name || '').toLowerCase();
    const inFrontmatter =
      docTitle.includes(needle) ||
      String(doc.frontmatter.capabilities || '').toLowerCase().includes(needle) ||
      String(doc.frontmatter.elements || '').toLowerCase().includes(needle);
    const inBody = doc.body.toLowerCase().includes(needle);
    if (!inFrontmatter && !inBody) continue;
    matches.push({
      slug: doc.slug,
      kind: doc.frontmatter.kind,
      title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
      matchedIn: inFrontmatter ? 'frontmatter' : 'body',
      // R+ — 매치된 doc 의 prose 한 줄 요약 (max 200 chars). agent 가 매치를
      // 받자마자 "이 doc 이 무슨 내용인가?" 추가 get_concept 없이 파악.
      // get_concept 의 800자 helper 와 같은 prose-aware 추출 + 더 짧은 cap.
      excerpt: extractSummaryExcerpt(doc.body, 200),
    });
  }
  return { query: title, matches };
}

const ADD_CONCEPT_KINDS = new Set(['project', 'domain', 'capability', 'element', 'document']);

function addConcept({ slug, kind, title, domain, capabilities, elements, body }) {
  if (!slug || !kind || !title) {
    throw new Error('slug, kind, and title are all required.');
  }
  // 공백-only title 도 silent pollution 위험. UI 의 isUntitledTitle 가
  // 같은 가드를 한다 — MCP 도 parity 유지.
  if (!isValidVaultTitle(title)) {
    throw new Error('title must be a non-empty string.');
  }
  if (!ADD_CONCEPT_KINDS.has(kind)) {
    throw new Error(
      `Unknown kind: ${kind}. project / domain / capability / element / document 중 하나여야 합니다.`,
    );
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
  const filePath = writeDoc(VAULT_ROOT, slug, {
    frontmatter: fm,
    body: body || defaultBody(kind, title),
  });
  // schema 의 requiredExtras 누락 검사 → 응답에 advisory 로 포함.
  // throw 하지 않음 — agent 흐름 자연스럽게, 사용자가 후속 patch_concept 로
  // 보완 가능. (capability/element 의 domain 누락 등이 흔한 케이스)
  const missing = missingExpectedFields(kind, fm);
  return {
    ok: true,
    slug,
    filePath,
    ...(missing.length > 0 ? { warnings: missing.map((k) => `expected field "${k}" missing for kind "${kind}"`) } : {}),
  };
}

const RELATION_KEY = {
  depends_on: 'dependencies',
  relates: 'relates',
  contains: 'contains',
  describes: 'describes',
};

function addRelation({ from, to, type, expected_mtime }) {
  if (!from || !to || !type) {
    throw new Error('from, to, and type are all required.');
  }
  const key = RELATION_KEY[type];
  if (!key) {
    throw new Error(`Unknown relation type: ${type}`);
  }
  // vault 에 실재하는 slug 인지 양쪽 검증. 누락 시 frontmatter array 에
  // dangling reference 가 silently 추가되는 걸 차단 (AI agent 가 typo /
  // hallucinated slug 보낼 때 깔끔한 에러로 노출). from 은 readDoc 이
  // 후속에서 어차피 throw 하지만 메시지가 ENOENT raw 라 사용자 친화적
  // 에러로 선검증.
  if (!vaultSlugExists(VAULT_ROOT, from)) {
    const suggestions = suggestSimilarSlugs(VAULT_ROOT, from);
    const suffix = suggestions.length > 0
      ? ` Did you mean: ${suggestions.map((s) => `"${s}"`).join(', ')}?`
      : ' Use list_concepts() to see all slugs, or add_concept(slug, kind, title) to create it first.';
    throw new Error(`Source slug does not exist in vault: "${from}".${suffix}`);
  }
  if (!vaultSlugExists(VAULT_ROOT, to)) {
    const suggestions = suggestSimilarSlugs(VAULT_ROOT, to);
    const suffix = suggestions.length > 0
      ? ` Did you mean: ${suggestions.map((s) => `"${s}"`).join(', ')}?`
      : ' Use list_concepts() to see all slugs, or add_concept(slug, kind, title) to create it first.';
    throw new Error(`Target slug does not exist in vault: "${to}".${suffix}`);
  }
  const doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, from));
  const existing = Array.isArray(doc.frontmatter[key]) ? doc.frontmatter[key] : [];
  if (existing.includes(to)) {
    return { ok: true, alreadyExists: true, from, to, type };
  }
  const next = [...existing, to];
  patchFrontmatter(VAULT_ROOT, from, { [key]: next }, {
    expectedMtime:
      typeof expected_mtime === 'number' ? expected_mtime : undefined,
  });
  return { ok: true, from, to, type, key };
}

function patchConcept({ slug, frontmatter, body, expected_mtime }) {
  if (!slug) {
    throw new Error('slug is required.');
  }
  if (frontmatter === undefined && body === undefined) {
    throw new Error('At least one of `frontmatter` or `body` is required.');
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
  return { ok: true, slug, filePath };
}

function findBacklinksTool({ slug }) {
  if (!slug) {
    throw new Error('slug is required.');
  }
  const matches = findBacklinks(VAULT_ROOT, slug);
  return { target: slug, total: matches.length, matches };
}

function findPathTool({ from, to, maxHops }) {
  if (!from || !to) {
    throw new Error('from and to are both required.');
  }
  const result = findPath(VAULT_ROOT, from, to, typeof maxHops === 'number' ? maxHops : 5);
  if (!result) {
    return { from, to, found: false, reason: '경로 없음 (또는 maxHops 초과)' };
  }
  return { ...result, found: true, hopCount: result.hops.length - 1 };
}

function listKindsTool() {
  return listKinds(VAULT_ROOT);
}

function findOrphansTool({ kind, excludeKinds } = {}) {
  return findOrphans(VAULT_ROOT, {
    kind: typeof kind === 'string' ? kind : undefined,
    excludeKinds: Array.isArray(excludeKinds) ? excludeKinds : undefined,
  });
}

function queryConceptsTool({ filter, limit }) {
  if (typeof filter !== 'string' || !filter.trim()) {
    throw new Error('filter (string) 가 필요합니다.');
  }
  const parsed = parseFilter(filter);
  const cap = typeof limit === 'number' && limit > 0 ? limit : 100;
  const docs = loadVaultDocs(VAULT_ROOT).filter((d) => Boolean(d.frontmatter?.kind));
  const matches = [];
  for (const doc of docs) {
    if (matches.length >= cap) break;
    if (!parsed.match(doc)) continue;
    matches.push({
      slug: doc.slug,
      kind: doc.frontmatter.kind,
      title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
      domain: doc.frontmatter.domain,
      capabilities: doc.frontmatter.capabilities,
      elements: doc.frontmatter.elements,
    });
  }
  return {
    filter,
    parsedAs: parsed.repr,
    total: matches.length,
    matches,
    limited: matches.length >= cap,
  };
}

// R16 (b3) — analyze_repo_structure thin wrapper. side effect 0 — vault
// frontmatter 절대 안 건드림. 사용자 검토 후 별도 add_concept 호출이 진실
// 진입.
function analyzeRepoStructureTool({ rootPath, maxDepth, ignore } = {}) {
  const target = rootPath
    ? resolve(rootPath)
    : process.cwd();
  return analyzeRepoStructure(target, {
    maxDepth: typeof maxDepth === 'number' ? maxDepth : undefined,
    ignore: Array.isArray(ignore) ? ignore : undefined,
  });
}

// R17 — infer_imports thin wrapper. side effect 0. 결과 moduleEdges 가
// agent 의 add_relation depends_on 후보.
function inferImportsTool({ rootPath, sourceFolders, ignore, maxFiles } = {}) {
  const target = rootPath ? resolve(rootPath) : process.cwd();
  return inferImports(target, {
    sourceFolders: Array.isArray(sourceFolders) ? sourceFolders : undefined,
    ignore: Array.isArray(ignore) ? ignore : undefined,
    maxFiles: typeof maxFiles === 'number' ? maxFiles : undefined,
  });
}

function renameConcept({ oldSlug, newSlug, confirm = false, overwrite = false, expected_mtime }) {
  if (!oldSlug || !newSlug) {
    throw new Error('oldSlug and newSlug are both required.');
  }
  if (oldSlug === newSlug) {
    throw new Error('oldSlug and newSlug are identical.');
  }
  if (!vaultSlugExists(VAULT_ROOT, oldSlug)) {
    throw new Error(`Source slug does not exist in vault: "${oldSlug}"`);
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
  };
}

function mergeConcepts({ fromSlug, intoSlug, confirm = false, expected_mtime }) {
  if (!fromSlug || !intoSlug) {
    throw new Error('fromSlug and intoSlug are both required.');
  }
  if (fromSlug === intoSlug) {
    throw new Error('fromSlug and intoSlug are identical.');
  }
  if (!vaultSlugExists(VAULT_ROOT, fromSlug)) {
    throw new Error(`fromSlug does not exist in vault: "${fromSlug}"`);
  }
  if (!vaultSlugExists(VAULT_ROOT, intoSlug)) {
    throw new Error(`intoSlug does not exist in vault: "${intoSlug}"`);
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
        bodyExcerpt: fromDoc.body.slice(0, 200),
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
    capturedFrom: {
      frontmatter: fromDoc.frontmatter,
      body: fromDoc.body,
    },
  };
}

function deleteConcept({ slug, confirm = false, force = false, expected_mtime }) {
  if (!slug) {
    throw new Error('slug is required.');
  }
  // 존재 검사 — dry-run 이 \"삭제 가능\" 이라고 거짓 안내 안 하도록.
  // (실제 삭제 단계의 deleteDoc 도 다시 throw 하지만, dry-run path 는
  // deleteDoc 까지 가지 않으므로 별도 확인.)
  const filePath = slugToPath(VAULT_ROOT, slug);
  if (!existsSync(filePath)) {
    throw new Error(`Doc not found: ${slug}`);
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
    captured: {
      frontmatter: deleted.frontmatter,
      body: deleted.body,
    },
  };
}

// ── 부팅 ──────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[oh-my-ontology-mcp] connected. vault=${VAULT_ROOT}`);
