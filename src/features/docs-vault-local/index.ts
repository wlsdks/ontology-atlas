export { LocalVaultProvider, useLocalVault } from './model/LocalVaultProvider';
export { VaultConflictError } from './model/use-local-vault';
export { shouldClearCreateIntent, shouldScaffoldAfterOpen } from './model/vault-create-flow';
export {
  useVaultCreateFlow,
  type VaultCreateFlowVault,
} from './model/use-vault-create-flow';
export {
  buildAgentSetupCheckCliCommandTemplate,
  buildAgentSetupCliCommandTemplate,
  buildCodexMcpAddCommandTemplate,
  buildCodexConfigTomlTemplate,
  buildMcpConfigJson,
} from './lib/ontology-starter';
export { LocalVaultPicker } from './ui/LocalVaultPicker';
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
