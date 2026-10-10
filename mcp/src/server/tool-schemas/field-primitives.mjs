// Primitive field schemas and builders.

const NON_BLANK_STRING_SCHEMA = Object.freeze({
  type: 'string',
  minLength: 1,
  pattern: '^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$',
});
const NON_BLANK_MULTILINE_TEXT_SCHEMA = Object.freeze({
  type: 'string',
  minLength: 1,
  pattern: '^(?!\\s)(?![\\s\\S]*\\s$)(?![\\s\\S]*\\u0000)[\\s\\S]+$',
});

// `title` stays the source for search and file identity; only render surfaces read `display_<locale>`.
const LOCALE_LABELS_SCHEMA = Object.freeze({
  type: 'object',
  description:
    'Per-locale display names, e.g. { "ko": "결제", "en": "Payments" }. Written as `display_ko` / `display_en` frontmatter keys; `title` stays the single source for search/matching. Fill BOTH locales the vault serves — a single-locale entry comes back as a warning.',
  properties: {
    ko: { type: 'string', description: 'Korean display name.' },
    en: { type: 'string', description: 'English display name.' },
  },
  additionalProperties: { type: 'string' },
});

function nonBlankStringSchema(description, extra = {}) {
  return {
    ...NON_BLANK_STRING_SCHEMA,
    ...extra,
    description,
  };
}

function paginationOutputSchema() {
  return {
    type: 'object',
    properties: {
      offset: { type: 'integer', minimum: 0 },
      limit: { type: 'integer', minimum: 0 },
      total: { type: 'integer', minimum: 0 },
      returned: { type: 'integer', minimum: 0 },
      hasMore: { type: 'boolean' },
      nextOffset: { type: ['integer', 'null'], minimum: 0 },
    },
    required: ['offset', 'limit', 'total', 'returned', 'hasMore', 'nextOffset'],
    additionalProperties: false,
  };
}

export {
  NON_BLANK_STRING_SCHEMA,
  NON_BLANK_MULTILINE_TEXT_SCHEMA,
  LOCALE_LABELS_SCHEMA,
  nonBlankStringSchema,
  paginationOutputSchema,
};
