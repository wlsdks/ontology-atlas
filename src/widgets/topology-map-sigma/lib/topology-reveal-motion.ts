export const TOPOLOGY_INITIAL_REVEAL_DURATION_MS = 180;

export const TOPOLOGY_INITIAL_REVEAL_MOTION_CONTRACT =
  'opacity-only-fast-ready-reveal';

export const TOPOLOGY_INITIAL_REVEAL_TRANSFORM_POLICY =
  'no-scale-during-initial-load';

export function topologyInitialRevealTransition(): string {
  return `opacity ${TOPOLOGY_INITIAL_REVEAL_DURATION_MS}ms ease-out`;
}
