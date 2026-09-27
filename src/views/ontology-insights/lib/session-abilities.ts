/**
 * What this session can do now: the facts deciding the to-do queue's layout and action labels. Abilities, not
 * roles: there are no accounts (local-first), and only what can be finished on this screen matters. Whether it can
 * write the vault, whether an agent is observed, and, per row, whether the concept has a document
 * (`resolveNodeDocument`). Storing profiles, roles or a viewer mode would be a login under another name.
 */

export interface SessionAbilities {
  /** The user's folder is open, so frontmatter can be fixed on the spot. */
  canWriteVault: boolean;
  /** A record of an agent working in this folder, from the heartbeat file. */
  agentObserved: boolean;
}

export interface SessionAbilityInput {
  /** The value 'local' is the user's folder; 'static' is the bundled sample. */
  dataSourceMode: "local" | "static";
  /** From `useLocalVault().status`. */
  vaultStatus: string;
  /**
   * From `useLocalVault().isReloadingSameVault`: the rescan after a save sets 'loading', and reading that as lost
   * write permission would invert the group order and drop the saved row's confirmation.
   */
  reloadingSameVault?: boolean;
  /** From `useLocalVault().agentActivityStatus`; absent means not observed. */
  agentActivity?: { exists: boolean; valid: boolean } | null;
}

/**
 * The same writability expression as the map's contextual editor, so one surface never offers a form while
 * another offers a copy button.
 */
export function resolveSessionAbilities(input: SessionAbilityInput): SessionAbilities {
  return {
    canWriteVault:
      input.dataSourceMode === "local" &&
      (input.vaultStatus === "loaded" || input.reloadingSameVault === true),
    // Staleness is ignored: a heartbeat goes stale in minutes, but an attached agent is still someone to hand off to.
    agentObserved: Boolean(input.agentActivity?.exists && input.agentActivity?.valid),
  };
}
