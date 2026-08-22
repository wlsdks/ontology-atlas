/**
 * Whether to render the "get the app" tile — **on the web only, and only after
 * mount**.
 *
 * **Why one place in the chrome.** Owner request: *"웹에서는 다양한곳에 앱
 * 다운로드를 유도하는 버튼을 놔주면 좋을듯? 잘보이게"* (put buttons in several
 * places on the web that lead to the app download, clearly visible). Planting a
 * separate banner on every surface is noise rather than guidance, and it is the
 * kind of change this repo's design gates call "an additive-only pass fails".
 *
 * So it lives **in the chrome**: the rail's utility tier on desktop, and the
 * fifth slot of the bottom tab bar below `lg`. Both are the same position on
 * every destination, so one element per width already satisfies "several places".
 * The user learns the grammar once and finds it in the same spot everywhere.
 *
 * **Why it lives in `shared/lib`**: its consumers are two widgets
 * (`app-nav-rail`, `bottom-tab-bar`). Importing sideways between widgets breaks
 * the FSD direction, so a shared decision moves one layer down.
 *
 * **Why after mount.** `isTauriVaultRuntime()` reads `window`. During static
 * prerender there is no window, so it always decides "web" — and if the app loads
 * that HTML and hydration then removes the tile, **app users see a one-frame
 * flicker**. Appearing one frame late on the web is better than showing app users
 * a wrong state and correcting it.
 */
export function shouldShowGetAppTile({
  mounted,
  isDesktopApp,
}: {
  mounted: boolean;
  isDesktopApp: boolean;
}): boolean {
  if (!mounted) return false;
  return !isDesktopApp;
}
