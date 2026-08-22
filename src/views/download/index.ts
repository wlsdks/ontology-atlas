export { DownloadPage } from './ui/DownloadPage';
/**
 * **One screen, two addresses.** `/` (the web visitor's face) and `/download` (the deeplink that
 * calls for an install) both render this one view — the same convention by which `/` and
 * `/topology` share one map.
 *
 * The alias exists **for the reader**. Seeing `<DownloadPage />` in the root entry branch makes the
 * next person ask "why is the root a download page?". This name states what it does in that slot.
 */
export { DownloadPage as GatewayLandingPage } from './ui/DownloadPage';
export { downloadStructuredData } from './lib/structured-data';
