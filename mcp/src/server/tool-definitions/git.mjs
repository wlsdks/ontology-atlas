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
    'Read commit history scoped to the active vault path only. Returns bounded newest-first hashes, subjects, and authored timestamps plus limited/hasMore, shallow-repository state, and historyComplete so agents do not mistake a truncated or shallow view for complete evidence. Commits that touched only files outside the vault are excluded. Read-only; never initializes, fetches, pulls, commits, or pushes.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Maximum newest-first vault commits to return. Defaults to 20; maximum 100.',
      },
    },
  },
  outputSchema: GIT_HISTORY_OUTPUT_SCHEMA,
};

export const GIT_SNAPSHOT_TOOL = {
  name: 'git_snapshot',
  description:
    'Create a local, vault-scoped Git checkpoint. Dry-run by default and returns exact expectedHead, files, validation, risk, and the shared previewReady/canConfirm/wouldChange/blockedReasons safety contract. confirm:true requires that expectedHead, blocks validator errors and Git operations in progress, commits only the vault pathspec, leaves outside files untouched, and never pushes.',
  inputSchema: {
    type: 'object',
    properties: {
      confirm: {
        type: 'boolean',
        description: 'Default false. Set true only after reviewing the dry-run preview and its risk/validation fields.',
      },
      expectedHead: nonBlankStringSchema(
        'Required with confirm:true. Copy the exact expectedHead returned by the immediately preceding dry-run; this prevents committing after a concurrent HEAD change.',
      ),
      message: nonBlankStringSchema(
        'Optional local commit subject, one line and at most 200 characters. A deterministic ontology snapshot subject is generated when omitted.',
        { maxLength: 200, pattern: '^[^\\r\\n]+$' },
      ),
    },
  },
  outputSchema: GIT_SNAPSHOT_OUTPUT_SCHEMA,
};
