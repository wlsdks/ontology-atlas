/**
 * Whether a domain or project description predates its latest membership change. Mirrors
 * `mcp/src/stale-parent.mjs` (`summary-freshness-parity.contract.test.ts`); no Git, no verdict.
 */

import { parseFrontmatter } from "@/shared/lib/parse-frontmatter";

/** Frontmatter arrays through which a parent holds what is below it. */
const CONTAINMENT_KEYS = ["contains", "capabilities", "elements", "domains"] as const;

/** Kinds whose body summarizes their membership. */
export const SUMMARY_KINDS = ["project", "domain"] as const;

/** Newest first, as `vault_node_revisions` returns it. */
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
  /** Always positive. */
  behindByMs: number;
  childCount: number;
}

const DAY_MS = 86_400_000;

/** Order and duplicates never read as a change. */
function membershipKey(children: readonly string[]): string {
  const unique = new Set<string>();
  for (const ref of children) {
    const trimmed = typeof ref === "string" ? ref.trim() : "";
    if (trimmed) unique.add(trimmed);
  }
  return JSON.stringify([...unique].sort());
}

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

/** Null, not clean, when history is too short, the kind is not a summary, or there are no members. */
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
  // Unchanged back to the oldest revision: its timestamp is a lower bound that can only understate
  // the lag. `mcp/src/stale-parent.mjs` does the same.
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

/** Verdicts keyed by slug, for nodes that have one. */
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

/** Floored at 1 so a real lag never reads as zero. */
export function daysBehind(staleness: SummaryStaleness): number {
  return Math.max(1, Math.round(staleness.behindByMs / DAY_MS));
}
