import { agentBriefFailure, agentBriefSummary } from '../checks/agent-brief.mjs';
import {
  advisoryNextActionsSummary,
  diagnosisBlockingFailure,
  workspaceBriefSummary,
} from '../checks/diagnosis.mjs';
import { structuredContentFailure } from '../checks/structured-content.mjs';
import { log } from '../output.mjs';

export function verifyBriefs(responses) {
  const briefRes = responses.find((r) => r.id === 6);
  const agentBriefRes = responses.find((r) => r.id === 66);
  if (!briefRes || !briefRes.result) {
    log('fail', 'no query_ontology workspace_brief response');
    return false;
  }
  try {
    const text = briefRes.result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    const failure = diagnosisBlockingFailure('workspace_brief', parsed, 'workspace_brief');
    if (failure) {
      log('fail', failure);
      return false;
    }
    const structuredFailure = structuredContentFailure(briefRes, parsed, 'workspace_brief');
    if (structuredFailure) {
      log('fail', structuredFailure);
      return false;
    }
    log(
      'ok',
      `workspace_brief: ${parsed.status} (${workspaceBriefSummary(parsed)})`,
    );
    const advisory = advisoryNextActionsSummary(parsed.nextActions);
    if (advisory) log('info', `workspace_brief non-blocking advisory nextActions: ${advisory}`);
  } catch (err) {
    log('fail', `failed to parse workspace_brief response: ${err.message}`);
    return false;
  }

  if (!agentBriefRes || !agentBriefRes.result) {
    log('fail', 'no query_ontology agent_brief response');
    return false;
  }
  try {
    const text = agentBriefRes.result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    const failure = agentBriefFailure(parsed);
    if (failure) {
      log('fail', failure);
      return false;
    }
    const structuredFailure = structuredContentFailure(agentBriefRes, parsed, 'agent_brief');
    if (structuredFailure) {
      log('fail', structuredFailure);
      return false;
    }
    log('ok', `agent_brief: ${parsed.status} (${agentBriefSummary(parsed)})`);
  } catch (err) {
    log('fail', `failed to parse agent_brief response: ${err.message}`);
    return false;
  }

  return true;
}
