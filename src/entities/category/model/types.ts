/**
 * A project category — one cluster box on the topology map. Admin owns its
 * coordinates, size, and border style.
 *
 * Design-system constraint: no new colours. `borderStyle` picks one of four
 * presets, and indigo stays reserved for hub nodes.
 */

type BorderStyle = 'underline' | 'dashed' | 'sideLabel' | 'solid';

interface CategoryPosition {
  x: number;
  y: number;
}

interface CategorySize {
  width: number;
  height: number;
}

export interface Category {
  /** Stable ID: lowercase, digits, hyphens — e.g. 'in-progress'. */
  id: string;
  /** Korean label — the default shown in the UI. */
  label: string;
  /** English label, used on English screens. */
  labelEn?: string;
  order: number;
  position: CategoryPosition;
  /** Cluster box size. Nodes stay inside it. */
  size: CategorySize;
  /** Approximate radius, used to compute navigation zoom. */
  radius: number;
  borderStyle: BorderStyle;
  /**
   * Vertical text shown left of the node when `borderStyle` is 'sideLabel'.
   * Falls back to `labelEn`, then `label`.
   */
  sideLabelText?: string;
}
