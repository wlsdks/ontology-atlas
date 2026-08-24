export { LocalVaultProvider, useLocalVault } from './model/LocalVaultProvider';
export { useAgentServer } from './model/use-agent-server';
export { VaultConflictError } from './model/use-local-vault';
export type {
  AgentActivityFocus,
  AgentActivityHeartbeat,
  AgentActivityState,
  AgentActivityStatus,
} from './model/agent-activity-status';
export { useVaultCreateFlow } from './model/use-vault-create-flow';
export { useJustStartVault } from './model/use-just-start-vault';
export {
  buildCodexMcpAddCommandTemplate,
  buildCodexConfigTomlTemplate,
  buildMcpConfigJson,
} from './lib/ontology-starter';
export { buildCursorMcpDeeplink } from './lib/mcp-deeplinks';
export { AgentClientButtons } from './ui/AgentClientButtons';
export {
  buildOntologyStarterAgentVerifyPrompt,
  buildOntologyStarterJsonGateCommand,
  ONTOLOGY_POST_CHANGE_SYNC_LINES,
  ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT,
  ONTOLOGY_STARTER_JSON_GATE_COMMAND,
  OntologyStarterCta,
} from './ui/OntologyStarterCta';
export {
  deriveBootstrapPlan,
  selectedElements,
  type BootstrapPlan,
} from './lib/bootstrap-candidates';
export {
  executeBootstrapPlan,
  type BootstrapVaultWriter,
  type ExecuteBootstrapResult,
} from './lib/execute-bootstrap-plan';
export { VaultOpenGuideSheet } from './ui/VaultOpenGuideSheet';
export type { AgentClientId } from './lib/agent-clients';
export { OpenVaultCta } from './ui/OpenVaultCta';
export { deniedFolderName } from './model/classify-vault-access-error';
