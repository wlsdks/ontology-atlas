import type { Project } from "@/entities/project";

export interface SubscribeUpdate {
  /** Null means "keep the previous project". */
  next: Project | null;
  related: Project[];
}

/**
 * Updates only when the slug is found, or a list without it collapses the static page's initial
 * project to "not found" right after hydration.
 */
export function resolveSubscribeUpdate(latest: Project[], slug: string): SubscribeUpdate {
  const next = latest.find((p) => p.slug === slug) ?? null;
  return { next, related: latest };
}
