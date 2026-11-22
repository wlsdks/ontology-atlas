import { advertisedOutputSchema } from '../../../src/server/advertised-output-schema.mjs';
import { TOOL_OUTPUT_CONTRACT_BY_NAME } from '../../../src/server/registry.mjs';

/**
 * tools/list advertises each output schema cut to its top level; the full
 * result contract stays in the tool definition. This names the first listed
 * tool whose advertised schema is not exactly the cut of its contract.
 */
export function advertisedOutputSchemaFailure(tools) {
  for (const tool of tools) {
    const contract = TOOL_OUTPUT_CONTRACT_BY_NAME.get(tool?.name);
    const expected = contract ? advertisedOutputSchema(contract) : undefined;
    if (JSON.stringify(tool?.outputSchema) !== JSON.stringify(expected)) {
      return `${tool?.name || '(unknown)'}.outputSchema is not the advertised form of its output contract`;
    }
  }
  return null;
}

/** The listed tools with each advertised output schema replaced by its full contract. */
export function withOutputContracts(tools) {
  return tools.map((tool) => (tool?.outputSchema ? { ...tool, outputSchema: TOOL_OUTPUT_CONTRACT_BY_NAME.get(tool.name) } : tool));
}
