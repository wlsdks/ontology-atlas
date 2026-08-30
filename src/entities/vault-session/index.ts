export { LocalVaultProvider, useLocalVault } from './model/LocalVaultProvider';
export { VaultConflictError } from './model/use-local-vault';
export type {
  AgentActivityFocus,
  AgentActivityHeartbeat,
  AgentActivityState,
  AgentActivityStatus,
} from './model/agent-activity-status';
export { useAgentServer } from './model/use-agent-server';
export { useSummaryFreshness } from './model/use-summary-freshness';
export { deniedFolderName } from './model/classify-vault-access-error';
export { useDataSourceMode } from './model/use-data-source-mode';
export { useSampleSource } from './model/use-sample-source';
export { useStaticVaultSource } from './model/use-static-vault-source';
export {
  useVaultIdentityScope,
  useVaultSessionIdentityScope,
} from './model/use-vault-identity-scope';
export { VaultSourceHydrationBoundary } from './ui/VaultSourceHydrationBoundary';
export { AGENT_CLIENTS, filesForClient, type AgentClientId } from './lib/agent-clients';
export {
  ONTOLOGY_STARTER_FILES,
  buildCodexConfigToml,
  buildCodexConfigTomlTemplate,
  buildCodexMcpAddCommandTemplate,
  buildMcpConfigJson,
} from './lib/ontology-starter';
