import { formatAllowedValueError } from './mcp-bridge/suggestions.mjs';

export const RELATION_TYPE_VALUES = Object.freeze([
  'domains',
  'domain',
  'capabilities',
  'elements',
  'dependencies',
  'depends_on',
  'relates',
  'contains',
  'describes',
]);

const RELATION_TYPES = new Set(RELATION_TYPE_VALUES);

export function validateRelationTypeList(values, name = 'relation type') {
  for (const value of values) {
    if (!RELATION_TYPES.has(value)) {
      return new Error(formatAllowedValueError(name, value, RELATION_TYPE_VALUES));
    }
  }
  return null;
}
