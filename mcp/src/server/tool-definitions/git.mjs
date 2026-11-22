import { nonBlankStringSchema } from '../tool-schemas/field-primitives.mjs';
import {
  GIT_HISTORY_OUTPUT_SCHEMA,
  GIT_RESULT_OUTPUT_SCHEMA,
  GIT_SNAPSHOT_OUTPUT_SCHEMA,
} from '../tool-schemas/git-results.mjs';

export const GIT_STATUS_TOOL = {
  name: 'git_status',
  description:
    'Inspect local Git state for the active vault only. Returns HEAD/branch, vault files, outside-vault change counts, staged-outside-vault warnings, and in-progress operation risk. Read-only; never initializes, stages, commits, or pushes.',
  inputSchema: { type: 'object', properties: {} },
  outputSchema: GIT_RESULT_OUTPUT_SCHEMA,
};

export const GIT_HISTORY_TOOL = {
  name: 'git_history',
  description:
    'Read newest-first commit history for the vault path only, with limited/hasMore, shallow-repository state and historyComplete so a truncated view is not taken as complete. Read-only; never fetches or pushes.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Default 20.',
      },
    },
  },
  outputSchema: GIT_HISTORY_OUTPUT_SCHEMA,
};

export const GIT_SNAPSHOT_TOOL = {
  name: 'git_snapshot',
  description:
    'Commit a local, vault-scoped Git checkpoint. Dry-run returns expectedHead, files, validation, risk and previewReady/canConfirm/wouldChange/blockedReasons; confirm:true with that expectedHead commits only the vault pathspec and never pushes.',
  inputSchema: {
    type: 'object',
    properties: {
      confirm: {
        type: 'boolean',
        description: 'True only after reviewing the dry-run.',
      },
      expectedHead: nonBlankStringSchema(
        'Required with confirm:true: the expectedHead of the preceding dry-run.',
      ),
      message: nonBlankStringSchema(
        'Optional one-line commit subject; generated when omitted.',
        { maxLength: 200, pattern: '^[^\\r\\n]+$' },
      ),
    },
  },
  outputSchema: GIT_SNAPSHOT_OUTPUT_SCHEMA,
};
