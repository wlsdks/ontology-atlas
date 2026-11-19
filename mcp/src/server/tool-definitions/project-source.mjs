import { MEANING_COMPETENCY_QUESTIONS } from '../../meaning/meaning-assessment.mjs';
import { COMPETENCY_ROW_WITNESSES_MAX } from '../../project-meaning/competency-answers.mjs';
import {
  NON_BLANK_MULTILINE_TEXT_SCHEMA,
  NON_BLANK_STRING_SCHEMA,
  nonBlankStringSchema,
} from '../tool-schemas/field-primitives.mjs';
import { MEANING_ASSESSMENT_OUTPUT_SCHEMA } from '../tool-schemas/meaning-construction.mjs';
import {
  PROJECT_SOURCE_BINDING_VIEW_SCHEMA,
  PROJECT_SOURCE_NEXT_CALL_SCHEMA,
  PROJECT_SOURCE_RECEIPT_SCHEMA,
  PROJECT_SOURCE_REMEDY_SCHEMA,
  PROJECT_SOURCE_VIEW_SCHEMA,
} from '../tool-schemas/project-source-shapes.mjs';

const COMPETENCY_QUESTION_LIST = MEANING_COMPETENCY_QUESTIONS
  .map(({ id, question, requiredWitnesses }) => `\`${id}\`: ${question} (answered needs ${requiredWitnesses.join(', ')})`)
  .join(' ');

export const FINALIZE_PROJECT_MEANING_TOOL = {
  name: 'finalize_project_meaning',
  description:
    'Finalize the project\'s competency answers after concept/relation writes, `validate_vault` and `connect_project_source`. ' +
    'Pass `answers` and the server writes the project body\'s `## Competency answers` section from them (replacing one that exists), then finalizes, in one call; without `answers` it finalizes the section already in the body. ' +
    'Each evidence file or path an answer names inside the folder this project is connected to is measured in the same call; a project with no connected folder is refused. ' +
    'A refusal names each row, the reason and the argument to change, and writes nothing. ' +
    'The server derives the body digest, project graph hash, source fingerprint and witness inventory itself, and writes a small provenance receipt to `.ontology-atlas/project-meaning.json` that holds no answer text, absolute source root or remote coordinate. ' +
    '`ok: true` means the receipt was written, not that source currentness is verified; read `meaningAssessment` for the fail-closed categorical result.',
  inputSchema: {
    type: 'object',
    properties: {
      projectSlug: nonBlankStringSchema(
        'Exact project node slug (or an unambiguous vault alias) to finalize.',
      ),
      expected_mtime: {
        type: 'number',
        minimum: 0,
        description:
          'The project node mtime from its last write or get_concept. Without `answers` it is a conflict guard: any edit since blocks finalization. ' +
          'With `answers` the server replaces only that section in the body as it is now, so an older value is accepted.',
      },
      answers: {
        type: 'array',
        minItems: MEANING_COMPETENCY_QUESTIONS.length,
        maxItems: MEANING_COMPETENCY_QUESTIONS.length,
        description:
          `One row per fixed question: ${COMPETENCY_QUESTION_LIST} ` +
          'An `answered` row carries every witness list its question names, non-empty, or it is refused; `partial` or `visible-gap` needs `gap`, one line naming what is missing. ' +
          'More: connection_info({guide:"competency"}).',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', enum: MEANING_COMPETENCY_QUESTIONS.map(({ id }) => id) },
            status: { type: 'string', enum: ['answered', 'partial', 'visible-gap'] },
            answer: { ...NON_BLANK_MULTILINE_TEXT_SCHEMA, description: 'Plain sentences; no heading and no "- Label:" line.' },
            concepts: { type: 'array', maxItems: COMPETENCY_ROW_WITNESSES_MAX, items: NON_BLANK_STRING_SCHEMA, description: 'Slugs inside this project.' },
            relations: {
              type: 'array',
              maxItems: COMPETENCY_ROW_WITNESSES_MAX,
              items: {
                type: 'object',
                properties: { from: NON_BLANK_STRING_SCHEMA, to: NON_BLANK_STRING_SCHEMA, type: NON_BLANK_STRING_SCHEMA },
                required: ['from', 'to', 'type'],
                additionalProperties: false,
              },
              description: 'Declared relations by their stored key: `domains`, `capabilities`, `elements`, `depends_on`.',
            },
            evidence: {
              type: 'array',
              maxItems: COMPETENCY_ROW_WITNESSES_MAX,
              items: NON_BLANK_STRING_SCHEMA,
              description: 'Repository-relative files or folders, such as `README.md`, or a pinned `source:<path>#L<a>-L<b>@sha256:<64 hex>`.',
            },
            paths: { type: 'array', maxItems: COMPETENCY_ROW_WITNESSES_MAX, items: NON_BLANK_STRING_SCHEMA, description: 'Repository-relative files or folders.' },
            gap: nonBlankStringSchema('What is missing, in one line; required unless status is answered.'),
          },
          required: ['id', 'status', 'answer'],
          additionalProperties: false,
        },
      },
    },
    required: ['projectSlug', 'expected_mtime'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      changed: { type: 'boolean' },
      contract: { type: 'string', enum: ['projectMeaningReceipt:v1'] },
      projectSlug: NON_BLANK_STRING_SCHEMA,
      bodyDigest: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
      graphHash: { type: 'string', pattern: '^project-graph-v1:[a-f0-9]{8}$' },
      sourceFingerprint: NON_BLANK_STRING_SCHEMA,
      measuredAt: { type: 'string', format: 'date-time' },
      meaningAssessment: MEANING_ASSESSMENT_OUTPUT_SCHEMA,
    },
    required: [
      'ok',
      'changed',
      'contract',
      'projectSlug',
      'bodyDigest',
      'graphHash',
      'sourceFingerprint',
      'measuredAt',
      'meaningAssessment',
    ],
    additionalProperties: false,
  },
};

