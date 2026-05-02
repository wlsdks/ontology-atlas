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
// API 함수는 barrel 에서 제외 — `@/entities/project/api` 로 직접 import 한다.
// 이유: 이 barrel 을 type / lib only 로 import 하는 페이지가 많은데, api/
// 가 firebase/firestore 를 정적으로 끌어와 local-first 첫 paint 청크에 ~640kb
// 의 firestore SDK 가 박힌다. 분리해 cloud-mode 페이지만 firebase 다운로드.
export { getProjectDetailHref, getProjectDetailUrl } from "./lib/detail-href";
export { getTopologyProjectHref } from "./lib/topology-href";
export { ProjectCard } from "./ui/ProjectCard";
export type { CardCategoryMeta, CardStatusDotColor, ProjectCardViewMode } from "./ui/ProjectCard";
export { ProjectMetaGrid } from "./ui/ProjectMetaGrid";
export type { ProjectMetaGridItem } from "./ui/ProjectMetaGrid";
