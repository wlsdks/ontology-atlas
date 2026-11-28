import { NODE_UID_PATTERN } from '../server-vocabularies.mjs';

import { sameArray } from '../value-checks.mjs';
import {
  NON_BLANK_STRING_PATTERN,
  backlinkRowsSchemaFailure,
  nonBlankStringSchemaFailure,
  outputPropertyAt,
} from './schema-primitives.mjs';

function backlinkRewriteValueSchemaFailure(schema) {
  return !(
    sameArray(schema?.type, ['array', 'object', 'string']) &&
    schema.minLength === 1 &&
    schema.minItems === 1 &&
    schema.minProperties === 1 &&
    schema.pattern === NON_BLANK_STRING_PATTERN &&
    !nonBlankStringSchemaFailure(schema.items) &&
    !nonBlankStringSchemaFailure(schema.propertyNames) &&
    !nonBlankStringSchemaFailure(schema.additionalProperties)
  );
}

function backlinkRewritePlanSchemaFailure(schema, label) {
  if (
    schema?.type !== 'object' ||
    !sameArray(schema.required, ['updates', 'totalUpdated']) ||
    schema.additionalProperties !== false ||
    schema.properties?.totalUpdated?.type !== 'integer' ||
    schema.properties?.totalUpdated?.minimum !== 0
  ) {
    return `${label} outputSchema backlinkUpdates drift`;
  }
  const updates = schema.properties?.updates;
  const row = updates?.items;
  if (
    updates?.type !== 'array' ||
    row?.type !== 'object' ||
    !sameArray(row.required, ['slug', 'title', 'beforeKeys', 'afterKeys', 'bodyChanged']) ||
    row.additionalProperties !== false ||
    nonBlankStringSchemaFailure(row.properties?.slug) ||
    nonBlankStringSchemaFailure(row.properties?.title) ||
    row.properties?.bodyChanged?.type !== 'boolean'
  ) {
    return `${label} outputSchema backlinkUpdates updates drift`;
  }
  for (const propertyName of ['beforeKeys', 'afterKeys']) {
    const keyRows = row.properties?.[propertyName];
    if (
      keyRows?.type !== 'array' ||
      keyRows.items?.type !== 'object' ||
      !sameArray(keyRows.items?.required, ['key']) ||
      keyRows.items?.additionalProperties !== false ||
      nonBlankStringSchemaFailure(keyRows.items?.properties?.key) ||
      backlinkRewriteValueSchemaFailure(keyRows.items?.properties?.before) ||
      backlinkRewriteValueSchemaFailure(keyRows.items?.properties?.after)
    ) {
      return `${label} outputSchema backlinkUpdates ${propertyName} drift`;
    }
  }
  return null;
}

function capturedDocSchemaFailure(schema, label) {
  if (
    schema?.type !== 'object' ||
    !sameArray(schema.required, ['frontmatter']) ||
    schema.additionalProperties !== false ||
    schema.properties?.frontmatter?.type !== 'object' ||
    schema.properties?.body?.type !== 'string' ||
    schema.properties?.bodyExcerpt?.type !== 'string'
  ) {
    return `${label} outputSchema captured doc drift`;
  }
  return null;
}

