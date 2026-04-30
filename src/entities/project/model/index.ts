export type {
  Project,
  ProjectCategory,
  ProjectStatus,
  ProjectLink,
  ProjectTimeline,
  ProjectPosition,
  ProjectInput,
} from './types';
export { fromFirestore, toFirestore, projectToInput } from './mapper';
export { SEED_PROJECTS } from './seed-data';
export { resolveFallbackProjects } from './fallback';
export { computeHubSlugs, isSharedNode } from './hub';
export {
  getProjectRelationshipMeta,
  resolveProjectRelationshipKind,
  type ProjectRelationshipKind,
  type ProjectRelationshipMeta,
} from './relationships';
export {
  isProjectRecentlyUpdated,
  resolveProjectCompletenessInsight,
  resolveProjectFreshnessInsight,
  resolveProjectImpactInsight,
  type ProjectCompletenessInsight,
  type ProjectFreshnessInsight,
  type ProjectImpactInsight,
  type ProjectImpactMode,
} from './insights';
export { wouldCreateDependencyCycle } from './cycles';
export {
  findProjectsReferencingSlug,
  findBulkDeleteBlockingReferences,
  collectProjectDependencyClosure,
  collectProjectDependentClosure,
  collectProjectConnectedClosure,
  findMissingDependencySlugs,
  findDuplicateDependencySlugs,
} from './dependencies';
export { computeSuggestedDependencies, type SuggestedDependency } from './suggestions';
export {
  detectStaleProjects,
  detectOrphanProjects,
  detectPromotionCandidates,
  type DetectStaleOptions,
  type DetectPromotionOptions,
  type PromotionCandidate,
} from './audit';
export {
  getProjectIntegrityIssues,
  formatProjectIntegrityIssue,
  type ProjectIntegrityIssue,
} from './integrity';
