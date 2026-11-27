import { deriveOntologyFromVault, resolveStaticVaultSource } from '@/entities/docs-vault';
import { buildSampleMapGraph } from './sample-map-graph';

/**
 * How many concepts and relations the sample map will draw, read at build time from the sample file
 * itself. The bundled vault JSON is a static import here, so only the route's server component may
 * call this: a client module that imports it ships the whole sample in its first load, and the map's
 * own client code loads the sample on demand instead.
 */
export function readSampleCensus(locale: string): { conceptCount: number; relationCount: number } {
  const { conceptCount, relationCount } = buildSampleMapGraph(
    deriveOntologyFromVault(resolveStaticVaultSource('storefront').manifest),
    locale,
  ).census;
  if (conceptCount === 0) throw new Error('samples/storefront holds no concept, so /sample would draw an empty map');
  return { conceptCount, relationCount };
}
