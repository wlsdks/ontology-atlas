/**
 * Where the toaster stands.
 *
 * Toasts are top-centred (owner, 2026-09-06): the bottom-right corner was behind the
 * agent dock and outside the person's attention, while the map's toolbar at the top
 * centre is where the eye already goes. `ToastProvider` reads
 * `--app-toast-top-offset` (default 16px, the plain edge gap); the map plants this
 * value while mounted so the box clears its toolbar, and `app/globals.css` shifts the
 * toaster by half of `--app-right-dock-width` so it stays centred over the map area.
 *
 * 24px chrome inset + 36px toolbar tile + 12px breathing room.
 */
export const TOAST_TOP_OFFSET_UNDER_MAP_TOOLBAR_PX = 72;
