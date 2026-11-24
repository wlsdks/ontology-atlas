import { NON_BLANK_STRING_SCHEMA } from '../tool-schemas/field-primitives.mjs';
import {
  DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
  DESTRUCTIVE_PREVIEW_REQUIRED,
} from '../tool-schemas/destructive-preview.mjs';
import { POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA } from '../tool-schemas/post-write-maintenance.mjs';
import { ADD_RELATION_TYPE_SCHEMA, RELATION_RESULT_SCHEMA } from '../tool-schemas/vault-node-shapes.mjs';
import { WRITE_FINDINGS_GUIDANCE, WRITE_FINDINGS_SCHEMA } from './write-concepts.mjs';

export const ADD_RELATION_TOOL = {
  name: 'add_relation',
  description:
    'Add one typed relation between two existing nodes, written to the source node\'s matching frontmatter key; `domain` sets its inline parent domain. ' +
    'A new `depends_on` requires a nonblank `why`; an existing edge is an idempotent read. `contains` between kinds a typed key fits is written as that key, said in `notice`. ' +
    'Pass `expected_mtime` (the source mtime from get_concept or the last write) to throw VaultConflictError on concurrent edits; `mtime` is returned only for a guarded call. ' +
    'An invalid `type` is rejected before endpoint slug resolution with a closest-value hint and `allowedValues`, with no `changed`, `alreadyExists`, or `findings` write metadata. ' +
    'Changed writes return ' + WRITE_FINDINGS_GUIDANCE + '. ' +
    'For several approved edges use `add_relations` (max 50). `infer_imports.moduleEdges` need exact-evidence review, a `why`, and human approval first.',
  inputSchema: {
    type: 'object',
    properties: {
      from: NON_BLANK_STRING_SCHEMA,
      to: NON_BLANK_STRING_SCHEMA,
      type: ADD_RELATION_TYPE_SCHEMA,
      // strict-args allowlists arguments from this schema; without it `why` is unknown_argument.
      why: {
        type: 'string',
        maxLength: 300,
        description:
          'One-line rationale ("A leans on B because ..."), stored in relation_notes in the same write. Required for a new depends_on.',
      },
      expected_mtime: {
        type: 'number',
        minimum: 0,
        description:
          'Conflict guard: the source slug\'s mtime.',
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
      changed: { type: 'boolean' },
      alreadyExists: { type: 'boolean' },
      mtime: { type: 'number', minimum: 0 },
      notice: { type: 'string' },
      findings: WRITE_FINDINGS_SCHEMA,
    },
    required: ['ok', 'from', 'to', 'type'],
    additionalProperties: false,
  },
};

export const ADD_RELATIONS_TOOL = {
  name: 'add_relations',
  description:
    'Add one or more typed relations between existing nodes, up to 50 per call, each written to its source node\'s matching frontmatter key. `contains` between kinds a typed key fits is written as that key, said in the row\'s `notice`. ' +
    'Give every new `depends_on` a nonblank `why`; an edge from imports alone, such as `infer_imports.moduleEdges`, needs exact-evidence review and the user\'s acceptance first. ' +
    'Rows are independent, idempotent and not rolled back: an existing edge returns `alreadyExists: true`; a bad row (missing slug, unknown type, unknown field) returns `{ok: false, error}` labelled `relations[n]` with a closest-value hint and repair fields, in input order. ' +
    '`mtimes` maps each source whose first changed row passed `expected_mtime` to its new mtime; when rows share one `from`, guard only its first row. ' +
    'Invalid-only batches return no row-level `changed` / `alreadyExists` write metadata and no top-level `findings`; otherwise the response includes ' + WRITE_FINDINGS_GUIDANCE + '.',
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
              description: 'One-line rationale stored in relation_notes; required for a new depends_on.',
            },
            expected_mtime: { type: 'number', minimum: 0 },
          },
          required: ['from', 'to', 'type'],
          additionalProperties: false,
        },
        description: 'Rows shaped like `add_relation` input.',
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
            changed: { type: 'boolean' },
            alreadyExists: { type: 'boolean' },
            mtime: { type: 'number', minimum: 0 },
            notice: { type: 'string' },
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
      mtimes: { type: 'object', additionalProperties: { type: 'number', minimum: 0 } },
      findings: WRITE_FINDINGS_SCHEMA,
    },
    required: ['relations'],
    additionalProperties: false,
  },
};

export const REMOVE_RELATION_TOOL = {
  name: 'remove_relation',
  description:
    'Safely remove one exact typed relation and its `relation_notes` rationale from a source node. Defaults to dry-run; pass confirm:true to write. Supports expected_mtime conflict protection. Use this instead of replacing a whole frontmatter array with patch_concept. `type:"contains"` also finds the typed key add_relation stored it under.',
  inputSchema: {
    type: 'object',
    properties: {
      from: NON_BLANK_STRING_SCHEMA,
      to: NON_BLANK_STRING_SCHEMA,
      type: ADD_RELATION_TYPE_SCHEMA,
      confirm: { type: 'boolean', description: 'True to write; default dry-run.' },
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
    'Atomically replace one exact relation with a new target and/or type, moving or replacing its rationale in the same frontmatter write. `contains` as oldType or newType maps to the typed key exactly as add_relation does. Defaults to dry-run; pass confirm:true to write. Supports expected_mtime.',
  inputSchema: {
    type: 'object',
    properties: {
      from: NON_BLANK_STRING_SCHEMA, oldTo: NON_BLANK_STRING_SCHEMA,
      oldType: ADD_RELATION_TYPE_SCHEMA, newTo: NON_BLANK_STRING_SCHEMA,
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
