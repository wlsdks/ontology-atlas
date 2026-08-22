/**
 * Server version — **hard-coded as a constant**.
 *
 * Why `package.json` is not read at runtime: this server is compiled by
 * `bun build --compile` into a single self-contained binary that ships inside the
 * macOS app bundle (`scripts/build-mcp-binary.mjs`). There is no `package.json`
 * beside the compiled binary, so a runtime read breaks boot in that distribution.
 *
 * A test keeps the two in sync: `scripts/check-package-contracts.test.mjs`
 * requires this constant to equal `version` in `mcp/package.json`. Bump both.
 */
export const SERVER_VERSION = '0.13.0';
