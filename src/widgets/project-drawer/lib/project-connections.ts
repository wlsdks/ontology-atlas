import {
  getProjectRelationshipMeta,
  resolveProjectRelationshipKind,
  type Project,
} from "@/entities/project";

export interface ProjectRelation {
  project: Project;
  relationship: ReturnType<typeof getProjectRelationshipMeta>;
}

const NEXT_PROJECT_LIMIT = 3;

/** Projects whose `dependencies` name this project. */
export function findReferencedBy(allProjects: readonly Project[], slug: string): Project[] {
  return allProjects.filter((candidate) => candidate.dependencies.includes(slug));
}

/** Dependencies that resolve to a known project; an unknown slug is a missing-dependency issue instead. */
export function buildDependencyRelations(
  project: Project,
  bySlug: ReadonlyMap<string, Project>,
): ProjectRelation[] {
  const relations: ProjectRelation[] = [];
  for (const dependencySlug of project.dependencies) {
    const dependency = bySlug.get(dependencySlug);
    if (!dependency) continue;
    relations.push({
      project: dependency,
      relationship: getProjectRelationshipMeta(resolveProjectRelationshipKind(dependencySlug)),
    });
  }
  return relations;
}

export function buildReferencedByRelations(
  project: Project,
  referencedBy: readonly Project[],
): ProjectRelation[] {
  const relationship = getProjectRelationshipMeta(resolveProjectRelationshipKind(project.slug));
  return referencedBy.map((referrer) => ({ project: referrer, relationship }));
}

/** The first few distinct neighbours, dependencies before referrers. */
export function pickNextProjects(
  dependencies: readonly ProjectRelation[],
  referencedBy: readonly ProjectRelation[],
): Project[] {
  const distinct: Project[] = [];
  for (const { project } of [...dependencies, ...referencedBy]) {
    if (distinct.some((seen) => seen.slug === project.slug)) continue;
    distinct.push(project);
  }
  return distinct.slice(0, NEXT_PROJECT_LIMIT);
}

export interface RelationshipSummaryMessage {
  key: "summaryHubReferenced" | "summaryStandalone" | "summaryBoth" | "summaryDepsOnly" | "summaryRefsOnly";
  values: Record<string, number>;
}

/** Which sentence describes how this project connects, by the hub flag and the two counts. */
export function relationshipSummaryMessage(
  project: Pick<Project, "isHub" | "dependencies">,
  referencedByCount: number,
): RelationshipSummaryMessage {
  const dependencyCount = project.dependencies.length;
  if (project.isHub && referencedByCount > 0) {
    return { key: "summaryHubReferenced", values: { count: referencedByCount } };
  }
  if (dependencyCount === 0 && referencedByCount === 0) {
    return { key: "summaryStandalone", values: {} };
  }
  if (dependencyCount > 0 && referencedByCount > 0) {
    return { key: "summaryBoth", values: { deps: dependencyCount, refs: referencedByCount } };
  }
  if (dependencyCount > 0) {
    return { key: "summaryDepsOnly", values: { count: dependencyCount } };
  }
  return { key: "summaryRefsOnly", values: { count: referencedByCount } };
}

/** A container's prefix is dropped from a member's title so the badge does not say it twice. */
export function displayNameWithoutContainer(
  name: string,
  containerLabel: string | null | undefined,
  isContainerNode: boolean,
): string {
  const prefix = containerLabel?.trim();
  if (!prefix || isContainerNode) return name;
  const separator = `${prefix} · `;
  if (!name.startsWith(separator)) return name;
  const rest = name.slice(separator.length).trim();
  return rest.length > 0 ? rest : name;
}
