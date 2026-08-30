/**
 * A project status. Unlike a category it has no layout effect — it only
 * changes the dot colour at the node's top right and the label in the drawer
 * and the form.
 */

type StatusDotColor = 'success' | 'warning' | 'paused' | 'neutral';

export interface Status {
  /** Stable ID: lowercase, digits, hyphens — e.g. 'live'. */
  id: string;
  /** Korean UI label. */
  label: string;
  /**
   * English label. Same contract as `Category`: used on English screens, and
   * falls back to `label` when absent — but the defaults must always fill it
   * (`tests/contract/taxonomy-locale-label.contract.test.ts` enforces this).
   */
  labelEn?: string;
  dotColor: StatusDotColor;
}
