/** Last-resort login repair when the app's Claude login is stale: Claude Code reads the keychain before the linked `.credentials.json`; the app clears shadowing entries first (`clear_shadowing_credentials`, `src-tauri/src/acp/isolation.rs`). */

export const APP_BUNDLE_IDENTIFIER = 'dev.jinan.ontology-atlas';

/** The dedicated config folder the app gives Claude (relative to home) — the same slot as Rust's `prepare_isolated_config`. */
export const CLAUDE_ISOLATED_CONFIG_SUBPATH = `Library/Application Support/${APP_BUNDLE_IDENTIFIER}/agent-config/claude-acp`;

/**
 * Deletes the keychain entry shadowing the app's config folder, so the slot falls through to the linked user credentials, which the terminal keeps refreshing.
 * The entry is `Claude Code-credentials-<first 8 of the sha256 of the config folder's absolute path>`, hashed by the shell because the home path differs per person; the path contains a space, so quotes are required.
 */
export function claudeLoginRepairCommand(): string {
  const directory = `$HOME/${CLAUDE_ISOLATED_CONFIG_SUBPATH}`;
  return `security delete-generic-password -s "Claude Code-credentials-$(printf %s "${directory}" | shasum -a 256 | cut -c1-8)"`;
}
