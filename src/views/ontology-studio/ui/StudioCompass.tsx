"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MOTION, MOTION_EASE } from "@/shared/motion";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Eye,
  FilePen,
  MoreHorizontal,
  Plus,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { candidateMatches } from "../lib/match-candidate";
import { studioBoardScale } from "../lib/board-scale";
import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";
import { Select } from "@/shared/ui";
import type {
  StudioBearing,
  StudioRelation,
  StudioSatellite,
} from "../lib/build-studio-item";
import type { CreateCandidate, CreateNodeKind } from "../lib/build-create-node";
import type { PickerDiscovery, PickerSuggestionReason } from "../lib/build-picker-discovery";
import type { DeltaPreviewLayout, DeltaSatellite, DeltaSatelliteState } from "../lib/build-delta-preview";

/**
 * 나침 무대 (Compass Stage) — the ontology WRITE surface. One focal node sits
 * center-stage; the four relation types are nailed to fixed compass bearings
 * (UP 상위개념 · RIGHT 기대는 곳 · DOWN 담는 것 · LEFT 비슷한 것). Filling a
 * missing relation completes the node's meaning.
 *
 * ONE surface, two fill-states — no mode tabs:
 *   - enhance: an existing node, partially filled. Fill a socket → write a real
 *     relation to the node's frontmatter (or copy an MCP packet, read-only).
 *   - create:  an all-empty new node. Identity fields are editable in the center
 *     draft card; filling sockets stages pending relations; save applies.
 *
 * Charter: dark only, neutrals + single indigo, amber ONLY on the
 * expected-but-missing (DOWN) socket. No glow/gradient/particle/scale-hover.
 * Every string is a resolved `label`, so this renders in isolation and is
 * unit-testable. Data + writes live in `OntologyStudioPage`.
 */

// ── Board geometry (fixed coordinate system, centered in the stage) ──────────
const BOARD = { w: 1180, h: 600 } as const;
const CX = BOARD.w / 2; // 590
const CY = BOARD.h / 2; // 300
const CARD = { w: 372, h: 172 } as const;
const CARD_CREATE_H = 236;
/** Create-mode card grows when the near-dup / slug-collision banner is shown so
 * the warning always lives INSIDE the dashed border (never bleeds past it). */
const CARD_CREATE_H_WARN = 320;
const SAT = { w: 226, h: 54, gap: 12 } as const;
const MAX_VISIBLE = 2;
const CREATE_SLUG_COLLISION_ID = "studio-create-slug-collision";
const CREATE_KIND_LABEL_ID = "studio-create-kind-label";

export interface CompassBearingView {
  bearing: StudioBearing;
  relation: StudioRelation;
  /** Plain-language socket question (never the relation type name). */
  question: string;
  /** Short lane-head label shown next to a filled lane. */
  laneLabel: string;
  /** Sub-line under the empty-socket question. */
  emptyHint: string;
  neighbors: StudioSatellite[];
  filled: boolean;
  recommended: boolean;
  expected: boolean;
  /**
   * This lane carries an unsaved (저장 대기) relation — every create-mode fill,
   * and any enhance-mode lane with a staged neighbor. Drives the slow dash-flow
   * along the strut so a pending connection reads as "alive / not yet written".
   */
  staged?: boolean;
}

export interface CompassKindOption {
  value: CreateNodeKind;
  label: string;
}

export interface StudioCompassLabels {
  searchPlaceholder: string;
  exit: string;
  moreRelations: string;
  flowEyebrow: string;
  /** (filled, total) → e.g. "4방향 중 2 채움 · 반쯤 왔어요". */
  flowCount: (filled: number, total: number) => string;
  /**
   * C12② — quiet line under the flow cue when an ENHANCE focal already belongs
   * to a domain. Domain membership is authored on the child's own `domain:` key
   * (belonging, not this node's outgoing meaning), so it does NOT count toward
   * the 4-bearing 완성도 — this line keeps 0/4 from reading as "orphan / 빈 껍데기".
   */
  domainMembership: (domain: string) => string;
  /** (name) → the one calm frame prompt. */
  framePrompt: (name: string) => string;
  guideBadge: string; // "여기부터 채워요"
  /** (filled, total) → bottom progress "4개 중 2개 채웠어요 · N군데 남음". */
  bottomProgress: (filled: number, total: number) => string;
  save: string;
  saveHint: string;
  foldMore: (n: number) => string;
  /** Lane overflow popover title, e.g. "이 노드가 품고 있는 것 · 92". */
  foldTitle: (label: string, total: number) => string;
  /** C4 — filled-lane add chip. (laneLabel) → full aria/title, e.g. "이 노드가
   * 품고 있는 것에 더 잇기". `addMoreShort` is the compact visible label. */
  addMore: (laneLabel: string) => string;
  addMoreShort: string;
  defMore: string;
  defLess: string;
  // picker
  pickerTitle: (question: string) => string;
  pickerSub: string;
  pickerPlaceholder: string;
  pickerEmpty: string; // 검색했는데 결과가 없을 때
  /** 검색 전(빈 질의)인데 둘러볼 후보조차 없을 때 — "없다" 가 아니라 "시작하는 법". */
  pickerBrowseEmpty: string;
  pickerKind: (kindLabel: string) => string;
  pickerCreateNew: string;
  // ── Slice 3 — 발견 표면 (browse + 추천) ──
  suggestHeading: string; // "추천"
  browseHeading: string; // "둘러보기"
  reasonSameDomain: string; // "같은 도메인"
  reasonTitleSimilar: string; // "이름 비슷"
  reasonAdjacent: string; // "이웃의 이웃"
  browseBack: string; // "← 도메인"
  browseNoDomain: string; // "도메인 없음"
  /** near-dup suggestion. (title) → message. */
  similarSuggest: (title: string) => string;
  similarAccept: string;
  // create identity
  /** CREATE 의 kind 세그먼트 그룹 이름 — 한 단어("종류"/"Kind"). 시각 라벨이자
   *  `aria-labelledby` 대상. UP 소켓의 관계 질문과 이 컨트롤을 갈라 세운다. */
  createKindLabel: string;
  createNamePlaceholder: string;
  createDomainNone: string;
  createDefinitionPlaceholder: string;
  createSimilar: (title: string, kindLabel: string) => string;
  createSlugCollision: (title: string, kindLabel: string) => string;
  createSlugCollisionHint: string;
  createSimilarOpen: string;
  createSimilarAnyway: string;
  // ── Slice 1 — 지지대 편집 (edit existing relations) ──
  edit: string; // "···" affordance aria-label / tooltip
  editTitle: string; // card heading, e.g. "이 관계 고치기"
  close: string; // shared accessible name for icon-only inline-card close controls
  editRetypeHeading: string; // "다른 방향으로 옮기기"
  editMoveTo: (bearingLabel: string) => string; // per retype option label
  editDelete: string; // "관계 끊기"
  editDeleteConfirm: string; // "정말 끊을까요?" (suggestion tone)
  editDeleteYes: string; // destructive confirm (red)
  editDeleteCancel: string; // "그대로 둘게요"
  editElsewhere: (other: string) => string; // honest note
  editElsewhereGo: string; // re-center button
  pendingBadge: string; // "저장 대기"
  // ── Slice 2 — 평문 기록 요약 ──
  summaryUndo: string; // aria for the per-row ✕
  commitEmptyHint: string; // enhance, nothing staged
  // ── Slice 4 — 나침반 산책 (compass walk) ──
  walkTo: string; // satellite hover/title — "이 노드로 걸어가기"
  walkBackAria: (name: string) => string; // back affordance aria — "이전 노드로 돌아가기: {name}"
  // ── #68 — 작업중 목록 (in-progress drafts) ──
  /** (count) → header chip "작업중 N". */
  draftsOpen: (count: number) => string;
  /** (count) → chip aria. */
  draftsOpenAria: (count: number) => string;
  draftsTitle: string; // panel heading "작업중이던 것"
  draftsHint: string; // one plain line explaining the drafts contract
  draftsCloseAria: string;
  /** (count) → per-row change count. */
  draftsCount: (count: number) => string;
  draftsResume: string; // row action "이어서 하기"
  draftsDiscard: string; // row action "버리기"
  /** (name) → discard aria. */
  draftsDiscardAria: (name: string) => string;
  draftsCurrent: string; // badge on the row that is already on stage
  draftsEmpty: string;
  // ── Slice 5 — 그래프 델타 미니뷰 (save preview) ──
  previewOpen: string; // quiet "미리보기" affordance beside the summary line
  previewTitle: string; // "저장하면 이렇게 변해요"
  previewCloseAria: string; // ✕ aria-label
  previewClose: string; // quiet footer "닫기"
  previewCenterNew: string; // create — center chip "새로 생겨요"
  previewMovedChip: string; // moved satellite chip "이동"
  previewRemovedChip: string; // removed satellite chip "끊김"
  /** (count) → overflow "+N" chip inside a busy lane. */
  previewOverflow: (count: number) => string;
  // legend
  previewLegendExisting: string; // "그대로"
  previewLegendAdded: string; // "새로 연결"
  previewLegendMoved: string; // "옮김"
  previewLegendRemoved: string; // "끊김"
}

export interface CompassFocal {
  kindLabel: string;
  domainLabel: string | null;
  name: string;
  definition: string;
}

export interface StudioCompassProps {
  mode: "enhance" | "create";
  /**
   * One-shot keyboard handoff when the entry-choice dialog becomes the stage.
   * Route-driven deep links keep their existing route-focus behavior.
   */
  initialFocus?: "heading" | "create-name";
  onInitialFocusApplied?: () => void;
  labels: StudioCompassLabels;
  kindLabelFor: (kind: string) => string;
  focal: CompassFocal;
  bearings: CompassBearingView[];
  filledBearings: number;
  writable: boolean;
  /** Fill a socket. Returns candidate rows for the picker + a near-dup hit. */
  candidatesFor: (relation: StudioRelation, query: string) => CreateCandidate[];
  similarFor?: (relation: StudioRelation, query: string) => CreateCandidate | null;
  /**
   * Slice 3 — the picker's EMPTY (pre-typing) discovery surface: 추천 + 둘러보기.
   * Omit → the picker shows the flat search rows immediately (isolated render /
   * create mode). Computed lazily per socket-open (memoized inside the picker).
   */
  discoveryFor?: (relation: StudioRelation) => PickerDiscovery;
  onFill: (relation: StudioRelation, candidate: CreateCandidate) => void;
  onSave: () => void;
  onExit: () => void;
  /**
   * Picker "찾는 게 없어요 · 새로 만들기" bridge — opt-in, enhance mode routes to
   * create. C2: the picker passes the socket's relation + typed query so CREATE
   * opens carrying the origin (A --relation--> new) + a name prefill.
   */
  onCreateNew?: (ctx?: { relation: StudioRelation; query: string }) => void;
  /**
   * C2 — quiet create-mode context line ("‘A’ 의 ‘담는 것’ 으로 이어질 예정"),
   * present only when CREATE was opened from a socket. Omit → no line.
   */
  createOriginNote?: string | null;
  /** All vault nodes, for the top-bar node search. Omit → static placeholder (isolated render/tests). */
  searchNodes?: CreateCandidate[];
  /** Load another node on the stage (top-bar search pick · satellite / fold-row click). */
  onOpenNode?: (id: string) => void;
  /** Honest "곧 제공" label for the not-yet-built rare-relations affordance. */
  moreRelationsSoon?: string;

  // create-only identity editing
  createKinds?: CompassKindOption[];
  createKind?: CreateNodeKind;
  onCreateKind?: (kind: CreateNodeKind) => void;
  onCreateName?: (name: string) => void;
  createDomains?: ReadonlyArray<{ value: string; title: string }>;
  createDomainValue?: string | null;
  onCreateDomain?: (value: string | null) => void;
  onCreateDefinition?: (def: string) => void;
  /**
   * C12③ — ONE optional secondary-locale display name (the primary name field is
   * the current UI locale). Placeholder is locale-aware ("영어 이름 (선택)" on a
   * ko UI, "한국어 이름 (선택)" on an en UI). Omit → no secondary field.
   */
  createSecondaryName?: string;
  onCreateSecondaryName?: (name: string) => void;
  createSecondaryNamePlaceholder?: string;
  createSimilarHit?: { title: string; kind: string; slug: string } | null;
  /** Exact deterministic path conflict — save cannot succeed until renamed. */
  createSlugCollision?: boolean;
  onOpenSimilar?: (slug: string) => void;
  onDismissSimilar?: () => void;
  canSave?: boolean;

  // ── Slice 1 — edit existing relations (enhance) ──
  /** Present → filled satellites gain a quiet "···" edit affordance. */
  onRetype?: (from: StudioRelation, to: StudioRelation, neighbor: StudioSatellite) => void;
  onRemove?: (relation: StudioRelation, neighbor: StudioSatellite) => void;
  /** Whether this neighbor is editable from the FOCAL node's own frontmatter. */
  editabilityOf?: (relation: StudioRelation, neighbor: StudioSatellite) => boolean;
  /**
   * Slice 6 — 지도 엣지 딥링크. A `?edit=<relation>:<targetId>` arrival seeds this
   * so the stage opens with THAT relation's edit card already open (same card as
   * clicking ···). The page resolves the satellite (null when the edge is stale)
   * and pairs this with `arrivedFrom` on the same id for the arrival highlight.
   * Keyed remount per focal makes it a one-shot mount seed.
   */
  initialEdit?: { relation: StudioRelation; neighbor: StudioSatellite } | null;
  /** Plain bearing name for a relation (retype option labels). */
  bearingLabelFor?: (relation: StudioRelation) => string;
  /** neighbor ids with a staged (not-yet-saved) change → "저장 대기" cue. */
  pendingNeighborIds?: ReadonlySet<string>;

  // ── Slice 2 — plain-language record summary + staged commit ──
  summary?: {
    count: number;
    collapsed: string;
    headline: string;
    lines: string[];
    fileEffect: string;
  } | null;
  onUndoChange?: (index: number) => void;
  /** Any staged change on this stage (badge/affordance gating). */
  hasPendingChanges?: boolean;

  // ── #68 — 작업중 목록 ──
  /**
   * Nodes with auto-kept drafts (`studio-draft-store`), newest first, already
   * filtered to the current graph by the page. Rendering them here — not in a
   * separate route — is what makes "walk away and come back" a visible loop
   * instead of a promise.
   */
  drafts?: readonly { focalId: string; title: string; count: number }[];
  /** Current stage's node id — the drafts row for it reads "지금 무대", not "이어서 하기". */
  focalId?: string;
  onOpenDraft?: (focalId: string) => void;
  onDiscardDraft?: (focalId: string) => void;

