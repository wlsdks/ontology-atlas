import { authoringToolsSchemaFailure } from './authoring-tools.mjs';
import { compileToolSchemaFailure } from './compile-tool.mjs';
import { conceptReadToolsSchemaFailure } from './concept-read-tools.mjs';
import { conceptSearchToolsSchemaFailure } from './concept-search-tools.mjs';
import { inferImportsToolSchemaFailure } from './infer-imports-tool.mjs';
import {
  EXPECTED_DESTRUCTIVE_TOOLS,
  EXPECTED_IDEMPOTENT_TOOLS,
  EXPECTED_READ_TOOLS,
  expectedToolTitle,
} from './inventory.mjs';
import { lifecycleToolsSchemaFailure } from './lifecycle-tools.mjs';
import { finalizeProjectMeaningSchemaFailure } from './project-source-tools.mjs';
import { repoStructureToolSchemaFailure } from './repo-structure-tool.mjs';
import { vaultQueryToolsSchemaFailure } from './vault-query-tools.mjs';
import { writeGuardsSchemaFailure } from './write-guards.mjs';

export const TOOLS_LIST_SCHEMA_CONTRACT_SUMMARY = 'strict arguments + annotations + graph-query enums + graph kind enums/descriptions + write relation enums + health tuning + post-write maintenance schema';

function inputArrayMaxItemsFailure(tools) {
  for (const tool of tools) {
    const stack = [{ schema: tool?.inputSchema, path: `${tool?.name || '(unknown)'}.inputSchema` }];
    while (stack.length > 0) {
      const { schema, path } = stack.pop();
      if (!schema || typeof schema !== 'object') continue;
      if (schema.type === 'array' && schema.maxItems === undefined) {
        return `${path} array maxItems drift`;
      }
      for (const [key, value] of Object.entries(schema.properties || {})) {
        stack.push({ schema: value, path: `${path}.properties.${key}` });
      }
      if (schema.items) {
        stack.push({ schema: schema.items, path: `${path}.items` });
      }
      for (const key of ['oneOf', 'anyOf', 'allOf']) {
        if (!Array.isArray(schema[key])) continue;
        schema[key].forEach((value, index) => {
          stack.push({ schema: value, path: `${path}.${key}.${index}` });
        });
      }
    }
  }
  return null;
}

function topLevelInputCombinatorFailure(tools) {
  for (const tool of tools) {
    for (const combinator of ['oneOf', 'anyOf', 'allOf']) {
      if (tool?.inputSchema?.[combinator] !== undefined) {
        return `${tool?.name || '(unknown)'}.inputSchema top-level ${combinator} is not cross-client compatible`;
      }
    }
  }
  return null;
}

// Every nested tools/list object must say whether unknown keys are accepted: a bare
// `{type:'object'}` could be a dynamic map or a contract that lost its fields.
// Dynamic maps are named here; everything else is closed or a typed map.
const TOOLS_LIST_OPEN_OBJECT_PATHS = new Set([
  'get_concept.outputSchema.properties.frontmatter',
  'get_concepts.outputSchema.properties.concepts.items.properties.frontmatter',
  'get_concepts.outputSchema.properties.concepts.items.properties.growthHint.properties.exampleCall.properties.args',
  'find_evidence.outputSchema.properties.growthHint.properties.exampleCall.properties.args',
  'find_path.outputSchema.properties.growthHint.properties.exampleCall.properties.args',
  'query_concepts.outputSchema.properties.growthHint.properties.exampleCall.properties.args',
  'query_ontology.outputSchema.properties.compiledSummary',
  'query_ontology.outputSchema',
  'infer_imports.outputSchema.properties.nextReview.properties.nextCalls.items.properties.arguments',
  'disconnect_project_source.outputSchema.properties.nextCall.properties.arguments',
  'connect_project_source.outputSchema.properties.nextCall.properties.arguments',
  'connect_project_source.outputSchema.properties.remedy.properties.undo.properties.tool.properties.arguments',
  'disconnect_project_source.outputSchema.properties.remedy.properties.undo.properties.tool.properties.arguments',
  'connect_project_source.outputSchema.properties.remedy.properties.tool.anyOf.0.properties.arguments',
  'disconnect_project_source.outputSchema.properties.remedy.properties.tool.anyOf.0.properties.arguments',
  'patch_concept.inputSchema.properties.frontmatter',
  'merge_concepts.outputSchema.properties.capturedFrom.properties.frontmatter',
  'delete_concept.outputSchema.properties.captured.properties.frontmatter',
]);
const TOOLS_LIST_TYPED_OBJECT_PATHS = new Set([
  'connect_project_source.outputSchema.properties.binding',
  'connect_project_source.outputSchema.properties.previewReceipt',
  'connect_project_source.outputSchema.properties.projectSource',
  'connect_project_source.outputSchema.properties.remedy',
  'connect_project_source.outputSchema.properties.nextCall',
  'disconnect_project_source.outputSchema.properties.projectSource',
  'disconnect_project_source.outputSchema.properties.remedy',
  'disconnect_project_source.outputSchema.properties.nextCall',
  'replace_relation.outputSchema.properties.oldRelation',
  'replace_relation.outputSchema.properties.newRelation',
  'infer_imports.outputSchema.properties.reconciliation.properties.inBoth.items',
  'infer_imports.outputSchema.properties.reconciliation.properties.inCodeMissingFromVault.items',
  'infer_imports.outputSchema.properties.reconciliation.properties.inCodeMissingEndpointAbsent.items',
  'infer_imports.outputSchema.properties.reconciliation.properties.inVaultNotInCode.items',
  'index_project.outputSchema.properties.imports.properties.thresholdApplied',
  'index_project.outputSchema.properties.imports.properties.reconciliationSummary',
]);

