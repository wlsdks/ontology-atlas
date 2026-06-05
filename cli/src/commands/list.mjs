import { COLORS, KIND_COLORS } from '../lib/colors.mjs';
import { readFileSync } from 'node:fs';
import { parseFrontmatter } from '../lib/parse-frontmatter.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { validateKindValue } from '../lib/kinds.mjs';
import { walkMd, pathToSlug } from '../lib/walk-vault.mjs';
import {
  formatUnknownFlagError,
  parseRequiredFlagValue,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--kind', '--json'];



/**
 * R11 #32 — \`ontology-atlas list [vault]\`
 *
 * vault 의 ontology 노드 (frontmatter `kind:` 있는 .md) 를 표 형태로 출력.
 * --kind <kind> 필터, --json 머신 가독 출력.
 */
export function runList(args) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${parsed.error}\n`);
    return 1;
  }
  const vaultPath = resolveVaultRoot(parsed.vault);
  const { kindFilter, asJson } = parsed;

  const files = walkMd(vaultPath);
  const nodes = [];
  for (const f of files) {
    let raw;
    try {
      raw = readFileSync(f, 'utf-8');
    } catch {
      continue;
    }
    const { frontmatter } = parseFrontmatter(raw);
    const kind = typeof frontmatter.kind === 'string' ? frontmatter.kind : null;
    if (!kind) continue;
    if (kindFilter && kind !== kindFilter) continue;
    nodes.push({
      slug: pathToSlug(vaultPath, f),
      kind,
      title:
        (typeof frontmatter.title === 'string' && frontmatter.title) ||
        (typeof frontmatter.name === 'string' && frontmatter.name) ||
        '',
      domain:
        typeof frontmatter.domain === 'string' ? frontmatter.domain : '',
    });
  }
  nodes.sort((a, b) =>
    a.kind === b.kind ? a.slug.localeCompare(b.slug) : a.kind.localeCompare(b.kind),
  );

  if (asJson) {
    process.stdout.write(
      JSON.stringify({ vaultPath, total: nodes.length, nodes }, null, 2) + '\n',
    );
    return 0;
  }

  if (nodes.length === 0) {
    console.log(
      `${COLORS.dim}[ontology-atlas] ${vaultPath} 에서 ontology 노드 0 — vault 가 비었거나 frontmatter \`kind:\` 가 없는 듯.${COLORS.reset}`,
    );
    return 0;
  }

  console.log(
    `${COLORS.bold}${vaultPath}${COLORS.reset} ${COLORS.dim}— ${nodes.length} ontology 노드${kindFilter ? ` (kind=${kindFilter})` : ''}${COLORS.reset}\n`,
  );
  for (const n of nodes) {
    const color = KIND_COLORS[n.kind] || '';
    const kindCol = `${color}${n.kind.padEnd(13)}${COLORS.reset}`;
    const slugCol = n.slug.padEnd(45);
    const titleCol = n.title || COLORS.dim + '(no title)' + COLORS.reset;
    console.log(`  ${kindCol} ${slugCol} ${titleCol}`);
  }
  return 0;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, kindFilter: null, asJson: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--kind') flags.kindFilter = parseRequiredFlagValue('--kind', args[++i]);
    else if (a.startsWith('--kind=')) flags.kindFilter = parseRequiredFlagValue('--kind', a.slice('--kind='.length));
    else if (a === '--json') flags.asJson = true;
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const kindError = validateKindValue('--kind', flags.kindFilter);
  if (kindError) return { error: kindError };
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { vault: vaultResult.vault, kindFilter: flags.kindFilter, asJson: flags.asJson };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas list [vault] [--kind K] [--json]\n\n` +
      `List ontology nodes with frontmatter kind values.\n`,
  );
}
