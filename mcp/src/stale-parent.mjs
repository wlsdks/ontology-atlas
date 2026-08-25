// stale-parent — the update-path signal a containment parent owes its children.
//
// `detect-drift.mjs` catches a node pointing at code that moved. This catches the
// other direction of the same rot: a node whose **prose** still describes a set it
// no longer holds.
//
// A `domain` or `project` body is an aggregate. `domains/agent-integration.md`
// says, in `## Definition` and `## Evidence`, what the capabilities and elements it
// declares add up to. When that set changes, the sentences do not follow on their
// own, and no existing check notices: every code in `validate.mjs` asks whether the
// graph is intact (dangling reference, duplicate uid, parseable frontmatter), never
// whether it still tells the truth. The failure is silent by construction — a
// reader orienting before work adopts the stale frame and only discovers it after
// acting on it.
//
// **Why the comparison is prose-against-membership, and not the obvious thing.**
// The first version compared the parent's file timestamp against its children's. On
// the dogfood vault that flagged 6 of 7 domains, 4 of them at every child — and
// inspection showed the flags were wrong. `agent-integration`'s Definition names
// "MCP servers, terminal CLI, in-app connect flow, and the ACP executor layer",
// which still covered all four children that had been edited under it. A domain
// summary is written at a level of abstraction that survives its children being
// revised; it does not survive them being *added or removed*. Comparing against
// child edits measures churn, not staleness.
//
// The second attempt compared against child *creation* and could never fire at all:
// containment is declared in the parent's own frontmatter, so adding a child always
// touches the parent in the same commit.
//
// What is left is the comparison this module makes. A parent carries two clocks in
// one file — the body, which is the judgement, and the containment arrays, which
// are the membership. Git sees one file, but the two move independently, and the
// answer is only interesting when membership moved last. That reads as: *the child
// list changed after anyone last re-wrote the description of it.*
//
// **Why the remedy is a question, not a rewrite.** A cache would regenerate the
// summary and move on. This vault cannot: the parent's body is a human judgement
// that someone accepted, and `local-first.md` keeps meaning on the user's disk under
// their signature rather than a model's. So this module reports and stops. It calls
// no model, writes no file, and adds no frontmatter key.
//
// **Falsifier.** If flagged parents turn out, on inspection, to still describe their
// membership correctly, then the containment array is the wrong proxy for meaning
// and this check should be withdrawn rather than tuned. The first version's
// falsifier fired within an hour of being written; this one is recorded so the
// second can be judged the same way.
//
// Revisions are injected rather than read here, so the logic is testable without a
// repository and the caller decides where history comes from.

/** Frontmatter arrays through which a parent holds what is below it. Mirrors `CONTAINMENT_KEYS` in `validate.mjs`. */
const CONTAINMENT_KEYS = ['contains', 'capabilities', 'elements', 'domains'];

/**
 * Kinds whose body is an aggregate of their membership and therefore goes stale.
 *
 * An `element` may declare containment too, but its prose describes one
 * implementation role rather than summarising a set, so membership changing under
 * it does not falsify its sentences.
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

function toTime(value) {
  if (value == null) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/**
 * Walks a node's revisions, newest first, and reports when each clock last moved.
 *
 * A revision is `{ changedAt, body, children }`. The first entry is the current
 * state. A clock's last movement is the revision at which its value still differs
 * from the one before it; if a value is identical all the way back to the oldest
 * revision available, that clock is reported as `null` — unknown, not "never".
 */
export function lastMovementOf(revisions) {
  const list = Array.isArray(revisions) ? revisions.filter(Boolean) : [];
  if (list.length === 0) return { bodyChangedAt: null, membershipChangedAt: null, truncated: true };

  let bodyChangedAt = null;
  let membershipChangedAt = null;

  for (let index = 0; index < list.length - 1; index += 1) {
    const newer = list[index];
    const older = list[index + 1];
    if (bodyChangedAt == null && String(newer.body ?? '') !== String(older.body ?? '')) {
      bodyChangedAt = newer.changedAt ?? null;
    }
    if (
      membershipChangedAt == null &&
      membershipKey(newer.children) !== membershipKey(older.children)
    ) {
      membershipChangedAt = newer.changedAt ?? null;
    }
    if (bodyChangedAt != null && membershipChangedAt != null) break;
  }

  // Reaching the oldest revision without a difference means the value was born that
  // way. That is a real answer when history is complete, and unknowable when it is
  // not, so the caller is told which case it has.
  const truncated = bodyChangedAt == null || membershipChangedAt == null;
  const oldest = list[list.length - 1]?.changedAt ?? null;
  return {
    bodyChangedAt: bodyChangedAt ?? oldest,
    membershipChangedAt: membershipChangedAt ?? oldest,
    truncated,
  };
}

/**
 * Finds summary nodes whose membership changed after their description last did.
 *
 * @param docs Vault documents, each `{ slug, frontmatter }`.
 * @param revisionsOf `(slug) => [{ changedAt, body, children }]`, newest first. A
 *   slug it returns nothing for is skipped rather than guessed.
 * @returns Rows sorted by how far behind the description is, then by slug, so the
 *   output is stable across runs.
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
 * Ranks a row between 0 and 1 by how long the description has been behind.
 *
 * Time rather than child count: a domain whose membership changed an hour before
 * someone got around to the prose is not the same problem as one that has been
 * behind for a month, and the second is the one worth a person's attention.
 * Saturates at 30 days so a very old lag cannot crowd everything else out.
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
