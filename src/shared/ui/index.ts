export { Button, buttonVariants, type ButtonProps } from './button';
/**
 * Wrap any conditionally appearing surface in `Surface` — enter and exit motion
 * come with it. Inventory: 10 of 20 such surfaces were hard cuts, and all 10
 * were inline panels.
 */
export { Surface, type SurfaceMotion, type SurfaceProps } from './surface';
export { Dialog, type DialogProps } from './dialog';
export { Input, Textarea, type InputProps, type TextareaProps } from './input';
export { Checkbox, type CheckboxProps } from './checkbox';
export { badgeClass, type BadgeShape, type BadgeClassOptions } from './badge-class';
export { SegmentedControl, type SegmentedControlProps, type SegmentedOption } from './segmented-control';
/**
 * Control components — the layer that adds **behaviour** on top of
 * `controlClass`. The function below owns the values; this owns `type="button"`,
 * the required accessible name, and button semantics.
 *
 * `<Button>` covers **only the standard button**: 1 of the 419 inventoried
 * controls had that shape. The other six (chip, link-like, row, icon, pill,
 * card) are here.
 */
export { Chip, IconButton, RowButton, type IconButtonProps } from './controls';
export {
  controlClass,
  type ControlClassOptions,
  type ControlShape,
  type ControlSize,
  type ControlTone,
} from './control-class';
/*
 * `Card`, `Badge` and `DetailCard` were **deleted on 2026-08-03.**
 *
 * Created 2026-04-30, they had 0 production consumers for over three months.
 * Opening them showed why: `CardTitle` used `text-lg`, **a step absent from this
 * repo's type ramp**. A primitive violating the system it is meant to encode is
 * one nobody adopts. What failed was not components but **components without a
 * gate**.
 */
export { LiveAnnouncer } from './live-announcer';
export { InfoHint } from './info-hint';
export { ToastProvider, useToast } from './toast';
export { EmptyState } from './empty-state';
export { EvidenceOnlyBadge, type EvidenceOnlyBadgeProps } from './evidence-only-badge';
export { Select, type SelectOption, type SelectProps } from './select';
export { InlineEditable } from './inline-editable';
/*
 * The `ChipListEditor` and `LinkListEditor` exports were removed on 2026-08-03:
 * they stood on the public surface of `shared/ui` with 0 production consumers,
 * with the same symptoms as the `Card`/`Badge`/`DetailCard` failure above.
 * Background and falsifier: `docs/DECISIONS.md` 2026-08-03 「죽은 프리미티브 둘」
 * (two dead primitives).
 */
export { Tooltip, TooltipProvider, TooltipContent } from './tooltip';
export { StaggeredFadeIn } from './staggered-fade-in';
export { HighlightedText } from './highlighted-text';
export { ErrorBoundary } from './error-boundary';
export {
  TopologyV2KindGlyph,
  TopologyV2TraceMark,
  isTopologyV2RenderableKind,
  type TopologyV2RenderableKind,
} from './topology-v2-kind-glyph';
export {
  NodeExplanationEdit,
  type NodeExplanationEditLabels,
} from './node-explanation-edit';
export { TabBar, type TabBarItem } from './tab-bar';
export { ChromeTile, type ChromeTileProps } from './chrome-tile';
export { ChromeChip, CHROME_STATUS_CHIP_CLASS, type ChromeChipProps } from './chrome-chip';
export { BrandMark, type BrandMarkProps } from './brand-mark';
export { HexMark, type HexMarkProps } from './hex-mark';
export { GithubMark, type GithubMarkProps } from './github-mark';
export { XMark, type XMarkProps } from './x-mark';
export { CompactCopyButton, type CompactCopyButtonProps } from './compact-copy-button';
export { SimilarNodeWarning, type SimilarNodeWarningProps } from './similar-node-warning';
export {
  LastEditSubjectRow,
  type LastEditSubjectKind,
  type LastEditSubjectRowProps,
} from './last-edit-subject-row';
export { MtimeConflictBadge, type MtimeConflictBadgeProps } from './mtime-conflict-badge';
export { RouteLoadingFallback } from './route-loading-fallback';
export { JsonLd, serializeJsonForHtml, type JsonLdProps } from './json-ld';
export { AccentBootScript } from './accent-boot-script';
