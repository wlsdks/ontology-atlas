import {
  NON_BLANK_STRING_SCHEMA,
  nonBlankStringSchema,
} from '../tool-schemas/field-primitives.mjs';
import {
  DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
  DESTRUCTIVE_PREVIEW_REQUIRED,
} from '../tool-schemas/destructive-preview.mjs';
import {
  POST_WRITE_MAINTENANCE_GUIDANCE,
  POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
} from '../tool-schemas/post-write-maintenance.mjs';
import { ADD_RELATION_TYPE_SCHEMA, RELATION_RESULT_SCHEMA } from '../tool-schemas/vault-node-shapes.mjs';

export const ADD_RELATION_TOOL = {
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
      // strict-args allowlists arguments from this schema; without it `why` is unknown_argument.
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
};

export const ADD_RELATIONS_TOOL = {
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
};

export const REMOVE_RELATION_TOOL = {
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
};

export const REPLACE_RELATION_TOOL = {
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
};
