import { VAULT_ISSUE_CODE_VALUES } from '../server-vocabularies.mjs';

import { formatCount } from '../output.mjs';
import { listConceptsFailure } from './concept-reads.mjs';

export function censusFailure(parsed) {
  if (!Number.isInteger(parsed?.total) || parsed.total < 0) {
    return 'list_concepts census missing total count';
  }
  if (!parsed.byKind || typeof parsed.byKind !== 'object' || Array.isArray(parsed.byKind)) {
    return 'list_concepts census missing byKind aggregate';
  }
  let sum = 0;
  for (const [kind, count] of Object.entries(parsed.byKind)) {
    if (typeof kind !== 'string' || kind.length === 0) {
      return 'list_concepts census has empty kind key';
    }
    if (!Number.isInteger(count) || count < 0) {
      return `list_concepts census missing count for kind: ${kind || 'unknown'}`;
    }
    sum += count;
  }
  if (sum !== parsed.total) {
    return `list_concepts census total mismatch: total ${parsed.total}, byKind ${sum}`;
  }
  return null;
}

export function projectProbeFailure(parsed, kinds) {
  const shapeFailure = listConceptsFailure(parsed);
  if (shapeFailure) return `project probe ${shapeFailure}`;
  const kindProjectCount = Number.isInteger(kinds?.byKind?.project) ? kinds.byKind.project : 0;
  if (kindProjectCount === 0 && parsed.total === 0) {
    return null;
  }
  if (parsed.total < 1) {
    return 'project probe response missing project node';
  }
  const nonProject = parsed.nodes.find((node) => node?.kind !== 'project');
  if (nonProject) {
    return `project probe returned non-project node: ${nonProject.slug || '(unknown)'}`;
  }
  if (Number.isInteger(kindProjectCount) && parsed.total >= 1 && parsed.total !== kindProjectCount) {
    return `project probe count mismatch: census project ${kindProjectCount}, probe ${parsed.total}`;
  }
  return null;
}

export function orphanNodesFailure(parsed) {
  if (parsed?.operation !== 'match_nodes' || parsed.filters?.hasIncoming !== false) {
    return 'orphan match_nodes response did not answer hasIncoming:false';
  }
  if (!Number.isInteger(parsed.totalMatches) || parsed.totalMatches < 0) {
    return 'orphan match_nodes response missing totalMatches';
  }
  if (!Array.isArray(parsed.nodes)) {
    return 'orphan match_nodes response missing nodes array';
  }
  if (parsed.nodes.length > parsed.totalMatches) {
    return `orphan match_nodes node count exceeds totalMatches: nodes ${parsed.nodes.length}, totalMatches ${parsed.totalMatches}`;
  }
  for (const [index, node] of parsed.nodes.entries()) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      return `orphan match_nodes response malformed node at index ${index}`;
    }
    if (typeof node.slug !== 'string' || node.slug.length === 0) {
      return `orphan match_nodes response missing slug at index ${index}`;
    }
    if (typeof node.kind !== 'string' || node.kind.length === 0) {
      return `orphan match_nodes response missing kind: ${node.slug}`;
    }
    if (typeof node.title !== 'string' || node.title.length === 0) {
      return `orphan match_nodes response missing title: ${node.slug}`;
    }
    if (node.inDegree !== 0) {
      return `orphan match_nodes response returned a node with incoming relations: ${node.slug}`;
    }
  }
  return null;
}

