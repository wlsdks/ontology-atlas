import { MEANING_COMPETENCY_QUESTIONS } from '../../meaning/meaning-assessment.mjs';
import { COMPETENCY_ROW_WITNESSES_MAX } from '../../project-meaning/competency-answers.mjs';
import {
  NON_BLANK_MULTILINE_TEXT_SCHEMA,
  NON_BLANK_STRING_SCHEMA,
  nonBlankStringSchema,
} from '../tool-schemas/field-primitives.mjs';
import { MEANING_ASSESSMENT_OUTPUT_SCHEMA } from '../tool-schemas/meaning-construction.mjs';
import {
  PROJECT_SOURCE_ACTION_SCHEMA,
  PROJECT_SOURCE_BINDING_VIEW_SCHEMA,
  PROJECT_SOURCE_GAP_SCHEMA,
  PROJECT_SOURCE_NEXT_CALL_SCHEMA,
  PROJECT_SOURCE_WITNESS_SUMMARY_SCHEMA,
} from '../tool-schemas/project-source-shapes.mjs';

const COMPETENCY_QUESTION_LIST = MEANING_COMPETENCY_QUESTIONS
  .map(({ id, question, requiredWitnesses }) => `\`${id}\`: ${question} (answered needs ${requiredWitnesses.join(', ')})`)
  .join(' ');

export const FINALIZE_PROJECT_MEANING_TOOL = {
  name: 'finalize_project_meaning',
  description:
    'Finalize the project\'s competency answers, the last construction step after concept/relation writes, `validate_vault` and `connect_project_source`. With `answers` the server writes the body\'s `## Competency answers` section and finalizes in one call; without, it finalizes the section already there. Evidence an answer names inside the connected folder is measured; a project with no connected folder is refused, and a refusal names each row and the argument to change and writes nothing. Writes a provenance receipt to `.ontology-atlas/project-meaning.json` with no answer text or absolute root. `ok: true` means the receipt was written, not that source currentness is verified; read `meaningAssessment`.',
  inputSchema: {
    type: 'object',
    properties: {
      projectSlug: nonBlankStringSchema(
        'Project slug or unambiguous alias.',
      ),
      expected_mtime: {
        type: 'number',
        minimum: 0,
        description:
          'Project mtime from its last read or write. Without `answers` any edit since blocks; with `answers` an older value is accepted.',
      },
      answers: {
        type: 'array',
        minItems: MEANING_COMPETENCY_QUESTIONS.length,
        maxItems: MEANING_COMPETENCY_QUESTIONS.length,
        description:
          `One row per fixed question: ${COMPETENCY_QUESTION_LIST} ` +
          'An `answered` row carries every witness list its question names, non-empty, or it is refused; `partial` or `visible-gap` needs `gap`. Call without `answers` and the refusal shows the layout.',
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
              description: 'Declared relations by stored key (domains, capabilities, elements, depends_on).',
            },
            evidence: {
              type: 'array',
              maxItems: COMPETENCY_ROW_WITNESSES_MAX,
              items: NON_BLANK_STRING_SCHEMA,
              description: 'Repository-relative files or folders, or `source:<path>#L<a>-L<b>@sha256:<hex>`.',
            },
            paths: { type: 'array', maxItems: COMPETENCY_ROW_WITNESSES_MAX, items: NON_BLANK_STRING_SCHEMA, description: 'Repository-relative files or folders.' },
            gap: nonBlankStringSchema('What is missing, one line; required unless answered.'),
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

const SOURCE_STATE_PROPERTIES = {
  status: {
    type: 'string',
    enum: ['needs_evidence', 'review_required', 'verified_current', 'invalid', 'not_measured'],
    description: 'The source receipt\'s state. The receipt itself stays in the vault sidecar.',
  },
  nextAction: PROJECT_SOURCE_ACTION_SCHEMA,
  topGap: PROJECT_SOURCE_GAP_SCHEMA,
};

export const CONNECT_PROJECT_SOURCE_TOOL = {
  name: 'connect_project_source',
  description:
    'Bind a project node to the local code folder it describes, measure it and write the source receipt; this answers `nextAction: connect_source` and its repair and re-measure actions. Omit `rootPath` to infer it. Without `confirm: true` nothing is written: you get the proposed folder, how many `path:` claims land in it and the confirming call. Where the server asks a person to approve each write, one call is the whole job: the approval names the folder and the call then writes (`confirm: false` still only previews). Answers `status`, `nextAction` and `topGap`; the absolute root stays in a sidecar the vault ignores.',
  inputSchema: {
    type: 'object',
    properties: {
      projectSlug: nonBlankStringSchema(
        'Project slug or unambiguous alias.',
      ),
      rootPath: nonBlankStringSchema(
        'Absolute code folder. Omit to infer, or to re-measure the binding.',
      ),
      confirm: {
        type: 'boolean',
        description: 'Required to write unless a person\'s approval of this call is the confirmation; false forces a preview.',
      },
      repair: {
        type: 'boolean',
        description:
          'Replace a malformed project-sources.json instead of refusing.',
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
      inferredFrom: { type: 'string', enum: ['enclosing_git_repository', 'ancestor_project_manifest'], description: 'What named the folder when `rootPath` was omitted.' },
      binding: PROJECT_SOURCE_BINDING_VIEW_SCHEMA,
      ...SOURCE_STATE_PROPERTIES,
      witnessSummary: PROJECT_SOURCE_WITNESS_SUMMARY_SCHEMA,
      nextCall: PROJECT_SOURCE_NEXT_CALL_SCHEMA,
    },
    required: ['ok', 'changed', 'confirmed', 'contract', 'projectSlug', 'mode', 'binding', 'status', 'nextAction', 'topGap', 'witnessSummary'],
    additionalProperties: false,
  },
};

export const DISCONNECT_PROJECT_SOURCE_TOOL = {
  name: 'disconnect_project_source',
  description:
    'Remove a project node\'s local source binding and its receipt, when the wrong folder was bound or to stop measuring; the reversal of connect_project_source. Without `confirm: true` it only reports what would be removed. No other binding or markdown changes.',
  inputSchema: {
    type: 'object',
    properties: {
      projectSlug: nonBlankStringSchema('Project slug.'),
      confirm: {
        type: 'boolean',
        description: 'Required to write.',
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
      ...SOURCE_STATE_PROPERTIES,
      nextCall: PROJECT_SOURCE_NEXT_CALL_SCHEMA,
    },
    required: ['ok', 'changed', 'confirmed', 'contract', 'projectSlug', 'removed', 'bindings'],
    additionalProperties: false,
  },
};
