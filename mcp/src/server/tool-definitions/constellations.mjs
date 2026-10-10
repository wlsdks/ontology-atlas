import { NODE_UID_PATTERN } from '../../schema.mjs';
import { GRAPH_ARRAY_KEYS } from '../../vault.mjs';
import {
  NON_BLANK_STRING_SCHEMA,
  nonBlankStringSchema,
  paginationOutputSchema,
} from '../tool-schemas/field-primitives.mjs';
import { CONCEPT_REVIEW_OUTPUT_SCHEMA } from '../tool-schemas/vault-node-shapes.mjs';

const CONSTELLATION_SOURCE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string', enum: ['.ontology-atlas/library-collections.json'] },
    schema: { type: 'string', enum: ['ontology-atlas/library-collections/v1'] },
    status: { type: 'string', enum: ['missing', 'ready', 'corrupt', 'unsupported'] },
    availability: { type: 'string', enum: ['missing', 'ready', 'unavailable'] },
    revision: { type: ['string', 'null'], pattern: '^[a-f0-9]{64}$' },
    mtime: { type: ['number', 'null'], minimum: 0 },
    reason: NON_BLANK_STRING_SCHEMA,
  },
  required: ['path', 'schema', 'status', 'availability', 'revision', 'mtime'],
  additionalProperties: false,
};
const CONSTELLATION_PURPOSE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['recorded', 'unknown'] },
    value: { type: 'string', minLength: 1, maxLength: 4000 },
  },
  required: ['status'],
  additionalProperties: false,
};
const CONSTELLATION_NODE_REF_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    uid: { type: 'string', pattern: NODE_UID_PATTERN },
    slug: NON_BLANK_STRING_SCHEMA,
  },
  required: ['uid', 'slug'],
  additionalProperties: false,
};
const CONSTELLATION_RELATION_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    from: CONSTELLATION_NODE_REF_OUTPUT_SCHEMA,
    to: CONSTELLATION_NODE_REF_OUTPUT_SCHEMA,
    type: { ...NON_BLANK_STRING_SCHEMA, enum: GRAPH_ARRAY_KEYS },
    rationale: NON_BLANK_STRING_SCHEMA,
  },
  required: ['from', 'to', 'type'],
  additionalProperties: false,
};
const CONSTELLATION_RELATION_SET_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    total: { type: 'integer', minimum: 0 },
    returned: { type: 'integer', minimum: 0 },
    limited: { type: 'boolean' },
    rows: { type: 'array', maxItems: 200, items: CONSTELLATION_RELATION_OUTPUT_SCHEMA },
  },
  required: ['total', 'returned', 'limited', 'rows'],
  additionalProperties: false,
};
const CONSTELLATION_TARGET_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['ontology', 'source', 'wiki'] },
    uid: { type: 'string', pattern: NODE_UID_PATTERN },
    lastKnownPath: NON_BLANK_STRING_SCHEMA,
    path: NON_BLANK_STRING_SCHEMA,
  },
  required: ['kind'],
  additionalProperties: false,
};
const CONSTELLATION_LIST_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    contract: { type: 'string', enum: ['savedConstellationList:v1'] },
    availability: { type: 'string', enum: ['missing', 'ready', 'unavailable'] },
    source: CONSTELLATION_SOURCE_OUTPUT_SCHEMA,
    total: { type: 'integer', minimum: 0 },
    returned: { type: 'integer', minimum: 0 },
    limited: { type: 'boolean' },
    pagination: paginationOutputSchema(),
    constellations: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: NODE_UID_PATTERN },
          name: NON_BLANK_STRING_SCHEMA,
          purpose: CONSTELLATION_PURPOSE_OUTPUT_SCHEMA,
          order: { type: 'integer', minimum: 0 },
          createdAt: NON_BLANK_STRING_SCHEMA,
          updatedAt: NON_BLANK_STRING_SCHEMA,
          memberCount: { type: 'integer', minimum: 0 },
          ontologyMemberCount: { type: 'integer', minimum: 0 },
          referenceMemberCount: { type: 'integer', minimum: 0 },
        },
        required: ['id', 'name', 'purpose', 'order', 'createdAt', 'updatedAt', 'memberCount', 'ontologyMemberCount', 'referenceMemberCount'],
        additionalProperties: false,
      },
    },
    guidance: NON_BLANK_STRING_SCHEMA,
  },
  required: ['contract', 'availability', 'source', 'total', 'returned', 'limited', 'pagination', 'constellations', 'guidance'],
  additionalProperties: false,
};
const CONSTELLATION_CONTEXT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    contract: { type: 'string', enum: ['savedConstellationContext:v1'] },
    availability: { type: 'string', enum: ['missing', 'ready', 'unavailable'] },
    source: CONSTELLATION_SOURCE_OUTPUT_SCHEMA,
    selection: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: NODE_UID_PATTERN },
        name: NON_BLANK_STRING_SCHEMA,
        purpose: CONSTELLATION_PURPOSE_OUTPUT_SCHEMA,
        createdAt: NON_BLANK_STRING_SCHEMA,
        updatedAt: NON_BLANK_STRING_SCHEMA,
        memberCount: { type: 'integer', minimum: 0 },
        ontologyMemberCount: { type: 'integer', minimum: 0 },
        referenceMemberCount: { type: 'integer', minimum: 0 },
        members: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string', pattern: NODE_UID_PATTERN },
              order: { type: 'integer', minimum: 0 },
              label: NON_BLANK_STRING_SCHEMA,
              target: CONSTELLATION_TARGET_OUTPUT_SCHEMA,
            },
            required: ['itemId', 'order', 'label', 'target'],
            additionalProperties: false,
          },
        },
        pagination: paginationOutputSchema(),
      },
      required: ['id', 'name', 'purpose', 'createdAt', 'updatedAt', 'memberCount', 'ontologyMemberCount', 'referenceMemberCount', 'members', 'pagination'],
      additionalProperties: false,
    },
    current: {
      type: 'object',
      properties: {
        resolvedMembers: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string', pattern: NODE_UID_PATTERN },
              requestedUid: { type: 'string', pattern: NODE_UID_PATTERN },
              identityResolution: { type: 'string', enum: ['current', 'merged'] },
              uid: { type: 'string', pattern: NODE_UID_PATTERN },
              slug: NON_BLANK_STRING_SCHEMA,
              kind: NON_BLANK_STRING_SCHEMA,
              title: NON_BLANK_STRING_SCHEMA,
              domain: { type: ['string', 'null'] },
              mtime: { type: 'number', minimum: 0 },
              review: CONCEPT_REVIEW_OUTPUT_SCHEMA,
              evidence: {
                type: 'object',
                properties: {
                  implementationPath: { type: ['string', 'null'] },
                  excerpt: { type: 'string', maxLength: 400 },
                  excerptTruncated: { type: 'boolean' },
                  bodyChars: { type: 'integer', minimum: 0 },
                },
                required: ['implementationPath', 'excerpt', 'excerptTruncated', 'bodyChars'],
                additionalProperties: false,
              },
            },
            required: ['itemId', 'requestedUid', 'identityResolution', 'uid', 'slug', 'kind', 'title', 'domain', 'mtime', 'review', 'evidence'],
            additionalProperties: false,
          },
        },
        unresolvedMembers: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            properties: {
              ok: { type: 'boolean', enum: [false] },
              itemId: { type: 'string', pattern: NODE_UID_PATTERN },
              uid: { type: 'string', pattern: NODE_UID_PATTERN },
              label: NON_BLANK_STRING_SCHEMA,
              lastKnownPath: NON_BLANK_STRING_SCHEMA,
              reason: { type: 'string', enum: ['missing', 'ambiguous', 'not_graph_node'] },
              claimCount: { type: 'integer', minimum: 1 },
            },
            required: ['ok', 'itemId', 'uid', 'label', 'lastKnownPath', 'reason'],
            additionalProperties: false,
          },
        },
        resolvedMemberTotal: { type: 'integer', minimum: 0 },
        unresolvedMemberTotal: { type: 'integer', minimum: 0 },
      },
      required: ['resolvedMembers', 'unresolvedMembers', 'resolvedMemberTotal', 'unresolvedMemberTotal'],
      additionalProperties: false,
    },
    relations: CONSTELLATION_RELATION_SET_OUTPUT_SCHEMA,
    outsideScopeDependencies: {
      type: 'object',
      properties: {
        total: { type: 'integer', minimum: 0 },
        returned: { type: 'integer', minimum: 0 },
        limited: { type: 'boolean' },
        rows: {
          type: 'array',
          maxItems: 200,
          items: {
            type: 'object',
            properties: {
              ...CONSTELLATION_RELATION_OUTPUT_SCHEMA.properties,
              scopeDirection: { type: 'string', enum: ['incoming', 'outgoing'] },
              outsideNode: {
                type: 'object',
                properties: {
                  uid: { type: 'string', pattern: NODE_UID_PATTERN },
                  slug: NON_BLANK_STRING_SCHEMA,
                  kind: NON_BLANK_STRING_SCHEMA,
                  title: NON_BLANK_STRING_SCHEMA,
                },
                required: ['uid', 'slug', 'kind', 'title'],
                additionalProperties: false,
              },
            },
            required: ['from', 'to', 'type', 'scopeDirection', 'outsideNode'],
            additionalProperties: false,
          },
        },
      },
      required: ['total', 'returned', 'limited', 'rows'],
      additionalProperties: false,
    },
    coverage: {
      type: 'object',
      properties: {
        selectedMembership: { type: 'string', enum: ['saved_user_scope'] },
        memberFacts: { type: 'string', enum: ['paged_current_facts', 'complete_current_facts_for_saved_members'] },
        internalRelations: { type: 'string', enum: ['bounded_declared_edges', 'all_declared_edges_between_resolved_saved_members'] },
        outsideScopeDependencies: { type: 'string', enum: ['bounded_direct_declared_dependencies', 'all_direct_declared_dependencies_crossing_saved_scope'] },
        transitiveImpactChecked: { type: 'boolean', enum: [false] },
        graphNodesScanned: { type: 'integer', minimum: 0 },
        unresolvedGraphReferences: { type: 'integer', minimum: 0 },
        unresolvedDependencyReferences: { type: 'integer', minimum: 0 },
        meaningAcceptanceInferred: { type: 'boolean', enum: [false] },
        completeImpactInferred: { type: 'boolean', enum: [false] },
      },
      required: ['selectedMembership', 'memberFacts', 'internalRelations', 'outsideScopeDependencies', 'transitiveImpactChecked', 'graphNodesScanned', 'unresolvedGraphReferences', 'unresolvedDependencyReferences', 'meaningAcceptanceInferred', 'completeImpactInferred'],
      additionalProperties: false,
    },
    guidance: NON_BLANK_STRING_SCHEMA,
  },
  required: ['contract', 'availability', 'source', 'guidance'],
  additionalProperties: false,
};

