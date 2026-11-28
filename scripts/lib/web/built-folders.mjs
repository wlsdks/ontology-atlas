/**
 * The two folders a build writes, named once: what the installed app embeds, and what the website host serves.
 * Paths are relative to the repository root and use `/` on every platform.
 */
export const APP_FOLDER = 'src-tauri/target/desktop-frontend';
export const SITE_FOLDER = 'out';
/** The app build's manifest, moved out of the app folder, which holds only what the app uses. */
export const APP_MANIFEST = 'src-tauri/target/desktop-frontend.manifest.json';
