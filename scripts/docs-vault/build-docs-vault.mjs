#!/usr/bin/env node
// Docs vault build-time manifest generator. Scans docs/**/*.md and emits:
//  1. raw copies at public/docs-vault/{slug}.md
//  2. src/entities/docs-vault/data/manifest.json — tree, docs, backlinks, tags
//     (headings are split into manifest.headings.json for bundle size — only
//     `/docs` imports them dynamically)
//  3. src/entities/docs-vault/data/content.json — desktop/static-export fallback
//  4. src/entities/docs-vault/data/gateway-content.json — the gateway's synchronous guide/* fallback
//  5. src/entities/docs-vault/data/gateway-changelog.json — /changelog's
//     synchronous preview (recent sections + how many were folded)
// Runs as the `predev` step and at the start of `pnpm build`. No runtime dependencies.

import { readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertOutputsCurrent, assertStorefrontOutputsCurrent } from './generator/freshness-check.mjs';
import {
  DOCS_DIR,
  GATEWAY_CHANGELOG_KEEP_SECTIONS,
  GATEWAY_CHANGELOG_OUT,
  GATEWAY_CONTENT_OUT,
  CONTENT_OUT,
  MANIFEST_HEADINGS_OUT,
  MANIFEST_OUT,
  PUBLIC_OUT,
  ROOT,
  SAMPLES_STOREFRONT_DIR,
  STOREFRONT_CONTENT_OUT,
  STOREFRONT_HEADINGS_OUT,
  STOREFRONT_MANIFEST_OUT,
} from './generator/output-paths.mjs';
import { movedSlugAliases, splitManifestHeadings, trimToRecentSections } from './generator/shipped-shape.mjs';
import { ensureDir, scanVaultDir } from './generator/vault-scan.mjs';

// The build's parts live in ./generator/; these names stay importable from this entry.
export { comparableDoc, comparableManifest } from './generator/freshness-check.mjs';
export { documentRevision, isShallowRepository, localDayStamp } from './generator/git-history.mjs';
export { extractOutLinksWithContext, resolveWikilinkTargetSlug } from './generator/markdown-fields.mjs';
export { GATEWAY_CHANGELOG_KEEP_SECTIONS } from './generator/output-paths.mjs';
export { movedSlugAliases, splitManifestHeadings, trimToRecentSections } from './generator/shipped-shape.mjs';
export { deterministicGeneratedAt, scanVaultDir } from './generator/vault-scan.mjs';

export function usage() {
  return [
    'Usage: node scripts/docs-vault/build-docs-vault.mjs [--check]',
    '',
    'Builds the static docs-vault manifest and public markdown copies.',
    '',
    'Options:',
    '  --check     Verify generated outputs are current without writing.',
    '  -h, --help  Show this help text.',
  ].join('\n');
}

export function parseArgs(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }
  if (argv.length > 1) {
    return { error: `Unexpected argument: ${argv[1]}` };
  }
  if (argv[0] && argv[0] !== '--check') {
    return { error: `Unknown option: ${argv[0]}` };
  }
  return { check: argv[0] === '--check' };
}

