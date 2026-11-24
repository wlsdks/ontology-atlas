import {
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  WRITE_RELATION_TYPE_VALUES,
} from '../../../src/ontology-engine.mjs';

import { sameArray } from '../value-checks.mjs';
import { nonBlankStringSchemaFailure, outputPropertyAt, propertyAt } from './schema-primitives.mjs';

const LEAN_BUILD_WRITE_TOOLS = ['add_concepts', 'add_relations', 'patch_concept'];
const LEAN_WRITE_ABSENT_FIELDS = ['filePath', 'postWriteMaintenance', 'key'];
const BATCH_ROWS_PROPERTY = { add_concepts: 'concepts', add_relations: 'relations' };

function postWriteMaintenanceSchemaFailure(schema, toolName) {
  if (schema?.type !== 'object') {
    return `${toolName} outputSchema postWriteMaintenance drift`;
  }
  const compactActionRequired = ['id', 'phase', 'kind', 'severity', 'score', 'executable', 'reason'];
  const compactProposedActionTools = ['add_concepts', 'add_relations', 'patch_concept'];
  const proposedArgsSchemas = schema.properties?.actions?.items?.properties?.proposedAction?.properties?.args?.oneOf;
  const postWriteRequired = [
    'operation',
    'sideEffect',
    'graphHash',
    'summary',
    'filters',
    'cursor',
    'byPhase',
    'bySeverity',
    'byKind',
    'limited',
    'nextExecutableAction',
    'nextReviewAction',
    'actions',
  ];
  if (!sameArray(schema.required, postWriteRequired) || schema.additionalProperties !== false) {
    return `${toolName} outputSchema postWriteMaintenance required drift`;
  }
  const summarySchema = schema.properties?.summary;
  const summaryRequired = [
    'totalActions',
    'filteredActions',
    'remainingActions',
    'executableActions',
    'reviewActions',
    'compileIssues',
    'dependencyCycles',
    'canonicalizationActions',
    'danglingReferences',
    'relationRecommendations',
    'externalElementRefs',
    'externalElementRefsIgnored',
    'unassignedNodes',
    'emptyDomains',
    'capabilitiesWithoutEvidence',
  ];
  if (
    summarySchema?.type !== 'object' ||
    !sameArray(summarySchema.required, summaryRequired) ||
    summarySchema.additionalProperties !== false ||
    summaryRequired.some((key) => (
      summarySchema.properties?.[key]?.type !== 'integer' ||
      summarySchema.properties?.[key]?.minimum !== 0
    ))
  ) {
    return `${toolName} outputSchema postWriteMaintenance summary drift`;
  }
  const filtersSchema = schema.properties?.filters;
  if (
    filtersSchema?.type !== 'object' ||
    !sameArray(filtersSchema.required, ['executableOnly', 'phases', 'severities', 'kinds']) ||
    filtersSchema.additionalProperties !== false ||
    filtersSchema.properties?.executableOnly?.type !== 'boolean' ||
    !sameArray(filtersSchema.properties?.phases?.items?.enum, MAINTENANCE_PHASE_VALUES) ||
    !sameArray(filtersSchema.properties?.severities?.items?.enum, MAINTENANCE_SEVERITY_VALUES) ||
    !sameArray(filtersSchema.properties?.kinds?.items?.enum, MAINTENANCE_KIND_VALUES)
  ) {
    return `${toolName} outputSchema postWriteMaintenance filters drift`;
  }
  const cursorSchema = schema.properties?.cursor;
  if (
    cursorSchema?.type !== 'object' ||
    !sameArray(cursorSchema.required, ['afterActionId', 'found', 'reason', 'startIndex', 'nextAfterActionId', 'hasMore']) ||
    cursorSchema.additionalProperties !== false ||
    cursorSchema.properties?.found?.type !== 'boolean' ||
    cursorSchema.properties?.hasMore?.type !== 'boolean'
  ) {
    return `${toolName} outputSchema postWriteMaintenance cursor drift`;
  }
  for (const key of ['byPhase', 'bySeverity', 'byKind']) {
    const bucketSchema = schema.properties?.[key];
    if (
      bucketSchema?.type !== 'object' ||
      bucketSchema.additionalProperties?.type !== 'integer' ||
      bucketSchema.additionalProperties?.minimum !== 0
    ) {
      return `${toolName} outputSchema postWriteMaintenance ${key} bucket drift`;
    }
  }
  if (
    schema.properties?.actions?.type !== 'array' ||
    schema.properties.actions.items?.type !== 'object' ||
    !sameArray(schema.properties.actions.items?.required, compactActionRequired) ||
    schema.properties.actions.items?.properties?.score?.minimum !== 0 ||
    schema.properties.actions.items?.properties?.executable?.type !== 'boolean' ||
    !sameArray(schema.properties.actions.items?.properties?.proposedAction?.type, ['object', 'null']) ||
    !sameArray(schema.properties.actions.items?.properties?.proposedAction?.required, ['tool', 'args']) ||
    schema.properties.actions.items?.properties?.proposedAction?.additionalProperties !== false ||
    schema.properties.actions.items?.properties?.proposedAction?.properties?.tool?.type !== 'string' ||
    !sameArray(schema.properties.actions.items?.properties?.proposedAction?.properties?.tool?.enum, compactProposedActionTools) ||
    !Array.isArray(proposedArgsSchemas) ||
    proposedArgsSchemas.length !== 3 ||
    !sameArray(proposedArgsSchemas[0]?.required, ['concepts']) ||
    !sameArray(proposedArgsSchemas[0]?.properties?.concepts?.items?.required, ['slug', 'kind', 'title']) ||
    !sameArray(proposedArgsSchemas[1]?.required, ['relations']) ||
    !sameArray(proposedArgsSchemas[1]?.properties?.relations?.items?.required, ['from', 'to', 'type']) ||
    !sameArray(proposedArgsSchemas[1]?.properties?.relations?.items?.properties?.type?.enum, WRITE_RELATION_TYPE_VALUES) ||
    !sameArray(proposedArgsSchemas[2]?.required, ['slug', 'frontmatter', 'expected_mtime']) ||
    proposedArgsSchemas[2]?.properties?.frontmatter?.additionalProperties !== false ||
    schema.properties.actions.items?.additionalProperties !== false ||
    schema.properties.actions.items?.properties?.node?.additionalProperties !== false ||
    schema.properties.actions.items?.properties?.node?.properties?.slug?.type !== 'string' ||
    !sameArray(schema.properties.actions.items?.properties?.nodes?.type, ['array', 'object']) ||
    schema.properties.actions.items?.properties?.nodes?.items?.additionalProperties !== false ||
    schema.properties.actions.items?.properties?.nodes?.items?.properties?.slug?.type !== 'string' ||
    schema.properties.actions.items?.properties?.nodes?.additionalProperties?.additionalProperties !== false ||
    schema.properties.actions.items?.properties?.nodes?.additionalProperties?.properties?.slug?.type !== 'string' ||
    schema.properties.actions.items?.allOf?.[0]?.if?.properties?.executable?.const !== true ||
    !sameArray(schema.properties.actions.items?.allOf?.[0]?.then?.required, ['proposedAction']) ||
    schema.properties.actions.items?.allOf?.[0]?.then?.properties?.proposedAction?.type !== 'object'
  ) {
    return `${toolName} outputSchema postWriteMaintenance actions drift`;
  }
  for (const key of ['nextExecutableAction', 'nextReviewAction']) {
    const actionSchema = schema.properties?.[key];
    if (
      !sameArray(actionSchema?.type, ['object', 'null']) ||
      !sameArray(actionSchema?.required, compactActionRequired) ||
      actionSchema.properties?.score?.minimum !== 0 ||
      actionSchema.properties?.executable?.type !== 'boolean' ||
      !sameArray(actionSchema.properties?.proposedAction?.type, ['object', 'null']) ||
      !sameArray(actionSchema.properties?.proposedAction?.required, ['tool', 'args']) ||
      actionSchema.additionalProperties !== false ||
      actionSchema.properties?.proposedAction?.additionalProperties !== false ||
      !sameArray(actionSchema.properties?.proposedAction?.properties?.tool?.enum, compactProposedActionTools) ||
      actionSchema.properties?.proposedAction?.properties?.args?.oneOf?.length !== 3
      || actionSchema.allOf?.[0]?.if?.properties?.executable?.const !== true
      || !sameArray(actionSchema.allOf?.[0]?.then?.required, ['proposedAction'])
      || actionSchema.allOf?.[0]?.then?.properties?.proposedAction?.type !== 'object'
    ) {
      return `${toolName} outputSchema postWriteMaintenance ${key} drift`;
    }
  }
  return null;
}

