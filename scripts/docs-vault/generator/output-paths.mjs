// Where the docs-vault build reads from and writes to. The build lives two
// folders below `scripts/`, so ROOT is three levels above this file.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '../../..');
export const DOCS_DIR = path.join(ROOT, 'docs');
export const PUBLIC_OUT = path.join(ROOT, 'public', 'docs-vault');

const DATA_DIR = path.join(ROOT, 'src', 'entities', 'docs-vault', 'data');
export const MANIFEST_OUT = path.join(DATA_DIR, 'manifest.json');
export const CONTENT_OUT = path.join(DATA_DIR, 'content.json');
// The gateway needs body text synchronously before first paint, so only guide/* goes into this
// small map; other documents are raw assets in public/docs-vault. The CHANGELOG is cut to a few
// recent sections to stay inside the chunk budget (max 1.5MiB); `/docs` reads the full file.
export const GATEWAY_CONTENT_OUT = path.join(DATA_DIR, 'gateway-content.json');
export const GATEWAY_CHANGELOG_OUT = path.join(DATA_DIR, 'gateway-changelog.json');
// How many CHANGELOG sections go into the bundle. It must exceed the screen's display limit
// (RECENT_SECTIONS = 12 in `src/app/routes/$locale/_site/changelog.tsx`): the screen trims once more
// and adds the fold counts, so a higher screen limit makes the excess invisible.
export const GATEWAY_CHANGELOG_KEEP_SECTIONS = 16;
// Only `/docs` uses the headings, yet 263KB of them rode in the chunk shared by every route: the
// bundled manifest is emptied of them and a slug → headings map is emitted for `/docs` to import
// dynamically. The local mode manifest (the user's vault) keeps headings inline.
export const MANIFEST_HEADINGS_OUT = path.join(DATA_DIR, 'manifest.headings.json');
// `samples/storefront/` is built as its own manifest/content pair so a non-developer sees an example
// business instead of the dogfood vault. The dogfood output is never touched, and no public raw
// copies are produced for storefront.
export const SAMPLES_STOREFRONT_DIR = path.join(ROOT, 'samples', 'storefront');
export const STOREFRONT_MANIFEST_OUT = path.join(DATA_DIR, 'sample-storefront.manifest.json');
export const STOREFRONT_HEADINGS_OUT = path.join(DATA_DIR, 'sample-storefront.headings.json');
export const STOREFRONT_CONTENT_OUT = path.join(DATA_DIR, 'sample-storefront.content.json');
