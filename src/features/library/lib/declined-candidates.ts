import { candidateKey, type SourceCandidate } from "@/entities/docs-vault";

/**
 * Refused candidates, remembered per browser only: a declined list in the vault would be a
 * second canonical store of absences (`.claude/rules/forbidden.md`). Keyed by root and path
 * within one vault scope; an empty scope is refused, or refusals leak across folders.
 */

export const DECLINED_KEY_PREFIX = "atlas.library.declined:";

function storageKey(vaultScope: string): string {
  return `${DECLINED_KEY_PREFIX}${vaultScope}`;
}

function read(vaultScope: string): Set<string> {
  if (typeof window === "undefined" || !vaultScope) return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(vaultScope));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((entry): entry is string => typeof entry === "string"))
      : new Set();
  } catch {
    // Blocked storage or a hand-edited value both mean no memory: propose everything.
    return new Set();
  }
}

export function readDeclinedCandidates(vaultScope: string): Set<string> {
  return read(vaultScope);
}

/** Remembers the candidates left unticked when a person confirmed the dialog. */
export function rememberDeclinedCandidates(
  vaultScope: string,
  declined: readonly SourceCandidate[],
): Set<string> {
  if (!vaultScope) return new Set();
  const next = read(vaultScope);
  for (const candidate of declined) next.add(candidateKey(candidate));
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(storageKey(vaultScope), JSON.stringify([...next]));
    } catch {
      /* Storage full or blocked; losing the list costs one dialog. */
    }
  }
  return next;
}

/** Forgets every refusal for this folder, so the next run proposes everything again. */
export function forgetDeclinedCandidates(vaultScope: string): void {
  if (typeof window === "undefined" || !vaultScope) return;
  try {
    window.localStorage.removeItem(storageKey(vaultScope));
  } catch {
    /* Nothing to do: the memory was never guaranteed to exist. */
  }
}

export function partitionByDeclined(
  candidates: readonly SourceCandidate[],
  declined: ReadonlySet<string>,
): { fresh: SourceCandidate[]; declinedCount: number } {
  const fresh: SourceCandidate[] = [];
  let declinedCount = 0;
  for (const candidate of candidates) {
    if (declined.has(candidateKey(candidate))) declinedCount += 1;
    else fresh.push(candidate);
  }
  return { fresh, declinedCount };
}
