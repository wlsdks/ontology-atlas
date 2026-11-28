import { isDeepStrictEqual } from 'node:util';
import { NODE_UID_PATTERN } from '../server-vocabularies.mjs';

import { sameArray } from '../value-checks.mjs';

export function propertyAt(tool, path) {
  return path.reduce((value, key) => value?.[key], tool?.inputSchema);
}

export function outputPropertyAt(tool, path) {
  return path.reduce((value, key) => value?.[key], tool?.outputSchema);
}

export const NON_BLANK_STRING_PATTERN = '^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$';

export function nonBlankStringSchemaFailure(schema) {
  return !(
    schema?.type === 'string' &&
    schema.minLength === 1 &&
    schema.pattern === NON_BLANK_STRING_PATTERN
  );
}

/**
 * A top-level non-blank input string is advertised as a bare string: the server
 * refuses a blank or padded value before the handler runs
 * (`mcp/src/server/advertised-input-schema.mjs`). A pattern, if present, must
 * still be the non-blank one.
 */
export function topLevelInputStringSchemaFailure(schema) {
  return !(
    schema?.type === 'string' &&
    (schema.minLength === undefined || schema.minLength === 1) &&
    (schema.pattern === undefined || schema.pattern === NON_BLANK_STRING_PATTERN)
  );
}

const BACKLINK_IDENTITY_BRANCHES = [
  {
    properties: { isNode: { const: true } },
    required: ['kind'],
  },
  {
    properties: { isNode: { const: false } },
    not: { anyOf: [{ required: ['uid'] }, { required: ['kind'] }] },
  },
];

export function backlinkRowsSchemaFailure(schema, label) {
  const row = schema?.items;
  if (
    schema?.type !== 'array' ||
    row?.type !== 'object' ||
    !sameArray(row.required, ['slug', 'isNode', 'title', 'mtime']) ||
    !isDeepStrictEqual(row.oneOf, BACKLINK_IDENTITY_BRANCHES) ||
    row.additionalProperties !== false ||
    row.properties?.uid?.type !== 'string' ||
    row.properties?.uid?.pattern !== NODE_UID_PATTERN ||
    row.properties?.isNode?.type !== 'boolean' ||
    nonBlankStringSchemaFailure(row.properties?.slug) ||
    nonBlankStringSchemaFailure(row.properties?.kind) ||
    nonBlankStringSchemaFailure(row.properties?.title) ||
    row.properties?.domain?.type !== 'string' ||
    row.properties?.mtime?.type !== 'number' ||
    row.properties?.mtime?.minimum !== 0 ||
    row.properties?.matchedKeys?.type !== 'array' ||
    nonBlankStringSchemaFailure(row.properties?.matchedKeys?.items) ||
    row.properties?.matchedInBody?.type !== 'boolean'
  ) {
    return `${label} drift`;
  }
  return null;
}
