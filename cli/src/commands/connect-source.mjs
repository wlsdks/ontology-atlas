// `ontology-atlas connect-source <projectSlug> [vault]` — bind a project node
// to the local code folder it describes, measure it, write the receipt.
//
// The CLI mirror of MCP `connect_project_source`. It exists so the prescription
// the app has always printed (`nextAction: connect_source`) is reachable
// without the macOS app: the same inference, the same receipt, the same
// gitignored sidecar. Thin wrapper — the server owns the logic.

import { COLORS } from '../lib/colors.mjs';
import { resolve } from 'node:path';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { formatUnknownFlagError, parseRequiredFlagValue, parseVaultFlag, resolveTrailingVaultArg } from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--root', '--confirm', '--repair', '--json'];

const CONFIDENCE_COLORS = {
  high: COLORS.green,
  medium: COLORS.yellow,
  low: COLORS.red,
};

export async function runConnectSource(args) {
  const { projectSlug, vault, root, confirm, repair, json, error, help } = parseArgs(args);
  if (help) {
    printUsage(process.stdout);
    return 0;
  }
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 1;
  }

  const vaultRoot = resolve(process.cwd(), vault);
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'connect_project_source', {
      projectSlug,
      ...(root ? { rootPath: resolve(process.cwd(), root) } : {}),
      ...(confirm ? { confirm: true } : {}),
      ...(repair ? { repair: true } : {}),
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

  const receipt = result.projectSource?.receipt ?? result.previewReceipt ?? null;
  const witnesses = receipt?.witnessSummary;
  const header = result.changed
    ? `${COLORS.green}ok${COLORS.reset}     `
    : `${COLORS.yellow}dry-run${COLORS.reset}`;
  process.stdout.write(
    `${header} ${COLORS.bold}${result.projectSlug}${COLORS.reset} ${COLORS.dim}→ ${result.binding.rootPath}${COLORS.reset}\n`,
  );
  process.stdout.write(
    `  ${COLORS.dim}mode         ${result.mode} · ${result.binding.kind}`
    + `${result.binding.dirty === true ? ' · uncommitted changes present' : ''}${COLORS.reset}\n`,
  );
  if (witnesses) {
    process.stdout.write(
      `  ${COLORS.dim}evidence     ${witnesses.supported}/${witnesses.total} declared path(s) found in this folder${COLORS.reset}\n`,
    );
  }
  if (result.inference) {
    const color = CONFIDENCE_COLORS[result.inference.confidence] ?? COLORS.dim;
    process.stdout.write(
      `  ${COLORS.dim}inferred     ${COLORS.reset}${color}${result.inference.confidence}${COLORS.reset}`
      + ` ${COLORS.dim}confidence · ${result.inference.reason}${COLORS.reset}\n`,
    );
    for (const alternative of result.inference.alternatives ?? []) {
      process.stdout.write(
        `  ${COLORS.dim}alternative  ${alternative.rootPath} (${alternative.marker})${COLORS.reset}\n`,
      );
    }
  }
  if (receipt) {
    process.stdout.write(
      `  ${COLORS.dim}receipt      ${receipt.status} · nextAction ${receipt.nextAction?.id}${COLORS.reset}\n`,
    );
  }

  if (!result.changed) {
    process.stdout.write(
      `\n${COLORS.dim}nothing written. re-run with${COLORS.reset} ${COLORS.bold}--confirm${COLORS.reset}`
      + ` ${COLORS.dim}to bind, or${COLORS.reset} ${COLORS.bold}--root <path>${COLORS.reset}`
      + ` ${COLORS.dim}if the folder above is wrong.${COLORS.reset}\n`,
    );
    return 0;
  }
  process.stdout.write(
    `\n${COLORS.dim}undo:${COLORS.reset} ontology-atlas disconnect-source ${result.projectSlug} --confirm\n`,
  );
  return 0;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, root: null, confirm: false, repair: false, json: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--root') {
      const value = parseRequiredFlagValue('--root', args[++i]);
      if (value instanceof Error) return { error: value.message };
      flags.root = value;
    } else if (a.startsWith('--root=')) {
      const value = parseRequiredFlagValue('--root', a.slice('--root='.length));
      if (value instanceof Error) return { error: value.message };
      flags.root = value;
    } else if (a === '--confirm') flags.confirm = true;
    else if (a === '--repair') flags.repair = true;
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
    root: flags.root,
    confirm: flags.confirm,
    repair: flags.repair,
    json: flags.json,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n`
    + `  ontology-atlas connect-source <projectSlug> [vault] [--root path] [--confirm] [--repair] [--json]\n\n`
    + `${COLORS.bold}Default${COLORS.reset} dry-run: proposes a folder and reports how many declared\n`
    + `        \`path:\` claims actually exist inside it. Nothing is written.\n`
    + `${COLORS.bold}--root${COLORS.reset}    bind this folder instead of the inferred one (also replaces an existing binding)\n`
    + `${COLORS.bold}--confirm${COLORS.reset} write the binding + receipt to .ontology-atlas/project-sources.json (gitignored)\n`
    + `${COLORS.bold}--repair${COLORS.reset}  discard a malformed sidecar instead of refusing to overwrite it\n\n`
    + `${COLORS.dim}Inference: the git repository enclosing the vault wins; otherwise the nearest\n`
    + `ancestor folder carrying a project manifest (package.json, Cargo.toml, …).${COLORS.reset}\n\n`
    + `${COLORS.bold}Example:${COLORS.reset}\n`
    + `  ontology-atlas connect-source my-product docs/ontology\n`
    + `  ontology-atlas connect-source my-product docs/ontology --confirm\n`
    + `  ontology-atlas connect-source my-product docs/ontology --root /Users/me/code/app --confirm\n`,
  );
}
