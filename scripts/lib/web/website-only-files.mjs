/**
 * What the website host serves and the installed app never asks for. Vite copies all of `public/` into both
 * folders, so the app build removes these (`scripts/vite/atlas-app-folder.ts`) and the app-folder check
 * (`scripts/desktop/check-app-folder.mjs`) fails when one is still there. Top-level names of the folder.
 */
export const WEBSITE_ONLY_ENTRIES = Object.freeze([
  // The raw Markdown copies of the bundled vault (6.4 MB): the app reads the same documents from its bundled
  // manifest data and never requests one by address, so shipping them cost every install and served nothing.
  'docs-vault',
  'demo',
  'gateway',
  'og',
  'og-image.png',
  'brand-icon-512.png',
  'manifest.webmanifest',
  'llms.txt',
  'llms-full.txt',
  'robots.txt',
  'sitemap.xml',
  '404.html',
]);

/** The file an IndexNow engine fetches to prove the host is ours: `<32 hex digits>.txt` at the root. */
const INDEXNOW_KEY_FILE = /^[0-9a-f]{32}\.txt$/;

export function isWebsiteOnlyEntry(name) {
  return WEBSITE_ONLY_ENTRIES.includes(name) || INDEXNOW_KEY_FILE.test(name);
}
