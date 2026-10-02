/** A project status: a dot colour and label, with no layout effect. */

type StatusDotColor = 'success' | 'warning' | 'paused' | 'neutral';

export interface Status {
  /** Lowercase, digits and hyphens, e.g. 'live'. */
  id: string;
  /** Korean UI label. */
  label: string;
  /** English label, falling back to `label`; defaults must fill it (`taxonomy-locale-label.contract.test.ts`). */
  labelEn?: string;
  labels?: Partial<Record<string, string>>;
  dotColor: StatusDotColor;
}
