/**
 * What runs in a browser too: the page, the chapter list and the structured data. `index.ts` also holds the
 * readers that open vault files and Git in Node, which a browser bundle must not import; the dev server,
 * unlike a build, does not drop an unused one, and would stop on its first `node:` import.
 */
export { GatewayDocPage } from './ui/GatewayDocPage';
export type { GatewayDocument } from './lib/read-vault-doc';
export { guideStructuredData } from './lib/guide-structured-data';
export {
  GUIDE_PAGES,
  GUIDE_ENTRY_PAGE,
  GUIDE_TRANSLATIONS_DIR,
  guideCanonicalPath,
  guideSourcePath,
  resolveGuidePage,
} from './model/guide-pages';
export { CHANGELOG_CONTENT_LOCALES } from './model/changelog';
