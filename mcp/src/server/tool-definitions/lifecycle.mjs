import { NODE_UID_PATTERN } from '../../schema.mjs';
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
import {
  BACKLINK_REWRITE_PLAN_OUTPUT_SCHEMA,
  BACKLINK_ROW_OUTPUT_SCHEMA,
  CAPTURED_DOC_OUTPUT_SCHEMA,
} from '../tool-schemas/vault-node-shapes.mjs';

export const RENAME_CONCEPT_TOOL = {
  name: 'rename_concept',
  description:
    '⚠ MULTI-FILE WRITE: change a node\'s slug and rewrite every backlink (frontmatter, body links, tail-only references) in one operation, keeping its UID; use it instead of patch_concept loops. Dry-run returns `updates` unless confirm: true. Throws if oldSlug is missing or newSlug taken (unless overwrite). Confirmed writes return ' + POST_WRITE_MAINTENANCE_GUIDANCE + '.',
  inputSchema: {
    type: 'object',
    properties: {
      oldSlug: nonBlankStringSchema('Current slug.'),
      newSlug: nonBlankStringSchema(
        'New slug; directories are created.',
      ),
      confirm: {
        type: 'boolean',
        description:
          'True to write; default dry-run.',
      },
      overwrite: {
        type: 'boolean',
        description:
          'Replace an existing newSlug file.',
      },
      expected_mtime: {
        type: 'number',
        minimum: 0,
        description:
          'Conflict guard for oldSlug.',
      },
    },
    required: ['oldSlug', 'newSlug'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      dryRun: { type: 'boolean' },
      ...DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
      uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
      oldSlug: { type: 'string' },
      newSlug: { type: 'string' },
      sourcePath: { type: 'string' },
      targetPath: { type: 'string' },
      moved: { type: 'boolean' },
      backlinkUpdates: BACKLINK_REWRITE_PLAN_OUTPUT_SCHEMA,
      warnings: { type: 'array', items: { type: 'string' } },
      message: { type: 'string' },
      changed: { type: 'boolean' },
      postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
    },
    required: ['ok', 'dryRun', ...DESTRUCTIVE_PREVIEW_REQUIRED, 'uid', 'oldSlug', 'newSlug', 'sourcePath', 'targetPath', 'moved', 'backlinkUpdates'],
    additionalProperties: false,
  },
};

export const RECLASSIFY_CONCEPT_TOOL = {
  name: 'reclassify_concept',
  description:
    '⚠ MULTI-FILE WRITE: change a node\'s kind, and optionally its slug and domain, keeping its UID and redirecting backlinks like rename_concept; entries a referrer cannot keep are named in `warnings`. Defaults to dry-run.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: NON_BLANK_STRING_SCHEMA,
      newKind: { type: 'string', enum: ['project', 'domain', 'capability', 'element', 'document'] },
      newSlug: NON_BLANK_STRING_SCHEMA,
      domain: { type: ['string', 'null'], description: 'New domain; required for capability/element.' },
      body: { type: 'string' },
      confirm: { type: 'boolean' }, expected_mtime: { type: 'number', minimum: 0 },
    },
    required: ['slug', 'newKind'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' }, dryRun: { type: 'boolean' }, changed: { type: 'boolean' },
      ...DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
      uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
      oldSlug: NON_BLANK_STRING_SCHEMA, newSlug: NON_BLANK_STRING_SCHEMA,
      oldKind: NON_BLANK_STRING_SCHEMA, newKind: NON_BLANK_STRING_SCHEMA,
      sourcePath: NON_BLANK_STRING_SCHEMA, targetPath: NON_BLANK_STRING_SCHEMA,
      bodyAction: { type: 'string', enum: ['preserved', 'replaced_explicitly', 'regenerated_starter'] },
      backlinkUpdates: BACKLINK_REWRITE_PLAN_OUTPUT_SCHEMA,
      // Entries the kind change left in a list the referrer's kind keeps no list for the new kind in.
      warnings: { type: 'array', items: { type: 'string' } },
      postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
    },
    required: ['ok', 'dryRun', 'changed', ...DESTRUCTIVE_PREVIEW_REQUIRED, 'uid', 'oldSlug', 'newSlug', 'oldKind', 'newKind', 'sourcePath', 'targetPath', 'bodyAction', 'backlinkUpdates'],
    additionalProperties: false,
  },
};

