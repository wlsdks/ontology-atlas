export type {
  Project,
  ProjectCategory,
  ProjectPosition,
  ProjectInput,
} from './types';
export { computeHubSlugs, isSharedNode } from './hub';
export {
  getProjectRelationshipMeta,
  resolveProjectRelationshipKind,
} from './relationships';
export {
  resolveProjectCompletenessInsight,
  resolveProjectFreshnessInsight,
  resolveProjectImpactInsight,
  type ProjectImpactMode,
} from './insights';
export { wouldCreateDependencyCycle } from './cycles';
export {
  findMissingDependencySlugs,
  findDuplicateDependencySlugs,
} from './dependencies';
export { computeSuggestedDependencies, type SuggestedDependency } from './suggestions';
export {
  getProjectIntegrityIssues,
  formatProjectIntegrityIssue,
} from './integrity';
