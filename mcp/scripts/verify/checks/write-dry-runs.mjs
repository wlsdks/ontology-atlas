import { isBacklinkKeyValue } from '../../../src/backlink-key-shape.mjs';

import { structuredErrorFailure } from './strict-arguments.mjs';
import { structuredContentFailure } from './structured-content.mjs';

export function patchConflictGuardFailure(response) {
  const structuredFailure = structuredErrorFailure(response, 'patch_concept conflict guard', { errorCode: 'vault_conflict' });
  if (structuredFailure) return structuredFailure;
  const text = response?.result?.content?.[0]?.text || '';
  if (!/expected_mtime|mtime|conflict|modified externally/i.test(text)) {
    return 'patch_concept conflict guard response did not explain the stale expected_mtime conflict';
  }
  return null;
}

export function destructiveDryRunFailure(response, toolName) {
  if (!response || !response.result) {
    return `no ${toolName} dry-run response`;
  }
  if (response.result.isError === true) {
    return `${toolName} dry-run returned top-level tool error`;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(response.result.content?.[0]?.text || '{}');
  } catch (err) {
    return `failed to parse ${toolName} dry-run response: ${err.message}`;
  }
  const structuredFailure = structuredContentFailure(response, parsed, `${toolName} dry-run`);
  if (structuredFailure) return structuredFailure;
  if (parsed.ok !== false || parsed.dryRun !== true) {
    return `${toolName} dry-run response must be ok:false with dryRun:true`;
  }
  const previewFailure = destructivePreviewContractFailure(parsed, `${toolName} dry-run`);
  if (previewFailure) return previewFailure;
  if (Object.prototype.hasOwnProperty.call(parsed, 'changed')) {
    return `${toolName} dry-run response unexpectedly included changed`;
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'postWriteMaintenance')) {
    return `${toolName} dry-run response unexpectedly included postWriteMaintenance`;
  }
  if (typeof parsed.message !== 'string' || !/confirm:true|force:true/.test(parsed.message)) {
    return `${toolName} dry-run response missing follow-up safety hint`;
  }
  if (toolName === 'rename_concept') {
    if (parsed.canConfirm !== true || parsed.blockedReasons.length !== 0) {
      return 'rename_concept dry-run response must be immediately confirmable';
    }
    if (parsed.moved !== false || typeof parsed.oldSlug !== 'string' || typeof parsed.newSlug !== 'string') {
      return 'rename_concept dry-run response missing rename preview fields';
    }
    const backlinkFailure = destructiveBacklinkUpdatesFailure(parsed.backlinkUpdates, toolName);
    if (backlinkFailure) return backlinkFailure;
  }
  if (toolName === 'merge_concepts') {
    if (parsed.canConfirm !== true || parsed.blockedReasons.length !== 0) {
      return 'merge_concepts dry-run response must be immediately confirmable';
    }
    if (parsed.deleted !== false || typeof parsed.fromSlug !== 'string' || typeof parsed.intoSlug !== 'string') {
      return 'merge_concepts dry-run response missing merge preview fields';
    }
    const backlinkFailure = destructiveBacklinkUpdatesFailure(parsed.backlinkUpdates, toolName);
    if (backlinkFailure) return backlinkFailure;
  }
  if (toolName === 'delete_concept') {
    if (!isCleanNonBlankString(parsed.slug) || !Array.isArray(parsed.backlinks)) {
      return 'delete_concept dry-run response missing delete preview fields';
    }
    const backlinkRowsFailure = destructiveBacklinkRowsFailure(parsed.backlinks, toolName, 'backlinks');
    if (backlinkRowsFailure) return backlinkRowsFailure;
    const expectedCanConfirm = parsed.backlinks.length === 0;
    if (parsed.canConfirm !== expectedCanConfirm) {
      return `delete_concept dry-run response canConfirm must be ${expectedCanConfirm} for ${parsed.backlinks.length} backlink(s)`;
    }
  }
  return null;
}

