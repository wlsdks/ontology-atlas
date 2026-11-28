/**
 * What the build reads that a browser cannot: vault files, translated chapters, the sample's census and Git
 * dates. Only the root `app/` pages and `scripts/web/site/` import this file; every view's `index.ts` stays what
 * a browser bundle may import, because the dev server, unlike a build, does not drop an unused `node:` import
 * and stops on the first one (`build-time-readers.contract.test.ts` keeps `src/` from importing it).
 */
export { readGatewayDocument, readVaultDoc } from './gateway-doc/lib/read-vault-doc';
export { readGuideDocument } from './gateway-doc/lib/read-guide-document';
export { readSampleCensus } from './sample-map/lib/read-sample-census';
