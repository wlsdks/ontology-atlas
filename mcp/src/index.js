#!/usr/bin/env node
/**
 * oh-my-ontology-mcp — MCP 서버 v0.6.0 (도구 12종 = read 8 + write 4).
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
 * write 4:
 *   - add_concept       — 새 노드 (.md 파일 작성, 기존 slug 면 throw)
 *   - add_relation      — 두 노드 사이 edge (frontmatter 배열 키 append)
 *   - patch_concept     — 기존 노드 frontmatter (key 단위, null = 삭제) + body
 *   - delete_concept    — 노드 영구 삭제 (dry-run + backlinks 가드 + force)
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
  deleteDoc,
  ensureVaultRoot,
  findBacklinks,
  findOrphans,
  findPath,
  listKinds,
  loadVaultDocs,
  readDoc,
  slugToPath,
  patchFrontmatter,
  updateDoc,
  writeDoc,
} from './vault.mjs';
import { parseFilter } from './query.mjs';
import { isValidVaultTitle } from './validate.mjs';

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

const server = new Server(
  { name: 'oh-my-ontology-mcp', version: '0.6.0' },
  { capabilities: { tools: {} } },
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
      'relation type picks which key receives the entry.',
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
      'Body is fully replaced when provided, otherwise preserved.',
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
    name: 'delete_concept',
    description:
      '⚠ DESTRUCTIVE — permanently deletes the vault .md file. Two-stage safety:\n' +
      '  1. Without confirm: true the call is a dry-run — returns a backlinks preview without deleting.\n' +
      '  2. If any backlinks exist the call throws — refuses while other nodes still reference this slug. ' +
      'Pass force: true to delete anyway (the referrers become dangling).\n' +
      'Successful deletion returns the frontmatter + body so a user who deleted by mistake ' +
      'can recreate the node via add_concept. Directories are left untouched.',
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
  return {
    slug: doc.slug,
    frontmatter: doc.frontmatter,
    excerpt: doc.body.slice(0, 800),
    neighbors: {
      dependencies: doc.frontmatter.dependencies || [],
      relates: doc.frontmatter.relates || [],
    },
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

function addRelation({ from, to, type }) {
  if (!from || !to || !type) {
    throw new Error('from, to, and type are all required.');
  }
  const key = RELATION_KEY[type];
  if (!key) {
    throw new Error(`Unknown relation type: ${type}`);
  }
  const doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, from));
  const existing = Array.isArray(doc.frontmatter[key]) ? doc.frontmatter[key] : [];
  if (existing.includes(to)) {
    return { ok: true, alreadyExists: true, from, to, type };
  }
  const next = [...existing, to];
  patchFrontmatter(VAULT_ROOT, from, { [key]: next });
  return { ok: true, from, to, type, key };
}

function patchConcept({ slug, frontmatter, body }) {
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
  const filePath = updateDoc(VAULT_ROOT, slug, { frontmatter, body });
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

function deleteConcept({ slug, confirm = false, force = false }) {
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

  const deleted = deleteDoc(VAULT_ROOT, slug);
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
