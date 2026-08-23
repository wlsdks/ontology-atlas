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
// The cloud entity api was removed permanently, consistent with the vault frontmatter
// being the source of truth. A future cloud-collaboration stage would add a new api/ folder.
export {
  getProjectEditHref,
  getProjectRuntimeDetailHref,
  getProjectRuntimeDetailUrl,
  resolveProjectFallbackRoute,
} from "./lib/detail-href";
export { getTopologyFocusHref, getTopologyProjectHref } from "./lib/topology-href";
export { ProjectCard } from "./ui/ProjectCard";
export { ProjectMetaGrid } from "./ui/ProjectMetaGrid";
