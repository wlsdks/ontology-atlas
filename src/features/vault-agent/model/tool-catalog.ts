/**
 * 에이전트에게 주는 도구 목록 — **이름·인자·효과가 MCP 서버와 완전히 같다.**
 *
 * 화면·CLI·MCP 세 입구가 같은 답을 내는 것이 이 저장소의 반복 계약이고,
 * 실행기 ↔ MCP 서버의 drift 는 `tests/contract/agent-tool-catalog.contract.test.ts`
 * 가 `mcp/src/index.js` 원문에서 이름·인자를 뽑아 대조해 차단한다. 여기서
 * 새 이름을 발명하면 그 테스트가 즉시 깨진다.
 *
 * ## 무엇을 주지 않는가 (§ 안 지을 것)
 *
 * - `analyze_repo_structure` / `infer_imports` / `index_project` — **볼트 밖
 *   소스 스캔**이라 앱 에이전트의 시야 밖이다. local-first 의 "임의 파일 자동
 *   스캔 금지" 와 정면으로 부딪히고, 코드가 필요한 일은 터미널의 몫이다.
 * - `rename_concept` / `merge_concepts` / `delete_concept` / `remove_relation`
 *   / `replace_relation` / `reclassify_concept` — 구조 변경 6종. dry-run 수치
 *   카드가 선행해야 하므로 후속 슬라이스로 미룬다.
 * - `absorb_document` — 대량 유입. 전용 스킬 흐름이 이미 있다.
 * - `git_snapshot` — 모델의 도구가 아니라 **동의 카드의 앱 기능**이다.
 *   모델이 커밋 시점을 정하게 두지 않는다.
 * - `query_ontology` — 인자 20종짜리 만능 도구. v1 에서는 개별 읽기 도구
 *   11종으로 덮고, 필요가 실측되면 추가한다.
 * - `connection_info` / `compile_ontology` — 앱이 이미 아는 것.
 */

import type { ProposalToolName } from './types';

/** 우리가 쓰는 JSON Schema 부분집합. 벤더별 변환은 어댑터가 한다. */
export interface AgentJsonSchema {
  type: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean';
  description?: string;
  enum?: readonly string[];
  properties?: Record<string, AgentJsonSchema>;
  required?: readonly string[];
  items?: AgentJsonSchema;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  additionalProperties?: boolean;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: AgentJsonSchema;
  /** write 는 실행되지 않는다 — 제안 카드로 바뀐다. */
  effect: 'read' | 'write';
}

/** `mcp/src/ontology-engine.mjs` 의 같은 상수. 계약 테스트가 대조한다. */
export const NODE_KIND_VALUES = [
  'project',
  'domain',
  'capability',
  'element',
  'document',
  'vault-readme',
] as const;

export const RELATION_TYPE_VALUES = [
  'domains',
  'domain',
  'capabilities',
  'elements',
  'dependencies',
  'depends_on',
  'relates',
  'contains',
  'describes',
] as const;

export const WRITE_RELATION_TYPE_VALUES = [
  'depends_on',
  'relates',
  'contains',
  'describes',
  'domains',
  'capabilities',
  'elements',
  'domain',
] as const;

const CONCEPT_KIND_VALUES = [
  'project',
  'domain',
  'capability',
  'element',
  'document',
] as const;

const GRAPH_REF_ARRAY_MAX_ITEMS = 500;

const LOCALE_LABELS_SCHEMA: AgentJsonSchema = {
  type: 'object',
  description:
    'Per-locale display names, e.g. { "ko": "결제", "en": "Payments" }. Fill BOTH locales the vault serves — `title` stays the source for search/matching.',
  properties: {
    ko: { type: 'string', description: 'Korean display name.' },
    en: { type: 'string', description: 'English display name.' },
  },
};

const CONCEPT_SPEC_SCHEMA: AgentJsonSchema = {
  type: 'object',
  properties: {
    slug: { type: 'string' },
    kind: { type: 'string', enum: CONCEPT_KIND_VALUES },
    title: { type: 'string' },
    domain: { type: 'string' },
    capabilities: {
      type: 'array',
      maxItems: GRAPH_REF_ARRAY_MAX_ITEMS,
      items: { type: 'string' },
    },
    elements: {
      type: 'array',
      maxItems: GRAPH_REF_ARRAY_MAX_ITEMS,
      items: { type: 'string' },
    },
    path: { type: 'string' },
    body: { type: 'string' },
    labels: LOCALE_LABELS_SCHEMA,
  },
  required: ['slug', 'kind', 'title'],
  additionalProperties: false,
};

