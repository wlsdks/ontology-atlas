import { NODE_UID_PATTERN } from '../../schema.mjs';
import {
  BACKLINK_REWRITE_PLAN_OUTPUT_SCHEMA,
  BACKLINK_ROW_OUTPUT_SCHEMA,
  CAPTURED_DOC_OUTPUT_SCHEMA,
  DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
  DESTRUCTIVE_PREVIEW_REQUIRED,
  NON_BLANK_STRING_SCHEMA,
  POST_WRITE_MAINTENANCE_GUIDANCE,
  POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
  nonBlankStringSchema,
} from '../tool-schemas.mjs';

export const RENAME_CONCEPT_TOOL = {
  name: 'rename_concept',
  description:
    '⚠ MULTI-FILE WRITE — change a slug and update every backlink in one atomic graph-level operation. ' +
    'The node UID is preserved; only its current human-readable slug changes. ' +
    'Renames the .md file (oldSlug → newSlug, directory move OK), updates the moved file\'s ' +
    'frontmatter `slug:` key, and rewrites every backlink — frontmatter array entries (capabilities / ' +
    'elements / dependencies / relates / contains / describes), inline-string keys, and body links ' +
    '`[[oldSlug]]` / `(oldSlug.md)`. Tail-only references (`mcp-server` for `capabilities/mcp-server`) ' +
    'are also redirected to the new tail. Two-stage safety:\n' +
    '  1. Without confirm: true the call is a dry-run — returns `updates` (each affected file with ' +
    'before/after array keys + bodyChanged flag) without writing.\n' +
    '  2. With confirm: true the file is moved and all backlinks are rewritten in one pass.\n' +
    'Throws if oldSlug missing or newSlug already taken (unless overwrite: true). Use this instead ' +
    'of patch_concept + N find_backlinks + N patch_concept loops. Confirmed writes return ' +
    POST_WRITE_MAINTENANCE_GUIDANCE + ' for the final graph.',
  inputSchema: {
    type: 'object',
    properties: {
      oldSlug: nonBlankStringSchema('Current vault-relative slug (omit the .md extension).'),
      newSlug: nonBlankStringSchema(
        'Target vault-relative slug (omit the .md extension). Directories are created if needed.',
      ),
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
        minimum: 0,
        description:
          'Optional conflict guard for oldSlug. Pass the `mtime` from get_concept; throws VaultConflictError if the source has been modified externally since you read it.',
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
    '⚠ MULTI-FILE WRITE — change a concept kind and optionally its canonical slug/domain in one previewable transaction. The permanent UID is preserved. Redirects backlinks like rename_concept, and a referrer that lists the node under domains/capabilities/elements moves the entry to the list for the new kind when its own kind keeps that list; otherwise the entry stays and `warnings` names it. Replaces a generated starter body with the new kind template while preserving custom prose. Defaults to dry-run.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: nonBlankStringSchema('Current canonical slug.'),
      newKind: { type: 'string', enum: ['project', 'domain', 'capability', 'element', 'document'] },
      newSlug: nonBlankStringSchema('Optional new canonical slug.'),
      domain: { type: ['string', 'null'], description: 'New domain; required for capability/element.' },
      body: { type: 'string', description: 'Optional explicit replacement body.' },
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
      // Referrer entries the kind change could not move.
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
    '⚠ DESTRUCTIVE MULTI-FILE WRITE — fold one node into another. Every backlink to fromSlug is ' +
    'redirected to intoSlug (frontmatter array entries + body links), then fromSlug is deleted. The ' +
    'survivor keeps its UID while the source UID/history is recorded in canonical `merged_uids`. The ' +
    'intoSlug prose and non-identity frontmatter are preserved as-is — they are not merged automatically (use ' +
    'patch_concept after if you want to combine descriptions). Tail-only references are also ' +
    'redirected. Two-stage safety:\n' +
    '  1. Without confirm: true the call is a dry-run — returns the redirect plan + list of deletions ' +
    'without writing.\n' +
    '  2. With confirm: true the rewrites and the delete happen in one pass.\n' +
    'Throws if either slug is missing. Confirmed writes return ' + POST_WRITE_MAINTENANCE_GUIDANCE + ' for the final graph.',
  inputSchema: {
    type: 'object',
    properties: {
      fromSlug: nonBlankStringSchema('Slug to dissolve. Its file is deleted after backlinks redirect.'),
      intoSlug: nonBlankStringSchema('Slug to keep. Receives every redirected backlink.'),
      confirm: {
        type: 'boolean',
        description:
          'Actually perform the merge when true. Omit or false for a dry-run.',
      },
      expected_mtime: {
        type: 'number',
        minimum: 0,
        description:
          'Optional conflict guard for fromSlug. Throws if the source has been modified externally.',
      },
      expected_into_mtime: {
        type: 'number',
        minimum: 0,
        description:
          'Optional conflict guard for intoSlug. Pass the survivor mtime from get_concept so a concurrent edit or identity-history change is never overwritten.',
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
      // Referrer entries a cross-kind merge could not move.
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
    '⚠ DESTRUCTIVE — permanently deletes the vault .md file. Two-stage safety:\n' +
    'Both preview and confirmed responses identify the node by permanent `uid` plus current `slug`. ' +
    '  1. Without confirm: true the call is a dry-run — returns a backlinks preview without deleting.\n' +
    '  2. If any backlinks exist the call throws — refuses while other nodes still reference this slug. ' +
    'Pass force: true to delete anyway (the referrers become dangling).\n' +
    'Successful deletion returns the frontmatter + body so a user who deleted by mistake ' +
    'can recreate the node via add_concept. Directories are left untouched. Pass ' +
    '`expected_mtime` to guard against concurrent external edits — throws if the file ' +
    'changed on disk since you read it. Confirmed deletes return ' + POST_WRITE_MAINTENANCE_GUIDANCE + ' for the final graph.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: nonBlankStringSchema('Vault-relative slug (omit the .md extension).'),
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
        minimum: 0,
        description:
          'Optional conflict guard — file mtimeMs at read time. If it differs at delete time, the call throws.',
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
