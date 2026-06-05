// R15 follow-up — `ontology-atlas delete <slug> [vault]`
// Permanent delete. Default refuses if backlinks remain (--force overrides).
// Default dry-run with backlinks preview (--confirm applies).
// Thin wrapper over MCP delete_concept.

import { COLORS } from '../lib/colors.mjs';
import { resolve } from 'node:path';
import { formatCapturedSummary } from '../lib/captured-summary.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { formatUnknownFlagError, parseVaultFlag, resolveTrailingVaultArg } from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--confirm', '--force', '--json'];


export async function runDelete(args) {
  const { slug, vault, confirm, force, json, error, help } = parseArgs(args);
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

  if (!confirm) {
    let preview;
    try {
      preview = await callMcpTool(vaultRoot, 'delete_concept', {
        slug,
        confirm: false,
      });
    } catch (err) {
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
    if (json) {
      process.stdout.write(JSON.stringify(preview, null, 2) + '\n');
      return 0;
    }
    const backlinks = preview?.backlinks ?? preview?.matches ?? [];
    process.stdout.write(
      `${COLORS.yellow}dry-run${COLORS.reset}  ` +
        `delete ${COLORS.bold}${slug}${COLORS.reset} ` +
        `${COLORS.dim}(${backlinks.length} backlink(s)${backlinks.length > 0 ? ' — would block without --force' : ''})${COLORS.reset}\n`,
    );
    for (const bl of backlinks) {
      const titleText = bl.title && bl.title !== bl.slug ? ` ${COLORS.dim}— ${bl.title}${COLORS.reset}` : '';
      process.stdout.write(
        `  ${COLORS.cyan}${bl.slug}${COLORS.reset}${titleText}` +
          (Array.isArray(bl.matchedKeys)
            ? ` ${COLORS.dim}(${bl.matchedKeys.join(', ')})${COLORS.reset}`
            : '') +
          `\n`,
      );
    }
    process.stdout.write(
      `\n${COLORS.dim}re-run with${COLORS.reset} ${COLORS.bold}--confirm${COLORS.reset}` +
        (backlinks.length > 0 ? ` ${COLORS.bold}--force${COLORS.reset}` : '') +
        ` ${COLORS.dim}to apply.${COLORS.reset}\n`,
    );
    return 0;
  }

  let result;
  try {
    result = await callMcpTool(vaultRoot, 'delete_concept', {
      slug,
      confirm: true,
      force,
    });
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
  const backlinksAtDelete = Array.isArray(result?.backlinksAtDelete) ? result.backlinksAtDelete : [];
  process.stdout.write(
    `${COLORS.green}ok${COLORS.reset}    ${COLORS.bold}${slug}${COLORS.reset} ${COLORS.dim}deleted${COLORS.reset}` +
      (backlinksAtDelete.length > 0
        ? ` ${COLORS.yellow}(${backlinksAtDelete.length} dangling backlink(s) left)${COLORS.reset}`
        : '') +
      `\n`,
  );
  process.stdout.write(formatCapturedSummary(result?.captured, 'deleted node', COLORS));
  for (const bl of backlinksAtDelete) {
    const titleText = bl.title && bl.title !== bl.slug ? ` ${COLORS.dim}— ${bl.title}${COLORS.reset}` : '';
    process.stdout.write(
      `  ${COLORS.cyan}${bl.slug}${COLORS.reset}${titleText}` +
        (Array.isArray(bl.matchedKeys)
          ? ` ${COLORS.dim}(${bl.matchedKeys.join(', ')})${COLORS.reset}`
          : '') +
        `\n`,
    );
  }
  return 0;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, confirm: false, force: false, json: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--confirm') flags.confirm = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--json') flags.json = true;
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (positional.length === 0) {
    return { error: 'slug is required' };
  }
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 1 });
  if (vaultResult.error) return vaultResult;
  return {
    slug: positional[0],
    vault: vaultResult.vault,
    confirm: flags.confirm,
    force: flags.force,
    json: flags.json,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas delete <slug> [vault] [--confirm] [--force] [--json]\n\n` +
      `${COLORS.bold}Default${COLORS.reset} dry-run — preview backlinks.\n` +
      `${COLORS.bold}--confirm${COLORS.reset}  apply (refuses if backlinks exist)\n` +
      `${COLORS.bold}--force${COLORS.reset}    delete even with backlinks (use carefully)\n\n` +
      `${COLORS.bold}Example:${COLORS.reset}\n` +
      `  ontology-atlas delete capabilities/old\n` +
      `  ontology-atlas delete capabilities/old --confirm\n` +
      `  ontology-atlas delete capabilities/old --confirm --force\n`,
  );
}
