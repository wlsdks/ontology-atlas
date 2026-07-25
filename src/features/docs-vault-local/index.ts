export { LocalVaultProvider, useLocalVault } from './model/LocalVaultProvider';
export { VaultConflictError } from './model/use-local-vault';
export type {
  AgentActivityFocus,
  AgentActivityHeartbeat,
  AgentActivityState,
  AgentActivityStatus,
} from './model/agent-activity-status';
export { shouldClearCreateIntent, shouldScaffoldAfterOpen } from './model/vault-create-flow';
export {
  useVaultCreateFlow,
  type VaultCreateFlowVault,
} from './model/use-vault-create-flow';
export {
  useJustStartVault,
  type JustStartVaultVault,
} from './model/use-just-start-vault';
export {
  DEFAULT_VAULT_BASE_NAME,
  DEFAULT_VAULT_PARENT_LABEL,
  buildDefaultVaultDisplayPath,
  resolveUniqueVaultDirName,
} from './lib/default-vault-naming';
export {
  buildAgentSetupCheckCliCommandTemplate,
  buildAgentSetupCliCommandTemplate,
  buildCodexMcpAddCommandTemplate,
  buildCodexConfigTomlTemplate,
  buildMcpConfigJson,
} from './lib/ontology-starter';
export {
  MCP_SERVER_NAME,
  MCP_SERVER_PACKAGE,
  buildCursorMcpDeeplink,
  buildMcpDeeplinkConfig,
  buildVsCodeMcpDeeplink,
  utf8ToBase64,
  type McpStdioConfig,
} from './lib/mcp-deeplinks';
export {
  AgentClientButtons,
  type AgentClientButtonsProps,
} from './ui/AgentClientButtons';
export {
  buildOntologyStarterAgentVerifyPrompt,
  buildOntologyStarterCliVerifyCommands,
  buildOntologyStarterJsonGateCommand,
  ONTOLOGY_POST_CHANGE_SYNC_LINES,
  ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT,
  ONTOLOGY_STARTER_JSON_GATE_COMMAND,
  OntologyStarterCta,
} from './ui/OntologyStarterCta';
export {
  buildProjectMarkdown,
  deriveBootstrapPlan,
  selectedElements,
  buildDomainMarkdown,
  domainDocSlug,
  type BootstrapDocInput,
  type BootstrapDomainCandidate,
  type BootstrapElementCandidate,
  type BootstrapPlan,
} from './lib/bootstrap-candidates';
export {
  executeBootstrapPlan,
  type BootstrapVaultWriter,
  type ExecuteBootstrapResult,
} from './lib/execute-bootstrap-plan';
export {
  VaultOpenGuideSheet,
  type VaultOpenGuideSheetProps,
} from './ui/VaultOpenGuideSheet';