export function writeGuardsSchemaFailure(tools) {
  for (const toolName of [
    'remove_relation',
    'replace_relation',
    'rename_concept',
    'reclassify_concept',
    'merge_concepts',
    'delete_concept',
    'absorb_document',
    'git_snapshot',
  ]) {
    const tool = tools.find((candidate) => candidate?.name === toolName);
    // Focused unit fixtures may omit tools outside their contract slice.
    // The live first-contact inventory gate independently requires all tools.
    if (!tool) continue;
    for (const requiredField of ['previewReady', 'canConfirm', 'wouldChange', 'blockedReasons']) {
      if (!tool.outputSchema?.required?.includes(requiredField)) {
        return `${toolName} outputSchema must require ${requiredField}`;
      }
    }
    for (const propertyName of ['previewReady', 'canConfirm', 'wouldChange']) {
      if (outputPropertyAt(tool, ['properties', propertyName])?.type !== 'boolean') {
        return `${toolName} outputSchema ${propertyName} destructive preview contract drift`;
      }
    }
    const blockedReasons = outputPropertyAt(tool, ['properties', 'blockedReasons']);
    if (
      blockedReasons?.type !== 'array' ||
      nonBlankStringSchemaFailure(blockedReasons?.items)
    ) {
      return `${toolName} outputSchema blockedReasons destructive preview contract drift`;
    }
  }

  for (const toolName of [
    'patch_concept',
    'rename_concept',
    'merge_concepts',
    'delete_concept',
  ]) {
    const tool = tools.find((candidate) => candidate?.name === toolName);
    if (!tool) return `tools/list response missing ${toolName} tool`;
    const expectedMtime = propertyAt(tool, ['properties', 'expected_mtime']);
    if (expectedMtime?.type !== 'number' || expectedMtime?.minimum !== 0) {
      return `${toolName}.expected_mtime conflict guard schema drift`;
    }
  }

  const mergeTargetMtime = propertyAt(
    tools.find((candidate) => candidate?.name === 'merge_concepts'),
    ['properties', 'expected_into_mtime'],
  );
  if (mergeTargetMtime?.type !== 'number' || mergeTargetMtime?.minimum !== 0) {
    return 'merge_concepts.expected_into_mtime conflict guard schema drift';
  }

  const addRelations = tools.find((candidate) => candidate?.name === 'add_relations');
  const rowExpectedMtime = propertyAt(addRelations, [
    'properties',
    'relations',
    'items',
    'properties',
    'expected_mtime',
  ]);
  if (rowExpectedMtime?.type !== 'number' || rowExpectedMtime?.minimum !== 0) {
    return 'add_relations row expected_mtime conflict guard schema drift';
  }

  for (const toolName of ['rename_concept', 'merge_concepts', 'delete_concept']) {
    const tool = tools.find((candidate) => candidate?.name === toolName);
    const confirm = propertyAt(tool, ['properties', 'confirm']);
    if (confirm?.type !== 'boolean') {
      return `${toolName}.confirm dry-run safety schema drift`;
    }
  }

  const deleteTool = tools.find((candidate) => candidate?.name === 'delete_concept');
  const force = propertyAt(deleteTool, ['properties', 'force']);
  if (force?.type !== 'boolean') {
    return 'delete_concept.force destructive safety schema drift';
  }

  const renameTool = tools.find((candidate) => candidate?.name === 'rename_concept');
  const overwrite = propertyAt(renameTool, ['properties', 'overwrite']);
  if (overwrite?.type !== 'boolean') {
    return 'rename_concept.overwrite destructive safety schema drift';
  }
  const absorbDocumentTool = tools.find((candidate) => candidate?.name === 'absorb_document');
  const allowOutsideRepo = absorbDocumentTool
    ? propertyAt(absorbDocumentTool, ['properties', 'allowOutsideRepo'])
    : null;
  if (absorbDocumentTool && allowOutsideRepo?.type !== 'boolean') {
    return 'absorb_document.allowOutsideRepo destructive boundary schema drift';
  }

  // Build writes answer with their rows and the findings on the nodes they wrote;
  // the vault-wide queue, absolute paths and storage keys stay out of their results.
  for (const toolName of LEAN_BUILD_WRITE_TOOLS) {
    const tool = tools.find((candidate) => candidate?.name === toolName);
    if (!tool) return `tools/list response missing ${toolName} tool`;
    if (!/`findings`/.test(tool.description || '')) {
      return `${toolName} description missing findings guidance`;
    }
    const findings = outputPropertyAt(tool, ['properties', 'findings']);
    if (findings?.type !== 'array' || findings.items?.type !== 'string') {
      return `${toolName} outputSchema findings drift`;
    }
    const rows = BATCH_ROWS_PROPERTY[toolName]
      ? outputPropertyAt(tool, ['properties', BATCH_ROWS_PROPERTY[toolName], 'items'])
      : null;
    for (const [where, properties] of [['', tool.outputSchema?.properties], [' row', rows?.properties]]) {
      const leaked = LEAN_WRITE_ABSENT_FIELDS.find((field) => properties?.[field] !== undefined);
      if (leaked) return `${toolName} outputSchema${where} still carries ${leaked}`;
    }
  }

  for (const toolName of [
    'rename_concept',
    'merge_concepts',
    'delete_concept',
  ]) {
    const tool = tools.find((candidate) => candidate?.name === toolName);
    if (!tool) return `tools/list response missing ${toolName} tool`;
    const description = tool.description || '';
    if (!/postWriteMaintenance/.test(description)) {
      return `${toolName} description missing postWriteMaintenance guidance`;
    }
    if (!/score/.test(description)) {
      return `${toolName} description missing maintenance action score guidance`;
    }
    if (!/proposedAction/.test(description)) {
      return `${toolName} description missing executable maintenance proposedAction guidance`;
    }
    if (!/nextExecutableAction/.test(description) || !/nextReviewAction/.test(description)) {
      return `${toolName} description missing maintenance next action pointer guidance`;
    }
    if (!/byPhase/.test(description) || !/bySeverity/.test(description) || !/byKind/.test(description)) {
      return `${toolName} description missing maintenance bucket guidance`;
    }
    const schemaFailure = postWriteMaintenanceSchemaFailure(
      outputPropertyAt(tool, ['properties', 'postWriteMaintenance']),
      toolName,
    );
    if (schemaFailure) return schemaFailure;
  }
  return null;
}
