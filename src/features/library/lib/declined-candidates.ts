import { candidateKey, type SourceCandidate } from "@/entities/docs-vault";

/**
 * Candidates a person already said no to.
 *
 * **This is a per-machine convenience and nothing else.** It lives in `localStorage`,
 * never in the folder, and it is the one piece of library state that is *not* in the
 * vault — deliberately, and the rule it obeys is the one that made that choice
 * necessary:
 *
 * - Vault Markdown is the only canonical store (`.claude/rules/forbidden.md`). A
 *   `declined.json` in the folder would be a second one, and it would be a store of
 *   *absences* — the worst kind, because nothing in the folder could ever contradict it.
 * - So the memory is allowed to be wrong and allowed to be lost. Clearing site data, a
 *   second machine, or a different browser all re-propose the same files, and that is a
 *   person seeing a list again — not data loss.
 *
 * The key is `(root, relative path)` rather than a content hash, because discovery never
 * opens a file: at proposal time there is no hash to key on, and "you already said no to
 * this file in this folder" is the fact a person expects to be remembered anyway.
 *
 * **Scoped to the vault**, for the reason `unmatched-dismissals.ts` records: one global
 * key means a refusal in one folder hides a row in another. The caller passes the same
 * `useVaultIdentityScope` value every other per-vault slot uses; an empty scope is
 * refused outright rather than falling back to a shared slot, because a fallback is how
 * the global key comes back.
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
    // A browser with storage blocked, or a value somebody hand-edited. Both mean the
    // same thing here: no memory, so propose everything.
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
      /* Storage full or blocked. The list is a convenience; losing it costs one dialog. */
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
