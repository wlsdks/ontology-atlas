// R15 follow-up — `ontology-atlas backlinks <slug> [vault]`
// Lists every node referencing the target. Thin wrapper over MCP find_backlinks.

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertBacklinksShape } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { closestAllowedValue, formatUnknownFlagError, parseVaultFlag, resolveTrailingVaultArg } from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--json'];


export async function runBacklinks(args) {
  const { slug, vault, json, error, help } = parseArgs(args);
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
    result = await callMcpTool(vaultRoot, 'find_backlinks', { slug });
    assertBacklinksShape(result);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  const matches = result?.matches ?? [];
  if (matches.length === 0) {
    // Zero backlinks and "no such node" used to print the same thing (audit
    // 2026-09-04: a typo returned exit 0 and an empty list). Siblings such as
    // `node` fail closed with the closest slug; so does this now. CLI-side only:
    // MCP `find_backlinks` still answers an unresolvable slug with total 0.
    const missing = await unknownSlugMessage(vaultRoot, slug);
    if (missing) {
      process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${missing.message}\n`);
      // JSON callers still get a typed answer: the slug did not resolve.
      if (json) {
        process.stdout.write(JSON.stringify({ target: slug, resolved: false, suggestion: missing.suggestion, total: 0, matches: [] }, null, 2) + '\n');
      }
      return 2;
    }
  }

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  }

  if (matches.length === 0) {
    process.stdout.write(
      `${COLORS.dim}no backlinks for${COLORS.reset} ${COLORS.bold}${slug}${COLORS.reset}\n`,
    );
    return 0;
  }

  process.stdout.write(
    `${COLORS.bold}${slug}${COLORS.reset} ${COLORS.dim}· ${matches.length} backlink(s)${COLORS.reset}\n\n`,
  );
  for (const bl of matches) {
    const keys = Array.isArray(bl.matchedKeys) ? bl.matchedKeys.join(', ') : '';
    const titleText = bl.title && bl.title !== bl.slug ? ` ${COLORS.dim}· ${bl.title}${COLORS.reset}` : '';
    process.stdout.write(
      `  ${COLORS.cyan}${bl.kind ?? '?'}${COLORS.reset}  ` +
        `${bl.slug}${titleText}` +
        (keys ? ` ${COLORS.dim}(${keys})${COLORS.reset}` : '') +
        `\n`,
    );
  }
  return 0;
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
  if (positional.length === 0) {
    return { error: 'slug is required' };
  }
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 1 });
  if (vaultResult.error) return vaultResult;
  return { slug: positional[0], vault: vaultResult.vault, json: flags.json };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas backlinks <slug> [vault] [--vault path] [--json]\n\n` +
      `${COLORS.bold}Example:${COLORS.reset}\n` +
      `  ontology-atlas backlinks capabilities/mcp-server\n` +
      `  ontology-atlas backlinks domains/auth ./docs/ontology --json\n`,
  );
}

/** Null when `slug` names a node; otherwise the refusal sentence with the closest real slug. */
async function unknownSlugMessage(vaultRoot, slug) {
  try {
    await callMcpTool(vaultRoot, 'get_concept', { slug });
    return null;
  } catch {
    // fall through: the node does not resolve
  }
  let suggestion = null;
  try {
    const listed = await callMcpTool(vaultRoot, 'list_concepts', { limit: 500 });
    const slugs = Array.isArray(listed?.nodes) ? listed.nodes.map((node) => node.slug).filter(Boolean) : [];
    suggestion = closestAllowedValue(slug, slugs);
  } catch {
    suggestion = null;
  }
  return {
    suggestion,
    message: `unknown slug: ${slug}. No node in the vault has this slug${suggestion ? `; did you mean ${suggestion}?` : '.'}`,
  };
}
