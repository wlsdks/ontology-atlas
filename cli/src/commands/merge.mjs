// R15 follow-up — `oh-my-ontology merge <fromSlug> <intoSlug> [vault]`
// Atomic graph-level merge: every backlink fromSlug → intoSlug, then
// fromSlug.md is deleted. intoSlug node is preserved as-is (frontmatter +
// body — use `add`/manual edit if you want to combine bodies).
// Thin wrapper over MCP merge_concepts (dry-run + confirm pattern).

import { resolve } from 'node:path';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { formatUnknownFlagError, parseVaultFlag, resolveTrailingVaultArg } from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--confirm', '--json'];

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

export async function runMerge(args) {
  const { fromSlug, intoSlug, vault, confirm, json, error, help } = parseArgs(args);
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
      preview = await callMcpTool(vaultRoot, 'merge_concepts', {
        fromSlug,
        intoSlug,
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
    const updates = graphUpdates(preview);
    process.stdout.write(
      `${COLORS.yellow}dry-run${COLORS.reset}  ` +
        `${COLORS.bold}${fromSlug}${COLORS.reset} → ${COLORS.bold}${intoSlug}${COLORS.reset} ` +
        `${COLORS.dim}(${updates.length} file(s) would change, ${fromSlug}.md will be deleted)${COLORS.reset}\n\n`,
    );
    for (const u of updates) {
      process.stdout.write(`  ${COLORS.cyan}${u.slug}${COLORS.reset}${graphUpdateTitle(u)}\n`);
      for (const c of graphUpdateChanges(u)) {
        process.stdout.write(`    ${COLORS.dim}${c}${COLORS.reset}\n`);
      }
    }
    process.stdout.write(
      `\n${COLORS.dim}re-run with${COLORS.reset} ${COLORS.bold}--confirm${COLORS.reset} ${COLORS.dim}to apply.${COLORS.reset}\n`,
    );
    return 0;
  }

  let result;
  try {
    result = await callMcpTool(vaultRoot, 'merge_concepts', {
      fromSlug,
      intoSlug,
      confirm: true,
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
  const updates = graphUpdates(result);
  process.stdout.write(
    `${COLORS.green}ok${COLORS.reset}    ${COLORS.bold}${fromSlug}${COLORS.reset} → ${COLORS.bold}${intoSlug}${COLORS.reset} ` +
      `${COLORS.dim}(${updates.length} file(s) updated, ${fromSlug}.md deleted)${COLORS.reset}\n`,
  );
  writeCapturedSummary(result?.capturedFrom, 'deleted source');
  for (const u of updates) {
    process.stdout.write(`  ${COLORS.cyan}${u.slug}${COLORS.reset}${graphUpdateTitle(u)}\n`);
    for (const c of graphUpdateChanges(u)) {
      process.stdout.write(`    ${COLORS.dim}${c}${COLORS.reset}\n`);
    }
  }
  return 0;
}

function graphUpdates(result) {
  if (Array.isArray(result?.updates)) return result.updates;
  if (Array.isArray(result?.backlinkUpdates?.updates)) return result.backlinkUpdates.updates;
  return [];
}

function graphUpdateTitle(update) {
  return update?.title && update.title !== update.slug
    ? ` ${COLORS.dim}— ${update.title}${COLORS.reset}`
    : '';
}

function graphUpdateChanges(update) {
  if (Array.isArray(update?.changes)) return update.changes;
  const keys = new Set();
  for (const row of update?.beforeKeys ?? []) {
    if (typeof row?.key === 'string' && row.key.trim()) keys.add(row.key);
  }
  for (const row of update?.afterKeys ?? []) {
    if (typeof row?.key === 'string' && row.key.trim()) keys.add(row.key);
  }
  const changes = [...keys].sort().map((key) => `${key} changed`);
  if (update?.bodyChanged) changes.push('body changed');
  return changes;
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
  if (positional.length < 2) {
    return { error: 'fromSlug and intoSlug are required' };
  }
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 2 });
  if (vaultResult.error) return vaultResult;
  return {
    fromSlug: positional[0],
    intoSlug: positional[1],
    vault: vaultResult.vault,
    confirm: flags.confirm,
    json: flags.json,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology merge <fromSlug> <intoSlug> [vault] [--confirm] [--json]\n\n` +
      `${COLORS.bold}Default${COLORS.reset} dry-run — preview the redirects.\n` +
      `${COLORS.bold}--confirm${COLORS.reset}  apply: redirect every backlink, delete fromSlug.md.\n\n` +
      `${COLORS.bold}Example:${COLORS.reset}\n` +
      `  oh-my-ontology merge capabilities/dup capabilities/canonical\n` +
      `  oh-my-ontology merge capabilities/dup capabilities/canonical --confirm\n`,
  );
}
