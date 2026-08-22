import type { Project } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DetectStaleOptions {
  /** The reference "now"; injected by tests, `new Date()` at runtime. */
  now: Date;
  /** Stale requires strictly more days than this (`>`). */
  daysThreshold: number;
  /** Truncate to the top N. Unset returns everything. */
  limit?: number;
}

/**
 * Projects untouched for at least the given number of days, oldest first — the
 * repair backlog.
 */
export function detectStaleProjects(
  projects: readonly Project[],
  { now, daysThreshold, limit }: DetectStaleOptions,
): Project[] {
  const stale = projects.filter((project) => {
    const ageMs = now.getTime() - project.updatedAt.getTime();
    return ageMs > daysThreshold * MS_PER_DAY;
  });
  stale.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
  return typeof limit === "number" ? stale.slice(0, limit) : stale;
}

/**
 * "Orphan" projects with zero incoming references and zero outgoing dependencies.
 * Hubs are excluded because a hub is meaningful on its own. Sorted by name.
 */
export function detectOrphanProjects(projects: readonly Project[]): Project[] {
  const referencedSlugs = new Set<string>();
  for (const project of projects) {
    for (const dep of project.dependencies) {
      referencedSlugs.add(dep);
    }
  }

  const orphans = projects.filter((project) => {
    if (project.isHub) return false;
    if (project.dependencies.length > 0) return false;
    if (referencedSlugs.has(project.slug)) return false;
    return true;
  });

  orphans.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return orphans;
}

export interface DetectPromotionOptions {
  /** A non-hub project referenced at least this many times is a promotion candidate. */
  minFanIn: number;
  /** Top N only. Unset returns everything. */
  limit?: number;
}

export interface PromotionCandidate extends Project {
  fanIn: number;
}

/**
 * Non-hub nodes that are in fact heavily referenced — likely candidates whose
 * `isHub` flag was simply never set. Sorted by fan-in descending.
 */
export function detectPromotionCandidates(
  projects: readonly Project[],
  { minFanIn, limit }: DetectPromotionOptions,
): PromotionCandidate[] {
  const fanInBySlug = new Map<string, number>();
  for (const project of projects) {
    for (const dep of project.dependencies) {
      fanInBySlug.set(dep, (fanInBySlug.get(dep) ?? 0) + 1);
    }
  }

  const candidates: PromotionCandidate[] = projects
    .filter((project) => !project.isHub)
    .map((project) => ({ ...project, fanIn: fanInBySlug.get(project.slug) ?? 0 }))
    .filter((project) => project.fanIn >= minFanIn);

  candidates.sort((a, b) => b.fanIn - a.fanIn);
  return typeof limit === "number" ? candidates.slice(0, limit) : candidates;
}
