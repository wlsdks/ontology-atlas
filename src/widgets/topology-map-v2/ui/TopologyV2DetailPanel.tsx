"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Copy,
  FileText,
  GitBranch,
  MessageCircle,
  Orbit,
  Plus,
  Route,
  X,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import type { ProjectSourceStatus, ProjectSourceView } from "@/shared/lib/project-source-receipt";
import { useViewportBelow } from "@/shared/lib/use-viewport-below";
import { truncateMiddlePath } from "@/shared/lib/truncate-middle-path";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import {
  slugDisplaySegment,
  V2_CONTAINS_SUMMARY_THRESHOLD,
  type V2ConnectionGroupsView,
  type V2ConnectionGroupView,
  type V2DatasheetConnection,
  type V2EvidenceRow,
} from "./topology-v2-datasheet";
import { controlClass, IconButton, LastEditSubjectRow, MtimeConflictBadge, RowButton, Surface } from "@/shared/ui";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { Tooltip } from "@/shared/ui/tooltip";

/**
 * topology-map-v2 "component datasheet" node panel
 * (`docs/TOPOLOGY-V2-DESIGN.md` §5). Rendered ONLY when the
 * `atlas:feature:topology-map-v2` flag is on — the flag-off path keeps the
 * shared `TopologyNodePopover` byte-identical, so the Sigma engine is
 * untouched (lead design decision). Re-presents the SAME selection facts the
 * shared popover derives.
 *
 * 시안 재설계 (2026-07-24, 소유자 승인 mockup `mockup-panel-detail.html`):
 * a BALANCED identity header — node name hero (left) + quiet kind badge and
 * close (right), then freshness (left) + a navigable indigo domain chip
 * (right), so neither side is barren for long names. Below, a divided
 * "ops" zone = a PLAIN aggregate stats line ("이어진 곳 N · 근거 문서 M",
 * no heavy metric pill — the per-type counts live once each in their own
 * group headers) + a QUIET ghost action strip (문서/관계 편집/인계 복사/경로/
 * 영역 전개, hidden when a handler/href is absent). Then a relations zone with
 * a wide 28px between-group rhythm (`--topology-v2-panel-zone-gap`), each group
 * self-evident: a directional glyph + bold plain label + indigo count chip +
 * underline, rows carrying the canvas kind glyph (no competing kind word).
 * Footer stays sticky: slug (quiet) + ONE indigo-filled primary "전체 상세".
 * The floating power dot was removed (unexplained mark); `powered` now only
 * feeds the freshness fallback word.
 *
 * FSD: this widget owns its own prop shape — the view (`HomePage`) maps
 * `TopologyNodeFocusModel` into these props, so the import direction stays
 * view → widget. Colors/sizes come from `--topology-v2-panel-*` tokens.
 *
 * M-2 카운트 시맨틱: connection groups are ROLE-based (contains / usedBy /
 * dependsOn / belongsTo) — the SAME four buckets the full-detail surface
 * renders — so the group header's number and the "이어진 곳" aggregate are the
 * same number by construction, and the popover never disagrees with
 * full-detail. 네 번째 버킷(속한 곳)은 2026-07-26 까지 여기서 빠져 있었고,
 * 그동안 부모만 있는 노드(dogfood 75%)의 팝오버가 "이어진 곳 0" 이라고 말했다.
 * Containment is its OWN "담는 것" group/segment (rendered only
 * when non-empty, i.e. container nodes) instead of folding into "기대는 곳" by
 * raw direction — the exact typed-fact collapse the UX round flagged. Group
 * headers reuse `labels.metricContains`/`metricUsedBy`/`metricDependsOn` (no
 * separate group-label strings) so the words match too. (재설계 후 the relation
 * TYPE is encoded by the group itself — 담는 것 vs 기대는 곳 — so each row's
 * left mark is the neighbour's canvas kind glyph, not a TraceMark line.)
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
 * connection rows use (no new navigation primitive). 도메인이 이 노드의 직접
 * 부모일 때는 아래 "속한 곳" 그룹에도 한 줄로 남는다 — 헤더 칩은 바로 가라는
 * 지름길이고, 그룹은 관계 기록 자체다. 그룹에서 도메인만 빼면 팝오버의
 * "속한 곳 N" 이 전체 상세의 같은 수와 어긋난다(그게 더 나쁜 결함이다).
 *
 * Toss C2 (청중 언어 평문화, 2026-07-24): the "담는 것/쓰는 곳/기대는 곳/근거"
 * plain labels used to sit right next to jargon that undercut them — the
 * sticky footer's raw `slug` (`ontology/capabilities/mcp-server`) and each
 * evidence row's raw vault-path prefix were ALWAYS visible, unreadable to a
 * non-developer. Both now show only the readable leaf segment
 * (`slugDisplaySegment` / `V2EvidenceRow.title`) and fold the full path
 * behind a native `title=` hover tooltip — information is not lost (the
 * "전체 상세" link already owns navigating to the full record), just no
 * longer competing for first-read attention with the plain-language facts.
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
  /**
   * "속한 곳" (belongsTo) — 이 노드를 담고 있는 상위 항목. 전체 상세와 같은
   * 단어를 쓴다(둘 다 `edgeTypesPlain.belongs_to` 계열).
   */
  metricBelongsTo: string;
  metricEvidence: string;
  /**
   * 시안 재설계 (2026-07-24) — 평문 stats 한 줄 "이어진 곳 <N> · 근거 문서
   * <M>". 각인 메트릭 스트립(타입별 분해)을 대체한다 — 타입별 카운트는 아래
   * 각 관계 그룹 헤더의 카운트 칩으로 이미 한 번씩 나타나므로, 상단은 집계만
   * 말한다(한 사실은 한 번). `statsConnected` = 아래에 그려지는 네 관계 그룹
   * (contains+usedBy+dependsOn+belongsTo)의 합, `statsEvidenceDocs` = 근거
   * 문서(evidence) 수. 그리지 않는 버킷을 세지도 않고, 세는 버킷을 감추지도
   * 않는다 — 한쪽만 어기면 "이어진 곳" 이 말과 다른 수가 된다.
   */
  statsConnected: string;
  statsEvidenceDocs: string;
  /**
   * H1 B2/A — typed-fact 그룹 라벨의 hover 한 줄 풀이(비개발자 언어) + 스코프
   * 명시("직접" 연결 기준). `title` 속성으로만 노출 — 아이콘/추가 표면 없음.
   * 미지정(undefined)이면 title 없이 렌더(하위 호환).
   */
  metricContainsHelp?: string;
  metricUsedByHelp?: string;
  metricDependsOnHelp?: string;
  metricBelongsToHelp?: string;
  metricEvidenceHelp?: string;
  /** 각인 메트릭 한 줄 전체의 스코프 풀이(모두 직접 연결 기준). */
  metricHelp?: string;
  noConnections: string;
  handoff: string;
  close: string;
  /** "전체 상세" opt-in link to the A1 full-detail datasheet
   * (`full-detail-a1` widget) — the design gate's details-on-demand step
   * beyond this compact ego popover. */
  openFullDetail: string;
  /** W2-A action row (4-up tile grid below the metric line). */
  actionsGroupLabel: string;
  actionDocument: string;
  actionEditRelations: string;
  /** 이 개념에 **이어서 새 개념**을 만든다 — 지도를 떠나지 않는다. */
  actionCreateLinked?: string;
  actionCopyHandoff: string;
  /**
   * S7 이음새 — 이 개념을 그대로 에이전트에게 말로 시키는 자리. optional 인
   * 이유: 에이전트 패널이 없는 환경(웹 빌드·구 소비처)에서는 라벨도 핸들러도
   * 오지 않고, 그때는 타일 자체가 나타나지 않아야 한다.
   */
  actionAskAgent?: string;
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
  actionCreateLinkedTip?: string;
  actionCopyHandoffTip?: string;
  actionAskAgentTip?: string;
  actionPathTip?: string;
  actionRealmTip?: string;
  /** "코드 위치" — the real code-location group (`codeLocations` prop),
   * distinct from the "근거" group above (source-doc reference). */
  codeLocationsLabel: string;
  codeLocationsCopyLabel: string;
  codeLocationsCopiedLabel: string;
  /** rank7 (design-council B5) — "마지막 편집" 주체 행 + expected_mtime
   *  충돌 배지 카피. `editProvenance` i18n 네임스페이스 재사용(단일 출처). */
  editSubjectPrefix: string;
  editSubjectAgent: string;
  editSubjectHuman: string;
  editConflictMessage: string;
  /** Project-only source receipt copy, preformatted by the caller. */
  sourceHeading?: string;
  sourceKind?: string;
  sourceStatus?: string;
  sourceMeasuredAt?: string;
  sourceCurrentness?: string;
  sourceGap?: string;
  sourceGapLabel?: string;
  sourceAction?: string;
  /**
   * 진단 바로 옆에 붙는 **왜** 한 문장. 다음 행동이 무엇을 되게 하는지 평이한
   * 말로 적는다("코드 폴더" · "코드 위치" — 「소스 바인딩」 같은 말은 안 쓴다).
   * 호출자가 `nextAction.id` 로 고른다 — 여덟 행동 전부에 짝이 있다.
   */
  sourceWhy?: string;
  sourceRelationsShow?: string;
  sourceRelationsHide?: string;
  sourceOntologyDocument?: string;
  sourceBusy?: string;
}

