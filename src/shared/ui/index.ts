export { Button, buttonVariants, type ButtonProps } from './button';
/**
 * 조건부로 나타나는 표면은 **이걸로 감싼다** — 등장·퇴장이 기본으로 딸려 온다.
 * 전수: 그런 표면 20개 중 10개가 하드컷이었고, 그 10개가 전부 인라인 패널이었다.
 */
export { Surface, type SurfaceProps } from './surface';
/**
 * `<Button>` 은 **표준 버튼 하나**만 덮는다 — 전수 419개 중 그 모양은 1개였다.
 * 나머지 여섯 모양(칩 · 링크형 · 행 · 아이콘 · pill · 카드)은 이쪽이다.
 */
/**
 * 컨트롤 컴포넌트 — `controlClass` 위에 **행동**을 얹는 층.
 * 값은 아래 함수가, `type="button"`·접근 이름 강제·버튼 시맨틱은 이쪽이 진다.
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
 * `Card` · `Badge` · `DetailCard` 는 2026-08-03 에 **삭제했다.**
 *
 * 2026-04-30 에 만들어져 3개월 넘게 프로덕션 사용처가 0이었고, 이유를 열어 보니
 * `CardTitle` 이 `text-lg` — **이 저장소 타입 램프에 없는 스텝** — 를 쓰고 있었다.
 * 자기가 인코딩해야 할 시스템을 스스로 위반하는 프리미티브였으니 아무도 안 쓴 게
 * 당연하다. 실패한 것은 컴포넌트가 아니라 **게이트 없는 컴포넌트**다.
 */
export { LiveAnnouncer } from './live-announcer';
export { InfoHint } from './info-hint';
export { ToastProvider, useToast } from './toast';
export { EmptyState } from './empty-state';
export { EvidenceOnlyBadge, type EvidenceOnlyBadgeProps } from './evidence-only-badge';
export { Select, type SelectOption, type SelectProps } from './select';
export { InlineEditable } from './inline-editable';
export { ChipListEditor } from './chip-list-editor';
export { LinkListEditor, type LinkItem } from './link-list-editor';
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
