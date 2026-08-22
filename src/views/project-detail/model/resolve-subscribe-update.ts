import type { Project } from "@/entities/project";

export interface SubscribeUpdate {
  /** Set only when the current slug was found. Null signals "keep the previous project". */
  next: Project | null;
  /** For updating the related list — an empty array is replaced by the fallback. */
  related: Project[];
}

/**
 * The invariant helper keeping `ProjectDetailPage`'s `subscribeProjects` callback from overwriting
 * `initialProject` / `fallbackProject` with null.
 *
 * The public `/project/[slug]/` is build-time static HTML, so `initialProject` already exists. When a
 * user's subscribe returns a list that does not contain that slug, calling `setProject(null)` from
 * `latest.find(slug) ?? null` collapses to "project not found" right after hydration.
 *
 * The rule: "update only when found; do nothing when unsure".
 */
export function resolveSubscribeUpdate(latest: Project[], slug: string): SubscribeUpdate {
  // The static-mode fallback was removed. Saying "this project does not exist" is more honest than
  // showing seed data describing a product that does not exist. The caller's not-found state does that job.
  const next = latest.find((p) => p.slug === slug) ?? null;
  return { next, related: latest };
}