export interface TopologyV2DetailPanelProps {
  /** Canonical `kind:slug` handle used by URL state and installed-app proof. */
  nodeId: string;
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
  /**
   * Connections grouped by relation type, each with a capped row preview + the
   * group's true total — so a contains-hub's depends group renders its real
   * count instead of collapsing into a generic overflow.
   *
   * 이 패널이 그리는 **모든** 관계 수의 유일한 출처다(2026-07-26). 예전엔
   * 별도의 `metric` prop 이 같은 수를 한 벌 더 들고 있었고, 그 벌에 없는
   * 버킷은 상단 집계에서도 조용히 빠졌다. 세는 곳과 그리는 곳을 하나로 묶어
   * "안 그린 걸 세거나, 센 걸 안 그리는" 상태를 타입 수준에서 없앤다.
   */
  groups: V2ConnectionGroupsView;
  /** 근거(evidence) group — the node's own backing vault doc(s), RATIO-SYSTEM
   * §4 promotion. Rows built by `buildV2EvidenceRows`; empty when the node
   * has no `evidenceIds` (hides the group entirely, same convention as
   * usedBy/dependsOn). */
  evidence: { rows: readonly V2EvidenceRow[]; total: number };
  /**
   * "코드 위치" (code location) — the node's REAL code evidence: raw file
   * paths (`src/foo/bar.ts`), not the self-referential vault-doc slug in
   * `evidence` above. Built by `deriveCodeLocations` from the node's own
   * title (when it's a path-titled element) plus its direct `contains`
   * children. Empty hides the section — never fabricated.
   */
  codeLocations: readonly string[];
  /**
   * S-C1 (owner 2026-07-20: "변경일 이런거? 그래야 구분이 될거 아냐") —
   * pre-formatted "언제 바뀌었나" label ("오늘" / "3일 전" / null when the
   * node has no backing doc date). Formatting lives in the caller so the
   * label passes through the same i18n path as every other string here.
   */
  updatedAtLabel?: string | null;
  /**
   * rank7 (design-council B5) — last-edit provenance, pre-resolved by the
   * caller (`resolveNodeLastEditSubject`) from real data only (a fresh
   * agent heartbeat attributed to this node, or a same-session self-write
   * record). `null` when neither source has evidence — the row is not
   * rendered (no fabrication). Human vs AI is the `kind` field only, never
   * a color.
   */
  lastEditSubject?: { kind: "agent" | "human"; ageLabel: string } | null;
  /**
   * rank7 — expected_mtime conflict badge. `true` only on a REAL mismatch
   * between the freshness this panel opened with and the freshness now
   * known (`hasNodeMtimeConflict`) — never shown speculatively.
   */
  mtimeConflict?: boolean;
  /** Pre-built agent handoff payload; the view owns clipboard + toast. */
  handoffText: string;
  /**
   * W2-A "문서" action tile target — `buildDocsVaultHref` result for this
   * node's backing vault doc, or `null` when the node has no `sourceSlug`
   * (the tile renders disabled rather than linking to a guessed URL).
   */
  documentHref: string | null;
  /** W2-A "관계 편집" action tile target — the 나침 무대(Compass Stage) deep
   * link (`/ontology/studio/?node=<id>`, ENHANCE mode opens this node with its
   * relation sockets). Replaced the retired ERD builder (2026-07-24). Always
   * available (any id resolves or the studio falls back to its default node). */
  studioEditHref: string;
  labels: TopologyV2DetailPanelLabels;
  onSelectConnection: (id: string) => void;
  onCopyHandoff: (text: string) => void;
  /**
   * 「이어서 새로 만들기」 — 이 개념에 붙는 새 노드를 만든다. 없으면 타일 자체가
   * 안 그려진다(못 하는 자리에 문을 그리지 않는다).
   */
  onCreateLinked?: () => void;
  /**
   * S7 이음새 — 「에이전트에게 말로 시키기」. 문장은 여기서 짓지 않는다:
   * 첫 마디 생성기(`buildFirstWords` 와 같은 함수)가 이 개념의 빈칸을 보고
   * 짓고, 이 패널은 **누가 눌렀는지만** 알린다. 두 입구가 다른 문장을 쓰면
   * 그 순간 갈라진다. 브리지가 없는 환경(웹)에서는 주입되지 않으므로 타일도
   * 나타나지 않는다 — 열리지 않을 문을 그리지 않는다.
   */
  onAskAgent?: () => void;
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
   * 열려 있는가. 이 패널은 **자기 등장/퇴장을 스스로 진다** — `<Surface>` 가
   * 퇴장 창(`EXIT_WINDOW_MS`) · 퇴장 클래스(`.topology-chrome-out`) · `inert` +
   * `pointer-events-none` 을 지므로 소비처가 다시 챙길 것이 없다.
   *
   * 종전에는 `presence: "entering" | "exiting"` 을 **부모가 계산해서** 내려줬다.
   * 그러면 퇴장 창의 타이머가 부모에 있어, 이 파일만 봐서는 이 표면에 나가는
   * 길이 있는지 알 수 없다(하드컷 래칫의 탐지기도 못 본다). 창은 표면이 진다.
   */
  open: boolean;
  /**
   * 퇴장이 **끝난 뒤** 한 번. 부모의 포지셔너를 내리는 신호로 쓴다 — 퇴장
   * 타이머가 둘이면 어느 쪽이 진실인지 알 수 없으므로, 창은 여기 하나뿐이고
   * 부모는 그 끝을 통보받는다.
   */
  onExited?: () => void;
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
  /** Project-only 0/1 source binding receipt. Other kinds ignore it. */
  projectSource?: ProjectSourceView | null;
  /** Executes the receipt's already-bounded next action (connect or remeasure). */
  onProjectSourceAction?: () => void | Promise<void>;
  /** Keeps the prior receipt visible while a replacement is measured. */
  projectSourceBusy?: boolean;
  /** Localized explicit-action failure; never used for picker cancellation. */
  projectSourceError?: string | null;
  /**
   * **정직한 강등** — 이 표면에서 그 행동을 실행할 수 없을 때만 넘긴다(웹:
   * 브라우저가 고른 폴더의 절대 경로를 모른다). `surfaces.md` 가 요구하는
   * 세 가지를 전부 갖는다: 왜 안 되는지 · 어디서 되는지 · **여기서도 되는 것**.
   *
   * 종전에는 이 자리가 「설치 앱에서 코드 폴더를 연결할 수 있어요」라는 회색
   * 문장 하나였다 — 링크도 아니고, 왜인지도 없고, 이 화면에서 무엇이 되는지도
   * 말하지 않았다. 진단만 하고 처방이 없는 화면이 그렇게 생긴다.
   */
  projectSourceDegraded?: {
    why: string;
    ctaLabel: string;
    href: string;
    stillWorks: string;
  } | null;
}

/**
 * **진단 바로 밑의 처방.** 「왜 필요한지」한 문장 + 그 자리에서 누르는 것 하나.
 *
 * 이 자리에 상자를 두르는 이유는 장식이 아니라 **묶기**다 — 위의 상태 세 줄은
 * 사실이고, 이 상자 안은 「그래서 지금 무엇을 하면 되는가」다. 상자가 뜨는
 * 조건이 곧 「고칠 것이 있다」이므로(호출부 `showSourceRemedy`), 상자 자체가
 * 타입 있는 사실 하나(`topGap !== null`)를 나른다.
 *
 * 값은 전부 기존 토큰이다 — 바탕/테두리는 바로 아래 액션 스트립이 쓰는
 * `--topology-v2-panel-action-*`, 버튼은 종전 푸터 액션과 **글자 하나 안 바뀐**
 * 같은 스킨. 새 토큰 0개.
 */
