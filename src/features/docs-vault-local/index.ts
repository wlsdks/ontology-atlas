export { LocalVaultProvider, useLocalVault } from './model/LocalVaultProvider';
export { VaultConflictError } from './model/use-local-vault';
export {
  buildAgentSetupCliCommandTemplate,
  buildCodexMcpAddCommandTemplate,
  buildCodexConfigTomlTemplate,
  buildMcpConfigJson,
} from './lib/ontology-starter';
export { LocalVaultPicker } from './ui/LocalVaultPicker';
export {
  ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT,
  ONTOLOGY_STARTER_JSON_GATE_COMMAND,
  OntologyStarterCta,
} from './ui/OntologyStarterCta';
