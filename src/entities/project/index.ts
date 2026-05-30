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
// R10b — cloud entity api 영구 제거. mission v2 (vault frontmatter = 진실원)
// 정합. 미래 cloud collab 단계가 다시 도입될 때 새 api/ 폴더로.
export { getProjectDetailHref, getProjectDetailUrl } from "./lib/detail-href";
export { getTopologyFocusHref, getTopologyProjectHref } from "./lib/topology-href";
export { ProjectCard } from "./ui/ProjectCard";
export type { CardCategoryMeta, CardStatusDotColor, ProjectCardViewMode } from "./ui/ProjectCard";
export { ProjectMetaGrid } from "./ui/ProjectMetaGrid";
export type { ProjectMetaGridItem } from "./ui/ProjectMetaGrid";