function ProjectSourceRemedy({
  why,
  actionLabel,
  busyLabel,
  busy,
  onAction,
  degraded,
}: {
  why?: string;
  actionLabel?: string;
  busyLabel?: string;
  busy: boolean;
  onAction?: () => void | Promise<void>;
  degraded?: TopologyV2DetailPanelProps["projectSourceDegraded"];
}) {
  return (
    <div
      data-testid="topology-v2-project-source-remedy"
      data-remedy-mode={onAction ? "actionable" : "degraded"}
      className="mt-0.5 flex flex-col gap-2 rounded-chip border border-[color:var(--topology-v2-panel-action-border)] bg-[color:var(--topology-v2-panel-action-surface)] px-2.5 py-2"
    >
      {why ? (
        <p
          data-testid="topology-v2-project-source-why"
          className="text-label text-[color:var(--topology-v2-panel-text-tertiary)]"
        >
          {why}
        </p>
      ) : null}
      {onAction ? (
        <button
          type="button"
          onClick={() => { void onAction(); }}
          disabled={busy}
          aria-busy={busy}
          data-testid="topology-v2-project-source-action"
          className={controlClass({
            shape: "chip",
            size: "lg",
            className:
              "w-fit shrink-0 font-semibold border-[color:var(--topology-v2-panel-primary-border)] bg-[color:var(--topology-v2-panel-primary-surface)] text-[color:var(--topology-v2-panel-primary-text)] hover:border-[color:var(--topology-v2-panel-primary-border-hover)] hover:bg-[color:var(--topology-v2-panel-primary-surface-hover)] disabled:cursor-wait",
          })}
        >
          {busy ? busyLabel ?? actionLabel : actionLabel}
        </button>
      ) : degraded ? (
        <>
          {/* ① 왜 이 화면에서는 안 되나 — 사과문이 아니라 이유. */}
          <p
            data-testid="topology-v2-project-source-degraded-why"
            className="text-label text-[color:var(--topology-v2-panel-text-tertiary)]"
          >
            {degraded.why}
          </p>
          {/* ② 어디로 가면 되나 — 문장이 아니라 실제로 열리는 목적지. */}
          <Link
            href={degraded.href}
            data-testid="topology-v2-project-source-degraded-cta"
            className={controlClass({
              shape: "chip",
              size: "lg",
              className:
                "w-fit shrink-0 font-semibold border-[color:var(--topology-v2-panel-primary-border)] bg-[color:var(--topology-v2-panel-primary-surface)] text-[color:var(--topology-v2-panel-primary-text)] hover:border-[color:var(--topology-v2-panel-primary-border-hover)] hover:bg-[color:var(--topology-v2-panel-primary-surface-hover)]",
            })}
          >
            {degraded.ctaLabel}
          </Link>
          {/* ③ 그래도 여기서 되는 것 — 되는 일까지 못 한다고 말하지 않는다.
              색이 섞인 바탕 위라 quaternary 가 아니라 tertiary 부터다
              (`quaternary-ink-surface` 계약). */}
          <p
            data-testid="topology-v2-project-source-degraded-still-works"
            className="text-label text-[color:var(--topology-v2-panel-text-tertiary)]"
          >
            {degraded.stillWorks}
          </p>
        </>
      ) : null}
    </div>
  );
}

function ProjectSourceStatusIcon({ status }: { status: ProjectSourceStatus }) {
  let Icon = CircleHelp;
  let color = "var(--topology-v2-panel-text-tertiary)";
  if (status === "verified_current") {
    Icon = CheckCircle2;
    color = "var(--color-status-success)";
  } else if (status === "invalid") {
    Icon = AlertCircle;
    color = "var(--color-status-danger)";
  } else if (status === "needs_evidence" || status === "review_required") {
    color = "var(--color-status-warning)";
  }
  return (
    <span
      data-source-status-icon={status}
      className="flex shrink-0 items-center justify-center"
      style={{ color }}
    >
      <Icon size={14} aria-hidden="true" />
    </span>
  );
}

// 데이터시트 내부 정제 (2026-07-23) — `justify-start` + 고정 상단 패딩: 라벨이
// 로케일에 따라 1줄/2줄로 갈려도 네 타일의 아이콘이 같은 y 에 정렬된다
// (grid 가 높이는 이미 균등화하므로, 남는 공백은 아래로만 빠진다). 2줄 라벨의
// 행간은 아래 ACTION_TILE_INK 가 램프 예외로 조인다.
// rank3 — press(active) 촉각: hover 위에 한 단 진한 `panel-row-active` 표면을
// pointer-down 동안만 얹어 "누르는 순간"을 색만으로 알린다(Toss press-state).
// transition-colors(150ms)로 하드 토글 방지 — transform/scale 없음.
/**
 * 결과-설명 툴팁 래퍼 — tip 이 있으면 shared Tooltip 으로 감싸고, 없으면
 * 트리거를 그대로 반환(하위호환·DOM 무증가). side="top": 타일 바로 아래에
 * "영역 전개" 같은 다음 행동 버튼이 있어 side="bottom" 이면 hover 중 그
 * 버튼을 덮어 클릭을 방해한다(사용성 검수 판정). 위로 띄우면 메트릭 라인을
 * 잠깐 가리지만 그건 hover 중에만이고, 다음 행동을 막지는 않는다.
 */
function withActionTip(tip: string | undefined, trigger: ReactElement): ReactElement {
  if (!tip) return trigger;
  return (
    <Tooltip content={tip} side="top">
      {trigger}
    </Tooltip>
  );
}


// 시안 재설계 (2026-07-24) — 액션은 무거운 보더 박스가 아니라 조용한 ghost
// 아이콘+라벨(아이콘 위, 10px 라벨 아래). 표면/보더 없음 — hover/active 에만
// row-hover/active 표면이 얹힌다. flex-1 로 스트립을 균등 분할한다.
//
// 행간 램프의 유일한 명시 예외. 이 라벨은 10px 2행이 고정 높이 타일 안에
// 들어가야 하는데, 짝인 --leading-caption(14px)을 넣으면 두 행이 6px 자라
// 액션 스트립이 아래 메트릭 라인을 밀어낸다 — 크롬 스케일 계약을 깨는
// 쪽이라 여기서는 비율 응집을 택한다. 램프를 넓히지 않는 이유: 이 값이
// 필요한 자리는 앱 전체에 이 하나뿐이고, 쓰임이 하나인 토큰은 규격이 아니라
// 오정보다.
//
// 별도 상수로 뽑은 이유: disable 주석은 **줄 단위**라 클래스 문자열에 그냥
// 붙이면 같은 줄의 text-[Npx] 부채까지 함께 침묵시킨다. 그건 이 저장소가
// 래칫으로 막으려던 바로 그 실패 모드(침묵하는 통과)다.
// eslint-disable-next-line no-restricted-syntax -- 고정 높이 타일 안 10px 2행 라벨: 램프 짝은 타일을 6px 키운다
const ACTION_TILE_LEADING = "leading-[1.1]";

/**
 * **한국어는 아무 글자에서나 끊긴다 — 끊길 자리를 정해 준다** (2026-07-29
 * 설치 앱 실측).
 *
 * 이 스트립은 웹에서 다섯 칸이라 라벨이 한 줄에 들어갔다. 앱에서는 LLM 다리가
 * 있어 「말로 시키기」가 붙어 **여섯 칸**이 되고, 칸이 좁아지자 라벨 셋이
 * 단어 가운데서 잘렸다: 「AI 요약 복 / 사」 · 「말로 시키 / 기」 ·
 * 「이것만 보 / 기」. 브라우저의 기본 줄바꿈은 CJK 를 음절 단위로 끊기 때문에,
 * 폭만 좁아지면 어느 라벨이든 이렇게 된다.
 *
 * `keep-all` 은 공백에서만 끊게 한다 — 「AI 요약 / 복사」 처럼 두 줄이 되더라도
 * 단어는 살아 있다. 타일 높이는 `items-stretch` 가 이미 균일화하므로 줄 수가
 * 늘어도 치수는 안 흔들린다.
 *
 * **웹 검증만으로는 못 잡는 종류다** — 다섯 칸에서는 재현되지 않는다.
 * 데스크톱 능력이 칸을 하나 더 만들 때 이 스트립이 좁아진다는 사실이
 * `surfaces.md` 가 말하는 "설치 앱 실측만 인정" 의 실제 사례다.
 */
