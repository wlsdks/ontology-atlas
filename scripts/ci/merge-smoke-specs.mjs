/**
 * The browser specs every train and ready pull request runs, beside the specs its impact plan
 * maps: the core journeys a merge must never break. Everything else runs after merge, in the full
 * suite on each push to `main`, and `pnpm pr:land` names that run's failing specs while it is red.
 *
 * Paths are relative to `tests/e2e/`. A name that discovery cannot find fails the shard, so a
 * renamed spec cannot silently shrink the set. About 190 measured test-seconds in all.
 */
export const MERGE_SMOKE_SPECS = Object.freeze([
  // First run: the starter is written and the app says where.
  'vault-session/first-run-just-start-starter.spec.ts',
  'vault-session/vault-launch-chooser.spec.ts',
  'projects/user-journey-a.spec.ts',
  // Opening a vault folder.
  'vault-session/local-vault-picker.spec.ts',
  'vault-session/open-vault-cta.spec.ts',
  'vault-session/vault-progressive-open.spec.ts',
  // The map draws, and selecting a node frames and inspects it.
  'map/map-smoke.spec.ts',
  'map/camera/map-selection-framing.spec.ts',
  'map/map-canvas-focus.spec.ts',
  // The agent panel opens and sends.
  'agents/agent-turn-survives-navigation.spec.ts',
  'agents/agent-dock-interaction.spec.ts',
  'agents/agent-destination-chat.spec.ts',
  // The download and gateway pages arrive.
  'gateway/ontology-ui.spec.ts',
  'gateway/public-surface-health.spec.ts',
]);