export const CONNECT_PROJECT_SOURCE_TOOL = {
  name: 'connect_project_source',
  description:
    'Bind a project node to the local code folder it describes, measure it, and write the source receipt. '
    + 'This is what `nextAction: connect_source` (and `repair_source_binding` / `measure_source` / `remeasure_source`) asks for. '
    + 'Omit `rootPath` and the server infers it: the git repository enclosing the vault wins, otherwise the nearest ancestor folder carrying a project manifest. '
    + 'Without `confirm: true` nothing is written — you get the proposed folder, how many declared `path:` claims actually land in it, and the exact confirming call. '
    + 'Re-running with a different `rootPath` replaces the binding; `disconnect_project_source` removes it. '
    + 'The absolute root stays in the local gitignored sidecar `.ontology-atlas/project-sources.json` and never enters the receipt, the graph markdown, or any handoff.',
  inputSchema: {
    type: 'object',
    properties: {
      projectSlug: nonBlankStringSchema(
        'Exact project node slug (or an unambiguous vault alias) to bind.',
      ),
      rootPath: nonBlankStringSchema(
        'Absolute local folder holding the code. Omit to auto-infer, or to re-measure an existing binding.',
      ),
      confirm: {
        type: 'boolean',
        description: 'Required to write. Default false returns the proposal and changes nothing.',
      },
      repair: {
        type: 'boolean',
        description:
          'Discard a malformed .ontology-atlas/project-sources.json instead of refusing to write over it.',
      },
    },
    required: ['projectSlug'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      changed: { type: 'boolean' },
      confirmed: { type: 'boolean' },
      contract: { type: 'string', enum: ['projectSourceConnect:v1'] },
      projectSlug: NON_BLANK_STRING_SCHEMA,
      mode: { type: 'string', enum: ['connect', 'replace', 'remeasure'] },
      binding: PROJECT_SOURCE_BINDING_VIEW_SCHEMA,
      inference: { type: ['object', 'null'], additionalProperties: true },
      previewReceipt: PROJECT_SOURCE_RECEIPT_SCHEMA,
      projectSource: PROJECT_SOURCE_VIEW_SCHEMA,
      remedy: PROJECT_SOURCE_REMEDY_SCHEMA,
      previousBindingCount: { type: 'number' },
      nextCall: PROJECT_SOURCE_NEXT_CALL_SCHEMA,
      undo: { type: ['object', 'null'] },
    },
    required: ['ok', 'changed', 'confirmed', 'contract', 'projectSlug', 'mode', 'binding'],
    additionalProperties: false,
  },
};

export const DISCONNECT_PROJECT_SOURCE_TOOL = {
  name: 'disconnect_project_source',
  description:
    'Remove a project node\'s local source binding and its receipt. The reversal of connect_project_source — use it when the wrong folder was bound, or to stop measuring. '
    + 'Without `confirm: true` it only reports what would be removed. Other projects\' bindings are never touched, and no ontology markdown changes.',
  inputSchema: {
    type: 'object',
    properties: {
      projectSlug: nonBlankStringSchema('Project node slug whose source binding should be removed.'),
      confirm: {
        type: 'boolean',
        description: 'Required to write. Default false lists the binding that would be removed.',
      },
    },
    required: ['projectSlug'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      changed: { type: 'boolean' },
      confirmed: { type: 'boolean' },
      contract: { type: 'string', enum: ['projectSourceDisconnect:v1'] },
      projectSlug: NON_BLANK_STRING_SCHEMA,
      removed: { type: 'number' },
      bindings: { type: 'array' },
      projectSource: PROJECT_SOURCE_VIEW_SCHEMA,
      remedy: PROJECT_SOURCE_REMEDY_SCHEMA,
      nextCall: PROJECT_SOURCE_NEXT_CALL_SCHEMA,
    },
    required: ['ok', 'changed', 'confirmed', 'contract', 'projectSlug', 'removed', 'bindings'],
    additionalProperties: false,
  },
};
