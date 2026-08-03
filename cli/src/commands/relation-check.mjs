// `ontology-atlas relation-check <from> <to> <type> [vault]`
// Schema-aware preflight before add_relation. Thin wrapper over MCP
// query_ontology({ operation: 'relation_check' }) so developer CLI and AI
// agents see the same proposedAction / semantic approval-gate contract.

import { COLORS } from '../lib/colors.mjs';
import { runRelationCheckQuery, renderRelationCheckResult } from '../lib/relation-preflight.mjs';
import { validateRelationTypeList } from '../lib/relation-types.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--json'];


export async function runRelationCheck(args) {
  const { from, to, type, vault, json, error, help } = parseArgs(args);
  if (help) {
    printUsage(process.stdout);
    return 0;
  }
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 1;
  }

  const vaultRoot = resolveVaultRoot(vault);
  let result;
  try {
    result = await runRelationCheckQuery(vaultRoot, from, to, type);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  }

  render(result);
  return 0;
}

function render(result) {
  renderRelationCheckResult(result);

  if (result.proposedAction) {
    process.stdout.write(
      `\n${COLORS.dim}proposed add_relation${COLORS.reset}\n` +
        `  tool ${COLORS.cyan}${result.proposedAction.tool}${COLORS.reset}\n` +
        `  args ${JSON.stringify(result.proposedAction.args)}\n`,
    );
  }
  if (result.approvalGate) {
    process.stdout.write(
      `\n${COLORS.yellow}semantic approval required${COLORS.reset}\n` +
        `  ${result.approvalGate.next}\n` +
        `  ${COLORS.dim}writeAllowed=false · ${result.approvalGate.required.join(', ')}${COLORS.reset}\n`,
    );
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (positional.length < 3) {
    return { error: '<from>, <to>, and <type> are required' };
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const typeError = validateRelationTypeList([positional[2]], 'type');
  if (typeError) return { error: typeError.message };
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 3 });
  if (vaultResult.error) return vaultResult;
  return {
    from: positional[0],
    to: positional[1],
    type: positional[2],
    vault: vaultResult.vault,
    json: flags.json,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas relation-check <from> <to> <type> [vault] [--vault path] [--json]\n\n` +
      `Schema-aware preflight before add_relation. Prints verdict, schema pattern, nearby patterns, and either a proposedAction or a non-writing semantic approval gate.\n\n` +
      `${COLORS.bold}Example:${COLORS.reset}\n` +
      `  ontology-atlas relation-check capabilities/foo domains/auth domain docs/ontology\n` +
      `  ontology-atlas relation-check capabilities/foo capabilities/bar depends_on --json\n`,
  );
}
