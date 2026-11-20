import {
  loadStaticVaultHeadings,
  type DocumentRef,
  type StaticVaultHeadings,
  type StaticVaultSource,
  type VaultDocDetail,
} from '@/entities/docs-vault';

const NO_HEADINGS: StaticVaultHeadings = {};

/**
 * A bundled sample carries its detail in its JSON and its headings in a lazy chunk: nothing is
 * derived. Without `headings` the chunk (460 KB for the dogfood sample) is never fetched, and the
 * answers' headings are empty; the hooks type them away so no surface can read them.
 */
export function createBundledDetailReader(sample: StaticVaultSource, { headings }: { headings: boolean }) {
  let headingsChunk: Promise<StaticVaultHeadings> | null = null;
  return async (docs: readonly DocumentRef[]): Promise<(VaultDocDetail | null)[]> => {
    if (headings) headingsChunk ??= loadStaticVaultHeadings(sample.source).catch(() => NO_HEADINGS);
    const headingsBySlug = headingsChunk ? await headingsChunk : NO_HEADINGS;
    const held = bundledDocsBySlug(sample);
    return docs.map((doc) => {
      const bundled = held.get(doc.slug);
      return bundled
        ? { headings: headingsBySlug[doc.slug] ?? [], excerpt: bundled.excerpt, wordCount: bundled.wordCount }
        : null;
    });
  };
}

const docsBySample = new WeakMap<StaticVaultSource, Map<string, StaticVaultSource['manifest']['docs'][number]>>();

export function bundledDocsBySlug(sample: StaticVaultSource) {
  let bySlug = docsBySample.get(sample);
  if (!bySlug) {
    bySlug = new Map(sample.manifest.docs.map((doc) => [doc.slug, doc]));
    docsBySample.set(sample, bySlug);
  }
  return bySlug;
}
