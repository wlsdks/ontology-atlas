/** Files that share one parent folder; `folder` is `''` for the chosen folder's own files. */
export interface PlanningFileGroup {
  folder: string;
  paths: string[];
}

export function isPlanningMarkdown(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}

/**
 * Groups relative paths by their parent folder so a list names each folder once. The chosen
 * folder's own files come first; folders keep the order the scan first met them in.
 */
export function groupPlanningFiles(paths: readonly string[]): PlanningFileGroup[] {
  const groups = new Map<string, string[]>([['', []]]);
  for (const path of paths) {
    const separator = path.lastIndexOf('/');
    const folder = separator < 0 ? '' : path.slice(0, separator);
    const group = groups.get(folder);
    if (group) group.push(path);
    else groups.set(folder, [path]);
  }
  return [...groups].filter(([, members]) => members.length > 0).map(([folder, members]) => ({ folder, paths: members }));
}

/** The document a list opens on arrival: the first Markdown file in the order it is shown. */
export function firstPlanningDocument(paths: readonly string[]): string | null {
  return groupPlanningFiles(paths).flatMap((group) => group.paths).find(isPlanningMarkdown) ?? null;
}
