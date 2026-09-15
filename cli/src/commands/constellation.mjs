// Read one saved constellation and its current graph facts through MCP get_constellation.

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertConstellationContextShape } from '../lib/constellation-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseNonNegativeIntegerFlag,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';

const MEMBER_LIMIT_CAP = 100;
const EDGE_LIMIT_CAP = 200;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ALLOWED_FLAGS = ['--vault', '--offset', '--limit', '--relation-limit', '--dependency-limit', '--json'];

export async function runConstellation(args) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${parsed.error}\n`);
    printUsage();
    return 1;
  }
  let result;
  try {
    result = await callMcpTool(resolveVaultRoot(parsed.vault), 'get_constellation', {
      id: parsed.id,
      offset: parsed.offset,
      limit: parsed.limit,
      relationLimit: parsed.relationLimit,
      dependencyLimit: parsed.dependencyLimit,
    });
    assertConstellationContextShape(result);
  } catch (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.availability === 'unavailable' ? 1 : 0;
  }
  render(result);
  return result.availability === 'unavailable' ? 1 : 0;
}

function render(result) {
  if (result.availability !== 'ready') {
    process.stdout.write(`${COLORS.dim}${result.guidance}${COLORS.reset}\n`);
    if (result.source.reason) process.stdout.write(`${COLORS.dim}reason${COLORS.reset}  ${result.source.reason}\n`);
    return;
  }
  const { selection, current } = result;
  const purpose = selection.purpose.status === 'recorded' ? selection.purpose.value : 'purpose unknown';
  process.stdout.write(
    `${COLORS.bold}${selection.name}${COLORS.reset} ${COLORS.dim}${selection.id}${COLORS.reset}\n` +
    `  ${purpose}\n` +
    `  ${COLORS.dim}${selection.ontologyMemberCount} ontology · ${selection.referenceMemberCount} reference · updated ${selection.updatedAt}${COLORS.reset}\n`,
  );

  if (current.resolvedMembers.length > 0) process.stdout.write(`\n${COLORS.bold}current ontology facts${COLORS.reset}\n`);
  for (const member of current.resolvedMembers) {
    const domain = member.domain ? ` · domain ${member.domain}` : '';
    process.stdout.write(
      `  ${COLORS.cyan}${member.title}${COLORS.reset} ${COLORS.dim}${member.slug} · ${member.kind}${domain}${COLORS.reset}\n` +
      `    identity ${member.identityResolution} · review ${member.review.state ?? 'unreviewed'} / ${member.review.currentness}\n` +
      (member.evidence.implementationPath
        ? `    ${COLORS.dim}implementation ${member.evidence.implementationPath}${COLORS.reset}\n`
        : ''),
    );
  }

  if (current.unresolvedMembers.length > 0) process.stdout.write(`\n${COLORS.bold}unresolved saved members${COLORS.reset}\n`);
  for (const member of current.unresolvedMembers) {
    process.stdout.write(
      `  ${COLORS.yellow}${member.label}${COLORS.reset} ${COLORS.dim}${member.uid} · ${member.reason} · last known ${member.lastKnownPath}${COLORS.reset}\n`,
    );
  }

  process.stdout.write(`\n${COLORS.bold}real internal relations${COLORS.reset} ${COLORS.dim}${result.relations.returned}/${result.relations.total}${COLORS.reset}\n`);
  for (const edge of result.relations.rows) {
    process.stdout.write(`  ${edge.from.slug} ${COLORS.yellow}${edge.type}${COLORS.reset} ${edge.to.slug}\n`);
  }
  process.stdout.write(`${COLORS.bold}direct dependencies crossing scope${COLORS.reset} ${COLORS.dim}${result.outsideScopeDependencies.returned}/${result.outsideScopeDependencies.total}${COLORS.reset}\n`);
  for (const edge of result.outsideScopeDependencies.rows) {
    process.stdout.write(`  ${edge.scopeDirection} · ${edge.from.slug} ${COLORS.yellow}${edge.type}${COLORS.reset} ${edge.to.slug}\n`);
  }

  if (selection.pagination.hasMore) {
    process.stdout.write(
      `\n${COLORS.dim}more members${COLORS.reset}  ontology-atlas constellation ${selection.id} [vault] --offset ${selection.pagination.nextOffset} --limit ${selection.pagination.limit}\n`,
    );
  }
  if (result.relations.limited || result.outsideScopeDependencies.limited) {
    process.stdout.write(`${COLORS.dim}edge output is bounded; raise --relation-limit or --dependency-limit within their caps.${COLORS.reset}\n`);
  }
  process.stdout.write(`\n${COLORS.dim}${result.guidance}${COLORS.reset}\n`);
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, offset: 0, limit: 50, relationLimit: 100, dependencyLimit: 100, json: false };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--vault') flags.vault = parseVaultFlag(args[++index]);
    else if (arg.startsWith('--vault=')) flags.vault = parseVaultFlag(arg.slice('--vault='.length));
    else if (arg === '--offset') flags.offset = parseNonNegativeIntegerFlag('--offset', args[++index]);
    else if (arg.startsWith('--offset=')) flags.offset = parseNonNegativeIntegerFlag('--offset', arg.slice('--offset='.length));
    else if (arg === '--limit') flags.limit = parseBoundedPositiveIntegerFlag('--limit', args[++index], { max: MEMBER_LIMIT_CAP });
    else if (arg.startsWith('--limit=')) flags.limit = parseBoundedPositiveIntegerFlag('--limit', arg.slice('--limit='.length), { max: MEMBER_LIMIT_CAP });
    else if (arg === '--relation-limit') flags.relationLimit = parseBoundedPositiveIntegerFlag('--relation-limit', args[++index], { max: EDGE_LIMIT_CAP });
    else if (arg.startsWith('--relation-limit=')) flags.relationLimit = parseBoundedPositiveIntegerFlag('--relation-limit', arg.slice('--relation-limit='.length), { max: EDGE_LIMIT_CAP });
    else if (arg === '--dependency-limit') flags.dependencyLimit = parseBoundedPositiveIntegerFlag('--dependency-limit', args[++index], { max: EDGE_LIMIT_CAP });
    else if (arg.startsWith('--dependency-limit=')) flags.dependencyLimit = parseBoundedPositiveIntegerFlag('--dependency-limit', arg.slice('--dependency-limit='.length), { max: EDGE_LIMIT_CAP });
    else if (arg === '--json') flags.json = true;
    else if (arg.startsWith('-')) return { error: formatUnknownFlagError(arg, ALLOWED_FLAGS) };
    else positional.push(arg);
  }
  for (const value of Object.values(flags)) if (value instanceof Error) return { error: value.message };
  if (positional.length === 0) return { error: 'constellation id is required' };
  if (!UUID_V4_RE.test(positional[0])) return { error: 'constellation id must be a lowercase UUIDv4' };
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 1 });
  return vaultResult.error ? vaultResult : { ...flags, id: positional[0], vault: vaultResult.vault };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
    `  ontology-atlas constellation <id> [vault] [--offset N] [--limit N]\n` +
    `      [--relation-limit N] [--dependency-limit N] [--json]\n\n` +
    `Read saved scope separately from current ontology facts, review currentness, real relations, and direct dependencies.\n` +
    `Member limit range 1-${MEMBER_LIMIT_CAP}; edge limits range 1-${EDGE_LIMIT_CAP}.\n`,
  );
}
