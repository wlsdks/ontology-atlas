/** A cluster box on the topology map; `borderStyle` picks one of four presets, never a new colour. */

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
  /** Stable: lowercase, digits and hyphens, e.g. 'in-progress'; projects reference it. */
  id: string;
  /** Korean label, the UI default. */
  label: string;
  labelEn?: string;
  order: number;
  position: CategoryPosition;
  /** Nodes stay inside it. */
  size: CategorySize;
  /** Used to compute navigation zoom. */
  radius: number;
  borderStyle: BorderStyle;
  /** Vertical side text for `sideLabel`; falls back to `labelEn`, then `label`. */
  sideLabelText?: string;
}
