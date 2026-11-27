/**
 * Hard-coded because the `bun build --compile` binary in the app bundle has
 * no `package.json` beside it. `scripts/packaging/check-package-contracts.test.mjs` requires it
 * to equal `mcp/package.json`'s version: bump both.
 */
export const SERVER_VERSION = '2.7.15';
