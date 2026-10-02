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

/** O(n) parser calls and O(1) retained revisions; push returns true when older rows cannot matter. */
export function createSummaryStalenessScan(slug: string) {
  let previous: ParsedRevision | null = null;
  let count = 0;
  let childCount = 0;
  let eligible = true;
  let done = false;
  let bodyChangedAt: string | null = null;
  let membershipChangedAt: string | null = null;
  return {
    push(revision: NodeRevision): boolean {
      if (done) return true;
      const next = parseRevision(revision);
      count += 1;
      if (previous === null) {
        childCount = next.childCount;
        eligible = (SUMMARY_KINDS as readonly string[]).includes(next.kind) && childCount > 0;
      } else {
        if (bodyChangedAt === null && previous.body !== next.body) bodyChangedAt = previous.isoTime;
        if (membershipChangedAt === null && previous.membership !== next.membership) {
          membershipChangedAt = previous.isoTime;
        }
      }
      previous = next;
      done = !eligible || (bodyChangedAt !== null && membershipChangedAt !== null);
      return done;
    },
    finish(): SummaryStaleness | null {
      if (!eligible || count < 2 || previous === null) return null;
      // An unchanged clock uses the oldest read revision as a lower bound, matching the MCP rule.
      const bodyTime = toTime(bodyChangedAt ?? previous.isoTime);
      const membershipTime = toTime(membershipChangedAt ?? previous.isoTime);
      if (bodyTime === null || membershipTime === null || membershipTime <= bodyTime) return null;
      return {
        slug,
        bodyChangedAt: new Date(bodyTime).toISOString(),
        membershipChangedAt: new Date(membershipTime).toISOString(),
        behindByMs: membershipTime - bodyTime,
        childCount,
      };
    },
  };
}

export function summaryStalenessOf(revisions: readonly NodeRevision[]): SummaryStaleness | null {
  if (revisions.length < 2) return null;
  const scan = createSummaryStalenessScan(revisions[0].slug);
  for (const revision of revisions) {
    if (scan.push(revision)) break;
  }
  return scan.finish();
}

/** Floored at 1 so a real lag never reads as zero. */
export function daysBehind(staleness: SummaryStaleness): number {
  return Math.max(1, Math.round(staleness.behindByMs / DAY_MS));
}
