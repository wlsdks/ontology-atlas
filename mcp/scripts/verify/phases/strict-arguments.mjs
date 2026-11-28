import { maintenanceFilterEnumSummary } from '../checks/maintenance-cursor.mjs';
import {
  strictArgsFailure,
  strictEnumFailure,
  retiredToolFailure,
  strictGraphKindFilterFailure,
  strictListConceptsKindFailure,
  strictMaintenanceFilterFailure,
  strictMatchNodesSortFailure,
  strictMultiArgsFailure,
  strictListConceptsFilterFailure,
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
  const retiredToolRes = responses.find((r) => r.id === 71);
  const strictListConceptsFilterKindRes = responses.find((r) => r.id === 58);
  const strictListConceptsFilterHasKeyRes = responses.find((r) => r.id === 59);
  const strictListConceptsKindFilterRes = responses.find((r) => r.id === 60);
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
  const strictListConceptsKindFilter = strictListConceptsKindFailure(strictListConceptsKindFilterRes);
  if (strictListConceptsKindFilter) {
    log('fail', strictListConceptsKindFilter);
    return false;
  }
  log('ok', 'strict list_concepts filters: invalid kind rejected with closest-value hint');
  const strictListConceptsFilterKind = strictListConceptsFilterFailure(strictListConceptsFilterKindRes);
  if (strictListConceptsFilterKind) {
    log('fail', strictListConceptsFilterKind);
    return false;
  }
  const strictListConceptsFilterHasKey = strictListConceptsFilterFailure(
    strictListConceptsFilterHasKeyRes,
    { field: 'has key', received: 'capabilties', suggestion: 'capabilities' },
  );
  if (strictListConceptsFilterHasKey) {
    log('fail', strictListConceptsFilterHasKey);
    return false;
  }
  log('ok', 'strict list_concepts filter: invalid kind/has-key rejected with closest-value hints');
  const retiredTool = retiredToolFailure(retiredToolRes, {
    retiredTool: 'find_orphans',
    replacementIncludes: "match_nodes",
  });
  if (retiredTool) {
    log('fail', retiredTool);
    return false;
  }
  log('ok', 'retired tool: a retired name answers tool_retired with the call that replaces it');
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
  log('ok', 'strict graph filters: invalid match_nodes.kind/sort and recommend_relations.kind rejected with narrowed diagnostics');
  return true;
}
