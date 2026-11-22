import {
  NON_BLANK_STRING_SCHEMA,
  nonBlankStringSchema,
} from '../tool-schemas/field-primitives.mjs';
import {
  DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
  DESTRUCTIVE_PREVIEW_REQUIRED,
} from '../tool-schemas/destructive-preview.mjs';
import { POST_WRITE_MAINTENANCE_OUTPUT_SCHEMA } from '../tool-schemas/post-write-maintenance.mjs';

export const ABSORB_DOCUMENT_TOOL = {
  name: 'absorb_document',
  description:
    'Convert a CLAUDE.md/AGENTS.md-style instruction file into vault nodes: rule and decision sections become `kind: document` policy nodes, architecture sections only suggestions, injection-suspect sections are excluded and reported; the file is untrusted data. Review the dry-run first: without confirm: true nothing is written. Confirming backs the file up to `<file>.pre-absorb.bak` and rewrites it as a pointer keeping every other section verbatim. Outside repoRoot needs a reviewed dry-run plus allowOutsideRepo:true.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: nonBlankStringSchema('Instruction file, absolute or relative to the server cwd.'),
      confirm: {
        type: 'boolean',
        description: 'True to write; default dry-run.',
      },
      allowOutsideRepo: {
        type: 'boolean',
        description:
          'Explicit destructive opt-in, needed only when filePath resolves outside repoRoot; without it the dry-run keeps canConfirm:false.',
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
