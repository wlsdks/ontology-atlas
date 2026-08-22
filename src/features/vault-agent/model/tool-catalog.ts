/**
 * The tool list given to the agent — **names, arguments, and effects are exactly
 * the MCP server's.**
 *
 * The screen, the CLI, and MCP giving the same answer is this repository's
 * recurring contract, and drift between the executor and the MCP server is blocked
 * by `tests/contract/agent-tool-catalog.contract.test.ts`, which extracts names and
 * arguments from `mcp/src/index.js` itself and compares. Inventing a new name here
 * breaks that test immediately.
 *
 * **What is deliberately not given:**
 *
 * - `analyze_repo_structure` / `infer_imports` / `index_project` — **source
 *   scanning outside the vault**, beyond the app agent's field of view. It
 *   collides head-on with local-first's "no automatic scanning of arbitrary
 *   files", and work needing the code belongs to the terminal.
 * - `rename_concept` / `merge_concepts` / `delete_concept` / `remove_relation`
 *   / `replace_relation` / `reclassify_concept` — the six structural changes. A
 *   dry-run figures card must come first, so they are deferred to a later slice.
 * - `absorb_document` — bulk ingestion. A dedicated skill flow already exists.
 * - `git_snapshot` — not a model's tool but **an app feature of the consent
 *   card**. The model does not get to decide when to commit.
 * - `query_ontology` — an omnibus tool with twenty arguments. v1 covers it with
 *   the ten individual read tools and adds it when a need is measured.
 * - `query_concepts` — would require reimplementing the filter expression parser
 *   (`mcp/src/query.mjs`) in the web bundle, and a reimplementation is drift.
 *   `list_concepts`'s kind/domain filters plus `find_evidence` cover real use.
 * - `connection_info` / `compile_ontology` — things the app already knows.
 */

import type { ProposalToolName } from './types';

/** The JSON Schema subset we use. Per-vendor conversion belongs to the adapter. */
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
  /** A write is never executed — it becomes a proposal card. */
  effect: 'read' | 'write';
}

/** The same constant as in `mcp/src/ontology-engine.mjs`. A contract test compares them. */
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
    path: {
      type: 'string',
      description:
        'One canonical implementation entrypoint for a capability or element (repo-relative file or directory).',
    },
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

/** The ten read tools. */
export const AGENT_READ_TOOLS: readonly AgentToolDefinition[] = [
  {
    name: 'get_concept',
    description:
      'Read one ontology node: frontmatter, body, mtime, and its direct neighbors. The whole body comes back by default — definition, evidence, confidence, and scope live there. Call this before proposing any change to a node.',
    effect: 'read',
    parameters: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description:
            'Vault-relative slug (e.g. capabilities/card-payment), unique tail slug, or frontmatter `slug` alias. Omit the .md extension. Pass exactly one of slug or uid.',
        },
        uid: {
          type: 'string',
          description:
            'Exact permanent node UID. Pass exactly one of uid or slug; successful responses still include both identities.',
        },
        body: {
          type: 'string',
          enum: ['excerpt', 'full'],
          description:
            "'full' (the default here — this surface reads the user's own disk with no round-trip budget) returns the whole markdown body; 'excerpt' asks for the first prose paragraph only. Either way bodyInfo says whether anything was left out.",
        },
      },
    },
  },
  {
    name: 'get_concepts',
    description:
      "Read up to 50 nodes in one call (20 with body: 'full'). Cheaper than N get_concept calls.",
    effect: 'read',
    parameters: {
      type: 'object',
      properties: {
        slugs: {
          type: 'array',
          maxItems: 50,
          items: { type: 'string' },
          description: "Vault-relative slugs. Pass exactly one of slugs or uids. Max 50 per call (20 when body is 'full').",
        },
        uids: {
          type: 'array',
          maxItems: 50,
          items: { type: 'string' },
          description: "Exact permanent node UIDs. Pass exactly one of uids or slugs. Max 50 per call (20 when body is 'full').",
        },
        body: {
          type: 'string',
          enum: ['excerpt', 'full'],
          description: "Applies to every row. 'full' (default here) or 'excerpt'.",
        },
      },
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
      'List nodes, optionally filtered by kind and/or domain. Use `summary: true` to get a one-paragraph preview per row instead of N follow-up reads. For large vaults, resume with the MCP pagination contract.',
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
        offset: {
          type: 'integer',
          minimum: 0,
          description: 'Zero-based deterministic slug page offset. Continue with pagination.nextOffset while hasMore is true.',
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
    name: 'find_evidence',
    description:
      'Search the vault by title (case-insensitive substring), ranked. Use this before adding a concept to avoid creating a near-duplicate. The vault also holds ordinary markdown (notes, memos) that is not a graph node — every row says which it is via `isNode`, and non-nodes rank below nodes of equal relevance.',
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
        nodesOnly: {
          type: 'boolean',
          description: 'Return only graph nodes (docs with a `kind:`). Default false.',
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
 * The five write tools — all additive and conservative, so the blast radius is small.
 *
 * **These tools are not executed.** The executor only converts them into proposal
 * cards, and they touch the disk only when the user presses [apply]. No exceptions.
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
          description:
            'One canonical implementation entrypoint for a capability or element (repo-relative file or directory).',
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
