export const DEFAULT_QUERY_LIMIT = 100;
export const DEFAULT_ALL_PATHS_SEARCH_BUDGET = 5000;
export const MAX_ALL_PATHS_SEARCH_BUDGET = 50000;

export const NODE_KIND_VALUES = Object.freeze([
  'project',
  'domain',
  'capability',
  'element',
  'document',
  'vault-readme',
]);
export const EDGE_TARGET_KIND_VALUES = Object.freeze([
  ...NODE_KIND_VALUES,
  'external',
  'unresolved',
]);
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
export const WRITE_RELATION_TYPE_VALUES = Object.freeze([
  'depends_on',
  'relates',
  'contains',
  'describes',
  'domains',
  'capabilities',
  'elements',
  'domain',
]);
