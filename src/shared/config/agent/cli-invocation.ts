/**
 * There is no global `ontology-atlas` binary; the one live form is a source checkout, so the path
 * stays a placeholder. A contract test blocks bare invocations elsewhere.
 */

/**
 * The blank the user fills in: the root of the ontology-atlas source checkout.
 *
 * A shell variable, not `<atlas>`: next-intl parses `<…>` as a rich-text tag and drops it from
 * the screen, and one `export ATLAS=…` makes every following command run unedited.
 */
export const ATLAS_CHECKOUT_PLACEHOLDER = "$ATLAS";

export const ATLAS_CLI = `node ${ATLAS_CHECKOUT_PLACEHOLDER}/cli/src/index.mjs`;

/**
 * The vault path a packet prints: the real one when known, otherwise an instruction to fill in.
 * Never a relative path, which silently means "wherever the agent happens to be".
 */
export function vaultPathForPacket(vaultName: string, vaultPath?: string | null): string {
  return vaultPath ?? `<absolute path to your ${vaultName} folder>`;
}