async function buildDocsVault({ check = false } = {}) {
  if (!existsSync(DOCS_DIR)) {
    console.error(`[docs-vault] no docs/ directory: ${DOCS_DIR}`);
    process.exit(1);
  }

  if (!check) {
    // Empty public/docs-vault first so deleted documents cannot linger
    if (existsSync(PUBLIC_OUT)) {
      await rm(PUBLIC_OUT, { recursive: true, force: true });
    }
    await ensureDir(PUBLIC_OUT);
    await ensureDir(path.dirname(MANIFEST_OUT));
  }

  const movedFile = path.join(DOCS_DIR, '.moved.json');
  const movedMap = existsSync(movedFile) ? JSON.parse(await readFile(movedFile, 'utf8')) : {};
  const scanned = await scanVaultDir(DOCS_DIR, {
    rootDir: ROOT,
    publicOutDir: PUBLIC_OUT,
    check,
    vaultSlugPrefix: 'ontology/',
    movedFrom: Object.fromEntries(Object.entries(movedMap).map(([from, to]) => [to, from])),
  });
  const { content, gatewayContent, publicFiles } = scanned;
  // The bundled manifest ships with headings split into a separate file — see the
  // MANIFEST_HEADINGS_OUT comment at the top of this file.
  const split = splitManifestHeadings(scanned.manifest);
  const { headingsBySlug } = split;
  const aliases = movedSlugAliases(movedMap, new Set(split.manifest.docs.map((doc) => doc.slug)));
  const manifest = Object.keys(aliases).length > 0 ? { ...split.manifest, aliases } : split.manifest;
  const { docs, backlinksDetail, tags } = manifest;
  const changelogRaw = content['CHANGELOG'];
  if (typeof changelogRaw !== 'string') {
    console.error('[docs-vault] docs/CHANGELOG.md is not in the scan: the gateway preview cannot be built.');
    process.exit(1);
  }
  const gatewayChangelog = trimToRecentSections(
    changelogRaw,
    GATEWAY_CHANGELOG_KEEP_SECTIONS,
  );

  if (check) {
    await assertOutputsCurrent({
      manifest,
      headingsBySlug,
      content,
      gatewayContent,
      gatewayChangelog,
      publicFiles,
    });
    console.log(
      `[docs-vault] current · ${docs.length} docs · ${Object.keys(backlinksDetail).length} backlinked · ${Object.keys(tags).length} tags`,
    );
    return;
  }

  await writeFile(MANIFEST_OUT, JSON.stringify(manifest, null, 2), 'utf8');
  await writeFile(MANIFEST_HEADINGS_OUT, JSON.stringify(headingsBySlug, null, 2), 'utf8');
  await writeFile(CONTENT_OUT, JSON.stringify(content, null, 2), 'utf8');
  await writeFile(GATEWAY_CONTENT_OUT, JSON.stringify(gatewayContent, null, 2), 'utf8');
  await writeFile(GATEWAY_CHANGELOG_OUT, JSON.stringify(gatewayChangelog, null, 2), 'utf8');
  console.log(
    `[docs-vault] ${docs.length} docs · ${Object.keys(backlinksDetail).length} backlinked · ${Object.keys(tags).length} tags → ${path.relative(ROOT, MANIFEST_OUT)}`,
  );
}

/** Builds the storefront sample vault: only its own manifest/content pair, no public raw copies and no PUBLIC_OUT reset. */
async function buildStorefrontSample({ check = false } = {}) {
  if (!existsSync(SAMPLES_STOREFRONT_DIR)) {
    console.error(`[docs-vault] no samples/storefront/ directory: ${SAMPLES_STOREFRONT_DIR}`);
    process.exit(1);
  }

  if (!check) {
    await ensureDir(path.dirname(STOREFRONT_MANIFEST_OUT));
  }

  const scanned = await scanVaultDir(SAMPLES_STOREFRONT_DIR, {
    rootDir: ROOT,
    publicOutDir: null,
    check,
    treeName: 'storefront',
  });
  const { content } = scanned;
  const { manifest, headingsBySlug } = splitManifestHeadings(scanned.manifest);

  if (check) {
    await assertStorefrontOutputsCurrent({ manifest, headingsBySlug, content });
    console.log(`[docs-vault] storefront sample current · ${manifest.docs.length} docs`);
    return;
  }

  await writeFile(STOREFRONT_MANIFEST_OUT, JSON.stringify(manifest, null, 2), 'utf8');
  await writeFile(STOREFRONT_HEADINGS_OUT, JSON.stringify(headingsBySlug, null, 2), 'utf8');
  await writeFile(STOREFRONT_CONTENT_OUT, JSON.stringify(content, null, 2), 'utf8');
  console.log(
    `[docs-vault] storefront sample ${manifest.docs.length} docs → ${path.relative(ROOT, STOREFRONT_MANIFEST_OUT)}`,
  );
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.error) {
    console.error(args.error);
    console.error(usage());
    process.exit(2);
  }
  await buildDocsVault({ check: args.check });
  await buildStorefrontSample({ check: args.check });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[docs-vault] build failed:', error);
    process.exit(1);
  });
}