export function lifecycleToolsSchemaFailure(tools) {
  const renameConceptTool = tools.find((candidate) => candidate?.name === 'rename_concept');
  if (!renameConceptTool) return 'tools/list response missing rename_concept tool';
  if (renameConceptTool.outputSchema?.type !== 'object') {
    return 'rename_concept outputSchema root drift';
  }
  if (!sameArray(renameConceptTool.outputSchema?.required, [
    'ok',
    'dryRun',
    'previewReady',
    'canConfirm',
    'wouldChange',
    'blockedReasons',
    'uid',
    'oldSlug',
    'newSlug',
    'sourcePath',
    'targetPath',
    'backlinkUpdates',
  ])) {
    return 'rename_concept outputSchema required drift';
  }
  if (renameConceptTool.outputSchema?.additionalProperties !== false) {
    return 'rename_concept outputSchema root openness drift';
  }
  if (outputPropertyAt(renameConceptTool, ['properties', 'uid'])?.pattern !== NODE_UID_PATTERN) {
    return 'rename_concept outputSchema uid drift';
  }
  for (const propertyName of ['oldSlug', 'newSlug', 'sourcePath', 'targetPath', 'message']) {
    if (outputPropertyAt(renameConceptTool, ['properties', propertyName])?.type !== 'string') {
      return `rename_concept outputSchema ${propertyName} drift`;
    }
  }
  for (const propertyName of ['ok', 'dryRun', 'moved', 'changed']) {
    if (outputPropertyAt(renameConceptTool, ['properties', propertyName])?.type !== 'boolean') {
      return `rename_concept outputSchema ${propertyName} drift`;
    }
  }
  const renameBacklinkFailure = backlinkRewritePlanSchemaFailure(
    outputPropertyAt(renameConceptTool, ['properties', 'backlinkUpdates']),
    'rename_concept',
  );
  if (renameBacklinkFailure) return renameBacklinkFailure;
  if (outputPropertyAt(renameConceptTool, ['properties', 'postWriteMaintenance'])?.type !== 'object') {
    return 'rename_concept outputSchema postWriteMaintenance drift';
  }

  const mergeConceptsTool = tools.find((candidate) => candidate?.name === 'merge_concepts');
  if (!mergeConceptsTool) return 'tools/list response missing merge_concepts tool';
  if (mergeConceptsTool.outputSchema?.type !== 'object') {
    return 'merge_concepts outputSchema root drift';
  }
  if (!sameArray(mergeConceptsTool.outputSchema?.required, [
    'ok',
    'dryRun',
    'previewReady',
    'canConfirm',
    'wouldChange',
    'blockedReasons',
    'fromUid',
    'intoUid',
    'absorbedUids',
    'fromSlug',
    'intoSlug',
    'fromPath',
    'deleted',
    'backlinkUpdates',
    'capturedFrom',
  ])) {
    return 'merge_concepts outputSchema required drift';
  }
  if (mergeConceptsTool.outputSchema?.additionalProperties !== false) {
    return 'merge_concepts outputSchema root openness drift';
  }
  for (const propertyName of ['fromUid', 'intoUid']) {
    if (outputPropertyAt(mergeConceptsTool, ['properties', propertyName])?.pattern !== NODE_UID_PATTERN) {
      return `merge_concepts outputSchema ${propertyName} drift`;
    }
  }
  const absorbedUidsSchema = outputPropertyAt(mergeConceptsTool, ['properties', 'absorbedUids']);
  if (absorbedUidsSchema?.type !== 'array' || absorbedUidsSchema.items?.pattern !== NODE_UID_PATTERN) {
    return 'merge_concepts outputSchema absorbedUids drift';
  }
  for (const propertyName of ['fromSlug', 'intoSlug', 'fromPath', 'message']) {
    if (outputPropertyAt(mergeConceptsTool, ['properties', propertyName])?.type !== 'string') {
      return `merge_concepts outputSchema ${propertyName} drift`;
    }
  }
  for (const propertyName of ['ok', 'dryRun', 'deleted', 'changed']) {
    if (outputPropertyAt(mergeConceptsTool, ['properties', propertyName])?.type !== 'boolean') {
      return `merge_concepts outputSchema ${propertyName} drift`;
    }
  }
  const mergeBacklinkFailure = backlinkRewritePlanSchemaFailure(
    outputPropertyAt(mergeConceptsTool, ['properties', 'backlinkUpdates']),
    'merge_concepts',
  );
  if (mergeBacklinkFailure) return mergeBacklinkFailure;
  const mergeCapturedFailure = capturedDocSchemaFailure(
    outputPropertyAt(mergeConceptsTool, ['properties', 'capturedFrom']),
    'merge_concepts',
  );
  if (mergeCapturedFailure) return mergeCapturedFailure;
  if (outputPropertyAt(mergeConceptsTool, ['properties', 'postWriteMaintenance'])?.type !== 'object') {
    return 'merge_concepts outputSchema postWriteMaintenance drift';
  }

  const deleteConceptTool = tools.find((candidate) => candidate?.name === 'delete_concept');
  if (!deleteConceptTool) return 'tools/list response missing delete_concept tool';
  if (deleteConceptTool.outputSchema?.type !== 'object') {
    return 'delete_concept outputSchema root drift';
  }
  if (!sameArray(deleteConceptTool.outputSchema?.required, [
    'ok',
    'dryRun',
    'previewReady',
    'canConfirm',
    'wouldChange',
    'blockedReasons',
    'uid',
    'slug',
    'filePath',
  ])) {
    return 'delete_concept outputSchema required drift';
  }
  if (deleteConceptTool.outputSchema?.additionalProperties !== false) {
    return 'delete_concept outputSchema root openness drift';
  }
  if (outputPropertyAt(deleteConceptTool, ['properties', 'uid'])?.pattern !== NODE_UID_PATTERN) {
    return 'delete_concept outputSchema uid drift';
  }
  for (const propertyName of ['slug', 'filePath', 'message']) {
    if (nonBlankStringSchemaFailure(outputPropertyAt(deleteConceptTool, ['properties', propertyName]))) {
      return `delete_concept outputSchema ${propertyName} drift`;
    }
  }
  for (const propertyName of ['ok', 'dryRun', 'forced', 'changed']) {
    if (outputPropertyAt(deleteConceptTool, ['properties', propertyName])?.type !== 'boolean') {
      return `delete_concept outputSchema ${propertyName} drift`;
    }
  }
  for (const propertyName of ['backlinks', 'backlinksAtDelete']) {
    const schema = outputPropertyAt(deleteConceptTool, ['properties', propertyName]);
    const backlinkRowsFailure = backlinkRowsSchemaFailure(schema, `delete_concept outputSchema ${propertyName}`);
    if (backlinkRowsFailure) return backlinkRowsFailure;
  }
  const deleteCapturedFailure = capturedDocSchemaFailure(
    outputPropertyAt(deleteConceptTool, ['properties', 'captured']),
    'delete_concept',
  );
  if (deleteCapturedFailure) return deleteCapturedFailure;
  if (outputPropertyAt(deleteConceptTool, ['properties', 'postWriteMaintenance'])?.type !== 'object') {
    return 'delete_concept outputSchema postWriteMaintenance drift';
  }
  return null;
}
