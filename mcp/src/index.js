#!/usr/bin/env node
/**
 * oh-my-ontology-mcp — MCP 서버 v0.5.0 (도구 11종 = read 7 + write 4).
 *
 * AI agent (Claude Code 등) 가 vault 의 ontology 를 읽고 쓸 수 있게.
 *
 * read 7:
 *   - list_concepts     — vault 의 노드 목록 (kind / project_filter)
 *   - get_concept       — 단일 노드 + 이웃 (dependencies / relates)
 *   - find_evidence     — title / capabilities / elements / body 부분매칭
 *   - find_backlinks    — 특정 slug 를 가리키는 다른 노드들
 *   - find_path         — 두 slug 사이 그래프 최단 경로 (BFS, 무방향)
 *   - list_kinds        — vault kind 분포 census
 *   - find_orphans      — 어느 다른 노드도 frontmatter 에서 가리키지 않는 doc
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

const VAULT_ROOT = resolve(process.env.OMOT_VAULT || process.cwd());
ensureVaultRoot(VAULT_ROOT);

const server = new Server(
  { name: 'oh-my-ontology-mcp', version: '0.5.0' },
  { capabilities: { tools: {} } },
);

// ── 도구 정의 ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_concepts',
    description:
      'Vault 의 모든 ontology 노드 (.md 의 frontmatter `kind:`) 를 나열. ' +
      'kind / project_filter 로 필터 가능. AI agent 가 codebase 의 mental ' +
      'model 을 빠르게 파악할 때 첫 호출.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description:
            '특정 kind 만 필터 (예: project, domain, capability, element). 미지정 시 모두.',
        },
        limit: {
          type: 'number',
          description: '최대 반환 수. 기본 100.',
        },
      },
    },
  },
  {
    name: 'get_concept',
    description:
      '단일 노드 (slug) 의 frontmatter + body excerpt + 직접 연결된 이웃 (dependencies / relates) 반환.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'vault-relative slug (예: projects/auth-platform). 확장자 제외.',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'find_evidence',
    description:
      '특정 concept (kind + title) 을 언급하는 vault 문서 목록 반환. AI agent 가 "이 capability 가 어디 코드 / 문서에 실현됐나" 를 추적할 때 사용.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '찾을 concept 의 title (case-insensitive 부분 매칭).',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'add_concept',
    description:
      '새 ontology 노드 (.md 파일) 작성. AI agent 가 코드 분석 결과 새 ' +
      'capability / element / project 를 발견했을 때 호출. 기존 slug 면 ' +
      '에러 — 그땐 patch_concept 사용.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'vault-relative slug (확장자 제외).' },
        kind: {
          type: 'string',
          description: 'project / domain / capability / element / decision / workflow.',
        },
        title: { type: 'string', description: '노드 제목.' },
        domain: { type: 'string', description: '소속 domain (선택).' },
        capabilities: {
          type: 'array',
          items: { type: 'string' },
          description: '이 노드가 다루는 capabilities (project 인 경우).',
        },
        elements: {
          type: 'array',
          items: { type: 'string' },
          description: '이 노드가 사용하는 elements (project 인 경우).',
        },
        body: {
          type: 'string',
          description: 'markdown 본문 (선택). 미지정 시 `# {title}` 으로 자동.',
        },
      },
      required: ['slug', 'kind', 'title'],
    },
  },
  {
    name: 'add_relation',
    description:
      '두 노드 사이에 의미 관계 추가. relations / dependencies / relates ' +
      'frontmatter 배열에 append. relation type 별로 다른 키에 저장.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'from slug.' },
        to: { type: 'string', description: 'to slug.' },
        type: {
          type: 'string',
          enum: ['depends_on', 'relates', 'contains', 'describes'],
          description: 'relation type.',
        },
      },
      required: ['from', 'to', 'type'],
    },
  },
  {
    name: 'patch_concept',
    description:
      '기존 ontology 노드 (.md 파일) 의 frontmatter 와/또는 body 를 갱신. ' +
      'AI agent 가 기존 노드를 수정·심화·재분류할 때 사용. frontmatter ' +
      'patch 는 키 단위 — null = 키 삭제, 미지정 = 기존 보존. body 는 전체 ' +
      '교체 또는 미지정 시 보존.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'vault-relative slug (확장자 제외).' },
        frontmatter: {
          type: 'object',
          description:
            '갱신할 frontmatter 키-값 (예: { kind: "capability", domain: "views" }). null 은 키 삭제.',
        },
        body: {
          type: 'string',
          description: 'markdown 본문 전체 교체 (옵션). 미지정 시 보존.',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'find_backlinks',
    description:
      '특정 노드 (slug) 를 가리키는 다른 노드 목록 반환. frontmatter 배열 ' +
      '키 (capabilities / elements / dependencies / relates / contains / ' +
      'describes 등) 와 body 의 wikilink / markdown link 모두 검사. AI ' +
      'agent 가 "이 노드 의존자가 누구인지" 그래프 탐색 시 사용.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'backlink 대상 vault-relative slug (확장자 제외).',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'find_path',
    description:
      '두 노드 (slug) 사이 그래프 최단 경로 (BFS, 무방향). 경로 못 ' +
      '찾으면 null. AI agent 가 transitive 의존 chain 추적 시 사용. ' +
      'maxHops 기본 5.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'from slug.' },
        to: { type: 'string', description: 'to slug.' },
        maxHops: {
          type: 'number',
          description: '최대 hop 수 (기본 5).',
        },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'list_kinds',
    description:
      'vault 의 kind 분포 통계 — { total, byKind: { capability: N, ... } }. ' +
      'AI agent 가 vault 의 census 를 빠르게 파악할 때 사용 (list_concepts 후 ' +
      'count 보다 효율).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'find_orphans',
    description:
      'vault 의 고립 노드 (어느 다른 노드도 frontmatter array 키에서 가리키지 ' +
      '않는 doc) 목록. AI agent 가 cleanup 시작점 / 사용자가 "안 쓰이는 ' +
      '노드 뭐냐" 점검 시 사용. find_backlinks 와 같은 매칭 정책 (절대 slug ' +
      '또는 마지막 segment). vault-readme 같은 sentinel kind 는 기본 제외.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description:
            '특정 kind 만 대상 (예: capability). 미지정 시 모든 kind.',
        },
        excludeKinds: {
          type: 'array',
          items: { type: 'string' },
          description:
            '결과에서 제외할 kind 목록. 미지정 시 [\'vault-readme\'] 기본.',
        },
      },
    },
  },
  {
    name: 'delete_concept',
    description:
      '⚠ DESTRUCTIVE — vault 의 .md 파일 영구 삭제. 안전 가드 2단:\n' +
      '  1. confirm: true 미지정 시 dry-run — 삭제 없이 backlinks 미리보기만 반환.\n' +
      '  2. backlinks 가 있으면 throw — 다른 노드가 이 slug 를 가리키는 한 거부. ' +
      'force: true 명시하면 backlinks 무시하고 삭제 (참조 노드들은 dangling 됨).\n' +
      '삭제 응답에 frontmatter + body 를 같이 반환 — 사용자가 실수로 삭제했을 때 ' +
      'add_concept 으로 재생성 가능. 디렉토리는 건드리지 않음.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'vault-relative slug (확장자 제외).',
        },
        confirm: {
          type: 'boolean',
          description:
            '실제 삭제 확정. 미지정·false 면 dry-run (삭제 없이 backlinks 미리보기).',
        },
        force: {
          type: 'boolean',
          description:
            'backlinks 가 있어도 삭제 강행 (참조 노드들은 dangling 됨). 기본 false.',
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
  const doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, slug));
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

function addConcept({ slug, kind, title, domain, capabilities, elements, body }) {
  if (!slug || !kind || !title) {
    throw new Error('slug, kind, title 모두 필요합니다.');
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
    throw new Error('from, to, type 모두 필요합니다.');
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
    throw new Error('slug 가 필요합니다.');
  }
  if (frontmatter === undefined && body === undefined) {
    throw new Error('frontmatter 또는 body 중 하나는 지정해야 합니다.');
  }
  const filePath = updateDoc(VAULT_ROOT, slug, { frontmatter, body });
  return { ok: true, slug, filePath };
}

function findBacklinksTool({ slug }) {
  if (!slug) {
    throw new Error('slug 가 필요합니다.');
  }
  const matches = findBacklinks(VAULT_ROOT, slug);
  return { target: slug, total: matches.length, matches };
}

function findPathTool({ from, to, maxHops }) {
  if (!from || !to) {
    throw new Error('from, to 모두 필요합니다.');
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

function deleteConcept({ slug, confirm = false, force = false }) {
  if (!slug) {
    throw new Error('slug 가 필요합니다.');
  }
  // 존재 확인 — readDoc 이 실패하면 명확한 에러로 surface.
  const filePath = slugToPath(VAULT_ROOT, slug);
  const target = readDoc(VAULT_ROOT, filePath);
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