export const LIST_CONSTELLATIONS_TOOL = {
  name: 'list_constellations',
  description:
    'List saved constellation metadata from this configured vault only. Returns bounded names, user-purpose state, timestamps, member counts, exact sidecar revision, and honest unavailable status for missing/corrupt/unsupported data. Saved membership is task scope, not an ontology relation, review decision, or complete impact claim.',
  inputSchema: {
    type: 'object',
    properties: {
      offset: {
        type: 'integer',
        minimum: 0,
        description: 'Zero-based offset in deterministic saved-constellation order.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Maximum metadata rows to return. Defaults to 50; maximum 100.',
      },
    },
  },
  outputSchema: CONSTELLATION_LIST_OUTPUT_SCHEMA,
};

export const GET_CONSTELLATION_TOOL = {
  name: 'get_constellation',
  description:
    'Read one saved constellation by immutable ID from this configured vault. Returns paged saved membership and user purpose separately from current UID-resolved node facts, review currentness, bounded evidence starting points, real declared internal relations, unresolved identities, and direct outside-scope dependencies. UID and merged-UID claims are the only identity source; display paths/titles never retarget. No writes or external sending.',
  inputSchema: {
    type: 'object',
    properties: {
      id: nonBlankStringSchema('Immutable UUIDv4 of the saved constellation.', {
        pattern: NODE_UID_PATTERN,
      }),
      offset: {
        type: 'integer',
        minimum: 0,
        description: 'Zero-based offset into saved members after deterministic order.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Maximum saved members and their current facts to return. Defaults to 50; maximum 100.',
      },
      relationLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 200,
        description: 'Maximum real declared relations between resolved saved members. Defaults to 100; maximum 200.',
      },
      dependencyLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 200,
        description: 'Maximum direct declared dependency edges crossing the saved scope. Defaults to 100; maximum 200.',
      },
    },
    required: ['id'],
  },
  outputSchema: CONSTELLATION_CONTEXT_OUTPUT_SCHEMA,
};
