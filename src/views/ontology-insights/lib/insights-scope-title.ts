import type { DataSourceMode } from '@/shared/lib/data-source-mode';

/**
 * Which name the insights board gives itself.
 *
 * Measured 2026-09-04 on the bundled Online Store sample: the browser tab read
 * "My folder analysis · Ontology Atlas", and in Korean the heading and lede said
 * the same, while the INDEX panel on the map two clicks away said the sample is
 * read-only and not the person's folder. The numbers on the board are the
 * sample's, so the board has to say so; naming someone else's example as their
 * folder is the kind of small false claim that makes every other number on the
 * screen worth doubting.
 *
 * Only the sample wording is new. In `local` mode the folder wording is
 * untouched, tab title included — a person who opened their own folder is
 * reading their own folder.
 */
export interface InsightsScopeTitles {
  /** Wording used while a bundled sample is loaded. */
  sample: string;
  /** Wording used once the person's own folder is open. */
  folder: string;
}

export function selectInsightsScopeTitle(
  mode: DataSourceMode,
  titles: InsightsScopeTitles,
): string {
  return mode === 'static' ? titles.sample : titles.folder;
}

/**
 * The tab title, or `null` to leave the build-time metadata title alone.
 *
 * Static export bakes one `<title>` per route, so the sample wording can only
 * reach the tab from the client. In `local` mode nothing is overridden: that is
 * exactly what the pre-built metadata already says, and rewriting it with the
 * in-page heading would silently rename the tab for a person the copy was
 * already correct for.
 */
export function selectInsightsDocumentTitle(
  mode: DataSourceMode,
  sampleDocumentTitle: string,
): string | null {
  return mode === 'static' ? sampleDocumentTitle : null;
}
