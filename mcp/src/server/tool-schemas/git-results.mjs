import {
  DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
  DESTRUCTIVE_PREVIEW_REQUIRED,
} from './destructive-preview.mjs';
import { NON_BLANK_STRING_SCHEMA } from './field-primitives.mjs';

const GIT_FILE_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    path: NON_BLANK_STRING_SCHEMA,
    index: { type: 'string', minLength: 1, maxLength: 1 },
    worktree: { type: 'string', minLength: 1, maxLength: 1 },
    status: { type: 'string', enum: ['untracked', 'added', 'modified', 'deleted'] },
    staged: { type: 'boolean' },
    unstaged: { type: 'boolean' },
  },
  required: ['path', 'index', 'worktree', 'status', 'staged', 'unstaged'],
  additionalProperties: false,
});
const GIT_COUNTS_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    total: { type: 'integer', minimum: 0 },
    staged: { type: 'integer', minimum: 0 },
    unstaged: { type: 'integer', minimum: 0 },
    untracked: { type: 'integer', minimum: 0 },
    outsideVault: { type: 'integer', minimum: 0 },
    stagedOutsideVault: { type: 'integer', minimum: 0 },
  },
  required: ['total', 'staged', 'unstaged', 'untracked', 'outsideVault', 'stagedOutsideVault'],
  additionalProperties: false,
});
const GIT_RISK_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    level: { type: 'string', enum: ['low', 'medium', 'high'] },
    warnings: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
  },
  required: ['level', 'warnings'],
  additionalProperties: false,
});
const GIT_RESULT_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    operation: { type: 'string', enum: ['git_status', 'git_snapshot'] },
    ok: { type: 'boolean' },
    reason: NON_BLANK_STRING_SCHEMA,
    repoRoot: NON_BLANK_STRING_SCHEMA,
    vaultRoot: NON_BLANK_STRING_SCHEMA,
    vaultPathspec: NON_BLANK_STRING_SCHEMA,
    head: { type: ['string', 'null'] },
    branch: { type: ['string', 'null'] },
    detachedHead: { type: 'boolean' },
    operationInProgress: { type: ['string', 'null'] },
    counts: GIT_COUNTS_OUTPUT_SCHEMA,
    files: { type: 'array', items: GIT_FILE_OUTPUT_SCHEMA },
    stagedOutsideVault: { type: 'array', items: NON_BLANK_STRING_SCHEMA },
    risk: GIT_RISK_OUTPUT_SCHEMA,
    dryRun: { type: 'boolean' },
    committed: { type: 'boolean' },
    expectedHead: { type: ['string', 'null'] },
    previousHead: NON_BLANK_STRING_SCHEMA,
    subject: NON_BLANK_STRING_SCHEMA,
    commitHash: NON_BLANK_STRING_SCHEMA,
    commitSummary: { type: 'string' },
    pushSupported: { type: 'boolean' },
    pushReason: NON_BLANK_STRING_SCHEMA,
    validation: {
      type: 'object',
      properties: {
        scanned: { type: 'integer', minimum: 0 },
        problemFiles: { type: 'integer', minimum: 0 },
        errorFiles: { type: 'integer', minimum: 0 },
        warningFiles: { type: 'integer', minimum: 0 },
        pathDrifts: { type: 'integer', minimum: 0 },
      },
      required: ['scanned', 'problemFiles', 'errorFiles', 'warningFiles', 'pathDrifts'],
      additionalProperties: false,
    },
  },
  required: ['operation', 'ok', 'repoRoot', 'vaultRoot'],
  additionalProperties: false,
});

const GIT_SNAPSHOT_OUTPUT_SCHEMA = Object.freeze({
  ...GIT_RESULT_OUTPUT_SCHEMA,
  properties: {
    ...GIT_RESULT_OUTPUT_SCHEMA.properties,
    ...DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
  },
  required: [
    ...GIT_RESULT_OUTPUT_SCHEMA.required,
    'dryRun',
    'committed',
    ...DESTRUCTIVE_PREVIEW_REQUIRED,
  ],
});
const GIT_HISTORY_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    operation: { type: 'string', enum: ['git_history'] },
    ok: { type: 'boolean' },
    reason: NON_BLANK_STRING_SCHEMA,
    repoRoot: NON_BLANK_STRING_SCHEMA,
    vaultRoot: NON_BLANK_STRING_SCHEMA,
    vaultPathspec: NON_BLANK_STRING_SCHEMA,
    head: { type: ['string', 'null'] },
    branch: { type: ['string', 'null'] },
    limit: { type: 'integer', minimum: 1, maximum: 100 },
    count: { type: 'integer', minimum: 0 },
    limited: { type: 'boolean' },
    hasMore: { type: 'boolean' },
    shallow: { type: 'boolean' },
    historyComplete: { type: 'boolean' },
    commits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hash: NON_BLANK_STRING_SCHEMA,
          shortHash: NON_BLANK_STRING_SCHEMA,
          authoredAt: NON_BLANK_STRING_SCHEMA,
          subject: { type: 'string' },
        },
        required: ['hash', 'shortHash', 'authoredAt', 'subject'],
        additionalProperties: false,
      },
    },
  },
  required: ['operation', 'ok', 'repoRoot', 'vaultRoot'],
  additionalProperties: false,
});

export {
  GIT_RESULT_OUTPUT_SCHEMA,
  GIT_SNAPSHOT_OUTPUT_SCHEMA,
  GIT_HISTORY_OUTPUT_SCHEMA,
};
