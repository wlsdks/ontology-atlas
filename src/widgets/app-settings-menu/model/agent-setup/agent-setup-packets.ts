import {
  buildCodexConfigTomlTemplate,
  buildCodexMcpAddCommandTemplate,
  buildMcpConfigJson,
} from '@/entities/vault-session';
import {
  buildOntologyStarterAgentVerifyPrompt,
  ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT,
  ONTOLOGY_POST_CHANGE_SYNC_LINES,
} from '@/features/docs-vault-local';
import { formatAgentPostChangeSyncPacket } from '@/entities/knowledge-graph';
import { vaultPathForPacket } from '@/shared/config/agent/vault-path-for-packet';

/**
 * The button the packets point a person to. Connecting is the app's work, so a packet names
 * the control that does it instead of a terminal command only a source checkout can run.
 */
const APP_CONNECT_STEP =
  'In the Ontology Atlas app, open Agents > MCP and press the connect button for your agent (for example "Connect to Claude Code").';

const AGENT_FIRST_CONTACT_PROOF_CONTRACT_LINES = [
  'First-contact proof contract:',
  '- Connection files: the Ontology Atlas app shows whether each tool has its connection file and creates the missing ones.',
  '- MCP tools: connection_info reports the current toolCount, and tools/list includes finalize_project_meaning and query_ontology.',
  '- Folder check: validate_vault reports errors and warnings before the agent edits.',
  '- Graph briefs: query_ontology workspace_brief and agent_brief describe the same local vault before writes.',
];

const AGENT_MCP_CONNECTED_PROOF_LINES = [
  'MCP-connected proof:',
  '1. query_ontology({"operation":"workspace_brief","limit":5})',
  '2. query_ontology({"operation":"agent_brief","limit":5})',
  '3. query_ontology({"operation":"health","limit":5})',
  '4. query_ontology({"operation":"query_plan","targetOperation":"match_nodes","kind":"capability","sort":"degree","limit":10})',
  '5. query_ontology({"operation":"match_nodes","kind":"capability","sort":"degree","limit":10})',
  'If these tools are missing, the agent is not connected yet: put the config in place, then restart the agent from the codebase root.',
];

export function buildAgentFirstContactProofPacket(
  vaultName: string,
  vaultPath?: string | null,
): string {
  return [
    'ontology-atlas first-contact agent proof',
    '',
    'Run these before Claude Code, Codex, or Cursor edits the codebase with this ontology.',
    `Ontology vault: ${vaultPathForPacket(vaultName, vaultPath)}`,
    '',
    'Setup:',
    `1. ${APP_CONNECT_STEP}`,
    '2. Restart Claude Code / Cursor / Codex from the codebase root.',
    '3. connection_info({}) -> read toolCount; tools/list must agree with it.',
    '4. validate_vault({}) -> no errors before the first edit.',
    '',
    'Read-first graph proof:',
    ...AGENT_MCP_CONNECTED_PROOF_LINES,
    '',
    ...AGENT_FIRST_CONTACT_PROOF_CONTRACT_LINES,
    '',
    ...ONTOLOGY_POST_CHANGE_SYNC_LINES,
  ].join('\n');
}

export function buildAgentSetupPacket(vaultName: string, vaultPath?: string | null): string {
  const vaultPathLabel = vaultPathForPacket(vaultName, vaultPath);
  const codebaseRootPlaceholder = '<absolute path to your codebase root>';

  return [
    'ontology-atlas agent setup packet',
    '',
    'Use this when Claude Code, Cursor, or Codex is opened at a separate codebase root.',
    vaultPath
      ? 'The ontology vault path below came from the installed desktop app; replace only the agent root placeholder before using the config.'
      : 'Replace every <absolute path...> placeholder before using the config.',
    '',
    'Root check:',
    `- Agent root: ${codebaseRootPlaceholder}`,
    `- Ontology vault: ${vaultPathLabel}`,
    '- Start the agent from the agent root; the config below names the ontology vault by its absolute path.',
    '',
    ...AGENT_FIRST_CONTACT_PROOF_CONTRACT_LINES,
    '',
    ...ONTOLOGY_POST_CHANGE_SYNC_LINES,
    '',
    ...AGENT_MCP_CONNECTED_PROOF_LINES,
    '',
    'Read-first run order from a codebase root:',
    `1. ${APP_CONNECT_STEP} Or save the config below in the agent root.`,
    '2. Restart Claude Code / Cursor / Codex from the agent root.',
    '3. Check the tools: connection_info({}) and validate_vault({})',
    '4. Read the graph: query_ontology({"operation":"workspace_brief"}) and query_ontology({"operation":"agent_brief"})',
    '',
    'Feature guide:',
    'docs/AGENT-GRAPH-WORKFLOW.md',
    '',
    'Claude Code / Cursor .mcp.json:',
    buildMcpConfigJson(vaultName, vaultPath),
    '',
    'Codex .codex/config.toml:',
    buildCodexConfigTomlTemplate(vaultName, vaultPath),
    '',
    'Codex one-line registration:',
    buildCodexMcpAddCommandTemplate(vaultName, vaultPath),
    '',
    'After registering, restart the agent and paste this verification prompt:',
    ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT,
  ].join('\n');
}

export type AgentSetupCopyKey =
  | 'verifyPrompt'
  | 'setupPacket'
  | 'postChangeSync'
  | 'firstContactProof'
  | 'configTemplate'
  | 'codexTemplate'
  | 'codexMcpAddCommand';

/**
 * The text each copy chip puts on the clipboard. The path-aware packets take the vault's
 * absolute path; the two config templates deliberately carry only the vault name.
 */
export function buildAgentSetupCopyText(
  key: AgentSetupCopyKey,
  vaultName: string,
  vaultRootPath: string | null | undefined,
): string {
  switch (key) {
    case 'verifyPrompt':
      return buildOntologyStarterAgentVerifyPrompt(vaultRootPath);
    case 'setupPacket':
      return buildAgentSetupPacket(vaultName, vaultRootPath);
    case 'postChangeSync':
      return formatAgentPostChangeSyncPacket();
    case 'firstContactProof':
      return buildAgentFirstContactProofPacket(vaultName, vaultRootPath);
    case 'configTemplate':
      return buildMcpConfigJson(vaultName);
    case 'codexTemplate':
      return buildCodexConfigTomlTemplate(vaultName);
    case 'codexMcpAddCommand':
      return buildCodexMcpAddCommandTemplate(vaultName);
  }
}