export const MERGE_CONCEPTS_TOOL = {
  name: 'merge_concepts',
  description:
    '⚠ DESTRUCTIVE MULTI-FILE WRITE: fold a duplicate node into another: backlinks to fromSlug move to intoSlug, fromSlug is deleted, its UID goes to `merged_uids`; prose is not merged. Dry-run unless confirm: true. Confirmed writes return ' + POST_WRITE_MAINTENANCE_GUIDANCE + '.',
  inputSchema: {
    type: 'object',
    properties: {
      fromSlug: nonBlankStringSchema('Slug to dissolve and delete.'),
      intoSlug: nonBlankStringSchema('Slug to keep.'),
      confirm: {
        type: 'boolean',
        description:
          'True to write; default dry-run.',
      },
      expected_mtime: {
        type: 'number',
        minimum: 0,
        description:
          'Conflict guard for fromSlug.',
      },
      expected_into_mtime: {
        type: 'number',
        minimum: 0,
        description:
          'Conflict guard for the survivor intoSlug.',
      },
    },
    required: ['fromSlug', 'intoSlug'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      dryRun: { type: 'boolean' },
      ...DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
      fromUid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
      intoUid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
      absorbedUids: {
        type: 'array',
        items: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
      },
      fromSlug: { type: 'string' },
      intoSlug: { type: 'string' },
      fromPath: { type: 'string' },
      deleted: { type: 'boolean' },
      backlinkUpdates: BACKLINK_REWRITE_PLAN_OUTPUT_SCHEMA,
      // Entries a cross-kind merge left in a list the referrer keeps for the old kind.
      warnings: { type: 'array', items: { type: 'string' } },
      capturedFrom: CAPTURED_DOC_OUTPUT_SCHEMA,
      message: { type: 'string' },
      changed: { type: 'boolean' },
      postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
    },
    required: ['ok', 'dryRun', ...DESTRUCTIVE_PREVIEW_REQUIRED, 'fromUid', 'intoUid', 'absorbedUids', 'fromSlug', 'intoSlug', 'fromPath', 'deleted', 'backlinkUpdates', 'capturedFrom'],
    additionalProperties: false,
  },
};

export const DELETE_CONCEPT_TOOL = {
  name: 'delete_concept',
  description:
    '⚠ DESTRUCTIVE: permanently delete one node\'s .md file. Dry-run with a backlinks preview unless confirm: true; throws while backlinks exist unless force: true. Responses name the permanent `uid` plus current `slug`, and a deletion returns frontmatter and body for add_concept to recreate it. Confirmed deletes return ' + POST_WRITE_MAINTENANCE_GUIDANCE + '.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: nonBlankStringSchema('Vault-relative slug (omit the .md extension).'),
      confirm: {
        type: 'boolean',
        description:
          'True to delete; default dry-run.',
      },
      force: {
        type: 'boolean',
        description:
          'Delete despite backlinks; the referrers are left dangling.',
      },
      expected_mtime: {
        type: 'number',
        minimum: 0,
        description:
          'Conflict guard.',
      },
    },
    required: ['slug'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      dryRun: { type: 'boolean' },
      ...DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
      uid: { ...NON_BLANK_STRING_SCHEMA, pattern: NODE_UID_PATTERN },
      slug: NON_BLANK_STRING_SCHEMA,
      filePath: NON_BLANK_STRING_SCHEMA,
      backlinks: { type: 'array', items: BACKLINK_ROW_OUTPUT_SCHEMA },
      message: NON_BLANK_STRING_SCHEMA,
      forced: { type: 'boolean' },
      backlinksAtDelete: { type: 'array', items: BACKLINK_ROW_OUTPUT_SCHEMA },
      changed: { type: 'boolean' },
      captured: CAPTURED_DOC_OUTPUT_SCHEMA,
      postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
    },
    required: ['ok', 'dryRun', ...DESTRUCTIVE_PREVIEW_REQUIRED, 'uid', 'slug', 'filePath'],
    additionalProperties: false,
  },
};
