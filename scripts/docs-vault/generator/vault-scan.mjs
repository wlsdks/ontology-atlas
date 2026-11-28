// Scans one vault directory (docs/ or samples/storefront/) into the manifest and
// content a build ships: which Markdown files count, each document's entry,
// and the tree they sit in.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { importTypeScriptModule } from '../../lib/import-typescript-module.mjs';
import { parseFrontmatter } from '../../lib/parse-frontmatter.mjs';
import { readPoPilotSource } from '../../lib/records/po-pilot-records.mjs';
import { readLedgerSource } from '../../lib/records/record-ledgers.mjs';
import { groupBacklinksBySource, addFrontmatterRelationBacklinks } from './backlinks.mjs';
import { gitLastCommitDays, documentRevision, latestInputDay } from './git-history.mjs';
import {
  buildDefinitionPreview,
  buildExcerpt,
  extractHeadings,
  extractOutLinksWithContext,
  firstHeading,
  slugFromPath,
} from './markdown-fields.mjs';
import { ROOT } from './output-paths.mjs';

// Directories under docs/ that must not ship. `analyses/` and `records/` are this repository's own
// committed working output; bundling them would grow the shipped app against a static budget.
// Skipped at any depth.
const NOT_PRODUCT_DOCS = new Set(['analyses', 'records']);

// Top-level docs/ folders that stay in the repository but leave the app: dated
// evidence (`archive`, `audits`, `benchmark`), superseded drafts (`prototypes`),
// plans and marketing copy (`plans`, `launch`). A reader of the in-app Library
// wants the current product documents; these cost about a fifth of the bundled
// manifest. A link to one of them still works in the app, because an unknown
// slug resolves to its GitHub page (`src/widgets/docs-vault/lib/resolve-doc-link.ts`).
const NOT_SHIPPED_TOP_DIRS = new Set(['archive', 'audits', 'benchmark', 'plans', 'prototypes', 'launch']);

// `product: false` lists every Markdown file under `dir` with no exclusion; the
// staleness check uses it on the public output so a leftover file is reported.
export async function walk(directory, { root = directory, product = true } = {}) {
  const out = [];
  // Sorted by name: readdir order is not guaranteed, and an unsorted walk would make key order
  // machine-dependent, so "same source, same bytes" could report stale.
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  const atRoot = directory === root;
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (product && entry.isDirectory() && NOT_PRODUCT_DOCS.has(entry.name)) {
      // The recording guide is linked by composed ledgers; fragments are consumed there.
      const guide = path.join(directory, entry.name, 'README.md');
      if (entry.name === 'records' && existsSync(guide)) out.push(guide);
      continue;
    }
    if (product && atRoot && entry.isDirectory() && NOT_SHIPPED_TOP_DIRS.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await walk(full, { root, product });
      out.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

function insertIntoTree(root, slug, title) {
  const parts = slug.split('/');
  let node = root;
  for (let i = 0; i < parts.length; i += 1) {
    const name = parts[i];
    const isLeaf = i === parts.length - 1;
    if (!node.children) node.children = [];
    let child = node.children.find((c) => c.name === name);
    if (!child) {
      child = {
        name,
        path: parts.slice(0, i + 1).join('/'),
        type: isLeaf ? 'doc' : 'dir',
      };
      if (isLeaf) {
        child.slug = slug;
        child.title = title;
      }
      node.children.push(child);
    } else if (isLeaf && !child.slug) {
      child.type = 'doc';
      child.slug = slug;
      child.title = title;
    }
    node = child;
  }
}

function sortTree(node) {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });
  for (const c of node.children) sortTree(c);
}

export async function ensureDir(directory) {
  if (!existsSync(directory)) await mkdir(directory, { recursive: true });
}

