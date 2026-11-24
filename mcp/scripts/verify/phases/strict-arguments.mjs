import { maintenanceFilterEnumSummary } from '../checks/maintenance-cursor.mjs';
import {
  strictArgsFailure,
  strictEnumFailure,
  strictFindOrphansKindFailure,
  strictGraphKindFilterFailure,
  strictListConceptsKindFailure,
  strictMaintenanceFilterFailure,
  strictMatchEdgesTypeFailure,
  strictMatchNodesSortFailure,
  strictMultiArgsFailure,
  strictQueryConceptsFilterFailure,
  strictRecommendRelationsKindFilterFailure,
  strictRelationCheckFailure,
  strictRelationFilterFailure,
  strictUnknownToolFailure,
} from '../checks/strict-arguments.mjs';
import { log } from '../output.mjs';

export function verifyStrictArguments(responses) {
  const strictArgsRes = responses.find((r) => r.id === 16);
  const strictMultiArgsRes = responses.find((r) => r.id === 27);
  const strictUnknownToolRes = responses.find((r) => r.id === 65);
  const strictFailure = strictArgsFailure(strictArgsRes);
  if (strictFailure) {
    log('fail', strictFailure);
    return false;
  }
  log('ok', 'strict arguments: unknown tool argument rejected at runtime');
  const strictMultiFailure = strictMultiArgsFailure(strictMultiArgsRes);
  if (strictMultiFailure) {
    log('fail', strictMultiFailure);
    return false;
  }
  log('ok', 'strict arguments: multiple unknown tool arguments reported together');
  const strictUnknownToolFailureMessage = strictUnknownToolFailure(strictUnknownToolRes);
  if (strictUnknownToolFailureMessage) {
    log('fail', strictUnknownToolFailureMessage);
    return false;
  }
  log('ok', 'strict tool names: unknown tool rejected with closest-name hint');
  return true;
}

