import { MCP_SERVER_NAME, type McpServerLaunch } from '@/shared/config';

import { type AgentClientId } from './agent-clients';

/**
 * **Global scope** — using Atlas from every project on this computer.
 *
 * **Why the app does not write these files itself.** Owner observation (2026-07-30):
 * "Most people connect an agent globally rather than per project" — correct, so global is offered **as an option**. But the app
 * does not edit the home directory on the user's behalf. One rule:
 *
 * > **Inside the vault or repo, the app writes. Outside it, the tool writes its own file.**
 *
 * Three things point at that line at once.
 *
 * **① Auditability.** What the app wrote is readable with `git diff` — that is this product's claim.
 * A home directory is not the user's repo, so the claim does not hold there. A default must not
 * contradict the product's own claim.
 *
 * **② Lost updates.** Claude Code's global file `~/.claude.json` is, per the official docs, a
 * **state store** where MCP entries live alongside **per-project toggles updated at runtime**
 * (`enabledMcpServers` / `disabledMcpServers`). A third party overwriting it while the tool runs
 * silently erases the user's settings — one click becomes a failure that looks like success.
 *
 * **③ Zero industry precedent.** Measured across the official docs of 12 MCP server vendors:
 *
 * | Form | Adoption |
 * |---|---|
 * | A CLI command to copy | **12/12** |
 * | Instructions to edit `~/.claude.json` directly | **0/12** |
 * | A third-party installer writing Claude's config directly | 1/12 (and that was a project file) |
 * | Pushing global/user scope as the **default** | **0/12** |
 *
 * And **not one vendor documented a backup, merge, or locking strategy** — the industry has no
 * precedent for "safe direct writing". So global is offered as **one line with the paths already
 * filled in**. Not having to assemble it is the app's value; one paste is the price.
 *
 * **Why not vary this per tool.** `~/.cursor/mcp.json` has a convention of third-party (deeplink)
 * writes, so "we write Cursor's and hand a command for Claude's" is possible. But then ① the user
 * cannot tell why they differ and ② the Rust security boundary has to widen to the home directory.
 * That boundary already carries its reason (`src-tauri/src/agent_setup.rs`: touching global config
 * in the user's home is too broad a reach). One rule is kept better than four exceptions.
 */

/** How a global config is applied — the tool writes it itself, or the user pastes into a file. */
export type GlobalScopeKind = 'command' | 'snippet';

export interface GlobalScopeInstruction {
  client: AgentClientId;
  kind: GlobalScopeKind;
  /**
   * Where the global config lives. Written **relative to home** (`~/…`) — pinning an absolute path
   * containing the user's name on screen leaks it straight into screenshots and documentation.
   */
  path: string;
  /** The body to copy and run (command) or paste (snippet). Absolute paths are already embedded. */
  text: string;
}

/** The vault's absolute path is required — a global config does not sit beside the vault, so a relative path cannot work. */
export interface GlobalScopeInput {
  launch: McpServerLaunch;
  vaultAbsolute: string;
}

/** So it can go straight into a shell line — a path containing spaces or quotes must not split silently. */
function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@%+-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

function launchWords(launch: McpServerLaunch): string {
  return [launch.command, ...launch.args].map(shellQuote).join(' ');
}

function jsonSnippet(launch: McpServerLaunch, vaultAbsolute: string): string {
  return (
    JSON.stringify(
      {
        mcpServers: {
          [MCP_SERVER_NAME]: {
            command: launch.command,
            args: launch.args,
            env: { OATLAS_VAULT: vaultAbsolute },
          },
        },
      },
      null,
      2,
    ) + '\n'
  );
}

function tomlSnippet(launch: McpServerLaunch, vaultAbsolute: string): string {
  const args = launch.args.map((arg) => JSON.stringify(arg)).join(', ');
  return [
    `[mcp_servers.${MCP_SERVER_NAME}]`,
    `command = ${JSON.stringify(launch.command)}`,
    `args = [${args}]`,
    `env = { OATLAS_VAULT = ${JSON.stringify(vaultAbsolute)} }`,
    '',
  ].join('\n');
}

/**
 * The one way to attach this tool to **the whole computer**.
 *
 * Only Claude Code is a `command` — that tool officially supports `--scope user`, and its file is
 * the state store from ② above, which must not be edited by hand either. The other three are static
 * config files, so they are `snippet`, and their CLIs have not been confirmed to exist, so we do not
 * claim they do (handing over an unconfirmed command is a dead CTA).
 */
export function globalScopeInstruction(
  client: AgentClientId,
  { launch, vaultAbsolute }: GlobalScopeInput,
): GlobalScopeInstruction {
  switch (client) {
    case 'claude-code':
      return {
        client,
        kind: 'command',
        path: '~/.claude.json',
        text: `claude mcp add --scope user --env OATLAS_VAULT=${shellQuote(vaultAbsolute)} ${MCP_SERVER_NAME} -- ${launchWords(launch)}`,
      };
    case 'codex':
      return {
        client,
        kind: 'snippet',
        path: '~/.codex/config.toml',
        text: tomlSnippet(launch, vaultAbsolute),
      };
    case 'cursor':
      return { client, kind: 'snippet', path: '~/.cursor/mcp.json', text: jsonSnippet(launch, vaultAbsolute) };
    case 'antigravity':
      return {
        client,
        kind: 'snippet',
        path: '~/.gemini/config/mcp_config.json',
        text: jsonSnippet(launch, vaultAbsolute),
      };
  }
}
