import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  repairCodexConfigText,
  repairMcpJsonText,
  writeCurrentCodexMergeTemplate,
  writeCurrentMcpMergeTemplate,
  writeTextAtomically,
} from '../agent-setup/agent-config.mjs';
import { ok, warn } from '../status-lines.mjs';
import { shellQuote } from './shell-quote.mjs';

export function mcpConfigForVault(serverCommand, omotVault, repoRoot) {
  return {
    mcpServers: {
      'ontology-atlas': {
        command: serverCommand.command,
        args: serverCommand.args,
        env: { OATLAS_VAULT: omotVault, OATLAS_REPO_ROOT: repoRoot },
      },
    },
  };
}

/**
 * `.mcp.json` is wired to this vault in cwd and in the vault itself; a parseable config keeps every
 * unrelated server, and a malformed or ambiguous one stays untouched and gets a merge example.
 */
export function writeMcpJson({ serverCommand, clientBindingIssues }, directory, omotVault, repoRoot, label) {
  const mcpJson = join(directory, '.mcp.json');
  const mcpExample = join(directory, '.mcp.json.example');
  const mcpJsonText =
    JSON.stringify(mcpConfigForVault(serverCommand, omotVault, repoRoot), null, 2) + '\n';
  if (!existsSync(mcpJson)) {
    writeTextAtomically(mcpJson, mcpJsonText);
    ok(`  ${label}/.mcp.json (OATLAS_VAULT=${omotVault})`);
  } else {
    const repaired = repairMcpJsonText(
      readFileSync(mcpJson, 'utf-8'),
      mcpConfigForVault(serverCommand, omotVault, repoRoot),
    );
    if (repaired.ok) {
      writeTextAtomically(mcpJson, repaired.text);
      ok(`  ${label}/.mcp.json ${repaired.action} (OATLAS_VAULT=${omotVault})`);
    } else {
      warn(`  ${label}/.mcp.json is ambiguous or invalid: preserved (manual merge required)`);
      clientBindingIssues.push(`${label}/.mcp.json`);
      const template = writeCurrentMcpMergeTemplate(
        mcpExample,
        mcpConfigForVault(serverCommand, omotVault, repoRoot),
      );
      ok(`  ${template.path} (current vault merge template)`);
    }
  }
}

function tomlString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function codexConfigForVault(serverCommand, omotVault, repoRoot) {
  const args = serverCommand.args.map(tomlString).join(', ');
  return [
    '[mcp_servers.ontology-atlas]',
    `command = ${tomlString(serverCommand.command)}`,
    `args = [${args}]`,
    '',
    '[mcp_servers.ontology-atlas.env]',
    `OATLAS_VAULT = ${tomlString(omotVault)}`,
    `OATLAS_REPO_ROOT = ${tomlString(repoRoot)}`,
    '',
  ].join('\n');
}

export function writeCodexConfig({ serverCommand, clientBindingIssues }, directory, omotVault, repoRoot, label) {
  const codexDir = join(directory, '.codex');
  const codexConfig = join(codexDir, 'config.toml');
  const codexExample = join(codexDir, 'config.toml.example');
  if (!existsSync(codexDir)) mkdirSync(codexDir, { recursive: true });
  if (!existsSync(codexConfig)) {
    writeTextAtomically(codexConfig, codexConfigForVault(serverCommand, omotVault, repoRoot));
    ok(`  ${label}/.codex/config.toml (OATLAS_VAULT=${omotVault})`);
  } else {
    const repaired = repairCodexConfigText(
      readFileSync(codexConfig, 'utf-8'),
      codexConfigForVault(serverCommand, omotVault, repoRoot),
    );
    if (repaired.ok) {
      writeTextAtomically(codexConfig, repaired.text);
      ok(`  ${label}/.codex/config.toml ${repaired.action} (OATLAS_VAULT=${omotVault})`);
    } else {
      warn(`  ${label}/.codex/config.toml is ambiguous: preserved (manual merge required)`);
      clientBindingIssues.push(`${label}/.codex/config.toml`);
      const template = writeCurrentCodexMergeTemplate(
        codexExample,
        codexConfigForVault(serverCommand, omotVault, repoRoot),
      );
      ok(`  ${template.path} (current vault merge template)`);
    }
  }
}

/**
 * The `codex mcp add` command that binds Codex globally. Joined with backslash-newline at the
 * `--env` / `--` boundaries so it survives copying from an 80-column terminal; the continuation
 * form is still one POSIX command.
 */
export function codexSetupCommand({ target, cwdPath, serverCommand }) {
const codexSetupArgv = [
  'codex',
  'mcp',
  'add',
  'ontology-atlas',
  '--env',
  `OATLAS_VAULT=${target}`,
  '--env',
  `OATLAS_REPO_ROOT=${cwdPath}`,
  '--',
  serverCommand.command,
  ...serverCommand.args,
].map(shellQuote);
return codexSetupArgv
  .reduce((lines, token) => {
    if (token === '--env' || token === '--') lines.push([token]);
    else if (lines.length === 0) lines.push([token]);
    else lines[lines.length - 1].push(token);
    return lines;
  }, [])
  .map((line) => line.join(' '))
  .join(' \\\n         ');
}
