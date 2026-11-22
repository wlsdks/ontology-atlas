import {
  AGENT_CLIENTS,
  filesForClient,
  type AgentClientId,
} from '@/entities/vault-session';

/** What the vault folder reports about the two config files Atlas reads back. */
export interface AgentConfigStatus {
  mcpJson: boolean;
  codexConfig: boolean;
  mcpExample: boolean;
  mcpJsonValid?: boolean;
  codexConfigValid?: boolean;
  mcpExampleValid?: boolean;
}

export type ConfigFileState = 'missing' | 'invalid' | 'ready';

/** The two active files that count toward readiness; `.mcp.json.example` is only a template. */
export const AGENT_SETUP_FILES = [
  {
    key: 'mcpJson',
    validKey: 'mcpJsonValid',
    path: '.mcp.json',
  },
  {
    key: 'codexConfig',
    validKey: 'codexConfigValid',
    path: '.codex/config.toml',
  },
] as const;

/** One client's row in the connection table: which file it reads back and its localized copy. */
export interface AgentSetupConnection {
  key: 'claudeCursor' | 'codex';
  file: (typeof AGENT_SETUP_FILES)[number];
  label: string;
  check: string;
}

/** A file that is absent is missing; one that exists but did not parse is invalid. */
export function configFileState(
  present: boolean | undefined,
  valid: boolean | undefined,
): ConfigFileState {
  if (!present) return 'missing';
  return valid === false ? 'invalid' : 'ready';
}

export function isAgentSetupReady(
  serverLaunchable: boolean,
  status: AgentConfigStatus,
): boolean {
  return Boolean(
    serverLaunchable &&
      status.mcpJson &&
      status.codexConfig &&
      status.mcpJsonValid !== false &&
      status.codexConfigValid !== false,
  );
}

export function summarizeAgentSetupFiles(status: AgentConfigStatus): {
  readyCount: number;
  hasMissing: boolean;
  hasInvalid: boolean;
} {
  return {
    readyCount: AGENT_SETUP_FILES.filter(
      (file) => status[file.key] && status[file.validKey] !== false,
    ).length,
    hasMissing: AGENT_SETUP_FILES.some((file) => !status[file.key]),
    hasInvalid: AGENT_SETUP_FILES.some(
      (file) => status[file.key] && status[file.validKey] === false,
    ),
  };
}

export interface ValidationSummary {
  errorCount: number;
  warningCount: number;
}

export type ValidationState = 'error' | 'warning' | 'clean' | 'unknown';
export type ValidationTone = 'ready' | 'blocked' | 'warning';

/** Errors outrank warnings; no summary yet is unknown, not clean. */
export function validationStateOf(summary: ValidationSummary | null): ValidationState {
  if (!summary) return 'unknown';
  if (summary.errorCount > 0) return 'error';
  return summary.warningCount > 0 ? 'warning' : 'clean';
}

/** Only a clean vault is ready; unknown reads as a warning rather than as ready. */
export function validationToneOf(state: ValidationState): ValidationTone {
  if (state === 'clean') return 'ready';
  return state === 'error' ? 'blocked' : 'warning';
}

/** The files a failed config write may have left unchanged: one tool's, or every tool's. */
export function configFilesFor(client: AgentClientId | undefined): string {
  return (
    client ? filesForClient(client) : AGENT_CLIENTS.flatMap((entry) => entry.files)
  ).join(', ');
}
