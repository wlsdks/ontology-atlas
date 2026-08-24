export { Button, buttonVariants, type ButtonProps } from './button';
/**
 * Wrap any conditionally appearing surface in `Surface` — enter and exit motion
 * come with it. Inventory: 10 of 20 such surfaces were hard cuts, and all 10
 * were inline panels.
 */
export { Surface } from './surface';
export { AGENT_DOCK_INSET_SURFACE_CLASS } from './agent-dock-surface';
export { Dialog } from './dialog';
export { Textarea } from './input';
export { Checkbox } from './checkbox';
/**
 * Control components — the layer that adds **behaviour** on top of
 * `controlClass`. The function below owns the values; this owns `type="button"`,
 * the required accessible name, and button semantics.
 *
 * `<Button>` covers **only the standard button**: 1 of the 419 inventoried
 * controls had that shape. The other six (chip, link-like, row, icon, pill,
 * card) are here.
 */
export { Chip, IconButton, RowButton } from './controls';
export { controlClass } from './control-class';
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
export { EvidenceOnlyBadge } from './evidence-only-badge';
export { Select } from './select';
export { InlineEditable } from './inline-editable';
/*
 * The `ChipListEditor` and `LinkListEditor` exports were removed on 2026-08-03:
 * they stood on the public surface of `shared/ui` with 0 production consumers,
 * with the same symptoms as the `Card`/`Badge`/`DetailCard` failure above.
 * Background and falsifier: `docs/DECISIONS.md` 2026-08-03 two dead primitives
 * (two dead primitives).
 */
export { Tooltip, TooltipProvider } from './tooltip';
export { StaggeredFadeIn } from './staggered-fade-in';
export { HighlightedText } from './highlighted-text';
export {
  TopologyV2KindGlyph,
  TopologyV2TraceMark,
} from './topology-v2-kind-glyph';
export { TabBar } from './tab-bar';
export { ChromeTile } from './chrome-tile';
export { ChromeChip, CHROME_STATUS_CHIP_CLASS } from './chrome-chip';
export { BrandMark } from './brand-mark';
export { HexMark } from './hex-mark';
export { GithubMark } from './github-mark';
export { XMark } from './x-mark';
export { CompactCopyButton } from './compact-copy-button';
export { SimilarNodeWarning } from './similar-node-warning';
export { LastEditSubjectRow } from './last-edit-subject-row';
export { SummaryFreshnessRow } from './summary-freshness-row';
export { MtimeConflictBadge } from './mtime-conflict-badge';
export { RouteLoadingFallback } from './route-loading-fallback';
export { JsonLd } from './json-ld';
export { AccentBootScript } from './accent-boot-script';
