'use client';

/**
 * A one-way "open settings at that place" signal between surfaces.
 *
 * **Why an event.** The settings sheet is owned by the app shell, and the
 * surfaces that need it — the map's right dock, for one — are not its
 * descendants. Wiring them with props would make the whole map carry settings
 * state, which is not the map's state. This follows the window-event convention
 * already used by `app:urlchange` and the appearance and audience preferences.
 *
 * **Give a door, not directions.** Copy like "in the gear at the bottom left,
 * under AI connection…" makes a person do what the screen could have done.
 */

const SETTINGS_VIEW_INTENT_EVENT = 'ontology-atlas:settings-view-intent';

/**
 * The places that can be requested — **one, today.**
 *
 * ⚠️ `'agent'` and `'runtimes'` were removed on 2026-08-21 when both left the
 * sheet to become the `/agents/` destination (ledger 90). Their callers now
 * navigate instead: signalling the sheet to open at a place the sheet no longer
 * has gives the user a button that does nothing.
 *
 * Keeping this type narrow makes that failure a compile error rather than a
 * silent door into a room that does not exist.
 */
export type SettingsViewIntent = 'ai';

interface SettingsViewIntentDetail {
  view: SettingsViewIntent;
}

/** Browser-only; a no-op elsewhere. */
export function requestSettingsView(view: SettingsViewIntent): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SettingsViewIntentDetail>(SETTINGS_VIEW_INTENT_EVENT, {
      detail: { view },
    }),
  );
}

/** Returns an unsubscribe function, usable directly as effect cleanup. */
export function subscribeSettingsViewIntent(
  handler: (view: SettingsViewIntent) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<SettingsViewIntentDetail>).detail;
    if (!detail?.view) return;
    handler(detail.view);
  };
  window.addEventListener(SETTINGS_VIEW_INTENT_EVENT, listener);
  return () => window.removeEventListener(SETTINGS_VIEW_INTENT_EVENT, listener);
}