  // ── Slice 4 — 나침반 산책 (compass walk) ──
  /**
   * The node we walked FROM (previous focal). Present → its satellite on the new
   * stage gets a one-shot arrival highlight so "where I came from" reads (#3).
   */
  arrivedFrom?: string | null;
  /**
   * The previous node for the quiet "← <이름>" back affordance (#2). Clicking it
   * re-centers there, routed through the same pending-changes walk guard.
   */
  backTo?: { id: string; label: string } | null;
  /**
   * Commit staged changes THEN walk to `id` — powers the "저장하고 이동" option in
   * the walk guard. Omit → the guard offers only 버리고 이동 / 계속 편집 (#1).
   */
  onSaveAndOpenNode?: (id: string) => void;

  // ── Slice 5 — 그래프 델타 미니뷰 (save preview) ──
  /**
   * The layout-ready mini-graph the page computes (pure model) from the base
   * neighborhood + staged changes. Present with `hasDelta` → the bottom bar
   * grows a quiet "미리보기" affordance that opens a scrim modal showing "저장하면
   * 지도가 이렇게 변해요". Omit / `hasDelta:false` → no affordance (no dead click).
   */
  deltaPreview?: DeltaPreviewLayout | null;
}

interface LaneLayout {
  /** Satellite top-left positions (board coords). */
  sats: Array<{ sat: StudioSatellite; x: number; y: number }>;
  fold: { x: number; y: number; count: number } | null;
  socket: { x: number; y: number; w: number; h: number } | null;
  /**
   * FILLED lane only (C4) — a compact dashed "＋ 더 잇기" chip at the lane's
   * outward end so a lane with satellites still has an entry point to add
   * another relation on this bearing. Same picker anchor shape as `socket`.
   */
  addChip: { x: number; y: number; w: number; h: number } | null;
  struts: string[];
  anchor: { x: number; y: number }; // where the picker beak points
}

/** Compact add-chip footprint (C4) — narrower/shorter than an empty socket. */
const ADD_CHIP = { w: SAT.w, h: 30 } as const;

/** Vertically-centered top positions for `n` stacked satellites around `cy`. */
function stackTops(cy: number, n: number, withFold: boolean): number[] {
  const foldH = withFold ? 30 + SAT.gap : 0;
  const total = n * SAT.h + Math.max(0, n - 1) * SAT.gap + foldH;
  const start = cy - total / 2;
  const tops: number[] = [];
  for (let i = 0; i < n; i += 1) tops.push(start + i * (SAT.h + SAT.gap));
  return tops;
}

function layoutLane(view: CompassBearingView, cardH: number): LaneLayout {
  const cardTop = CY - cardH / 2;
  const cardBottom = CY + cardH / 2;
  const cardLeft = CX - CARD.w / 2;
  const cardRight = CX + CARD.w / 2;

  const total = view.neighbors.length;
  const visible = view.neighbors.slice(0, MAX_VISIBLE);
  const overflow = total - visible.length;
  const withFold = overflow > 0;

  if (!view.filled) {
    // Empty socket + dashed strut into it. #6 (2026-07-25) — the boxes read as
    // billboards, not slots: the question was `text-callout`, an UNregistered
    // ramp step that fell back to the root 16px, and the footprints were sized
    // for that oversize. Question is now text-body(12.5) so the footprints hug
    // it — up keeps a touch more height for the ◈ guide badge + a 2-line wrap;
    // the others are the compact single/two-line slot. Inner padding stays
    // comfortable (≥10px) so the plain-language question never touches a wall.
    if (view.bearing === "up") {
      const w = 224;
      const h = 82;
      const y = cardTop - 46 - h;
      const x = CX - w / 2;
      return {
        sats: [],
        fold: null,
        socket: { x, y, w, h },
        addChip: null,
        struts: [`M ${CX} ${cardTop} V ${y + h}`],
        anchor: { x: CX, y: y + h / 2 },
      };
    }
    if (view.bearing === "down") {
      const w = 204;
      const h = 64;
      const y = cardBottom + 46;
      const x = CX - w / 2;
      return {
        sats: [],
        fold: null,
        socket: { x, y, w, h },
        addChip: null,
        struts: [`M ${CX} ${cardBottom} V ${y}`],
        anchor: { x: CX, y: y + h / 2 },
      };
    }
    // left / right empty socket
    const w = 204;
    const h = 64;
    const y = CY - h / 2;
    if (view.bearing === "right") {
      const x = cardRight + 128;
      return {
        sats: [],
        fold: null,
        socket: { x, y, w, h },
        addChip: null,
        struts: [`M ${cardRight} ${CY} H ${x}`],
        anchor: { x, y: CY },
      };
    }
    const x = cardLeft - 128 - w;
    return {
      sats: [],
      fold: null,
      socket: { x, y, w, h },
      addChip: null,
      struts: [`M ${cardLeft} ${CY} H ${x + w}`],
      anchor: { x: x + w, y: CY },
    };
  }

  // Filled lane — satellites + solid struts.
  if (view.bearing === "right" || view.bearing === "left") {
    const isRight = view.bearing === "right";
    const satX = isRight ? cardRight + 128 : cardLeft - 128 - SAT.w;
    const busX = isRight ? cardRight + 62 : cardLeft - 62;
    const edgeX = isRight ? cardRight : cardLeft;
    const satMeetX = isRight ? satX : satX + SAT.w;
    const tops = stackTops(CY, visible.length, withFold);
    const centers = tops.map((t) => t + SAT.h / 2);
    const sats = visible.map((sat, i) => ({ sat, x: satX, y: tops[i] }));
    const struts: string[] = [`M ${edgeX} ${CY} H ${busX}`];
    const busTop = Math.min(...centers, CY);
    const busBottom = Math.max(...centers, CY);
    if (busBottom - busTop > 0.5) struts.push(`M ${busX} ${busTop} V ${busBottom}`);
    for (const cyi of centers) struts.push(`M ${busX} ${cyi} H ${satMeetX}`);
    let fold: LaneLayout["fold"] = null;
    let lastBottom = tops[tops.length - 1] + SAT.h;
    if (withFold) {
      const foldY = tops[tops.length - 1] + SAT.h + SAT.gap;
      fold = { x: satX, y: foldY, count: overflow };
      struts.push(`M ${busX} ${foldY + 15} H ${satMeetX}`);
      const newBottom = Math.max(busBottom, foldY + 15);
      struts[1] = `M ${busX} ${busTop} V ${newBottom}`;
      lastBottom = foldY + 30;
    }
    // C4 — compact "＋ 더 잇기" chip below the stack (outward end).
    const addChip = { x: satX, y: lastBottom + SAT.gap, w: ADD_CHIP.w, h: ADD_CHIP.h };
    return {
      sats,
      fold,
      socket: null,
      addChip,
      struts,
      anchor: { x: isRight ? satX : satX + SAT.w, y: CY },
    };
  }

  // up / down filled — vertical stack directly above/below the card.
  const isDown = view.bearing === "down";
  const satX = CX - SAT.w / 2;
  const edgeY = isDown ? cardBottom : cardTop;
  let y0 = isDown ? cardBottom + 40 : cardTop - 40 - visible.length * (SAT.h + SAT.gap);
  if (!isDown && withFold) y0 -= 30 + SAT.gap;
  const sats = visible.map((sat, i) => ({ sat, x: satX, y: y0 + i * (SAT.h + SAT.gap) }));
  const firstEdge = isDown ? y0 : y0 + (visible.length - 1) * (SAT.h + SAT.gap) + SAT.h;
  const struts: string[] = [`M ${CX} ${edgeY} V ${firstEdge}`];
  let fold: LaneLayout["fold"] = null;
  if (withFold) {
    const foldY = isDown ? y0 + visible.length * (SAT.h + SAT.gap) : y0 - (30 + SAT.gap);
    fold = { x: satX, y: foldY, count: overflow };
  }
  // C4 — compact "＋ 더 잇기" chip at the outward end (below a DOWN stack, above
  // an UP stack) so a filled vertical lane still has an add entry point.
  const stackBottom = isDown
    ? (fold ? fold.y + 30 : y0 + (visible.length - 1) * (SAT.h + SAT.gap) + SAT.h)
    : (fold ? fold.y : y0); // up: topmost element top
  const addChip = isDown
    ? { x: satX, y: stackBottom + SAT.gap, w: ADD_CHIP.w, h: ADD_CHIP.h }
    : { x: satX, y: stackBottom - SAT.gap - ADD_CHIP.h, w: ADD_CHIP.w, h: ADD_CHIP.h };
  return {
    sats,
    fold,
    socket: null,
    addChip,
    struts,
    anchor: { x: CX, y: isDown ? y0 : y0 + SAT.h },
  };
}

const KIND_LETTER: Record<string, string> = {
  project: "P",
  domain: "D",
  capability: "C",
  element: "E",
  document: "◦",
  unknown: "•",
};

function KindGlyph({ kind }: { kind: string }) {
  return (
    <span className="grid h-[18px] w-[18px] flex-none place-items-center rounded-[5px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] text-label font-semibold text-[color:var(--color-text-tertiary)]">
      {KIND_LETTER[kind] ?? "•"}
    </span>
  );
}

