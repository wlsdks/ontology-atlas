import { callMcpTool } from './mcp-call.mjs';
import {
  assertConceptBatchResult,
  assertRelationBatchResult,
} from './batch-results.mjs';

export const MCP_BATCH_LIMIT = 50;

export async function callConceptBatches(
  vaultRoot,
  concepts,
  { context = 'add_concepts' } = {},
) {
  return callBatches({
    vaultRoot,
    rows: concepts,
    toolName: 'add_concepts',
    resultKey: 'concepts',
    context,
    assertResult: assertConceptBatchResult,
  });
}

export async function callRelationBatches(
  vaultRoot,
  relations,
  { context = 'add_relations' } = {},
) {
  return callBatches({
    vaultRoot,
    rows: relations,
    toolName: 'add_relations',
    resultKey: 'relations',
    context,
    assertResult: assertRelationBatchResult,
  });
}

async function callBatches({
  vaultRoot,
  rows,
  toolName,
  resultKey,
  context,
  assertResult,
}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const allRows = [];
  for (let offset = 0; offset < rows.length; offset += MCP_BATCH_LIMIT) {
    const chunk = rows.slice(offset, offset + MCP_BATCH_LIMIT);
    const result = await callMcpTool(vaultRoot, toolName, {
      [resultKey]: chunk,
    });
    const chunkContext = offset === 0 ? context : `${context} chunk @${offset}`;
    assertResult(result, chunkContext, {
      expectedCount: chunk.length,
    });
    allRows.push(...result[resultKey]);
  }
  return allRows;
}
