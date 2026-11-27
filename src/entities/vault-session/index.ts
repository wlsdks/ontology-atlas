export { LocalVaultProvider, useLocalVault } from './model/vault-provider/LocalVaultProvider';
export { VaultConflictError } from './model/local-vault/vault-identity-guards';
export type { VaultOpenOptions, VaultOpenResult } from './model/local-vault/vault-starter';
export type { ReferrerRewriteReport } from './model/local-vault/referrer-rewrite';
export type {
  AgentActivityFocus,
  AgentActivityHeartbeat,
  AgentActivityState,
  AgentActivityStatus,
} from './model/agent-activity-status';
export { useAgentServer } from './model/use-agent-server';
export { useSummaryFreshness } from './model/use-summary-freshness';
export {
  deniedFolderName,
  isMissingFolderError,
} from './model/vault-opening/classify-vault-access-error';
export { useDataSourceMode } from './model/vault-source/use-data-source-mode';
export { useVaultLoadProgress } from './model/vault-opening/vault-load-progress';
export { useArrivingManifest } from './model/vault-opening/vault-arrival';
export { useGrantedVaultFiles, type GrantedVaultFiles } from './model/vault-provider/use-granted-vault-files';
export { useOpenFolderManifest } from './model/vault-provider/use-open-folder-manifest';
export {
  useArrivingVaultIdentityScope,
  useVaultIdentityScope,
  useVaultSessionIdentityScope,
} from './model/vault-source/use-vault-identity-scope';
export { AGENT_CLIENTS, filesForClient, type AgentClientId } from './lib/agent-clients';
export {
  buildCodexConfigTomlTemplate,
  buildCodexMcpAddCommandTemplate,
  buildMcpConfigJson,
} from './lib/agent-mcp-config';
