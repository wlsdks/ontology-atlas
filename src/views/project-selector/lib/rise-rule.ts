export interface ShownProjects {
  scope: string;
  slugs: ReadonlySet<string>;
}

/** What counts as already shown: this session's last list for the same folder, else the current one. */
export function resolveRiseBaseline(
  last: ShownProjects | null,
  scope: string,
  slugs: readonly string[],
): ReadonlySet<string> {
  return last !== null && last.scope === scope ? last.slugs : new Set(slugs);
}

export function slugsToRise(baseline: ReadonlySet<string>, slugs: readonly string[]): string[] {
  return slugs.filter((slug) => !baseline.has(slug));
}
