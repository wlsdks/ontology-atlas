/**
 * Neutral selector for the "last edited by human / by AI" fact.
 *
 * The design decision that human and AI are distinguished by glyph and label,
 * never by hue, is enforced here too: this function favours no kind and simply
 * picks the most recent `atMs`. With every candidate at `atMs: null` — no
 * evidence at all — it returns null rather than inventing one.
 */

export type LastEditSubjectKind = "agent" | "human";

export interface LastEditSubjectFact {
  kind: LastEditSubjectKind;
  atMs: number;
}

export interface LastEditSubjectCandidate {
  kind: LastEditSubjectKind;
  /** null means no evidence for this kind. Callers must not guess a value. */
  atMs: number | null;
}

export function pickLastEditSubject(
  candidates: readonly LastEditSubjectCandidate[],
): LastEditSubjectFact | null {
  let best: LastEditSubjectFact | null = null;
  for (const candidate of candidates) {
    if (candidate.atMs == null || !Number.isFinite(candidate.atMs)) continue;
    if (!best || candidate.atMs > best.atMs) {
      best = { kind: candidate.kind, atMs: candidate.atMs };
    }
  }
  return best;
}
