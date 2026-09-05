/**
 * **How the CLI is invoked** — the single source for the commands screens offer
 * to copy.
 *
 * **Why this file exists** (measured 2026-07-29). The app and the web were
 * telling users to copy commands like `ontology-atlas validate .`, but
 * `which ontology-atlas` returns **not found**: publishing to npm was retired on
 * 2026-07-27 (`docs/DECISIONS.md`) and no global binary by that name exists
 * anywhere. **Copying and running it produces "command not found", not a 404** —
 * the user burns time looking for their own mistake.
 *
 * The dialect was spread over 116 occurrences in 22 source files. The existing
 * gate (`npm-channel-retired.contract.test.ts`) matched only
 * `npx ontology-atlas`, so **bare invocations passed** — a rule with too short a
 * reach is the same as no rule.
 *
 * **The only live channel is a source checkout.**
 * `.claude/rules/surfaces.md` owns the two-delivery-channel rule, and of those
 * two the app bundle carries **only the MCP server** (`mcp-server-launch.ts`) —
 * the CLI is not in the bundle. So the one live form is:
 *
 *     node $ATLAS/cli/src/index.mjs <command> [vault]
 *
 * **Why we do not fill the path in.** We do not know where the checkout is on
 * this machine: the vault folder and the Atlas repo are normally different
 * paths, and the app only knows the vault. Pretending to know it would reproduce
 * the very defect being fixed here — guidance that does not work.
 *
 * Instead the placeholder **teaches how to fill it in**. One `export ATLAS=…`
 * makes every command after it run unedited, so `$ATLAS` says both "something
 * goes here" and "here is how" — more honest than `ontology-atlas`, which
 * **looks runnable and is not**, and faster than `<atlas>`, which **only runs
 * after editing**.
 */

/**
 * The blank the user fills in — the root of the ontology-atlas source checkout.
 *
 * **Two reasons it is a shell variable and not angle brackets (`<atlas>`).**
 *
 * ① `<…>` is **parsed as a rich-text tag by next-intl**. Put verbatim into an
 *    i18n string it never reaches the screen (measured: the CLI row on
 *    `/projects` disappeared entirely). Command strings live in both code and
 *    messages, and a placeholder that only works on one side is not a
 *    placeholder.
 *
 * ② Angle brackets say only **that** something must be filled in; a variable
 *    says **how**. One `export ATLAS=…` and every following command runs
 *    unedited — the placeholder becomes executable. This repo's starter README
 *    already uses the same grammar (`ATLAS=<checkout>/cli/src/index.mjs`).
 */
export const ATLAS_CHECKOUT_PLACEHOLDER = "$ATLAS";

/** The invocation prefix. This string is the repo's only CLI call form. */
export const ATLAS_CLI = `node ${ATLAS_CHECKOUT_PLACEHOLDER}/cli/src/index.mjs`;

/**
 * The sentence explaining how to fill in `$ATLAS` — **for text handed to agents
 * only.**
 *
 * A visible placeholder the reader cannot fill in is honest but useless, so any
 * surface emitting a command must carry this hint with it. **Human-facing
 * screens do not use this constant** — they use the i18n message
 * (`cliPlaceholderHint`).
 *
 * Why they were split (2026-07-29): a Korean constant used to live here that no
 * screen rendered. A hardcoded Korean sentence in `shared/config` bypasses
 * next-intl, so the moment someone renders it for convenience **an English user
 * sees Korean**. User-facing copy with nowhere to render is a trap, not a spec,
 * so it was deleted. This English constant stays: it goes into agent prompts,
 * where being English regardless of screen language is correct.
 */
export const ATLAS_CLI_HINT_EN =
  "Set this once: export ATLAS=<path to your ontology-atlas source checkout>  (there is no npm package)";

/**
 * **Quote a path for a shell line inside a copied packet.**
 *
 * Lived privately inside `VaultAgentSetupPanel` until a second surface needed it (the MCP
 * first-contact packet, 2026-09-05). Two copies of a quoting rule is how one of them ends up
 * quoting a folder called `My Vault` and the other does not, and the failure only shows on the
 * machine whose path has the space in it.
 */
export function shellQuoteForPacket(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * The vault path a packet should print — the real one when this surface knows it, and an
 * instruction to fill in when it does not.
 *
 * A browser never knows the absolute path, so the placeholder is the honest value there; what is
 * not honest is a command that silently means "wherever you happen to be", which is what a
 * relative path in a copied packet becomes.
 */
export function vaultPathForPacket(vaultName: string, vaultPath?: string | null): string {
  return vaultPath ?? `<absolute path to your ${vaultName} folder>`;
}
