/**
 * Hard-coded because the `bun build --compile` binary in the app bundle has
 * no `package.json` beside it. `scripts/check-package-contracts.test.mjs` requires it
 * to equal `mcp/package.json`'s version: bump both.
 */
export const SERVER_VERSION = '0.13.0';