/**
 * 액션 타일 — **누를 수 있게 생겨야 한다** (2026-08-03 소유자 실보고:
 * *"이런거는 버튼이 테두리가 예쁘게 있어야 구분이 되는거 아닐까?"*).
 *
 * 종전에는 테두리도 안정 배경도 없이 아이콘 + 글자만 떠 있었다. 그래서 바로
 * 위의 「연결된 항목 19 · 근거 문서 1」 같은 **읽는 텍스트와 구분되지 않았다** —
 * 호버해야만 배경이 생기니, 누를 수 있다는 사실을 마우스를 얹어 봐야 알았다.
 *
 * 앞선 정비에서 7칸을 3층으로 접었는데 **밀도만 보고 어포던스를 안 봤다.**
 *
 * 값은 새로 만들지 않았다 — 같은 패널의 엣지 버전(`TopologyV2EdgePanel`)이
 * 이미 `--topology-v2-panel-action-{border,surface}` 로 테두리를 그린다. 그
 * 토큰들은 정의돼 있었고 이 타일만 안 쓰고 있었다.
 *
 * **2026-08-03 — 값 층 위로 올렸다.** 이 다섯(+링크 둘)은 앞선 정규화가
 * 「모양 여섯이 전부 가로라 자리가 없다」며 남긴 것이고, `shape: "tile"` 이
 * 생기면서 자리가 났다. 치수는 이미 램프와 같았다 —
 * `gap-2 px-2 py-2.5 text-label` 은 `tile/md` 와 바이트 동일이다. 바뀐 것은
 * **반경 하나**(6 → 9px): 램프의 세로 타일은 `rounded-card` 를 쓴다.
 *
 * 여기 남는 것은 **잉크뿐**이다 — 스코프 토큰
 * (`--topology-v2-panel-action-{border,surface}`)과 호버·누름은 값 층이
 * 일부러 안 내는 층이라서다. 램프 호출은 **자리마다 인라인**이다: 완성
 * 문자열을 상수로 뽑으면 채택 래칫이 그것을 손으로 쓴 컨트롤로 센다(래칫은
 * 여는 태그 안의 **리터럴** `controlClass(` 만 본다).
 */
const ACTION_TILE_INK =
  `flex-1 border-[color:var(--topology-v2-panel-action-border)] bg-[color:var(--topology-v2-panel-action-surface)] font-medium ${ACTION_TILE_LEADING} [word-break:keep-all] text-[color:var(--topology-v2-panel-text-tertiary)] hover:border-[color:var(--topology-v2-panel-domain-border-hover)] hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-secondary)] active:bg-[color:var(--topology-v2-panel-row-active)]`;

/**
 * 관계 그룹 헤더의 방향 글리프 — 승인된 시안(mockup-panel-detail)의 SVG 를
 * 그대로 옮긴다. 담는 것=아래로 소유(계층), 쓰는 곳=밖에서 들어옴(arrow-in),
 * 기대는 곳=밖으로 나감(arrow-out), 속한 곳=담는 것의 상하 반전(같은 관계,
 * 반대 방향), 근거=문서, 코드=`</>`. currentColor 로만 그려 잉크는 부모의
 * `--topology-v2-panel-group-dir` 텍스트 색을 상속한다.
 */
function GroupDirIcon({
  variant,
}: {
  variant: "contains" | "usedBy" | "dependsOn" | "belongsTo" | "evidence" | "code";
}) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (variant) {
    case "contains":
      return (
        <svg {...common}>
          <circle cx={12} cy={5} r={2.2} />
          <path d="M12 7v4M12 11H6v3M12 11h6v3" />
          <circle cx={6} cy={17} r={2.2} />
          <circle cx={18} cy={17} r={2.2} />
        </svg>
      );
    case "belongsTo":
      // 담는 것 글리프의 상하 반전 — 같은 계층 관계를 반대 방향에서 본 것이라는
      // 뜻을 형태로만 말한다(새 색/새 기호 0). 부모가 둘 이상인 노드가 실제로
      // 있어(dogfood 56개) 위쪽 노드는 둘로 둔다.
      return (
        <svg {...common}>
          <circle cx={12} cy={19} r={2.2} />
          <path d="M12 17v-4M12 13H6v-3M12 13h6v-3" />
          <circle cx={6} cy={7} r={2.2} />
          <circle cx={18} cy={7} r={2.2} />
        </svg>
      );
    case "usedBy":
      return (
        <svg {...common}>
          <circle cx={18} cy={12} r={2.4} />
          <path d="M4 12h10M11 8.5l3.5 3.5-3.5 3.5" />
        </svg>
      );
    case "dependsOn":
      return (
        <svg {...common}>
          <circle cx={6} cy={12} r={2.4} />
          <path d="M8.4 12h10M15 8.5l3.5 3.5-3.5 3.5" />
        </svg>
      );
    case "evidence":
      return (
        <svg {...common}>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v4h4M10 13h5M10 16h5" />
        </svg>
      );
    case "code":
      return (
        <svg {...common}>
          <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
        </svg>
      );
  }
}

/**
 * 관계 그룹 공통 셸 — 방향 글리프 + 평문 볼드 라벨 + 인디고 카운트 칩 +
 * 언더라인 디바이더가 있는 헤더, 그 아래 행 목록. 모든 그룹(담는 것/쓰는 곳/
 * 기대는 곳/근거/코드 위치)이 같은 골격으로 읽히게 한 곳에서 렌더한다.
 */
function RelationGroupShell({
  groupKey,
  dir,
  label,
  help,
  count,
  headerExtra,
  children,
}: {
  groupKey: string;
  dir: "contains" | "usedBy" | "dependsOn" | "belongsTo" | "evidence" | "code";
  label: string;
  help?: string;
  count: number;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col" data-datasheet-group={groupKey}>
      <div className="mb-1.5 flex items-center gap-2 border-b border-[color:var(--topology-v2-panel-group-underline)] px-0.5 pb-2">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[color:var(--topology-v2-panel-group-dir)]">
          <GroupDirIcon variant={dir} />
        </span>
        <span
          title={help}
          className="text-body font-semibold tracking-[0.005em] text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          {label}
        </span>
        <span
          data-datasheet-group-total={groupKey}
          className="rounded-chip bg-[color:var(--topology-v2-panel-count-surface)] px-1.5 py-px font-mono text-label leading-label text-[color:var(--topology-v2-panel-count-text)]"
        >
          {count}
        </span>
        {headerExtra}
      </div>
      {children}
    </div>
  );
}

