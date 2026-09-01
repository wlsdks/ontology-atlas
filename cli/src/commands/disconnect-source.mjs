// `ontology-atlas disconnect-source <projectSlug> [vault]` — remove a project's
// local source binding and receipt. The reversal of `connect-source`.
//
// Thin wrapper over MCP `disconnect_project_source`. Only the local sidecar
// changes; no ontology markdown is touched.

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { formatUnknownFlagError, parseVaultFlag, resolveTrailingVaultArg } from '../lib/cli-args.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';

const ALLOWED_FLAGS = ['--vault', '--confirm', '--json'];

export async function runDisconnectSource(args) {
  const { projectSlug, vault, confirm, json, error, help } = parseArgs(args);
  if (help) {
    printUsage(process.stdout);
    return 0;
  }
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 1;
  }

  // The shared resolution order (explicit → OATLAS_VAULT → docs/ontology
  // auto-detect), like every other vault command. The bare cwd resolve this
  // used meant a destructive write could target a different vault than the
  // read/write siblings in the same shell (bug sweep 2026-09-01).
  const vaultRoot = resolveVaultRoot(vault);
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'disconnect_project_source', {
      projectSlug,
      ...(confirm ? { confirm: true } : {}),
    });
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const bindings = Array.isArray(result.bindings) ? result.bindings : [];
  if (bindings.length === 0) {
    process.stdout.write(
      `${COLORS.dim}nothing to disconnect: ${result.projectSlug} has no source binding.${COLORS.reset}\n`,
    );
    return 0;
  }
  for (const binding of bindings) {
    process.stdout.write(
      `  ${COLORS.dim}${binding.kind}  ${binding.rootPath}  (measured ${binding.measuredAt ?? 'never'})${COLORS.reset}\n`,
    );
  }
  if (!result.changed) {
    process.stdout.write(
      `\n${COLORS.yellow}dry-run${COLORS.reset} ${COLORS.dim}nothing written. re-run with${COLORS.reset}`
      + ` ${COLORS.bold}--confirm${COLORS.reset} ${COLORS.dim}to remove the binding above.${COLORS.reset}\n`,
    );
    return 0;
  }
  process.stdout.write(
    `\n${COLORS.green}ok${COLORS.reset}     ${result.removed} binding(s) removed · `
    + `${COLORS.dim}status now ${result.projectSource?.status} · nextAction ${result.projectSource?.nextAction?.id}${COLORS.reset}\n`
    + `${COLORS.dim}re-connect:${COLORS.reset} ontology-atlas connect-source ${result.projectSlug} --confirm\n`,
  );
  return 0;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, confirm: false, json: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--confirm') flags.confirm = true;
    else if (a === '--json') flags.json = true;
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (positional.length === 0) return { error: 'projectSlug is required' };
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 1 });
  if (vaultResult.error) return vaultResult;
  return {
    projectSlug: positional[0],
    vault: vaultResult.vault,
    confirm: flags.confirm,
    json: flags.json,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n`
    + `  ontology-atlas disconnect-source <projectSlug> [vault] [--confirm] [--json]\n\n`
    + `${COLORS.bold}Default${COLORS.reset} dry-run: lists the binding that would be removed.\n`
    + `${COLORS.bold}--confirm${COLORS.reset} remove it. Other projects' bindings are untouched.\n\n`
    + `${COLORS.bold}Example:${COLORS.reset}\n`
    + `  ontology-atlas disconnect-source my-product docs/ontology\n`
    + `  ontology-atlas disconnect-source my-product docs/ontology --confirm\n`,
  );
}
