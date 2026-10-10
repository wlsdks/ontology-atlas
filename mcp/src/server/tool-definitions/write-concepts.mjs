import { ELEMENT_NAMING_RULE_BATCH_EN, ELEMENT_NAMING_RULE_EN } from '../../construction-rules.mjs';
import { GRAPH_REF_ARRAY_MAX_ITEMS } from '../tool-schemas/array-limits.mjs';
import {
  NON_BLANK_STRING_SCHEMA,
  nonBlankStringSchema,
} from '../tool-schemas/field-primitives.mjs';
import {
  POST_WRITE_MAINTENANCE_GUIDANCE,
  POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
} from '../tool-schemas/post-write-maintenance.mjs';
import { LOCALE_LABELS_SCHEMA } from '../tool-schemas/vault-node-shapes.mjs';

export const ADD_CONCEPT_TOOL = {
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
};

export const ADD_CONCEPTS_TOOL = {
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
};

export const PATCH_CONCEPT_TOOL = {
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
};