// absorb_document targets a temp fixture rather than a vault node, so it is
// checked and logged on its own line, outside the rename/merge/delete count.
export function absorbDocumentDryRunFailure(response) {
  if (!response || !response.result) {
    return 'no absorb_document dry-run response';
  }
  if (response.result.isError === true) {
    return 'absorb_document dry-run returned top-level tool error';
  }
  let parsed = null;
  try {
    parsed = JSON.parse(response.result.content?.[0]?.text || '{}');
  } catch (err) {
    return `failed to parse absorb_document dry-run response: ${err.message}`;
  }
  const structuredFailure = structuredContentFailure(response, parsed, 'absorb_document dry-run');
  if (structuredFailure) return structuredFailure;
  if (parsed.ok !== false || parsed.dryRun !== true) {
    return 'absorb_document dry-run response must be ok:false with dryRun:true';
  }
  const previewFailure = destructivePreviewContractFailure(parsed, 'absorb_document dry-run');
  if (previewFailure) return previewFailure;
  if (parsed.outsideRepo !== true) {
    return 'absorb_document dry-run response must identify the temp fixture as outside repoRoot';
  }
  if (parsed.canConfirm !== true || parsed.blockedReasons.length !== 0) {
    return 'absorb_document dry-run response with allowOutsideRepo:true must be immediately confirmable';
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'changed')) {
    return 'absorb_document dry-run response unexpectedly included changed';
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'postWriteMaintenance')) {
    return 'absorb_document dry-run response unexpectedly included postWriteMaintenance';
  }
  if (typeof parsed.message !== 'string' || !/confirm:\s*true/.test(parsed.message)) {
    return 'absorb_document dry-run response missing follow-up safety hint';
  }
  if (!isCleanNonBlankString(parsed.filePath) || !isCleanNonBlankString(parsed.sourceLabel)) {
    return 'absorb_document dry-run response missing file identity fields';
  }
  const summary = parsed.summary;
  if (
    !summary ||
    !Number.isInteger(summary.total) ||
    !Number.isInteger(summary.absorbed) ||
    !Number.isInteger(summary.suggested) ||
    !Number.isInteger(summary.injectionSuspect) ||
    !Number.isInteger(summary.unclassified)
  ) {
    return 'absorb_document dry-run response missing summary counts';
  }
  if (!Array.isArray(parsed.sections) || parsed.sections.length !== summary.total) {
    return 'absorb_document dry-run response sections/summary.total mismatch';
  }
  for (let index = 0; index < parsed.sections.length; index += 1) {
    const section = parsed.sections[index];
    if (
      !section ||
      !isCleanNonBlankString(section.heading) ||
      !isCleanNonBlankString(section.category) ||
      !isCleanNonBlankString(section.action) ||
      typeof section.injectionSuspect !== 'boolean' ||
      !Array.isArray(section.injectionMatches)
    ) {
      return `absorb_document dry-run response sections[${index}] shape drift`;
    }
  }
  // The verify fixture (ensureAbsorbFixture) is crafted with one policy
  // heading and one architecture heading so both branches are exercised —
  // guard against a classifier regression silently collapsing that.
  if (summary.absorbed < 1 || summary.suggested < 1) {
    return 'absorb_document dry-run response did not classify the fixture as expected (need >=1 absorb and >=1 suggest section)';
  }
  return null;
}

function destructivePreviewContractFailure(parsed, label) {
  if (parsed.previewReady !== true) {
    return `${label} response must expose previewReady:true`;
  }
  if (typeof parsed.canConfirm !== 'boolean') {
    return `${label} response must expose boolean canConfirm`;
  }
  if (parsed.wouldChange !== true) {
    return `${label} response must expose wouldChange:true`;
  }
  if (
    !Array.isArray(parsed.blockedReasons) ||
    parsed.blockedReasons.some((reason) => !isCleanNonBlankString(reason))
  ) {
    return `${label} response must expose clean blockedReasons[]`;
  }
  if (parsed.canConfirm && parsed.blockedReasons.length > 0) {
    return `${label} response cannot be confirmable while blockedReasons is non-empty`;
  }
  if (!parsed.canConfirm && parsed.blockedReasons.length === 0) {
    return `${label} response with canConfirm:false must explain why in blockedReasons`;
  }
  return null;
}

