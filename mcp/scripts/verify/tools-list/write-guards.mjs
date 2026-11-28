import {
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  WRITE_RELATION_TYPE_VALUES,
} from '../server-vocabularies.mjs';

import { sameArray } from '../value-checks.mjs';
import { nonBlankStringSchemaFailure, outputPropertyAt, propertyAt } from './schema-primitives.mjs';

const LEAN_BUILD_WRITE_TOOLS = ['add_concepts', 'add_relations', 'patch_concept'];
const LEAN_WRITE_ABSENT_FIELDS = ['filePath', 'postWriteMaintenance', 'key'];
const BATCH_ROWS_PROPERTY = { add_concepts: 'concepts', add_relations: 'relations' };

function postWriteMaintenanceSchemaFailure(schema, toolName) {
  if (schema?.type !== 'object') {
    return `${toolName} outputSchema postWriteMaintenance drift`;
  }
  if (!sameArray(schema.required, ['nextAction', 'stepsAboutTouched']) || schema.additionalProperties !== false) {
    return `${toolName} outputSchema postWriteMaintenance required drift`;
  }
  const steps = schema.properties?.stepsAboutTouched;
  if (steps?.type !== 'integer' || steps.minimum !== 0) {
    return `${toolName} outputSchema postWriteMaintenance stepsAboutTouched drift`;
  }
  const next = schema.properties?.nextAction;
  const proposedArgsSchemas = next?.properties?.proposedAction?.properties?.args?.oneOf;
  if (
    !sameArray(next?.type, ['object', 'null']) ||
    !sameArray(next?.required, ['id', 'phase', 'kind', 'severity', 'score', 'executable', 'reason']) ||
    next.additionalProperties !== false ||
    next.properties?.score?.minimum !== 0 ||
    next.properties?.executable?.type !== 'boolean' ||
    !sameArray(next.properties?.phase?.enum, MAINTENANCE_PHASE_VALUES) ||
    !sameArray(next.properties?.severity?.enum, MAINTENANCE_SEVERITY_VALUES) ||
    !sameArray(next.properties?.kind?.enum, MAINTENANCE_KIND_VALUES) ||
    !sameArray(next.properties?.proposedAction?.type, ['object', 'null']) ||
    !sameArray(next.properties?.proposedAction?.required, ['tool', 'args']) ||
    next.properties?.proposedAction?.additionalProperties !== false ||
    !sameArray(next.properties?.proposedAction?.properties?.tool?.enum, LEAN_BUILD_WRITE_TOOLS) ||
    !Array.isArray(proposedArgsSchemas) ||
    proposedArgsSchemas.length !== 3 ||
    !sameArray(proposedArgsSchemas[0]?.required, ['concepts']) ||
    !sameArray(proposedArgsSchemas[1]?.required, ['relations']) ||
    !sameArray(proposedArgsSchemas[1]?.properties?.relations?.items?.properties?.type?.enum, WRITE_RELATION_TYPE_VALUES) ||
    !sameArray(proposedArgsSchemas[2]?.required, ['slug', 'frontmatter', 'expected_mtime']) ||
    next.allOf?.[0]?.if?.properties?.executable?.const !== true ||
    !sameArray(next.allOf?.[0]?.then?.required, ['proposedAction'])
  ) {
    return `${toolName} outputSchema postWriteMaintenance nextAction drift`;
  }
  return null;
}

export function writeGuardsSchemaFailure(tools) {
  for (const toolName of [
    'remove_relation',
    'rename_concept',
    'merge_concepts',
    'delete_concept',
    'absorb_document',
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
    if (!/nextAction/.test(description) || !/stepsAboutTouched/.test(description)) {
      return `${toolName} description missing next action guidance`;
    }
    const schemaFailure = postWriteMaintenanceSchemaFailure(
      outputPropertyAt(tool, ['properties', 'postWriteMaintenance']),
      toolName,
    );
    if (schemaFailure) return schemaFailure;
  }
  return null;
}