const RELATION_SPEC_SCHEMA: AgentJsonSchema = {
  type: 'object',
  properties: {
    from: { type: 'string' },
    to: { type: 'string' },
    type: { type: 'string', enum: WRITE_RELATION_TYPE_VALUES },
    expected_mtime: { type: 'number', minimum: 0 },
  },
  required: ['from', 'to', 'type'],
  additionalProperties: false,
};

/** 읽기 도구 11종. */
export const AGENT_READ_TOOLS: readonly AgentToolDefinition[] = [
  {
    name: 'get_concept',
    description:
      'Read one ontology node: frontmatter, body excerpt, mtime, and its direct neighbors. Call this before proposing any change to a node.',
    effect: 'read',
    parameters: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description:
            'Vault-relative slug (e.g. capabilities/card-payment), unique tail slug, or frontmatter `slug` alias. Omit the .md extension.',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'get_concepts',
    description: 'Read up to 50 nodes in one call. Cheaper than N get_concept calls.',
    effect: 'read',
    parameters: {
      type: 'object',
      properties: {
        slugs: {
          type: 'array',
          maxItems: 50,
          items: { type: 'string' },
          description: 'Vault-relative slugs. Max 50 per call.',
        },
      },
      required: ['slugs'],
    },
  },
  {
    name: 'list_kinds',
    description: 'Census of the vault by kind — how many projects / domains / capabilities / elements exist.',
    effect: 'read',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_concepts',
    description:
      'List nodes, optionally filtered by kind and/or domain. Use `summary: true` to get a one-paragraph preview per row instead of N follow-up reads.',
    effect: 'read',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: NODE_KIND_VALUES,
          description: 'Filter to one canonical ontology kind. Omit to return all.',
        },
        domain: {
          type: 'string',
          description: 'Filter to nodes whose frontmatter `domain:` matches this slug.',
        },
        since: {
          type: 'number',
          minimum: 0,
          description: 'Non-negative mtime threshold (ms). Filter to nodes changed after this.',
        },
        summary: {
          type: 'boolean',
          description: 'When true, each row includes a prose summary (max 200 chars).',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Max rows. Defaults to 100, max 500.',
        },
      },
    },
  },
  {
    name: 'query_concepts',
    description:
      'Filter nodes with an expression, e.g. `kind=capability AND has(elements)`. Supports NOT / AND / OR.',
    effect: 'read',
    parameters: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description:
            'Filter expression. Example: kind=capability AND has(elements). Wrap values containing whitespace with quotes.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Max rows. Defaults to 100, max 500.',
        },
      },
      required: ['filter'],
    },
  },
  {
    name: 'find_evidence',
    description:
      'Search nodes by title (case-insensitive substring), ranked. Use this before adding a concept to avoid creating a near-duplicate.',
    effect: 'read',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Concept title to search for.' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Return only the top-N matches.',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'find_backlinks',
    description: 'Who points at this node. Run this before proposing a rename, merge, or removal.',
    effect: 'read',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Target vault-relative slug.' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'find_neighbors',
    description: 'Edges around one node, optionally filtered by direction and relation type.',
    effect: 'read',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Center node slug.' },
        direction: {
          type: 'string',
          enum: ['outgoing', 'incoming', 'both'],
          description: 'Edge direction to include. Defaults to both.',
        },
        types: {
          type: 'array',
          maxItems: RELATION_TYPE_VALUES.length,
          items: { type: 'string', enum: RELATION_TYPE_VALUES },
          description: 'Optional relation types to include.',
        },
        includeNodes: {
          type: 'boolean',
          description: 'When true (default), include neighbor node summaries.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Max edges. Defaults to 100, max 500.',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'find_path',
    description: 'Shortest relation path between two nodes. Use it to check whether a link already exists.',
    effect: 'read',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source slug.' },
        to: { type: 'string', description: 'Target slug.' },
        maxHops: {
          type: 'integer',
          minimum: 0,
          maximum: 20,
          description: 'Maximum hop count (default 5, max 20).',
        },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'find_orphans',
    description: 'Nodes with no edges at all — the usual starting point for "what is unfinished here".',
    effect: 'read',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: NODE_KIND_VALUES,
          description: 'Restrict to one kind. Omit for all kinds.',
        },
        excludeKinds: {
          type: 'array',
          maxItems: NODE_KIND_VALUES.length,
          items: { type: 'string', enum: NODE_KIND_VALUES },
          description: "Kinds to exclude. Defaults to ['project', 'vault-readme'].",
        },
      },
    },
  },
  {
    name: 'validate_vault',
    description: 'Frontmatter integrity report: broken refs, missing expected fields, duplicate slugs.',
    effect: 'read',
    parameters: {
      type: 'object',
      properties: {
        repoRoot: {
          type: 'string',
          description: 'Repository root that frontmatter source paths resolve against.',
        },
      },
    },
  },
];

