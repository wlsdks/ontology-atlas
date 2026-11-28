import { redirect } from '@tanstack/react-router';

import { parseSearch } from '@/shared/lib/navigation/atlas-search';

import type { RetiredAddressSearch } from './retired-address-targets';

export type RetiredAddress = 'ontology' | 'ontology-edit' | 'insights' | 'mcp';

/**
 * A retired address answers with its target before any screen renders, replacing its own history
 * entry so Back never returns to it. The target's rules load only here, since the routes that call
 * this keep their `beforeLoad` in the app's first chunk. The old link's hash travels with it.
 */
export async function redirectRetiredAddress(
  retired: RetiredAddress,
  from: { locale: string; search: RetiredAddressSearch; hash: string },
): Promise<never> {
  const targets = await import('./retired-address-targets');
  const address = {
    ontology: targets.ontologyTarget,
    'ontology-edit': targets.ontologyEditTarget,
    insights: targets.insightsTarget,
    mcp: targets.mcpTarget,
  }[retired](from.search);
  const target = new URL(`/${from.locale}${address}`, 'https://atlas.invalid');
  throw redirect({
    to: target.pathname,
    search: parseSearch(target.search),
    ...(from.hash === '' ? {} : { hash: from.hash }),
    replace: true,
  });
}
