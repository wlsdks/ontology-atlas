import { loadGatewayChangelog } from '@/entities/docs-vault';

import type { GatewayDocument } from './read-vault-doc';

/**
 * The changelog as the Docs Vault composed it, fetched when a screen asks. The website's prerender answers the same
 * question from the same file and records the answer; where nothing was recorded, as in the installed app, the screen
 * asks here.
 */
export async function loadChangelogDocument(): Promise<GatewayDocument> {
  const { body, omittedSections } = await loadGatewayChangelog();
  return { raw: body, bundledOmittedSections: omittedSections, language: 'en' };
}
