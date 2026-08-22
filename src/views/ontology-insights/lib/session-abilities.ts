/**
 * **What this session can do right now** — the three facts deciding the "to do" queue's layout and
 * action labels.
 *
 * Why abilities rather than roles: this product has no accounts (a permanent local-first contract).
 * So "who is this" cannot be known, and does not need to be — all that is needed is "what work can
 * be carried to completion on this screen right now", and the app already knows that:
 *
 * 1. **Can it write to the vault** — is this a session with the user's own folder open (a sample is
 *    read-only)?
 * 2. **Is an agent observed** — is there a record of an agent working in this folder?
 * 3. **Does this concept have a document** — this differs per row, so it is not held here;
 *    `isEvidenceOnlyConcept` / `resolveNodeDocument` answer it per row.
 *
 * Starting to store profiles, roles, or a viewer mode is a login under another name — at that moment
 * this file has grown in the wrong direction and is reverted.
 */

export interface SessionAbilities {
  /** ① My folder is open, so frontmatter can be fixed on the spot. */
  canWriteVault: boolean;
  /** ② There is a record of an agent working in this folder (measured from the heartbeat file). */
  agentObserved: boolean;
}

export interface SessionAbilityInput {
  /** 'local' = the user's folder, 'static' = the bundled sample. */
  dataSourceMode: "local" | "static";
  /** `useLocalVault().status`. */
  vaultStatus: string;
  /**
   * `useLocalVault().isReloadingSameVault` — the same folder is being re-read.
   *
   * Why it is needed: during the rescan right after a save the status becomes 'loading', and reading
   * that as "writing became impossible" briefly inverts the group order. An inverted order redraws
   * the whole queue, and the confirmation line on the row just saved disappears in that frame
   * (measured 2026-07-26: the confirmation line was never once visible). Write permission does not
   * vanish while a folder is being re-read.
   */
  reloadingSameVault?: boolean;
  /** `useLocalVault().agentActivityStatus` — absent means not observed. */
  agentActivity?: { exists: boolean; valid: boolean } | null;
}

/**
 * Extracts the two session-level facts of the three. It is **the same expression** the map's
 * contextual editor uses to decide writability — if the meaning of "can write" diverged between
 * surfaces within one app, one would offer a form while the other offered a copy button.
 */
export function resolveSessionAbilities(input: SessionAbilityInput): SessionAbilities {
  return {
    canWriteVault:
      input.dataSourceMode === "local" &&
      (input.vaultStatus === "loaded" || input.reloadingSameVault === true),
    // `stale` is deliberately ignored — a heartbeat goes stale within minutes, but the fact that an
    // agent is attached to that folder does not. The verdict needed here is not "is it working right
    // now" but "is there someone to hand off to".
    agentObserved: Boolean(input.agentActivity?.exists && input.agentActivity?.valid),
  };
}
