/**
 * **The one line that actually works** when the app's Claude login has gone stale.
 *
 * ## Corrected 2026-08-20 — the previous guidance was creating the trap
 *
 * This file used to offer `CLAUDE_CONFIG_DIR=<app folder> claude /login`.
 * **That was the cause of the defect.**
 *
 * The app launches Claude with a dedicated config folder (which is what makes it ask before working
 * outside the folder) and **links** `.credentials.json` to the user's own so the login does not
 * split. That design does work — measured 2026-08-20: with only a link in a fresh folder that has no
 * keychain entry, `claude auth status` answers `loggedIn: true` as the user's own account.
 * **No re-login is needed.**
 *
 * The problem is that Claude Code **looks at the keychain before the file**. So once an entry exists
 * for that folder, the link is never read again. And there is exactly one way an entry appears —
 * **a person logging in with that folder.** The previous guidance instructed exactly that; when the
 * token rotated it died, and when it died the screen gave the same guidance again. To the user it
 * looks like "it asks me to log in every time".
 *
 * Measurement overturned it: deleting that entry returned the same folder to `loggedIn: true`
 * immediately (`authMethod: "claude.ai"`, the user's email unchanged).
 *
 * ## So what happens now
 *
 * **The app clears it itself.** Before starting a session, `prepare_isolated_config` links the
 * credentials and then deletes any keychain entry standing in front of that folder
 * (`clear_shadowing_credentials`, `src-tauri/src/acp.rs`). So this command is **the last resort for
 * when even that failed** — a person's hand is needed only where keychain access is blocked.
 *
 * The name stays `...LoginRepair` because what this slot does (restore the app's login) is unchanged;
 * only the method was inverted.
 *
 * ## Why the permission gate is not given up
 *
 * Two alternatives were measured and **neither raised a gate** (2026-08-16):
 * - passing the permission mode through the session `_meta` → the adapter decides the mode from the
 *   on-disk config first. Writes outside the vault went out with no card.
 * - setting the session mode to `Manual` → the same result.
 *
 * The dedicated folder is the only permission gate available today. Its cost (a split login) is now
 * removed by the link plus clearing the shadow.
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