// The stamp is the most recent `updatedAt` date among source documents, never the build wall clock
// (two open PRs would always conflict on the third line). Fixed fallback when no document has a date.
const STABLE_GENERATED_AT_FALLBACK = '1970-01-01';
export function deterministicGeneratedAt(docs) {
  const days = (docs ?? [])
    .map((doc) => doc?.updatedAt)
    .filter((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
  if (days.length === 0) return STABLE_GENERATED_AT_FALLBACK;
  return days.reduce((a, b) => (a >= b ? a : b));
}

/**
 * The app's meaning judgements, loaded if this checkout has them: they are imported rather than
 * retyped, so the static manifest and the app's builder share one rule. The import is dynamic and
 * optional because the `prepare` hook copies the build alone into a bare worktree (no `src/`),
 * where a static import is a module-resolution crash.
 */
const meaningRules = await (async () => {
  try {
    return await importTypeScriptModule(
      new URL('../../../src/shared/lib/vault-document/meaning-findings.ts', import.meta.url),
    );
  } catch {
    return null;
  }
})();

if (!meaningRules) {
  console.warn(
    '[docs-vault] src/shared/lib/vault-document is not in this checkout: meaning findings are recorded as null (not computed), not as an empty list.',
  );
}

/**
 * The meaning findings for one document, as portable codes: `undefined` (no `kind:`, never a node),
 * `null` (a node, rule unavailable, nothing measured), or an array (the rule ran; empty means nothing found).
 * `folder-only-evidence` is absent: it asks the filesystem whether a cited path is a directory,
 * which this module cannot.
 */
function meaningFindingCodes({ kind, slug, title, body }) {
  if (typeof kind !== 'string' || !kind.trim()) return undefined;
  if (!meaningRules) return null;
  return meaningRules
    .meaningFindings({ kind, slug: slug ?? '', title: title ?? '', body: body ?? '' })
    .map((finding) => finding.code);
}

/**
 * Shared core that scans one vault directory (docs/ or samples/storefront/) and assembles manifest /
 * content / publicFiles. With `publicOutDir` given and `check` false, raw md is copied beneath it
 * (storefront passes `null`). Exported because the determinism contract test passes a temporary git
 * repository as `rootDir`/`dir` to prove that rewriting commit times within the same day yields
 * byte-identical output (`check: true` writes nothing).
 */
export async function scanVaultDir(
  directory,
  {
    rootDir = ROOT,
    publicOutDir = null,
    check = false,
    treeName = 'docs',
    sourceReaders = [readLedgerSource, readPoPilotSource],
    /** The part of a manifest slug outside the vault the agent is handed: an ontology node reads `ontology/capabilities/…` here and `capabilities/…` there, and `slug-outside-kind-folder` needs the latter (the subtraction `StaticVaultSource.agentSlugPrefix` makes). */
    vaultSlugPrefix = '',
    /** `{ newRepoPath: oldRepoPath }` from `docs/.moved.json`, so a revision count survives a move. */
    movedFrom = {},
  } = {},
) {
  const files = await walk(directory);
  const gitDays = gitLastCommitDays(rootDir, directory);
  const docs = [];
  const publicFiles = [];
  const content = {};
  const backlinksDetailMap = new Map(); // slug -> Array<{ fromSlug, context, linkText }>
  const tagsMap = new Map(); // tag -> Set<slug>

  for (const full of files) {
    const relPath = path.relative(rootDir, full).replace(/\\/g, '/');
    let composed = null;
    for (const reader of sourceReaders) {
      composed = reader(relPath, { root: rootDir });
      if (composed) break;
    }
    const raw = composed?.content ?? await readFile(full, 'utf8');
    const slug = slugFromPath(full, directory);
    const { frontmatter, body, diagnostics } = parseFrontmatter(raw);
    const headings = extractHeadings(body);
    const title =
      (typeof frontmatter.title === 'string' && frontmatter.title) ||
      firstHeading(body) ||
      slug.split('/').pop();
    const description =
      typeof frontmatter.description === 'string'
        ? frontmatter.description
        : undefined;
    const tags = Array.isArray(frontmatter.tags)
      ? frontmatter.tags
      : typeof frontmatter.tags === 'string'
        ? frontmatter.tags.split(/\s+/).filter(Boolean)
        : [];
    const { slugs: linksOut, contexts: linkContexts } =
      extractOutLinksWithContext(body, slug);
    for (const ctx of linkContexts) {
      if (!backlinksDetailMap.has(ctx.target)) {
        backlinksDetailMap.set(ctx.target, []);
      }
      backlinksDetailMap.get(ctx.target).push({
        fromSlug: slug,
        context: ctx.context,
        linkText: ctx.linkText,
      });
    }
    for (const tag of tags) {
      if (!tagsMap.has(tag)) tagsMap.set(tag, new Set());
      tagsMap.get(tag).add(slug);
    }
    const inputPaths = composed?.inputs ?? [relPath];
    const updatedAt = await latestInputDay(inputPaths, rootDir, gitDays);
    // A composed ledger has many inputs and no single history; it carries no revision.
    const revision = composed ? null : documentRevision(relPath, gitDays, movedFrom);
    // Asked where the body is already in hand, exactly as `buildMdEntry` does it.
    const vaultSlug =
      vaultSlugPrefix && slug.startsWith(vaultSlugPrefix)
        ? slug.slice(vaultSlugPrefix.length)
        : slug;
    const meaningCodes = meaningFindingCodes({
      kind: frontmatter.kind,
      slug: vaultSlug,
      title,
      body,
    });
    const nextDoc = {
      slug,
      path: relPath,
      title,
      description,
      tags,
      frontmatter,
      ...(diagnostics && diagnostics.length > 0 ? { diagnostics } : {}),
      headings,
      excerpt: buildExcerpt(body),
      definitionPreview: buildDefinitionPreview(body, frontmatter),
      // `null` is recorded, not dropped: "nobody asked" and "asked and clean" must not
      // read the same downstream.
      ...(meaningCodes === undefined ? {} : { meaningFindings: meaningCodes }),
      wordCount: body.split(/\s+/).filter(Boolean).length,
      // Commit date wins; the mtime date is used only for documents that are dirty in
      // the working tree or still untracked. Both are dates, so the value is stable as
      // long as the edit and its merge land on the same day.
      updatedAt: updatedAt ?? STABLE_GENERATED_AT_FALLBACK,
      ...(revision ? { revision } : {}),
      linksOut,
    };
    // Nothing is carried over from the previous manifest: output depending on its own earlier output
    // breaks "same input, same bytes". Date precision already absorbs mtime jitter.
    docs.push(nextDoc);

    publicFiles.push({ relativePath: `${slug}.md`, raw });
    content[slug] = raw;

    if (!check && publicOutDir) {
      const outPath = path.join(publicOutDir, `${slug}.md`);
      await ensureDir(path.dirname(outPath));
      await writeFile(outPath, raw, 'utf8');
    }
  }

  addFrontmatterRelationBacklinks(docs, backlinksDetailMap);

  docs.sort((a, b) => a.slug.localeCompare(b.slug, 'ko'));

  const tree = { name: treeName, path: '', type: 'dir' };
  for (const doc of docs) insertIntoTree(tree, doc.slug, doc.title);
  sortTree(tree);

  const backlinksDetail = groupBacklinksBySource(backlinksDetailMap);
  const tags = {};
  for (const [tag, set] of tagsMap) {
    tags[tag] = [...set].sort();
  }

  const manifest = {
    version: '2026-04-23',
    // Never the build wall clock and never the previous output (see `deterministicGeneratedAt`).
    generatedAt: deterministicGeneratedAt(docs),
    docs,
    backlinksDetail,
    tags,
    tree,
  };

  // The CHANGELOG ships as the gateway-changelog.json preview rather than in full —
  // see GATEWAY_CHANGELOG_KEEP_SECTIONS in output-paths.mjs.
  const gatewayContent = Object.fromEntries(
    Object.entries(content).filter(([slug]) => slug.startsWith('guide/')),
  );

  return { manifest, content, gatewayContent, publicFiles };
}
