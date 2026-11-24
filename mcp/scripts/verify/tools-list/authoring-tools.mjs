import { WRITE_RELATION_TYPE_VALUES } from '../../../src/ontology-engine.mjs';

import { sameArray } from '../value-checks.mjs';
import { outputPropertyAt, propertyAt } from './schema-primitives.mjs';

function unknownFieldsItemSchemaFailure(schema, toolName) {
  const items = schema?.items;
  if (
    items?.type !== 'object' ||
    items?.additionalProperties !== false ||
    !sameArray(items?.required, ['name']) ||
    items?.properties?.name?.type !== 'string' ||
    items?.properties?.suggestion?.type !== 'string'
  ) {
    return `${toolName} outputSchema row unknownFields item drift`;
  }
  return null;
}

function stringArraySchemaFailure(schema) {
  return !(schema?.type === 'array' && schema.items?.type === 'string');
}

function mtimeSchemaFailure(schema) {
  return !(schema?.type === 'number' && schema.minimum === 0);
}

export function authoringToolsSchemaFailure(tools) {
  for (const [toolName, propertyName] of [
    ['add_concepts', 'concepts'],
    ['add_relations', 'relations'],
  ]) {
    const tool = tools.find((candidate) => candidate?.name === toolName);
    // toolsListSchemaFailure also supports focused unit fixtures containing a
    // subset of the registry. Live verification separately enforces the full
    // inventory, then validates every destructive tool present here.
    if (!tool) continue;
    if (!sameArray(tool.inputSchema?.required, [propertyName])) {
      return `${toolName} required schema drift`;
    }
    const batchProperty = propertyAt(tool, ['properties', propertyName]);
    if (batchProperty?.type !== 'array' || batchProperty?.maxItems !== 50) {
      return `${toolName}.${propertyName} batch cap schema drift`;
    }
  }

  const addConceptsTool = tools.find((candidate) => candidate?.name === 'add_concepts');
  if (!/unknown field/.test(addConceptsTool?.description || '') || !/duplicate input slug/.test(addConceptsTool?.description || '')) {
    return 'add_concepts description missing row isolation guidance';
  }
  if (!/concepts\[n\]/.test(addConceptsTool?.description || '') || !/repair fields/.test(addConceptsTool?.description || '')) {
    return 'add_concepts description missing row label guidance';
  }
  if (!/Invalid-only batches return no row-level write metadata, no `findings` and no `coverage`/.test(addConceptsTool?.description || '')) {
    return 'add_concepts description missing invalid-only no-write metadata guidance';
  }
  if (addConceptsTool.outputSchema?.type !== 'object') {
    return 'add_concepts outputSchema root drift';
  }
  if (!sameArray(addConceptsTool.outputSchema?.required, ['concepts'])) {
    return 'add_concepts outputSchema required drift';
  }
  if (addConceptsTool.outputSchema?.additionalProperties !== false) {
    return 'add_concepts outputSchema root openness drift';
  }
  const addConceptRowsSchema = outputPropertyAt(addConceptsTool, ['properties', 'concepts']);
  if (
    addConceptRowsSchema?.type !== 'array' ||
    addConceptRowsSchema.items?.type !== 'object' ||
    !sameArray(addConceptRowsSchema.items?.required, ['slug', 'ok'])
  ) {
    return 'add_concepts outputSchema rows drift';
  }
  if (addConceptRowsSchema.items?.additionalProperties !== false) {
    return 'add_concepts outputSchema row openness drift';
  }
  if (addConceptRowsSchema.items?.properties?.slug?.type !== 'string') {
    return 'add_concepts outputSchema row slug drift';
  }
  if (addConceptRowsSchema.items?.properties?.ok?.type !== 'boolean') {
    return 'add_concepts outputSchema row ok drift';
  }
  if (addConceptRowsSchema.items?.properties?.changed?.type !== 'boolean') {
    return 'add_concepts outputSchema row changed drift';
  }
  if (mtimeSchemaFailure(addConceptRowsSchema.items?.properties?.mtime)) {
    return 'add_concepts outputSchema row mtime drift';
  }
  if (addConceptRowsSchema.items?.properties?.warnings?.type !== 'array' || addConceptRowsSchema.items?.properties?.warnings?.items?.type !== 'string') {
    return 'add_concepts outputSchema row warnings drift';
  }
  if (addConceptRowsSchema.items?.properties?.error?.type !== 'string') {
    return 'add_concepts outputSchema row error drift';
  }
  for (const propertyName of ['errorCode', 'valueName', 'suggestion', 'rowName', 'receivedField', 'conflictSubject', 'conflictSlug', 'firstSeenAt']) {
    if (addConceptRowsSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `add_concepts outputSchema row ${propertyName} drift`;
    }
  }
  if (addConceptRowsSchema.items?.properties?.receivedValue?.type !== 'string') {
    return 'add_concepts outputSchema row receivedValue drift';
  }
  if (addConceptRowsSchema.items?.properties?.unknownFields?.type !== 'array') {
    return 'add_concepts outputSchema row unknownFields drift';
  }
  const addConceptsUnknownFieldsFailure = unknownFieldsItemSchemaFailure(
    addConceptRowsSchema.items?.properties?.unknownFields,
    'add_concepts',
  );
  if (addConceptsUnknownFieldsFailure) return addConceptsUnknownFieldsFailure;
  for (const propertyName of ['allowedValues', 'allowedFields', 'receivedFields', 'recoveryTools', 'avoidTools']) {
    if (stringArraySchemaFailure(addConceptRowsSchema.items?.properties?.[propertyName])) {
      return `add_concepts outputSchema row ${propertyName} drift`;
    }
  }
  if (outputPropertyAt(addConceptsTool, ['properties', 'coverage'])?.type !== 'string') {
    return 'add_concepts outputSchema coverage drift';
  }

  const addRelationsTool = tools.find((candidate) => candidate?.name === 'add_relations');
  const addRelationInputType = propertyAt(addRelationsTool, ['properties', 'relations', 'items', 'properties', 'type']);
  if (!sameArray(addRelationInputType?.enum, WRITE_RELATION_TYPE_VALUES)) {
    return 'add_relations inputSchema type enum drift';
  }
  if (!/unknown field/.test(addRelationsTool?.description || '') || !/unknown type/.test(addRelationsTool?.description || '')) {
    return 'add_relations description missing row isolation guidance';
  }
  if (!/relations\[n\]/.test(addRelationsTool?.description || '') || !/repair fields/.test(addRelationsTool?.description || '')) {
    return 'add_relations description missing row label guidance';
  }
  if (!/closest-value hint/.test(addRelationsTool?.description || '')) {
    return 'add_relations description missing closest-value type guidance';
  }
  if (!/Invalid-only batches return no row-level `changed` \/ `alreadyExists` write metadata and no top-level `findings`/.test(addRelationsTool?.description || '')) {
    return 'add_relations description missing invalid-only no-write metadata guidance';
  }
  if (addRelationsTool.outputSchema?.type !== 'object') {
    return 'add_relations outputSchema root drift';
  }
  if (!sameArray(addRelationsTool.outputSchema?.required, ['relations'])) {
    return 'add_relations outputSchema required drift';
  }
  if (addRelationsTool.outputSchema?.additionalProperties !== false) {
    return 'add_relations outputSchema root openness drift';
  }
  const addRelationRowsSchema = outputPropertyAt(addRelationsTool, ['properties', 'relations']);
  if (
    addRelationRowsSchema?.type !== 'array' ||
    addRelationRowsSchema.items?.type !== 'object' ||
    !sameArray(addRelationRowsSchema.items?.required, ['ok', 'from', 'to', 'type'])
  ) {
    return 'add_relations outputSchema rows drift';
  }
  if (addRelationRowsSchema.items?.additionalProperties !== false) {
    return 'add_relations outputSchema row openness drift';
  }
  for (const propertyName of ['from', 'to', 'type']) {
    if (addRelationRowsSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `add_relations outputSchema row ${propertyName} drift`;
    }
  }
  if (addRelationRowsSchema.items?.properties?.ok?.type !== 'boolean') {
    return 'add_relations outputSchema row ok drift';
  }
  if (addRelationRowsSchema.items?.properties?.alreadyExists?.type !== 'boolean') {
    return 'add_relations outputSchema row alreadyExists drift';
  }
  if (addRelationRowsSchema.items?.properties?.changed?.type !== 'boolean') {
    return 'add_relations outputSchema row changed drift';
  }
  if (addRelationRowsSchema.items?.properties?.error?.type !== 'string') {
    return 'add_relations outputSchema row error drift';
  }
  for (const propertyName of ['errorCode', 'valueName', 'suggestion', 'rowName', 'receivedField', 'missingSubject', 'missingSlug', 'createTool']) {
    if (addRelationRowsSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `add_relations outputSchema row ${propertyName} drift`;
    }
  }
  if (addRelationRowsSchema.items?.properties?.receivedValue?.type !== 'string') {
    return 'add_relations outputSchema row receivedValue drift';
  }
  if (addRelationRowsSchema.items?.properties?.unknownFields?.type !== 'array') {
    return 'add_relations outputSchema row unknownFields drift';
  }
  const addRelationsUnknownFieldsFailure = unknownFieldsItemSchemaFailure(
    addRelationRowsSchema.items?.properties?.unknownFields,
    'add_relations',
  );
  if (addRelationsUnknownFieldsFailure) return addRelationsUnknownFieldsFailure;
  for (const propertyName of ['allowedValues', 'allowedFields', 'receivedFields', 'similarSlugs', 'recoveryTools']) {
    if (stringArraySchemaFailure(addRelationRowsSchema.items?.properties?.[propertyName])) {
      return `add_relations outputSchema row ${propertyName} drift`;
    }
  }

  const patchConceptTool = tools.find((candidate) => candidate?.name === 'patch_concept');
  if (!patchConceptTool) return 'tools/list response missing patch_concept tool';
  if (patchConceptTool.outputSchema?.type !== 'object') {
    return 'patch_concept outputSchema root drift';
  }
  if (!sameArray(patchConceptTool.outputSchema?.required, ['ok', 'slug', 'changed', 'mtime'])) {
    return 'patch_concept outputSchema required drift';
  }
  if (patchConceptTool.outputSchema?.additionalProperties !== false) {
    return 'patch_concept outputSchema root openness drift';
  }
  if (outputPropertyAt(patchConceptTool, ['properties', 'slug'])?.type !== 'string') {
    return 'patch_concept outputSchema slug drift';
  }
  if (mtimeSchemaFailure(outputPropertyAt(patchConceptTool, ['properties', 'mtime']))) {
    return 'patch_concept outputSchema mtime drift';
  }
  for (const propertyName of ['ok', 'changed']) {
    if (outputPropertyAt(patchConceptTool, ['properties', propertyName])?.type !== 'boolean') {
      return `patch_concept outputSchema ${propertyName} drift`;
    }
  }
  return null;
}
