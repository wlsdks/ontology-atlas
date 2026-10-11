/**
 * Last-resort login repair command when the app's Claude login is stale. Claude Code reads
 * the keychain before the linked `.credentials.json`; the app clears shadowing entries first
 * (`clear_shadowing_credentials`, `src-tauri/src/acp/isolation.rs`).
 */

export const APP_BUNDLE_IDENTIFIER = 'dev.jinan.ontology-atlas';

/** The dedicated config folder the app gives Claude (relative to home) — the same slot as Rust's `prepare_isolated_config`. */
export const CLAUDE_ISOLATED_CONFIG_SUBPATH = `Library/Application Support/${APP_BUNDLE_IDENTIFIER}/agent-config/claude-acp`;

/**
 * **The one-line last resort** for when the app could not clear the shadow itself.
 *
 * It deletes the keychain entry standing in front of the app's dedicated config folder. Once
 * deleted, that slot falls through to the linked **user credentials**, which keep being refreshed
 * from the terminal and so do not go stale again — exactly the opposite of the old "log in again as
 * the app", which returned on every rotation.
 *
 * The entry is named `Claude Code-credentials-<first 8 of the sha256 of the config folder's absolute
 * path>`. The hash is computed by the shell rather than pinned here because the home path differs per
 * person, so a pinned value would be correct **only on that machine**. The path contains a space
 * (`Application Support`), so the quotes are required.
 */
export function claudeLoginRepairCommand(): string {
  const dir = `$HOME/${CLAUDE_ISOLATED_CONFIG_SUBPATH}`;
  return `security delete-generic-password -s "Claude Code-credentials-$(printf %s "${dir}" | shasum -a 256 | cut -c1-8)"`;
}
