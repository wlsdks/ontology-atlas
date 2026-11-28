// The bounds of one source probe. `inventory-v3` is hashed into every fingerprint, so a
// change to what a fingerprint covers bumps it and every stored receipt reads as changed
// once. The app's probe (`src-tauri/src/project_source/mod.rs`) is still `inventory-v2`
// until the one port of the probe replaces it
// (`tests/contract/vault-format/source-inventory-bound.contract.test.ts`).
export const SOURCE_INVENTORY_VERSION = 'inventory-v3';
export const SOURCE_INVENTORY_MAX_DEPTH = 20;
export const SOURCE_INVENTORY_MAX_HASH_BYTES = 32 * 1024 * 1024;
export const SOURCE_PRUNE_DIR_NAMES = new Set([
  '.git',
  '.next',
  '.turbo',
  '.cache',
  'node_modules',
  'target',
  'dist',
  'build',
  'coverage',
]);
