/**
 * The stacked-transient guard for the first-visit automatic tour (Design
 * Guardian, 2026-07-24).
 *
 * When the automatic tour timer (900ms) fires, the tour overlay (z-70/75) must
 * not be stacked on top of a modal the user has already opened
 * (`role="dialog"` + `aria-modal="true"` — VaultOpenGuideSheet, AgentConnectSheet)
 * or of an OS folder picker holding document focus — the charter's ban on
 * stacking a popover or modal over another. This verdict alone is extracted as a
 * pure function so a jsdom regression test can hold it.
 *
 * The `data-interactive-overlay` marker is not used as the criterion here, since
 * GestureHint (a non-blocking hint chip) also uses it — only modal-grade surfaces block.
 */
export function canAutoStartGuidedTour(doc: Document = document): boolean {
  // If the user opened the tour manually before the timer, do not restart it
  // (which would reset to welcome) — a measured e2e regression where an automatic
  // fire during manual progress sent it back to step 1.
  if (doc.querySelector('[data-testid="guided-tour-overlay"]') !== null) {
    return false;
  }
  // There is no exception even for a modal the guidance means to **point at**.
  // Such an exception existed for the workshop's `studio-entry-choice`, and
  // measured at 1512px the guidance card covered the very two entry-choice cards
  // it meant to introduce, while two `aria-modal` elements standing at once made
  // the card itself nonexistent to a screen reader. Guidance does not cover a
  // decision screen; it appears on the work surface after the decision is made.
  if (doc.querySelector('[role="dialog"][aria-modal="true"]') !== null) {
    return false;
  }
  // A blocking edit composer (add concept, bootstrap) declares its modality with
  // `data-surface-role="blocking-edit-surface"` (a solid panel over a dimmed map)
  // rather than `role=dialog`. That marker is modal-grade too, so the tour overlay
  // must not stack on it — measured: with "add concept" open, the 900ms automatic
  // tour raised its step-1 card on top of it (a stacked-transient violation).
  if (doc.querySelector('[data-surface-role="blocking-edit-surface"]') !== null) {
    return false;
  }
  // 2026-07-29 — settings became a **right-hand dock (non-modal)** and lost its
  // `aria-modal`. But the fact that the user is "in conversation with another
  // surface" is unchanged — ceasing to be modal does not make it acceptable to
  // fire guidance over it. This guard's criterion is not modality but **where the
  // user's attention is**, so it is connected by a marker.
  if (doc.querySelector('[data-surface-role="settings-dock"]') !== null) {
    return false;
  }
  // Where an honest-degradation card is standing (the workshop below `lg`, say)
  // there is no surface to introduce at all. Raising "this is the workshop" over
  // "the workshop cannot open here" makes the guidance a lie rather than guidance.
  // No record is written, so the same guidance waits intact on a screen where the
  // conditions hold (a wider window, or the app).
  if (doc.querySelector('[data-surface-role="degraded-surface"]') !== null) {
    return false;
  }
  // Measured in the installed app 2026-07-29 — **do not explain to someone who is
  // already doing it.** Starting the workshop practice (`?practice=1`) raised the
  // first-visit tour over it 900ms later and physically blocked the practice's
  // step 1 ("give it a name"). The practice band is a non-blocking band rather
  // than a modal, so none of the conditions above caught it.
  //
  // When two pieces of guidance say a different "do this now" at the same moment,
  // the user can do neither. A practice already under the user's hands outranks an
  // introduction — the introduction waits for the next visit if they stop, since
  // it writes no record.
  if (doc.querySelector('[data-surface-role="hands-on-guide"]') !== null) {
    return false;
  }
  return doc.hasFocus();
}
