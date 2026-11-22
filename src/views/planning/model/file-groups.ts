export interface PlanningFileGroup {
  folder: string;
  paths: string[];
}

export function isPlanningMarkdown(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}

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

export function firstPlanningDocument(paths: readonly string[]): string | null {
  return groupPlanningFiles(paths).flatMap((group) => group.paths).find(isPlanningMarkdown) ?? null;
}
