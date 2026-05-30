// R15 follow-up — `oh-my-ontology rename <oldSlug> <newSlug> [vault]`
// Atomic graph-level rename: moves the .md, updates `slug:`, rewrites every
// backlink (frontmatter array entries, inline strings, body links).
// Thin wrapper over MCP rename_concept (dry-run + confirm pattern).

import { COLORS } from '../lib/colors.mjs';
import { resolve } from 'node:path';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { formatUnknownFlagError, parseVaultFlag, resolveTrailingVaultArg } from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--confirm', '--overwrite', '--json'];


export async function runRename(args) {
  const { oldSlug, newSlug, vault, confirm, overwrite, json, error, help } = parseArgs(args);
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
    // Dry-run preview.
    let preview;
    try {
      preview = await callMcpTool(vaultRoot, 'rename_concept', {
        oldSlug,
        newSlug,
        confirm: false,
        overwrite,
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
        `${COLORS.bold}${oldSlug}${COLORS.reset} → ${COLORS.bold}${newSlug}${COLORS.reset} ` +
        `${COLORS.dim}(${updates.length} file(s) would change)${COLORS.reset}\n\n`,
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

  // Apply.
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'rename_concept', {
      oldSlug,
      newSlug,
      confirm: true,
      overwrite,
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
    `${COLORS.green}ok${COLORS.reset}    ${COLORS.bold}${oldSlug}${COLORS.reset} → ${COLORS.bold}${newSlug}${COLORS.reset} ` +
      `${COLORS.dim}(${updates.length} file(s) updated)${COLORS.reset}\n`,
  );
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

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, confirm: false, overwrite: false, json: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--confirm') flags.confirm = true;
    else if (a === '--overwrite') flags.overwrite = true;
    else if (a === '--json') flags.json = true;
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (positional.length < 2) {
    return { error: 'oldSlug and newSlug are required' };
  }
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 2 });
  if (vaultResult.error) return vaultResult;
  return {
    oldSlug: positional[0],
    newSlug: positional[1],
    vault: vaultResult.vault,
    confirm: flags.confirm,
    overwrite: flags.overwrite,
    json: flags.json,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology rename <oldSlug> <newSlug> [vault] [--confirm] [--overwrite] [--json]\n\n` +
      `${COLORS.bold}Default${COLORS.reset} dry-run only — preview the changes.\n` +
      `${COLORS.bold}--confirm${COLORS.reset}  apply: move .md, update slug:, rewrite every backlink.\n\n` +
      `${COLORS.bold}--overwrite${COLORS.reset} allow replacing an existing target slug.\n\n` +
      `${COLORS.bold}Example:${COLORS.reset}\n` +
      `  oh-my-ontology rename capabilities/foo capabilities/bar\n` +
      `  oh-my-ontology rename capabilities/foo capabilities/bar --confirm\n` +
      `  oh-my-ontology rename capabilities/foo capabilities/bar --confirm --overwrite\n`,
  );
}
