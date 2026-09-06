// `ontology-atlas wiki-index [vault] [--json] [--write]`
//
// The wiki's index, computed. The LLM Wiki pattern keeps an `index.md` the model
// maintains; a maintained list drifts, and a page renamed by a person leaves a stale
// row. This one is read from the pages every time it is asked for: title, summary,
// status, writer, the sources a page was compiled from, the pages it links and the
// pages that link it, and any problem `wiki-validate` would report. Markdown to stdout
// for a person or an agent at the terminal; `--json` for a program; `--write` to leave
// `wiki/_index.md` in the folder for an editor that shows files — generated, marked so,
// and furniture by the underscore rule, never a page and never a second truth.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { COLORS } from '../lib/colors.mjs';
import { parseFrontmatter } from '../lib/parse-frontmatter.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { walkMd } from '../lib/walk-vault.mjs';
import { WIKI_DIR, isWikiFurnitureSlug, validateWikiPage, validateWikiFolder } from '../lib/wiki-schema.mjs';
import {
  formatUnknownFlagError,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--json', '--write'];
const INDEX_FILE = '_index.md';

function printUsage(stream = process.stderr) {
  stream.write(
    [
      `${COLORS.bold}ontology-atlas wiki-index${COLORS.reset}`,
      '',
      'Usage:',
      '  ontology-atlas wiki-index [vault] [--vault <path>] [--json] [--write]',
      '',
      '  Lists every page under wiki/ with its title, summary, status, writer, sources,',
      '  links in and out, and the problems wiki-validate would report. Computed from the',
      '  pages each time; nothing is maintained by hand or by a model.',
      '',
      '  --json    the same as data.',
      `  --write   also leave wiki/${INDEX_FILE} in the folder — generated, marked as such,`,
      '            skipped by every validator and list. Rerun to refresh; never edit it.',
      '',
      '  Exit 0  the index was produced (a folder with no wiki pages is an empty index).',
      '  Exit 2  the vault could not be read.',
      '',
    ].join('\n'),
  );
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, write: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--write') flags.write = true;
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { vault: vaultResult.vault, json: flags.json, write: flags.write };
}

function listSources(vaultRoot) {
  const out = new Set();
  const stack = [{ dir: join(vaultRoot, 'sources'), prefix: 'sources' }];
  while (stack.length > 0) {
    const { dir, prefix } = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const rel = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) stack.push({ dir: join(dir, entry.name), prefix: rel });
      else if (entry.isFile()) out.add(rel);
    }
  }
  return out;
}

function stringList(value) {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string').map((v) => v.trim());
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

/** `[[wiki/<slug>]]`, `[[<slug>]]`, with `|text` or `#anchor`; a `src:` citation is not a link. */
function pageLinks(body) {
  const out = new Set();
  const regex = /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
  let match;
  while ((match = regex.exec(body)) !== null) {
    let target = match[1].trim().replace(/\.md$/, '');
    if (!target || target.startsWith('src:')) continue;
    if (!target.includes('/')) target = `${WIKI_DIR}/${target}`;
    out.add(target);
  }
  return [...out].sort();
}

/**
 * The index as data. Pure apart from reading the folder: every row is derived from a
 * page's own frontmatter and body, and the problems from the two validators.
 */
export function buildWikiIndex(vaultRoot) {
  const files = walkMd(vaultRoot)
    .filter((file) => {
      const rel = relative(vaultRoot, file);
      return rel.startsWith(`${WIKI_DIR}/`) && !isWikiFurnitureSlug(rel);
    })
    .sort();
  const knownSources = listSources(vaultRoot);
  const pages = files.map((file) => {
    const path = relative(vaultRoot, file);
    const raw = readFileSync(file, 'utf8');
    const { frontmatter, body } = parseFrontmatter(raw);
    const slug = path.replace(/\.md$/, '');
    return {
      path,
      slug,
      raw,
      title: typeof frontmatter.title === 'string' ? frontmatter.title.trim() : slug.slice(slug.lastIndexOf('/') + 1),
      summary: typeof frontmatter.summary === 'string' ? frontmatter.summary.trim() : '',
      status: typeof frontmatter.status === 'string' ? frontmatter.status.trim() : '',
      createdBy: typeof frontmatter.created_by === 'string' ? frontmatter.created_by.trim() : '',
      compiledAt: typeof frontmatter.compiled_at === 'string' ? frontmatter.compiled_at.trim() : '',
      sources: stringList(frontmatter.sources),
      linksOut: pageLinks(body),
      problems: validateWikiPage(raw, { knownSources }).problems.map((p) => p.code),
    };
  });
  const folder = new Map(validateWikiFolder(pages.map((p) => ({ path: p.path, raw: p.raw }))).map((e) => [e.path, e.problems.map((p) => p.code)]));
  const inbound = new Map(pages.map((p) => [p.slug, []]));
  for (const page of pages) {
    for (const target of page.linksOut) inbound.get(target)?.push(page.slug);
  }
  return {
    vault: vaultRoot,
    pageCount: pages.length,
    pages: pages.map(({ raw: _raw, ...page }) => ({
      ...page,
      linksIn: [...(inbound.get(page.slug) ?? [])].sort(),
      problems: [...page.problems, ...(folder.get(page.path) ?? [])],
    })),
  };
}

/** The index as Markdown: what a person reads at the terminal, and what `--write` leaves. */
export function renderWikiIndex(index, { generatedAt } = {}) {
  const lines = [];
  if (generatedAt) {
    lines.push('---', 'title: Wiki index', `generated_at: ${generatedAt}`, '---', '');
    lines.push('# Wiki index', '', `Generated by \`ontology-atlas wiki-index --write\`; rerun to refresh, never edit. Not a page. ${index.pageCount} pages.`, '');
  } else {
    lines.push(`# Wiki index — ${index.pageCount} pages`, '');
  }
  for (const page of index.pages) {
    const flags = page.problems.length > 0 ? ` — ${page.problems.join(', ')}` : '';
    lines.push(`## [[${page.slug}|${page.title}]]${flags}`);
    if (page.summary) lines.push(page.summary);
    const meta = [page.status, page.createdBy, page.compiledAt].filter(Boolean).join(' · ');
    if (meta) lines.push(`- ${meta}`);
    if (page.sources.length > 0) lines.push(`- sources: ${page.sources.join(', ')}`);
    if (page.linksOut.length > 0) lines.push(`- links to: ${page.linksOut.map((s) => `[[${s}]]`).join(' ')}`);
    if (page.linksIn.length > 0) lines.push(`- linked from: ${page.linksIn.map((s) => `[[${s}]]`).join(' ')}`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export async function runWikiIndex(args) {
  const { vault, json, write, help, error } = parseArgs(args);
  if (help) {
    printUsage(process.stdout);
    return 0;
  }
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 2;
  }
  let index;
  try {
    index = buildWikiIndex(resolveVaultRoot(vault));
  } catch (err) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }
  if (write) {
    const target = join(index.vault, WIKI_DIR, INDEX_FILE);
    writeFileSync(target, renderWikiIndex(index, { generatedAt: new Date().toISOString() }));
    process.stderr.write(`${COLORS.dim}wrote ${relative(index.vault, target)}${COLORS.reset}\n`);
  }
  process.stdout.write(json ? `${JSON.stringify(index, null, 2)}\n` : renderWikiIndex(index));
  return 0;
}
