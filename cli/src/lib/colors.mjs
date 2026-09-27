// The single ANSI palette every CLI command shares; diagnosis-colors.mjs helpers take it as `colors`.
export const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Node kind (plus the edge-endpoint states `external` and `unresolved`) → display colour, so every
// command draws a kind in the same colour.
export const KIND_COLORS = {
  project: COLORS.magenta,
  domain: COLORS.blue,
  capability: COLORS.cyan,
  element: COLORS.green,
  document: COLORS.dim,
  'vault-readme': COLORS.dim,
  external: COLORS.dim,
  unresolved: COLORS.dim,
};
