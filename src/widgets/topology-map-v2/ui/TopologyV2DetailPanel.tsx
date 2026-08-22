"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Copy,
  FileText,
  GitBranch,
  MessageCircle,
  MoreHorizontal,
  Orbit,
  Plus,
  X,
} from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import type { ProjectSourceStatus, ProjectSourceView } from "@/shared/lib/project-source-receipt";
import { useRowDisclosure } from "@/shared/lib/use-row-disclosure";
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
import { Button, controlClass, IconButton, LastEditSubjectRow, MtimeConflictBadge, RowButton, Surface } from "@/shared/ui";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { transientSurface } from "@/shared/ui/transient-surface";

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
 * (right), so neither side is barren for long names. Below, one primary action
 * plus Edit/More disclosure menus replaces the old seven-tile action strip;
 * typed counts live only in their relation-group headers. Then a relations zone with
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
 * renders, with each count shown once in its own group header. 네 번째
 * 버킷(속한 곳)은 2026-07-26 까지 여기서 빠져 있었고,
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
  /** 그룹 「+N」 뒤에 붙는 펼침 라벨("더 보기") — +N 이 죽은 수가 아니게 한다. */
  groupShowMore: string;
  /** 펼친 그룹을 캡 상태로 되돌리는 라벨("접기"). */
  groupShowFewer: string;
  metricUsedBy: string;
  metricDependsOn: string;
  /**
   * "속한 곳" (belongsTo) — 이 노드를 담고 있는 상위 항목. 전체 상세와 같은
   * 단어를 쓴다(둘 다 `edgeTypesPlain.belongs_to` 계열).
   */
  metricBelongsTo: string;
  metricEvidence: string;
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
  noConnections: string;
  handoff: string;
  close: string;
  /** "전체 상세" opt-in link to the A1 full-detail datasheet
   * (`full-detail-a1` widget) — the design gate's details-on-demand step
   * beyond this compact ego popover. */
  openFullDetail: string;
  /** 주 행동 하나와 편집/더보기 메뉴를 묶는 action row. */
  actionsGroupLabel: string;
  actionDocument: string;
  actionEditRelations: string;
  actionEditMenu: string;
  actionMore: string;
  /** 이 개념에 **이어서 새 개념**을 만든다 — 지도를 떠나지 않는다. */
  actionCreateLinked?: string;
  actionCopyHandoff: string;
  /**
   * S7 이음새 — 이 개념을 그대로 에이전트에게 말로 시키는 자리. optional 인
   * 이유: 에이전트 패널이 없는 환경(웹 빌드·구 소비처)에서는 라벨도 핸들러도
   * 오지 않고, 그때는 handoff 복사가 주 행동을 맡는다.
   */
  actionAskAgent?: string;
  /** S4 "영역 전개" 2차 발견 경로 액션 라벨 ("영역 전개"). */
  actionRealm: string;
  /**
   * 주 행동의 결과-설명 툴팁. 터치엔 hover가 없으므로 툴팁은 보조일 뿐,
   * 라벨과 aria가 자립하는 본체다.
   */
  actionAskAgentTip?: string;
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
  /** W2-A "관계 편집" action tile target — the contextual editor deep link
   * (`/topology/?p=<id>&workbench=edit`). */
  meaningEditHref: string;
  labels: TopologyV2DetailPanelLabels;
  onSelectConnection: (id: string) => void;
  /**
   * 관계 행 위에 커서가 있는 동안 그 노드를 **지도에서** 가리킨다 (2026-08-17
   * 소유자 지시: *"이부분들 각각 마우스 올리면 옆에 지도에서 반짝이면서 표시되면
   * 좋겠는데 가능할까? 지금은 아무 반응이 없어서.."*).
   *
   * **이름 공간에 주의** — 여기 넘기는 값은 `onSelectConnection` 과 같은
   * **캔버스 노드 id**(`domain:example-domain`)다. 근거 문서 행은 다른 이름
   * 공간(볼트 slug)이라 `onHoverEvidence` 로 따로 나간다. 둘을 한 콜백으로
   * 합치면 `chat-node-index.ts` 가 기록한 그 사고 — 두 이름 공간이 만나는
   * 자리에 검사가 없어 기능이 배선만 남고 죽었던 것 — 를 그대로 반복한다.
   *
   * 안 넘기면 아무 일도 안 일어난다(기존 동작 유지).
   */
  onHoverConnection?: (id: string | null) => void;
  /**
   * 근거 문서 행 호버 — **볼트 slug**(`capabilities/mcp-server`)를 넘긴다.
   * 지도에 그 노드가 있으면 가리키고, 없으면(문서가 노드가 아닐 수 있다)
   * 호출자가 null 로 접는다. 판정은 호출자의 몫이다 — 이 패널은 어느 노드가
   * 지도에 실렸는지 모른다.
   */
  onHoverEvidence?: (slug: string | null) => void;
  onCopyHandoff: (text: string) => void;
  /** 지도 안 contextual editor가 있으면 링크 대신 같은 자리에서 연다. */
  onEditRelations?: () => void;
  /**
   * 「이어서 새로 만들기」 — 이 개념에 붙는 새 노드를 만든다. 없으면 편집 메뉴의
   * 해당 행이 안 그려진다(못 하는 자리에 문을 그리지 않는다).
   */
  onCreateLinked?: () => void;
  /**
   * S7 이음새 — 「에이전트에게 말로 시키기」. 문장은 여기서 짓지 않는다:
   * 첫 마디 생성기(`buildFirstWords` 와 같은 함수)가 이 개념의 빈칸을 보고
   * 짓고, 이 패널은 **누가 눌렀는지만** 알린다. 두 입구가 다른 문장을 쓰면
   * 그 순간 갈라진다. 브리지가 없는 환경(웹)에서는 주입되지 않고 handoff 복사가
   * 주 행동을 맡는다. 열리지 않을 문을 그리지 않는다.
   */
  onAskAgent?: () => void;
  onClose: () => void;
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
   * 슬라이스 C (개발/비개발 모드 토글) — handoff 복사 행동. 기본 `true`.
   * 비개발(plain) 모드에서는 HomePage가 `false`를 넘겨 개발자 크롬으로 숨긴다.
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
  /**
   * **「이 폴더 맞나요?」** — 연결을 두 단계(누르기 → 폴더 고르기)에서 한 단계로
   * 줄이는 자리다. 앱은 볼트 루트를 한 번 재는 것만으로 감싸는 git 저장소를
   * 알므로, 사람에게 폴더 트리를 뒤지게 할 이유가 없다.
   *
   * `reason` 은 **왜 이 폴더인지**를 사람 말로 적은 한 줄이고, 그 근거는 지어낸
   * 것이 아니라 잰 것이다(git 저장소 여부 + 선언된 경로가 실제로 거기 있는 수).
   * 추정이 없거나 확신이 낮으면 호출자가 이 prop 자체를 안 넘긴다 — 그때 화면은
   * 종전대로 폴더 선택창 하나만 그린다. **회색 버튼을 두지 않는다.**
   */
  projectSourceProposal?: {
    question: string;
    rootPath: string;
    reason: string;
    confirmLabel: string;
    pickOtherLabel: string;
    confidence: "high" | "medium";
  } | null;
  /** 추정된 폴더를 **선택창 없이** 그대로 확정한다(클릭 1회). */
  onProjectSourceConfirmProposal?: () => void | Promise<void>;
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
  proposal,
  onConfirmProposal,
}: {
  why?: string;
  actionLabel?: string;
  busyLabel?: string;
  busy: boolean;
  onAction?: () => void | Promise<void>;
  degraded?: TopologyV2DetailPanelProps["projectSourceDegraded"];
  proposal?: TopologyV2DetailPanelProps["projectSourceProposal"];
  onConfirmProposal?: () => void | Promise<void>;
}) {
  /**
   * 제안이 있으면 **주목 승자가 바뀐다** — 「연결하기」라는 일반 행동에서
   * 「이 폴더 맞나요? <경로>」라는 구체적인 질문으로. 그래서 원래의 단일 버튼은
   * 이 자리에서 「다른 폴더 고르기」라는 **탈출구**로 강등되고, 인디고는 확정
   * 버튼 하나만 갖는다(한 상자에 주 행동은 하나).
   */
  const showProposal = Boolean(onAction && proposal && onConfirmProposal);
  return (
    <div
      data-testid="topology-v2-project-source-remedy"
      data-remedy-mode={
        onAction ? (showProposal ? "proposed" : "actionable") : "degraded"
      }
      // `keep-all` — 한국어는 아무 글자에서나 끊긴다. 이 상자의 문장 셋은
      // 좁은 패널 폭에서 반드시 두 줄이 되는데, 기본 줄바꿈이면 「여기 / 서
      // 찾았어요」처럼 단어 가운데가 갈린다(액션 스트립이 같은 이유로 이미
      // 쓰는 문법 — 값 0개 추가).
      className="mt-0.5 flex flex-col gap-2 rounded-chip border border-[color:var(--topology-v2-panel-action-border)] bg-[color:var(--topology-v2-panel-action-surface)] px-2.5 py-2 [word-break:keep-all]"
    >
      {why ? (
        <p
          data-testid="topology-v2-project-source-why"
          className="text-label text-[color:var(--topology-v2-panel-text-tertiary)]"
        >
          {why}
        </p>
      ) : null}
      {showProposal && proposal ? (
        <div
          data-testid="topology-v2-project-source-proposal"
          data-proposal-confidence={proposal.confidence}
          className="flex flex-col gap-1"
        >
          <p className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--topology-v2-panel-text-secondary)]">
            {proposal.question}
          </p>
          {/* 경로는 **긴 문자열이 아니라 답**이다 — 앞의 폴더 맥락과 마지막
              폴더 이름이 둘 다 남아야 「내 저장소가 맞다」를 눈으로 확인한다.
              그래서 꼬리만 자르지 않고 가운데를 접는다(코드 위치 행과 같은 함수). */}
          <p
            data-testid="topology-v2-project-source-proposal-path"
            title={proposal.rootPath}
            className="font-mono text-label text-[color:var(--topology-v2-panel-text-primary)]"
          >
            {truncateMiddlePath(proposal.rootPath)}
          </p>
          <p
            data-testid="topology-v2-project-source-proposal-reason"
            className="text-label text-[color:var(--topology-v2-panel-text-tertiary)]"
          >
            {proposal.reason}
          </p>
        </div>
      ) : null}
      {onAction ? (
        <div className="flex flex-wrap items-center gap-2">
          {showProposal && proposal && onConfirmProposal ? (
            <button
              type="button"
              onClick={() => { void onConfirmProposal(); }}
              disabled={busy}
              aria-busy={busy}
              data-testid="topology-v2-project-source-confirm"
              className={controlClass({
                shape: "chip",
                size: "lg",
                className:
                  "shrink-0 font-[var(--font-weight-emphasis)] border-[color:var(--topology-v2-panel-primary-border)] bg-[color:var(--topology-v2-panel-primary-surface)] text-[color:var(--topology-v2-panel-primary-text)] hover:border-[color:var(--topology-v2-panel-primary-border-hover)] hover:bg-[color:var(--topology-v2-panel-primary-surface-hover)] disabled:cursor-wait",
              })}
            >
              {busy ? busyLabel ?? proposal.confirmLabel : proposal.confirmLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => { void onAction(); }}
            disabled={busy}
            aria-busy={busy}
            data-testid="topology-v2-project-source-action"
            className={controlClass({
              shape: "chip",
              size: "lg",
              className: showProposal
                ? "shrink-0 border-[color:var(--topology-v2-panel-action-border)] bg-[color:var(--topology-v2-panel-action-surface)] text-[color:var(--topology-v2-panel-text-tertiary)] hover:border-[color:var(--topology-v2-panel-domain-border-hover)] hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-secondary)] disabled:cursor-wait"
                : "shrink-0 font-[var(--font-weight-emphasis)] border-[color:var(--topology-v2-panel-primary-border)] bg-[color:var(--topology-v2-panel-primary-surface)] text-[color:var(--topology-v2-panel-primary-text)] hover:border-[color:var(--topology-v2-panel-primary-border-hover)] hover:bg-[color:var(--topology-v2-panel-primary-surface-hover)] disabled:cursor-wait",
            })}
          >
            {showProposal && proposal
              ? proposal.pickOtherLabel
              : busy ? busyLabel ?? actionLabel : actionLabel}
          </button>
        </div>
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
                "w-fit shrink-0 font-[var(--font-weight-emphasis)] border-[color:var(--topology-v2-panel-primary-border)] bg-[color:var(--topology-v2-panel-primary-surface)] text-[color:var(--topology-v2-panel-primary-text)] hover:border-[color:var(--topology-v2-panel-primary-border-hover)] hover:bg-[color:var(--topology-v2-panel-primary-surface-hover)]",
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

interface DetailActionItem {
  label: string;
  icon: ReactNode;
  testId: string;
  href?: string;
  onSelect?: () => void;
}

function DetailActionMenu({
  label,
  triggerTestId,
  menuTestId,
  iconOnly = false,
  open,
  onOpenChange,
  items,
}: {
  label: string;
  triggerTestId: string;
  menuTestId: string;
  iconOnly?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly DetailActionItem[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onOpenChange]);

  if (items.length === 0) return null;
  const itemClass = controlClass({
    shape: "row",
    size: "sm",
    tone: "secondary",
    className:
      "gap-2 rounded-micro px-2 hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-primary)]",
  });
  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        data-testid={triggerTestId}
        onClick={() => onOpenChange(!open)}
        className={controlClass({
          shape: iconOnly ? "icon" : "chip",
          size: "md",
          tone: "muted",
          className:
            "border-[color:var(--topology-v2-panel-action-border)] bg-[color:var(--topology-v2-panel-action-surface)] hover:border-[color:var(--topology-v2-panel-domain-border-hover)] hover:bg-[color:var(--topology-v2-panel-row-hover)]",
        })}
      >
        {iconOnly ? <MoreHorizontal size={ICON_SIZE.md} aria-hidden /> : label}
        {!iconOnly ? (
          <ChevronDown
            size={ICON_SIZE.sm}
            aria-hidden
            className="transition-transform duration-[var(--motion-fast)]"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        ) : null}
      </button>
      <Surface
        open={open}
        origin="top right"
        role="menu"
        data-testid={menuTestId}
        {...transientSurface("menu")}
        className="absolute right-0 top-full z-30 mt-1 flex min-w-44 flex-col gap-0.5 rounded-chip border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] p-1 shadow-[var(--topology-v2-panel-shadow)]"
      >
        {items.map((item) =>
          item.href ? (
            <Link
              key={item.testId}
              href={item.href}
              role="menuitem"
              data-testid={item.testId}
              onClick={() => onOpenChange(false)}
              className={itemClass}
            >
              {item.icon}
              {item.label}
            </Link>
          ) : (
            <button
              key={item.testId}
              type="button"
              role="menuitem"
              data-testid={item.testId}
              onClick={() => {
                onOpenChange(false);
                item.onSelect?.();
              }}
              className={itemClass}
            >
              {item.icon}
              {item.label}
            </button>
          ),
        )}
      </Surface>
    </div>
  );
}

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
          className="text-body font-[var(--font-weight-emphasis)] tracking-[var(--tracking-body)] text-[color:var(--topology-v2-panel-text-secondary)]"
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
  meaningEditHref,
  labels,
  onSelectConnection,
  onHoverConnection,
  onHoverEvidence,
  onCopyHandoff,
  onEditRelations,
  onCreateLinked,
  onAskAgent,
  onClose,
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
  projectSourceProposal = null,
  onProjectSourceConfirmProposal,
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
  /**
   * **처방 상자는 자리를 밀며 들어온다 — 그러니 밀리는 것이 보여야 한다.**
   *
   * 이 상자가 뜨는 시점은 패널이 열리는 시점과 다르다: 볼트 루트 실측이 끝나야
   * 「폴더 선택창」인지 「이 폴더 맞나요?」인지 정해진다. 조건부 렌더만 쓰면 그
   * 순간 아래 내용이 툭 밀려나고, 확정 뒤 사라질 때는 나가는 길이 아예 없다.
   * 그래서 흐름 안에서 형제를 밀어내는 접기의 공용 문법을 그대로 쓴다 —
   * 값(커브·시간)은 `.ai-row-disclosure` 한 곳에서만 나온다.
   */
  const {
    mounted: remedyMounted,
    boxRef: remedyBoxRef,
    contentRef: remedyContentRef,
  } = useRowDisclosure(showSourceRemedy);
  const showInlineHandoff = showHandoff && !(
    showProjectSource && projectSource.nextAction.id === "use_current_evidence"
  );
  const [actionMenu, setActionMenu] = useState<"edit" | "more" | null>(null);
  const canAskAgent = Boolean(onAskAgent && labels.actionAskAgent);
  const editActions: DetailActionItem[] = [
    onEditRelations
      ? {
          label: labels.actionEditRelations,
          icon: <GitBranch size={ICON_SIZE.sm} aria-hidden />,
          testId: "topology-v2-detail-panel-action-edit",
          onSelect: onEditRelations,
        }
      : {
          label: labels.actionEditRelations,
          icon: <GitBranch size={ICON_SIZE.sm} aria-hidden />,
          testId: "topology-v2-detail-panel-action-edit",
          href: meaningEditHref,
        },
    ...(onCreateLinked && labels.actionCreateLinked
      ? [
          {
            label: labels.actionCreateLinked,
            icon: <Plus size={ICON_SIZE.sm} aria-hidden />,
            testId: "topology-v2-detail-panel-action-create-linked",
            onSelect: onCreateLinked,
          },
        ]
      : []),
  ];
  const moreActions: DetailActionItem[] = [
    ...(documentHref
      ? [
          {
            label: labels.actionDocument,
            icon: <FileText size={ICON_SIZE.sm} aria-hidden />,
            testId: "topology-v2-detail-panel-action-document",
            href: documentHref,
          },
        ]
      : []),
    ...(canAskAgent && showInlineHandoff
      ? [
          {
            label: labels.actionCopyHandoff,
            icon: <Copy size={ICON_SIZE.sm} aria-hidden />,
            testId: "topology-v2-detail-panel-action-handoff",
            onSelect: () => onCopyHandoff(handoffText),
          },
        ]
      : []),
    ...(onEnterRealm
      ? [
          {
            label: labels.actionRealm,
            icon: <Orbit size={ICON_SIZE.sm} aria-hidden />,
            testId: "topology-v2-detail-panel-action-realm",
            onSelect: onEnterRealm,
          },
        ]
      : []),
  ];
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
  // 「+N」 펼침 — 그룹별로 독립(하위 항목을 펼쳤다고 기대는 곳까지 길어지면
  // 패널이 한 번에 다 자란다). 노드가 바뀌면 부모가 패널을 새로 세우므로
  // 여기 상태는 그 노드의 것만 산다.
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(new Set());
  const [showProjectRelations, setShowProjectRelations] = useState(false);

  /*
   * 패널이 사라질 때 지도의 강조도 같이 걷는다.
   *
   * 행 위에 커서를 둔 채로 그 행을 **누르면** 노드가 바뀌고, 호출부가 `key` 를
   * 갈아 패널을 통째로 다시 세운다 — 그 행은 DOM 에서 사라지므로
   * `pointerleave` 가 오지 않는다. 그러면 지도에는 아무도 안 가리키는 강조가
   * 남는다. 최신 콜백을 ref 로 들고 언마운트에서 한 번만 끈다(콜백 신원이
   * 바뀔 때마다 껐다 켜지 않기 위해서다).
   */
  const clearHoverRef = useRef<() => void>(() => {});
  useEffect(() => {
    clearHoverRef.current = () => {
      onHoverConnection?.(null);
      onHoverEvidence?.(null);
    };
  });
  useEffect(() => () => clearHoverRef.current(), []);

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
    const expanded = expandedGroups.has(group);
    const shownRows = expanded ? (view.allRows ?? view.rows) : view.rows;
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
            {shownRows.map((row: V2DatasheetConnection) => (
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
                  /* 채팅 패널의 노드 이름 호버(`AcpChatPanel`)와 **같은 계약**:
                     포인터가 들어오면 그 노드를, 나가면 null. 커서가 캔버스가
                     아니라 이 패널 위에 있으므로 캔버스 호버와 경쟁하지 않는다. */
                  onPointerEnter={() => onHoverConnection?.(row.id)}
                  onPointerLeave={() => onHoverConnection?.(null)}
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
          // 죽은 수였던 「+N」이 문이 된다 — 프로젝트 상세의 「역량 N개 더」
          // 반려(2026-08-12 B안 근거)와 같은 계보: 수를 보여 놓고 그 수로
          // 가는 길이 없으면 사용자는 지도를 떠나 다시 찾아야 한다.
          <button
            type="button"
            aria-expanded={expanded}
            data-datasheet-group-overflow={group}
            data-testid={`topology-v2-group-more-${group}`}
            onClick={() =>
              setExpandedGroups((current) => {
                const next = new Set(current);
                if (next.has(group)) next.delete(group);
                else next.add(group);
                return next;
              })
            }
            className={controlClass({
              shape: "link",
              size: "sm",
              className:
                "ml-[34px] mt-0.5 font-mono text-label text-[color:var(--topology-v2-panel-text-tertiary)] hover:text-[color:var(--topology-v2-panel-text-secondary)]",
            })}
          >
            {expanded ? labels.groupShowFewer : `+${overflow} ${labels.groupShowMore}`}
          </button>
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
                /* 근거 문서는 **노드가 아닐 수 있다** — 지도에 없으면 호출자가
                   null 로 접고 아무 일도 안 일어난다(에러도 없다). */
                onPointerEnter={() => onHoverEvidence?.(row.id)}
                onPointerLeave={() => onHoverEvidence?.(null)}
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
                  size={ICON_SIZE.md}
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
        {...transientSurface("anchored")}
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
            <h2 className="min-w-0 flex-1 truncate text-title font-[var(--font-weight-strong)] leading-title tracking-title text-[color:var(--topology-v2-panel-text-primary)]">
              {title}
            </h2>
            {/* kind = 읽히는 텍스트 배지(글리프 + 단어), 우측 counterweight */}
            <span className="flex shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--topology-v2-panel-kind-badge-border)] bg-[color:var(--topology-v2-panel-kind-badge-surface)] py-[3px] pl-[7px] pr-[9px] text-label font-[var(--font-weight-emphasis)] tracking-[var(--tracking-label)] text-[color:var(--topology-v2-panel-text-secondary)]">
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
              <X size={ICON_SIZE.lg} />
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
                  /* 관계 행과 **같은 어포던스**(누르면 그 노드로 간다)라 호버도
                     같아야 한다 — 여기만 반응이 없으면 "왜 이 줄만 다르지"가 된다. */
                  onPointerEnter={() => onHoverConnection?.(domain.id)}
                  onPointerLeave={() => onHoverConnection?.(null)}
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
                  <span className="truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--topology-v2-panel-domain-text)]">
                    {domain.title}
                  </span>
                  <ChevronRight
                    size={ICON_SIZE.sm}
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
                  className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--topology-v2-panel-text-secondary)]"
                >
                  {labels.sourceHeading}
                </span>
              ) : null}
              <div className="flex min-w-0 items-center gap-1.5 text-[color:var(--topology-v2-panel-text-secondary)]">
                <ProjectSourceStatusIcon status={projectSource.status} />
                <span className="truncate font-[var(--font-weight-signature)]">{labels.sourceStatus}</span>
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
                    <span className="font-[var(--font-weight-signature)]">{labels.sourceGapLabel}: </span>
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
              <div
                ref={remedyBoxRef}
                className="ai-row-disclosure"
                data-state={showSourceRemedy ? "open" : "closed"}
                // 접히는 동안에도 DOM 에 남으므로, 보이지 않는 버튼이 탭 순서와
                // 스크린 리더에 남지 않게 즉시 비활성화한다.
                inert={!showSourceRemedy}
              >
                {remedyMounted ? (
                  <div ref={remedyContentRef} className="ai-row-disclosure-body">
                    <ProjectSourceRemedy
                      why={labels.sourceWhy}
                      actionLabel={labels.sourceAction}
                      busyLabel={labels.sourceBusy}
                      busy={projectSourceBusy}
                      onAction={onProjectSourceAction}
                      degraded={projectSourceDegraded}
                      proposal={projectSourceProposal}
                      onConfirmProposal={onProjectSourceConfirmProposal}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* 한 줄만 밖에 둔다. 나머지는 의미별 메뉴로 접어 노드를 읽는 순간의
              선택지를 세 개로 제한한다. 경로는 지도+ACP의 전역 탐색으로 이동. */}
          <div
            role="group"
            aria-label={labels.actionsGroupLabel}
            data-testid="topology-v2-detail-panel-actions"
            className={showProjectSource
              ? "flex items-center gap-1.5 border-t border-[color:var(--topology-v2-panel-zone-divider)] pt-3"
              : "flex items-center gap-1.5"}
          >
            {canAskAgent ? (
              <Button
                size="sm"
                onClick={onAskAgent}
                aria-label={labels.actionAskAgent}
                title={labels.actionAskAgentTip}
                data-testid="topology-v2-detail-panel-action-ask-agent"
                data-action-role="primary"
                className="min-w-0 flex-1 rounded-card"
              >
                <MessageCircle size={ICON_SIZE.sm} aria-hidden />
                <span className="truncate">{labels.actionAskAgent}</span>
              </Button>
            ) : showInlineHandoff ? (
              <Button
                size="sm"
                onClick={() => onCopyHandoff(handoffText)}
                aria-label={labels.handoff}
                data-testid="topology-v2-detail-panel-action-handoff"
                data-action-role="primary"
                className="min-w-0 flex-1 rounded-card"
              >
                <Copy size={ICON_SIZE.sm} aria-hidden />
                <span className="truncate">{labels.actionCopyHandoff}</span>
              </Button>
            ) : null}
            <DetailActionMenu
              label={labels.actionEditMenu}
              triggerTestId="topology-v2-detail-panel-edit-menu-trigger"
              menuTestId="topology-v2-detail-panel-edit-menu"
              open={actionMenu === "edit"}
              onOpenChange={(next) => setActionMenu(next ? "edit" : null)}
              items={editActions}
            />
            <DetailActionMenu
              label={labels.actionMore}
              triggerTestId="topology-v2-detail-panel-more-menu-trigger"
              menuTestId="topology-v2-detail-panel-more-menu"
              iconOnly
              open={actionMenu === "more"}
              onOpenChange={(next) => setActionMenu(next ? "more" : null)}
              items={moreActions}
            />
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
                  <b className="ml-1 font-[var(--font-weight-strong)] tabular-nums text-[color:var(--topology-v2-panel-text-secondary)]">
                    {groups.contains.total}
                  </b>
                </span>
              ) : null}
              {groups.usedBy.total > 0 ? (
                <span>
                  {labels.metricUsedBy}
                  <b className="ml-1 font-[var(--font-weight-strong)] tabular-nums text-[color:var(--topology-v2-panel-text-secondary)]">
                    {groups.usedBy.total}
                  </b>
                </span>
              ) : null}
              {groups.dependsOn.total > 0 ? (
                <span>
                  {labels.metricDependsOn}
                  <b className="ml-1 font-[var(--font-weight-strong)] tabular-nums text-[color:var(--topology-v2-panel-text-secondary)]">
                    {groups.dependsOn.total}
                  </b>
                </span>
              ) : null}
              {groups.belongsTo.total > 0 ? (
                <span>
                  {labels.metricBelongsTo}
                  <b className="ml-1 font-[var(--font-weight-strong)] tabular-nums text-[color:var(--topology-v2-panel-text-secondary)]">
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
                      "shrink-0 font-[var(--font-weight-emphasis)] border-[color:var(--topology-v2-panel-primary-border)] bg-[color:var(--topology-v2-panel-primary-surface)] text-[color:var(--topology-v2-panel-primary-text)] hover:border-[color:var(--topology-v2-panel-primary-border-hover)] hover:bg-[color:var(--topology-v2-panel-primary-surface-hover)]",
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
                    "shrink-0 font-[var(--font-weight-emphasis)] border-[color:var(--topology-v2-panel-primary-border)] bg-[color:var(--topology-v2-panel-primary-surface)] text-[color:var(--topology-v2-panel-primary-text)] hover:border-[color:var(--topology-v2-panel-primary-border-hover)] hover:bg-[color:var(--topology-v2-panel-primary-surface-hover)] disabled:cursor-wait",
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
        {state === "copied" ? <Check size={ICON_SIZE.sm} aria-hidden /> : <Clipboard size={ICON_SIZE.sm} aria-hidden />}
      </IconButton>
    </li>
  );
}
