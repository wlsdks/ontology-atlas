/** Renders the MCP registration config and the Codex add command a coding agent needs to open a vault. */

import type { McpServerLaunch } from '@/shared/config';

/** The installed app passes its bundled binary path; the web uses a source-checkout placeholder. */
const SOURCE_CHECKOUT_PLACEHOLDER: McpServerLaunch = {
  kind: 'source-checkout',
  command: 'node',
  args: [`<absolute path to your ontology-atlas checkout>/mcp/src/index.js`],
};

function resolveLaunch(launch?: McpServerLaunch | null): McpServerLaunch {
  return launch ?? SOURCE_CHECKOUT_PLACEHOLDER;
}

/**
 * MCP config template to register an AI agent (Claude Code, Cursor, …) from
 * a different working directory. `OATLAS_VAULT` must be the absolute path to
 * the vault folder — the browser cannot know it.
 */
export function buildMcpConfigJson(
  vaultName: string,
  vaultPath?: string | null,
  launch?: McpServerLaunch | null,
): string {
  return buildMcpConfigJsonForVault(
    vaultPath ?? `<absolute path to your ${vaultName} folder>`,
    launch,
  );
}

/**
 * Ready-to-use MCP config for opening the vault folder itself in Claude Code
 * or Cursor. `OATLAS_VAULT=.` keeps the config portable inside the folder.
 */
export function buildVaultMcpConfigJson(launch?: McpServerLaunch | null): string {
  return buildMcpConfigJsonForVault('.', launch);
}

function buildMcpConfigJsonForVault(
  omotVault: string,
  launch?: McpServerLaunch | null,
): string {
  const resolved = resolveLaunch(launch);
  return (
    JSON.stringify(
      {
        mcpServers: {
          'ontology-atlas': {
            command: resolved.command,
            args: resolved.args,
            env: {
              OATLAS_VAULT: omotVault,
            },
          },
        },
      },
      null,
      2,
    ) + '\n'
  );
}

/**
 * Codex MCP config. Defaults to the vault folder itself, but can also render
 * the codebase-root template where `OATLAS_VAULT` must be an absolute path.
 */
export function buildCodexConfigToml(
  omotVault = '.',
  launch?: McpServerLaunch | null,
): string {
  const resolved = resolveLaunch(launch);
  return [
    '[mcp_servers.ontology-atlas]',
    `command = ${JSON.stringify(resolved.command)}`,
    `args = ${JSON.stringify(resolved.args)}`,
    '',
    '[mcp_servers.ontology-atlas.env]',
    `OATLAS_VAULT = ${JSON.stringify(omotVault)}`,
    '',
  ].join('\n');
}

export function buildCodexConfigTomlTemplate(
  vaultName: string,
  vaultPath?: string | null,
  launch?: McpServerLaunch | null,
): string {
  return buildCodexConfigToml(
    vaultPath ?? `<absolute path to your ${vaultName} folder>`,
    launch,
  );
}

export function buildCodexMcpAddCommandTemplate(
  vaultName: string,
  vaultPath?: string | null,
  launch?: McpServerLaunch | null,
): string {
  const resolvedVaultPath = vaultPath ?? `<absolute path to your ${vaultName} folder>`;
  const resolved = resolveLaunch(launch);
  return [
    'codex',
    'mcp',
    'add',
    'ontology-atlas',
    '--env',
    `OATLAS_VAULT=${shellQuote(resolvedVaultPath)}`,
    '--',
    shellQuote(resolved.command),
    ...resolved.args.map(shellQuote),
  ].join(' ');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
