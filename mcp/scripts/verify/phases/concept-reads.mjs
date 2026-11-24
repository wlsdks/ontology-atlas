import {
  findBacklinksFailure,
  findEvidenceFailure,
  conceptRowFailure,
  getConceptsFailure,
  limitedQueryConceptsFailure,
  listConceptsFailure,
  queryConceptsFailure,
  vaultWarningsNotice,
} from '../checks/concept-reads.mjs';
import { structuredContentFailure } from '../checks/structured-content.mjs';
import { emptyVerifyVaultFailure } from '../cli.mjs';
import { formatCount, log } from '../output.mjs';
import { buildGetConceptSmokeSlug, buildGraphQuerySmokeArgs } from '../requests/follow-ups.mjs';

export function verifyConceptReads(responses, {
  limitedQueryConceptsSmoke,
  callRes,
  projectProbeRes,
}) {
  const getConceptsRes = responses.find((r) => r.id === 11);
  const getConceptRes = responses.find((r) => r.id === 31);
  const findEvidenceRes = responses.find((r) => r.id === 32);
  const findBacklinksRes = responses.find((r) => r.id === 33);
  const queryConceptsRes = responses.find((r) => r.id === 34);
  const limitedQueryConceptsRes = responses.find((r) => r.id === 37);
  let listPayload = null;
  let graphSmokeArgs = null;
  let getConceptVerified = false;
  let findBacklinksVerified = false;
  if (!callRes || !callRes.result) {
    log('fail', 'no list_concepts response');
    return false;
  }
  try {
    const text = callRes.result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    const failure = listConceptsFailure(parsed);
    if (failure) {
      log('fail', failure);
      return false;
    }
    const warningNotice = vaultWarningsNotice(parsed);
    if (warningNotice) log('warn', warningNotice);
    const structuredFailure = structuredContentFailure(callRes, parsed, 'list_concepts');
    if (structuredFailure) {
      log('fail', structuredFailure);
      return false;
    }
    listPayload = parsed;
    let projectProbePayloadForSmoke = null;
    const projectProbeText = projectProbeRes?.result?.content?.[0]?.text;
    if (typeof projectProbeText === 'string') {
      try {
        projectProbePayloadForSmoke = JSON.parse(projectProbeText);
      } catch {
        projectProbePayloadForSmoke = null;
      }
    }
    graphSmokeArgs = buildGraphQuerySmokeArgs(parsed, projectProbePayloadForSmoke);
    log('ok', `list_concepts: vault total ${parsed.total} nodes (vaultRoot ${parsed.vaultRoot})`);
    const emptyVaultFailure = emptyVerifyVaultFailure(parsed);
    if (emptyVaultFailure) {
      log('fail', emptyVaultFailure);
      return false;
    }
  } catch (err) {
    log('fail', `failed to parse list_concepts response: ${err.message}`);
    return false;
  }

  if (!getConceptsRes || !getConceptsRes.result) {
    log('fail', 'no get_concepts response');
    return false;
  }
  if (getConceptRes) {
    const expectedSlug = buildGetConceptSmokeSlug(listPayload);
    if (!expectedSlug) {
      log('fail', 'unexpected single get_concepts response without a list_concepts slug');
      return false;
    }
    try {
      const text = getConceptRes.result?.content?.[0]?.text || '';
      const parsed = JSON.parse(text);
      const row = parsed?.concepts?.[0];
      const failure = conceptRowFailure(row, expectedSlug);
      if (failure) {
        log('fail', failure);
        return false;
      }
      const structuredFailure = structuredContentFailure(getConceptRes, parsed, 'get_concepts');
      if (structuredFailure) {
        log('fail', structuredFailure);
        return false;
      }
      getConceptVerified = true;
      log('ok', `single get_concepts: ${row.slug} (${row.outgoingEdges.length} outgoing edges)`);
    } catch (err) {
      log('fail', `failed to parse single get_concepts response: ${err.message}`);
      return false;
    }
  }
  try {
    const text = getConceptsRes.result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    const failure = getConceptsFailure(parsed);
    if (failure) {
      log('fail', failure);
      return false;
    }
    const structuredFailure = structuredContentFailure(getConceptsRes, parsed, 'get_concepts');
    if (structuredFailure) {
      log('fail', structuredFailure);
      return false;
    }
    const okRows = parsed.concepts.filter((row) => row?.ok === true).length;
    const partialRows = parsed.concepts.filter((row) => row?.ok === false).length;
    log('ok', `get_concepts: ${formatCount(okRows, 'ok row')}, ${formatCount(partialRows, 'partial row')}`);
  } catch (err) {
    log('fail', `failed to parse get_concepts response: ${err.message}`);
    return false;
  }

  if (!findEvidenceRes || !findEvidenceRes.result) {
    log('fail', 'no find_evidence response');
    return false;
  }
  try {
    const text = findEvidenceRes.result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    const failure = findEvidenceFailure(parsed);
    if (failure) {
      log('fail', failure);
      return false;
    }
    const structuredFailure = structuredContentFailure(findEvidenceRes, parsed, 'find_evidence');
    if (structuredFailure) {
      log('fail', structuredFailure);
      return false;
    }
    log('ok', `find_evidence: ${formatCount(parsed.matches.length, 'evidence result')} for "${parsed.query}"`);
  } catch (err) {
    log('fail', `failed to parse find_evidence response: ${err.message}`);
    return false;
  }

  if (findBacklinksRes) {
    const expectedSlug = buildGetConceptSmokeSlug(listPayload);
    if (!expectedSlug) {
      log('fail', 'unexpected find_backlinks response without a list_concepts slug');
      return false;
    }
    try {
      const text = findBacklinksRes.result?.content?.[0]?.text || '';
      const parsed = JSON.parse(text);
      const failure = findBacklinksFailure(parsed, expectedSlug);
      if (failure) {
        log('fail', failure);
        return false;
      }
      const structuredFailure = structuredContentFailure(findBacklinksRes, parsed, 'find_backlinks');
      if (structuredFailure) {
        log('fail', structuredFailure);
        return false;
      }
      findBacklinksVerified = true;
      log('ok', `find_backlinks: ${parsed.target} (${formatCount(parsed.total, 'backlink')})`);
    } catch (err) {
      log('fail', `failed to parse find_backlinks response: ${err.message}`);
      return false;
    }
  }

  if (!queryConceptsRes || !queryConceptsRes.result) {
    log('fail', 'no query_concepts response');
    return false;
  }
  try {
    const text = queryConceptsRes.result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    const failure = queryConceptsFailure(parsed);
    if (failure) {
      log('fail', failure);
      return false;
    }
    const structuredFailure = structuredContentFailure(queryConceptsRes, parsed, 'query_concepts');
    if (structuredFailure) {
      log('fail', structuredFailure);
      return false;
    }
    log('ok', `query_concepts: ${formatCount(parsed.matches.length, 'query result')} / ${formatCount(parsed.total, 'total query result')}`);
  } catch (err) {
    log('fail', `failed to parse query_concepts response: ${err.message}`);
    return false;
  }

  let limitedQueryConceptsVerified = false;
  if (limitedQueryConceptsSmoke) {
    if (!limitedQueryConceptsRes || !limitedQueryConceptsRes.result) {
      log('fail', 'no query_concepts_limited response');
      return false;
    }
    try {
      const text = limitedQueryConceptsRes.result.content?.[0]?.text || '';
      const parsed = JSON.parse(text);
      const failure = limitedQueryConceptsFailure(
        parsed,
        limitedQueryConceptsSmoke.excludedSlug,
        limitedQueryConceptsSmoke.expectedTotal,
      );
      if (failure) {
        log('fail', failure);
        return false;
      }
      const structuredFailure = structuredContentFailure(limitedQueryConceptsRes, parsed, 'query_concepts_limited');
      if (structuredFailure) {
        log('fail', structuredFailure);
        return false;
      }
      limitedQueryConceptsVerified = true;
      log('ok', `query_concepts limited: ${formatCount(parsed.matches.length, 'query result')} / ${formatCount(parsed.total, 'total query result')} (limited ${parsed.limited})`);
    } catch (err) {
      log('fail', `failed to parse query_concepts_limited response: ${err.message}`);
      return false;
    }
  }
  return {
    listPayload,
    graphSmokeArgs,
    getConceptVerified,
    findBacklinksVerified,
    limitedQueryConceptsVerified,
  };
}