export function verifyStrictFilters(responses) {
  const strictEnumRes = responses.find((r) => r.id === 17);
  const strictMaintenancePhaseFilterRes = responses.find((r) => r.id === 22);
  const strictMaintenanceSeverityFilterRes = responses.find((r) => r.id === 23);
  const strictMaintenanceKindFilterRes = responses.find((r) => r.id === 24);
  const strictRelationFilterRes = responses.find((r) => r.id === 40);
  const strictRelationCheckRes = responses.find((r) => r.id === 46);
  const strictGraphKindFilterRes = responses.find((r) => r.id === 47);
  const strictRecommendRelationsKindFilterRes = responses.find((r) => r.id === 51);
  const strictRecommendRelationsUnsupportedKindFilterRes = responses.find((r) => r.id === 52);
  const strictMatchNodesSortFilterRes = responses.find((r) => r.id === 53);
  const strictMatchEdgesTypeFilterRes = responses.find((r) => r.id === 54);
  const strictFindOrphansKindFilterRes = responses.find((r) => r.id === 56);
  const strictFindOrphansExcludeKindFilterRes = responses.find((r) => r.id === 57);
  const strictQueryConceptsKindFilterRes = responses.find((r) => r.id === 58);
  const strictQueryConceptsHasKeyFilterRes = responses.find((r) => r.id === 59);
  const strictListConceptsKindFilterRes = responses.find((r) => r.id === 60);
  const strictGraphFromKindFilterRes = responses.find((r) => r.id === 48);
  const strictGraphToKindFilterRes = responses.find((r) => r.id === 49);
  const strictEnum = strictEnumFailure(strictEnumRes);
  if (strictEnum) {
    log('fail', strictEnum);
    return false;
  }
  log('ok', 'strict enums: invalid query operation rejected with closest-value hint');
  const strictMaintenancePhaseFilter = strictMaintenanceFilterFailure(strictMaintenancePhaseFilterRes, 'phases');
  if (strictMaintenancePhaseFilter) {
    log('fail', strictMaintenancePhaseFilter);
    return false;
  }
  const strictMaintenanceSeverityFilter = strictMaintenanceFilterFailure(strictMaintenanceSeverityFilterRes, 'severities');
  if (strictMaintenanceSeverityFilter) {
    log('fail', strictMaintenanceSeverityFilter);
    return false;
  }
  const strictMaintenanceKindFilter = strictMaintenanceFilterFailure(strictMaintenanceKindFilterRes, 'kinds');
  if (strictMaintenanceKindFilter) {
    log('fail', strictMaintenanceKindFilter);
    return false;
  }
  log('ok', `strict maintenance filters: invalid phase/severity/kind rejected at runtime (${maintenanceFilterEnumSummary()})`);
  const strictRelationFilter = strictRelationFilterFailure(strictRelationFilterRes);
  if (strictRelationFilter) {
    log('fail', strictRelationFilter);
    return false;
  }
  log('ok', 'strict relation filters: invalid dependencyTypes rejected with closest-value hint');
  const strictFindOrphansKindFilter = strictFindOrphansKindFailure(strictFindOrphansKindFilterRes);
  if (strictFindOrphansKindFilter) {
    log('fail', strictFindOrphansKindFilter);
    return false;
  }
  const strictFindOrphansExcludeKindFilter = strictFindOrphansKindFailure(strictFindOrphansExcludeKindFilterRes, { field: 'excludeKinds items' });
  if (strictFindOrphansExcludeKindFilter) {
    log('fail', strictFindOrphansExcludeKindFilter);
    return false;
  }
  log('ok', 'strict find_orphans filters: invalid kind/excludeKinds rejected with closest-value hints');
  const strictListConceptsKindFilter = strictListConceptsKindFailure(strictListConceptsKindFilterRes);
  if (strictListConceptsKindFilter) {
    log('fail', strictListConceptsKindFilter);
    return false;
  }
  log('ok', 'strict list_concepts filters: invalid kind rejected with closest-value hint');
  const strictQueryConceptsKindFilter = strictQueryConceptsFilterFailure(strictQueryConceptsKindFilterRes);
  if (strictQueryConceptsKindFilter) {
    log('fail', strictQueryConceptsKindFilter);
    return false;
  }
  const strictQueryConceptsHasKeyFilter = strictQueryConceptsFilterFailure(
    strictQueryConceptsHasKeyFilterRes,
    { field: 'has key', received: 'capabilties', suggestion: 'capabilities' },
  );
  if (strictQueryConceptsHasKeyFilter) {
    log('fail', strictQueryConceptsHasKeyFilter);
    return false;
  }
  log('ok', 'strict query_concepts filters: invalid kind/has-key rejected with closest-value hints');
  const strictRelationCheck = strictRelationCheckFailure(strictRelationCheckRes);
  if (strictRelationCheck) {
    log('fail', strictRelationCheck);
    return false;
  }
  log('ok', 'strict relation_check: invalid type rejected before endpoint resolution with closest-value hint and structured repair');
  const strictGraphKindFilter = strictGraphKindFilterFailure(strictGraphKindFilterRes);
  if (strictGraphKindFilter) {
    log('fail', strictGraphKindFilter);
    return false;
  }
  const strictRecommendRelationsKindFilter = strictRecommendRelationsKindFilterFailure(strictRecommendRelationsKindFilterRes);
  if (strictRecommendRelationsKindFilter) {
    log('fail', strictRecommendRelationsKindFilter);
    return false;
  }
  const strictRecommendRelationsUnsupportedKindFilter = strictRecommendRelationsKindFilterFailure(
    strictRecommendRelationsUnsupportedKindFilterRes,
    { received: 'domain', requireSuggestion: false },
  );
  if (strictRecommendRelationsUnsupportedKindFilter) {
    log('fail', strictRecommendRelationsUnsupportedKindFilter);
    return false;
  }
  const strictMatchNodesSortFilter = strictMatchNodesSortFailure(strictMatchNodesSortFilterRes);
  if (strictMatchNodesSortFilter) {
    log('fail', strictMatchNodesSortFilter);
    return false;
  }
  const strictMatchEdgesTypeFilter = strictMatchEdgesTypeFailure(strictMatchEdgesTypeFilterRes);
  if (strictMatchEdgesTypeFilter) {
    log('fail', strictMatchEdgesTypeFilter);
    return false;
  }
  log('ok', 'strict graph filters: invalid match_nodes.kind/sort, match_edges.type, and recommend_relations.kind rejected with narrowed diagnostics');
  const strictGraphFromKindFilter = strictGraphKindFilterFailure(strictGraphFromKindFilterRes, { field: 'fromKind' });
  if (strictGraphFromKindFilter) {
    log('fail', strictGraphFromKindFilter);
    return false;
  }
  const strictGraphToKindFilter = strictGraphKindFilterFailure(strictGraphToKindFilterRes, {
    field: 'toKind',
    received: 'externl',
    suggestion: 'external',
  });
  if (strictGraphToKindFilter) {
    log('fail', strictGraphToKindFilter);
    return false;
  }
  log('ok', 'strict graph edge kind filters: invalid match_edges.fromKind/toKind rejected with closest-value hints');
  return true;
}
