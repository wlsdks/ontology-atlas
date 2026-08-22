export type {
  Project,
  ProjectCategory,
  ProjectStatus,
  ProjectLink,
  ProjectTimeline,
  ProjectPosition,
  ProjectInput,
} from "./model";
export {
  computeHubSlugs,
  getProjectRelationshipMeta,
  isProjectRecentlyUpdated,
  isSharedNode,
  resolveProjectCompletenessInsight,
  resolveProjectFreshnessInsight,
  resolveProjectImpactInsight,
  resolveProjectRelationshipKind,
  wouldCreateDependencyCycle,
  findProjectsReferencingSlug,
  findBulkDeleteBlockingReferences,
  findMissingDependencySlugs,
  findDuplicateDependencySlugs,
  collectProjectDependencyClosure,
  collectProjectDependentClosure,
  collectProjectConnectedClosure,
  getProjectIntegrityIssues,
  formatProjectIntegrityIssue,
  projectToInput,
  computeSuggestedDependencies,
  detectStaleProjects,
  detectOrphanProjects,
  detectPromotionCandidates,
} from "./model";
export type {
  SuggestedDependency,
  DetectStaleOptions,
  DetectPromotionOptions,
  PromotionCandidate,
} from "./model";
export type {
  ProjectIntegrityIssue,
  ProjectCompletenessInsight,
  ProjectFreshnessInsight,
  ProjectImpactInsight,
  ProjectImpactMode,
  ProjectRelationshipKind,
  ProjectRelationshipMeta,
} from "./model";
// The cloud entity api was removed permanently, consistent with the vault frontmatter
// being the source of truth. A future cloud-collaboration stage would add a new api/ folder.
export {
  getProjectDetailHref,
  getProjectDetailUrl,
  getProjectEditHref,
  getProjectRuntimeDetailHref,
  getProjectRuntimeDetailUrl,
  resolveProjectFallbackRoute,
} from "./lib/detail-href";
export type { ProjectFallbackRoute } from "./lib/detail-href";
export { getTopologyFocusHref, getTopologyProjectHref } from "./lib/topology-href";
export { ProjectCard } from "./ui/ProjectCard";
export type { CardCategoryMeta, CardStatusDotColor, ProjectCardViewMode } from "./ui/ProjectCard";
export { ProjectMetaGrid } from "./ui/ProjectMetaGrid";
export type { ProjectMetaGridItem } from "./ui/ProjectMetaGrid";
