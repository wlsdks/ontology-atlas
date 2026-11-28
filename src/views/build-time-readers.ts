/**
 * What the build reads that a browser cannot: vault files and the sample's census. Only
 * `scripts/web/site/` imports this file; every view's `index.ts` stays what
 * a browser bundle may import, because the dev server, unlike a build, does not drop an unused `node:` import
 * and stops on the first one (`build-time-readers.contract.test.ts` keeps `src/` from importing it).
 */
export { readGatewayDocument, readVaultDoc } from './gateway-doc/lib/read-vault-doc';
export { readSampleCensus } from './sample-map/lib/read-sample-census';
