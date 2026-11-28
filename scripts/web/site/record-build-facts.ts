import { loadWorkbenchCatalog } from '@/i18n/workbench-catalog';
import { pickMessagePaths } from '@/i18n/gateway-messages';
import { firstCommitDateAsync, lastCommitDateAsync } from '@/shared/lib/public-pages/source-dates';
import { readGatewayDocument, readSampleCensus } from '@/views/build-time-readers';

import {
  factKey,
  SITE_MESSAGE_PATHS,
  type BuildFacts,
  type RecordedFacts,
} from '../../../src/app/routes/-site/build-facts';

/**
 * Answers the questions only this machine can (Git dates, the sample's size, the words a page reads) and
 * keeps each answer by its question, so the page it is written into can replay them in the browser.
 * One recorder per page: a page carries what it asked and nothing else.
 */
export function recordBuildFacts(): { facts: BuildFacts; recorded: RecordedFacts } {
  const recorded: RecordedFacts = {};
  const keep = <Answer>(key: string, answer: Answer): Answer => {
    recorded[key] = answer;
    return answer;
  };
  const facts: BuildFacts = {
    async siteMessages(locale) {
      return keep(factKey('siteMessages', locale), pickMessagePaths(await loadWorkbenchCatalog(locale), SITE_MESSAGE_PATHS));
    },
    async sourceDates(sourcePath, publishedPath = sourcePath) {
      const [modified, published] = await Promise.all([lastCommitDateAsync([sourcePath]), firstCommitDateAsync(publishedPath)]);
      return keep(factKey('sourceDates', sourcePath, publishedPath), {
        ...(modified ? { modified } : {}),
        ...(published ? { published } : {}),
      });
    },
    async sampleCensus(locale) {
      return keep(factKey('sampleCensus', locale), readSampleCensus(locale));
    },
    async changelog() {
      return keep(factKey('changelog'), readGatewayDocument('CHANGELOG'));
    },
  };
  return { facts, recorded };
}