/**
 * 쓰기 도구 5종 — 전부 additive/보수적이라 blast radius 가 작다.
 *
 * **이 도구들은 실행되지 않는다.** 실행기가 제안 카드로 변환할 뿐이고,
 * 사용자가 [적용]을 누를 때만 디스크에 닿는다. 예외 없음.
 */
export const AGENT_WRITE_TOOLS: readonly AgentToolDefinition[] = [
  {
    name: 'add_concept',
    description:
      'Propose a new node. The user reviews the exact file and content before anything is written — nothing lands without their click.',
    effect: 'write',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Vault-relative slug (omit the .md extension).' },
        kind: {
          type: 'string',
          enum: CONCEPT_KIND_VALUES,
          description: 'project / domain / capability / element / document.',
        },
        title: { type: 'string', description: 'Display title for the node.' },
        domain: {
          type: 'string',
          description:
            'Parent domain slug. Strongly expected for capability and element — without it the node floats orphaned.',
        },
        capabilities: {
          type: 'array',
          maxItems: GRAPH_REF_ARRAY_MAX_ITEMS,
          items: { type: 'string' },
          description: 'Capability slugs this node owns (project / domain).',
        },
        elements: {
          type: 'array',
          maxItems: GRAPH_REF_ARRAY_MAX_ITEMS,
          items: { type: 'string' },
          description: 'Element slugs this node uses (project / capability).',
        },
        path: {
          type: 'string',
          description: 'Implementation source path for an element (repo-relative).',
        },
        body: { type: 'string', description: 'Markdown body. Include a definition and its boundary.' },
        labels: LOCALE_LABELS_SCHEMA,
      },
      required: ['slug', 'kind', 'title'],
    },
  },
  {
    name: 'add_concepts',
    description: 'Propose several new nodes at once (max 50). Same shape as add_concept per row.',
    effect: 'write',
    parameters: {
      type: 'object',
      properties: {
        concepts: {
          type: 'array',
          maxItems: 50,
          items: CONCEPT_SPEC_SCHEMA,
          description: 'Array of concept specs (max 50).',
        },
      },
      required: ['concepts'],
    },
  },
  {
    name: 'add_relation',
    description:
      'Propose one relation between two existing nodes. Always give `why` — an edge without a reason is a mind-map line, not an ontology claim.',
    effect: 'write',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source slug.' },
        to: { type: 'string', description: 'Target slug.' },
        type: { type: 'string', enum: WRITE_RELATION_TYPE_VALUES, description: 'Relation type.' },
        why: {
          type: 'string',
          description: 'One-line rationale ("A leans on B because ...").',
        },
        expected_mtime: {
          type: 'number',
          minimum: 0,
          description: 'Conflict guard for the source slug — pass the mtime from your last read.',
        },
      },
      required: ['from', 'to', 'type'],
    },
  },
  {
    name: 'add_relations',
    description: 'Propose several relations at once (max 50).',
    effect: 'write',
    parameters: {
      type: 'object',
      properties: {
        relations: {
          type: 'array',
          maxItems: 50,
          items: RELATION_SPEC_SCHEMA,
          description: 'Array of relation specs (max 50).',
        },
      },
      required: ['relations'],
    },
  },
  {
    name: 'patch_concept',
    description:
      'Propose edits to an existing node. Pass `expected_mtime` from your most recent get_concept so a concurrent human edit is not silently overwritten.',
    effect: 'write',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Vault-relative slug (omit the .md extension).' },
        frontmatter: {
          type: 'object',
          description:
            'Frontmatter key/value patches. null removes the key. Per-locale names go here as display_ko / display_en.',
        },
        body: { type: 'string', description: 'Full replacement markdown body. Preserved when omitted.' },
        expected_mtime: {
          type: 'number',
          minimum: 0,
          description: 'Conflict guard. Pass the `mtime` field from the most recent get_concept response.',
        },
      },
      required: ['slug'],
    },
  },
];

export const AGENT_TOOLS: readonly AgentToolDefinition[] = [
  ...AGENT_READ_TOOLS,
  ...AGENT_WRITE_TOOLS,
];

const TOOLS_BY_NAME = new Map(AGENT_TOOLS.map((tool) => [tool.name, tool]));

export function findAgentTool(name: string): AgentToolDefinition | undefined {
  return TOOLS_BY_NAME.get(name);
}

export function isProposalToolName(name: string): name is ProposalToolName {
  const tool = TOOLS_BY_NAME.get(name);
  return tool?.effect === 'write';
}
