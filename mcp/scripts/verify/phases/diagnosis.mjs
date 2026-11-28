import {
  advisoryHealthChecksSummary,
  advisoryNextActionsSummary,
  diagnosisBlockingFailure,
  healthChecksSummary,
  healthSummary,
  workspaceBriefSummary,
} from '../checks/diagnosis.mjs';
import { structuredContentFailure } from '../checks/structured-content.mjs';
import { log } from '../output.mjs';

export function verifyDiagnosis(responses) {
  const healthRes = responses.find((r) => r.id === 7);
  const limitedBriefRes = responses.find((r) => r.id === 21);
  if (!limitedBriefRes || !limitedBriefRes.result) {
    log('fail', 'no query_ontology limited workspace_brief response');
    return false;
  }
  try {
    const text = limitedBriefRes.result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    const failure = diagnosisBlockingFailure('workspace_brief_limited', parsed, 'workspace_brief');
    if (failure) {
      log('fail', failure);
      return false;
    }
    const structuredFailure = structuredContentFailure(limitedBriefRes, parsed, 'workspace_brief_limited');
    if (structuredFailure) {
      log('fail', structuredFailure);
      return false;
    }
    log(
      'ok',
      `workspace_brief_limited: ${parsed.status} (${workspaceBriefSummary(parsed)})`,
    );
    const advisory = advisoryNextActionsSummary(parsed.nextActions);
    if (advisory) log('info', `workspace_brief_limited non-blocking advisory nextActions: ${advisory}`);
  } catch (err) {
    log('fail', `failed to parse limited workspace_brief response: ${err.message}`);
    return false;
  }

  if (!healthRes || !healthRes.result) {
    log('fail', 'no query_ontology health response');
    return false;
  }
  try {
    const text = healthRes.result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    const failure = diagnosisBlockingFailure('health', parsed, 'health');
    if (failure) {
      log('fail', failure);
      return false;
    }
    const structuredFailure = structuredContentFailure(healthRes, parsed, 'health');
    if (structuredFailure) {
      log('fail', structuredFailure);
      return false;
    }
    const checksSummary = healthChecksSummary(parsed.checks);
    log(
      'ok',
      `health: ${parsed.status} (${healthSummary(parsed)}${
        checksSummary ? `: ${checksSummary}` : ''
      })`,
    );
    const advisory = advisoryHealthChecksSummary(parsed.checks);
    if (advisory) log('info', `health non-blocking advisory checks: ${advisory}`);
  } catch (err) {
    log('fail', `failed to parse health response: ${err.message}`);
    return false;
  }

  return true;
}
