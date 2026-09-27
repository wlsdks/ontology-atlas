/**
 * Whether the first-visit tour may fire now: never over a modal, an OS folder picker holding
 * focus, or another attention surface, since stacking a popover or modal over another is
 * banned. `data-interactive-overlay` is not a criterion because GestureHint, a non-blocking
 * chip, uses it too.
 */
export function canAutoStartGuidedTour(doc: Document = document): boolean {
  // A manually opened tour is not restarted, which would reset it to welcome.
  if (doc.querySelector('[data-testid="guided-tour-overlay"]') !== null) {
    return false;
  }
  // No exception even for a modal the guidance means to point at: the card would cover the
  // choices it introduces and two `aria-modal` elements hide it from a screen reader.
  if (doc.querySelector('[role="dialog"][aria-modal="true"]') !== null) {
    return false;
  }
  // A blocking edit composer declares modality with `data-surface-role="blocking-edit-surface"`
  // rather than `role=dialog`, and the tour must not stack on it either.
  if (doc.querySelector('[data-surface-role="blocking-edit-surface"]') !== null) {
    return false;
  }
  // The settings dock is non-modal, but the user's attention is there, so a marker connects it.
  if (doc.querySelector('[data-surface-role="settings-dock"]') !== null) {
    return false;
  }
  // Over an honest-degradation card there is no surface to introduce. No record is written, so
  // the guidance waits for a screen where the conditions hold.
  if (doc.querySelector('[data-surface-role="degraded-surface"]') !== null) {
    return false;
  }
  // A hands-on practice (`?practice=1`) is a non-blocking band, but a practice under the user's
  // hands outranks an introduction, which waits for the next visit.
  if (doc.querySelector('[data-surface-role="hands-on-guide"]') !== null) {
    return false;
  }
  return doc.hasFocus();
}
