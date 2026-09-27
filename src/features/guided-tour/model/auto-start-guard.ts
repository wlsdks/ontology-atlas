const BLOCKING_SURFACES = [
  // A manually opened tour is not restarted, which would reset it to welcome.
  '[data-testid="guided-tour-overlay"]',
  // No exception even for a modal the guidance means to point at: the card would cover the
  // choices it introduces and two `aria-modal` elements hide it from a screen reader.
  '[role="dialog"][aria-modal="true"]',
  // A blocking edit composer declares modality with `data-surface-role="blocking-edit-surface"`
  // rather than `role=dialog`, and the tour must not stack on it either.
  '[data-surface-role="blocking-edit-surface"]',
  // The settings dock is non-modal, but the user's attention is there, so a marker connects it.
  '[data-surface-role="settings-dock"]',
  // Over an honest-degradation card there is no surface to introduce. No record is written, so
  // the guidance waits for a screen where the conditions hold.
  '[data-surface-role="degraded-surface"]',
  // A hands-on practice (`?practice=1`) is a non-blocking band, but a practice under the user's
  // hands outranks an introduction, which waits for the next visit.
  '[data-surface-role="hands-on-guide"]',
] as const;

/**
 * Whether the first-visit tour may fire now: never over a modal, an OS folder picker holding
 * focus, or another attention surface, since stacking a popover or modal over another is
 * banned. `data-interactive-overlay` is not a criterion because GestureHint, a non-blocking
 * chip, uses it too.
 */
export function canAutoStartGuidedTour(doc: Document = document): boolean {
  if (BLOCKING_SURFACES.some((selector) => doc.querySelector(selector) !== null)) return false;
  return doc.hasFocus();
}