export function validateVaultFailure(parsed) {
  const summary = parsed?.summary;
  if (!summary) return 'validate_vault response missing summary';
  if (!Number.isInteger(parsed?.scanned) || parsed.scanned < 0) {
    return 'validate_vault response missing scanned count';
  }
  if (!Number.isInteger(summary.problemFiles) || summary.problemFiles < 0) {
    return 'validate_vault response missing problemFiles count';
  }
  if (!Number.isInteger(summary.errorFiles) || summary.errorFiles < 0) {
    return 'validate_vault response missing errorFiles count';
  }
  if (!Number.isInteger(summary.warningFiles) || summary.warningFiles < 0) {
    return 'validate_vault response missing warningFiles count';
  }
  if (!summary.byCode || typeof summary.byCode !== 'object' || Array.isArray(summary.byCode)) {
    return 'validate_vault response missing byCode aggregate';
  }
  if (Array.isArray(parsed.problems)) {
    for (const [problemIndex, problem] of parsed.problems.entries()) {
      if (!Array.isArray(problem?.issues)) continue;
      for (const [issueIndex, issue] of problem.issues.entries()) {
        if (!VAULT_ISSUE_CODE_VALUES.includes(issue?.code)) {
          return `validate_vault response unknown issue code at problems[${problemIndex}].issues[${issueIndex}]: ${issue?.code}`;
        }
      }
    }
  }
  const byCodeFailure = validateByCodeAggregate(summary.byCode);
  if (byCodeFailure) return byCodeFailure;
  const problemFiles = summary.problemFiles;
  if (problemFiles === 0) return null;
  if (Object.keys(summary.byCode).length === 0) {
    return 'validate_vault response missing byCode entries for problem files';
  }
  // Warning-only problem files warn (see `validateVaultNotice`); a file with
  // an error is what fails verification, matching `ontology-atlas validate`.
  if (summary.errorFiles === 0) return null;
  const codeSummary = validationCodeSummary(summary.byCode);
  const suffix = codeSummary ? ` · codes ${codeSummary}` : '';
  return `validate_vault found ${formatCount(problemFiles, 'problem file')}: errors ${summary.errorFiles}, warnings ${summary.warningFiles}${suffix}`;
}

/** Warning-only validation problems, printed but never fatal. */
export function validateVaultNotice(parsed) {
  const summary = parsed?.summary;
  if (!summary || !Number.isInteger(summary.problemFiles) || summary.problemFiles === 0) return null;
  if (summary.errorFiles !== 0) return null;
  const codeSummary = summary.byCode && typeof summary.byCode === 'object' && !Array.isArray(summary.byCode)
    ? validationCodeSummary(summary.byCode)
    : '';
  const suffix = codeSummary ? ` · codes ${codeSummary}` : '';
  return `validate_vault found ${formatCount(summary.problemFiles, 'problem file')} with warnings only (errors 0, warnings ${summary.warningFiles})${suffix}; warnings do not block verification.`;
}

function validateByCodeAggregate(byCode) {
  for (const [code, entry] of Object.entries(byCode)) {
    if (!VAULT_ISSUE_CODE_VALUES.includes(code)) {
      return `validate_vault response unknown byCode key: ${code}`;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return `validate_vault response malformed byCode entry: ${code}`;
    }
    if (typeof entry.severity !== 'string' || entry.severity.length === 0) {
      return `validate_vault response missing byCode severity: ${code}`;
    }
    if (!Number.isInteger(entry.count) || entry.count < 0) {
      return `validate_vault response missing byCode count: ${code}`;
    }
    if (entry.files !== undefined && !Array.isArray(entry.files)) {
      return `validate_vault response malformed byCode files: ${code}`;
    }
    if (entry.remedy !== undefined && (typeof entry.remedy !== 'string' || entry.remedy.length === 0)) {
      return `validate_vault response malformed byCode remedy: ${code}`;
    }
  }
  return null;
}

export function validationCodeSummary(byCode, limit = 3) {
  const entries = Object.entries(byCode || {})
    .filter(([, entry]) => Number.isInteger(entry?.count))
    .sort(([aCode, a], [bCode, b]) => b.count - a.count || aCode.localeCompare(bCode));
  if (entries.length === 0) return null;
  const shown = entries.slice(0, limit).map(([code, entry]) => `${code}:${entry.severity || 'unknown'}:${entry.count}`);
  const suffix = entries.length > shown.length ? `, +${entries.length - shown.length} more` : '';
  return `${shown.join(', ')}${suffix}`;
}
