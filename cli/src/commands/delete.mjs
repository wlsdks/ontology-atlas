// R15 follow-up — `oh-my-ontology delete <slug> [vault]`
// Permanent delete. Default refuses if backlinks remain (--force overrides).
// Default dry-run with backlinks preview (--confirm applies).
// Thin wrapper over MCP delete_concept.

import { resolve } from 'node:path';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { formatUnknownFlagError, parseVaultFlag, resolveTrailingVaultArg } from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--confirm', '--force', '--json'];

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

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
  writeCapturedSummary(result?.captured, 'deleted node');
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

function writeCapturedSummary(captured, label) {
  const title = captured?.frontmatter?.title;
  const excerpt = typeof captured?.bodyExcerpt === 'string' ? captured.bodyExcerpt.trim() : '';
  if (!title && !excerpt) return;
  process.stdout.write(`  ${COLORS.dim}${label}${COLORS.reset}`);
  if (title) process.stdout.write(` ${COLORS.cyan}${title}${COLORS.reset}`);
  process.stdout.write('\n');
  if (excerpt) {
    process.stdout.write(`    ${COLORS.dim}${excerpt}${COLORS.reset}\n`);
  }
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
      `  oh-my-ontology delete <slug> [vault] [--confirm] [--force] [--json]\n\n` +
      `${COLORS.bold}Default${COLORS.reset} dry-run — preview backlinks.\n` +
      `${COLORS.bold}--confirm${COLORS.reset}  apply (refuses if backlinks exist)\n` +
      `${COLORS.bold}--force${COLORS.reset}    delete even with backlinks (use carefully)\n\n` +
      `${COLORS.bold}Example:${COLORS.reset}\n` +
      `  oh-my-ontology delete capabilities/old\n` +
      `  oh-my-ontology delete capabilities/old --confirm\n` +
      `  oh-my-ontology delete capabilities/old --confirm --force\n`,
  );
}
