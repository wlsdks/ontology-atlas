// **The single ANSI palette every CLI command shares.** 44 command and entry files
// each inlined an identical `const COLORS = {...}` (~300 duplicated lines) with the
// same values and keys, so they were folded into one source: adding a colour or
// changing a tone is one edit. The helpers in diagnosis-colors.mjs already take a
// `colors` parameter, so this object is passed straight through.
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

// Node kind (plus edge-endpoint state) → display colour, so every CLI command
// draws a kind in the *same* colour and the visual language stays consistent.
// 16 commands each defined their own KIND_COLORS and drifted: pattern-walk painted
// element cyan (colliding with capability), and find/orphans/list painted document
// white — the same kind looked different per command. `external` and `unresolved`
// are edge-endpoint states rather than node kinds, but some graph commands colour
// them from this map, so they live here; commands that do not use them simply
// ignore the keys.
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
