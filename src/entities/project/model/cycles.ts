import type { Project } from "./types";

function buildDependencyMap(projects: Project[]) {
  return new Map(
    projects.map((project) => [project.slug, project.dependencies]),
  );
}

export function wouldCreateDependencyCycle(
  projects: Project[],
  projectSlug: string,
  dependencySlug: string,
): boolean {
  if (projectSlug === dependencySlug) {
    return true;
  }

  const dependencyMap = buildDependencyMap(projects);
  const visited = new Set<string>();
  const stack = [dependencySlug];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    if (current === projectSlug) return true;

    visited.add(current);
    const dependencies = dependencyMap.get(current) ?? [];
    for (const next of dependencies) {
      if (!visited.has(next)) {
        stack.push(next);
      }
    }
  }

  return false;
}
