import type { Project } from "./types";

export type BulkDeleteBlockingReference = {
  targetSlug: string;
  referencedBy: Project[];
};

export function findProjectsReferencingSlug(
  projects: Project[],
  slug: string,
): Project[] {
  return projects.filter((project) => project.dependencies.includes(slug));
}

export function findMissingDependencySlugs(
  dependencies: string[],
  availableSlugs: Iterable<string>,
): string[] {
  const available = new Set(availableSlugs);
  return dependencies.filter((dependency) => !available.has(dependency));
}

export function findDuplicateDependencySlugs(
  dependencies: string[],
): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const dependency of dependencies) {
    if (seen.has(dependency)) {
      duplicates.push(dependency);
      continue;
    }
    seen.add(dependency);
  }

  return duplicates;
}

export function collectProjectDependencyClosure(
  projects: Project[],
  targetSlugs: Iterable<string>,
): Project[] {
  const projectMap = new Map(projects.map((project) => [project.slug, project]));
  const included = new Set<string>();
  const queue = [...new Set(targetSlugs)];

  while (queue.length > 0) {
    const slug = queue.shift();
    if (!slug || included.has(slug)) {
      continue;
    }

    included.add(slug);
    const project = projectMap.get(slug);
    if (!project) {
      continue;
    }

    for (const dependency of project.dependencies) {
      if (!included.has(dependency)) {
        queue.push(dependency);
      }
    }
  }

  return projects.filter((project) => included.has(project.slug));
}

export function collectProjectDependentClosure(
  projects: Project[],
  targetSlugs: Iterable<string>,
): Project[] {
  const reverseDependencyMap = new Map<string, string[]>();

  for (const project of projects) {
    for (const dependency of project.dependencies) {
      const dependents = reverseDependencyMap.get(dependency);
      if (dependents) {
        dependents.push(project.slug);
      } else {
        reverseDependencyMap.set(dependency, [project.slug]);
      }
    }
  }

  const included = new Set<string>();
  const queue = [...new Set(targetSlugs)];

  while (queue.length > 0) {
    const slug = queue.shift();
    if (!slug || included.has(slug)) {
      continue;
    }

    included.add(slug);

    for (const dependentSlug of reverseDependencyMap.get(slug) ?? []) {
      if (!included.has(dependentSlug)) {
        queue.push(dependentSlug);
      }
    }
  }

  return projects.filter((project) => included.has(project.slug));
}

export function collectProjectConnectedClosure(
  projects: Project[],
  targetSlugs: Iterable<string>,
): Project[] {
  const adjacencyMap = new Map<string, Set<string>>();

  function connect(a: string, b: string) {
    const neighbors = adjacencyMap.get(a);
    if (neighbors) {
      neighbors.add(b);
    } else {
      adjacencyMap.set(a, new Set([b]));
    }
  }

  for (const project of projects) {
    if (!adjacencyMap.has(project.slug)) {
      adjacencyMap.set(project.slug, new Set());
    }

    for (const dependency of project.dependencies) {
      connect(project.slug, dependency);
      connect(dependency, project.slug);
    }
  }

  const included = new Set<string>();
  const queue = [...new Set(targetSlugs)];

  while (queue.length > 0) {
    const slug = queue.shift();
    if (!slug || included.has(slug)) {
      continue;
    }

    included.add(slug);

    for (const neighbor of adjacencyMap.get(slug) ?? []) {
      if (!included.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return projects.filter((project) => included.has(project.slug));
}

export function findBulkDeleteBlockingReferences(
  projects: Project[],
  targetSlugs: Iterable<string>,
): BulkDeleteBlockingReference[] {
  const targets = [...new Set(targetSlugs)];
  const targetSet = new Set(targets);

  return targets.flatMap((targetSlug) => {
    const referencedBy = projects.filter(
      (project) =>
        !targetSet.has(project.slug) && project.dependencies.includes(targetSlug),
    );

    if (referencedBy.length === 0) {
      return [];
    }

    return [{ targetSlug, referencedBy }];
  });
}
