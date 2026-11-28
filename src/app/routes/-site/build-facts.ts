import { loadWorkbenchCatalog } from '@/i18n/workbench-catalog';
import { GATEWAY_MESSAGE_PATHS, pickMessagePaths } from '@/i18n/gateway-messages';
import type { AppLocale } from '@/i18n/locales';
import { loadChangelogDocument, type GatewayDocument } from '@/views/gateway-doc';
import type { SampleCensus } from '@/views/sample-map';

import type { MessageTree } from './screen-metadata';

/** The sources that date a public page: the committer days of its words, from Git, or nothing. */
export interface SourceDates {
  modified?: string;
  published?: string;
}

/**
 * What only the build machine can answer about a public page: the words each page reads, the Git dates of
 * its source and the sample's size. The prerender answers from Node and records each answer; the page
 * carries the record, so its first browser render asks the same questions and gets the same answers. In
 * `pnpm dev` and the installed app no one recorded anything: dates are absent, the page reads the whole
 * catalogue and the changelog arrives as its own file.
 */
export interface BuildFacts {
  siteMessages(locale: AppLocale): Promise<MessageTree>;
  sourceDates(sourcePath: string, publishedPath?: string): Promise<SourceDates>;
  sampleCensus(locale: AppLocale): Promise<SampleCensus | undefined>;
  /** The changelog as the build bundled it: the recent sections, and how many older ones were folded away. */
  changelog(): Promise<GatewayDocument>;
}

/** The recorded answers, keyed by question; this is what the page carries. */
export type RecordedFacts = Record<string, unknown>;

/** What public pages read: the gateway's namespaces, the metadata every page states in its head, and the skip link's. */
export const SITE_MESSAGE_PATHS = [...GATEWAY_MESSAGE_PATHS, 'metadata', 'nav'] as const;

export const factKey = (question: string, ...argumentsOfQuestion: string[]) => [question, ...argumentsOfQuestion].join('\u0000');

/** Answers from a record; a question the record lacks is answered as `pnpm dev` does. */
export function replayBuildFacts(recorded: RecordedFacts): BuildFacts {
  return {
    async siteMessages(locale) {
      const recordedMessages = recorded[factKey('siteMessages', locale)] as MessageTree | undefined;
      return recordedMessages ?? pickMessagePaths(await loadWorkbenchCatalog(locale), SITE_MESSAGE_PATHS);
    },
    async sourceDates(sourcePath, publishedPath = sourcePath) {
      return (recorded[factKey('sourceDates', sourcePath, publishedPath)] as SourceDates | undefined) ?? {};
    },
    async sampleCensus(locale) {
      return recorded[factKey('sampleCensus', locale)] as SampleCensus | undefined;
    },
    async changelog() {
      // Where nothing was recorded (the installed app, `pnpm dev`) the composed changelog the prerender
      // records is fetched from the same file.
      return (recorded[factKey('changelog')] as GatewayDocument | undefined) ?? loadChangelogDocument();
    },
  };
}
