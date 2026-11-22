import { refResolver, slugTail, type BuiltVaultEntry, type RefResolver } from '../md-entry';
import { eachAncestor } from '../vault-paths';

/**
 * Indexes over the last snapshot's entries, kept between deltas so a change never re-derives them.
 * Owned by exactly one entries array at a time (`deltaStates`); a delta moves it to the next one.
 */
export interface DeltaState {
  byPath: Map<string, BuiltVaultEntry>;
  /** Folder → walked files beneath it: whether a reported folder held anything. */
  dirCounts: Map<string, number>;
  /** Slug tail → its slug, or every slug sharing it (then ambiguous, as the full build reads it). */
  tails: Map<string, string | Set<string>>;
}

export const deltaStates = new WeakMap<readonly BuiltVaultEntry[], DeltaState>();

export function mdSlug(entry: BuiltVaultEntry): string | null {
  return entry.kind === 'md' && entry.doc ? entry.doc.slug : null;
}

export function indexEntry(state: DeltaState, entry: BuiltVaultEntry, sign: 1 | -1): void {
  if (sign === 1) state.byPath.set(entry.relativePath, entry);
  else state.byPath.delete(entry.relativePath);
  eachAncestor(entry.relativePath, (dir) => {
    const count = (state.dirCounts.get(dir) ?? 0) + sign;
    if (count > 0) state.dirCounts.set(dir, count);
    else state.dirCounts.delete(dir);
  });
  const slug = mdSlug(entry);
  if (slug === null) return;
  const tail = slugTail(slug);
  const held = state.tails.get(tail);
  // A set, so removing one of many documents sharing a tail is O(1), not O(sharers).
  if (sign === 1) {
    if (held === undefined) state.tails.set(tail, slug);
    else if (typeof held === 'string') state.tails.set(tail, new Set([held, slug]));
    else held.add(slug);
  } else if (typeof held === 'string') {
    state.tails.delete(tail);
  } else if (held) {
    held.delete(slug);
    if (held.size === 1) state.tails.set(tail, held.values().next().value!);
  }
}

/** O(entries × depth) once per snapshot that was not itself produced by a delta. */
export function takeState(entries: readonly BuiltVaultEntry[]): DeltaState {
  const held = deltaStates.get(entries);
  if (held) return held;
  const state: DeltaState = { byPath: new Map(), dirCounts: new Map(), tails: new Map() };
  for (const entry of entries) indexEntry(state, entry, 1);
  deltaStates.set(entries, state);
  return state;
}

export function resolverOf(state: DeltaState): RefResolver {
  return refResolver(
    (slug) => state.byPath.get(`${slug}.md`)?.kind === 'md',
    (tail) => {
      const held = state.tails.get(tail);
      return typeof held === 'string' ? held : null;
    },
  );
}
