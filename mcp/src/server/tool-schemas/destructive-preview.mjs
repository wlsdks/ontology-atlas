import { NON_BLANK_STRING_SCHEMA } from './field-primitives.mjs';

const DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES = Object.freeze({
  previewReady: {
    type: 'boolean',
    description: 'True only when this response is a complete dry-run preview that an agent can review.',
  },
  canConfirm: {
    type: 'boolean',
    description: 'True only when repeating the call with confirm:true can perform the previewed change without another explicit safety opt-in.',
  },
  wouldChange: {
    type: 'boolean',
    description: 'True only when the dry-run predicts a disk or Git change.',
  },
  blockedReasons: {
    type: 'array',
    items: NON_BLANK_STRING_SCHEMA,
    description: 'Machine-readable human explanations for every condition currently blocking confirmation.',
  },
});
const DESTRUCTIVE_PREVIEW_REQUIRED = Object.freeze([
  'previewReady',
  'canConfirm',
  'wouldChange',
  'blockedReasons',
]);

export {
  DESTRUCTIVE_PREVIEW_OUTPUT_PROPERTIES,
  DESTRUCTIVE_PREVIEW_REQUIRED,
};