export function StudioCompass(props: StudioCompassProps) {
  const {
    mode,
    labels,
    kindLabelFor,
    focal,
    bearings,
    filledBearings,
    candidatesFor,
    similarFor,
    onFill,
    onSave,
    onExit,
  } = props;

  const [openRelation, setOpenRelation] = useState<StudioRelation | null>(null);
  const [query, setQuery] = useState("");
  /** Which filled lane has its overflow ("+N 더 보기") list popover open. */
  const [openFold, setOpenFold] = useState<StudioBearing | null>(null);
  /** Which existing relation has its inline edit card open (Slice 1). Slice 6
   * seeds it from a `?edit=` deep-link so the card opens on arrival — the stage
   * remounts per focal (`key` in the page), so this initializer runs once per
   * focal, never re-seeding on unrelated re-renders. */
  const [openEdit, setOpenEdit] = useState<{ relation: StudioRelation; neighbor: StudioSatellite } | null>(
    props.initialEdit ?? null,
  );
  /** exit confirm popover (Slice 2 escape hatch). */
  /** record-summary expanded (Slice 2 — "이렇게 기록됩니다"). */
  const [summaryOpen, setSummaryOpen] = useState(false);
  /** Slice 5 — 그래프 델타 미니뷰 scrim modal (opt-in save preview). */
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const drafts = props.drafts ?? [];
  /**
   * 연관 강조 (related-pair light-up). Hovering / focusing a satellite or a socket
   * marks its bearing so the PAIR — that lane's strut AND the center card's
   * same-side border — brightens to the indigo hover step together (color-only,
   * ≤200ms). An open picker keeps its socket's bearing lit so the relationship
   * being edited stays visually connected to the card.
   */
  const [hoveredBearing, setHoveredBearing] = useState<StudioBearing | null>(null);
  // Transient surfaces (picker / fold list / search) reset automatically: the
  // enhance instance is keyed by node id in the page, so switching nodes remounts.

  // ── 공방 모션 카탈로그 (Phase 3 #2) ────────────────────────────────────────
  // JS-driven motions (FLIP, commit convergence) must self-skip under reduced
  // motion — the CSS-only ones are handled by the globals base-layer rule.
  const reduceMotion = usePrefersReducedMotion();
  const stageRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const { initialFocus, onInitialFocusApplied } = props;

  useEffect(() => {
    if (!initialFocus) return;
    // Query-driven CREATE entry also runs the global route focus manager.
    // Land one frame later so the task-specific field wins over the generic
    // route heading without a visible scroll jump.
    const frame = window.requestAnimationFrame(() => {
      const target =
        initialFocus === "create-name"
          ? stageRef.current?.querySelector<HTMLInputElement>(
              '[data-testid="studio-create-name"]',
            )
          : headingRef.current;
      if (!target) return;
      target.focus({ preventScroll: true });
      onInitialFocusApplied?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialFocus, onInitialFocusApplied]);

  // Satellite FLIP — on retype a satellite moves to another lane. Play the move
  // from its OLD screen position to the NEW one (transform-only, --motion-settle)
  // so the eye follows where it went instead of it teleporting. A board-level
  // id→DOM registry survives the lane-to-lane unmount/remount (a moved satellite
  // is a fresh node in a different LaneRender subtree). The 8px threshold means
  // the tiny stage-entrance translate never masquerades as a lane move, and
  // reduced motion skips the whole path. Duration/easing mirror --motion-settle
  // /--motion-ease (WAAPI can't read CSS var()s here — same copy pattern as
  // OVERLAY_SPRING in src/shared/motion).
  const satNodeRefs = useRef(new Map<string, HTMLElement>());
  const satPrevRects = useRef(new Map<string, DOMRect>());
  const registerSat = useCallback((id: string, el: HTMLElement | null) => {
    if (el) satNodeRefs.current.set(id, el);
    else satNodeRefs.current.delete(id);
  }, []);
  useLayoutEffect(() => {
    const prev = satPrevRects.current;
    const next = new Map<string, DOMRect>();
    for (const [id, el] of satNodeRefs.current) {
      // Skip mid-flight elements so a re-render doesn't read the transformed
      // rect and start a competing animation; carry their settled rect forward.
      if (el.getAttribute("data-flip-animating") === "true") {
        const carried = prev.get(id);
        if (carried) next.set(id, carried);
        continue;
      }
      const rect = el.getBoundingClientRect();
      next.set(id, rect);
      if (reduceMotion) continue;
      const before = prev.get(id);
      if (!before) continue;
      const dx = before.left - rect.left;
      const dy = before.top - rect.top;
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) continue;
      el.setAttribute("data-flip-animating", "true");
      const anim = el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        {
          // WAAPI 도 CSS var() 를 못 읽는다 — 램프 거울에서 가져와 값이 갈라지지
          // 않게 한다(2026-07-28). 240ms = `--motion-settle`("확정"), 이징은
          // `--motion-ease` 패밀리.
          duration: MOTION.settle.duration * 1000,
          easing: `cubic-bezier(${MOTION_EASE.join(", ")})`,
          fill: "both",
        },
      );
      anim.onfinish = () => {
        el.style.transform = "";
        el.removeAttribute("data-flip-animating");
      };
    }
    satPrevRects.current = next;
  });

  // Commit convergence — on 확인하고 저장 a summary chip fades/slides toward the
  // save button (one --motion-settle beat), then the real save (toast) lands.
  const [converging, setConverging] = useState(false);
  const convergeTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (convergeTimer.current !== null) window.clearTimeout(convergeTimer.current);
    },
    [],
  );
  const runSave = useCallback(() => {
    // reduced motion (or nothing to summarize) → straight to save.
    if (reduceMotion || !props.summary) {
      onSave();
      return;
    }
    setConverging(true);
    if (convergeTimer.current !== null) window.clearTimeout(convergeTimer.current);
    convergeTimer.current = window.setTimeout(() => setConverging(false), 240);
    onSave();
  }, [reduceMotion, props.summary, onSave]);

  // Create-mode card grows to keep the near-dup banner inside its dashed border.
  const cardH =
    mode === "create"
      ? props.createSimilarHit
        ? CARD_CREATE_H_WARN
        : CARD_CREATE_H
      : CARD.h;
  const cardTop = CY - cardH / 2;
  const cardBottom = CY + cardH / 2;
  const cardLeft = CX - CARD.w / 2;
  const cardRight = CX + CARD.w / 2;

  const layouts = useMemo(
    () => bearings.map((b) => ({ view: b, layout: layoutLane(b, cardH) })),
    [bearings, cardH],
  );

  // Vertically center the actual cluster (card + sockets + satellites + folds) in
  // the stage so the top/bottom margins balance instead of the fixed 600 board.
  const contentOffsetY = useMemo(() => {
    let minY = cardTop;
    let maxY = cardBottom;
    for (const { layout } of layouts) {
      if (layout.socket) {
        minY = Math.min(minY, layout.socket.y - 18); // room for the eyebrow/label row
        maxY = Math.max(maxY, layout.socket.y + layout.socket.h);
      }
      for (const s of layout.sats) {
        minY = Math.min(minY, s.y - 20); // lane-head label sits ~20px above
        maxY = Math.max(maxY, s.y + SAT.h);
      }
      if (layout.fold) maxY = Math.max(maxY, layout.fold.y + 30);
      if (layout.addChip) {
        minY = Math.min(minY, layout.addChip.y);
        maxY = Math.max(maxY, layout.addChip.y + layout.addChip.h);
      }
    }
    return CY - (minY + maxY) / 2;
  }, [layouts, cardTop, cardBottom]);

  const openLayout = layouts.find((l) => l.view.relation === openRelation) ?? null;
  // The bearing whose lane + card border should read as "lit": an explicit hover
  // wins; otherwise an open socket picker keeps its own bearing connected.
  const openBearing = openLayout?.view.bearing ?? null;
  const activeBearing = hoveredBearing ?? openBearing;
  const pickerRows = openRelation ? candidatesFor(openRelation, query) : [];
  const similarHit =
    openRelation && similarFor ? similarFor(openRelation, query) : null;

  // #62 — 무대 위 임시 표면은 서로 배타적이다. 예전엔 '+90 더 보기' 접힘
  // 목록이 열린 채 소켓 피커가 그 위에 그대로 쌓여, 아래 목록이 반쯤 가린
  // 상태로 둘 다 살아 있었다(opus5 검수 스크린샷). 피커를 열 때 접힘 목록·
  // 관계 편집 카드·작업중 패널을 함께 닫는다.
  const openPicker = (relation: StudioRelation) => {
    setOpenFold(null);
    setOpenEdit(null);
    setDraftsOpen(false);
    setOpenRelation((cur) => (cur === relation ? null : relation));
    setQuery("");
  };
  const pick = (candidate: CreateCandidate) => {
    if (!openRelation) return;
    onFill(openRelation, candidate);
    setOpenRelation(null);
    setQuery("");
  };

  // ── 산책 (Slice 4) + 도착 방향잡기 ──────────────────────────────────────────
  // "산책" = 무대를 다른 노드로 재중심(위성 / 접힘 행 / 상단 검색 / 되돌아가기).
  //
  // 예전엔 저장 대기 변경이 있으면 확인 팝업으로 막았다(저장하고 이동 / 버리고
  // 이동 / 계속 편집). #60 에서 저장 전 변경이 노드별 초안으로 자동 보존되면서
  // 그 팝업은 순수 마찰이 됐다 — 걸어가도 초안은 남고, 돌아오면 그대로다.
  // 소유자 방향: "요즘엔 귀찮은것도 싫은데". 그래서 산책은 이제 그냥 걷는다.
  const guardedOpen = (id: string) => {
    if (!props.onOpenNode) return;
    // 열려 있던 임시 표면은 함께 닫는다 — 새 무대에 남의 팝오버가 따라오면 안 된다.
    setOpenRelation(null);
    setOpenFold(null);
    setOpenEdit(null);
    props.onOpenNode(id);
  };

  // Arrival orientation (#3): the node we came FROM is a neighbor of the new focal
  // by definition — light its satellite for ~1.5s so "where I came from" reads.
  // Full opacity holds, then a short opacity fade (color-only, no glow). Reduced
  // motion snaps it off at the same 1.5s mark (motion-reduce disables the fade).
  const arrivedFrom = props.arrivedFrom ?? null;
  const [arrivalLit, setArrivalLit] = useState(Boolean(arrivedFrom));
  useEffect(() => {
    if (!arrivedFrom) return;
    const timer = window.setTimeout(() => setArrivalLit(false), 1500);
    return () => window.clearTimeout(timer);
  }, [arrivedFrom]);

  // #68 — Esc 는 작업중 패널도 닫는다(비-모달, 관계 편집 카드와 같은 문법).
  useEffect(() => {
    if (!draftsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setDraftsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draftsOpen]);

  // Slice 5 — Esc closes the save-preview modal (scrim + ✕ close inline below).
  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen]);

  // The relation edit card is an anchored nonmodal surface: keyboard focus
  // remains on the satellite's edit trigger, so one global Escape closes only
  // this card and naturally leaves focus at that trigger.
  useEffect(() => {
    if (!openEdit) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpenEdit(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openEdit]);

  // 소켓 피커도 같은 계약 — Esc 로 닫힌다. 최종 검수에서 이것만 빠져 있었다:
  // 관계 편집 카드 · 미리보기 · 작업중 패널엔 Esc 가 있는데 피커는 없어서, 검색
  // 입력에 포커스가 들어간 뒤 키보드만으로 빠져나올 방법이 없었다. 닫힌 뒤
  // 포커스는 소켓 트리거에 남는다(앵커 비-모달 문법).
  useEffect(() => {
    if (!openRelation) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpenRelation(null);
      setQuery("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openRelation]);

  const saveAllowed = props.canSave !== false;
  const effectiveSummary = saveAllowed ? (props.summary ?? null) : null;
  const previewAvailable = saveAllowed && Boolean(props.deltaPreview?.hasDelta);

  /**
   * 무대 콘텐츠 폭을 재서 보드를 클램프한다 — 왜 축소인지, 대가가 무엇인지는
   * `lib/board-scale.ts`. 여기서는 **재는 일만** 한다.
   *
   * 초기값 0 은 "아직 안 쟀다" 다 — `studioBoardScale` 이 그때 1 을 돌려주므로
   * 첫 프레임이 축소로 깜빡이지 않는다.
   */
  const [stageWidth, setStageWidth] = useState(0);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setStageWidth(box.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const boardScale = studioBoardScale(stageWidth);

  return (
    <main
      ref={stageRef}
      id="main"
      className="relative grid h-[100dvh] min-h-0 grid-rows-[52px_1fr_64px] overflow-hidden bg-[color:var(--color-canvas)]"
      data-testid="studio-compass-stage"
    >
      {/* ── Top bar ── */}
      <header className="relative z-[7] flex items-center gap-3.5 border-b border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5">
        <NodeSearch
          placeholder={labels.searchPlaceholder}
          nodes={props.searchNodes}
          kindLabelFor={kindLabelFor}
          pickerKind={labels.pickerKind}
          emptyLabel={labels.pickerEmpty}
          currentName={focal.name}
          onOpenNode={props.onOpenNode ? guardedOpen : undefined}
        />
        {props.backTo ? (
          <button
            type="button"
            data-testid="studio-walk-back"
            onClick={() => guardedOpen(props.backTo!.id)}
            aria-label={labels.walkBackAria(props.backTo.label)}
            title={labels.walkBackAria(props.backTo.label)}
            className="flex h-[30px] max-w-[180px] items-center gap-1.5 rounded-lg border border-[color:var(--color-border-soft)] px-2.5 text-caption text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-secondary)]"
          >
            <ArrowLeft size={13} aria-hidden className="flex-none text-[color:var(--color-text-quaternary)]" />
            <span className="min-w-0 truncate [word-break:keep-all]">{props.backTo.label}</span>
          </button>
        ) : null}
        <div className="flex items-center gap-2 text-caption text-[color:var(--color-text-tertiary)]">
          <h1
            ref={headingRef}
            tabIndex={-1}
            data-testid="studio-stage-heading"
            className="font-semibold text-[color:var(--color-text-secondary)] outline-none"
          >
            {focal.name || "—"}
          </h1>
          <span className="text-[color:var(--color-text-quaternary)]">·</span>
          <span className="rounded-[5px] border border-[color:var(--color-border-soft)] px-1.5 py-px text-label tracking-[0.02em]">
            {focal.kindLabel}
          </span>
          {focal.domainLabel ? (
            <>
              <span className="text-[color:var(--color-text-quaternary)]">·</span>
              <span>{focal.domainLabel}</span>
            </>
          ) : null}
        </div>
        {/* #68 — 우측 상단 도구 묶음: 미리보기 · 작업중 · 그만하기.
            하단 바를 전폭으로 늘려 놓던 조작들을 헤더로 올려, 하단은 "진행
            상태 + 기록될 내용 + 저장" 만 남긴다(소유자: 하단 바 "그 자체가 좀
            이상한데 필요한거야?"). */}
        <div className="relative ml-auto flex items-center gap-2">
          {previewAvailable ? (
            <button
              type="button"
              data-testid="studio-preview-open"
              onClick={() => {
                setDraftsOpen(false);
                setPreviewOpen(true);
              }}
              className="flex h-[30px] items-center gap-1.5 rounded-lg border border-[color:var(--color-border-soft)] px-3 text-caption text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]"
            >
              <Eye size={13} aria-hidden className="text-[color:var(--color-text-quaternary)]" />
              {labels.previewOpen}
            </button>
          ) : null}
          {drafts.length > 0 ? (
            <button
              type="button"
              data-testid="studio-drafts-open"
              aria-expanded={draftsOpen}
              aria-label={labels.draftsOpenAria(drafts.length)}
              onClick={() => {
                // #62 — 작업중 패널도 무대 위 임시 표면을 밀어낸다.
                setOpenRelation(null);
                setOpenFold(null);
                setOpenEdit(null);
                setDraftsOpen((v) => !v);
              }}
              className={cn(
                "flex h-[30px] items-center gap-1.5 rounded-lg border px-3 text-caption transition-colors",
                draftsOpen
                  ? "border-[color:var(--color-indigo-line-a45)] bg-[color:var(--color-indigo-a12)] text-[color:var(--color-indigo-accent)]"
                  : "border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]",
              )}
            >
              <FilePen size={13} aria-hidden className="text-[color:var(--color-text-quaternary)]" />
              {labels.draftsOpen(drafts.length)}
            </button>
          ) : null}
          <button
            type="button"
            // 저장 전 변경은 자동 임시저장되므로 그만하기에 확인이 필요 없다(#60) —
            // 나가도 초안은 남고, 돌아오면 그대로다.
            onClick={onExit}
            data-testid="studio-exit"
            className="flex h-[30px] items-center gap-1.5 rounded-lg border border-[color:var(--color-border-soft)] px-3 text-caption text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
          >
            <span className="text-[color:var(--color-text-quaternary)]">✕</span> {labels.exit}
          </button>
        </div>
      </header>

      {/* ── Compass board ── */}
      <div
        className="relative min-h-0 overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(var(--color-divider) 1px, transparent 1px)",
          backgroundSize: "34px 34px",
          backgroundPosition: "14px 12px",
        }}
      >
        {/* flow cue — top-left wayfinding */}
        <div className="absolute left-12 top-8 z-[4] flex items-center gap-3" data-testid="studio-flow-cue">
          <MiniRose bearings={bearings} />
          <div className="flex flex-col gap-1">
            <span className="text-label uppercase tracking-[0.05em] text-[color:var(--color-text-quaternary)]">
              {labels.flowEyebrow}
            </span>
            <span className="text-body text-[color:var(--color-text-secondary)]">
              {labels.flowCount(filledBearings, 4)}
            </span>
            {mode === "enhance" && focal.domainLabel ? (
              <span
                data-testid="studio-domain-membership"
                className="text-label text-[color:var(--color-text-quaternary)] [word-break:keep-all]"
              >
                {labels.domainMembership(focal.domainLabel)}
              </span>
            ) : null}
          </div>
        </div>

        {/* one calm frame prompt — top center */}
        <div className="absolute left-1/2 top-4 z-[4] flex -translate-x-1/2 flex-col items-center gap-1 text-center">
          {/* #6 — was `text-callout` (unregistered ramp step → root 16px). Pin to
              the nearest real step so it stays the calm largest label, no drift. */}
          <div className="whitespace-nowrap text-body-lg tracking-[-0.006em] text-[color:var(--color-text-secondary)]">
            {labels.framePrompt(focal.name || "…")}
          </div>
          {/* C2 — quiet origin context: this new node continues A's bearing. */}
          {mode === "create" && props.createOriginNote ? (
            <div
              data-testid="studio-create-origin-note"
              className="max-w-[420px] text-label text-[color:var(--color-text-quaternary)] [word-break:keep-all]"
            >
              {props.createOriginNote}
            </div>
          ) : null}
        </div>

        {/* rare relations — top right. Not built yet: honest disabled "곧 제공"
            rather than a dead affordance (house rule: no dead click targets). */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          title={props.moreRelationsSoon}
          className="absolute right-5 top-3.5 z-[4] flex h-7 cursor-default items-center gap-1.5 rounded-lg border border-[color:var(--color-border-soft)] px-2.5 text-caption text-[color:var(--color-text-quaternary)] opacity-60"
        >
          <span className="text-[color:var(--color-text-quaternary)]">＋</span> {labels.moreRelations}
          {props.moreRelationsSoon ? (
            <span className="ml-0.5 rounded-[4px] border border-[color:var(--color-border-soft)] px-1 py-px text-label tracking-[0.02em] text-[color:var(--color-text-quaternary)]">
              {props.moreRelationsSoon}
            </span>
          ) : null}
        </button>

        {/* the fixed-coordinate board — centered on its actual content so the
            top/bottom stage margins balance in either fill-state (#7). */}
        <div
          className="absolute left-1/2 top-1/2"
          data-board-scale={boardScale}
          style={{
            width: BOARD.w,
            height: BOARD.h,
            // 축소는 **좌표계를 건드리지 않는다** — 배치·히트테스트 계산은
            // 전부 보드 px 그대로 두고, 브라우저가 그 위에 배율만 얹는다.
            // 세로 오프셋은 배율을 곱한다: `translate` 는 부모 좌표계라
            // 안 곱하면 축소된 콘텐츠가 그만큼 어긋난 자리에 앉는다.
            transform: `translate(-50%, calc(-50% + ${contentOffsetY * boardScale}px)) scale(${boardScale})`,
          }}
        >
          {/* struts overlay */}
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={BOARD.w}
            height={BOARD.h}
            viewBox={`0 0 ${BOARD.w} ${BOARD.h}`}
            aria-hidden
          >
            {layouts.map(({ view, layout }) => {
              const lit = view.bearing === activeBearing;
              // A staged (not-yet-saved) filled lane flows a slow indigo dash —
              // the map's comet grammar — so a pending connection reads as alive.
              const flowing = view.filled && Boolean(view.staged);
              const stroke = view.filled
                ? lit
                  ? "var(--color-indigo-hover)"
                  : "var(--color-indigo-brand)"
                : lit
                  ? "var(--color-indigo-hover)"
                  : view.expected
                    ? "var(--color-amber-muted-a62)"
                    : "var(--color-border-strong)";
              return layout.struts.map((d, i) => (
                <path
                  key={`${view.bearing}-${i}`}
                  d={d}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn(
                    "transition-[stroke] duration-[var(--motion-base)] motion-reduce:transition-none",
                    flowing && "studio-strut-flow",
                  )}
                  stroke={stroke}
                  strokeWidth={view.filled || lit ? 1.75 : 1.5}
                  strokeDasharray={flowing ? "5 7" : view.filled ? undefined : "4 6"}
                />
              ));
            })}
            {layouts.map(({ view }) =>
              view.filled && (view.bearing === "left" || view.bearing === "right") ? (
                <circle
                  key={`dot-${view.bearing}`}
                  cx={view.bearing === "right" ? CX + CARD.w / 2 + 62 : CX - CARD.w / 2 - 62}
                  cy={CY}
                  r={2}
                  fill="var(--color-indigo-brand)"
                />
              ) : null,
            )}
          </svg>

          {/* center focal / draft card */}
          <CenterCard
            {...props}
            cardH={cardH}
            cardTop={cardTop}
            cardLeft={cardLeft}
            bearings={bearings}
            activeBearing={activeBearing}
          />

          {/* lanes — staggered entrance: card is 0ms, each lane +40ms after. */}
          {layouts.map(({ view, layout }, laneIndex) => (
            <LaneRender
              key={view.bearing}
              view={view}
              layout={layout}
              labels={labels}
              kindLabelFor={kindLabelFor}
              stageDelayMs={reduceMotion ? 0 : 40 * (laneIndex + 1)}
              registerSat={registerSat}
              onOpen={() => openPicker(view.relation)}
              onOpenNode={props.onOpenNode ? guardedOpen : undefined}
              onHoverBearing={setHoveredBearing}
              arrivalId={arrivedFrom}
              arrivalLit={arrivalLit}
              onToggleFold={() => {
                // #62 — 접힘 목록도 같은 배타 규칙을 받는다.
                setOpenRelation(null);
                setOpenEdit(null);
                setDraftsOpen(false);
                setOpenFold((cur) => (cur === view.bearing ? null : view.bearing));
              }}
              foldOpen={openFold === view.bearing}
              onCloseFold={() => setOpenFold(null)}
              onEditNeighbor={
                props.onRetype || props.onRemove
                  ? (neighbor) => {
                      setOpenEdit({ relation: view.relation, neighbor });
                      setOpenFold(null);
                    }
                  : undefined
              }
              pendingNeighborIds={props.pendingNeighborIds}
            />
          ))}

          {/* inline anchored picker — anchors to the empty socket OR (C4) to the
              filled lane's "＋ 더 잇기" add chip (same {x,y,w,h} shape). */}
          {openRelation && openLayout && (openLayout.layout.socket ?? openLayout.layout.addChip) ? (
            <InlinePicker
              key={openRelation}
              socket={(openLayout.layout.socket ?? openLayout.layout.addChip)!}
              bearing={openLayout.view.bearing}
              cardLeft={cardLeft}
              cardRight={cardRight}
              relation={openRelation}
              question={bearings.find((b) => b.relation === openRelation)?.question ?? ""}
              labels={labels}
              rows={pickerRows}
              similarHit={similarHit}
              discoveryFor={props.discoveryFor}
              kindLabelFor={kindLabelFor}
              query={query}
              onQuery={setQuery}
              onPick={pick}
              onClose={() => setOpenRelation(null)}
              onCreateNew={props.onCreateNew}
            />
          ) : null}

          {/* inline anchored edit card (Slice 1 — 지지대 편집) */}
          {openEdit ? (
            <InlineEditCard
              relation={openEdit.relation}
              neighbor={openEdit.neighbor}
              bearing={layouts.find((l) => l.view.relation === openEdit.relation)?.view.bearing ?? "right"}
              layout={layouts.find((l) => l.view.relation === openEdit.relation)?.layout ?? null}
              cardLeft={cardLeft}
              cardRight={cardRight}
              labels={labels}
              editable={props.editabilityOf?.(openEdit.relation, openEdit.neighbor) ?? false}
              bearingLabelFor={props.bearingLabelFor ?? ((r) => r)}
              onRetype={(to) => {
                props.onRetype?.(openEdit.relation, to, openEdit.neighbor);
                setOpenEdit(null);
              }}
              onRemove={() => {
                props.onRemove?.(openEdit.relation, openEdit.neighbor);
                setOpenEdit(null);
              }}
              onOpenOther={() => {
                const target = openEdit.neighbor.id;
                setOpenEdit(null);
                guardedOpen(target);
              }}
              onClose={() => setOpenEdit(null)}
            />
          ) : null}
        </div>
      </div>

      {/* ── Record summary — quiet expandable line above the bottom bar ── */}
      {effectiveSummary && summaryOpen ? (
        <div
          data-testid="studio-summary-panel"
          className="pointer-events-auto absolute bottom-16 left-0 right-0 z-[9] border-t border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] px-5 py-3"
          style={{ boxShadow: "0 -12px 30px rgba(0,0,0,.35)" }}
        >
          <p className="text-caption font-medium text-[color:var(--color-text-secondary)] [word-break:keep-all]">
            {effectiveSummary.headline}
          </p>
          {effectiveSummary.lines.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {effectiveSummary.lines.map((line, i) => (
                <li
                  key={`${line}-${i}`}
                  data-testid={`studio-summary-line-${i}`}
                  className="flex items-start gap-2 text-caption text-[color:var(--color-text-tertiary)]"
                >
                  <span aria-hidden className="mt-1.5 h-1 w-1 flex-none rounded-full bg-[color:var(--color-indigo-brand)]" />
                  <span className="min-w-0 flex-1 [word-break:keep-all]">{line}</span>
                  {props.onUndoChange ? (
                    <button
                      type="button"
                      data-testid={`studio-summary-undo-${i}`}
                      aria-label={labels.summaryUndo}
                      onClick={() => props.onUndoChange?.(i)}
                      className="flex-none text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                    >
                      <X size={12} aria-hidden />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {effectiveSummary.fileEffect ? (
            <p className="mt-2 text-label text-[color:var(--color-text-quaternary)]">{effectiveSummary.fileEffect}</p>
          ) : null}
        </div>
      ) : null}

      {/* ── Bottom bar ── one rhythm: 32px controls, 8/12px gaps, aligned centers.
          The summary + 미리보기 chips share one quiet class family; the save
          button is the single filled control. Identical in both fill-states. */}
      <footer className="relative z-[6] flex items-center gap-3 border-t border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="h-4 w-4 flex-none rounded-[3px]"
            style={{
              borderTop: "1.4px dashed var(--color-border-strong)",
              borderBottom: "1.4px dashed var(--color-border-strong)",
              borderLeft: "1.6px solid var(--color-indigo-brand)",
              borderRight: "1.6px solid var(--color-indigo-brand)",
            }}
          />
          <span className="text-caption text-[color:var(--color-text-secondary)]" data-testid="studio-bottom-progress">
            {labels.bottomProgress(filledBearings, 4)}
          </span>
        </div>
        {effectiveSummary ? (
          <button
            type="button"
            data-testid="studio-summary-toggle"
            aria-expanded={summaryOpen}
            onClick={() => setSummaryOpen((v) => !v)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[color:var(--color-border-soft)] px-3 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]"
          >
            {effectiveSummary.collapsed}
            <ChevronDown size={12} aria-hidden className={cn("text-[color:var(--color-text-quaternary)] transition-transform", summaryOpen && "rotate-180")} />
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-label text-[color:var(--color-text-quaternary)]">
            {props.createSlugCollision
              ? labels.createSlugCollisionHint
              : mode === "enhance" && effectiveSummary === null
                ? labels.commitEmptyHint
                : labels.saveHint}
          </span>
          {/* #2 commit convergence — a summary chip slides toward the save button
              for one --motion-settle beat as the write commits (then the toast). */}
          {converging && effectiveSummary ? (
            <span
              aria-hidden
              data-testid="studio-commit-converge"
              className="studio-summary-converge pointer-events-none absolute right-[128px] top-1/2 z-[7] -translate-y-1/2 whitespace-nowrap rounded-md border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-a12)] px-2 py-1 text-label font-medium text-[color:var(--color-indigo-accent)]"
              style={
                {
                  "--studio-converge-x": "104px",
                  "--studio-converge-y": "0px",
                } as React.CSSProperties
              }
            >
              {effectiveSummary.collapsed}
            </span>
          ) : null}
          <button
            type="button"
            data-testid="studio-save"
            disabled={props.canSave === false}
            onClick={runSave}
            className="flex h-8 items-center gap-2 rounded-lg bg-[color:var(--color-indigo-brand)] px-4 text-caption font-semibold text-white transition-colors hover:bg-[color:var(--color-indigo-hover)] disabled:opacity-40"
          >
            {mode === "create" ? <Check size={15} aria-hidden /> : null}
            {labels.save}
          </button>
        </div>
      </footer>


      {/* ── #68 — 작업중 목록 (in-progress drafts) ──
          우측에서 밀려나오는 비-모달 패널. 저장 전 변경이 노드별 초안으로 남는다는
          약속(#60)을 눈에 보이게 만드는 곳 — "어디에 남았지?" 를 묻지 않게 한다.
          비-모달이므로 무대를 가리지 않고, Esc 로 닫힌다. */}
      {draftsOpen ? (
        <div
          data-testid="studio-drafts-panel"
          role="dialog"
          aria-label={labels.draftsTitle}
          className="studio-fade-in absolute right-3 top-[52px] z-[11] flex w-[288px] flex-col rounded-[12px] border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)]"
          style={{ boxShadow: "0 12px 34px rgba(0,0,0,.5)", maxHeight: "min(420px, calc(100% - 96px))" }}
        >
          <div className="flex items-start gap-2 px-3.5 pt-3">
            <div className="min-w-0 flex-1">
              <p className="text-caption font-semibold text-[color:var(--color-text-secondary)]">
                {labels.draftsTitle}
              </p>
              <p className="mt-1 text-label leading-label text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
                {labels.draftsHint}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDraftsOpen(false)}
              aria-label={labels.draftsCloseAria}
              className="-mr-1 flex h-6 w-6 flex-none items-center justify-center rounded-md text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
            >
              <X size={13} aria-hidden />
            </button>
          </div>
          <ul className="mt-2.5 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {drafts.map((draft) => {
              const isCurrent = draft.focalId === props.focalId;
              return (
                <li key={draft.focalId} data-testid={`studio-draft-row-${draft.focalId}`}>
                  <div className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-[color:var(--color-overlay-1)]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-caption text-[color:var(--color-text-primary)]">
                        {draft.title}
                      </p>
                      <p className="mt-0.5 text-label text-[color:var(--color-text-quaternary)]">
                        {isCurrent ? labels.draftsCurrent : labels.draftsCount(draft.count)}
                      </p>
                    </div>
                    {!isCurrent && props.onOpenDraft ? (
                      <button
                        type="button"
                        data-testid={`studio-draft-resume-${draft.focalId}`}
                        onClick={() => {
                          setDraftsOpen(false);
                          props.onOpenDraft?.(draft.focalId);
                        }}
                        className="flex h-7 flex-none items-center rounded-md border border-[color:var(--color-indigo-line-a32)] px-2 text-label text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)]"
                      >
                        {labels.draftsResume}
                      </button>
                    ) : null}
                    {props.onDiscardDraft ? (
                      <button
                        type="button"
                        data-testid={`studio-draft-discard-${draft.focalId}`}
                        onClick={() => props.onDiscardDraft?.(draft.focalId)}
                        aria-label={labels.draftsDiscardAria(draft.title)}
                        title={labels.draftsDiscard}
                        className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-danger-a12)] hover:text-[color:var(--color-danger-text)]"
                      >
                        <X size={12} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {drafts.length === 0 ? (
              <li className="px-1.5 py-3 text-caption text-[color:var(--color-text-quaternary)]">
                {labels.draftsEmpty}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {/* ── Save preview (Slice 5) — 그래프 델타 미니뷰 ──
          A scrim modal (real modality) showing the focal node's existing
          neighborhood achromatic + only the staged delta in indigo, then the
          same plain sentence list. Commits directly from the footer (one-click
          save contract preserved) or closes. ✕ / scrim / Esc all close it. */}
      {previewOpen && previewAvailable && props.deltaPreview ? (
        <DeltaPreviewModal
          layout={props.deltaPreview}
          labels={labels}
          kindLabelFor={kindLabelFor}
          summary={effectiveSummary}
          canSave={saveAllowed}
          onSave={() => {
            if (!saveAllowed) return;
            setPreviewOpen(false);
            onSave();
          }}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </main>
  );
}

// ── Center focal / draft card ────────────────────────────────────────────────
function CenterCard(
  props: StudioCompassProps & {
    cardH: number;
    cardTop: number;
    cardLeft: number;
    bearings: CompassBearingView[];
    /** Bearing whose side-border should brighten with its lit lane (연관 강조). */
    activeBearing?: StudioBearing | null;
  },
) {
  const { mode, focal, cardH, cardTop, cardLeft, bearings, activeBearing } = props;
  const [defExpanded, setDefExpanded] = useState(false);
  const definition = focal.definition || "";
  const definitionLong = definition.length > 120;
  const borderFor = (bearing: StudioBearing) => {
    const v = bearings.find((b) => b.bearing === bearing);
    const lit = bearing === activeBearing;
    if (v?.filled) return `2px solid ${lit ? "var(--color-indigo-hover)" : "var(--color-indigo-brand)"}`;
    if (lit) return "2px solid var(--color-indigo-hover)";
    if (v?.expected) return "1.5px dashed var(--color-amber-muted-a62)";
    return "1.5px dashed var(--color-border-strong)";
  };
  return (
    <div
      className="studio-stage-in absolute flex flex-col rounded-[14px] bg-[color:var(--color-elevated)] px-[22px] py-[18px] transition-[border-color] duration-[var(--motion-base)] motion-reduce:transition-none"
      data-testid="studio-center-card"
      style={{
        left: cardLeft,
        top: cardTop,
        width: CARD.w,
        height: cardH,
        borderTop: borderFor("up"),
        borderBottom: borderFor("down"),
        borderRight: borderFor("right"),
        borderLeft: borderFor("left"),
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {mode === "create" && props.createKinds ? (
          // ③ 2026-07-28 — 이 세그먼트는 **스키마 kind**(project/domain/
          // capability/element)를 고르는 자리이고, 위(UP) 소켓은 **관계**
          // (SKOS `broader` — 어느 개념의 하위인가)를 잇는 자리다. 다른 사실
          // 둘인데 화면에서는 이 그룹에 이름이 없어(시각·aria 모두) 칩이
          // 소켓의 답처럼 읽혔다. 한 단어 라벨이 두 질문을 갈라 세운다 —
          // 칩 = "넷 중 무엇", 소켓 = "어느 개념의 하위".
          <>
            <span
              id={CREATE_KIND_LABEL_ID}
              className="text-label text-[color:var(--color-text-tertiary)]"
            >
              {props.labels.createKindLabel}
            </span>
            <div
              role="group"
              aria-labelledby={CREATE_KIND_LABEL_ID}
              className="flex gap-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[3px]"
            >
            {props.createKinds.map((k) => (
              <button
                key={k.value}
                type="button"
                data-testid={`studio-create-kind-${k.value}`}
                aria-pressed={props.createKind === k.value}
                onClick={() => props.onCreateKind?.(k.value)}
                className={cn(
                  "rounded-[5px] px-2 py-1 text-label transition-colors",
                  props.createKind === k.value
                    ? "bg-[color:var(--color-indigo-a16)] text-[color:var(--color-indigo-text-soft)] font-semibold"
                    : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]",
                )}
              >
                {k.label}
              </button>
            ))}
            </div>
          </>
        ) : (
          <>
            <span className="rounded-[5px] border border-[color:var(--color-indigo-a24)] bg-[color:var(--color-indigo-a12)] px-1.5 py-px text-label tracking-[0.03em] text-[color:var(--color-indigo-text-soft)]">
              {focal.kindLabel}
            </span>
            {focal.domainLabel ? (
              <span className="text-caption text-[color:var(--color-text-tertiary)]">{focal.domainLabel}</span>
            ) : null}
          </>
        )}
      </div>

      {/* 무대의 주인공 = 이 이름. 램프 상단(display 23px)으로 세운다.
          예전엔 램프에 없는 스텝을 부르고 있어 루트 16px 로 렌더됐고, 그래서
          위성 카드 이름(12.5px)과 위계가 1.28배밖에 안 벌어져 있었다 —
          "무엇의 의미를 채우는 중인가" 가 화면에서 가장 큰 글자가 아니었다.
          hero(30px) 는 카드 높이가 고정(172px)이라 못 쓴다: 14자 한글 이름이
          2행으로 꺾이며 하단 패딩을 1px 넘어선다(실측). display 는 1행 유지
          + 여백 38px. tracking 은 램프가 못 박은 짝(--tracking-display)을 쓴다. */}
      {mode === "create" ? (
        <input
          data-testid="studio-create-name"
          aria-invalid={props.createSlugCollision || undefined}
          aria-describedby={props.createSlugCollision ? CREATE_SLUG_COLLISION_ID : undefined}
          value={focal.name}
          onChange={(e) => props.onCreateName?.(e.target.value)}
          placeholder={props.labels.createNamePlaceholder}
          className="w-full bg-transparent text-display font-semibold leading-display-tight tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)] outline-none [word-break:keep-all] placeholder:font-normal placeholder:text-[color:var(--color-text-quaternary)]"
        />
      ) : (
        <div className="text-display font-semibold leading-display-tight tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
          {focal.name}
        </div>
      )}

      {/* C12③ — quiet optional secondary-locale name (other-locale display). */}
      {mode === "create" && props.onCreateSecondaryName ? (
        <input
          data-testid="studio-create-name-secondary"
          value={props.createSecondaryName ?? ""}
          onChange={(e) => props.onCreateSecondaryName?.(e.target.value)}
          placeholder={props.createSecondaryNamePlaceholder}
          aria-label={props.createSecondaryNamePlaceholder}
          className="mt-2 w-full bg-transparent text-caption text-[color:var(--color-text-tertiary)] outline-none [word-break:keep-all] placeholder:text-[color:var(--color-text-quaternary)]"
        />
      ) : null}

      {mode === "create" && props.createDomains && props.createDomains.length > 0 ? (
        <div className="mt-3">
          <Select
            data-testid="studio-create-domain"
            ariaLabel={props.labels.createDomainNone}
            value={props.createDomainValue ?? ""}
            onChange={(v) => props.onCreateDomain?.(v || null)}
            options={[
              { value: "", label: props.labels.createDomainNone },
              ...props.createDomains.map((d) => ({ value: d.value, label: d.title })),
            ]}
          />
        </div>
      ) : null}

      {mode === "create" ? (
        <textarea
          data-testid="studio-create-definition"
          value={focal.definition}
          onChange={(e) => props.onCreateDefinition?.(e.target.value)}
          placeholder={props.labels.createDefinitionPlaceholder}
          className="mt-3 min-h-[60px] w-full flex-1 resize-none bg-transparent text-caption leading-caption text-[color:var(--color-text-tertiary)] outline-none [word-break:keep-all] placeholder:text-[color:var(--color-text-quaternary)]"
        />
      ) : definition ? (
        <div className="relative mt-3">
          <div className="max-w-[322px] text-caption leading-caption text-[color:var(--color-text-tertiary)] line-clamp-3 [word-break:keep-all]">
            {definition}
          </div>
          {definitionLong ? (
            <button
              type="button"
              data-testid="studio-def-more"
              onClick={() => setDefExpanded((v) => !v)}
              className="mt-1 text-label font-medium text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
            >
              {defExpanded ? props.labels.defLess : props.labels.defMore}
            </button>
          ) : null}
          {defExpanded ? (
            <div
              className="absolute left-0 top-full z-[5] mt-1 max-h-[220px] w-[calc(100%+8px)] overflow-y-auto rounded-[10px] border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] p-3 text-caption leading-caption text-[color:var(--color-text-secondary)] [word-break:keep-all]"
              style={{ boxShadow: "0 12px 34px rgba(0,0,0,.5)" }}
            >
              {definition}
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "create" && props.createSimilarHit ? (
        <div
          id={props.createSlugCollision ? CREATE_SLUG_COLLISION_ID : undefined}
          data-testid="studio-create-similar"
          aria-live="polite"
          aria-atomic="true"
          className="mt-2 flex items-start gap-2 rounded-[8px] border px-2.5 py-1.5 text-label leading-label text-[color:var(--color-text-tertiary)]"
          style={{ borderColor: "var(--color-amber-muted-a34)", background: "var(--color-amber-muted-a18)" }}
        >
          <TriangleAlert
            size={14}
            aria-hidden
            className="mt-0.5 flex-none text-[color:var(--color-amber-muted-a62)]"
          />
          <span className="min-w-0">
            {props.createSlugCollision
              ? props.labels.createSlugCollision(
                  props.createSimilarHit.title,
                  props.kindLabelFor(props.createSimilarHit.kind),
                )
              : props.labels.createSimilar(
                  props.createSimilarHit.title,
                  props.kindLabelFor(props.createSimilarHit.kind),
                )}{" "}
            <button
              type="button"
              onClick={() => props.onOpenSimilar?.(props.createSimilarHit!.slug)}
              className="font-semibold text-[color:var(--color-indigo-text-soft)]"
            >
              {props.labels.createSimilarOpen}
            </button>
            {!props.createSlugCollision ? (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => props.onDismissSimilar?.()}
                  className="text-[color:var(--color-text-quaternary)]"
                >
                  {props.labels.createSimilarAnyway}
                </button>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ── One lane (satellites / socket / lane head + fold) ────────────────────────
function LaneRender({
  view,
  layout,
  labels,
  kindLabelFor,
  stageDelayMs = 0,
  registerSat,
  onOpen,
  onOpenNode,
  onHoverBearing,
  arrivalId,
  arrivalLit,
  onToggleFold,
  foldOpen,
  onCloseFold,
  onEditNeighbor,
  pendingNeighborIds,
}: {
  view: CompassBearingView;
  layout: LaneLayout;
  labels: StudioCompassLabels;
  kindLabelFor: (kind: string) => string;
  /** Stage-entrance stagger delay for this lane's leaves (#2). 0 under reduced motion. */
  stageDelayMs?: number;
  /** Board-level FLIP registry — satellite id → its DOM node (#2). */
  registerSat?: (id: string, el: HTMLElement | null) => void;
  onOpen: () => void;
  onOpenNode?: (id: string) => void;
  /** Report this lane's bearing as hover/focus-active (연관 강조 pair light-up). */
  onHoverBearing?: (bearing: StudioBearing | null) => void;
  /** Satellite id eligible for the one-shot arrival highlight (null → none). */
  arrivalId?: string | null;
  /** Whether the arrival highlight is still lit (drives the color-only fade). */
  arrivalLit?: boolean;
  onToggleFold: () => void;
  foldOpen: boolean;
  onCloseFold: () => void;
  onEditNeighbor?: (neighbor: StudioSatellite) => void;
  pendingNeighborIds?: ReadonlySet<string>;
}) {
  const satNav = (id: string) => {
    if (onOpenNode) return () => onOpenNode(id);
    return undefined;
  };
  // 연관 강조 — report this lane as active on hover/focus so its strut + the
  // card's same-side border brighten together (handled up in StudioCompass).
  const hoverProps = onHoverBearing
    ? {
        onMouseEnter: () => onHoverBearing(view.bearing),
        onMouseLeave: () => onHoverBearing(null),
        onFocus: () => onHoverBearing(view.bearing),
        onBlur: () => onHoverBearing(null),
      }
    : {};
  // #2 stage entrance — this lane's leaves fade+rise in after the card, offset
  // by stageDelayMs. transform-critical satellites are excluded (FLIP owns their
  // transform); the head/socket/chip/fold carry the stagger cue.
  const stageStyle = { "--studio-stagger": `${stageDelayMs}ms` } as React.CSSProperties;
  return (
    <>
      {/* lane head label for a filled lane */}
      {view.filled ? (
        <div
          className="studio-stage-in absolute z-[3] flex items-center gap-1.5 whitespace-nowrap text-label tracking-[0.01em] text-[color:var(--color-text-tertiary)]"
          style={{ ...laneHeadPos(view, layout), ...stageStyle }}
        >
          <span className="h-1 w-1 flex-none rounded-full bg-[color:var(--color-indigo-brand)]" />
          {view.laneLabel}
        </div>
      ) : null}

      {/* satellites — body click loads that node; the quiet "···" edits the
          relation in place (Slice 1); a staged change shows a "저장 대기" chip. */}
      {layout.sats.map(({ sat, x, y }) => {
        const onClick = satNav(sat.id);
        const Tag = onClick ? "button" : "div";
        const pending = pendingNeighborIds?.has(sat.id) ?? false;
        const isArrival = arrivalId != null && sat.id === arrivalId;
        return (
          <div
            key={sat.id}
            ref={registerSat ? (el) => registerSat(sat.id, el) : undefined}
            data-flip-sat={sat.id}
            className="group absolute z-[2]"
            style={{ left: x, top: y, width: SAT.w, height: SAT.h }}
            {...hoverProps}
          >
            <Tag
              {...(onClick ? { type: "button" as const, onClick, title: labels.walkTo } : {})}
              data-testid={`studio-satellite-${view.bearing}`}
              className={cn(
                "flex h-full w-full items-center gap-2.5 rounded-[10px] border bg-[color:var(--color-panel)] px-3 text-left transition-colors",
                pending
                  ? "border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a08)]"
                  : "border-[color:var(--color-border-soft)]",
                onClick && !pending && "hover:border-[color:var(--color-indigo-a46)] hover:bg-[color:var(--color-indigo-a08)]",
              )}
            >
              <KindGlyph kind={sat.kind} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body font-medium text-[color:var(--color-text-primary)]">{sat.title}</span>
                <span className="truncate text-label text-[color:var(--color-text-quaternary)]">
                  {pending ? labels.pendingBadge : kindLabelFor(sat.kind)}
                </span>
              </span>
            </Tag>
            {onEditNeighbor ? (
              <button
                type="button"
                data-testid={`studio-edit-${view.bearing}`}
                aria-label={labels.edit}
                title={labels.edit}
                onClick={() => onEditNeighbor(sat)}
                className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-[6px] text-[color:var(--color-text-quaternary)] opacity-70 transition-opacity transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)] group-hover:opacity-100 motion-reduce:transition-none"
              >
                <MoreHorizontal size={14} aria-hidden />
              </button>
            ) : null}
            {/* arrival orientation (#3) — where you walked from. Indigo border
                emphasis (color/opacity only, no glow), holds ~1.5s then fades. */}
            {isArrival ? (
              <span
                aria-hidden
                data-testid={`studio-arrival-${view.bearing}`}
                className="pointer-events-none absolute inset-0 rounded-[10px] border-[1.5px] border-[color:var(--color-indigo-brand)] transition-opacity duration-[var(--motion-settle)] motion-reduce:transition-none"
                style={{ opacity: arrivalLit ? 1 : 0 }}
              />
            ) : null}
          </div>
        );
      })}

      {/* fold — toggles a scrollable list of all this lane's neighbors */}
      {layout.fold ? (
        <button
          type="button"
          data-testid={`studio-lane-more-${view.bearing}`}
          aria-expanded={foldOpen}
          onClick={onToggleFold}
          className={cn(
            "absolute z-[2] flex items-center gap-2 rounded-[10px] border px-3 text-caption text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)]",
            foldOpen
              ? "border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a08)]"
              : "border-[color:var(--color-border-soft)]",
          )}
          style={{ left: layout.fold.x, top: layout.fold.y, width: SAT.w, height: 30 }}
        >
          <span className="font-semibold text-[color:var(--color-text-secondary)]">+{layout.fold.count}</span>
          {labels.foldMore(layout.fold.count)}
          <ChevronDown
            size={13}
            aria-hidden
            className={cn("ml-auto text-[color:var(--color-text-quaternary)] transition-transform", foldOpen && "rotate-180")}
          />
        </button>
      ) : null}

      {/* fold overflow list */}
      {layout.fold && foldOpen ? (
        <LaneOverflowList
          view={view}
          layout={layout}
          labels={labels}
          kindLabelFor={kindLabelFor}
          onOpenNode={onOpenNode}
          onEditNeighbor={onEditNeighbor}
          pendingNeighborIds={pendingNeighborIds}
          onClose={onCloseFold}
        />
      ) : null}

      {/* C4 — compact "＋ 더 잇기" chip on a FILLED lane: the entry point to add
          another relation on this bearing once the empty socket is gone. Dashed =
          addable (charter), quiet not shouting. Opens the SAME picker. */}
      {layout.addChip ? (
        <button
          type="button"
          data-testid={`studio-add-more-${view.bearing}`}
          data-relation={view.relation}
          aria-label={labels.addMore(view.laneLabel)}
          title={labels.addMore(view.laneLabel)}
          onClick={onOpen}
          {...hoverProps}
          className="studio-stage-in group/add absolute z-[2] flex items-center justify-center gap-1.5 rounded-[9px] border border-dashed border-[color:var(--color-border-strong)] text-label text-[color:var(--color-text-quaternary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-secondary)]"
          style={{
            left: layout.addChip.x,
            top: layout.addChip.y,
            width: layout.addChip.w,
            height: layout.addChip.h,
            ...stageStyle,
          }}
        >
          <span aria-hidden className="text-[color:var(--color-text-tertiary)] transition-colors group-hover/add:text-[color:var(--color-indigo-text-soft)]">
            ＋
          </span>
          {labels.addMoreShort}
        </button>
      ) : null}

      {/* empty socket */}
      {layout.socket ? (
        <button
          type="button"
          data-testid={`studio-socket-${view.bearing}`}
          data-relation={view.relation}
          onClick={onOpen}
          {...hoverProps}
          className={cn(
            "studio-stage-in absolute z-[2] flex flex-col items-start justify-center gap-1 rounded-[12px] px-3.5 py-2.5 text-left transition-colors",
          )}
          style={{
            left: layout.socket.x,
            top: layout.socket.y,
            width: layout.socket.w,
            // #94/#95 — grow to wrapped text instead of clipping. The layout
            // height is Korean-tuned; longer English questions/eyebrows wrap to
            // more lines, so the dashed box must expand (minHeight) rather than
            // let the text bleed past its border. `justify-center` keeps short
            // (Korean) content vertically centered in the base height.
            minHeight: layout.socket.h,
            ...stageStyle,
            border: view.recommended
              ? "2px dashed var(--color-indigo-a46)"
              : view.expected
                ? "1.5px dashed var(--color-amber-muted-a62)"
                : "1.5px dashed var(--color-border-strong)",
            background: view.recommended
              ? "var(--color-indigo-a12)"
              : view.expected
                ? "var(--color-amber-muted-a18)"
                : "transparent",
          }}
        >
          {view.recommended ? (
            <span className="inline-flex items-center gap-1 rounded-[5px] bg-[color:var(--color-indigo-a16)] px-1.5 py-0.5 text-label font-semibold tracking-[0.02em] text-[color:var(--color-indigo-text-soft)]">
              ◈ {labels.guideBadge}
            </span>
          ) : view.expected ? (
            <span className="flex w-full items-start gap-1.5 text-label text-[color:var(--color-text-quaternary)]">
              <span className="mt-[3px] h-1.5 w-1.5 flex-none rounded-full bg-[color:var(--color-amber-signal-a60)]" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{view.emptyHint}</span>
            </span>
          ) : (
            <span className="block w-full text-label text-[color:var(--color-text-quaternary)] [overflow-wrap:anywhere]">{view.emptyHint}</span>
          )}
          {/* #6 — question is text-body(12.5); `text-callout` was an unregistered
              ramp step that silently rendered at the root 16px (the "billboard"
              defect). #94/#95 — keep-all stays (nice Korean 어절 wrapping) but
              add overflow-wrap:anywhere so long English words break instead of
              spilling past the dashed border, and widen the measure to the box
              so English wraps to fewer lines. The box height grows (minHeight)
              to hold the wrap. */}
          <span className="flex max-w-full items-start gap-1.5 text-body font-medium text-[color:var(--color-text-secondary)] [word-break:keep-all] [overflow-wrap:anywhere]">
            <span className="mt-px flex-none text-[color:var(--color-text-quaternary)]">＋</span>
            <span className="min-w-0">{view.question}</span>
          </span>
        </button>
      ) : null}
    </>
  );
}

// ── Lane overflow list — all of one lane's neighbors, scrollable, navigable ────
function LaneOverflowList({
  view,
  layout,
  labels,
  kindLabelFor,
  onOpenNode,
  onEditNeighbor,
  pendingNeighborIds,
  onClose,
}: {
  view: CompassBearingView;
  layout: LaneLayout;
  labels: StudioCompassLabels;
  kindLabelFor: (kind: string) => string;
  onOpenNode?: (id: string) => void;
  onEditNeighbor?: (neighbor: StudioSatellite) => void;
  pendingNeighborIds?: ReadonlySet<string>;
  onClose: () => void;
}) {
  const W = 288;
  const foldX = layout.fold?.x ?? 0;
  const foldY = layout.fold?.y ?? 0;
  const cardRight = CX + CARD.w / 2;
  const estH = Math.min(300, 60 + view.neighbors.length * 40);
  // Anchor beside the fold on the outward side so the center card stays clear.
  // up/down folds are centered under the card → send the list to the right gutter.
  const left =
    view.bearing === "right"
      ? clampX(foldX + SAT.w + 12, W)
      : view.bearing === "left"
        ? clampX(foldX - W - 12, W)
        : clampX(cardRight + 14, W);
  const top =
    view.bearing === "up" || view.bearing === "down"
      ? clampY(CY - estH / 2, estH)
      : clampY(foldY + 30 - estH / 2, estH);
  return (
    <div
      data-testid={`studio-lane-list-${view.bearing}`}
      className="absolute z-[8] rounded-[13px] border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)]"
      style={{ left, top, width: W, boxShadow: "0 12px 34px rgba(0,0,0,.5)" }}
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-3.5 py-2.5">
        <span className="min-w-0 truncate text-caption font-semibold text-[color:var(--color-text-secondary)] [word-break:keep-all]">
          {labels.foldTitle(view.laneLabel, view.neighbors.length)}
        </span>
        <button
          type="button"
          aria-label={labels.close}
          onClick={onClose}
          className="ml-auto flex-none text-[color:var(--color-text-quaternary)] hover:text-[color:var(--color-text-secondary)]"
        >
          <X size={13} aria-hidden />
        </button>
      </div>
      <div className="max-h-[260px] overflow-y-auto p-1.5">
        {view.neighbors.map((sat) => {
          const onClick = onOpenNode ? () => onOpenNode(sat.id) : undefined;
          const Tag = onClick ? "button" : "div";
          const pending = pendingNeighborIds?.has(sat.id) ?? false;
          return (
            <div key={sat.id} className="group flex items-center rounded-[8px] transition-colors hover:bg-[color:var(--color-indigo-a08)]">
              <Tag
                {...(onClick ? { type: "button" as const, onClick } : {})}
                data-testid={`studio-lane-row-${sat.id}`}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left"
              >
                <KindGlyph kind={sat.kind} />
                <span className="min-w-0 truncate text-body text-[color:var(--color-text-primary)]">{sat.title}</span>
                <span className="ml-auto flex-none text-label text-[color:var(--color-text-quaternary)]">
                  {pending ? labels.pendingBadge : kindLabelFor(sat.kind)}
                </span>
              </Tag>
              {onEditNeighbor ? (
                <button
                  type="button"
                  data-testid={`studio-lane-edit-${sat.id}`}
                  aria-label={labels.edit}
                  title={labels.edit}
                  onClick={() => onEditNeighbor(sat)}
                  className="mr-1.5 grid h-6 w-6 flex-none place-items-center rounded-[6px] text-[color:var(--color-text-quaternary)] opacity-70 transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)] group-hover:opacity-100"
                >
                  <MoreHorizontal size={14} aria-hidden />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Inline anchored edit card (Slice 1 — 지지대 편집) ──────────────────────────
/**
 * Retype / cut ONE existing relation, anchored beside its lane so the hero stays
 * visible. When the edge is NOT recorded on the focal node's own frontmatter
 * (e.g. a domain "contains" a child only because the child said `domain:`), the
 * card shows an honest note + a re-center button instead of a broken write.
 */
function InlineEditCard({
  relation,
  neighbor,
  bearing,
  layout,
  cardLeft,
  cardRight,
  labels,
  editable,
  bearingLabelFor,
  onRetype,
  onRemove,
  onOpenOther,
  onClose,
}: {
  relation: StudioRelation;
  neighbor: StudioSatellite;
  bearing: StudioBearing;
  layout: LaneLayout | null;
  cardLeft: number;
  cardRight: number;
  labels: StudioCompassLabels;
  editable: boolean;
  bearingLabelFor: (relation: StudioRelation) => string;
  onRetype: (to: StudioRelation) => void;
  onRemove: () => void;
  onOpenOther: () => void;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const W = 264;
  const GAP = 14;
  const PAD = 8;
  const anchor = layout?.anchor ?? { x: CX, y: CY };
  const estH = editable ? 232 : 150;
  // Keep the card out of the hero: right/up/down → right gutter, left → left gutter.
  const left =
    bearing === "left"
      ? Math.max(PAD, cardLeft - GAP - W)
      : Math.min(Math.max(anchor.x + GAP, cardRight + GAP), BOARD.w - PAD - W);
  const top = clampY(anchor.y - estH / 2, estH);
  const otherRelations = (["isA", "dependsOn", "contains", "relates"] as StudioRelation[]).filter(
    (r) => r !== relation,
  );
  return (
    <div
      data-testid="studio-edit-card"
      data-relation={relation}
      className="absolute z-[9] flex flex-col rounded-[13px] border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)]"
      style={{ left, top, width: W, boxShadow: "0 12px 34px rgba(0,0,0,.5)" }}
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-3.5 py-2.5">
        <span className="min-w-0 flex-1 truncate text-caption font-semibold text-[color:var(--color-text-secondary)] [word-break:keep-all]">
          {labels.editTitle}
        </span>
        <button
          type="button"
          aria-label={labels.close}
          onClick={onClose}
          className="flex-none text-[color:var(--color-text-quaternary)] hover:text-[color:var(--color-text-secondary)]"
        >
          <X size={13} aria-hidden />
        </button>
      </div>
      <div className="flex items-center gap-2 px-3.5 pt-2.5">
        <KindGlyph kind={neighbor.kind} />
        <span className="min-w-0 truncate text-body font-medium text-[color:var(--color-text-primary)] [word-break:keep-all]">
          {neighbor.title}
        </span>
      </div>

      {editable ? (
        <>
          <div className="px-3.5 pb-1 pt-3">
            <span className="text-label text-[color:var(--color-text-quaternary)]">{labels.editRetypeHeading}</span>
          </div>
          <div className="flex flex-col gap-1 px-2 pb-1.5">
            {otherRelations.map((to) => (
              <button
                key={to}
                type="button"
                data-testid={`studio-edit-retype-${to}`}
                onClick={() => onRetype(to)}
                className="flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-body text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-indigo-a08)] hover:text-[color:var(--color-text-primary)]"
              >
                <span className="text-[color:var(--color-text-quaternary)]">→</span>
                {labels.editMoveTo(bearingLabelFor(to))}
              </button>
            ))}
          </div>
          <div className="border-t border-[color:var(--color-divider)] p-2">
            {confirmDelete ? (
              <div className="flex items-center gap-2 px-1.5">
                <span className="min-w-0 flex-1 text-label text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
                  {labels.editDeleteConfirm}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-none rounded-md px-2 py-1 text-label text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]"
                >
                  {labels.editDeleteCancel}
                </button>
                <button
                  type="button"
                  data-testid="studio-edit-delete-confirm"
                  onClick={onRemove}
                  className="flex-none rounded-md border border-[color:var(--color-danger-a42)] bg-[color:var(--color-danger-a12)] px-2 py-1 text-label font-semibold text-[color:var(--color-danger-text)] transition-colors hover:bg-[color:var(--color-danger-a32)]"
                >
                  {labels.editDeleteYes}
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid="studio-edit-delete"
                onClick={() => setConfirmDelete(true)}
                className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-body text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)]"
              >
                <X size={13} aria-hidden className="text-[color:var(--color-text-quaternary)]" />
                {labels.editDelete}
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="px-3.5 pb-3.5 pt-3">
          <p className="text-label leading-label text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
            {labels.editElsewhere(neighbor.title)}
          </p>
          <button
            type="button"
            data-testid="studio-edit-open-other"
            onClick={onOpenOther}
            className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-[color:var(--color-border-soft)] px-2.5 py-1.5 text-label font-medium text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]"
          >
            {labels.editElsewhereGo}
          </button>
        </div>
      )}
    </div>
  );
}

/** Clamp a picker/list left edge inside the board with an 8px gutter. */
function clampX(x: number, w: number): number {
  return Math.min(Math.max(x, 8), BOARD.w - w - 8);
}
/** Clamp a picker/list top edge inside the board so its full height stays visible. */
function clampY(y: number, h: number): number {
  return Math.min(Math.max(y, 8), Math.max(8, BOARD.h - h - 8));
}

/** 세로 레인 라벨이 지지대 축에서 비켜서는 간격(#69). */
const LANE_HEAD_AXIS_GAP = 10;

function laneHeadPos(view: CompassBearingView, layout: LaneLayout): React.CSSProperties {
  if (view.bearing === "right") return { left: layout.sats[0]?.x ?? 0, top: (layout.sats[0]?.y ?? CY) - 20 };
  if (view.bearing === "left") return { left: layout.sats[0]?.x ?? 0, top: (layout.sats[0]?.y ?? CY) - 20 };
  // #69 — 세로 레인(up/down)의 지지대는 `CX` 축을 타고 흐른다. 라벨을 CX 중앙에
  // 놓으면 그 선이 글자를 **가로지른다**(소유자 실보고: "파란선에 글자가
  // 겹쳐져서 뭔가 이상하지? 가로질러서?"). 선 뒤로 넣어도 글자 사이로 비쳐
  // 읽히므로, 라벨을 축 오른쪽으로 비켜 세워 애초에 교차하지 않게 한다 —
  // 선로 옆 표지판 문법.
  if (view.bearing === "up") return { left: CX + LANE_HEAD_AXIS_GAP, top: (layout.sats[0]?.y ?? 0) - 20 };
  // #94/#95 — DOWN lane head sat BELOW the last satellite (+6), landing on top
  // of the fold chip ("+90 more", +12) → collision. Mirror the UP lane: place
  // the header ABOVE the topmost DOWN satellite (in the clear gap between the
  // card and the stack) so it never overlaps the fold/add-chip cluster below.
  return { left: CX + LANE_HEAD_AXIS_GAP, top: (layout.sats[0]?.y ?? 0) - 20 };
}

// ── Inline anchored picker (dark canonical) ──────────────────────────────────
/**
 * Anchor the picker to the clicked socket on its OUTWARD side so it never covers
 * the center card and always stays inside the board (#6):
 *   up   → right gutter, top-aligned to the socket
 *   down → right gutter, bottom-anchored
 *   left → below the left socket (stays left of the card)
 *   right→ below the right socket (stays right of the card)
 */
function placePicker(
  bearing: StudioBearing,
  socket: { x: number; y: number; w: number; h: number },
  cardLeft: number,
  cardRight: number,
): { left: number; top: number; maxHeight: number } {
  const W = 300;
  const GAP = 14;
  const PAD = 8;
  const rightGutter = Math.min(cardRight + GAP, BOARD.w - PAD - W);
  const CAP = 384;
  if (bearing === "up") {
    const top = clampY(socket.y, 160);
    return { left: rightGutter, top, maxHeight: Math.min(CAP, BOARD.h - PAD - top) };
  }
  if (bearing === "down") {
    const maxHeight = Math.min(CAP, BOARD.h - 2 * PAD);
    return { left: rightGutter, top: Math.max(PAD, BOARD.h - PAD - maxHeight), maxHeight };
  }
  // left / right — drop below the socket, kept on the socket's side of the card.
  const top = socket.y + socket.h + GAP;
  const maxHeight = Math.min(CAP, BOARD.h - PAD - top);
  const left =
    bearing === "left"
      ? Math.min(Math.max(socket.x, PAD), Math.max(PAD, cardLeft - GAP - W))
      : Math.max(Math.min(socket.x + socket.w - W, BOARD.w - PAD - W), cardRight + GAP);
  return { left, top, maxHeight };
}

/** Quiet section eyebrow inside the discovery picker (추천 / 둘러보기). */
function PickerSectionHeading({ label }: { label: string }) {
  return (
    <div className="px-2.5 pb-1 pt-1.5 text-label uppercase tracking-[0.05em] text-[color:var(--color-text-quaternary)]">
      {label}
    </div>
  );
}

function InlinePicker({
  socket,
  bearing,
  cardLeft,
  cardRight,
  relation,
  question,
  labels,
  rows,
  similarHit,
  discoveryFor,
  kindLabelFor,
  query,
  onQuery,
  onPick,
  onClose,
  onCreateNew,
}: {
  socket: { x: number; y: number; w: number; h: number };
  bearing: StudioBearing;
  cardLeft: number;
  cardRight: number;
  relation: StudioRelation;
  question: string;
  labels: StudioCompassLabels;
  rows: CreateCandidate[];
  similarHit: CreateCandidate | null;
  discoveryFor?: (relation: StudioRelation) => PickerDiscovery;
  kindLabelFor: (kind: string) => string;
  query: string;
  onQuery: (q: string) => void;
  onPick: (c: CreateCandidate) => void;
  onClose: () => void;
  onCreateNew?: (ctx?: { relation: StudioRelation; query: string }) => void;
}) {
  const W = 300;
  const { left, top, maxHeight } = placePicker(bearing, socket, cardLeft, cardRight);
  // Reserve chrome (header + search + create footer) so the list scrolls within.
  const listMax = Math.max(96, maxHeight - 156);

  // ── Slice 3 — discovery (추천 + 둘러보기) while the search box is empty ──
  // Computed once per socket-open (this component is keyed by relation, so it
  // remounts on socket switch) and dropped the moment the user starts typing.
  const emptyQuery = query.trim() === "";
  const discovery = useMemo(
    () => (emptyQuery && discoveryFor ? discoveryFor(relation) : null),
    [emptyQuery, discoveryFor, relation],
  );
  // Which domain the 둘러보기 drill-down is inside (null = top-level domain list).
  const [browseKey, setBrowseKey] = useState<string | null>(null);
  const reasonLabel = (reason: PickerSuggestionReason): string =>
    reason === "sameDomain"
      ? labels.reasonSameDomain
      : reason === "titleSimilar"
        ? labels.reasonTitleSimilar
        : labels.reasonAdjacent;
  // #2 origin-scale — the picker grows from the socket it anchors to. It always
  // sits just below the socket, so the transform-origin is the top edge at the
  // socket's horizontal center (clamped inside the picker box).
  const originX = Math.max(0, Math.min(W, socket.x + socket.w / 2 - left));
  return (
    <div
      data-testid="studio-picker"
      data-relation={relation}
      className="studio-picker-pop absolute z-[8] flex flex-col rounded-[13px] border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)]"
      style={
        {
          left,
          top,
          width: W,
          maxHeight,
          boxShadow: "0 12px 34px rgba(0,0,0,.5)",
          "--studio-picker-origin": `${originX}px 0`,
        } as React.CSSProperties
      }
    >
      <div className="flex items-baseline gap-2 border-b border-[color:var(--color-divider)] px-3.5 py-2.5">
        <span className="text-caption font-semibold text-[color:var(--color-text-secondary)]">{labels.pickerTitle(question)}</span>
        <span className="text-label text-[color:var(--color-text-quaternary)]">{labels.pickerSub}</span>
        <button
          type="button"
          aria-label={labels.close}
          onClick={onClose}
          className="ml-auto text-[color:var(--color-text-quaternary)] hover:text-[color:var(--color-text-secondary)]"
        >
          <X size={13} aria-hidden />
        </button>
      </div>
      <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-3 py-2">
        <Search size={13} aria-hidden className="flex-none text-[color:var(--color-text-quaternary)]" />
        <input
          autoFocus
          data-testid="studio-picker-input"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={labels.pickerPlaceholder}
          className="w-full bg-transparent text-body text-[color:var(--color-text-secondary)] outline-none placeholder:text-[color:var(--color-text-quaternary)]"
        />
      </div>
      <div className="overflow-y-auto p-1.5" style={{ maxHeight: listMax }} data-testid="studio-picker-body">
        {discovery ? (
          discovery.suggestions.length === 0 && discovery.domains.length === 0 ? (
            // #66 — 아직 검색하지 않았는데 "맞는 노드가 없어요" 는 거짓말이다.
            // 검색 전 빈 상태는 다음 행동(새로 만들기)을 알려준다.
            // 흐름 점검 2026-07-26 — 이 상태의 실제 조건은 "볼트가 비었다" 가
            // 아니라 "이 소켓의 후보 풀이 비었다" 다(초점 자신·이미 이어진
            // 이웃·이 방위가 허용하지 않는 kind 를 뺀 나머지가 0). 5노드
            // 볼트에서도 뜨는데 문구가 볼트 전체를 부정하면 오해가 된다.
            <div
              data-testid="studio-picker-browse-empty"
              className="px-3 py-3 text-center text-label leading-label text-[color:var(--color-text-quaternary)] [word-break:keep-all]"
            >
              {labels.pickerBrowseEmpty}
            </div>
          ) : (
            <>
              {/* 추천 — up to 5 likely candidates, each with a muted reason. */}
              {discovery.suggestions.length > 0 ? (
                <div data-testid="studio-picker-suggest" className="mb-1">
                  <PickerSectionHeading label={labels.suggestHeading} />
                  {discovery.suggestions.map((s) => (
                    <button
                      key={s.candidate.id}
                      type="button"
                      data-testid={`studio-suggest-row-${s.candidate.id}`}
                      onClick={() => onPick(s.candidate)}
                      className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--color-indigo-a08)]"
                    >
                      <KindGlyph kind={s.candidate.kind} />
                      <span className="min-w-0 truncate text-body text-[color:var(--color-text-primary)]">{s.candidate.title}</span>
                      <span className="ml-auto flex-none text-label text-[color:var(--color-text-quaternary)]">{reasonLabel(s.reason)}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {/* 둘러보기 — domain drill-down (default = domain list). */}
              <div data-testid="studio-picker-browse">
                <PickerSectionHeading label={labels.browseHeading} />
                {browseKey === null ? (
                  discovery.domains.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      data-testid={`studio-browse-domain-${d.key}`}
                      onClick={() => setBrowseKey(d.key)}
                      className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--color-indigo-a08)]"
                    >
                      <span className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
                        {d.title ?? labels.browseNoDomain}
                      </span>
                      <span className="ml-auto flex-none rounded-[5px] border border-[color:var(--color-border-soft)] px-1.5 py-px text-label text-[color:var(--color-text-quaternary)]">
                        {d.count}
                      </span>
                      <ChevronDown size={13} aria-hidden className="-rotate-90 flex-none text-[color:var(--color-text-quaternary)]" />
                    </button>
                  ))
                ) : (
                  <>
                    <button
                      type="button"
                      data-testid="studio-browse-back"
                      onClick={() => setBrowseKey(null)}
                      className="flex w-full items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-left text-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                    >
                      {labels.browseBack}
                    </button>
                    {(discovery.nodesByDomain[browseKey] ?? []).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        data-testid={`studio-browse-node-${c.id}`}
                        onClick={() => onPick(c)}
                        className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--color-indigo-a08)]"
                      >
                        <KindGlyph kind={c.kind} />
                        <span className="min-w-0 truncate text-body text-[color:var(--color-text-primary)]">{c.title}</span>
                        <span className="ml-auto flex-none text-label text-[color:var(--color-text-quaternary)]">{labels.pickerKind(kindLabelFor(c.kind))}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </>
          )
        ) : rows.length === 0 ? (
          <div className="px-3 py-3 text-center text-label text-[color:var(--color-text-quaternary)]">{labels.pickerEmpty}</div>
        ) : (
          rows.map((c) => (
            <button
              key={c.id}
              type="button"
              data-testid={`studio-picker-row-${c.id}`}
              onClick={() => onPick(c)}
              className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--color-indigo-a08)]"
            >
              <KindGlyph kind={c.kind} />
              <span className="truncate text-body text-[color:var(--color-text-primary)]">{c.title}</span>
              <span className="ml-auto flex-none text-label text-[color:var(--color-text-quaternary)]">{labels.pickerKind(kindLabelFor(c.kind))}</span>
            </button>
          ))
        )}
      </div>
      {similarHit ? (
        <div
          data-testid="studio-picker-similar"
          className="mx-2 mb-1.5 flex items-start gap-2 rounded-[9px] border px-2.5 py-2 text-label leading-label text-[color:var(--color-text-tertiary)]"
          style={{ borderColor: "var(--color-amber-muted-a34)", background: "var(--color-amber-muted-a18)" }}
        >
          <span className="flex-none text-[color:var(--color-amber-muted-a62)]">⚠</span>
          <span className="min-w-0">
            {labels.similarSuggest(similarHit.title)}{" "}
            <button
              type="button"
              data-testid="studio-picker-similar-accept"
              onClick={() => onPick(similarHit)}
              className="font-semibold text-[color:var(--color-indigo-text-soft)]"
            >
              {labels.similarAccept}
            </button>
          </span>
        </div>
      ) : null}
      <div className="border-t border-[color:var(--color-divider)] p-2">
        <button
          type="button"
          data-testid="studio-picker-create-new"
          onClick={() => onCreateNew?.({ relation, query })}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[color:var(--color-border-strong)] py-2 text-caption text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          <Plus size={13} aria-hidden className="text-[color:var(--color-text-tertiary)]" />
          {labels.pickerCreateNew}
        </button>
      </div>
    </div>
  );
}

// ── Top-bar node search — type → filtered vault nodes → load onto the stage ───
function NodeSearch({
  placeholder,
  nodes,
  kindLabelFor,
  pickerKind,
  emptyLabel,
  currentName,
  onOpenNode,
}: {
  placeholder: string;
  nodes?: CreateCandidate[];
  kindLabelFor: (kind: string) => string;
  pickerKind: (kindLabel: string) => string;
  emptyLabel: string;
  currentName: string;
  onOpenNode?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Static placeholder when the surface renders in isolation (no data / handler).
  if (!nodes || !onOpenNode) {
    return (
      <div className="flex h-8 w-[300px] items-center gap-2 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 text-body text-[color:var(--color-text-quaternary)]">
        <Search size={14} aria-hidden className="flex-none" />
        <span className="truncate">{placeholder}</span>
      </div>
    );
  }


  const rows = nodes
    // #66 — 표시 이름 · canonical title · ref 를 함께 본다(정규화 포함).
    .filter((n) => candidateMatches(n, query))
    .filter((n) => n.title !== currentName)
    .slice(0, 8);

  const pick = (id: string) => {
    onOpenNode(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div
      ref={boxRef}
      className="relative w-[300px]"
      onBlur={(e) => {
        if (!boxRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="flex h-8 items-center gap-2 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 text-body focus-within:border-[color:var(--color-indigo-a46)]">
        <Search size={14} aria-hidden className="flex-none text-[color:var(--color-text-quaternary)]" />
        <input
          data-testid="studio-node-search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Enter" && rows[0]) pick(rows[0].id);
          }}
          placeholder={placeholder}
          className="w-full bg-transparent text-[color:var(--color-text-secondary)] outline-none placeholder:text-[color:var(--color-text-quaternary)]"
        />
      </div>
      {open ? (
        <div
          data-testid="studio-node-search-results"
          className="absolute left-0 top-[calc(100%+6px)] z-[9] w-[340px] overflow-hidden rounded-[12px] border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)]"
          style={{ boxShadow: "0 12px 34px rgba(0,0,0,.5)" }}
        >
          <div className="max-h-[320px] overflow-y-auto p-1.5">
            {rows.length === 0 ? (
              <div className="px-3 py-3 text-center text-label text-[color:var(--color-text-quaternary)]">{emptyLabel}</div>
            ) : (
              rows.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  data-testid={`studio-node-search-row-${n.id}`}
                  onClick={() => pick(n.id)}
                  className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--color-indigo-a08)]"
                >
                  <KindGlyph kind={n.kind} />
                  <span className="min-w-0 truncate text-body text-[color:var(--color-text-primary)] [word-break:keep-all]">{n.title}</span>
                  <span className="ml-auto flex-none text-label text-[color:var(--color-text-quaternary)]">{pickerKind(kindLabelFor(n.kind))}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Mini compass rose (flow cue) — the four bearings at a glance ──────────────
/**
 * 완성도 인디케이터 (#69).
 *
 * 소유자 실보고: "이것도 잘 안 보여.. 좀 더 잘보이게하고(조금더 키워도 될지도?)
 * 그리고 반짝반짝 빛나면 좋을듯?" — 발광이 아니라 **상태가 눈에 들어오고 변화가
 * 움직임으로 읽히는 것**이 요구사항이다(소유자 정정). 그래서:
 *
 * - 크기를 40 → 52 로, 점 반지름을 2.6 → 3.6 으로 키운다.
 * - 채움/빈 상태의 **값 차이를 벌린다** — 채운 점은 인디고 solid + 옅은 후광
 *   링(같은 인디고 알파, glow 아님), 빈 점은 더 조용한 보더.
 * - 채워지는 순간 200ms 로 색과 반지름이 확정 전이한다 — 결과가 움직임으로
 *   확인된다. `prefers-reduced-motion` 은 전이를 끈다.
 *
 * 헌장 준수: glow pulse · neon · halo · `0 0 …` boxShadow 없음. 무채색 + 단일
 * 인디고, 값(밝기·크기)으로만 구분한다.
 */
function MiniRose({ bearings }: { bearings: CompassBearingView[] }) {
  const by = (b: StudioBearing) => bearings.find((v) => v.bearing === b);
  const pip = (b: StudioBearing, cx: number, cy: number) => {
    const v = by(b);
    const common = {
      cx,
      cy,
      className: "studio-rose-pip",
    } as const;
    if (v?.filled) {
      return (
        <>
          {/* 채움 강조 — 같은 인디고의 옅은 알파 링. 발광이 아니라 값 대비. */}
          <circle {...common} r={6} fill="var(--color-indigo-a16)" />
          <circle {...common} r={3.6} fill="var(--color-indigo-brand)" />
        </>
      );
    }
    if (v?.recommended)
      return (
        <>
          <circle {...common} r={3.6} fill="none" stroke="var(--color-indigo-line-a45)" strokeWidth={1.6} />
          <circle {...common} r={1.4} fill="var(--color-indigo-brand)" />
        </>
      );
    if (v?.expected)
      return <circle {...common} r={3.6} fill="none" stroke="var(--color-amber-muted-a62)" strokeWidth={1.6} />;
    return <circle {...common} r={3.6} fill="none" stroke="var(--color-border-soft)" strokeWidth={1.4} />;
  };
  return (
    <svg width={52} height={52} viewBox="0 0 52 52" className="flex-none" aria-hidden>
      <circle cx={26} cy={26} r={19} fill="none" stroke="var(--color-border-soft)" strokeWidth={1} strokeDasharray="1 3.6" />
      {pip("up", 26, 7)}
      {pip("right", 45, 26)}
      {pip("down", 26, 45)}
      {pip("left", 7, 26)}
    </svg>
  );
}

// ── Save preview (Slice 5) — 그래프 델타 미니뷰 ───────────────────────────────
/**
 * A scrim modal that answers "저장하면 지도가 이렇게 변해요" at the confirm moment.
 * The focal node's EXISTING neighborhood renders achromatic (context only); only
 * the staged delta is indigo — added neighbors solid, moved nodes at their new
 * bearing, cut edges dashed + struck. Below the diagram the SAME plain sentence
 * list (`summary`) so the picture and the words never disagree. Commits directly
 * from the footer (the one-click save contract) or closes (✕ / scrim / Esc).
 *
 * A compact self-contained SVG mini-graph — NOT the heavy canvas engine — reusing
 * the compass strut/bearing primitives at small scale.
 */
const MINI = { w: 520, h: 300 } as const;
const MCX = MINI.w / 2; // 260
const MCY = MINI.h / 2; // 150
const MC = { w: 152, h: 52 } as const;
const MS = { w: 130, h: 30, gap: 8 } as const;
const V_OFF = 30; // vertical gap from center edge to first up/down chip
const H_OFF = 44; // horizontal gap from center edge to first left/right chip

interface PlacedDeltaSat {
  sat: DeltaSatellite;
  x: number;
  y: number;
  strut: string;
}

/** Place one bearing's satellites + return the "+N" overflow chip anchor. */
function placeDeltaBearing(
  bearing: StudioBearing,
  sats: DeltaSatellite[],
): { placed: PlacedDeltaSat[]; overflowAnchor: { x: number; y: number } } {
  const placed: PlacedDeltaSat[] = [];
  if (bearing === "up") {
    const edgeY = MCY - MC.h / 2;
    sats.forEach((sat, i) => {
      const top = edgeY - V_OFF - (i + 1) * MS.h - i * MS.gap;
      placed.push({ sat, x: MCX - MS.w / 2, y: top, strut: `M ${MCX} ${edgeY} V ${top + MS.h}` });
    });
    const lastTop = placed.length ? placed[placed.length - 1].y : edgeY;
    return { placed, overflowAnchor: { x: MCX, y: lastTop - 16 } };
  }
  if (bearing === "down") {
    const edgeY = MCY + MC.h / 2;
    sats.forEach((sat, i) => {
      const top = edgeY + V_OFF + i * (MS.h + MS.gap);
      placed.push({ sat, x: MCX - MS.w / 2, y: top, strut: `M ${MCX} ${edgeY} V ${top}` });
    });
    const lastBottom = placed.length ? placed[placed.length - 1].y + MS.h : edgeY;
    return { placed, overflowAnchor: { x: MCX, y: lastBottom + 6 } };
  }
  // left / right — stacked vertically, centered on MCY.
  const isRight = bearing === "right";
  const edgeX = isRight ? MCX + MC.w / 2 : MCX - MC.w / 2;
  const x = isRight ? edgeX + H_OFF : edgeX - H_OFF - MS.w;
  const n = sats.length;
  const totalH = n * MS.h + Math.max(0, n - 1) * MS.gap;
  const startY = MCY - totalH / 2;
  sats.forEach((sat, i) => {
    const top = startY + i * (MS.h + MS.gap);
    const cy = top + MS.h / 2;
    const meetX = isRight ? x : x + MS.w;
    placed.push({ sat, x, y: top, strut: `M ${edgeX} ${MCY} L ${meetX} ${cy}` });
  });
  const lastBottom = placed.length ? placed[placed.length - 1].y + MS.h : MCY;
  return { placed, overflowAnchor: { x: x + MS.w / 2, y: lastBottom + 6 } };
}

const DELTA_STRUT_STROKE: Record<DeltaSatelliteState, string> = {
  existing: "var(--color-border-strong)",
  added: "var(--color-indigo-brand)",
  moved: "var(--color-indigo-brand)",
  removed: "var(--color-border-strong)",
};

function DeltaPreviewModal({
  layout,
  labels,
  kindLabelFor,
  summary,
  canSave,
  onSave,
  onClose,
}: {
  layout: DeltaPreviewLayout;
  labels: StudioCompassLabels;
  kindLabelFor: (kind: string) => string;
  summary: {
    count: number;
    collapsed: string;
    headline: string;
    lines: string[];
    fileEffect: string;
  } | null;
  canSave: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const byBearing: Record<StudioBearing, DeltaSatellite[]> = { up: [], right: [], down: [], left: [] };
  for (const sat of layout.satellites) byBearing[sat.bearing].push(sat);
  const bearings: StudioBearing[] = ["up", "right", "down", "left"];
  const placements = bearings.map((b) => ({
    bearing: b,
    ...placeDeltaBearing(b, byBearing[b]),
    overflow: layout.overflowByBearing[b],
  }));

  const center = layout.center;
  return (
    <div
      data-testid="studio-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label={labels.previewTitle}
      className="absolute inset-0 z-[13] flex items-center justify-center bg-[color:var(--color-overlay-2)] px-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-[560px] max-w-full flex-col overflow-hidden rounded-[16px] border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)]"
        style={{ boxShadow: "0 18px 48px rgba(0,0,0,.55)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-5 py-3.5">
          <span className="min-w-0 flex-1 truncate text-body-lg font-semibold text-[color:var(--color-text-primary)] [word-break:keep-all]">
            {labels.previewTitle}
          </span>
          <button
            type="button"
            data-testid="studio-preview-close"
            aria-label={labels.previewCloseAria}
            onClick={onClose}
            className="flex-none text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
          >
            <X size={15} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* mini-graph — fixed-coordinate board scrolls in its own gutter on a
              narrow viewport (never breaks the modal's horizontal layout). */}
          <div className="px-5 pt-4">
            <div className="overflow-x-auto">
            <div
              className="relative mx-auto rounded-[12px] border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)]"
              style={{ width: MINI.w, height: MINI.h }}
              data-testid="studio-preview-graph"
            >
              <svg
                className="pointer-events-none absolute left-0 top-0 h-full w-full"
                viewBox={`0 0 ${MINI.w} ${MINI.h}`}
                aria-hidden
              >
                {placements.flatMap((p) =>
                  p.placed.map((ps, i) => (
                    <path
                      key={`${p.bearing}-${i}`}
                      d={ps.strut}
                      fill="none"
                      strokeLinecap="round"
                      stroke={DELTA_STRUT_STROKE[ps.sat.state]}
                      strokeWidth={ps.sat.state === "existing" || ps.sat.state === "removed" ? 1.25 : 1.75}
                      strokeDasharray={ps.sat.state === "removed" ? "3 4" : undefined}
                    />
                  )),
                )}
              </svg>

              {/* center focal / new node */}
              <div
                data-testid="studio-preview-center"
                className="absolute flex flex-col justify-center rounded-[10px] px-3"
                style={{
                  left: MCX - MC.w / 2,
                  top: MCY - MC.h / 2,
                  width: MC.w,
                  height: MC.h,
                  border: center.isNew ? "1.5px solid var(--color-indigo-brand)" : "1px solid var(--color-border-strong)",
                  background: center.isNew ? "var(--color-indigo-a08)" : "var(--color-panel)",
                }}
              >
                {center.isNew ? (
                  <span className="mb-0.5 inline-flex w-fit items-center rounded-[4px] bg-[color:var(--color-indigo-a16)] px-1 py-px text-label font-semibold tracking-[0.02em] text-[color:var(--color-indigo-text-soft)]">
                    {labels.previewCenterNew}
                  </span>
                ) : null}
                <span className="truncate text-body font-semibold text-[color:var(--color-text-primary)] [word-break:keep-all]">
                  {center.title}
                </span>
                <span className="truncate text-label text-[color:var(--color-text-quaternary)]">
                  {kindLabelFor(center.kind)}
                  {center.domainLabel ? ` · ${center.domainLabel}` : ""}
                </span>
              </div>

              {/* satellites */}
              {placements.flatMap((p) =>
                p.placed.map((ps) => <DeltaSatChip key={ps.sat.node.id + ps.sat.state} placed={ps} labels={labels} />),
              )}

              {/* per-bearing overflow "+N" */}
              {placements
                .filter((p) => p.overflow > 0)
                .map((p) => (
                  <span
                    key={`overflow-${p.bearing}`}
                    data-testid={`studio-preview-overflow-${p.bearing}`}
                    className="absolute -translate-x-1/2 whitespace-nowrap rounded-[5px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-1.5 py-px text-label text-[color:var(--color-text-quaternary)]"
                    style={{ left: p.overflowAnchor.x, top: p.overflowAnchor.y }}
                  >
                    {labels.previewOverflow(p.overflow)}
                  </span>
                ))}
            </div>
            </div>

            {/* legend */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-label text-[color:var(--color-text-quaternary)]">
              <LegendItem swatch="existing" label={labels.previewLegendExisting} />
              <LegendItem swatch="added" label={labels.previewLegendAdded} />
              {layout.counts.moved > 0 ? <LegendItem swatch="moved" label={labels.previewLegendMoved} /> : null}
              {layout.counts.removed > 0 ? <LegendItem swatch="removed" label={labels.previewLegendRemoved} /> : null}
            </div>
          </div>

          {/* the SAME plain sentence list */}
          {summary ? (
            <div className="mt-4 border-t border-[color:var(--color-divider)] px-5 py-3.5" data-testid="studio-preview-summary">
              <p className="text-caption font-medium text-[color:var(--color-text-secondary)] [word-break:keep-all]">
                {summary.headline}
              </p>
              {summary.lines.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {summary.lines.map((line, i) => (
                    <li
                      key={`${line}-${i}`}
                      className="flex items-start gap-2 text-caption text-[color:var(--color-text-tertiary)]"
                    >
                      <span aria-hidden className="mt-1.5 h-1 w-1 flex-none rounded-full bg-[color:var(--color-indigo-brand)]" />
                      <span className="min-w-0 flex-1 [word-break:keep-all]">{line}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {summary.fileEffect ? (
                <p className="mt-2 text-label text-[color:var(--color-text-quaternary)]">{summary.fileEffect}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* footer — one indigo save (commits directly) + quiet close */}
        <div className="flex items-center justify-end gap-2 border-t border-[color:var(--color-divider)] px-5 py-3">
          <button
            type="button"
            data-testid="studio-preview-dismiss"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-caption text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
          >
            {labels.previewClose}
          </button>
          <button
            type="button"
            data-testid="studio-preview-save"
            disabled={!canSave}
            onClick={onSave}
            className="flex h-[34px] items-center gap-2 rounded-lg bg-[color:var(--color-indigo-brand)] px-4 text-caption font-semibold text-white transition-colors hover:bg-[color:var(--color-indigo-hover)] disabled:opacity-40"
          >
            {labels.save}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One placed satellite chip — encoding by delta state (achromatic vs indigo). */
function DeltaSatChip({ placed, labels }: { placed: PlacedDeltaSat; labels: StudioCompassLabels }) {
  const { sat, x, y } = placed;
  const state = sat.state;
  const indigo = state === "added" || state === "moved";
  const removed = state === "removed";
  return (
    <div
      data-testid={`studio-preview-sat-${state}`}
      data-node-id={sat.node.id}
      className="absolute flex items-center gap-1.5 rounded-[8px] px-2"
      style={{
        left: x,
        top: y,
        width: MS.w,
        height: MS.h,
        border: indigo
          ? "1.5px solid var(--color-indigo-brand)"
          : removed
            ? "1.25px dashed var(--color-border-strong)"
            : "1px solid var(--color-border-soft)",
        background: indigo ? "var(--color-indigo-a08)" : "var(--color-panel)",
      }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 flex-none rounded-full"
        style={{
          background: indigo ? "var(--color-indigo-brand)" : "var(--color-text-quaternary)",
          opacity: removed ? 0.5 : 1,
        }}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-label [word-break:keep-all]",
          indigo ? "text-[color:var(--color-text-primary)]" : "text-[color:var(--color-text-tertiary)]",
          removed && "text-[color:var(--color-text-quaternary)] line-through",
        )}
      >
        {sat.node.title}
      </span>
      {state === "moved" ? (
        <span className="flex-none rounded-[4px] bg-[color:var(--color-indigo-a16)] px-1 text-label font-medium text-[color:var(--color-indigo-text-soft)]">
          {labels.previewMovedChip}
        </span>
      ) : removed ? (
        <span className="flex-none rounded-[4px] border border-[color:var(--color-border-soft)] px-1 text-label text-[color:var(--color-text-quaternary)]">
          {labels.previewRemovedChip}
        </span>
      ) : null}
    </div>
  );
}

/** Legend swatch matching the graph encoding. */
function LegendItem({ swatch, label }: { swatch: DeltaSatelliteState; label: string }) {
  const indigo = swatch === "added" || swatch === "moved";
  const removed = swatch === "removed";
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-2.5 w-2.5 flex-none rounded-[3px]"
        style={{
          border: indigo
            ? "1.5px solid var(--color-indigo-brand)"
            : removed
              ? "1.25px dashed var(--color-border-strong)"
              : "1px solid var(--color-border-soft)",
          background: indigo ? "var(--color-indigo-a08)" : "transparent",
        }}
      />
      {label}
    </span>
  );
}
