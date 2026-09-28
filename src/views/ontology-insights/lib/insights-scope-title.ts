import type { DataSourceMode } from '@/shared/lib/data-source-mode';

/**
 * Which name the insights board gives itself. On a bundled sample the board names the sample, since its numbers
 * are the sample's; in `local` mode the folder wording, tab title included, is untouched.
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
 * The tab title, or `null` to keep the build-time title. Static export bakes one `<title>` per route, so the
 * sample wording reaches the tab only from the client; `local` mode already has the right one.
 */
export function selectInsightsDocumentTitle(
  mode: DataSourceMode,
  sampleDocumentTitle: string,
): string | null {
  return mode === 'static' ? sampleDocumentTitle : null;
}
