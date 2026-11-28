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

/**
 * Files inside a shared folder that only the repository uses: the README's brand lockups, the brand tools' icon
 * sources, the generated room clips no screen shows yet, and the ACP icons' credits page. The app folder drops them.
 */
const REPOSITORY_ONLY_FILES = /^(?:brand\/(?:icon-(?:dark|light)\.png|lockup[^/]*\.png|moru-room-[^/]+)|acp-icons\/CREDITS\.md)$/;

/** Whether a file, by its path under the folder, is one the app never asks for. */
export function isWebsiteOnlyFile(relativePath) {
  return isWebsiteOnlyEntry(relativePath.split('/')[0]) || REPOSITORY_ONLY_FILES.test(relativePath);
}
