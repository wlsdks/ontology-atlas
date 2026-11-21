// `docs-vault:build --check`: are the generated outputs on disk the ones this
// source would produce? Day stamps, revisions and `generatedAt` vary with
// history and the clock, so they are not compared.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CONTENT_OUT,
  GATEWAY_CHANGELOG_OUT,
  GATEWAY_CONTENT_OUT,
  MANIFEST_HEADINGS_OUT,
  MANIFEST_OUT,
  PUBLIC_OUT,
  ROOT,
  STOREFRONT_CONTENT_OUT,
  STOREFRONT_HEADINGS_OUT,
  STOREFRONT_MANIFEST_OUT,
} from './output-paths.mjs';
import { walk } from './vault-scan.mjs';

export function comparableManifest(manifest) {
  return {
    ...manifest,
    docs: (manifest.docs ?? []).map((doc) => ({
      ...doc,
      updatedAt: '<ignored>',
      ...('revision' in doc ? { revision: '<ignored>' } : {}),
    })),
    generatedAt: '<ignored>',
  };
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function stableStringify(value) {
  return JSON.stringify(value, null, 2);
}

export function comparableDoc(doc) {
  return {
    ...doc,
    updatedAt: '<ignored>',
  };
}

/** `missing <file>`, `stale <file>` or null for one generated JSON output; `normalize` drops fields that legitimately vary. */
export async function jsonOutputIssue(file, expected, normalize = (value) => value) {
  const current = await readJsonIfExists(file);
  if (!current) return `missing ${path.relative(ROOT, file)}`;
  if (stableStringify(normalize(current)) !== stableStringify(normalize(expected))) {
    return `stale ${path.relative(ROOT, file)}`;
  }
  return null;
}

export async function assertOutputsCurrent({
  manifest,
  headingsBySlug,
  content,
  gatewayContent,
  gatewayChangelog,
  publicFiles,
}) {
  const issues = [];
  for (const issue of [
    await jsonOutputIssue(MANIFEST_OUT, manifest, comparableManifest),
    await jsonOutputIssue(MANIFEST_HEADINGS_OUT, headingsBySlug),
    await jsonOutputIssue(GATEWAY_CHANGELOG_OUT, gatewayChangelog),
    await jsonOutputIssue(CONTENT_OUT, content),
    await jsonOutputIssue(GATEWAY_CONTENT_OUT, gatewayContent),
  ]) {
    if (issue) issues.push(issue);
  }

  const expectedPublic = new Map(publicFiles.map((file) => [file.relativePath, file.raw]));
  const currentPublicFiles = existsSync(PUBLIC_OUT)
    ? (await walk(PUBLIC_OUT, { product: false })).map((file) => path.relative(PUBLIC_OUT, file).replace(/\\/g, '/'))
    : [];
  for (const relativePath of currentPublicFiles) {
    if (relativePath.endsWith('.md') && !expectedPublic.has(relativePath)) {
      issues.push(`extra ${path.posix.join('public/docs-vault', relativePath)}`);
    }
  }
  for (const [relativePath, raw] of expectedPublic) {
    const outPath = path.join(PUBLIC_OUT, relativePath);
    try {
      const current = await readFile(outPath, 'utf8');
      if (current !== raw) {
        issues.push(`stale ${path.posix.join('public/docs-vault', relativePath)}`);
      }
    } catch (error) {
      if (error?.code === 'ENOENT') {
        issues.push(`missing ${path.posix.join('public/docs-vault', relativePath)}`);
      } else {
        throw error;
      }
    }
  }

  if (issues.length > 0) {
    console.error('[docs-vault] generated outputs are stale:');
    for (const issue of issues.slice(0, 20)) {
      console.error(`  - ${issue}`);
    }
    if (issues.length > 20) {
      console.error(`  - ... ${issues.length - 20} more`);
    }
    console.error('[docs-vault] run `pnpm docs-vault:build` to refresh them.');
    process.exit(1);
  }
}

export async function assertStorefrontOutputsCurrent({ manifest, headingsBySlug, content }) {
  const issues = [];
  for (const issue of [
    await jsonOutputIssue(STOREFRONT_MANIFEST_OUT, manifest, comparableManifest),
    await jsonOutputIssue(STOREFRONT_HEADINGS_OUT, headingsBySlug),
    await jsonOutputIssue(STOREFRONT_CONTENT_OUT, content),
  ]) {
    if (issue) issues.push(issue);
  }
  if (issues.length > 0) {
    console.error('[docs-vault] storefront sample outputs are stale:');
    for (const issue of issues) console.error(`  - ${issue}`);
    console.error('[docs-vault] run `pnpm docs-vault:build` to refresh them.');
    process.exit(1);
  }
}