export function TopologyV2DetailPanel({
  nodeId,
  slug,
  title,
  sourceTitle = null,
  kind,
  domain,
  powered,
  groups,
  evidence,
  codeLocations,
  updatedAtLabel = null,
  lastEditSubject = null,
  mtimeConflict = false,
  handoffText,
  documentHref,
  studioEditHref,
  labels,
  onSelectConnection,
  onCopyHandoff,
  onCreateLinked,
  onAskAgent,
  onClose,
  onSetPathSource,
  onEnterRealm,
  onOpenFullDetail,
  open,
  onExited,
  className,
  showHandoff = true,
  showSourcePath = true,
  projectSource = null,
  onProjectSourceAction,
  projectSourceBusy = false,
  projectSourceError = null,
  projectSourceDegraded = null,
}: TopologyV2DetailPanelProps) {
  const isProject = kind === "project";
  const showProjectSource = isProject && projectSource !== null;
  /**
   * **처방은 진단 옆에 붙는다.** 종전엔 진단(「연결된 코드 폴더가 없습니다」)이
   * 패널 위쪽 y=234 에, 그 처방(「코드 폴더 연결하기」)이 맨 아랫줄 y=647 에
   * 있었다 — 393px 떨어진 채, 사이에 액션 타일 넷과 근거 목록이 끼어 있었다.
   * 웹에서는 그 자리가 아예 버튼이 아니라 회색 문장 한 줄이었다(실측
   * 2026-08-04). 진단만 하고 처방을 못 주는 화면이 그렇게 생긴다.
   *
   * **틈(gap)이 있을 때만** 이 블록이 뜬다. 아무 문제가 없는 상태
   * (`use_current_evidence`)까지 상자로 감싸면 상자가 「여기 고칠 것이 있다」는
   * 뜻을 잃는다 — 그 상태의 행동은 지금처럼 푸터에 남는다. 그래서 어느 순간에도
   * 같은 컨트롤이 두 곳에 그려지지 않는다.
   */
  const showSourceRemedy = Boolean(
    showProjectSource
    && projectSource.topGap
    && labels.sourceAction
    && (onProjectSourceAction || projectSourceDegraded),
  );
  const showInlineHandoff = showHandoff && !(
    showProjectSource && projectSource.nextAction.id === "use_current_evidence"
  );
  // A project root's path finder remains available from the context menu.
  // Removing it only from this compact rail keeps the first ontology-reading
  // moment to four actions when the footer already owns agent handoff.
  const showInlinePath = !showProjectSource;
  const inlineActionCount =
    (documentHref ? 1 : 0)
    + 1
    + (showInlineHandoff ? 1 : 0)
    + (onAskAgent && labels.actionAskAgent ? 1 : 0)
    + (showInlinePath ? 1 : 0)
    + (onEnterRealm ? 1 : 0);
  const compactProjectRelations = useViewportBelow(1513);
  const collapseProjectRelations = showProjectSource && compactProjectRelations;
  // 시안 재설계 (2026-07-24) — 상단 stats 는 집계 한 줄. 타입별 분해는 아래
  // 각 관계 그룹 헤더의 카운트 칩이 담당한다(한 사실 한 번).
  //
  // 스코프 정정 (2026-07-26) — 합계는 **아래에 실제로 그려지는 그룹들의 total**
  // 에서 직접 만든다. 예전엔 `metric.*` 세 값만 더해서, 네 번째 버킷(속한 곳)
  // 이 그려지지도 세어지지도 않았고 부모만 있는 노드가 "이어진 곳 0" 이 됐다.
  // 같은 객체에서 더하면 "상단 = 아래 그룹 집계" 가 관례가 아니라 구성상 참이다.
  const connectedTotal =
    groups.contains.total + groups.usedBy.total + groups.dependsOn.total + groups.belongsTo.total;
  const hasConnections =
    connectedTotal > 0 || evidence.total > 0 || codeLocations.length > 0;

  // S2 파트 3 — 긴 "담는 것" 리스트는 경로 프리픽스 요약으로 접고, "전체 보기"
  // 토글로 기존 리스트를 편다(세션 임시 상태). 노드가 바뀌면 기본(요약)으로 리셋
  // 되도록 slug 를 key 로 쓴다(호출부 HomePage 가 key 를 주므로 재마운트).
  const [showAllContains, setShowAllContains] = useState(false);
  const [showProjectRelations, setShowProjectRelations] = useState(false);

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
    group: "contains" | "usedBy" | "dependsOn" | "belongsTo",
    dir: "contains" | "usedBy" | "dependsOn" | "belongsTo",
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
    const summaryToggle =
      group === "contains" &&
      view.summary !== undefined &&
      view.summary.usable &&
      view.total > V2_CONTAINS_SUMMARY_THRESHOLD ? (
        <button
          type="button"
          onClick={() => setShowAllContains((v) => !v)}
          data-testid="topology-v2-contains-summary-toggle"
          className={controlClass({
            shape: "link",
            size: "md",
            className:
              "ml-auto shrink-0 text-[color:var(--topology-v2-panel-text-tertiary)] hover:text-[color:var(--topology-v2-panel-text-secondary)] active:text-[color:var(--topology-v2-panel-text-primary)]",
          })}
        >
          {showAllContains ? labels.containsShowSummary : labels.containsShowAll}
        </button>
      ) : undefined;
    return (
      <RelationGroupShell
        groupKey={group}
        dir={dir}
        label={label}
        help={help}
        count={view.total}
        headerExtra={summaryToggle}
      >
        {useSummary && view.summary ? (
          <ul className="flex flex-col gap-0.5" data-testid="topology-v2-contains-summary">
            {view.summary.groups.map((g) => (
              <li
                key={`contains-summary:${g.key}`}
                className="flex items-center gap-2 px-2 py-1"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--topology-v2-panel-text-secondary)]">
                  {g.key}
                </span>
                <span className="shrink-0 font-mono text-label text-[color:var(--topology-v2-panel-text-quaternary)]">
                  {g.count}
                </span>
              </li>
            ))}
            {view.summary.otherCount > 0 ? (
              <li className="flex items-center gap-2 px-2 py-1">
                <span className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--topology-v2-panel-text-tertiary)]">
                  {labels.containsOtherGroup}
                </span>
                <span className="shrink-0 font-mono text-label text-[color:var(--topology-v2-panel-text-quaternary)]">
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
              // 시안: 행의 왼쪽 마크는 캔버스와 같은 kind 글리프(무엇인지) —
              // 관계 타입은 그룹 자체(담는 것/기대는 곳)가 이미 인코딩한다.
              <li key={`${group}:${row.id}`}>
                <RowButton
                  size="md"
                  onClick={() => onSelectConnection(row.id)}
                  data-datasheet-connection={row.id}
                  className="rounded-chip hover:bg-[color:var(--topology-v2-panel-row-hover)] active:bg-[color:var(--topology-v2-panel-row-active)]"
                >
                  <TopologyV2KindGlyph kind={row.kind} />
                  <span className="min-w-0 flex-1 truncate text-body text-[color:var(--topology-v2-panel-text-secondary)]">
                    {row.title}
                  </span>
                </RowButton>
              </li>
            ))}
          </ul>
        )}
        {overflow > 0 && !useSummary ? (
          <span
            data-datasheet-group-overflow={group}
            className="pl-[34px] pt-0.5 font-mono text-label text-[color:var(--topology-v2-panel-text-quaternary)]"
          >
            +{overflow}
          </span>
        ) : null}
      </RelationGroupShell>
    );
  };

  // 근거(evidence) group — CLICKABLE doc-link rows (W2-A promotion: these
  // used to be display-only). `row.id` is a vault slug (see
  // `buildV2EvidenceRows`'s own doc comment), the exact input
  // `buildDocsVaultHref` expects — no separate id-namespace mapping needed
  // (unlike `onSelectConnection`'s canvas-node ids, which are a different
  // namespace). No TraceMark here: these aren't canvas edges. Same header/
  // list shape as usedBy/dependsOn.
  //
  // Toss C2 — `row.path` (the folder prefix, e.g. "capabilities/") used to
  // render as an always-visible mono span next to the title. That's a raw
  // vault path, opaque to a non-developer, sitting right next to the plain
  // "근거" label. It now only surfaces via the row's native `title=` hover
  // (full `row.id` slug) — the row's own link already takes you to the doc,
  // so the path adds nothing a click doesn't already resolve.
  const renderEvidenceGroup = () => {
    if (evidence.total === 0) return null;
    return (
      <RelationGroupShell
        groupKey="evidence"
        dir="evidence"
        label={labels.metricEvidence}
        help={labels.metricEvidenceHelp}
        count={evidence.total}
      >
        <ul className="flex flex-col">
          {evidence.rows.map((row) => (
            <li key={`evidence:${row.id}`}>
              <Link
                href={buildDocsVaultHref({ slug: row.id })}
                data-datasheet-evidence={row.id}
                title={row.id}
                // 연결 행(`RowButton`)과 **같은 램프 스텝**이어야 한다 — 한 패널
                // 안에서 행 높이가 갈리면 「치수 규칙성」이 깨진다.
                className={controlClass({
                  shape: "row",
                  size: "md",
                  className:
                    "rounded-chip hover:bg-[color:var(--topology-v2-panel-row-hover)] active:bg-[color:var(--topology-v2-panel-row-active)]",
                })}
              >
                <FileText
                  size={14}
                  aria-hidden="true"
                  className="shrink-0 text-[color:var(--topology-v2-panel-text-tertiary)]"
                />
                <span className="min-w-0 flex-1 truncate text-body text-[color:var(--topology-v2-panel-text-secondary)]">
                  {row.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </RelationGroupShell>
    );
  };

  // "코드 위치" group — the node's REAL code evidence (raw file paths),
  // distinct from the "근거" group above (source-doc slug reference). Rows
  // are plain monospace text (not a `Link`/button) — raw code paths aren't
  // vault nodes, so the clickable-ref visual pattern would misrepresent them
  // as navigable. Each row gets a lightweight copy affordance since a path
  // is exactly the string an agent/developer wants on the clipboard next.
  const renderCodeLocationsGroup = () => {
    if (codeLocations.length === 0) return null;
    return (
      <RelationGroupShell
        groupKey="code-locations"
        dir="code"
        label={labels.codeLocationsLabel}
        count={codeLocations.length}
      >
        <ul className="flex flex-col">
          {codeLocations.map((path) => (
            <CodeLocationRow
              key={path}
              path={path}
              copyLabel={labels.codeLocationsCopyLabel}
              copiedLabel={labels.codeLocationsCopiedLabel}
            />
          ))}
        </ul>
      </RelationGroupShell>
    );
  };

  return (
    /* 나가는 길을 `Surface` 가 진다 (2026-08-03). 종전엔 부모(HomePage)가
       `usePanelPresence` 로 창을 열고 `presence` prop 으로 클래스를 지시했는데,
       그러면 «이 표면에 퇴장이 있는가» 가 이 파일 밖의 사실이 된다.

       `origin` prop 은 **주지 않는다.** 이 팝오버의 성장 원점은 정적인 문자열이
       아니라 방금 클릭한 노드의 화면 좌표이고, HomePage 포지셔너가 그것을
       `--topology-chrome-in-origin` (px 로컬 좌표)으로 주입한다 — CSS 변수는
       상속되므로 여기서 `transform-origin` 을 인라인으로 덮으면 오히려 팝오버가
       고정된 자리에서 태어난다. 클래스 쪽 `var(--topology-chrome-in-origin,
       center top)` 이 그대로 이긴다.

       바깥 상자는 **폭만** 진다 — 안쪽 상자가 스크롤 컨테이너(max-height +
       overflow-y-auto)이고 sticky 푸터가 그 스크롤포트에 앵커되므로, 그 역할을
       옮기지 않는다. */
    <Surface
      open={open}
      onExited={onExited}
      className={["w-[var(--topology-v2-panel-width)]", className ?? ""].join(" ")}
    >
      <div
        role="group"
        aria-label={title}
        data-testid="topology-v2-detail-panel"
        data-selected-node-id={nodeId}
        data-selected-node-kind={kind}
        data-selected-node-title={title}
        data-surface-role="active-node-inspector"
        data-attention-role="supporting-detail"
        data-datasheet-density="instrument"
        onKeyDown={handleKeyDown}
        // P3-③ (2026-07-21 리텐션 라운드) — 이 패널은 `--topology-node-popover-top`
        // 에 fixed 앵커되는데(HomePage 포지셔너), 자기 자신은 높이 제약이 없어
        // 연결이 많은 노드에서 콘텐츠가 뷰포트를 넘기면 "전체 상세" 푸터가
        // 화면 밖으로 밀려나 마우스로 닿지 않았다(1440×900, y=911 실측). 뷰포트
        // 기준 max-height + 내부 스크롤로 패널이 항상 뷰포트 안에 온전히 앵커
        // 되도록 clamp한다. 시안 재설계(2026-07-24) — root 는 패딩 없이 스크롤
        // 컨테이너로만 두고, 각 존(정체/ops/관계)이 자기 패딩을 갖는다. 그래야
        // 풀블리드 존 디바이더(`zdiv`)와 sticky 푸터가 음수 마진 없이 앵커된다.
        className={[
          // 폭은 바깥 `Surface` 가 정한다(소비처 className 의 반응형 폭 덮어쓰기
          // 포함) — 여기서는 그 폭을 채우고 나머지 재질만 진다.
          "flex w-full flex-col",
          "max-h-[var(--topology-v2-panel-max-height)] overflow-y-auto",
          "rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)]",
          "bg-[color:var(--topology-v2-panel-surface)]",
          "shadow-[var(--topology-v2-panel-shadow)]",
        ].join(" ")}
      >
        {/* ZONE 1 · IDENTITY — 균형 헤더: 이름 hero(좌) + kind 배지·닫기(우),
            아래 신선도(좌) + 도메인 칩(우). 양쪽이 질량을 가져 우측 공백이
            생기지 않고 긴 이름에서도 성립한다. */}
        <div className="px-[var(--topology-v2-panel-pad)] pt-[15px] pb-4">
          <div className="mb-[11px] flex items-center gap-2.5">
            <h2 className="min-w-0 flex-1 truncate text-title font-[650] leading-title tracking-title text-[color:var(--topology-v2-panel-text-primary)]">
              {title}
            </h2>
            {/* kind = 읽히는 텍스트 배지(글리프 + 단어), 우측 counterweight */}
            <span className="flex shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--topology-v2-panel-kind-badge-border)] bg-[color:var(--topology-v2-panel-kind-badge-surface)] py-[3px] pl-[7px] pr-[9px] text-label font-semibold tracking-[0.01em] text-[color:var(--topology-v2-panel-text-secondary)]">
              <TopologyV2KindGlyph kind={kind} size={12} />
              {labels.kindLabel}
            </span>
            <IconButton
              label={labels.close}
              size="sm"
              onClick={onClose}
              data-testid="topology-v2-detail-panel-close"
              className="-mr-1 text-[color:var(--topology-v2-panel-text-tertiary)] hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-secondary)] active:bg-[color:var(--topology-v2-panel-row-active)]"
            >
              <X size={15} />
            </IconButton>
          </div>
          {showSourcePath && sourceTitle && sourceTitle !== title ? (
            <div
              data-testid="topology-v2-detail-panel-source-path"
              className="mb-2 font-mono text-label text-[color:var(--topology-v2-panel-text-quaternary)] break-all"
            >
              {sourceTitle}
            </div>
          ) : null}
          {/* project source receipt 는 아래 OPS rail 이 meta 자리까지 맡는다. */}
          {!showProjectSource || domain || updatedAtLabel ? (
            <div className="flex items-center justify-between gap-3">
              {!showProjectSource ? (
                updatedAtLabel ? (
                  <span
                    data-testid="topology-v2-datasheet-updated-at"
                    className="shrink-0 text-body text-[color:var(--topology-v2-panel-text-quaternary)]"
                  >
                    {updatedAtLabel}
                  </span>
                ) : (
                  <span className="shrink-0 text-body text-[color:var(--topology-v2-panel-text-quaternary)]">
                    {powered ? labels.poweredOn : labels.poweredOff}
                  </span>
                )
              ) : updatedAtLabel ? (
                <span
                  data-testid="topology-v2-datasheet-updated-at"
                  className="shrink-0 text-body text-[color:var(--topology-v2-panel-text-quaternary)]"
                >
                  {labels.sourceOntologyDocument ? `${labels.sourceOntologyDocument} · ` : ""}
                  {updatedAtLabel}
                </span>
              ) : null}
              {domain ? (
                <button
                  type="button"
                  onClick={() => onSelectConnection(domain.id)}
                  aria-label={`${labels.domainLabel} ${domain.title}`}
                  data-testid="topology-v2-detail-panel-domain"
                  className={controlClass({
                    shape: "card",
                    size: "sm",
                    className:
                      "min-w-0 text-left border-[color:var(--topology-v2-panel-domain-border)] bg-[color:var(--topology-v2-panel-domain-surface)] hover:border-[color:var(--topology-v2-panel-domain-border-hover)] hover:bg-[color:var(--topology-v2-panel-domain-surface-hover)]",
                  })}
                >
                  <span className="shrink-0 text-label text-[color:var(--topology-v2-panel-text-tertiary)]">
                    {labels.domainLabel}
                  </span>
                  <span className="truncate text-body font-semibold text-[color:var(--topology-v2-panel-domain-text)]">
                    {domain.title}
                  </span>
                  <ChevronRight
                    size={13}
                    aria-hidden="true"
                    className="shrink-0 text-[color:var(--topology-v2-panel-domain-text)] opacity-65"
                  />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <hr className="h-px border-0 bg-[color:var(--topology-v2-panel-zone-divider)]" />

        {/* ZONE 2 · OPS — last-edit/충돌(실데이터 있을 때만) + 평문 stats +
            조용한 액션 스트립. */}
        <div className="flex flex-col gap-3 px-[var(--topology-v2-panel-pad)] pt-3 pb-2.5">
          {/* rank7 (design-council B5) — last-edit provenance + expected_mtime
              conflict, both gated on real data by the caller. */}
          {lastEditSubject ? (
            <LastEditSubjectRow
              kind={lastEditSubject.kind}
              prefixLabel={labels.editSubjectPrefix}
              subjectLabel={lastEditSubject.kind === "agent" ? labels.editSubjectAgent : labels.editSubjectHuman}
              ageLabel={lastEditSubject.ageLabel}
            />
          ) : null}
          {mtimeConflict ? <MtimeConflictBadge message={labels.editConflictMessage} /> : null}

          {/* Project 는 같은 자리를 receipt rail 로 치환한다. 나머지는 기존
              평문 stats(집계 한 줄)를 그대로 유지한다. */}
          {showProjectSource ? (
            <div
              data-testid="topology-v2-project-source-receipt"
              data-source-status={projectSource.status}
              data-source-version={projectSource.contractVersion}
              data-source-measured-at={projectSource.measuredAt ?? "unmeasured"}
              data-source-top-gap={projectSource.topGap?.id ?? "none"}
              data-source-action={projectSource.nextAction.id}
              data-source-currentness={projectSource.currentness}
              data-source-cardinality={projectSource.bindingCardinality}
              data-source-layout="status-action-separated"
              data-source-gap-visible={projectSource.topGap !== null}
              aria-live="polite"
              className="flex flex-col gap-2 text-body text-[color:var(--topology-v2-panel-text-tertiary)]"
            >
              {labels.sourceHeading ? (
                <span
                  data-testid="topology-v2-project-source-heading"
                  className="text-label font-semibold text-[color:var(--topology-v2-panel-text-secondary)]"
                >
                  {labels.sourceHeading}
                </span>
              ) : null}
              <div className="flex min-w-0 items-center gap-1.5 text-[color:var(--topology-v2-panel-text-secondary)]">
                <ProjectSourceStatusIcon status={projectSource.status} />
                <span className="truncate font-medium">{labels.sourceStatus}</span>
                {labels.sourceKind ? (
                  <span className="ml-auto shrink-0 font-mono text-label text-[color:var(--topology-v2-panel-text-quaternary)]">
                    {labels.sourceKind}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{labels.sourceMeasuredAt}</span>
                <span className="shrink-0">{labels.sourceCurrentness}</span>
              </div>
              {projectSource.topGap && labels.sourceGap ? (
                <span
                  data-testid="topology-v2-project-source-gap"
                  className="text-[color:var(--topology-v2-panel-text-secondary)]"
                >
                  {labels.sourceGapLabel ? (
                    <span className="font-medium">{labels.sourceGapLabel}: </span>
                  ) : null}
                  {labels.sourceGap}
                </span>
              ) : null}
              {projectSourceError ? (
                <span
                  data-testid="topology-v2-project-source-error"
                  className="text-[color:var(--color-status-danger)]"
                >
                  {projectSourceError}
                </span>
              ) : null}
              {showSourceRemedy ? (
                <ProjectSourceRemedy
                  why={labels.sourceWhy}
                  actionLabel={labels.sourceAction}
                  busyLabel={labels.sourceBusy}
                  busy={projectSourceBusy}
                  onAction={onProjectSourceAction}
                  degraded={projectSourceDegraded}
                />
              ) : null}
            </div>
          ) : (
            <div
              data-testid="topology-v2-detail-panel-stats"
              title={labels.metricHelp}
              className="flex items-center gap-1.5 text-body text-[color:var(--topology-v2-panel-text-tertiary)]"
            >
              <span>{labels.statsConnected}</span>
              <b className="font-[650] tabular-nums text-[color:var(--topology-v2-panel-text-secondary)]">
                {connectedTotal}
              </b>
              <span className="text-[color:var(--topology-v2-panel-text-quaternary)]">·</span>
              <span>{labels.statsEvidenceDocs}</span>
              <b className="font-[650] tabular-nums text-[color:var(--topology-v2-panel-text-secondary)]">
                {evidence.total}
              </b>
            </div>
          )}

          {/* 액션 스트립 — 조용한 ghost 아이콘+라벨(무거운 박스 아님). 핸들러/
              href 가 없는 항목은 렌더하지 않는다(죽은 어포던스 금지).

              **3층이다** (2026-08-03, PO 카운슬 평결 ④). 종전엔 7칸이 한 행에서
              `flex-1` 로 나뉘어 **칸당 42.6px** 였고(패널 352px · 액션 영역 322px),
              그 폭에서 「AI에게 줄 항목 정보 복사」가 **4줄**로 감겼다. `items-stretch`
              가 행 높이를 최댓값에 맞추므로 **주목 승자를 중요도가 아니라 글자 수가
              정하고 있었다** — 2줄짜리 네 칸이 4줄 높이의 빈 공간을 떠안았다.

              그리고 이건 1회 관측이 아니다: 아래 440행 주석이 **6칸 시점에 이
              붕괴를 이미 예견**했고, 그 예견을 읽을 수 있는 상태에서 7번째가
              추가됐다(#862).

              **자르는 기준은 빈도가 아니라 자격이다.** 개수를 줄이려면 「누가 안
              쓰는지」를 알아야 하는데 그 관측은 0이다. 대신 **하는 일의 종류**로
              묶는다 — 이 노드에 하는 일 / 지도를 이 노드 기준으로 바꾸는 일 /
              에이전트에게 넘기는 일. 실측: 3칸 104px(2줄) · 2칸 159px(1줄).

              **삭제 0 · 병합 0.** 두 AI 타일은 겉보기엔 중복이나 **대상 런타임이
              다르다** — 복사는 볼트 밖 에이전트(Claude Code·Codex)로 나가는 문이고
              물어보기는 앱 안 LLM 브릿지다. 웹은 `llmBridgeAvailable` 이 false 라
              병합하면 그 표면의 에이전트 핸드오프가 **0이 된다**. */}
          <div
            role="group"
            aria-label={labels.actionsGroupLabel}
            data-testid="topology-v2-detail-panel-actions"
            data-inline-action-count={inlineActionCount}
            className={showProjectSource
              ? "flex flex-col gap-1.5 border-t border-[color:var(--topology-v2-panel-zone-divider)] pt-3"
              : "flex flex-col gap-1.5"}
          >
          {/* 1층 — 이 노드에 하는 일. 「관계 편집」이 무조건 있어 항상 렌더된다. */}
          <div className="flex items-start gap-1.5" data-action-row="node">
            {documentHref
              ? withActionTip(
                  labels.actionDocumentTip,
                  <Link
                    href={documentHref}
                    data-testid="topology-v2-detail-panel-action-document"
                    className={controlClass({ shape: "tile", size: "md", className: ACTION_TILE_INK })}
                  >
                    <FileText size={16} aria-hidden="true" />
                    <span>{labels.actionDocument}</span>
                  </Link>,
                )
              : null}
            {/*
              **이어서 새로 만들기** — 「관계 편집」이 공방으로 나가는 것과 달리
              이 자리는 지도에 남는다. 소유자 지시 2026-08-03: *"노드 클릭하면…
              여기서 내가 하고싶은게 바로 신규노드 연결하기(생성하기)"*.

              버튼 자리를 패널로 잡은 이유: 이미 「관계 편집」이 여기 있어 형제로
              읽히고, 노드 주변 아이콘은 지도가 붐비는 데다 작은 표적이 된다.

              핸들러가 없으면 타일 자체가 없다 — 못 하는 자리에 문을 그리지 않는다.
            */}
            {onCreateLinked && labels.actionCreateLinked
              ? withActionTip(
                  labels.actionCreateLinkedTip,
                  <button
                    type="button"
                    onClick={onCreateLinked}
                    data-testid="topology-v2-detail-panel-action-create-linked"
                    className={controlClass({ shape: "tile", size: "md", className: ACTION_TILE_INK })}
                  >
                    <Plus size={16} aria-hidden="true" />
                    <span>{labels.actionCreateLinked}</span>
                  </button>,
                )
              : null}
            {withActionTip(
              labels.actionEditRelationsTip,
              <Link
                href={studioEditHref}
                data-testid="topology-v2-detail-panel-action-edit"
                className={controlClass({ shape: "tile", size: "md", className: ACTION_TILE_INK })}
              >
                <GitBranch size={16} aria-hidden="true" />
                <span>{labels.actionEditRelations}</span>
              </Link>,
            )}
          </div>
          {/* 2층 — 지도를 이 노드 기준으로 바꾸는 일. 둘 다 없으면 층 자체가 없다. */}
          {showInlinePath || onEnterRealm ? (
          <div className="flex items-start gap-1.5" data-action-row="map">
            {showInlinePath
              ? withActionTip(
                  labels.actionPathTip,
                  <button
                    type="button"
                    onClick={onSetPathSource}
                    data-testid="topology-v2-detail-panel-action-path"
                    className={controlClass({ shape: "tile", size: "md", className: ACTION_TILE_INK })}
                  >
                    <Route size={16} aria-hidden="true" />
                    <span>{labels.actionPath}</span>
                  </button>,
                )
              : null}
            {/* S4 "영역 전개" 2차 발견 경로 — 컨테이너 노드에서만(HomePage 주입). */}
            {onEnterRealm
              ? withActionTip(
                  labels.actionRealmTip,
                  <button
                    type="button"
                    onClick={onEnterRealm}
                    data-testid="topology-v2-detail-panel-action-realm"
                    className={controlClass({ shape: "tile", size: "md", className: ACTION_TILE_INK })}
                  >
                    <Orbit size={16} aria-hidden="true" />
                    <span>{labels.actionRealm}</span>
                  </button>,
                )
              : null}
          </div>
          ) : null}
          {/* 3층 — 에이전트에게 넘기는 일. 복사가 상수(두 표면 모두)이고
              물어보기는 브릿지가 있을 때만이라, 복사가 먼저 선다. */}
          {showInlineHandoff || (onAskAgent && labels.actionAskAgent) ? (
          <div className="flex items-start gap-1.5" data-action-row="agent">
            {showInlineHandoff
              ? withActionTip(
                  labels.actionCopyHandoffTip,
                  <button
                    type="button"
                    onClick={() => onCopyHandoff(handoffText)}
                    aria-label={labels.handoff}
                    data-testid="topology-v2-detail-panel-action-handoff"
                    className={controlClass({ shape: "tile", size: "md", className: ACTION_TILE_INK })}
                  >
                    <Copy size={16} aria-hidden="true" />
                    <span>{labels.actionCopyHandoff}</span>
                  </button>,
                )
              : null}
            {onAskAgent && labels.actionAskAgent
              ? withActionTip(
                  labels.actionAskAgentTip,
                  <button
                    type="button"
                    onClick={onAskAgent}
                    aria-label={labels.actionAskAgent}
                    data-testid="topology-v2-detail-panel-action-ask-agent"
                    className={controlClass({ shape: "tile", size: "md", className: ACTION_TILE_INK })}
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                    <span>{labels.actionAskAgent}</span>
                  </button>,
                )
              : null}
          </div>
          ) : null}
          </div>
        </div>

        <hr className="h-px border-0 bg-[color:var(--topology-v2-panel-zone-divider)]" />

        {/* ZONE 3 · RELATIONS — 그룹 사이 리듬은 `--topology-v2-panel-zone-gap`
            (28px)로 그룹 내부 행 간격보다 훨씬 크게 벌려 각 typed-fact 블록이
            자체 섹션으로 읽히게 한다("space encodes grouping"). */}
        <div className="flex flex-col gap-[var(--topology-v2-panel-zone-gap)] px-[var(--topology-v2-panel-pad)] py-[18px]">
          {collapseProjectRelations && connectedTotal > 0 ? (
            <div
              data-testid="topology-v2-project-relations-summary"
              data-source-relations-expanded={showProjectRelations}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-label text-[color:var(--topology-v2-panel-text-tertiary)]"
            >
              {groups.contains.total > 0 ? (
                <span>
                  {labels.metricContains}
                  <b className="ml-1 tabular-nums text-[color:var(--topology-v2-panel-text-secondary)]">
                    {groups.contains.total}
                  </b>
                </span>
              ) : null}
              {groups.usedBy.total > 0 ? (
                <span>
                  {labels.metricUsedBy}
                  <b className="ml-1 tabular-nums text-[color:var(--topology-v2-panel-text-secondary)]">
                    {groups.usedBy.total}
                  </b>
                </span>
              ) : null}
              {groups.dependsOn.total > 0 ? (
                <span>
                  {labels.metricDependsOn}
                  <b className="ml-1 tabular-nums text-[color:var(--topology-v2-panel-text-secondary)]">
                    {groups.dependsOn.total}
                  </b>
                </span>
              ) : null}
              {groups.belongsTo.total > 0 ? (
                <span>
                  {labels.metricBelongsTo}
                  <b className="ml-1 tabular-nums text-[color:var(--topology-v2-panel-text-secondary)]">
                    {groups.belongsTo.total}
                  </b>
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setShowProjectRelations((value) => !value)}
                aria-expanded={showProjectRelations}
                className={controlClass({
                  shape: "link",
                  size: "md",
                  className:
                    "ml-auto shrink-0 text-[color:var(--topology-v2-panel-text-tertiary)] hover:text-[color:var(--topology-v2-panel-text-secondary)] active:text-[color:var(--topology-v2-panel-text-primary)]",
                })}
              >
                {showProjectRelations
                  ? labels.sourceRelationsHide ?? labels.containsShowSummary
                  : labels.sourceRelationsShow ?? labels.containsShowAll}
              </button>
            </div>
          ) : null}
          {hasConnections ? (
            <>
              {!collapseProjectRelations || showProjectRelations ? (
                <>
                  {renderGroup("contains", "contains", labels.metricContains, labels.metricContainsHelp, groups.contains)}
                  {renderGroup("usedBy", "usedBy", labels.metricUsedBy, labels.metricUsedByHelp, groups.usedBy)}
                  {renderGroup("dependsOn", "dependsOn", labels.metricDependsOn, labels.metricDependsOnHelp, groups.dependsOn)}
                  {/* 속한 곳 — 전체 상세와 같은 순서(담는 것 → 쓰는 곳 → 기대는 곳 →
                      속한 곳)로 마지막에 둔다. 두 표면을 오가는 사람이 같은 자리에서
                      같은 단어를 만나게. */}
                  {renderGroup("belongsTo", "belongsTo", labels.metricBelongsTo, labels.metricBelongsToHelp, groups.belongsTo)}
                </>
              ) : null}
              {renderEvidenceGroup()}
              {renderCodeLocationsGroup()}
            </>
          ) : (
            <span className="text-label text-[color:var(--topology-v2-panel-text-tertiary)]">
              {labels.noConnections}
            </span>
          )}
        </div>

        {/* Footer (sticky) — slug(좌, 마지막 세그먼트만·전체는 title= hover) +
            인디고 채움 primary "전체 상세"(단 하나의 강조). root 가 무패딩
            스크롤 컨테이너라 음수 마진 없이 sticky bottom-0 로 앵커된다 —
            내용이 넘칠 때도 항상 뷰포트 안에 남는다(P3-③). */}
        <div
          data-testid="topology-v2-detail-panel-footer"
          className="sticky bottom-0 flex items-center gap-2.5 rounded-b-[var(--topology-v2-panel-radius)] border-t border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] px-[var(--topology-v2-panel-pad)] py-[11px]"
        >
          {!showProjectSource ? (
            <span
              data-testid="topology-v2-detail-panel-slug"
              title={slug}
              className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--topology-v2-panel-text-quaternary)]"
            >
              {slugDisplaySegment(slug)}
            </span>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          {onOpenFullDetail ? (
            <button
              type="button"
              onClick={onOpenFullDetail}
              data-testid="topology-v2-detail-panel-open-full-detail"
              className={showProjectSource
                ? controlClass({
                    shape: "link",
                    size: "lg",
                    className:
                      "touch-hit-expand shrink-0 text-[color:var(--topology-v2-panel-text-tertiary)] hover:text-[color:var(--topology-v2-panel-text-secondary)]",
                  })
                : controlClass({
                    shape: "card",
                    size: "sm",
                    className:
                      "shrink-0 font-semibold border-[color:var(--topology-v2-panel-primary-border)] bg-[color:var(--topology-v2-panel-primary-surface)] text-[color:var(--topology-v2-panel-primary-text)] hover:border-[color:var(--topology-v2-panel-primary-border-hover)] hover:bg-[color:var(--topology-v2-panel-primary-surface-hover)]",
                  })}
            >
              {labels.openFullDetail}
            </button>
          ) : null}
          {/* 틈이 있을 때의 행동은 위 처방 블록이 가져갔다 — 여기 남는 것은
              「할 일 없음」 상태의 조용한 행동 하나뿐이다. */}
          {showProjectSource && labels.sourceAction && !showSourceRemedy ? (
            onProjectSourceAction ? (
              <button
                type="button"
                onClick={() => { void onProjectSourceAction(); }}
                disabled={projectSourceBusy}
                aria-busy={projectSourceBusy}
                data-testid="topology-v2-project-source-action"
                className={controlClass({
                  shape: "chip",
                  size: "lg",
                  className:
                    "shrink-0 font-semibold border-[color:var(--topology-v2-panel-primary-border)] bg-[color:var(--topology-v2-panel-primary-surface)] text-[color:var(--topology-v2-panel-primary-text)] hover:border-[color:var(--topology-v2-panel-primary-border-hover)] hover:bg-[color:var(--topology-v2-panel-primary-surface-hover)] disabled:cursor-wait",
                })}
              >
                {projectSourceBusy ? labels.sourceBusy ?? labels.sourceAction : labels.sourceAction}
              </button>
            ) : (
              <span className="shrink-0 text-body text-[color:var(--topology-v2-panel-text-secondary)]">
                {labels.sourceAction}
              </span>
            )
          ) : null}
        </div>
      </div>
    </Surface>
  );
}

/**
 * One "코드 위치" row — raw code path (truncated middle, full path on hover)
 * + a per-row copy button. A dedicated component (not inline in the map
 * callback) because each row owns its OWN copy-feedback state
 * (`useCopyFeedback`) — copying one path must not flip every row's icon.
 */
function CodeLocationRow({
  path,
  copyLabel,
  copiedLabel,
}: {
  path: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const { state, copy } = useCopyFeedback();
  return (
    <li
      data-datasheet-code-location={path}
      className="flex min-h-[32px] w-full items-center gap-2 rounded-[var(--topology-v2-panel-row-radius)] px-1.5 py-2"
    >
      <span
        title={path}
        className="min-w-0 flex-1 truncate font-mono text-body text-[color:var(--topology-v2-panel-text-tertiary)]"
      >
        {truncateMiddlePath(path)}
      </span>
      <IconButton
        label={state === "copied" ? copiedLabel : copyLabel}
        size="sm"
        onClick={() => void copy(path)}
        data-testid="topology-v2-detail-panel-code-location-copy"
        className="text-[color:var(--topology-v2-panel-text-quaternary)] hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-secondary)]"
      >
        {state === "copied" ? <Check size={11} aria-hidden /> : <Clipboard size={11} aria-hidden />}
      </IconButton>
    </li>
  );
}
