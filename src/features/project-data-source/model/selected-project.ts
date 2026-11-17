import { findProjectDocInList, resolveSoleProjectSlug, type VaultDoc } from "@/entities/docs-vault";

/*
 * The project whose page was opened last, per open folder, for this app session only. It is a
 * navigation memory, not vault data, so it never reaches storage or the URL.
 */
const selectedSlugByScope = new Map<string, string>();
const listeners = new Set<() => void>();

export function recordSelectedProject(scope: string, slug: string): void {
  if (selectedSlugByScope.get(scope) === slug) return;
  selectedSlugByScope.set(scope, slug);
  for (const listener of listeners) listener();
}

export function readSelectedProject(scope: string): string | null {
  return selectedSlugByScope.get(scope) ?? null;
}

export function subscribeSelectedProject(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The project the Projects door opens: the recorded one while it still exists, else the folder's
 * only project, else none (the list). O(n) in the folder's documents.
 */
export function resolveSelectedProjectSlug(recorded: string | null, docs: readonly VaultDoc[]): string | null {
  if (recorded !== null && findProjectDocInList(docs, recorded) !== null) return recorded;
  return resolveSoleProjectSlug(docs);
}
