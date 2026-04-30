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
  fromFirestore,
  toFirestore,
  SEED_PROJECTS,
  resolveFallbackProjects,
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
export {
  listProjects,
  getProject,
  upsertProject,
  upsertProjectPositions,
  deleteProject,
  deleteProjects,
  subscribeProjects,
  fetchAllProjectsAtBuild,
  uploadScreenshot,
  deleteScreenshot,
} from "./api";
export { getProjectDetailHref, getProjectDetailUrl } from "./lib/detail-href";
export { getTopologyProjectHref } from "./lib/topology-href";
export { ProjectCard } from "./ui/ProjectCard";
export type { CardCategoryMeta, CardStatusDotColor, ProjectCardViewMode } from "./ui/ProjectCard";
export { ProjectMetaGrid } from "./ui/ProjectMetaGrid";
export type { ProjectMetaGridItem } from "./ui/ProjectMetaGrid";
