#!/usr/bin/env node
/**
* oh-my-ontology-mcp — MCP 서버 v0.7.1 (도구 14종 = read 8 + write 6).
 *
 * AI agent (Claude Code 등) 가 vault 의 ontology 를 읽고 쓸 수 있게.
 *
 * read 8:
 *   - list_concepts     — vault 의 노드 목록 (kind / project_filter)
 *   - get_concept       — 단일 노드 + 이웃 (dependencies / relates)
 *   - find_evidence     — title / capabilities / elements / body 부분매칭
 *   - find_backlinks    — 특정 slug 를 가리키는 다른 노드들
 *   - find_path         — 두 slug 사이 그래프 최단 경로 (BFS, 무방향)
 *   - list_kinds        — vault kind 분포 census
 *   - find_orphans      — 어느 다른 노드도 frontmatter 에서 가리키지 않는 doc
 *   - query_concepts    — typed filter DSL (kind=X AND has(Y) AND NOT ...)
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
  findBacklinks,
  findOrphans,
  findPath,
  listKinds,
  loadVaultDocs,
  readDoc,
  redirectBacklinks,
  slugToPath,
  patchFrontmatter,
  updateDoc,
  vaultSlugExists,
  writeDoc,
} from './vault.mjs';
import { writeFileSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { buildMarkdown } from './parser.mjs';
import { parseFilter } from './query.mjs';
import { isValidVaultTitle, validateVaultDocument } from './validate.mjs';

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
// (Claude Code, Cursor, …) 가 항상 보는 시스템-prompt 수준 안내. 14 tool
// description 만으로는 (1) 호출 순서, (2) kind 계층의 의미, (3) write 도구의
// dry-run/confirm 패턴, (4) mtime 충돌 가드 — 이 4 가지가 누락되어 있어
// agent UX 가 매번 시행착오로 학습되는 문제를 단번에 해소.
const SERVER_INSTRUCTIONS = `oh-my-ontology — vault of markdown files where each \`.md\` with a frontmatter \`kind:\` is an ontology node. The graph encodes the codebase's mental model and is shared with the human via plain markdown.

## Kind hierarchy (top → leaf)

- **project** — top-level deliverable (e.g. "auth-platform"). Owns capabilities and elements.
- **domain** — functional grouping (e.g. "auth", "billing"). Parent of capabilities.
- **capability** — a coherent unit of behavior (e.g. "token-issue"). Often realized by elements.
- **element** — concrete piece (library, API, schema, file). Leaf-level.
- **document** — narrative or reference doc tied to the graph but not a domain object.
- (\`vault-readme\` is reserved for the auto-generated README.md — agents should not set this kind.)

## First-time workflow (when you connect to a new vault)

1. \`list_kinds\` — see the kind census (how many projects/domains/capabilities/…).
2. \`list_concepts\` — see all nodes. Watch \`vaultWarnings\` — if non-zero, the vault has frontmatter integrity issues; surface them to the user before making decisions on stale data.
3. \`get_concept(slug)\` — for any node of interest. Returns frontmatter + body + neighbors (dependencies/relates) + \`mtime\`.
4. \`find_backlinks(slug)\` — to understand how a node is referenced.
5. \`find_path(from, to)\` — for "how does A relate to B" questions (BFS, undirected).
6. \`find_orphans\` — to spot nodes that no other node points to (often unfinished or deletion candidates).
7. \`query_concepts(filter)\` — for structured questions like \`kind=capability AND domain=auth AND NOT has(elements)\` (= "unfinished caps under auth").

## Write tools — safety patterns

- **\`add_concept\`** throws on duplicate slug — use \`patch_concept\` to update an existing node, never delete-then-add.
- **\`rename_concept\` / \`merge_concepts\`** are dry-run by default. The first call returns an \`updates\` preview (every affected file's before/after). To commit, repeat the call with \`confirm: true\`.
- **\`delete_concept\`** refuses by default if any backlinks remain. Pass \`force: true\` only after confirming with the user.
- **\`expected_mtime\` (all write tools)** — to guard against concurrent edits by the human or another agent: capture \`mtime\` from \`get_concept\`, pass it as \`expected_mtime\` on the next write. If the file changed in between, the call throws \`VaultConflictError\` instead of silently overwriting.
- **Prefer graph-level writes** — to rename a slug or fold two nodes, use \`rename_concept\` / \`merge_concepts\` (atomic backlink redirect) rather than \`patch_concept\` + N find_backlinks loops.

## What to write back

When you discover a new capability/element/project from code, call \`add_concept\` so the human sees it appear in their workbench. When you fix or rename code, mirror the change in the graph with \`rename_concept\`. The vault is the shared mental model — keeping it in sync is the entire point.`;

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
      'Filter by kind / project_filter. AI agents call this first to grasp the ' +
      "codebase's mental model.",
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description:
            'Filter to one kind (e.g. project, domain, capability, element). Omit to return all.',
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
      "Find vault docs that mention a given concept by title. Useful when an AI agent asks where a capability is realized in code or docs.",
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
      'already exists — use patch_concept in that case.',
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
        domain: { type: 'string', description: 'Parent domain slug (optional).' },
        capabilities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Capability slugs this node owns (project nodes).',
        },
        elements: {
          type: 'array',
          items: { type: 'string' },
          description: 'Element slugs this node uses (project nodes).',
        },
        body: {
          type: 'string',
          description: 'Markdown body (optional). Defaults to `# {title}` when omitted.',
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
      'Shortest path between two nodes (undirected BFS). Returns null when no ' +
      'path is found within maxHops. Used by AI agents to trace transitive ' +
      'dependency chains. maxHops defaults to 5.',
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

function listConcepts({ kind, limit = 100 }) {
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

  const filtered = docs.filter((doc) => {
    const docKind = doc.frontmatter.kind;
    if (kind && docKind !== kind) return false;
    return Boolean(docKind); // frontmatter `kind:` 가 있어야 ontology 노드.
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
    excerpt: doc.body.slice(0, 800),
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
  const fm = { slug, kind, title };
  if (domain) fm.domain = domain;
  if (capabilities && capabilities.length > 0) fm.capabilities = capabilities;
  if (elements && elements.length > 0) fm.elements = elements;
  const filePath = writeDoc(VAULT_ROOT, slug, {
    frontmatter: fm,
    body: body || `# ${title}\n`,
  });
  return { ok: true, slug, filePath };
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
    throw new Error(`Source slug does not exist in vault: "${from}"`);
  }
  if (!vaultSlugExists(VAULT_ROOT, to)) {
    throw new Error(`Target slug does not exist in vault: "${to}"`);
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
