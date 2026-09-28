// A domain or project body summarizes its membership, and no validate.mjs code
// asks whether that summary is still true. This flags a summary node whose
// containment list changed after its description last did: the body (the
// judgement) and the containment arrays (the membership) are two clocks in one
// file. Child edits are not compared (summaries survive revision; that measures
// churn), and child creation cannot be (it always touches the parent).
// It reports and stops: the body is a person's accepted judgement
// (`.claude/rules/local-first.md`), so no model is called and no file written.
// Falsifier: if flagged parents still describe their membership correctly, the
// containment array is the wrong proxy and the check should be withdrawn.
// Revisions are injected, so the caller decides where history comes from.

import { createHash } from 'node:crypto';

/** Frontmatter arrays through which a parent holds what is below it. Mirrors `CONTAINMENT_KEYS` in `validate.mjs`. */
export const CONTAINMENT_KEYS = Object.freeze(['contains', 'capabilities', 'elements', 'domains']);

/**
 * Kinds whose body aggregates their membership. An element's prose describes
 * one role, not a set, so membership changes do not falsify it.
 */
export const SUMMARY_KINDS = ['project', 'domain'];

/** Reported when history is too short to tell the two clocks apart. */
export const INSUFFICIENT_HISTORY = 'insufficient-history';

/** Normalises a containment set so member order and duplicates never read as a change. */
export function membershipKey(children) {
  const unique = new Set();
  for (const ref of children ?? []) {
    if (typeof ref === 'string' && ref.trim()) unique.add(ref.trim());
  }
  return JSON.stringify([...unique].sort());
}

/** Collects the containment members declared by a frontmatter object. */
export function containedSlugs(frontmatter) {
  const slugs = [];
  if (!frontmatter || typeof frontmatter !== 'object') return slugs;
  for (const key of CONTAINMENT_KEYS) {
    const value = frontmatter[key];
    if (!Array.isArray(value)) continue;
    for (const ref of value) {
      if (typeof ref === 'string' && ref.trim()) slugs.push(ref.trim());
    }
  }
  return [...new Set(slugs)];
}

function digest(text) {
  return createHash('sha256').update(text).digest('base64url');
}

export function revisionClocks({ body, children } = {}) {
  return {
    bodyDigest: digest(String(body ?? '')),
    membershipDigest: digest(membershipKey(children)),
  };
}

function toTime(value) {
  if (value == null) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/**
 * Walks revisions (`{ changedAt, bodyDigest, membershipDigest }`, newest first,
 * the first is current) and reports when each clock last moved. A value
 * unchanged back to the oldest revision is `null`: unknown, not "never".
 */
export function lastMovementOf(revisions) {
  const list = Array.isArray(revisions) ? revisions.filter(Boolean) : [];
  if (list.length === 0) return { bodyChangedAt: null, membershipChangedAt: null, truncated: true };

  let bodyChangedAt = null;
  let membershipChangedAt = null;

  for (let index = 0; index < list.length - 1; index += 1) {
    const newer = list[index];
    const older = list[index + 1];
    if (bodyChangedAt == null && newer.bodyDigest !== older.bodyDigest) {
      bodyChangedAt = newer.changedAt ?? null;
    }
    if (membershipChangedAt == null && newer.membershipDigest !== older.membershipDigest) {
      membershipChangedAt = newer.changedAt ?? null;
    }
    if (bodyChangedAt != null && membershipChangedAt != null) break;
  }

  // Unchanged back to the oldest revision is a real answer only when history is
  // complete, so the caller is told which case it has.
  const truncated = bodyChangedAt == null || membershipChangedAt == null;
  const oldest = list[list.length - 1]?.changedAt ?? null;
  return {
    bodyChangedAt: bodyChangedAt ?? oldest,
    membershipChangedAt: membershipChangedAt ?? oldest,
    truncated,
  };
}

/**
 * Summary nodes whose membership changed after their description last did.
 *
 * @param docs `{ slug, frontmatter }` documents.
 * @param revisionsOf `(slug) => [{ changedAt, bodyDigest, membershipDigest }]`,
 *   newest first; a slug with no revisions is skipped, never guessed.
 * @returns Rows by lag, then slug, stable across runs.
 */
export function findStaleParentSummaries({ docs, revisionsOf } = {}) {
  if (typeof revisionsOf !== 'function') return [];
  const rows = [];

  for (const doc of docs ?? []) {
    const kind = doc?.frontmatter?.kind;
    if (!SUMMARY_KINDS.includes(kind)) continue;

    const children = containedSlugs(doc.frontmatter);
    if (children.length === 0) continue;

    const revisions = revisionsOf(doc.slug);
    if (!Array.isArray(revisions) || revisions.length === 0) continue;

    const { bodyChangedAt, membershipChangedAt, truncated } = lastMovementOf(revisions);
    const bodyTime = toTime(bodyChangedAt);
    const membershipTime = toTime(membershipChangedAt);

    if (bodyTime == null || membershipTime == null) {
      if (truncated) {
        rows.push({ slug: doc.slug, kind, childCount: children.length, reasonCode: INSUFFICIENT_HISTORY });
      }
      continue;
    }

    if (membershipTime <= bodyTime) continue;

    rows.push({
      slug: doc.slug,
      kind,
      childCount: children.length,
      bodyChangedAt: new Date(bodyTime).toISOString(),
      membershipChangedAt: new Date(membershipTime).toISOString(),
      behindByMs: membershipTime - bodyTime,
    });
  }

  rows.sort((a, b) => {
    const byLag = (b.behindByMs ?? -1) - (a.behindByMs ?? -1);
    return byLag !== 0 ? byLag : a.slug.localeCompare(b.slug);
  });
  return rows;
}

/** One day in milliseconds — the scale at which a description falling behind starts to matter. */
const DAY_MS = 86_400_000;

/**
 * 0–1 by how long the description has been behind, saturating at 30 days: a
 * month-long lag deserves attention an hour-long one does not, and child count
 * would not tell them apart.
 */
export function staleParentScore(row) {
  const lag = row?.behindByMs;
  if (!Number.isFinite(lag) || lag <= 0) return 0;
  return Math.min(1, lag / (30 * DAY_MS));
}

/** The sentence a human reads. Names what moved and asks for a judgement rather than announcing an error. */
export function describeStaleParent(row) {
  if (row?.reasonCode === INSUFFICIENT_HISTORY) {
    return `"${row.slug}" summarises ${row.childCount} node(s), but its history does not go back far enough to tell whether its description or its membership moved last. Read it against its children by hand.`;
  }
  const days = Math.max(1, Math.round((row?.behindByMs ?? 0) / DAY_MS));
  return `"${row.slug}" declares ${row.childCount} node(s) it contains, and that list changed ${days} day(s) after its description was last written. The description may no longer cover what the domain now holds. Read it against its members and re-judge it; nothing is blocked and no rewrite is proposed.`;
}
