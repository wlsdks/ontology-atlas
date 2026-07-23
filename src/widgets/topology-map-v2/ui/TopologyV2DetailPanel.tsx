"use client";

import { type KeyboardEvent as ReactKeyboardEvent, type ReactElement, useCallback, useState } from "react";
import { Copy, FileText, GitBranch, Orbit, Route, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import { isContainmentRelation } from "@/shared/lib/ontology-tree";
import {
  buildV2MetricSegments,
  V2_CONTAINS_SUMMARY_THRESHOLD,
  type V2ConnectionGroupsView,
  type V2ConnectionGroupView,
  type V2DatasheetConnection,
  type V2EvidenceRow,
  type V2MetricValues,
} from "./topology-v2-datasheet";
import { TopologyV2KindGlyph, TopologyV2TraceMark } from "@/shared/ui/topology-v2-kind-glyph";
import { Tooltip } from "@/shared/ui/tooltip";

/**
 * topology-map-v2 "component datasheet" node panel
 * (`docs/TOPOLOGY-V2-DESIGN.md` §5). Rendered ONLY when the
 * `atlas:feature:topology-map-v2` flag is on — the flag-off path keeps the
 * shared `TopologyNodePopover` byte-identical, so the Sigma engine is
 * untouched (lead design decision). Re-presents the SAME selection facts the
 * shared popover derives, at instrument density: a kind-shape miniature +
 * power dot header, ONE engraved metric line (no triplication), connections
 * grouped by relation type with a canvas-matching trace mini-line (no badge
 * pile), and an agent-handoff copy row.
 *
 * FSD: this widget owns its own prop shape — the view (`HomePage`) maps
 * `TopologyNodeFocusModel` into these props, so the import direction stays
 * view → widget. Colors/sizes come from `--topology-v2-panel-*` tokens.
 *
 * M-2 카운트 시맨틱: connection groups are ROLE-based (contains / usedBy /
 * dependsOn) — the SAME buckets the metric line counts and the full-detail
 * surface renders — so the group header's number and the metric line's number
 * are the same number by construction, and the popover never disagrees with
 * full-detail. Containment is its OWN "담는 것" group/segment (rendered only
 * when non-empty, i.e. container nodes) instead of folding into "기대는 곳" by
 * raw direction — the exact typed-fact collapse the UX round flagged. Group
 * headers reuse `labels.metricContains`/`metricUsedBy`/`metricDependsOn` (no
 * separate group-label strings) so the words match too; the per-row `TraceMark`
 * still marks containment vs depends within a row.
 *
 * RATIO-SYSTEM §4 scale-up (`docs/prototypes/chrome-datasheet-final.html`,
 * owner: "정보는 좋은데 너무 작고 그래") promotes a THIRD group — 근거
 * (evidence) — built from the node's own `evidenceIds` (its backing vault
 * doc; see `topology-v2-datasheet.ts#buildV2EvidenceRows`). It reuses
 * `labels.metricEvidence` as its header, same construction as the usedBy/
 * dependsOn groups, so the metric line's "근거 N" and this group's count
 * never drift. Rows are read-only (no `onSelectConnection` — evidenceIds are
 * vault slugs, a different id namespace than the canvas graph, see that
 * module's doc for why).
 *
 * N6 (persona-ux-2026-07 report — PM "이 역량, 어디 소속?"에 즉답 불가):
 * the owning domain used to appear only as a `contains` row inside the
 * "쓰는 곳" (usedBy) connections group, distinguished from `depends_on` rows
 * only by line style (solid vs dashed `TraceMark`) — not a fact a first-time
 * reader would notice. It now renders as its own "도메인 · <이름>" line in
 * the header, clickable via the SAME `onSelectConnection` callback the
 * connection rows use (no new navigation primitive). It still ALSO appears
 * in the usedBy group when the underlying `contains` edge exists — this is
 * additive promotion, not a removal, since the group still needs to show
 * every direct edge for agent handoff completeness.
 */

export interface TopologyV2DetailPanelLabels {
  kindLabel: string;
  /** N6 — "소속 도메인" 1급 사실의 prefix label ("도메인 · <이름>"). */
  domainLabel: string;
  poweredOn: string;
  poweredOff: string;
  /** M-2 — "담는 것" (contains). Only rendered for container nodes. */
  metricContains: string;
  /** S2 파트 3 — 요약 모드에서 개별 리스트로 펴는 토글 라벨("전체 보기"). */
  containsShowAll: string;
  /** S2 파트 3 — 리스트 모드에서 요약으로 접는 토글 라벨("요약 보기"). */
  containsShowSummary: string;
  /** S2 파트 3 — 경로 프리픽스 요약의 나머지 버킷 라벨("기타"). */
  containsOtherGroup: string;
  metricUsedBy: string;
  metricDependsOn: string;
  metricEvidence: string;
  /**
   * H1 B2/A — typed-fact 그룹 라벨의 hover 한 줄 풀이(비개발자 언어) + 스코프
   * 명시("직접" 연결 기준). `title` 속성으로만 노출 — 아이콘/추가 표면 없음.
   * 미지정(undefined)이면 title 없이 렌더(하위 호환).
   */
  metricContainsHelp?: string;
  metricUsedByHelp?: string;
  metricDependsOnHelp?: string;
  metricEvidenceHelp?: string;
  /** 각인 메트릭 한 줄 전체의 스코프 풀이(모두 직접 연결 기준). */
  metricHelp?: string;
  noConnections: string;
  handoff: string;
  close: string;
  /** "전체 상세 →" opt-in link to the A1 full-detail datasheet
   * (`full-detail-a1` widget) — the design gate's details-on-demand step
   * beyond this compact ego popover. */
  openFullDetail: string;
  /** W2-A action row (4-up tile grid below the metric line). */
  actionsGroupLabel: string;
  actionDocument: string;
  actionEditRelations: string;
  actionCopyHandoff: string;
  actionPath: string;
  /** S4 "영역 전개" 2차 발견 경로 액션 라벨 ("영역 전개"). */
  actionRealm: string;
  /**
   * 결과-설명 툴팁 (소유자 승인 2026-07-23) — 4-up 타일 라벨은 압축 전문어
   * ("인계 복사" 등)라 라벨 *반복*이 아닌 "누르면 무엇이 되는가"를 평문으로
   * 설명한다. 전부 optional — 생략하면 툴팁 없음(하위호환). 터치엔 hover 가
   * 없으므로 툴팁은 보조일 뿐, 라벨+aria 가 자립 본체다(원칙).
   */
  actionDocumentTip?: string;
  actionEditRelationsTip?: string;
  actionCopyHandoffTip?: string;
  actionPathTip?: string;
  actionRealmTip?: string;
}

export interface TopologyV2DetailPanelProps {
  slug: string;
  title: string;
  /**
   * 슬라이스 B (element 라벨 인간화) — `title` 이 표시용으로 변환된 값일 때
   * (예: element 노드의 코드 경로 원문 → "Bar Baz" 같은 사람 이름), 원문을
   * 보존해서 보여주는 모노 서브라인. 호출자가 display !== 원문 title 일
   * 때만 넘긴다 — 같으면 undefined/null 로 생략해 중복 렌더를 막는다.
   */
  sourceTitle?: string | null;
  kind: string;
  /**
   * N6 (persona-ux-2026-07 report — PM 페르소나 "어디 소속?" 1차 질문에
   * 즉답 불가) — owning domain, or null when the node has none (e.g. the
   * node IS a domain, or an orphan). Rendered as a first-class "도메인 ·
   * <이름>" fact in the header, separate from the "쓰는 곳" connections list
   * it used to be buried in (containment vs depends_on, distinguished only
   * by line style there). Clicking focuses the domain via the same
   * `onSelectConnection` callback the connection rows already use.
   */
  domain: { id: string; title: string } | null;
  /** "전원" — powered (recently updated / fresh) vs unpowered (quiet). */
  powered: boolean;
  metric: V2MetricValues;
  /** Connections grouped by relation type, each with a capped row preview + the
   * group's true total — so a contains-hub's depends group renders its real
   * count instead of collapsing into a generic overflow. */
  groups: V2ConnectionGroupsView;
  /** 근거(evidence) group — the node's own backing vault doc(s), RATIO-SYSTEM
   * §4 promotion. Rows built by `buildV2EvidenceRows`; empty when the node
   * has no `evidenceIds` (hides the group entirely, same convention as
   * usedBy/dependsOn). */
  evidence: { rows: readonly V2EvidenceRow[]; total: number };
  /**
   * S-C1 (owner 2026-07-20: "변경일 이런거? 그래야 구분이 될거 아냐") —
   * pre-formatted "언제 바뀌었나" label ("오늘" / "3일 전" / null when the
   * node has no backing doc date). Formatting lives in the caller so the
   * label passes through the same i18n path as every other string here.
   */
  updatedAtLabel?: string | null;
  /** Pre-built agent handoff payload; the view owns clipboard + toast. */
  handoffText: string;
  /**
   * W2-A "문서" action tile target — `buildDocsVaultHref` result for this
   * node's backing vault doc, or `null` when the node has no `sourceSlug`
   * (the tile renders disabled rather than linking to a guessed URL).
   */
  documentHref: string | null;
  /** W2-A "관계 편집" action tile target — the ERD builder deep link
   * (`/ontology/edit/?node=<slug>`, existing receiver in `OntologyEditPage`
   * via `resolveBuilderQueryNodeSlug`). Always available (any slug resolves
   * or falls back to the builder's own selection UI). */
  builderEditHref: string;
  labels: TopologyV2DetailPanelLabels;
  onSelectConnection: (id: string) => void;
  onCopyHandoff: (text: string) => void;
  onClose: () => void;
  /**
   * W2-A "경로" action tile — sets this node as the path-analysis source and
   * enters path mode. Reuses the existing (previously unwired)
   * `selectTopologyPathRouteState` route-state transition — no new path-mode
   * entry logic.
   */
  onSetPathSource: () => void;
  /**
   * S4 "영역 전개" 2차 발견 경로 — 궤도 버튼 외에 데이터시트에서도 영역을 펼
   * 수 있게 한다. 컨테이너 노드(자식 있음)이며 영역 밖일 때만 HomePage 가 주입
   * (그 외엔 omit → 버튼 미표시). 궤도 버튼과 같은 액션 하나.
   */
  onEnterRealm?: () => void;
  /** Opens the A1 full-detail datasheet for this node — details-on-demand
   * opt-in (`.claude/rules/design.md` "풀스크린 드로어는 opt-in"). Omitted
   * hides the link (e.g. read-only embeds). */
  onOpenFullDetail?: () => void;
  /**
   * rank2 — 등장/퇴장 대칭. `"entering"`(기본, 생략 포함)이면 클릭 노드 방향에서
   * 자라나는 `.topology-chrome-in`, `"exiting"`이면 그 역궤적 `.topology-chrome-out`
   * 을 입힌다. HomePage 의 presence 게이트가 선택 해제 시 이 값을 `"exiting"`으로
   * 바꾼 뒤 애니메이션이 끝나면 언마운트한다 — React 즉시 언마운트의 "툭 사라짐"
   * 제거. prefers-reduced-motion 은 globals.css 전역 규칙으로 즉시 소멸.
   */
  presence?: "entering" | "exiting";
  className?: string;
  /**
   * 슬라이스 C (개발/비개발 모드 토글) — 인계 복사(handoff) 액션 타일. 기본
   * `true`(기존 렌더 유지). 비개발(plain) 모드에서 HomePage 가 `false` 를
   * 넘겨 개발자 크롬으로 숨긴다.
   */
  showHandoff?: boolean;
  /**
   * 슬라이스 C — 원문 경로 서브라인(슬라이스 B, `sourceTitle`). 기본
   * `true`. 비개발(plain) 모드에서 `false` — 코드 경로는 개발자 어휘.
   */
  showSourcePath?: boolean;
}

// 데이터시트 내부 정제 (2026-07-23) — `justify-start` + 고정 상단 패딩: 라벨이
// 로케일에 따라 1줄/2줄로 갈려도 네 타일의 아이콘이 같은 y 에 정렬된다
// (grid 가 높이는 이미 균등화하므로, 남는 공백은 아래로만 빠진다). 2줄 라벨은
// `leading-[1.2]` 로 조인다.
// rank3 — press(active) 촉각: hover 위에 한 단 진한 `panel-row-active` 표면을
// pointer-down 동안만 얹어 "누르는 순간"을 색만으로 알린다(Toss press-state).
// transition-colors(150ms)로 하드 토글 방지 — transform/scale 없음.
/**
 * 결과-설명 툴팁 래퍼 — tip 이 있으면 shared Tooltip 으로 감싸고, 없으면
 * 트리거를 그대로 반환(하위호환·DOM 무증가). side="bottom": 타일 행이 패널
 * 상단부라 위로 띄우면 메트릭 라인을 가린다.
 */
function withActionTip(tip: string | undefined, trigger: ReactElement): ReactElement {
  if (!tip) return trigger;
  return (
    <Tooltip content={tip} side="bottom">
      {trigger}
    </Tooltip>
  );
}


const ACTION_TILE_CLASS =
  "flex flex-col items-center justify-start gap-1 rounded-[var(--topology-v2-panel-row-radius)] border border-[color:var(--topology-v2-panel-action-border)] bg-[color:var(--topology-v2-panel-action-surface)] px-1 pt-2 pb-1.5 text-center text-[10.5px] font-medium leading-[1.2] text-[color:var(--topology-v2-panel-text-secondary)] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)] active:bg-[color:var(--topology-v2-panel-row-active)]";
const ACTION_TILE_DISABLED_CLASS =
  "pointer-events-none opacity-40";

export function TopologyV2DetailPanel({
  slug,
  title,
  sourceTitle = null,
  kind,
  domain,
  powered,
  metric,
  groups,
  evidence,
  updatedAtLabel = null,
  handoffText,
  documentHref,
  builderEditHref,
  labels,
  onSelectConnection,
  onCopyHandoff,
  onClose,
  onSetPathSource,
  onEnterRealm,
  onOpenFullDetail,
  presence = "entering",
  className,
  showHandoff = true,
  showSourcePath = true,
}: TopologyV2DetailPanelProps) {
  const metricSegments = buildV2MetricSegments(metric, {
    contains: labels.metricContains,
    usedBy: labels.metricUsedBy,
    dependsOn: labels.metricDependsOn,
    evidence: labels.metricEvidence,
  });
  const hasConnections =
    groups.contains.total > 0 ||
    groups.usedBy.total > 0 ||
    groups.dependsOn.total > 0 ||
    evidence.total > 0;

  // S2 파트 3 — 긴 "담는 것" 리스트는 경로 프리픽스 요약으로 접고, "전체 보기"
  // 토글로 기존 리스트를 편다(세션 임시 상태). 노드가 바뀌면 기본(요약)으로 리셋
  // 되도록 slug 를 key 로 쓴다(호출부 HomePage 가 key 를 주므로 재마운트).
  const [showAllContains, setShowAllContains] = useState(false);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  // Group headers reuse the SAME i18n stems as the metric line
  // (`labels.metricUsedBy`/`labels.metricDependsOn`) — the header count and
  // the metric count are the same number (§module doc), so the words must
  // match too, or the reconciliation reads as a coincidence instead of a
  // guarantee.
  const renderGroup = (
    group: "contains" | "usedBy" | "dependsOn",
    label: string,
    help: string | undefined,
    view: V2ConnectionGroupView,
  ) => {
    if (view.total === 0) return null;
    const overflow = view.total - view.rows.length;
    // S2 파트 3 — 긴 "담는 것"은 경로 프리픽스 요약을 기본으로, "전체 보기"로 리스트.
    // B4 (H1) — 요약이 "기타" 한 덩어리로 무너지면(`usable=false`) 요약을 건너뛰고
    // 개별 리스트를 렌더한다(정보 0 방지).
    const useSummary =
      group === "contains" &&
      view.summary !== undefined &&
      view.summary.usable &&
      view.total > V2_CONTAINS_SUMMARY_THRESHOLD &&
      !showAllContains;
    return (
      <div className="flex flex-col gap-1" data-datasheet-group={group}>
        <div className="flex items-center gap-2">
          <span
            title={help}
            className="text-[10px] text-[color:var(--topology-v2-panel-text-tertiary)]"
          >
            {label}
          </span>
          {/* 그룹 카운트는 메트릭 스트립의 값과 "같은 숫자" (M-2 계약) —
              같은 잉크(`--topology-v2-panel-metric-text`)로 페어링해 스트립의
              각 카운트가 아래 자기 그룹으로 시선 연결되게 한다. */}
          <span
            data-datasheet-group-total={group}
            className="font-mono text-[10px] text-[color:var(--topology-v2-panel-metric-text)]"
          >
            {view.total}
          </span>
          {group === "contains" &&
          view.summary !== undefined &&
          view.summary.usable &&
          view.total > V2_CONTAINS_SUMMARY_THRESHOLD ? (
            <button
              type="button"
              onClick={() => setShowAllContains((v) => !v)}
              data-testid="topology-v2-contains-summary-toggle"
              className="ml-auto shrink-0 text-[10.5px] text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:text-[color:var(--topology-v2-panel-text-secondary)] active:text-[color:var(--topology-v2-panel-text-primary)]"
            >
              {showAllContains ? labels.containsShowSummary : labels.containsShowAll}
            </button>
          ) : null}
        </div>
        {useSummary && view.summary ? (
          <ul className="flex flex-col gap-0.5" data-testid="topology-v2-contains-summary">
            {view.summary.groups.map((g) => (
              <li
                key={`contains-summary:${g.key}`}
                className="flex items-center gap-2 px-1.5 py-1"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[color:var(--topology-v2-panel-text-secondary)]">
                  {g.key}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-[color:var(--topology-v2-panel-text-quaternary)]">
                  {g.count}
                </span>
              </li>
            ))}
            {view.summary.otherCount > 0 ? (
              <li className="flex items-center gap-2 px-1.5 py-1">
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[color:var(--topology-v2-panel-text-tertiary)]">
                  {labels.containsOtherGroup}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-[color:var(--topology-v2-panel-text-quaternary)]">
                  {view.summary.otherCount}
                </span>
              </li>
            ) : null}
          </ul>
        ) : (
        <ul className="flex flex-col">
          {view.rows.map((row: V2DatasheetConnection) => (
            // Neighbor `id` is unique within a direction group post-dedup
            // (`groupV2ConnectionsByDirection`) — the same neighbor can still
            // appear once per group (mutual dependency, item 5 — no
            // cross-group dedup), which is a different `group` prefix.
            <li key={`${group}:${row.id}`}>
              <button
                type="button"
                onClick={() => onSelectConnection(row.id)}
                data-datasheet-connection={row.id}
                className="flex min-h-[32px] w-full items-center gap-2 rounded-[var(--topology-v2-panel-row-radius)] px-1.5 py-2 text-left transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)] active:bg-[color:var(--topology-v2-panel-row-active)]"
              >
                <TopologyV2TraceMark containment={isContainmentRelation(row.relationType)} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-[color:var(--topology-v2-panel-text-secondary)]">
                  {row.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
        )}
        {overflow > 0 && !useSummary ? (
          <span
            data-datasheet-group-overflow={group}
            className="pl-[28px] font-mono text-[10.5px] text-[color:var(--topology-v2-panel-text-quaternary)]"
          >
            +{overflow}
          </span>
        ) : null}
      </div>
    );
  };

  // 근거(evidence) group — CLICKABLE doc-link rows (W2-A promotion: these
  // used to be display-only). `row.id` is a vault slug (see
  // `buildV2EvidenceRows`'s own doc comment), the exact input
  // `buildDocsVaultHref` expects — no separate id-namespace mapping needed
  // (unlike `onSelectConnection`'s canvas-node ids, which are a different
  // namespace). No TraceMark here: these aren't canvas edges. Same header/
  // list shape as usedBy/dependsOn.
  const renderEvidenceGroup = () => {
    if (evidence.total === 0) return null;
    return (
      <div className="flex flex-col gap-1" data-datasheet-group="evidence">
        <div className="flex items-center gap-2">
          <span
            title={labels.metricEvidenceHelp}
            className="text-[10px] text-[color:var(--topology-v2-panel-text-tertiary)]"
          >
            {labels.metricEvidence}
          </span>
          <span
            data-datasheet-group-total="evidence"
            className="font-mono text-[10px] text-[color:var(--topology-v2-panel-metric-text)]"
          >
            {evidence.total}
          </span>
        </div>
        <ul className="flex flex-col">
          {evidence.rows.map((row) => (
            <li key={`evidence:${row.id}`}>
              <Link
                href={buildDocsVaultHref({ slug: row.id })}
                data-datasheet-evidence={row.id}
                className="flex min-h-[32px] w-full items-center gap-2 rounded-[var(--topology-v2-panel-row-radius)] px-1.5 py-2 transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)] active:bg-[color:var(--topology-v2-panel-row-active)]"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-[color:var(--topology-v2-panel-text-secondary)]">
                  {row.title}
                </span>
                {row.path ? (
                  <span className="shrink-0 font-mono text-[10px] text-[color:var(--topology-v2-panel-text-quaternary)]">
                    {row.path}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div
      role="group"
      aria-label={title}
      data-testid="topology-v2-detail-panel"
      data-datasheet-density="instrument"
      onKeyDown={handleKeyDown}
      // P3-③ (2026-07-21 리텐션 라운드) — 이 패널은 `--topology-node-popover-top`
      // 에 fixed 앵커되는데(HomePage 포지셔너), 자기 자신은 높이 제약이 없어
      // 연결이 많은 노드에서 콘텐츠가 뷰포트를 넘기면 "전체 상세 →" 푸터가
      // 화면 밖으로 밀려나 마우스로 닿지 않았다(1440×900, y=911 실측). 뷰포트
      // 기준 max-height + 내부 스크롤로 패널이 항상 뷰포트 안에 온전히 앵커
      // 되도록 clamp한다.
      data-presence={presence}
      className={[
        // R4 모션 헌법 — 노드 팝오버 등장 문법(단일 `.topology-chrome-in`:
        // opacity+3px translateY+scale 0.98→1, 180ms, ease-out). slug 로 keyed
        // 되어 다른 노드 선택마다 재발화. rank2 — presence="exiting" 이면
        // 역궤적 `.topology-chrome-out`(≈120ms)으로 접힌 뒤 언마운트된다.
        presence === "exiting" ? "topology-chrome-out" : "topology-chrome-in",
        "flex w-[var(--topology-v2-panel-width)] flex-col gap-[var(--topology-v2-panel-gap)]",
        "max-h-[var(--topology-v2-panel-max-height)] overflow-y-auto",
        "rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)]",
        "bg-[color:var(--topology-v2-panel-surface)] p-[var(--topology-v2-panel-pad)]",
        "shadow-[var(--topology-v2-panel-shadow)]",
        className ?? "",
      ].join(" ")}
    >
      {/* 정체 클러스터 (2026-07-23 내부 정제) — 헤더와 각인 메트릭은 둘 다
          "이 노드가 무엇인가"를 말하므로 root 의 14px 섹션 리듬보다 조이는
          8px 로 근접시킨다. gap 사다리: 14(섹션) / 8(정체 내부) / 4(액션·
          그룹 헤더-행) — 균일 14px 단일 리듬이 그룹 경계를 못 만들던 문제의
          근접성(proximity) 처방. */}
      <div className="flex flex-col gap-2">
      {/* Header — kind miniature + name + power dot + close */}
      <div className="flex items-start gap-2">
        <div className="mt-[1px]">
          <TopologyV2KindGlyph kind={kind} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span
              data-power-state={powered ? "on" : "off"}
              aria-hidden="true"
              className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
              style={{
                backgroundColor: powered
                  ? "var(--topology-v2-panel-power-on)"
                  : "var(--topology-v2-panel-power-off)",
              }}
            />
            <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em] text-[color:var(--topology-v2-panel-text-primary)]">
              {title}
            </h2>
          </div>
          {showSourcePath && sourceTitle && sourceTitle !== title ? (
            <div
              data-testid="topology-v2-detail-panel-source-path"
              className="pl-[13.5px] font-mono text-[11px] text-[color:var(--color-text-quaternary)] break-all"
            >
              {sourceTitle}
            </div>
          ) : null}
          <div className="flex items-center gap-1.5 pl-[13.5px]">
            <span className="text-[11px] text-[color:var(--topology-v2-panel-text-tertiary)]">
              {labels.kindLabel}
            </span>
            <span className="text-[10px] text-[color:var(--topology-v2-panel-text-quaternary)]">·</span>
            {/* Guardian 처방 (2026-07-23) — 파워닷 + "최근 갱신" 단어 +
                updatedAtLabel 이 같은 신선도를 3중 반복하던 것을 정리:
                updatedAtLabel 이 있으면 그 한 줄만 렌더하고(전원 단어 생략),
                없을 때만 전원 단어로 폴백한다. */}
            {updatedAtLabel ? (
              <span
                data-testid="topology-v2-datasheet-updated-at"
                className="text-[11px] text-[color:var(--topology-v2-panel-text-quaternary)]"
              >
                {updatedAtLabel}
              </span>
            ) : (
              <span className="text-[11px] text-[color:var(--topology-v2-panel-text-quaternary)]">
                {powered ? labels.poweredOn : labels.poweredOff}
              </span>
            )}
          </div>
          {domain ? (
            <button
              type="button"
              onClick={() => onSelectConnection(domain.id)}
              data-testid="topology-v2-detail-panel-domain"
              className="flex min-w-0 max-w-full items-center gap-1 self-start pl-[13.5px] text-left transition-colors hover:text-[color:var(--topology-v2-panel-text-secondary)] active:text-[color:var(--topology-v2-panel-text-primary)]"
            >
              <span className="shrink-0 whitespace-nowrap text-[11px] text-[color:var(--topology-v2-panel-text-tertiary)]">
                {labels.domainLabel}
              </span>
              <span className="shrink-0 text-[10px] text-[color:var(--topology-v2-panel-text-quaternary)]">·</span>
              <span className="truncate text-[11px] font-medium text-[color:var(--topology-v2-panel-text-secondary)]">
                {domain.title}
              </span>
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          data-testid="topology-v2-detail-panel-close"
          className="-mr-1 -mt-1 shrink-0 rounded-[var(--topology-v2-panel-row-radius)] p-1 text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-secondary)] active:bg-[color:var(--topology-v2-panel-row-active)]"
        >
          <X size={14} />
        </button>
      </div>

      {/* One engraved metric line — no subtitle + boxes triplication.
          라벨(tertiary)과 값(metric-text)의 잉크를 분리 — 숫자가 데이터,
          단어는 눈금(Tufte data-ink). 값 잉크는 아래 그룹 헤더 카운트와 같아
          스트립 카운트 → 해당 그룹의 시선 연결을 잉크 페어링만으로 만든다
          (스크롤 등 신규 인터랙션 없음). */}
      <div
        data-datasheet-metric="engraved"
        title={labels.metricHelp}
        className="rounded-[var(--topology-v2-panel-row-radius)] bg-[color:var(--topology-v2-panel-metric-surface)] px-2 py-1.5"
      >
        <span className="font-mono text-[12.5px] tracking-[0.01em]">
          {metricSegments.map((seg, i) => (
            <span key={seg.key} data-metric-segment={seg.key}>
              {i > 0 ? (
                <span className="text-[color:var(--topology-v2-panel-text-quaternary)]">
                  {" · "}
                </span>
              ) : null}
              <span className="text-[color:var(--topology-v2-panel-text-tertiary)]">
                {seg.label}
              </span>{" "}
              <span className="text-[color:var(--topology-v2-panel-metric-text)]">
                {seg.value}
              </span>
            </span>
          ))}
        </span>
      </div>
      </div>

      {/* 액션 클러스터 — 4-up 타일과 "영역 전개"는 같은 재질(보더+표면 토큰)의
          한 계기 묶음이므로 그리드 내부와 같은 4px 로 묶는다. */}
      <div className="flex flex-col gap-1">
      {/* W2-A action row — 4-up tile grid (문서/관계 편집/인계 복사/경로).
          Same construction for every tile (border + hover surface tokens) so
          the row reads as one instrument, not four unrelated buttons. */}
      <div
        role="group"
        aria-label={labels.actionsGroupLabel}
        data-testid="topology-v2-detail-panel-actions"
        className="grid grid-cols-4 gap-1"
      >
        {documentHref ? (
          withActionTip(
            labels.actionDocumentTip,
            <Link
              href={documentHref}
              data-testid="topology-v2-detail-panel-action-document"
              className={ACTION_TILE_CLASS}
            >
              <FileText size={15} aria-hidden="true" />
              <span>{labels.actionDocument}</span>
            </Link>,
          )
        ) : (
          <span
            aria-disabled="true"
            data-testid="topology-v2-detail-panel-action-document"
            className={[ACTION_TILE_CLASS, ACTION_TILE_DISABLED_CLASS].join(" ")}
          >
            <FileText size={15} aria-hidden="true" />
            <span>{labels.actionDocument}</span>
          </span>
        )}
        {withActionTip(
          labels.actionEditRelationsTip,
          <Link
            href={builderEditHref}
            data-testid="topology-v2-detail-panel-action-edit"
            className={ACTION_TILE_CLASS}
          >
            <GitBranch size={15} aria-hidden="true" />
            <span>{labels.actionEditRelations}</span>
          </Link>,
        )}
        {showHandoff
          ? withActionTip(
              labels.actionCopyHandoffTip,
              <button
                type="button"
                onClick={() => onCopyHandoff(handoffText)}
                aria-label={labels.handoff}
                data-testid="topology-v2-detail-panel-action-handoff"
                className={ACTION_TILE_CLASS}
              >
                <Copy size={15} aria-hidden="true" />
                <span>{labels.actionCopyHandoff}</span>
              </button>,
            )
          : null}
        {withActionTip(
          labels.actionPathTip,
          <button
            type="button"
            onClick={onSetPathSource}
            data-testid="topology-v2-detail-panel-action-path"
            className={ACTION_TILE_CLASS}
          >
            <Route size={15} aria-hidden="true" />
            <span>{labels.actionPath}</span>
          </button>,
        )}
      </div>

      {/* S4 "영역 전개" 2차 발견 경로 — 컨테이너 노드에서만(HomePage 가 주입).
          궤도 버튼과 같은 액션 하나: 이 노드의 세계로 지도를 전환한다. */}
      {onEnterRealm
        ? withActionTip(
            labels.actionRealmTip,
            <button
              type="button"
              onClick={onEnterRealm}
              data-testid="topology-v2-detail-panel-action-realm"
              className="flex items-center justify-center gap-1.5 rounded-[var(--topology-v2-panel-row-radius)] border border-[color:var(--topology-v2-panel-action-border)] bg-[color:var(--topology-v2-panel-action-surface)] px-2 py-1.5 text-[12px] font-medium text-[color:var(--topology-v2-panel-text-secondary)] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)] active:bg-[color:var(--topology-v2-panel-row-active)]"
            >
              <Orbit size={15} aria-hidden="true" />
              <span>{labels.actionRealm}</span>
            </button>,
          )
        : null}
      </div>

      {/* Connections grouped by relation type — 그룹 사이는 root 와 같은
          `--topology-v2-panel-gap`(14px): 각 typed-fact 그룹이 자체 섹션으로
          읽히게 한다 (구 10px 는 행 자체 패딩(12px 시각 간격)과 구분이 안 돼
          그룹 경계가 뭉개졌다). */}
      <div className="flex flex-col gap-[var(--topology-v2-panel-gap)]">
        {hasConnections ? (
          <>
            {renderGroup("contains", labels.metricContains, labels.metricContainsHelp, groups.contains)}
            {renderGroup("usedBy", labels.metricUsedBy, labels.metricUsedByHelp, groups.usedBy)}
            {renderGroup("dependsOn", labels.metricDependsOn, labels.metricDependsOnHelp, groups.dependsOn)}
            {renderEvidenceGroup()}
          </>
        ) : (
          <span className="text-[11.5px] text-[color:var(--topology-v2-panel-text-tertiary)]">
            {labels.noConnections}
          </span>
        )}
      </div>

      {/* Footer — slug + opt-in full-detail link. The agent-handoff button
          moved up into the W2-A action row (`data-testid=".../action-handoff"`)
          — this row no longer duplicates it.
          검수 Pass A 소견 (2026-07-23) — 1440×900에서 콘텐츠가 max-height 를
          넘기면 이 푸터가 스크롤 밖에 숨는데 스크롤 어포던스가 없어 "전체
          상세"가 존재하지 않는 것처럼 읽혔다(P3-③ 의 후속). 패널 스크롤
          컨테이너 안에서 sticky + 불투명 패널 surface 로 항상 보이게 한다 —
          내용이 다 보일 땐 기존과 동일한 자리(sticky 비활성 상태와 동일). */}
      <div className="sticky -bottom-[var(--topology-v2-panel-pad)] -mx-[var(--topology-v2-panel-pad)] -mb-[var(--topology-v2-panel-pad)] flex items-center gap-2 rounded-b-[var(--topology-v2-panel-radius)] border-t border-[color:var(--topology-v2-panel-divider)] bg-[color:var(--topology-v2-panel-surface)] px-[var(--topology-v2-panel-pad)] py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-[color:var(--topology-v2-panel-text-quaternary)]">
          {slug}
        </span>
        {onOpenFullDetail ? (
          <button
            type="button"
            onClick={onOpenFullDetail}
            data-testid="topology-v2-detail-panel-open-full-detail"
            className="shrink-0 text-[11px] text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:text-[color:var(--topology-v2-panel-text-secondary)] active:text-[color:var(--topology-v2-panel-text-primary)]"
          >
            {labels.openFullDetail}
          </button>
        ) : null}
      </div>
    </div>
  );
}
