/**
 * Whether a map's world build is in flight, and who waits for its swap, keyed by the map's world ref.
 * A sliced build swaps outside React's commit, so effects that act on a fresh world wait here.
 */
interface WorldSwapState { building: boolean; waiting: Set<() => void> }

const states = new WeakMap<object, WorldSwapState>();

function stateOf(worldRef: object): WorldSwapState {
  let state = states.get(worldRef);
  if (!state) states.set(worldRef, (state = { building: false, waiting: new Set() }));
  return state;
}

export function markWorldBuilding(worldRef: object, building: boolean): void {
  stateOf(worldRef).building = building;
}

export function isWorldBuilding(worldRef: object): boolean {
  return states.get(worldRef)?.building === true;
}

/** Calls `listener` after every swap of this map's world until the returned function is called. */
export function onWorldSwap(worldRef: object, listener: () => void): () => void {
  const { waiting } = stateOf(worldRef);
  waiting.add(listener);
  return () => {
    waiting.delete(listener);
  };
}

export function announceWorldSwap(worldRef: object): void {
  for (const listener of [...stateOf(worldRef).waiting]) listener();
}