function destructiveBacklinkRowsFailure(rows, toolName, propertyName) {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (
      !row ||
      !isCleanNonBlankString(row.slug) ||
      typeof row.isNode !== 'boolean' ||
      (row.isNode ? !isCleanNonBlankString(row.kind) : row.uid !== undefined || row.kind !== undefined) ||
      !isCleanNonBlankString(row.title) ||
      !Number.isFinite(row.mtime) ||
      row.mtime < 0
    ) {
      return `${toolName} dry-run response ${propertyName}[${index}] shape drift`;
    }
    if (
      Object.prototype.hasOwnProperty.call(row, 'domain') &&
      typeof row.domain !== 'string'
    ) {
      return `${toolName} dry-run response ${propertyName}[${index}] domain drift`;
    }
    if (
      Object.prototype.hasOwnProperty.call(row, 'matchedKeys') &&
      (!Array.isArray(row.matchedKeys) || !row.matchedKeys.every((key) => isCleanNonBlankString(key)))
    ) {
      return `${toolName} dry-run response ${propertyName}[${index}] matchedKeys drift`;
    }
    if (
      Object.prototype.hasOwnProperty.call(row, 'matchedInBody') &&
      typeof row.matchedInBody !== 'boolean'
    ) {
      return `${toolName} dry-run response ${propertyName}[${index}] matchedInBody drift`;
    }
  }
  return null;
}

function destructiveBacklinkUpdatesFailure(backlinkUpdates, toolName) {
  if (
    !backlinkUpdates ||
    !Number.isInteger(backlinkUpdates.totalUpdated) ||
    backlinkUpdates.totalUpdated < 0 ||
    !Array.isArray(backlinkUpdates.updates)
  ) {
    return `${toolName} dry-run response missing backlinkUpdates plan`;
  }
  if (backlinkUpdates.totalUpdated !== backlinkUpdates.updates.length) {
    return `${toolName} dry-run response backlinkUpdates total mismatch`;
  }
  for (let index = 0; index < backlinkUpdates.updates.length; index += 1) {
    const row = backlinkUpdates.updates[index];
    if (
      !row ||
      !isCleanNonBlankString(row.slug) ||
      !isCleanNonBlankString(row.title) ||
      !Array.isArray(row.beforeKeys) ||
      !Array.isArray(row.afterKeys) ||
      typeof row.bodyChanged !== 'boolean'
    ) {
      return `${toolName} dry-run response backlinkUpdates.updates[${index}] shape drift`;
    }
    for (const propertyName of ['beforeKeys', 'afterKeys']) {
      for (let keyIndex = 0; keyIndex < row[propertyName].length; keyIndex += 1) {
        const keyRow = row[propertyName][keyIndex];
        const keyRowFailure = backlinkKeyChangeFailure(keyRow);
        if (keyRowFailure) {
          return `${toolName} dry-run response backlinkUpdates.updates[${index}].${propertyName}[${keyIndex}] ${keyRowFailure}`;
        }
      }
    }
  }
  return null;
}

function backlinkKeyChangeFailure(row) {
  if (!row || !isCleanNonBlankString(row.key)) {
    return 'shape drift';
  }
  if (
    row.before !== undefined &&
    !isBacklinkRewriteValue(row.before)
  ) {
    return 'before drift';
  }
  if (
    row.after !== undefined &&
    !isBacklinkRewriteValue(row.after)
  ) {
    return 'after drift';
  }
  return null;
}

/**
 * Shape validation, including the `relation_notes` map, lives in `mcp/src/backlink-key-shape.mjs`;
 * do not re-implement it here.
 */
function isBacklinkRewriteValue(value) {
  return isBacklinkKeyValue(value);
}

function isCleanNonBlankString(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value && !value.includes('\u0000');
}

export function destructiveDryRunSmokeFailure(expectedResponses) {
  const entries = Array.isArray(expectedResponses) ? expectedResponses : [];
  for (const [toolName, response] of entries) {
    const failure = destructiveDryRunFailure(response, toolName);
    if (failure) return failure;
  }
  return null;
}
