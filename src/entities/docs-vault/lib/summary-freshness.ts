/**
 * Whether a summary node's description has fallen behind the membership it describes.
 *
 * A `domain` or `project` body is an aggregate: it says what the capabilities and
 * elements it declares add up to. When that list changes and nobody re-writes the
 * description, the node keeps saying the old thing, and every other check in this
 * product asks whether the graph is *intact* rather than whether it is *true*.
 *
 * Two clocks live in one file — the body, which is the judgement, and the containment
 * arrays, which are the membership. Git sees one file; the two move independently. The
 * question is only interesting when membership moved last, which reads as: *the child
 * list changed after anyone last re-wrote the description of it.*
 *
 * **This is a deliberate second implementation, and it is pinned.** The MCP server
 * answers the same question in `mcp/src/stale-parent.mjs`, but `src/` and `mcp/` are
 * separate packages and the web bundle cannot import the server. Rather than let the
 * rule drift, `tests/contract/summary-freshness-parity.contract.test.ts` runs both over
 * the same cases and requires the same verdict.
 *
 * **What was tried and rejected.** Comparing a parent's file timestamp against its
 * children's flagged 6 of the dogfood vault's 7 domains, and inspection showed every
 * flag was wrong: a domain description is written at a level of abstraction that
 * survives its children being revised. Comparing against child *creation* can never
 * fire at all, because containment is declared in the parent's own frontmatter, so
 * adding a child always touches the parent in the same commit.
 *
 * Revisions arrive from the `vault_node_revisions` Tauri command, which does the Git
 * plumbing and no parsing. In the browser there is no Git, so there is no signal and
 * callers render nothing — honest degradation rather than a false all-clear.
 */

import { parseFrontmatter } from "@/shared/lib/parse-frontmatter";

/** Frontmatter arrays through which a parent holds what is below it. */
const CONTAINMENT_KEYS = ["contains", "capabilities", "elements", "domains"] as const;

/** Kinds whose body is an aggregate of their membership and therefore goes stale. */
export const SUMMARY_KINDS = ["project", "domain"] as const;

/** One historical version of one node, newest first, as `vault_node_revisions` returns it. */
export interface NodeRevision {
  slug: string;
  isoTime: string;
  content: string;
}

export interface SummaryStaleness {
  slug: string;
  /** ISO instant when the body prose last changed. */
  bodyChangedAt: string;
  /** ISO instant when the containment list last changed. */
  membershipChangedAt: string;
  /** How long the description has been behind, in milliseconds. Always positive. */
  behindByMs: number;
  /** Members declared by the current revision. */
  childCount: number;
}

const DAY_MS = 86_400_000;

/** Normalises a containment set so member order and duplicates never read as a change. */
function membershipKey(children: readonly string[]): string {
  const unique = new Set<string>();
  for (const ref of children) {
    const trimmed = typeof ref === "string" ? ref.trim() : "";
    if (trimmed) unique.add(trimmed);
  }
  return JSON.stringify([...unique].sort());
}

/** Collects the containment members declared by a parsed frontmatter object. */
function containedSlugs(frontmatter: Record<string, unknown>): string[] {
  const slugs: string[] = [];
  for (const key of CONTAINMENT_KEYS) {
    const value = frontmatter[key];
    if (!Array.isArray(value)) continue;
    for (const ref of value) {
      if (typeof ref === "string" && ref.trim()) slugs.push(ref.trim());
    }
  }
  return [...new Set(slugs)];
}

interface ParsedRevision {
  isoTime: string;
  body: string;
  membership: string;
  kind: string;
  childCount: number;
}

function parseRevision(revision: NodeRevision): ParsedRevision {
  const { frontmatter, body } = parseFrontmatter(revision.content);
  const children = containedSlugs(frontmatter);
  return {
    isoTime: revision.isoTime,
    body,
    membership: membershipKey(children),
    kind: typeof frontmatter.kind === "string" ? frontmatter.kind : "",
    childCount: children.length,
  };
}

function toTime(iso: string): number | null {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
}

/**
 * Reduces one node's revisions to a staleness verdict, or `null` when there is none.
 *
 * Returns `null` — not a clean verdict — when history is too short to tell the clocks
 * apart, when the node is not a summary kind, or when it declares no members. Absence
 * of a verdict is not the same as a clean bill, and callers render nothing either way.
 */
export function summaryStalenessOf(revisions: readonly NodeRevision[]): SummaryStaleness | null {
  if (revisions.length < 2) return null;
  const slug = revisions[0].slug;
  const parsed = revisions.map(parseRevision);
  const current = parsed[0];
  if (!(SUMMARY_KINDS as readonly string[]).includes(current.kind)) return null;
  if (current.childCount === 0) return null;

  let bodyChangedAt: string | null = null;
  let membershipChangedAt: string | null = null;
  for (let index = 0; index < parsed.length - 1; index += 1) {
    const newer = parsed[index];
    const older = parsed[index + 1];
    if (bodyChangedAt === null && newer.body !== older.body) bodyChangedAt = newer.isoTime;
    if (membershipChangedAt === null && newer.membership !== older.membership) {
      membershipChangedAt = newer.isoTime;
    }
    if (bodyChangedAt !== null && membershipChangedAt !== null) break;
  }
  // A value identical all the way back to the oldest revision available has held since
  // at least that revision, so the oldest timestamp is a safe substitute. It is a bound,
  // not a measurement: using it can only *understate* how far behind the description is,
  // never invent a lag that is not there. `mcp/src/stale-parent.mjs` takes the same
  // fallback, and the parity contract fails if one side stops.
  const oldest = parsed[parsed.length - 1].isoTime;
  const bodyTime = toTime(bodyChangedAt ?? oldest);
  const membershipTime = toTime(membershipChangedAt ?? oldest);
  if (bodyTime === null || membershipTime === null) return null;
  if (membershipTime <= bodyTime) return null;

  return {
    slug,
    bodyChangedAt: new Date(bodyTime).toISOString(),
    membershipChangedAt: new Date(membershipTime).toISOString(),
    behindByMs: membershipTime - bodyTime,
    childCount: current.childCount,
  };
}

/** Groups flat revisions by slug and returns a verdict per node that has one, keyed by slug. */
export function summaryStalenessBySlug(
  revisions: readonly NodeRevision[],
): Map<string, SummaryStaleness> {
  const bySlug = new Map<string, NodeRevision[]>();
  for (const revision of revisions) {
    const list = bySlug.get(revision.slug);
    if (list) list.push(revision);
    else bySlug.set(revision.slug, [revision]);
  }
  const verdicts = new Map<string, SummaryStaleness>();
  for (const [slug, list] of bySlug) {
    const verdict = summaryStalenessOf(list);
    if (verdict) verdicts.set(slug, verdict);
  }
  return verdicts;
}

/** Whole days the description has been behind, floored at 1 so a real lag never reads as zero. */
export function daysBehind(staleness: SummaryStaleness): number {
  return Math.max(1, Math.round(staleness.behindByMs / DAY_MS));
}