function nestedObjectSchemaFailure(tools) {
  if (!Array.isArray(tools)) return 'tools/list response missing tools array';
  const stack = [];
  for (const tool of tools) {
    stack.push({ schema: tool?.inputSchema, path: `${tool?.name || '(unknown)'}.inputSchema` });
    stack.push({ schema: tool?.outputSchema, path: `${tool?.name || '(unknown)'}.outputSchema` });
  }
  while (stack.length > 0) {
    const { schema, path } = stack.pop();
    if (!schema || typeof schema !== 'object') continue;
    if (schema.type === 'object') {
      const openPath = TOOLS_LIST_OPEN_OBJECT_PATHS.has(path);
      const typedPath = TOOLS_LIST_TYPED_OBJECT_PATHS.has(path);
      if (typedPath && schema.additionalProperties === undefined) {
        return `${path} nested object missing additionalProperties contract`;
      }
      if (schema.additionalProperties === true && !openPath) {
        return `${path} nested object is open outside the explicit allowlist`;
      }
    }
    for (const [key, value] of Object.entries(schema.properties || {})) {
      stack.push({ schema: value, path: `${path}.properties.${key}` });
    }
    if (schema.items) stack.push({ schema: schema.items, path: `${path}.items` });
    for (const key of ['oneOf', 'anyOf', 'allOf']) {
      for (const [index, value] of (schema[key] || []).entries()) {
        stack.push({ schema: value, path: `${path}.${key}.${index}` });
      }
    }
  }
  return null;
}

export function toolsListSchemaFailure(tools) {
  if (!Array.isArray(tools)) return 'tools/list response missing tools array';
  const schemaDriftTool = tools.find((tool) => tool?.inputSchema?.additionalProperties !== false);
  if (schemaDriftTool) {
    return `tools/list schema missing additionalProperties:false: ${schemaDriftTool.name || '(unknown)'}`;
  }
  const arrayMaxItemsFailure = inputArrayMaxItemsFailure(tools);
  if (arrayMaxItemsFailure) return arrayMaxItemsFailure;
  const inputCombinatorFailure = topLevelInputCombinatorFailure(tools);
  if (inputCombinatorFailure) return inputCombinatorFailure;
  const titleDriftTool = tools.find((tool) => tool?.annotations?.title !== expectedToolTitle(tool?.name));
  if (titleDriftTool) {
    return `tools/list title annotation drift: ${titleDriftTool.name || '(unknown)'} (expected ${JSON.stringify(expectedToolTitle(titleDriftTool?.name))}, got ${JSON.stringify(titleDriftTool?.annotations?.title)})`;
  }
  const expectedReadTools = new Set(EXPECTED_READ_TOOLS);
  const annotationDriftTool = tools.find((tool) => tool?.annotations?.readOnlyHint !== expectedReadTools.has(tool?.name));
  if (annotationDriftTool) {
    return `tools/list readOnlyHint annotation drift: ${annotationDriftTool.name || '(unknown)'} (expected ${expectedReadTools.has(annotationDriftTool?.name)}, got ${JSON.stringify(annotationDriftTool?.annotations?.readOnlyHint)})`;
  }
  const openWorldDriftTool = tools.find((tool) => tool?.annotations?.openWorldHint !== false);
  if (openWorldDriftTool) {
    return `tools/list openWorldHint annotation drift: ${openWorldDriftTool.name || '(unknown)'} (expected false, got ${JSON.stringify(openWorldDriftTool?.annotations?.openWorldHint)})`;
  }
  const expectedDestructiveTools = new Set(EXPECTED_DESTRUCTIVE_TOOLS);
  const destructiveDriftTool = tools.find((tool) => tool?.annotations?.destructiveHint !== expectedDestructiveTools.has(tool?.name));
  if (destructiveDriftTool) {
    return `tools/list destructiveHint annotation drift: ${destructiveDriftTool.name || '(unknown)'} (expected ${expectedDestructiveTools.has(destructiveDriftTool?.name)}, got ${JSON.stringify(destructiveDriftTool?.annotations?.destructiveHint)})`;
  }
  const expectedIdempotentTools = new Set(EXPECTED_IDEMPOTENT_TOOLS);
  const idempotentDriftTool = tools.find((tool) => tool?.annotations?.idempotentHint !== expectedIdempotentTools.has(tool?.name));
  if (idempotentDriftTool) {
    return `tools/list idempotentHint annotation drift: ${idempotentDriftTool.name || '(unknown)'} (expected ${expectedIdempotentTools.has(idempotentDriftTool?.name)}, got ${JSON.stringify(idempotentDriftTool?.annotations?.idempotentHint)})`;
  }

  const finalizeProjectMeaningTool = tools.find((tool) => tool?.name === 'finalize_project_meaning');
  if (finalizeProjectMeaningTool) {
    const failure = finalizeProjectMeaningSchemaFailure(finalizeProjectMeaningTool);
    if (failure) return failure;
  }

  for (const toolFamilySchemaFailure of [
    conceptReadToolsSchemaFailure,
    conceptSearchToolsSchemaFailure,
    compileToolSchemaFailure,
    repoStructureToolSchemaFailure,
    inferImportsToolSchemaFailure,
    vaultQueryToolsSchemaFailure,
    authoringToolsSchemaFailure,
    lifecycleToolsSchemaFailure,
    writeGuardsSchemaFailure,
  ]) {
    const failure = toolFamilySchemaFailure(tools);
    if (failure) return failure;
  }

  const nestedObjectFailure = nestedObjectSchemaFailure(tools);
  if (nestedObjectFailure) return nestedObjectFailure;
  return null;
}
