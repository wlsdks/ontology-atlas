/**
 * The app-side review mark and digest, mirroring `mcp/src/schema.mjs` (`review-mark.contract.test.ts`).
 * The mark means no Atlas write tool produced this, not that a person was authenticated.
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

/** Mirrors `DIGEST_IGNORED_KEY_PREFIXES` in `mcp/src/schema.mjs`. */
const DIGEST_IGNORED_KEY_PREFIXES = ['display', 'canvasPosition'];

/** Mirrors `REVIEWED_DIGEST_PATTERN`: a binding this code could have written. */
const REVIEWED_DIGEST_PATTERN = /^[0-9a-f]{32}$/;

/** `unknown`: an approval without a binding, e.g. written by hand; neither current nor changed. */
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

/** Async because the browser's only hash is `crypto.subtle`; the MCP twin is sync. */
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
  /** The two reasons are different work and never merged. */
  reason: 'raised' | 'changed-since-review' | 'unverifiable';
  /** The agent's note on what needs deciding. */
  note?: string;
  reviewedBy?: string;
}

/** Raised and drifted approvals only; unmarked nodes stay unknown, not queued. */
export async function buildReviewQueue(
  docs: Array<Pick<VaultDoc, 'slug' | 'title' | 'frontmatter'>>,
  /** Called only for approved nodes; an unreadable body yields `null`, which is not drift. */
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
    // A malformed binding is `unknown`, not drift.
    if (!REVIEWED_DIGEST_PATTERN.test(String(frontmatter[REVIEWED_DIGEST_KEY] ?? ''))) continue;
    const body = await readBody(doc.slug);
    if (body === null) {
      // An unverifiable approval is listed rather than hidden behind "nothing waiting".
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
