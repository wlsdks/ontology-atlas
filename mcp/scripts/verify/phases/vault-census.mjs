import { structuredContentFailure } from '../checks/structured-content.mjs';
import {
  orphanNodesFailure,
  censusFailure,
  projectProbeFailure,
  validateVaultFailure,
  validateVaultNotice,
} from '../checks/vault-census.mjs';
import { formatCount, log } from '../output.mjs';

export function verifyVaultCensus(responses, { projectProbeRes }) {
  const kindsRes = responses.find((r) => r.id === 4);
  const validateRes = responses.find((r) => r.id === 5);
  const orphansRes = responses.find((r) => r.id === 19);
  let kindsPayload = null;
  let validationPayload = null;
  if (!orphansRes || !orphansRes.result) {
    log('fail', 'no orphan match_nodes response');
    return false;
  }
  try {
    const text = orphansRes.result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    const failure = orphanNodesFailure(parsed);
    if (failure) {
      log('fail', failure);
      return false;
    }
    const structuredFailure = structuredContentFailure(orphansRes, parsed, 'orphan match_nodes');
    if (structuredFailure) {
      log('fail', structuredFailure);
      return false;
    }
    log('ok', `match_nodes hasIncoming:false: ${formatCount(parsed.totalMatches, 'orphan')}`);
  } catch (err) {
    log('fail', `failed to parse orphan match_nodes response: ${err.message}`);
    return false;
  }

  if (!kindsRes || !kindsRes.result) {
    log('fail', 'no list_concepts census response');
    return false;
  }
  try {
    const text = kindsRes.result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    const failure = censusFailure(parsed?.census);
    if (failure) {
      log('fail', failure);
      return false;
    }
    const structuredFailure = structuredContentFailure(kindsRes, parsed, 'list_concepts');
    if (structuredFailure) {
      log('fail', structuredFailure);
      return false;
    }
    kindsPayload = parsed.census;
    const kindSummary = Object.entries(parsed.census.byKind)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([kind, count]) => `${kind}:${count}`)
      .join(', ');
    log('ok', `list_concepts census: ${parsed.census.total} nodes (${kindSummary})`);
  } catch (err) {
    log('fail', `failed to parse list_concepts census response: ${err.message}`);
    return false;
  }

  if (!validateRes || !validateRes.result) {
    log('fail', 'no validate_vault response');
    return false;
  }
  try {
    const text = validateRes.result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    const failure = validateVaultFailure(parsed);
    if (failure) {
      log('fail', failure);
      return false;
    }
    const validateNotice = validateVaultNotice(parsed);
    if (validateNotice) log('warn', validateNotice);
    const structuredFailure = structuredContentFailure(validateRes, parsed, 'validate_vault');
    if (structuredFailure) {
      log('fail', structuredFailure);
      return false;
    }
    validationPayload = parsed;
    log(
      'ok',
      `validate_vault: ${formatCount(parsed.scanned ?? 0, 'file')}, ${formatCount(
        parsed.summary?.problemFiles ?? 0,
        'problem file',
      )}`,
    );
  } catch (err) {
    log('fail', `failed to parse validate_vault response: ${err.message}`);
    return false;
  }

  if (!projectProbeRes || !projectProbeRes.result) {
    log('fail', 'no project probe response');
    return false;
  }
  try {
    const text = projectProbeRes.result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    const failure = projectProbeFailure(parsed, kindsPayload);
    if (failure) {
      log('fail', failure);
      return false;
    }
    const structuredFailure = structuredContentFailure(projectProbeRes, parsed, 'project probe');
    if (structuredFailure) {
      log('fail', structuredFailure);
      return false;
    }
    log('ok', `project probe: ${formatCount(parsed.total, 'project node')}`);
  } catch (err) {
    log('fail', `failed to parse project probe response: ${err.message}`);
    return false;
  }
  return { kindsPayload, validationPayload };
}
