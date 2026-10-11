/**
 * Whether to render the "get the app" tile: web only, and only after mount, since static prerender
 * has no window and always decides "web", which would flicker for app users. Lives in `shared/lib`
 * because two widgets consume it and widgets must not import sideways.
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
