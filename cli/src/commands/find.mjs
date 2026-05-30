import { COLORS, KIND_COLORS } from '../lib/colors.mjs';
import { readFileSync } from 'node:fs';
import { parseFrontmatter } from '../lib/parse-frontmatter.mjs';
import { validateKindValue } from '../lib/kinds.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { walkMd, pathToSlug } from '../lib/walk-vault.mjs';
import {
  formatUnknownFlagError,
  parseRequiredFlagValue,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--kind', '--json', '--vault'];



/**
 * R12 #36 — \`oh-my-ontology find <query> [vault] [--kind X] [--json]\`
 *
 * vault 의 ontology 노드 (frontmatter \`kind:\` 있는 .md) 중 slug 또는 title 에
 * query 를 부분매칭 (case-insensitive). list 와 같은 색깔 표 출력.
 */
export function runFind(args) {
  const opts = parseArgs(args);
  if (opts.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (opts.error) {
    process.stderr.write(`error  ${opts.error}\n`);
    return 1;
  }

  const { query, vaultPath, kindFilter, asJson } = opts;
  const needle = query.toLowerCase();
  const files = walkMd(vaultPath);

  const matches = [];
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

    const slug = pathToSlug(vaultPath, f);
    const title =
      (typeof frontmatter.title === 'string' && frontmatter.title) ||
      (typeof frontmatter.name === 'string' && frontmatter.name) ||
      '';

    if (
      slug.toLowerCase().includes(needle) ||
      title.toLowerCase().includes(needle)
    ) {
      matches.push({ slug, kind, title });
    }
  }

  matches.sort((a, b) =>
    a.kind === b.kind ? a.slug.localeCompare(b.slug) : a.kind.localeCompare(b.kind),
  );

  if (asJson) {
    process.stdout.write(
      JSON.stringify({ query, total: matches.length, matches }, null, 2) + '\n',
    );
    return 0;
  }

  if (matches.length === 0) {
    console.log(
      `${COLORS.dim}[oh-my-ontology] "${query}" 매칭 0 ${kindFilter ? `(kind=${kindFilter})` : ''}${COLORS.reset}`,
    );
    return 0;
  }

  console.log(
    `${COLORS.bold}"${query}"${COLORS.reset} ${COLORS.dim}— ${matches.length} 매칭${kindFilter ? ` (kind=${kindFilter})` : ''}${COLORS.reset}\n`,
  );
  for (const m of matches) {
    const color = KIND_COLORS[m.kind] || '';
    const kindCol = `${color}${m.kind.padEnd(13)}${COLORS.reset}`;
    const slugCol = highlight(m.slug, needle).padEnd(45);
    const titleCol = m.title ? highlight(m.title, needle) : COLORS.dim + '(no title)' + COLORS.reset;
    console.log(`  ${kindCol} ${slugCol} ${titleCol}`);
  }
  return 0;
}

function highlight(text, needle) {
  if (!needle) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + needle.length);
  const after = text.slice(idx + needle.length);
  return `${before}${COLORS.yellow}${match}${COLORS.reset}${after}`;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const positional = [];
  const flags = { vaultPath: null, kindFilter: null, asJson: false };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--kind') flags.kindFilter = parseRequiredFlagValue('--kind', args[++i]);
    else if (a.startsWith('--kind=')) flags.kindFilter = parseRequiredFlagValue('--kind', a.slice('--kind='.length));
    else if (a === '--json') flags.asJson = true;
    else if (a === '--vault') flags.vaultPath = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vaultPath = parseVaultFlag(a.slice('--vault='.length));
    else if (a.startsWith('-')) {
      return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    } else {
      positional.push(a);
    }
  }
  if (positional.length === 0) {
    return { error: 'query is required (e.g. `find auth`)' };
  }
  if (flags.vaultPath === false) return { error: '--vault requires a path' };
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const kindError = validateKindValue('--kind', flags.kindFilter);
  if (kindError) return { error: kindError };
  const vaultResult = resolveTrailingVaultArg({
    vault: flags.vaultPath,
    positional,
    vaultIndex: 1,
  });
  if (vaultResult.error) return vaultResult;
  return {
    query: positional[0],
    vaultPath: resolveVaultRoot(vaultResult.vault),
    kindFilter: flags.kindFilter,
    asJson: flags.asJson,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology find <query> [vault] [--kind K] [--json]\n\n` +
      `Search ontology node slugs and titles case-insensitively.\n`,
  );
}
