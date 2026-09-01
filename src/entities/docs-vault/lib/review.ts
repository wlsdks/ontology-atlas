/**
 * Human judgment on a vault node — the app-side half.
 *
 * The MCP server owns the same two functions (`mcp/src/schema.mjs`) because the
 * two packages share no module by design. `tests/contract/review-mark.contract.test.ts`
 * runs one fixture table through both, so "unchanged" cannot come to mean two
 * different things depending on who asked.
 *
 * Why the app needs its own copy at all: the MCP path is the one that is
 * provably an agent, so it is where confirming is *refused*. Confirming happens
 * here, in a surface a person opened.
 *
 * ⚠️ That is a lane, not proof of a person. Atlas has no login, and an agent with
 * file tools can write the same keys directly without meeting either path. The
 * mark means "no Atlas write tool produced this" and the digest says whether the
 * node changed afterwards; neither authenticates who typed it. What makes it
 * worth having anyway is that every such edit lands in a Git diff
 * (Codex review, 2026-09-02).
 *
 * Measured background: `docs/benchmark/FINDINGS-2026-09-02-review-marks.md`.
 */

import type { VaultDoc } from '../model/types';

const REVIEW_STATE_KEY = 'review_state';
const REVIEW_NOTE_KEY = 'review_note';
const REVIEWED_BY_KEY = 'reviewed_by';
const REVIEWED_AT_KEY = 'reviewed_at';
const REVIEWED_DIGEST_KEY = 'reviewed_digest';

const REVIEW_STATE_HUMAN_DECIDES = 'human_decides';
const REVIEW_STATE_CONFIRMED = 'confirmed';

const REVIEW_KEYS = [
  REVIEW_STATE_KEY,
  REVIEW_NOTE_KEY,
  REVIEWED_BY_KEY,
  REVIEWED_AT_KEY,
  REVIEWED_DIGEST_KEY,
];

/** Mirrors `DIGEST_IGNORED_KEY_PREFIXES` in `mcp/src/schema.mjs` — presentation, not meaning. */
const DIGEST_IGNORED_KEY_PREFIXES = ['display', 'canvasPosition'];

/** Mirrors `REVIEWED_DIGEST_PATTERN`: a binding this code could have written. */
const REVIEWED_DIGEST_PATTERN = /^[0-9a-f]{32}$/;

/**
 * Approval currentness, as three answers.
 *
 * `unknown` is not a softer `current`: it means the file carries an approval
 * with no binding, which happens whenever a person wrote one by hand. Drawing it
 * as "still good" would invent a fact; drawing it as "changed" would accuse one.
 */
export type ReviewCurrentness = 'not-confirmed' | 'current' | 'changed-since-review' | 'unknown';

function digestPayload(frontmatter: Record<string, unknown>, body: string): string {
  const meaning: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter ?? {})) {
    if (REVIEW_KEYS.includes(key)) continue;
    if (DIGEST_IGNORED_KEY_PREFIXES.some((prefix) => key === prefix || key.startsWith(`${prefix}_`))) {
      continue;
    }
    meaning[key] = value;
  }
  const ordered = Object.keys(meaning)
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((key) => [key, meaning[key]]);
  return JSON.stringify([ordered, String(body ?? '').trim()]);
}

/**
 * What a person approved, as one value.
 *
 * Async because the browser's only hash is `crypto.subtle`. The MCP twin is
 * synchronous over `node:crypto`; the contract test compares the values, not the
 * calling convention.
 */
export async function reviewDigest(
  frontmatter: Record<string, unknown>,
  body: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(digestPayload(frontmatter, body));
  const hashed = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashed))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export async function reviewCurrentness(
  frontmatter: Record<string, unknown>,
  body: string,
): Promise<ReviewCurrentness> {
  if (frontmatter?.[REVIEW_STATE_KEY] !== REVIEW_STATE_CONFIRMED) return 'not-confirmed';
  const recorded = frontmatter?.[REVIEWED_DIGEST_KEY];
  if (typeof recorded !== 'string' || !REVIEWED_DIGEST_PATTERN.test(recorded)) return 'unknown';
  return recorded === (await reviewDigest(frontmatter, body)) ? 'current' : 'changed-since-review';
}

/** One row of what a person still has to look at. */
export interface ReviewQueueRow {
  slug: string;
  title: string;
  /** Why it is here — the two reasons are different work, so they are never merged into one count. */
  reason: 'raised' | 'changed-since-review' | 'unverifiable';
  /** The agent's own sentence about what has to be decided, when it left one. */
  note?: string;
  reviewedBy?: string;
}

/**
 * The two lists the Docs surface exists to show, and the deliberate absence of a
 * third.
 *
 * There is no "not yet reviewed" row. 80 of this repository's own 94 nodes carry
 * `created_by: agent:unknown`; a queue that counted every unmarked node would
 * open on a wall of hundreds and be closed once. Absence stays unknown — the
 * same invariant `created_by` already holds (`docs/DECISIONS.md`, 2026-08-22
 * record 93 §5).
 */
export async function buildReviewQueue(
  docs: Array<Pick<VaultDoc, 'slug' | 'title' | 'frontmatter'>>,
  /**
   * Reads one document's body. Called **only** for nodes that carry an approval,
   * which is why the queue does not cost a second full pass over the vault: the
   * manifest deliberately keeps no bodies, a raised node needs none, and the
   * approved set is bounded by how much a person actually reviewed.
   *
   * A body that cannot be read yields `null`, and the row says so rather than
   * claiming drift — an unreadable file is not evidence of a change.
   */
  readBody: (slug: string) => Promise<string | null>,
): Promise<ReviewQueueRow[]> {
  const rows: ReviewQueueRow[] = [];
  for (const doc of docs) {
    const frontmatter = doc.frontmatter ?? {};
    const state = frontmatter[REVIEW_STATE_KEY];
    if (state === REVIEW_STATE_HUMAN_DECIDES) {
      const note = frontmatter[REVIEW_NOTE_KEY];
      rows.push({
        slug: doc.slug,
        title: doc.title,
        reason: 'raised',
        ...(typeof note === 'string' && note ? { note } : {}),
      });
      continue;
    }
    if (state !== REVIEW_STATE_CONFIRMED) continue;
    // A malformed binding is `unknown`, not drift, so it must not reach the
    // queue as a row accusing someone of a change they did not make.
    if (!REVIEWED_DIGEST_PATTERN.test(String(frontmatter[REVIEWED_DIGEST_KEY] ?? ''))) continue;
    const body = await readBody(doc.slug);
    if (body === null) {
      // Silence here would let "nothing waiting" conceal an approval that could
      // not be checked and may well have drifted (Codex review, 2026-09-02).
      // Saying so is not an accusation; it is the honest third answer.
      rows.push({ slug: doc.slug, title: doc.title, reason: 'unverifiable' });
      continue;
    }
    if ((await reviewCurrentness(frontmatter, body)) !== 'changed-since-review') continue;
    const reviewedBy = frontmatter[REVIEWED_BY_KEY];
    rows.push({
      slug: doc.slug,
      title: doc.title,
      reason: 'changed-since-review',
      ...(typeof reviewedBy === 'string' && reviewedBy ? { reviewedBy } : {}),
    });
  }
  return rows;
}
