import {
  AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
  countAgentGraphDbCliPackCommands,
  formatAgentPostChangeSyncPacket,
  formatAgentGraphDbCliPack,
  formatAgentGraphDbQueryPack,
  formatAgentQueryCallCliCommand,
  type AgentGraphDbQueryPackItem,
} from "@/shared/lib/ontology-tree";

export interface GraphProofRailModel {
  intentCount: number;
  mcpCallCount: number;
  cliFallbackCount: number;
  runtimeCheckCount: number;
  previewIntents: string[];
  operations: string[];
  queryPackText: string;
  cliPackText: string;
  syncGateText: string;
}

export function buildGraphProofRailModel(
  pack: readonly AgentGraphDbQueryPackItem[],
  previewLimit = 3,
): GraphProofRailModel {
  const operations = new Set<string>();
  let mcpCallCount = 0;

  for (const item of pack) {
    for (const payload of item.payloads) {
      mcpCallCount += 1;
      const operation = payload.operation.replace(/^query_ontology\./, "");
      operations.add(operation);
    }
  }

  return {
    intentCount: pack.length,
    mcpCallCount,
    cliFallbackCount: countAgentGraphDbCliPackCommands(pack),
    runtimeCheckCount: AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
    previewIntents: pack
      .map((item) => item.intent)
      .filter((intent): intent is string => intent.length > 0)
      .slice(0, previewLimit),
    operations: Array.from(operations),
    queryPackText: formatAgentGraphDbQueryPack(pack),
    cliPackText: formatAgentGraphDbCliPack(pack),
    syncGateText: formatAgentPostChangeSyncPacket(),
  };
}

export function countExecutableCliFallbacks(
  pack: readonly AgentGraphDbQueryPackItem[],
): number {
  const commands = new Set<string>();

  for (const item of pack) {
    for (const payload of item.payloads) {
      const command = formatAgentQueryCallCliCommand(payload);
      if (command) {
        commands.add(command);
      }
    }
  }

  return commands.size;
}
