export type {
  Project,
  ProjectCategory,
  ProjectPosition,
  ProjectInput,
} from "./model";
export {
  computeHubSlugs,
  getProjectRelationshipMeta,
  isSharedNode,
  resolveProjectCompletenessInsight,
  resolveProjectFreshnessInsight,
  resolveProjectImpactInsight,
  resolveProjectRelationshipKind,
  wouldCreateDependencyCycle,
  findMissingDependencySlugs,
  findDuplicateDependencySlugs,
  getProjectIntegrityIssues,
  formatProjectIntegrityIssue,
  computeSuggestedDependencies,
} from "./model";
export type {
  SuggestedDependency,
} from "./model";
export type {
  ProjectImpactMode,
} from "./model";
// No api/ folder: vault frontmatter is the source of truth.
export {
  getProjectEditHref,
  getProjectRuntimeDetailHref,
  getProjectRuntimeDetailUrl,
  resolveProjectFallbackRoute,
} from "./lib/detail-href";
export { getTopologyFocusHref, getTopologyProjectHref, getTopologyProjectNodeHref } from "./lib/topology-href";
export { ProjectCard } from "./ui/ProjectCard";
export { ProjectMetaGrid } from "./ui/ProjectMetaGrid";
export { projectToInput } from "./model/to-input";
export { projectDisplayName, projectHasDisplayName, readDisplayNames } from "./lib/display-name";
export { rankProjectMatches } from "./lib/match-projects";
export type { ProjectMatchSource } from "./lib/match-projects";
