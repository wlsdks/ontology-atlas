import {
  NON_BLANK_STRING_SCHEMA,
  nonBlankStringSchema,
} from '../tool-schemas/field-primitives.mjs';
import {
  DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
  DESTRUCTIVE_PREVIEW_REQUIRED,
} from '../tool-schemas/git-results.mjs';
import { POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA } from '../tool-schemas/post-write-maintenance.mjs';

export const ABSORB_DOCUMENT_TOOL = {
  name: 'absorb_document',
  description:
    'Slice 0 (PRODUCT-PLAN-2026-07.md §4/§9) — the "absorption tool". Converts a CLAUDE.md/AGENTS.md-style ' +
    'markdown file into typed vault nodes so a tech lead\'s existing agent-instruction file stops needing ' +
    'dual maintenance. Splits the file by `##` sections and classifies each:\n' +
    '  - rule/policy/decision sections → `kind: document` nodes with a `role: policy` frontmatter extra.\n' +
    '  - architecture/component sections → element/capability SUGGESTIONS only — never auto-written; ' +
    'review and land with add_concept if useful.\n' +
    '  - sections matching an injection-suspect pattern (Tier 1 — imperative instruction-hijack phrasing, ' +
    'shell/SQL fragments) are excluded from absorption regardless of category and reported for human review. ' +
    'The file body is always treated as untrusted data; parsing never executes or evaluates its content.\n' +
    'Two-stage safety, same shape as delete_concept:\n' +
    '  1. Without confirm: true the call is a dry-run — returns the classification plan per section, no writes.\n' +
    '  2. With confirm: true, absorbed sections are written as document nodes, the source file is backed up ' +
    'to `<file>.pre-absorb.bak`, then rewritten into a "slim pointer" that reproduces every non-absorbed ' +
    'section (suggested, unclassified, or injection-suspect) verbatim — content is never destroyed. ' +
    'Throws instead of overwriting an existing backup file. The canonical source path must be inside repoRoot; ' +
    'outside paths (including symlink escapes) require an reviewed dry-run plus explicit allowOutsideRepo:true.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: nonBlankStringSchema('Path to the CLAUDE.md/AGENTS.md-style markdown file to absorb (absolute, or relative to the MCP server cwd).'),
      confirm: {
        type: 'boolean',
        description: 'Actually write when true. Omit or false for a dry-run (plan only, no writes).',
      },
      allowOutsideRepo: {
        type: 'boolean',
        description:
          'Explicit destructive opt-in required only when filePath resolves outside repoRoot. Dry-run reports outsideRepo and keeps canConfirm:false without it.',
      },
    },
    required: ['filePath'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      dryRun: { type: 'boolean' },
      ...DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
      filePath: NON_BLANK_STRING_SCHEMA,
      outsideRepo: { type: 'boolean' },
      sourceLabel: NON_BLANK_STRING_SCHEMA,
      title: { type: ['string', 'null'] },
      summary: {
        type: 'object',
        properties: {
          total: { type: 'integer', minimum: 0 },
          absorbed: { type: 'integer', minimum: 0 },
          suggested: { type: 'integer', minimum: 0 },
          injectionSuspect: { type: 'integer', minimum: 0 },
          unclassified: { type: 'integer', minimum: 0 },
        },
        required: ['total', 'absorbed', 'suggested', 'injectionSuspect', 'unclassified'],
        additionalProperties: false,
      },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            heading: NON_BLANK_STRING_SCHEMA,
            category: { type: 'string', enum: ['policy', 'architecture', 'unclassified'] },
            kind: { type: ['string', 'null'] },
            role: { type: ['string', 'null'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            action: { type: 'string', enum: ['absorb', 'suggest', 'skip'] },
            targetSlug: { type: ['string', 'null'] },
            injectionSuspect: { type: 'boolean' },
            injectionMatches: { type: 'array', items: { type: 'string' } },
          },
          required: ['heading', 'category', 'confidence', 'action', 'injectionSuspect', 'injectionMatches'],
          additionalProperties: false,
        },
      },
      written: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slug: NON_BLANK_STRING_SCHEMA,
            filePath: NON_BLANK_STRING_SCHEMA,
          },
          required: ['slug', 'filePath'],
          additionalProperties: false,
        },
      },
      backupPath: { type: 'string' },
      changed: { type: 'boolean' },
      message: NON_BLANK_STRING_SCHEMA,
      postWriteMaintenance: POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA,
    },
    required: ['ok', 'dryRun', ...DESTRUCTIVE_PREVIEW_REQUIRED, 'filePath', 'outsideRepo', 'sourceLabel', 'summary', 'sections', 'message'],
    additionalProperties: false,
  },
};
