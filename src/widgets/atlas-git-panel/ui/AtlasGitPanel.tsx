"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useCopyFeedback, type CopyFeedbackState } from "@/shared/lib/use-copy-feedback";
import { stepRowMotionClass, stepRowUsesStagger } from "../lib/step-row-motion";
import { useTranslations } from "next-intl";
// `History as HistoryIcon` — 사용성 검수 P0 (2026-07-23): 특정 HMR/번들 상태에서
// bare `History` 식별자가 전역 DOM History 생성자로 해석돼 `<History>` JSX 가
// "Illegal constructor" 로 화면 전체를 에러 바운더리로 추락시켰다(스택 확보,
// 간헐). 전역과 절대 충돌하지 않는 별칭으로 원천 차단.
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  FolderOpen,
  History as HistoryIcon,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { copyText } from "@/shared/lib/copy-text";
import {
  countChangesByStatus,
  formatSnapshotSummary,
  groupChangesByKind,
  type AtlasGitKindGroup,
} from "@/shared/lib/atlas-git-changes";
import {
  describeChangePath,
  describeSnapshotSubject,
  parseUnifiedDiff,
  splitConceptChanges,
  type AtlasGitDiffFile,
} from "@/shared/lib/atlas-git-record";
import {
  gitDiff,
  gitFetch,
  gitErrorMessage,
  gitHistory,
  gitInit,
  gitPull,
  gitProbe,
  gitSetRemote,
  gitSnapshot,
  gitStatus,
  isGitBridgeAvailable,
  type GitChangeEntry,
  type GitCommitInfo,
  type GitSnapshotResult,
  type GitStatusResult,
} from "@/shared/lib/tauri-git";
import type { OntologyChangeset } from "@/shared/lib/ontology-tree";
import { gitHostPlatformFrom, gitInstallGuide } from "@/shared/lib/git-install-guide";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildConceptEgo, matchNodeId, type ConceptEgo } from "../model/build-concept-ego";
import { CommitDetail } from "./CommitDetail";
import { cn } from "@/shared/lib/cn";
import { ATLAS_CLI } from "@/shared/config/cli-invocation";

/**
 * Atlas Git — 기록 목적지 본체.
 *
 * ## 이 표면의 일 (2026-07-26 재설계)
 *
 * 소유자 판정: *"이 페이지에서는 깃 연결을 빠르게 가능하게 해주고 그래야하는데"*.
 * 그래서 이 표면은 **상태를 알리는 대시보드가 아니라, 자기 일을 할 수 있게
 * 만드는 화면**이다. 화면 모양은 딱 하나의 질문으로 갈린다:
 *
 * > **지금 이 화면이 자기 일(기록)을 할 수 있는가?**
 *
 * - **못 한다 → 셋업 모드.** 과업이 하나뿐이므로 화면도 하나만 말한다. 단일
 *   컬럼(`--git-setup-measure`)을 프레임 정중앙에 세우고, 주 동작 하나를
 *   실체 있는 버튼으로 둔다. 어디쯤 왔는지는 3걸음 사다리(`ConnectLadder`)가
 *   한 줄로 말한다.
 * - **할 수 있다 → 작업대 모드.** 좌: 무엇을 남길까 / 우: 그 증거.
 *
 * 어텐션 승자가 상태에 따라 바뀌는 것이 **의도**다. 셋업에서는 사용자의 일이
 * "연결"이고 작업대에서는 "무엇을 남길까"라서, 두 순간의 승자가 같을 수 없다.
 * (Toss 공개 발표 — 한 화면에 한 가지 / Apple HIG — clarity·hierarchy.)
 *
 * ## 작업대 재설계 (2026-07-27) — 이 화면의 일 한 문장
 *
 * 소유자 판정: *"이 기록 페이지도 너무 AI느낌나"*. 감이 아니라 실측 가능한
 * 여섯 가지였고, 전부 **이 화면의 일을 정하지 않은 데서** 나왔다. 정하면
 * 이렇다:
 *
 * > **바뀐 내 개념을 확인하고, 지금 걸음으로 남길지 정한다.**
 *
 * 그 한 문장에서 위계가 따라 나온다. 주목 승자는 **바뀐 개념 목록 + 남기기**
 * 한 쌍이다(목록이 주어, 버튼이 동사 — 둘은 한 덩이다). 증거(바뀐 줄 ·
 * 지난 걸음)는 요청 시 근거이고, 위치·보낼 곳은 크롬 단 상태다.
 *
 * 그래서 작업대는 **한 모양이 아니라 두 모양**이다 — 판단할 것이 있는지로
 * 갈린다(`data-shape`):
 *
 * - `decide` (남기지 않은 변경 있음) — 좌 목록 + 하단 도크, 우 증거.
 * - `recall` (모두 남겼음) — 이 순간의 일은 "되짚기" 하나뿐이라 **단일 기둥**
 *   이고 지난 걸음이 본문을 차지한다. 구 코드는 이 상태에서도 2열을 선언해
 *   우측 열이 한 줄만 담긴 채 **세로 구분선만 화면 끝까지** 그어져 있었다
 *   (1512×950 실측: 우측 유효 잉크 1행 / 빈 높이 1,010px). 빈 열은 설계처럼
 *   보이는 것이 문제였다 — 열을 안 만드는 것이 답이다.
 *
 * 증거 열은 **보여줄 것이 있을 때만** 렌더한다(`showEvidence`). 열의 존재가
 * 내용의 존재를 약속하므로, 약속을 지킬 수 없으면 열을 만들지 않는다.
 *
 * 걷어낸 "AI 느낌" 여섯 (각각의 처방은 해당 컴포넌트 주석에):
 * ① 좌측 앰버 악센트 레일이 붙은 둥근 콜아웃 카드 → 크롬 한 줄 + 온디맨드
 *    입력(헌장: 그 레일은 금지 패턴이고 앰버는 이 표면의 예외가 아니다).
 * ② 아무것도 안 하는 2열 → 두 모양 + 조건부 증거 열.
 * ③ 균일한 회색 목록(빌드 로그) → kind 그룹 + 상태 글리프 + 개념/그 밖의
 *    파일 분리 + 선택 가능한 행.
 * ④ 주 동작이 가장 약함 → 하단 도크의 채운 인디고 버튼.
 * ⑤ 모션 0 → `.git-fade-in` 하나(등장 · 계단 · 교체), reduced-motion 동등물.
 * ⑥ 낯선 말 / 신뢰 문구의 위계 역전 → `최근 기록`→`지난 걸음`(페이지 제목
 *    `기록` 과의 충돌 제거), 기록 범위 고지를 **쓰기가 일어나는 자리**로.
 *
 * 그리고 이 화면에서 가장 큰 배관 누출도 같이 걷었다: 증거 열이 `diff --git`
 * `index 4a1c0de..8b71f92` `@@ -12,6 +12,9 @@` 를 그대로 쏟고 있었고, 지난
 * 걸음은 우리가 만든 영문 커밋 제목(`ontology snapshot: +3 concepts, …`)을
 * 한국어 화면에서 원문으로 읽히고 있었다. 둘 다 `atlas-git-record.ts` 가
 * 사람의 말로 되읽는다(원문은 펼침 상세에 그대로 남는다 — 감사 흔적).
 *
 * ## 왜 스테퍼 위젯이 아니라 한 줄인가
 *
 * 원형+커넥터 스테퍼는 "빈 화면을 채우려고 넣은 컴포넌트"로 읽히고, 무엇보다
 * **거짓말이 된다** — 보낼 곳(원격) 등록은 선택이고, 이 컴퓨터에만 쌓는 것도
 * 정당한 종착지다. 그래서 사다리는 ① 앱에서 열기 ② 폴더 고르기 ③ 기록 시작
 * 셋으로 끝나고(원격은 걸음이 아니다), 크롬 없이 11px 텍스트 한 줄로만 산다.
 *
 * ## 런타임별 분기
 *
 * 데스크톱(Tauri): `src-tauri/src/git.rs` 7 command 를 `tauri-git.ts` 브리지로
 * 소비한다 — ① vault 변경 요약(kind별 A/M/D + 대표 슬러그, CLI
 * `buildChangeSummary` 와 같은 산식) ② 남기기(명시 클릭 → 확인 스텝 →
 * `git_snapshot`; 보내기는 별도 opt-in 체크박스, 기본 off) ③ 최근 발자취
 * ④ 아직 남기지 않은 변경의 바뀐 줄 ⑤ 기록 시작(`git_init`) ⑥ 보낼 곳
 * 등록(`git_set_remote`).
 *
 * 웹(브라우저 vault): 브라우저는 프로세스를 띄울 수 없으므로 정직하게 강등 —
 * 이건 고칠 수 있는 결함이 아니라 표면의 성질이다. 다만 **"안 된다"로 끝나지
 * 않는다**: 브라우저에서 이 표면의 유일한 진짜 다음 걸음이 앱을 받는 것이므로
 * `앱 받기`가 주 버튼이고, 터미널 경로(CLI 복사)는 그 아래 보조 탈출구다.
 * 이전 화면은 정반대였다 — 복사 버튼이 앱 받기 링크보다 컸다.
 *
 * 신뢰 헌장 준수: **쓰기 명령은 사용자 클릭 뒤에만** 일어난다 — 마운트 시
 * 조회는 읽기 전용(status/diff/history)뿐이고, `git_init`/`git_set_remote`/
 * `git_snapshot` 은 각각의 버튼 onClick 에서만 호출된다(테스트가 이 계약을
 * 고정한다).
 */

export interface AtlasGitPanelProps {
  /**
   * Tauri 데스크톱 vault 의 절대 경로 — `getTauriVaultRootPath(vault.handle)`
   * 로 얻는다. null/undefined 면 웹 강등 렌더.
   */
  vaultPath?: string | null;
  /** 웹 강등 요약에 쓸 세션 changeset — HomePage 의 `ontologyChangeset`. */
  sessionChangeset?: OntologyChangeset | null;
  /**
   * 볼트 그래프 — 걸음이 바꾼 파일을 **개념**으로 옮기는 데 쓴다.
   *
   * 훅으로 안에서 읽지 않고 **밖에서 받는다**. `useOntologyInsight` 는 안에서
   * `useLocalVault` 를 부르는데, 위젯이 그걸 직접 부르면 이 컴포넌트를 그리는
   * 모든 테스트가 프로바이더를 요구하게 된다(실측: 33개가 한 번에 터졌다).
   * 데이터를 밖에서 넣으면 위젯은 순수하게 남고 호출부가 그 결정을 진다 —
   * `sessionChangeset` 이 이미 그 관례다.
   */
  graph?: { nodes: readonly KnowledgeGraphNode[]; edges: readonly KnowledgeGraphEdge[] } | null;
  className?: string;
}

const SNAPSHOT_CLI_COMMAND = `${ATLAS_CLI} snapshot`;
/** S1 보조 탈출구 — 터미널에서 직접 하려는 사용자용. git 용어는 여기서만 노출. */
const INIT_CLI_COMMAND = "git init";

/**
 * 주 동작 — 이 화면이 사용자에게 시키는 **단 하나**의 일. 셋업의 「앱 받기 /
 * 폴더 고르기 / 기록 시작」과 작업대의 「N개 남기기」가 같은 무게를 쓴다:
 * 같은 지위의 동작은 같게 보여야 한다.
 *
 * 높이는 `--git-setup-action-height` (데스크톱 36px = 고정 스케일 계약의 크롬
 * 타일과 같은 단, coarse 포인터에서 44px 로 승격). 램프는 `text-body`(12.5px)
 * — 구 11px 링크/버튼은 페이지 주 동작으로 읽히지 않았다(소유자 실측: 웹
 * 강등에서 유일한 진짜 다음 걸음이 복사 버튼보다 작았다).
 */
const PRIMARY_ACTION_CLASS =
  "inline-flex h-[var(--git-setup-action-height)] shrink-0 items-center justify-center gap-1.5 rounded-[var(--chrome-radius-inner)] bg-[color:var(--color-indigo-brand)] px-4 text-body font-semibold text-white transition-colors hover:bg-[color:var(--color-indigo-hover)] disabled:opacity-60";

/** 보조 탈출구 — 있지만 주 동작과 경쟁하지 않는 무게. */
const SECONDARY_ACTION_CLASS =
  "inline-flex h-[var(--git-setup-action-height)] shrink-0 items-center justify-center gap-1.5 rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] px-3.5 text-body text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]";

/**
 * 남길 것이 없을 때의 주 동작 자리 — **비활성이지 사라지지 않는다**.
 *
 * 동사의 집이 상태에 따라 없어지면 사용자는 다음에 어디를 봐야 할지 매번 다시
 * 배워야 한다(Apple HIG — 컨트롤은 안정된 자리에). 다만 채운 인디고를 60%
 * 불투명도로 두면 "고장난 주 버튼" 으로 읽히므로, 이 상태에서는 완료를 말하는
 * 조용한 형태로 바뀐다. 화면의 주목 승자는 그때 지난 걸음으로 넘어간다.
 */
const DOCK_INERT_CLASS =
  "inline-flex h-[var(--git-setup-action-height)] shrink-0 items-center justify-center gap-1.5 rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] px-3.5 text-body text-[color:var(--color-text-quaternary)]";

const noopSubscribe = () => () => {};

/**
 * 섹션 라벨.
 *
 * 2026-07-26 — mono + `uppercase` + 0.12em 트래킹 eyebrow 문법을 걷어냈다.
 * 그 조합은 **라틴 전용 장치**다: JetBrains Mono 에는 한글 글리프가 없어
 * "이번에 바뀐 것" 이 시스템 폰트로 통째 폴백하고, 그 위에 얹힌 0.12em
 * 트래킹은 한글에서 자간이 아니라 **띄어쓰기가 깨진 것**으로 읽힌다(1920
 * 실측에서 "이번에  바뀐  것" 으로 보였다). `uppercase` 는 한글에 아무 일도
 * 하지 않으므로 순수 부작용만 남는다.
 *
 * 대신 본문 스택(Pretendard) + 램프 `--text-label` + quaternary 로 위계를
 * 만든다 — 라벨은 색과 크기로 낮추는 것이지 자간으로 낮추는 게 아니다.
 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-label font-medium text-[color:var(--color-text-quaternary)]">
      {children}
    </span>
  );
}

/**
 * 화면이 자기 일을 할 수 있는지로 갈리는 단계.
 *
 * `workbench` 만 "할 수 있다" 이고 나머지는 전부 셋업이다. `loading`/`error`
 * 도 셋업 프레임을 쓰는 이유: 그 순간에도 사용자가 할 수 있는 건 기다리거나
 * 다시 확인하는 것 하나뿐이라, 전폭 상단 정렬로 두면 "내용이 안 나온 페이지"
 * 로 읽힌다.
 */
type GitStage = "web" | "no-vault" | "loading" | "not-installed" | "error" | "not-initialized" | "workbench";

type SetupStep = 1 | 2 | 3;

export function AtlasGitPanel({
  vaultPath = null,
  sessionChangeset = null,
  graph = null,
  className,
}: AtlasGitPanelProps) {
  const t = useTranslations("atlasGit");
  /*
   * 종류 이름은 `kinds` 네임스페이스가 진실원이다 — 이 화면이 자기 키를 새로
   * 만들면 같은 사실이 두 곳에 적히고 그 순간부터 드리프트가 시작된다.
   */
  const tKinds = useTranslations("kinds");
  const kindLabel = useCallback(
    (kind: string) => {
      const known = ["project", "domain", "capability", "element", "document", "vault-readme"];
      return tKinds(known.includes(kind) ? kind : "unknown");
    },
    [tKinds],
  );

  // SSR/hydration 안전한 런타임 판별 — 서버 스냅샷은 false(웹), 클라이언트에서
  // Tauri 면 true 로 재렌더된다 (uSES 가 mismatch 를 스스로 정리).
  const bridgeAvailable = useSyncExternalStore(
    noopSubscribe,
    () => isGitBridgeAvailable(),
    () => false,
  );
  const desktop = bridgeAvailable && Boolean(vaultPath);

  const [status, setStatus] = useState<GitStatusResult | null>(null);
  const [changes, setChanges] = useState<GitChangeEntry[]>([]);
  const [diffText, setDiffText] = useState("");
  const [history, setHistory] = useState<GitCommitInfo[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  /*
   * git 설치 여부 — `null` 은 「아직 모름」이다(확인 전에 없다고 단정하지 않는다).
   * 읽기 전용 감지라 자동 호출이 헌장의 「자동 실행 금지」와 충돌하지 않는다:
   * `git_probe` 는 아무것도 설치하지 않고 실행 가능 여부만 본다.
   */
  /*
   * 걸음마다 「바꾼 개념」. 종전에는 커밋 **제목 문자열을 파싱해서 추측**했는데
   * (`describeSnapshotSubject`), 그건 우리 도구가 쓴 제목에만 맞고 사람이 쓴
   * 커밋에는 안 맞았다. #842 가 커밋별 파일 + kind/slug 를 실어 보내므로 이제
   * 추측하지 않는다 — 볼트의 개념 노드에 실제로 맞는 것만 센다.
   */
  const conceptsByHash = useMemo(() => {
    const nodes = graph?.nodes ?? [];
    const map = new Map<string, { id: string; label: string; kind: string }[]>();
    for (const commit of history) {
      const seen = new Set<string>();
      const list: { id: string; label: string; kind: string }[] = [];
      for (const file of commit.files ?? []) {
        const id = matchNodeId(file, nodes);
        if (!id || seen.has(id)) continue;
        const node = nodes.find((n) => n.id === id);
        if (!node) continue;
        seen.add(id);
        list.push({ id, label: node.display || node.title, kind: node.kind });
      }
      map.set(commit.hash, list);
    }
    return map;
  }, [history, graph]);

  const egoFor = useCallback(
    (nodeId: string) =>
      graph ? buildConceptEgo(nodeId, graph.nodes, graph.edges) : null,
    [graph],
  );
  /** 펼친 걸음 안에서 지금 보고 있는 개념. 걸음을 접으면 풀린다. */
  const [focusedConceptId, setFocusedConceptId] = useState<string | null>(null);

  const [gitInstalled, setGitInstalled] = useState<boolean | null>(null);
  const probeGit = useCallback(async () => {
    try {
      const probe = await gitProbe();
      // 브리지가 없으면(`null`) 웹 경로이고, 그건 이 상태가 판정할 일이 아니다.
      setGitInstalled(probe === null ? null : probe.installed);
    } catch {
      /*
       * 확인에 실패한 것은 **없다는 뜻이 아니다.** `null`(모름)로 두면 화면은
       * 설치 안내가 아니라 평소 경로를 그린다 — 있는 git 을 없다고 말하는 쪽이
       * 모른다고 두는 쪽보다 나쁘다. 잡지 않으면 unhandled rejection 이 된다.
       */
      setGitInstalled(null);
    }
  }, []);
  /*
   * **폴더를 고른 뒤에만** 부른다 (2026-08-02, 계약 테스트가 잡았다: 「앱 안에서
   * 폴더가 없으면 … 아무 IPC 도 안 부른다」).
   *
   * 이유가 둘이다. ① 폴더가 없으면 git 이 있든 없든 이 화면이 할 일이 없다 —
   * 안 쓸 답을 미리 물을 이유가 없다. ② macOS 는 명령어 도구가 없을 때 git 을
   * 부르면 **시스템 설치 다이얼로그**를 띄운다 — 사용자가 「기록」을 열지도
   * 않았는데 OS 창이 뜨면 그건 우리가 부른 적 없는 화면이다.
   */
  useEffect(() => {
    if (!vaultPath) return;
    void probeGit();
  }, [probeGit, vaultPath]);
  const [loadErrorText, setLoadErrorText] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [pushOptIn, setPushOptIn] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [snapshotResult, setSnapshotResult] = useState<GitSnapshotResult | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  /**
   * 증거 pane 탭 — 바뀐 줄 / 지난 걸음. 목록 좌 · 증거 우(#85).
   *
   * `null` = **아직 사용자가 고르지 않음**. 이때 탭은 상태를 따라간다: 보여줄
   * 바뀐 줄이 있으면 `바뀐 줄`, 없으면 `지난 걸음`. 판정 기준이 "변경 수" 가
   * 아니라 **파싱된 diff 파일 수** 인 이유: 새로 만든 문서만 바뀐 순간에는
   * 변경이 있어도 비교할 예전 내용이 없어서, 변경 수로 판정하면 사용자가
   * 요청하지도 않은 빈 칸에 착지한다(소유자 스크린샷의 그 한 줄).
   */
  const [evidenceTabChoice, setEvidenceTabChoice] = useState<"diff" | "history" | null>(null);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);

  /**
   * 목록에서 고른 문서의 경로. `null` = 안 골랐음 → 증거 열은 바뀐 개념
   * **전체**를 보여준다. 구 화면은 아무것도 안 고른 상태에서 우측이 "왼쪽에서
   * 문서를 고르면…" 한 줄로 비어 있었는데, 그건 아무도 요청하지 않은 빈 칸이다
   * — 고르기 전 기본값은 "전부" 여야 한다(Shneiderman: overview first).
   */
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  /** 보낼 곳 입력 — 위치 줄의 버튼으로만 열린다(카드로 상주하지 않는다). */
  const [remoteOpen, setRemoteOpen] = useState(false);
  /** 개념이 아닌 파일 — 기본 접힘. 함께 남지만 판단 대상이 아니다. */
  const [othersOpen, setOthersOpen] = useState(false);

  // S1 (기록 시작) · S4 (보낼 곳 등록) 상태.
  const [initRunning, setInitRunning] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteRunning, setRemoteRunning] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteNotice, setRemoteNotice] = useState<string | null>(null);

  // 읽기 전용 조회(status/diff/history)만 — 쓰기(git_snapshot)는 절대 여기서 안 한다.
  const refresh = useCallback(async () => {
    if (!vaultPath) return;
    // 첫 await 이전의 동기 setState 금지 (react-hooks/set-state-in-effect —
    // effect 가 이 함수를 직접 호출한다). 초기 loadState 가 이미 "loading".
    try {
      const nextStatus = await gitStatus(vaultPath);
      if (!nextStatus) return;
      setLoadErrorText(null);
      setStatus(nextStatus);
      if (nextStatus.initialized) {
        const [diffResult, historyResult] = await Promise.all([
          gitDiff(vaultPath),
          gitHistory(vaultPath, 10),
        ]);
        setChanges(diffResult?.files ?? []);
        setDiffText(diffResult?.diff ?? "");
        setHistory(historyResult ?? []);
      } else {
        setChanges([]);
        setDiffText("");
        setHistory([]);
      }
      setLoadState("ready");
    } catch (err) {
      setLoadErrorText(gitErrorMessage(err));
      setLoadState("error");
    }
  }, [vaultPath]);

  useEffect(() => {
    if (desktop) void refresh();
  }, [desktop, refresh]);

  // 판단 대상(개념)과 동반 파일을 가른다 — 사용자가 이 화면에서 읽어야 하는
  // 것은 "내 개념이 뭐가 바뀌었나" 이고, `.gitignore`/`package.json` 은 함께
  // 남지만 읽을 것이 아니다. 커밋 산식은 여전히 **전체**를 대상으로 한다.
  const { concepts, others } = useMemo(() => splitConceptChanges(changes), [changes]);
  const kindGroups = useMemo(() => groupChangesByKind(concepts), [concepts]);
  const statusCounts = useMemo(() => countChangesByStatus(changes), [changes]);
  const predictedSubject = useMemo(() => formatSnapshotSummary(changes), [changes]);
  const hasChanges = changes.length > 0;

  // git 배관을 걷어낸 파일별 diff. 여기서 계산하는 이유: 기본 탭 판정과
  // 행별 줄 증감이 둘 다 이 값을 봐야 하는데, 자식에서 두 번 계산하면
  // 화면의 두 곳이 서로 다른 사실을 말할 수 있다.
  const diffFiles = useMemo(() => parseUnifiedDiff(diffText), [diffText]);
  const evidenceTab = evidenceTabChoice ?? (diffFiles.length > 0 ? "diff" : "history");

  const stage: GitStage = !bridgeAvailable
    ? "web"
    : !vaultPath
      ? "no-vault"
      /*
       * git 이 아예 없는 것을 「오류」와 **가른다** (2026-08-02).
       *
       * 종전에는 미설치가 `loadState === "error"` 로 떨어져 원시 스폰 실패
       * 문자열만 보였다. 그런데 이 저장소에는 **설치 안내가 이미 다 있다** —
       * `git_probe`(Rust) · `gitProbe()`(브리지) · `gitInstallGuide()`(플랫폼별
       * 명령 + 다운로드 링크, 테스트까지) · 문구 13종(`atlasGit.install.*`).
       * 화면이 그걸 부르지 않았을 뿐이다. **문을 다 지어놓고 안 뚫은 상태**였다.
       *
       * `surfaces.md` 의 강등 카드 계약(왜 안 되는지 + 어디서 되는지 + 여기서
       * 되는 것)을 이 자리에 적용하는 데 **새로 쓸 문장이 하나도 없다.**
       */
      : gitInstalled === false
        ? "not-installed"
      : loadState === "error"
        ? "error"
        : !status
          ? "loading"
          : status.initialized
            ? "workbench"
            : "not-initialized";

  const confirmSnapshot = useCallback(async () => {
    if (!vaultPath) return;
    setSnapshotting(true);
    setSnapshotError(null);
    try {
      const result = await gitSnapshot(vaultPath, { push: pushOptIn });
      setSnapshotResult(result);
      setConfirming(false);
      setPushOptIn(false);
      // 사용자의 명시 선택을 지운다 — 남긴 직후 화면은 `recall` 모양으로
      // 넘어가고(지난 걸음이 본문), 변경이 남아 있으면 계속 `바뀐 줄`이다.
      setEvidenceTabChoice(null);
      setSelectedPath(null);
      await refresh();
    } catch (err) {
      setSnapshotError(gitErrorMessage(err));
    } finally {
      setSnapshotting(false);
    }
  }, [vaultPath, pushOptIn, refresh]);

  /**
   * 복사 결과는 **성공도 실패도** 말한다 (2026-07-28 QA).
   *
   * 종전 형태는 `if (await copyText(...)) { 성공 표시 }` 였다. 클립보드 권한은
   * **조용히 거절될 수 있고**, 그때 화면은 아무 말도 하지 않는다 — 사용자는
   * 복사됐다고 믿고 붙여넣기에서 처음 안다. 침묵은 성공처럼 읽힌다.
   *
   * 공용 `useCopyFeedback` 이 이미 `idle | copied | failed` 3-상태를 갖고 있다.
   * 새 기제를 만들지 않고 그것을 쓴다.
   */
  const { state: commandCopyState, copy: copySnapshotCommand } = useCopyFeedback(1600);
  const { state: initCopyState, copy: copyInitCommandText } = useCopyFeedback(1600);
  const copyCliCommand = useCallback(
    () => void copySnapshotCommand(SNAPSHOT_CLI_COMMAND),
    [copySnapshotCommand],
  );
  const copyInitCommand = useCallback(
    () => void copyInitCommandText(INIT_CLI_COMMAND),
    [copyInitCommandText],
  );

  /**
   * 기록 시작 — **이 함수는 버튼 onClick 에서만 호출된다.** 마운트/포커스/
   * 자동 갱신 경로에서 절대 호출하지 말 것(신뢰 헌장: 자동 실행 0). init 은
   * 커밋으로 연쇄하지 않으므로 성공 후 상태는 "아직 남기지 않은 변경 N건" 이다.
   */
  const startTracking = useCallback(async () => {
    if (!vaultPath) return;
    setInitRunning(true);
    setInitError(null);
    try {
      await gitInit(vaultPath);
      await refresh();
    } catch (err) {
      setInitError(gitErrorMessage(err));
    } finally {
      setInitRunning(false);
    }
  }, [vaultPath, refresh]);

  /*
   * 원격 세 동작 — Fetch · Pull · Push.
   *
   * 이 화면에는 **Pull 이 아예 없었고**(브리지에도 Rust 에도 있는데 호출부가
   * 없었다), Push 는 「남기기」 확인 단계의 체크박스 안에만 있었다. 그래서
   * 남길 변경이 0 이면 이미 쌓인 걸음을 보낼 방법이 화면에 없다 — 원격보다
   * 앞서 있어도 그렇다(소유자 실측: ↑2 인데 보낼 길이 없었다).
   *
   * 셋 다 **명시 클릭 뒤에만** 돈다. 자동 호출 0 — 신뢰 헌장 그대로다.
   */
  const [remoteBusy, setRemoteBusy] = useState<null | "fetch" | "pull" | "push">(null);
  const [remoteActionNotice, setRemoteActionNotice] = useState<string | null>(null);
  const [remoteActionError, setRemoteActionError] = useState<string | null>(null);
  const runRemote = useCallback(
    async (kind: "fetch" | "pull" | "push") => {
      if (!vaultPath) return;
      setRemoteBusy(kind);
      setRemoteActionError(null);
      setRemoteActionNotice(null);
      try {
        if (kind === "fetch") {
          const r = await gitFetch(vaultPath);
          if (r) setRemoteActionNotice(t("remoteDoneFetch", { summary: r.summary }));
        } else if (kind === "pull") {
          const r = await gitPull(vaultPath);
          if (r) setRemoteActionNotice(t("remoteDonePull", { summary: r.summary }));
        } else {
          /*
           * Push 는 전용 명령이 없다 — `git_snapshot(push:true)` 가 그 일을
           * 한다. 남길 변경이 0 이면 `committed:false/no-changes` 로 돌아오고
           * **이미 쌓인 걸음만 전송된다**. 그래서 「남길 게 없어도 보낼 수
           * 있다」가 성립한다.
           */
          const r = await gitSnapshot(vaultPath, { push: true });
          if (r?.push?.pushed) setRemoteActionNotice(t("remoteDonePush"));
          else if (r?.push?.guidance) setRemoteActionError(r.push.guidance);
          else if (r?.push?.message) setRemoteActionError(r.push.message);
        }
        await refresh();
      } catch (err) {
        setRemoteActionError(gitErrorMessage(err));
      } finally {
        setRemoteBusy(null);
      }
    },
    [vaultPath, refresh, t],
  );

  /**
   * 보낼 곳 등록 — 주소만 등록하고 **보내지 않는다**. 전송은 사용자가 스냅샷
   * 화면에서 따로 눌러야 한다("누를 때만 나가요" 를 호출 경계에서 지킨다).
   */
  const submitRemote = useCallback(async () => {
    if (!vaultPath) return;
    setRemoteRunning(true);
    setRemoteError(null);
    setRemoteNotice(null);
    try {
      const result = await gitSetRemote(vaultPath, remoteUrl);
      if (result) {
        setRemoteNotice(
          result.replaced
            ? t("remoteReplaced", { previous: result.replaced })
            : t("remoteSaved"),
        );
        setRemoteUrl("");
      }
      await refresh();
    } catch (err) {
      setRemoteError(gitErrorMessage(err));
    } finally {
      setRemoteRunning(false);
    }
  }, [vaultPath, remoteUrl, refresh, t]);

  return (
    <section
      aria-label={t("title")}
      data-testid="atlas-git-panel"
      data-stage={stage}
      // 시트 골격은 호스트(HomePage 의 scrim+카드 셸)가 소유한다 — 여기서
      // 보더/배경을 또 얹으면 이중 카드가 된다(소유자 실보고 2026-07-23
      // "보기 안 좋고"). AgentConnectSheet 와 같은 역할 분담: 패널은 내용만.
      className={cn("flex w-full min-h-0 flex-col", className)}
    >
      {/* 스크롤 프레임.
          - 셋업: 단일 기둥이 `m-auto` 로 프레임 정중앙에 선다 (`justify-center`
            대신 auto margin — 내용이 길어지면 0 으로 접혀 위쪽이 안 잘린다).
          - 작업대(lg+): 스크롤을 **열이 각자** 가진다. 프레임이 스크롤하면
            하단 도크(주 동작)가 화면 밖으로 밀려나 이 페이지가 시키는 유일한
            일이 스크롤 뒤에 숨는다. `<lg` 에서는 두 열이 세로로 쌓이므로
            페이지 스크롤이 맞고, 도크는 탭바 예약고 위에 선다.
          - 헤더는 작업대에서 **모양이 자기 폭 안에** 그린다: 전폭 구분선 아래
            920px 기둥이 놓이면 선이 약속한 폭과 내용의 폭이 어긋난다. */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto px-5",
          stage === "workbench"
            ? // `<lg` 은 두 열이 세로로 쌓여 페이지가 스크롤한다 — 마지막 표면이
              // 하단 탭바 뒤로 파고들지 않게 예약고를 계약한다(design.md 터치 계약).
              "py-5 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)] xl:overflow-hidden"
            : "py-6",
        )}
      >
        {stage === "workbench" ||
        stage === "not-initialized" ||
        stage === "loading" ||
        stage === "error" ? (
          <DesktopBody
            hostPlatformHint={
              typeof navigator === "undefined"
                ? ""
                : navigator.platform || navigator.userAgent
            }
            onRecheckGit={() => {
              void probeGit();
              refresh();
            }}
            key={stage}
            t={t}
            stage={stage}
            loadErrorText={loadErrorText}
            status={status}
            kindGroups={kindGroups}
            otherChanges={others}
            statusCounts={statusCounts}
            changeCount={changes.length}
            predictedSubject={predictedSubject}
            hasChanges={hasChanges}
            confirming={confirming}
            setConfirming={setConfirming}
            pushOptIn={pushOptIn}
            setPushOptIn={setPushOptIn}
            snapshotting={snapshotting}
            snapshotResult={snapshotResult}
            snapshotError={snapshotError}
            confirmSnapshot={confirmSnapshot}
            onRetry={refresh}
            evidenceTab={evidenceTab}
            setEvidenceTab={setEvidenceTabChoice}
            diffFiles={diffFiles}
            history={history}
            expandedHash={expandedHash}
            setExpandedHash={setExpandedHash}
            selectedPath={selectedPath}
            setSelectedPath={setSelectedPath}
            othersOpen={othersOpen}
            setOthersOpen={setOthersOpen}
            initRunning={initRunning}
            initError={initError}
            initCopyState={initCopyState}
            onInit={startTracking}
            onCopyInitCommand={copyInitCommand}
            remoteOpen={remoteOpen}
            setRemoteOpen={setRemoteOpen}
            remoteUrl={remoteUrl}
            setRemoteUrl={setRemoteUrl}
            remoteRunning={remoteRunning}
            remoteError={remoteError}
            remoteNotice={remoteNotice}
            onSetRemote={submitRemote}
            remoteBusy={remoteBusy}
            onRemoteAction={(kind) => void runRemote(kind)}
            remoteActionNotice={remoteActionNotice}
            remoteActionError={remoteActionError}
            concepts={conceptsByHash}
            egoFor={egoFor}
            kindLabel={kindLabel}
            focusedConceptId={focusedConceptId}
            setFocusedConceptId={setFocusedConceptId}
          />
        ) : stage === "no-vault" ? (
          <NoVaultSetup key={stage} t={t} />
        ) : (
          <WebSetup
            key={stage}
            t={t}
            sessionChangeset={sessionChangeset}
            commandCopyState={commandCopyState}
            copyCliCommand={copyCliCommand}
          />
        )}
      </div>
    </section>
  );
}

type Translator = ReturnType<typeof useTranslations<"atlasGit">>;

/**
 * 목적지 헤드라인 (2026-07-25 목적지 승격 후속). 모달이 삭제되면서 이 패널의
 * 유일한 소비자가 `/git/` 목적지가 됐는데, 헤더는 여전히 모달 문법(11px 인디고
 * mono eyebrow + 닫기 X)이었다 — 페이지 제목으로는 너무 작고, 목적지에는
 * "닫기" 라는 개념이 없다(레일로 다른 곳에 가면 그게 나가기다). 램프 한 단이
 * 아니라 **목적지 헤드라인**(`--text-display`)으로 올렸다.
 *
 * `inColumn` = 기둥(셋업 측정폭 · 작업대 모양) 안에 놓인 형태. 전폭 구분선을
 * 떼고 좌우 패딩을 기둥에 맡긴다 — 선의 폭과 내용의 폭이 어긋나지 않게.
 *
 * `trailing` = 헤더 오른쪽의 상태(작업대의 위치 줄). 정체는 왼쪽, 상태는
 * 오른쪽, 한 줄 — 상태를 콘텐츠 위의 카드로 올리면 그게 첫 인상이 된다.
 *
 * `showScope` = 기록 범위 고지를 여기서 말할지. 작업대에서는 **쓰기가
 * 일어나는 자리**(하단 도크)로 옮긴다 — 신뢰 문구는 페이지 장식이 아니라
 * 결정 지점의 약속이고, 여기서는 눈에 안 띄는 회색 캡션이었다.
 */
function PageHeader({
  t,
  inColumn = false,
  showScope = true,
  trailing,
}: {
  t: Translator;
  inColumn?: boolean;
  showScope?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <header
      className={cn(
        "flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5",
        inColumn ? "pb-1" : "border-b border-[color:var(--color-border-soft)] px-5 pt-1 pb-4",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        {/* 넓은 폭에서 헤드라인 단을 올릴 때도 램프 유틸리티를 쓴다. 램프 토큰을
            arbitrary length 로 우회 참조하면 글자 크기만 올라가고 그 단이 싣는
            행간은 아래 단 것이 그대로 남아, 아무도 고른 적 없는 비율이 만들어진다
            — 여기가 그랬다(23px 글자에 title 짝인 24px 행간, 1.04). */}
        <h1 className="flex items-center gap-2 text-title font-semibold tracking-[-0.005em] text-[color:var(--color-text-primary)] sm:text-display">
          <HistoryIcon size={18} aria-hidden className="text-[color:var(--color-indigo-accent)]" />
          {t("title")}
        </h1>
        {/* 구 `subtitle`("vault 의 변경을 git 스냅샷으로 남깁니다")은 12글자에
            시스템 용어가 3개(vault·git·스냅샷)라 삭제했다. 그 자리를 스코프
            고지가 대신한다 — 사용자가 두 번째로 확인해야 하는 건 제품 설명이
            아니라 "내 폴더 밖은 안 건드린다" 다. */}
        {showScope ? (
          <p className="flex items-center gap-1.5 text-label leading-relaxed text-[color:var(--color-text-quaternary)]">
            <ShieldCheck size={11} aria-hidden className="shrink-0" />
            {t("scopeNotice")}
          </p>
        ) : null}
      </div>
      {trailing}
    </header>
  );
}

/**
 * 연결 사다리 — "몇 걸음 남았나" 를 **크롬 없이** 말한다.
 *
 * 소유자 요구("빠르게 연결")에 대한 응답이되, 원형+커넥터 스테퍼는 반려했다:
 * ① 그 위젯은 빈 화면을 채우려고 넣은 컴포넌트로 읽히고 ② 무엇보다 걸음 수를
 * 부풀린다 — 보낼 곳 등록은 **선택**이므로 사다리에 없다. 이 컴퓨터에만 쌓는
 * 것도 정당한 종착지고, 그걸 "미완료" 로 그리면 거짓말이다.
 *
 * 그래서 이건 위젯이 아니라 **라벨 한 줄**이다 (Tufte — 잉크는 데이터에):
 * 완료=체크+tertiary · 지금=인디고 점+primary semibold · 이후=quaternary.
 * 새 채색 0, 보더 0, 커넥터 0.
 */
function ConnectLadder({ t, current }: { t: Translator; current: SetupStep }) {
  const steps = [t("stepApp"), t("stepFolder"), t("stepStart")];
  return (
    <ol data-testid="atlas-git-ladder" className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {steps.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li
            key={label}
            data-step-state={done ? "done" : active ? "current" : "todo"}
            aria-current={active ? "step" : undefined}
            className="flex items-center gap-1.5"
          >
            {index > 0 ? (
              <span
                aria-hidden
                className="pr-1 text-label text-[color:var(--color-text-quaternary)]"
              >
                ·
              </span>
            ) : null}
            <span aria-hidden className="flex h-3 w-3 shrink-0 items-center justify-center">
              {done ? (
                <Check size={11} className="text-[color:var(--color-text-tertiary)]" />
              ) : active ? (
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-indigo-accent)]" />
              ) : (
                <span className="h-1 w-1 rounded-full bg-[color:var(--color-text-quaternary)]" />
              )}
            </span>
            <span
              className={cn(
                "text-label",
                done
                  ? "text-[color:var(--color-text-tertiary)]"
                  : active
                    ? "font-semibold text-[color:var(--color-text-primary)]"
                    : "text-[color:var(--color-text-quaternary)]",
              )}
            >
              {label}
            </span>
            {done || active ? (
              <span className="sr-only">{done ? t("stepDoneA11y") : t("stepCurrentA11y")}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 셋업 프레임 — "아직 자기 일을 못 하는" 모든 상태가 **같은 몸**을 쓴다.
 *
 * 폭이 `--git-setup-measure` 하나로 고정된 이유: 사용자는 앱에서 열기 → 폴더
 * 고르기 → 기록 시작을 **연속으로** 통과하는데, 걸음마다 폭이 달라지면 매번
 * 다른 페이지로 튕긴 것처럼 읽힌다. 세로 중앙 정렬은 여백을 "채우는" 대신
 * **의도한 여백**으로 바꾼다 — 1920×1223 에서 짧은 과업 블록을 좌상단에 붙여
 * 두면 "나머지가 로드에 실패한 페이지" 로 읽혔다(소유자 실측 판정).
 *
 * 등장 모션은 기존 `.topology-chrome-in` 재사용 —
 * `--topology-motion-panel-duration`(180ms) + `--topology-motion-ease-out`.
 * 새 duration/easing 0. `prefers-reduced-motion` 은 globals base 레이어가
 * 흔들리는 축만 걷어낸 동등물로 강등한다.
 */
function SetupFrame({
  t,
  step,
  state,
  children,
}: {
  t: Translator;
  /** null 이면 사다리를 그리지 않는다 (로딩·오류 — 걸음이 아니라 사건이다). */
  step: SetupStep | null;
  state: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid="atlas-git-setup"
      data-setup-state={state}
      className="topology-chrome-in mx-auto flex w-full max-w-[var(--git-setup-measure)] flex-col gap-4 pt-[var(--git-setup-top)]"
    >
      {/* 세로는 **위 정렬**이다. `m-auto` 로 정가운데에 두면 이 화면이 목적지가
          아니라 대화상자로 읽힌다 — 실측: 1512×806 창에서 기둥이 화면의 17%
          만 쓰고 위 209px · 아래 189px 이 균등하게 비어, 어디에도 매이지 않은
          한 덩어리가 됐다. 레일이 있는 목적지는 페이지이므로 첫 줄이 위에서
          시작한다.

          헤더가 기둥의 첫 줄이다 — 셋업에서 이 화면은 "발자취 대시보드" 가
          아니라 "기록을 시작하는 한 장" 이고, 제목·범위 고지·사다리·과업이
          하나의 세로 리듬으로 읽혀야 한다. */}
      <PageHeader t={t} inColumn />
      {step ? <ConnectLadder t={t} current={step} /> : null}
      {children}
    </div>
  );
}

/** 셋업 카드의 제목 + 본문 — 세 상태가 같은 리듬을 쓰게 묶어 둔다. */
function SetupHeading({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="text-title font-semibold tracking-[-0.005em] text-[color:var(--color-text-primary)]">
        {title}
      </h2>
      {body ? (
        <p className="text-body leading-relaxed text-[color:var(--color-text-secondary)]">{body}</p>
      ) : null}
    </div>
  );
}

/**
 * S0 — 브라우저. 브라우저가 git 을 못 돌리는 건 사실이고 그 사실은 그대로
 * 둔다. 바뀐 건 **무게 순서**다: 이전 화면에서 이 표면의 유일한 진짜 다음
 * 걸음(`앱 받기`)은 11px 텍스트 링크였고 그 위의 복사 버튼보다 작았다.
 * 지금은 앱 받기가 주 버튼이고, 터미널 경로는 아래 보조 탈출구다.
 */
function WebSetup({
  t,
  sessionChangeset,
  commandCopyState,
  copyCliCommand,
}: {
  t: Translator;
  sessionChangeset: OntologyChangeset | null;
  commandCopyState: CopyFeedbackState;
  copyCliCommand: () => void;
}) {
  const rows = sessionChangeset
    ? (
        [
          ["webNodesAdded", sessionChangeset.addedNodes.length],
          ["webNodesChanged", sessionChangeset.changedNodes.length],
          ["webNodesRemoved", sessionChangeset.removedNodes.length],
          ["webEdgesAdded", sessionChangeset.addedEdges.length],
          ["webEdgesRemoved", sessionChangeset.removedEdges.length],
        ] as const
      ).filter(([, count]) => count > 0)
    : [];

  return (
    <SetupFrame t={t} step={1} state="web">
      <SetupHeading title={t("webTitle")} body={t("webDesktopHint")} />

      <Link
        href="/download"
        data-testid="atlas-git-web-get-app"
        className={cn(PRIMARY_ACTION_CLASS, "self-start")}
      >
        <Download size={13} aria-hidden />
        {t("webGetApp")}
      </Link>

      {/* 이번에 바뀐 것 — 행동의 **근거**라 주 동작 아래에 온다.
          구 화면은 이 블록을 1176px 전폭 카드로 그렸는데, 담긴 건 24자 한
          문장이었다(Tufte data-ink 역전: 보더 잉크 > 내용 잉크). 셋업 측정폭
          안으로 들어오면서 카드 껍데기 자체가 필요 없어졌다 — 변경이 있을
          때만 amber 신호점이 붙는다. */}
      <div className="flex flex-col gap-1.5 border-t border-[color:var(--color-divider)] pt-4">
        <SectionLabel>{t("webSummaryTitle")}</SectionLabel>
        {rows.length > 0 ? (
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <li aria-hidden className="flex items-center">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-status-warning)]" />
            </li>
            {rows.map(([key, count]) => (
              <li key={key} className="text-body text-[color:var(--color-text-secondary)]">
                {t(key, { count })}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-[color:var(--color-text-quaternary)]">{t("webNoChanges")}</p>
        )}
      </div>

      {/* 터미널 탈출구 — 이미 CLI 를 쓰는 사용자를 위해 남기되, 주 동작과 같은
          무게로 경쟁하지 않는다. `webCommandHint`("누르면 …복사돼요")는 버튼
          툴팁 문구다 — 라벨 자리에 쓰면 버튼이 아닌 것을 누르라는 말이 된다. */}
      <div className="flex flex-col gap-1.5 border-t border-[color:var(--color-divider)] pt-4">
        <p className="text-label leading-relaxed text-[color:var(--color-text-quaternary)]">
          {t("webCommandLabel")}
        </p>
        <div className="flex items-center justify-between gap-2 rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2">
          <code className="min-w-0 truncate font-mono text-body text-[color:var(--color-text-secondary)]">
            {SNAPSHOT_CLI_COMMAND}
          </code>
          <button
            type="button"
            data-testid="atlas-git-web-copy"
            title={t("webCommandHint")}
            onClick={copyCliCommand}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]"
          >
            {commandCopyState === "copied" ? (
              <Check size={11} aria-hidden />
            ) : (
              <Copy size={11} aria-hidden />
            )}
            {commandCopyState === "copied"
              ? t("webCopied")
              : commandCopyState === "failed"
                ? t("webCopyFailed")
                : t("webCopyCommand")}
          </button>
        </div>
        {/**
         * **자리 표시는 채우는 법과 함께 나온다** (2026-07-29 도그푸딩).
         *
         * 이 명령은 `$ATLAS` 로 시작한다. 그게 무엇인지 말해 주는 문장은
         * `cli-invocation.ts` 에 이미 있었고, 그 파일 주석이 스스로 *"명령을
         * 내보내는 표면은 이걸 함께 실어야 한다 — 자리 표시가 보이기만 하고
         * 무엇을 채울지 모르면 정직할 뿐 쓸모가 없다"* 라고 적어 두었는데,
         * **사람이 이 명령을 읽는 유일한 화면에는 안 실려 있었다.** 복사해
         * 붙여넣으면 셸이 빈 변수로 풀어 `node /cli/src/index.mjs` 를 돌린다.
         *
         * 툴팁(`title`)으로는 안 된다 — 터치에서 도달할 수 없고 마우스
         * 사용자도 버튼 위에 머물러야 본다. 명령을 읽는 자리에 보이는 글자로
         * 쓴다.
         */}
        <p
          data-testid="atlas-git-cli-placeholder-hint"
          className="text-label leading-relaxed text-[color:var(--color-text-quaternary)]"
        >
          {t("cliPlaceholderHint")}
        </p>
      </div>
    </SetupFrame>
  );
}

/**
 * S1 — 앱은 열렸는데 폴더가 없다.
 *
 * 이전엔 이 상태가 웹 강등 화면으로 떨어졌다: 데스크톱 앱 안에서 "브라우저는
 * git 을 실행할 권한이 없어요 / 앱 받기" 를 보여줬다는 뜻이다 — 이미 앱을
 * 쓰는 사용자에게 앱을 받으라고 하는 **거짓 안내**였다. 이 걸음의 진짜 다음
 * 동작은 폴더를 고르는 것이고, 그 장소는 문서함이다.
 */
function NoVaultSetup({ t }: { t: Translator }) {
  return (
    <SetupFrame t={t} step={2} state="no-vault">
      <SetupHeading title={t("noVaultTitle")} body={t("noVaultBody")} />
      <Link
        href="/docs"
        data-testid="atlas-git-pick-vault"
        className={cn(PRIMARY_ACTION_CLASS, "self-start")}
      >
        <FolderOpen size={13} aria-hidden />
        {t("noVaultAction")}
      </Link>
    </SetupFrame>
  );
}

/**
 * 증거 pane 탭 (#85). 활성은 인디고 언더라인 — 채색 시스템 증식 없이 `border-b`
 * 하나로 상태를 말한다(`design.md`: "카테고리 구분은 색이 아닌 보더 스타일").
 */
function EvidenceTab({
  active,
  testId,
  onClick,
  children,
}: {
  active: boolean;
  testId: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "border-b-2 px-1.5 pb-1.5 text-label transition-colors",
        active
          ? "border-[color:var(--color-indigo-brand)] font-semibold text-[color:var(--color-text-primary)]"
          : "border-transparent text-[color:var(--color-text-quaternary)] hover:text-[color:var(--color-text-secondary)]",
      )}
    >
      {children}
    </button>
  );
}

/**
 * 위치 줄 — 이 폴더의 걸음이 **어디에 쌓이는가**. 헤더 오른쪽, 한 줄.
 *
 * 이 자리가 구 화면의 결함 ① 이었다: 같은 사실("지금은 이 컴퓨터에만 쌓이고
 * 있어요")을 **둥근 카드 + 좌측 앰버 풀하이트 레일 + 제목 + 본문 + 입력칸 +
 * 도움말**로 콘텐츠 위에 올려, 기록을 보러 온 사용자의 첫 인상이 설정 권유가
 * 됐다. 게다가 그 형태는 `design.md` 가 이름을 붙여 금지한 패턴이고(카드
 * 내부의 full-height colored rail = AI SaaS callout), 앰버는 허브 노드/Layer 0
 * 컨테이너와 명문 예외 2건 밖에서는 결함이다 — 이 카드는 예외가 아니었다.
 *
 * 그래서 **사실은 남기고 형태를 없앴다**: 사실은 크롬 한 줄(11px quaternary),
 * 행동은 그 옆의 조용한 버튼 하나. 입력칸은 누를 때만 온다.
 */
/** 원격 동작 한 알 — 라벨은 원어, 무엇을 하는지는 툴팁이 진다. */
function RemoteActionButton({
  id,
  label,
  hint,
  busy,
  disabled,
  onClick,
}: {
  id: "fetch" | "pull" | "push";
  label: string;
  hint: string;
  busy: boolean;
  disabled: boolean;
  onClick: (kind: "fetch" | "pull" | "push") => void;
}) {
  return (
    <button
      type="button"
      data-testid={`atlas-git-remote-${id}`}
      title={hint}
      disabled={disabled}
      onClick={() => onClick(id)}
      className="rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] px-2 py-0.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)] disabled:cursor-default disabled:opacity-40 disabled:hover:border-[color:var(--color-border-soft)] disabled:hover:text-[color:var(--color-text-tertiary)]"
    >
      {busy ? "…" : label}
    </button>
  );
}

function LocationLine({
  t,
  branch,
  upstream,
  ahead,
  behind,
  remoteOpen,
  setRemoteOpen,
  remoteBusy,
  onRemoteAction,
  notice,
  error,
}: {
  t: Translator;
  branch: string | null;
  upstream: string | null;
  /** upstream 이 없으면 둘 다 null — 0 이 아니라 「모름」이다. */
  ahead: number | null;
  behind: number | null;
  remoteOpen: boolean;
  setRemoteOpen: (v: boolean) => void;
  remoteBusy: null | "fetch" | "pull" | "push";
  onRemoteAction: (kind: "fetch" | "pull" | "push") => void;
  /** 방금 한 일의 결과. 성공도 실패도 **같은 자리**에서 말한다. */
  notice: string | null;
  error: string | null;
}) {
  if (!branch) return null;
  const known = ahead !== null && behind !== null;
  const same = known && ahead === 0 && behind === 0;
  return (
    <div
      data-testid="atlas-git-location"
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-label text-[color:var(--color-text-quaternary)]"
    >
      {/* 브랜치·원격 이름은 사용자가 정한 고유명사라 번역하지 않는다 —
          터미널·저장소 페이지에서 그대로 다시 마주치는 문자열이다. 구
          `branchLabel`("브랜치") 라벨은 삭제: `main → origin/main` 이 이미
          무엇인지 말한다. */}
      <span
        className="truncate font-mono text-[color:var(--color-text-tertiary)]"
        title={upstream ? t("locationChipHint", { branch, upstream }) : undefined}
      >
        {upstream ? t("locationChip", { branch, upstream }) : branch}
      </span>
      {upstream ? (
        <>
          {/* 갈라짐은 **마지막 확인 시점 기준**이라 그 사실을 툴팁으로 함께
              말한다 — 숫자만 보이면 실시간으로 읽힌다. */}
          <span
            data-testid="atlas-git-divergence"
            title={t("remoteStale")}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] px-2 py-0.5 tabular-nums"
          >
            {same ? (
              <span>{t("divergeSame")}</span>
            ) : (
              <>
                <span className="text-[color:var(--color-text-secondary)]">
                  {t("divergeAhead", { ahead: ahead ?? 0 })}
                </span>
                <span className="text-[color:var(--color-text-secondary)]">
                  {t("divergeBehind", { behind: behind ?? 0 })}
                </span>
              </>
            )}
          </span>
          {/* Fetch·Pull·Push 는 **원어**로 둔다. 번역하면 무슨 일이 일어나는지가
              오히려 흐려진다(소유자 판정 2026-08-02). */}
          <RemoteActionButton
            id="fetch"
            label={t("remoteFetch")}
            hint={t("remoteFetchHint")}
            busy={remoteBusy === "fetch"}
            disabled={remoteBusy !== null}
            onClick={onRemoteAction}
          />
          <RemoteActionButton
            id="pull"
            label={t("remotePull")}
            hint={behind && behind > 0 ? t("remotePullHint", { behind }) : t("remoteSameHint")}
            busy={remoteBusy === "pull"}
            disabled={remoteBusy !== null || !known || behind === 0}
            onClick={onRemoteAction}
          />
          <RemoteActionButton
            id="push"
            label={t("remotePush")}
            hint={ahead && ahead > 0 ? t("remotePushHint", { ahead }) : t("remoteSameHint")}
            busy={remoteBusy === "push"}
            disabled={remoteBusy !== null || !known || ahead === 0}
            onClick={onRemoteAction}
          />
        </>
      ) : (
        <>
          <span aria-hidden>·</span>
          <span>{t("noUpstream")}</span>
          <button
            type="button"
            data-testid="atlas-git-remote-toggle"
            aria-expanded={remoteOpen}
            onClick={() => setRemoteOpen(!remoteOpen)}
            className="rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] px-2 py-0.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]"
          >
            {remoteOpen ? t("remoteToggleClose") : t("remoteToggle")}
          </button>
        </>
      )}
      {error ? (
        <span
          data-testid="atlas-git-remote-error"
          className="basis-full text-label text-[color:var(--color-danger-text)]"
        >
          {error}
        </span>
      ) : notice ? (
        <span
          data-testid="atlas-git-remote-notice"
          className="basis-full text-label text-[color:var(--color-text-tertiary)]"
        >
          {notice}
        </span>
      ) : null}
    </div>
  );
}

/**
 * 보낼 곳(원격) 등록. **실패 지점에서 바로 해결한다**: push 가 "upstream 없어
 * 전송 불가" 로 끝나면 사용자는 무엇을 해야 할지 모른다.
 *
 * 주소는 사용자가 입력한 것만 쓴다 — 우리가 제안·추측·자동탐지하지 않는다
 * (신뢰 헌장). 등록은 전송이 아니다: 여기서는 주소만 저장하고, 보내기는
 * 사용자가 따로 눌러야 한다.
 *
 * 이건 연결 사다리의 걸음이 **아니다** — 선택이고, 이 컴퓨터에만 쌓는 것도
 * 정당한 종착지다. 그래서 **상주하지 않는다**: 위치 줄의 버튼으로 열린다.
 * 앰버 좌측 레일은 걷어냈다(헌장 금지 패턴 + 앰버 확장). 남은 것은 중립
 * surface 위의 입력 한 벌뿐이고, 무엇을 하는 자리인지는 위치 줄이 이미 말했다.
 */
function RemoteSetup({
  t,
  remoteUrl,
  setRemoteUrl,
  remoteRunning,
  remoteError,
  remoteNotice,
  onSubmit,
}: {
  t: Translator;
  remoteUrl: string;
  setRemoteUrl: (v: string) => void;
  remoteRunning: boolean;
  remoteError: string | null;
  remoteNotice: string | null;
  onSubmit: () => void;
}) {
  return (
    <div
      data-testid="atlas-git-remote-setup"
      className="git-fade-in flex shrink-0 flex-col gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3"
    >
      <p className="text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
        {t("remoteSetupBody")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={remoteUrl}
          aria-label={t("remoteFieldLabel")}
          placeholder={t("remoteFieldPlaceholder")}
          data-testid="atlas-git-remote-input"
          onChange={(event) => setRemoteUrl(event.target.value)}
          className="min-w-[220px] flex-1 rounded-[var(--radius-chip)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-canvas)] px-2.5 py-1.5 font-mono text-label text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)]"
        />
        <button
          type="button"
          data-testid="atlas-git-remote-submit"
          disabled={remoteRunning || remoteUrl.trim() === ""}
          onClick={onSubmit}
          className="rounded-[var(--radius-chip)] bg-[color:var(--color-indigo-brand)] px-3 py-1.5 text-label font-semibold text-white transition-colors hover:bg-[color:var(--color-indigo-hover)] disabled:opacity-50"
        >
          {remoteRunning ? t("remoteRunning") : t("remoteSubmit")}
        </button>
      </div>
      {remoteError ? (
        <div className="git-fade-in flex flex-col gap-0.5" data-testid="atlas-git-remote-error">
          <p className="text-label text-[color:var(--color-danger-text)]">{remoteError}</p>
          {/* 실패해도 데이터가 안전함을 매번 말한다. */}
          <p className="text-caption text-[color:var(--color-text-quaternary)]">
            {t("remoteFailedSafe")}
          </p>
        </div>
      ) : null}
      {remoteNotice ? (
        <p
          className="git-fade-in text-label text-[color:var(--color-text-secondary)]"
          data-testid="atlas-git-remote-notice"
        >
          {remoteNotice}
        </p>
      ) : null}
      <p className="text-caption text-[color:var(--color-text-quaternary)]">{t("remoteHelp")}</p>
    </div>
  );
}

/** 계단 상한 — 8행까지만 순서대로 도착하고 그 뒤는 같은 프레임이다. */
const MAX_STAGGER_INDEX = 8;

function staggerStyle(index: number): React.CSSProperties {
  return { "--git-row-index": Math.min(index, MAX_STAGGER_INDEX) } as React.CSSProperties;
}

const STATUS_GLYPH: Record<string, string> = {
  added: "+",
  modified: "~",
  deleted: "−",
  renamed: "→",
};

const STATUS_HINT_KEY = {
  added: "markAddedHint",
  modified: "markModifiedHint",
  deleted: "markDeletedHint",
  renamed: "markRenamedHint",
} as const;

/**
 * 상태를 **휘도**로 나른다 — 새로 생긴 것이 가장 밝고, 지운 것이 가장 옅다.
 *
 * 색을 쓰지 않는 이유는 둘이다: ① 헌장(무채색 + 단일 인디고)이고 ② 추가/삭제를
 * 초록/빨강으로 가르는 축은 적록 색약(남성 약 8%)이 가장 못 가르는 축인데,
 * 여기서 색은 글리프(`+ ~ − →`)가 이미 나르는 정보의 **중복 잉크**다.
 */
const STATUS_TONE: Record<string, string> = {
  added: "text-[color:var(--color-text-primary)]",
  modified: "text-[color:var(--color-text-secondary)]",
  renamed: "text-[color:var(--color-text-tertiary)]",
  deleted: "text-[color:var(--color-text-quaternary)]",
};

function StatusMark({ t, status }: { t: Translator; status: string }) {
  const hintKey = STATUS_HINT_KEY[status as keyof typeof STATUS_HINT_KEY] ?? "markModifiedHint";
  return (
    <span
      className={cn(
        "w-3 shrink-0 text-center font-mono text-label",
        STATUS_TONE[status] ?? STATUS_TONE.modified,
      )}
    >
      <span aria-hidden>{STATUS_GLYPH[status] ?? "~"}</span>
      <span className="sr-only">{t(hintKey)}</span>
    </span>
  );
}

/**
 * 변경 행 — 구 화면의 결함 ③ 을 고치는 자리.
 *
 * 이전에는 `capability · 추가 1 · 수정 2` 한 줄과 그 아래 mono 슬러그 나열이
 * kind 마다 반복됐다. 위계도 없고 항목도 없어서 **빌드 로그**로 읽혔고,
 * 무엇보다 **누를 수 없었다** — 열넷이 바뀌었는데 그중 하나의 근거를 볼
 * 방법이 화면에 없었다.
 *
 * 그래서 행은 항목이 되고, 누르면 그 문서의 바뀐 줄이 증거 열에 온다.
 * 경로는 지운 게 아니라 **쪼갰다**: 자리(`capabilities/`)는 quaternary,
 * 이름(`git-record`)은 primary — 같은 문자열이 위계를 얻는다(에이전트
 * 인계용 슬러그는 그대로 화면에 남아야 한다).
 *
 * 치수 규칙성: 높이는 `--git-row-h` 고정, 이름은 클램프, 줄 증감은 오른쪽
 * 고정 열(값이 없어도 자리를 지킨다). 내용 길이가 격자 리듬을 정하지 못한다.
 */
function ChangeRow({
  t,
  status,
  slug,
  path,
  index,
  selected,
  onSelect,
  delta,
  muted = false,
}: {
  t: Translator;
  status: string;
  slug: string;
  path: string;
  index: number;
  selected: boolean;
  onSelect: (path: string | null) => void;
  delta: { added: number; removed: number } | null;
  /** 개념이 아닌 파일 — 같은 문법, 한 단 낮은 무게. */
  muted?: boolean;
}) {
  const { name, place } = describeChangePath(slug, { isConcept: !muted });
  return (
    <li className="git-fade-in" style={staggerStyle(index)}>
      <button
        type="button"
        data-testid="atlas-git-change-row"
        data-selected={selected ? "true" : undefined}
        aria-pressed={selected}
        title={t("rowSelectHint")}
        onClick={() => onSelect(selected ? null : path)}
        className={cn(
          "flex h-[var(--git-row-h)] w-full items-center gap-2 rounded-[var(--radius-chip)] border-l-2 pr-1.5 pl-1.5 text-left transition-colors",
          selected
            ? "border-l-[color:var(--color-indigo-brand)] bg-[color:var(--color-overlay-2)]"
            : "border-l-transparent hover:bg-[color:var(--color-overlay-1)]",
        )}
      >
        <StatusMark t={t} status={status} />
        <span className="min-w-0 flex-1 truncate font-mono text-label">
          {place ? (
            <span className="text-[color:var(--color-text-quaternary)]">{place}/</span>
          ) : null}
          <span
            className={
              muted
                ? "text-[color:var(--color-text-tertiary)]"
                : "text-[color:var(--color-text-primary)]"
            }
          >
            {name}
          </span>
        </span>
        <span
          className="shrink-0 font-mono text-caption text-[color:var(--color-text-quaternary)]"
          title={delta ? t("numHint", { added: delta.added, removed: delta.removed }) : undefined}
        >
          {delta ? `+${delta.added} −${delta.removed}` : ""}
        </span>
      </button>
    </li>
  );
}

/**
 * 변경 목록. **개념이 먼저, kind 로 묶여서, 항목으로.** 그 밖의 파일은 접힌다.
 *
 * 소유자 판정: *"사용자가 판단해야 할 건 «내 개념이 뭐가 바뀌었나» 이지 파일
 * 목록이 아니다"*. `.codex/config.toml`·`.gitignore` 는 함께 남지만 읽을
 * 것이 아니므로 기본 접힘이고, 접힌 줄이 개수를 말한다(숨기는 게 아니다).
 *
 * 숫자는 화면에 **한 번만** 나온다: 상태별 합계는 섹션 머리, 항목 수는 kind
 * 그룹 머리, 줄 증감은 행. 같은 숫자를 두 곳에 쓰면 어느 쪽이 진실인지
 * 사용자가 판단해야 한다.
 */
function ChangeList({
  t,
  kindGroups,
  otherChanges,
  statusCounts,
  deltaByPath,
  selectedPath,
  setSelectedPath,
  othersOpen,
  setOthersOpen,
  stagedOutsideCount,
}: {
  t: Translator;
  kindGroups: AtlasGitKindGroup<GitChangeEntry>[];
  otherChanges: readonly GitChangeEntry[];
  statusCounts: ReturnType<typeof countChangesByStatus>;
  deltaByPath: Map<string, { added: number; removed: number }>;
  selectedPath: string | null;
  setSelectedPath: (v: string | null) => void;
  othersOpen: boolean;
  setOthersOpen: (v: boolean) => void;
  stagedOutsideCount: number;
}) {
  const summaryParts = [
    statusCounts.added > 0 ? t("statusAdded", { count: statusCounts.added }) : null,
    statusCounts.modified > 0 ? t("statusModified", { count: statusCounts.modified }) : null,
    statusCounts.deleted > 0 ? t("statusDeleted", { count: statusCounts.deleted }) : null,
    statusCounts.renamed > 0 ? t("statusRenamed", { count: statusCounts.renamed }) : null,
  ].filter(Boolean);

  let rowIndex = 0;

  return (
    <div
      data-testid="atlas-git-change-groups"
      className="flex min-w-0 flex-col gap-2 xl:min-h-0 xl:flex-1"
    >
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <SectionLabel>{t("changesTitle")}</SectionLabel>
        <span className="text-label text-[color:var(--color-text-secondary)]">
          {summaryParts.join(" · ")}
        </span>
      </div>

      <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
        {kindGroups.length > 0 ? (
          <ul className="flex flex-col">
            {kindGroups.map((group) => (
              <li key={group.kind ?? "__other"} className="flex flex-col">
                <p className="flex h-[var(--git-row-h)] shrink-0 items-center gap-1.5 pl-1.5 text-label text-[color:var(--color-text-quaternary)]">
                  <span className="font-medium text-[color:var(--color-text-tertiary)]">
                    {group.kind ?? t("kindOther")}
                  </span>
                  <span aria-hidden>{group.counts.total}</span>
                  <span className="sr-only">
                    {t("conceptsCount", { count: group.counts.total })}
                  </span>
                </p>
                <ul className="flex flex-col">
                  {group.entries.map((entry) => (
                    <ChangeRow
                      key={entry.path}
                      t={t}
                      status={entry.status}
                      slug={entry.slug}
                      path={entry.path}
                      index={rowIndex++}
                      selected={selectedPath === entry.path}
                      onSelect={setSelectedPath}
                      delta={deltaByPath.get(entry.path) ?? null}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : null}

        {otherChanges.length > 0 ? (
          <div className="flex flex-col">
            <button
              type="button"
              data-testid="atlas-git-others-toggle"
              aria-expanded={othersOpen}
              onClick={() => setOthersOpen(!othersOpen)}
              className="flex h-[var(--git-row-h)] shrink-0 items-center gap-1 rounded-[var(--radius-chip)] pr-2 pl-0.5 text-label text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
            >
              <ChevronRight
                size={11}
                aria-hidden
                className={cn("shrink-0 transition-transform", othersOpen && "rotate-90")}
              />
              {t("othersTitle", { count: otherChanges.length })}
            </button>
            {othersOpen ? (
              <div className="git-fade-in flex flex-col gap-1 pb-1">
                <p className="pl-4 text-caption leading-relaxed text-[color:var(--color-text-quaternary)]">
                  {t("othersHint")}
                </p>
                <ul className="flex flex-col">
                  {otherChanges.map((entry, index) => (
                    <ChangeRow
                      key={entry.path}
                      t={t}
                      status={entry.status}
                      slug={entry.slug}
                      path={entry.path}
                      index={index}
                      selected={selectedPath === entry.path}
                      onSelect={setSelectedPath}
                      delta={deltaByPath.get(entry.path) ?? null}
                      muted
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {stagedOutsideCount > 0 ? (
          <p className="pt-1 pl-1.5 text-caption text-[color:var(--color-text-quaternary)]">
            {t("stagedOutsideNotice", { count: stagedOutsideCount })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 바뀐 줄 — git 배관을 걷어낸 증거.
 *
 * 구 화면은 `git diff` 원문을 `<pre>` 에 그대로 쏟았다: `diff --git a/… b/…`,
 * `index 4a1c0de..8b71f92 100644`, `--- a/…`, `+++ b/…`, `@@ -12,6 +12,9 @@`.
 * 그중 사람이 판단에 쓰는 것은 **늘어난 줄과 줄어든 줄** 둘뿐이고, 나머지는
 * 도구가 도구에게 하는 말이다. 파일 정체는 목록 행이 이미 말했다.
 *
 * `@@` 는 버리지 않고 **파선 한 줄**로 바꾼다 — "여기 사이에 안 보여준 줄이
 * 있다" 는 사실은 사용자가 알아야 하고(생략을 숨기면 diff 가 거짓말이 된다),
 * 그 좌표는 아니다.
 */
function DiffView({
  t,
  files,
  showFileHeads,
}: {
  t: Translator;
  files: AtlasGitDiffFile[];
  showFileHeads: boolean;
}) {
  return (
    <div
      data-testid="atlas-git-diff-pre"
      className="git-fade-in flex min-h-0 flex-col gap-3 overflow-auto pr-1 max-xl:max-h-[var(--git-evidence-stack-max)] xl:flex-1"
    >
      {files.map((file) => {
        const { name, place } = describeChangePath(file.path, { isConcept: true });
        return (
          <div key={file.path} className="flex flex-col gap-1">
            {showFileHeads ? (
              <p className="flex items-baseline gap-2 font-mono text-caption">
                <span className="min-w-0 truncate">
                  <span className="text-[color:var(--color-text-quaternary)]">
                    {place ? `${place}/` : ""}
                  </span>
                  <span className="text-[color:var(--color-text-secondary)]">{name}</span>
                </span>
                <span
                  className="shrink-0 text-[color:var(--color-text-quaternary)]"
                  title={t("numHint", { added: file.added, removed: file.removed })}
                >
                  {`+${file.added} −${file.removed}`}
                </span>
              </p>
            ) : null}
            <ol className="flex flex-col">
              {file.lines.map((line, index) =>
                line.kind === "skip" ? (
                  <li
                    key={`skip-${String(index)}`}
                    className="flex h-[var(--git-row-h)] shrink-0 items-center px-1"
                  >
                    <span
                      aria-hidden
                      className="w-full border-t border-dashed border-[color:var(--color-border-soft)]"
                    />
                    <span className="sr-only">{t("diffSkippedHint")}</span>
                  </li>
                ) : (
                  <li
                    key={`${line.kind}-${String(index)}`}
                    className={cn(
                      "flex items-start gap-1.5 border-l-2 pr-1.5 pl-1 font-mono text-label leading-relaxed",
                      line.kind === "added"
                        ? "border-l-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-primary)]"
                        : line.kind === "removed"
                          ? "border-l-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-quaternary)]"
                          : "border-l-transparent text-[color:var(--color-text-tertiary)]",
                    )}
                  >
                    <span aria-hidden className="w-2 shrink-0 text-center select-none">
                      {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : ""}
                    </span>
                    <span className="min-w-0 break-words whitespace-pre-wrap">
                      {line.text === "" ? " " : line.text}
                    </span>
                  </li>
                ),
              )}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 지난 걸음 — "언제 무슨 의미가 바뀌었나".
 *
 * 구 화면은 커밋 제목을 원문으로 그렸다: `ontology snapshot: +3 concepts,
 * ~2 updated (capabilities/map-label-budget, domains/topology, …)`. 그런데 그
 * 문자열은 **우리가 만든 것**이고, 한국어 화면에서 그걸 그대로 읽히는 것은
 * 우리가 만든 문자열을 우리가 번역하지 않은 것이다. 사람이 쓴 커밋과 다른
 * 도구의 커밋은 원문이 곧 사람의 말이라 손대지 않는다(`matched:false`).
 *
 * 원문은 사라지지 않는다 — 펼침 상세에 전체 해시·시각과 함께 남는다.
 * 그게 감사 흔적이고, 터미널에서 다시 마주칠 문자열이다.
 *
 * 치수 규칙성: 시각은 고정 폭 열, 요약과 이름은 각각 한 줄로 클램프되고
 * 이름이 없는 걸음도 그 줄의 자리를 지킨다(높이 `--git-step-h`).
 */
/**
 * 한 걸음 행에 이름을 몇 개까지 보일까. **고정 개수 + 나머지 캡션**이다 —
 * "들어가는 만큼" 은 반복 세트의 리듬을 내용 길이가 정하게 만든다(치수 규칙성).
 */
const STEP_CONCEPT_SLOTS = 2;

function StepList({
  t,
  history,
  concepts,
  egoFor,
  kindLabel,
  focusedConceptId,
  setFocusedConceptId,
  expandedHash,
  setExpandedHash,
  settledHash,
}: {
  t: Translator;
  history: GitCommitInfo[];
  /**
   * 걸음 해시 → 그 걸음이 바꾼 **볼트 개념**. 커밋 제목을 파싱한 추측이
   * 아니라 #842 가 실어 보낸 kind/slug 를 그래프에 맞춘 결과다.
   */
  concepts: ReadonlyMap<string, readonly { id: string; label: string; kind: string }[]>;
  /** 노드 id → ego. 그래프가 없으면 항상 `null` 이고 카드는 안 그려진다. */
  egoFor: (nodeId: string) => ConceptEgo | null;
  /** 종류 이름 — `kinds` 네임스페이스가 진실원. */
  kindLabel: (kind: string) => string;
  focusedConceptId: string | null;
  setFocusedConceptId: (id: string) => void;
  expandedHash: string | null;
  setExpandedHash: (v: string | null) => void;
  /** 방금 남긴 커밋의 해시 — 그 한 줄만 확정 램프로 정착시킨다. */
  settledHash?: string | null;
}) {
  if (history.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-label text-[color:var(--color-text-tertiary)]">{t("historyEmpty")}</p>
        <p className="text-caption leading-relaxed text-[color:var(--color-text-quaternary)]">
          {t("historyEmptyHint")}
        </p>
      </div>
    );
  }

  return (
    <ul data-testid="atlas-git-steps" className="flex flex-col">
      {history.map((commit, index) => {
        const summary = describeSnapshotSubject(commit.subject);
        const parts = [
          summary.added > 0 ? t("statusAdded", { count: summary.added }) : null,
          summary.updated > 0 ? t("statusModified", { count: summary.updated }) : null,
          summary.renamed > 0 ? t("statusRenamed", { count: summary.renamed }) : null,
          summary.removed > 0 ? t("statusDeleted", { count: summary.removed }) : null,
        ].filter(Boolean);
        const headline = summary.matched
          ? parts.length > 0
            ? parts.join(" · ")
            : t("stepNoConcepts")
          : commit.subject;
        const stepConcepts = concepts.get(commit.hash) ?? [];
        const names = summary.slugs.join(", ");
        const trail = summary.overflow > 0 ? t("moreSlugs", { count: summary.overflow }) : "";
        const expanded = expandedHash === commit.hash;
        return (
          <li
            key={commit.hash}
            // 방금 남긴 줄만 확정 서명을 받는다 — 이미 있던 역사가 다시
            // 태어나면 "무엇이 방금 일어났나" 라는 정보가 흐려진다.
            className={stepRowMotionClass(commit.hash, settledHash)}
            style={stepRowUsesStagger(commit.hash, settledHash) ? staggerStyle(index) : undefined}
          >
            <button
              type="button"
              data-testid="atlas-git-history-item"
              aria-expanded={expanded}
              title={t("stepSelectHint")}
              onClick={() => setExpandedHash(expanded ? null : commit.hash)}
              className="flex h-[var(--git-step-h)] w-full items-center gap-3 rounded-[var(--radius-chip)] border-l-2 border-l-transparent pr-1.5 pl-1.5 text-left transition-colors hover:bg-[color:var(--color-overlay-1)] aria-expanded:border-l-[color:var(--color-indigo-brand)] aria-expanded:bg-[color:var(--color-overlay-2)]"
            >
              <span className="w-20 shrink-0 truncate text-label text-[color:var(--color-text-quaternary)]">
                {commit.relativeTime}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                {/* 주어는 **개념**이다. 개념을 안 건드린 걸음만 요약/원문이
                    그 자리를 대신한다 — 빈 줄로 두면 무슨 걸음인지 알 수 없다. */}
                <span className="flex min-w-0 items-center gap-2 truncate text-body text-[color:var(--color-text-primary)]">
                  {stepConcepts.length > 0 ? (
                    <>
                      {stepConcepts.slice(0, STEP_CONCEPT_SLOTS).map((concept) => (
                        <span key={concept.id} className="inline-flex shrink-0 items-center gap-1.5">
                          <TopologyV2KindGlyph kind={concept.kind} size={11} />
                          <span className="truncate font-medium">{concept.label}</span>
                        </span>
                      ))}
                      {stepConcepts.length > STEP_CONCEPT_SLOTS ? (
                        <span className="shrink-0 text-label text-[color:var(--color-text-quaternary)]">
                          {t("moreSlugs", { count: stepConcepts.length - STEP_CONCEPT_SLOTS })}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="truncate">{headline}</span>
                  )}
                </span>
                {/* 아래 줄은 비어도 자리를 지킨다 — 반복 세트의 행 높이가
                    내용의 유무로 정해지지 않게(치수 규칙성). */}
                <span className="truncate text-label text-[color:var(--color-text-quaternary)]">
                  {stepConcepts.length > 0
                    ? commit.subject
                    : names && trail
                      ? `${names} · ${trail}`
                      : names || trail || " "}
                </span>
              </span>
              <span className="shrink-0 font-mono text-caption text-[color:var(--color-text-quaternary)]">
                {commit.shortHash}
              </span>
            </button>
            {expanded ? (
              <CommitDetail
                t={t}
                hash={commit.hash}
                isoTime={commit.isoTime}
                subject={commit.subject}
                concepts={stepConcepts}
                focusedConceptId={focusedConceptId}
                setFocusedConceptId={setFocusedConceptId}
                egoFor={egoFor}
                kindLabel={kindLabel}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 남기기 결과 한 줄.
 *
 * ICU 인자 정정 (2026-07-26) — 카피 시트는 `{count}`/`{upstream}`/`{remote}` 를
 * 요구하는데 호출부가 `{subject}` 하나만 넘기거나 아무것도 안 넘겼다. next-intl
 * 은 인자가 빠지면 문장 대신 **키 경로**(`atlasGit.snapshotDone`)를 그리므로,
 * 남기기에 성공한 그 순간 사용자가 개발자 문자열을 보고 있었다.
 *
 * `counts` 는 Rust 페이로드라 필드 누락 시 렌더 전체가 죽는다 — 결과 문장 하나
 * 때문에 화면이 무너지면 안 되므로 목록 개수로 폴백한다.
 */
function SnapshotResultLine({
  t,
  result,
  fallbackCount,
}: {
  t: Translator;
  result: GitSnapshotResult;
  fallbackCount: number;
}) {
  const count = result.counts?.total ?? fallbackCount;
  const remote = result.push?.remoteUrl ?? "";
  return (
    <p
      className="git-fade-in text-caption text-[color:var(--color-text-tertiary)]"
      data-testid="atlas-git-snapshot-result"
    >
      {result.committed ? t("snapshotDone", { count }) : t("snapshotNoChanges")}
      {result.push
        ? ` · ${
            result.push.pushed
              ? t("pushDone", { count, upstream: remote })
              : t("pushFailed", { count, remote })
          }`
        : null}
    </p>
  );
}

/**
 * 하단 도크 — 이 화면의 **동사**가 사는 자리 (결함 ④ 의 처방).
 *
 * 구 화면에서 `14개 남기기` 는 목록 끝에 홀로 뜬 11px 고스트 아웃라인
 * 버튼이었다. 이 페이지에 온 사람이 내리는 **유일한 결정**인데 화면에서 가장
 * 조용했다. 지금은 열 바닥에 고정되어(`mt-auto`) 목록이 아무리 길어도 늘 같은
 * 자리에 있고, 채운 인디고 + `text-body` 로 이 표면의 최대 무게를 갖는다.
 *
 * 기록 범위 고지가 여기로 내려온 것도 같은 이유다 — 신뢰 문구는 **결정
 * 지점**에서 읽혀야 하는 약속이지, 페이지 제목 밑의 장식이 아니다.
 *
 * 확인 스텝의 mono 한 줄은 남는다: 그 자리에서만은 사용자가 **실제로 기록될
 * 문자열**을 봐야 하기 때문이다(그래서 여기의 영문은 배관 누출이 아니라 값이다).
 */
function ActionDock({
  t,
  onConnectRemote,
  hasChanges,
  changeCount,
  predictedSubject,
  confirming,
  setConfirming,
  pushOptIn,
  setPushOptIn,
  snapshotting,
  snapshotResult,
  snapshotError,
  confirmSnapshot,
  upstream,
}: {
  t: Translator;
  /** 원격이 없을 때 도크 마지막 줄이 여는 입력. */
  onConnectRemote: () => void;
  hasChanges: boolean;
  changeCount: number;
  predictedSubject: string;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  pushOptIn: boolean;
  setPushOptIn: (v: boolean) => void;
  snapshotting: boolean;
  snapshotResult: GitSnapshotResult | null;
  snapshotError: string | null;
  confirmSnapshot: () => void;
  upstream: string | null;
}) {
  return (
    <div
      data-testid="atlas-git-dock"
      className="mt-auto flex shrink-0 flex-col gap-2 border-t border-[color:var(--color-divider)] pt-3"
    >
      {confirming ? (
        <div className="git-fade-in flex flex-col gap-2" data-testid="atlas-git-confirm-step">
          <p className="text-caption text-[color:var(--color-text-tertiary)]">{t("confirmBody")}</p>
          <p className="rounded-[var(--radius-chip)] bg-[color:var(--color-overlay-1)] px-2 py-1.5 font-mono text-label break-all text-[color:var(--color-text-primary)]">
            {predictedSubject}
          </p>
          <label className="flex items-center gap-2 text-label text-[color:var(--color-text-secondary)]">
            <input
              type="checkbox"
              data-testid="atlas-git-push-optin"
              checked={pushOptIn}
              disabled={!upstream}
              onChange={(event) => setPushOptIn(event.target.checked)}
              className="accent-[var(--color-indigo-accent)]"
            />
            {t("pushOptIn")}
          </label>
          <p className="text-caption text-[color:var(--color-text-quaternary)]">
            {upstream ? t("pushOptInHint", { upstream }) : t("pushNoUpstream")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="atlas-git-confirm-button"
              disabled={snapshotting}
              onClick={confirmSnapshot}
              className={PRIMARY_ACTION_CLASS}
            >
              {snapshotting ? t("snapshotRunning") : t("confirmButton")}
            </button>
            <button
              type="button"
              data-testid="atlas-git-cancel-button"
              disabled={snapshotting}
              onClick={() => setConfirming(false)}
              className={SECONDARY_ACTION_CLASS}
            >
              {t("cancelButton")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-testid="atlas-git-snapshot-button"
          disabled={!hasChanges}
          onClick={() => setConfirming(true)}
          className={cn(hasChanges ? PRIMARY_ACTION_CLASS : DOCK_INERT_CLASS, "self-start")}
        >
          {hasChanges ? null : <Check size={13} aria-hidden />}
          {hasChanges ? t("snapshotButton", { count: changeCount }) : t("noChanges")}
        </button>
      )}

      {snapshotError ? (
        <p
          className="git-fade-in text-caption text-[color:var(--color-text-secondary)]"
          data-testid="atlas-git-snapshot-error"
        >
          {snapshotError}
        </p>
      ) : null}
      {snapshotResult ? (
        <SnapshotResultLine t={t} result={snapshotResult} fallbackCount={changeCount} />
      ) : null}

      {/*
        쓰기 자리의 마지막 줄은 **지금 상태에서 다음 걸음**을 말한다.

        원격이 없으면 남긴 걸음은 이 컴퓨터에만 있다 — 그게 지금 알아야 할
        사실이고, 다음 걸음은 연결이다. 종전에는 이 자리가 언제나 범위 고지
        하나였는데, 그 문장은 헤더에도 같이 떠서 같은 말이 두 번 나왔고
        (소유자 지적) 정작 "그래서 이제 뭘 하나" 는 아무 데도 없었다.
      */}
      {upstream ? (
        <p className="flex items-center gap-1.5 text-caption leading-relaxed text-[color:var(--color-text-quaternary)]">
          <ShieldCheck size={11} aria-hidden className="shrink-0" />
          {t("scopeNotice")}
        </p>
      ) : (
        <p
          data-testid="atlas-git-dock-no-remote"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption leading-relaxed text-[color:var(--color-text-quaternary)]"
        >
          <ShieldCheck size={11} aria-hidden className="shrink-0" />
          <span>{t("dockNoRemote")}</span>
          <button
            type="button"
            data-testid="atlas-git-dock-connect-remote"
            onClick={onConnectRemote}
            className="rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] px-2 py-0.5 text-caption text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]"
          >
            {t("dockConnectRemote")}
          </button>
        </p>
      )}
    </div>
  );
}

function DesktopBody({
  t,
  stage,
  hostPlatformHint,
  onRecheckGit,
  loadErrorText,
  status,
  kindGroups,
  otherChanges,
  statusCounts,
  changeCount,
  predictedSubject,
  hasChanges,
  confirming,
  setConfirming,
  pushOptIn,
  setPushOptIn,
  snapshotting,
  snapshotResult,
  snapshotError,
  confirmSnapshot,
  onRetry,
  evidenceTab,
  setEvidenceTab,
  diffFiles,
  history,
  expandedHash,
  setExpandedHash,
  selectedPath,
  setSelectedPath,
  othersOpen,
  setOthersOpen,
  initRunning,
  initError,
  initCopyState,
  onInit,
  onCopyInitCommand,
  remoteOpen,
  setRemoteOpen,
  remoteUrl,
  setRemoteUrl,
  remoteRunning,
  remoteError,
  remoteNotice,
  onSetRemote,
  remoteBusy,
  onRemoteAction,
  remoteActionNotice,
  remoteActionError,
  concepts,
  egoFor,
  kindLabel,
  focusedConceptId,
  setFocusedConceptId,
}: {
  /** `navigator.platform ?? userAgent` — 설치 안내를 플랫폼별로 고르는 힌트. */
  hostPlatformHint: string;
  /** 「다시 확인하기」 — git 을 방금 깐 사람이 앱을 안 껐다 켜도 되게. */
  onRecheckGit: () => void;
  t: Translator;
  stage: Extract<GitStage, "loading" | "not-installed" | "error" | "not-initialized" | "workbench">;
  loadErrorText: string | null;
  status: GitStatusResult | null;
  kindGroups: AtlasGitKindGroup<GitChangeEntry>[];
  otherChanges: GitChangeEntry[];
  statusCounts: ReturnType<typeof countChangesByStatus>;
  changeCount: number;
  predictedSubject: string;
  hasChanges: boolean;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  pushOptIn: boolean;
  setPushOptIn: (v: boolean) => void;
  snapshotting: boolean;
  snapshotResult: GitSnapshotResult | null;
  snapshotError: string | null;
  confirmSnapshot: () => void;
  onRetry: () => void;
  evidenceTab: "diff" | "history";
  setEvidenceTab: (v: "diff" | "history") => void;
  diffFiles: AtlasGitDiffFile[];
  history: GitCommitInfo[];
  expandedHash: string | null;
  setExpandedHash: (v: string | null) => void;
  selectedPath: string | null;
  setSelectedPath: (v: string | null) => void;
  othersOpen: boolean;
  setOthersOpen: (v: boolean) => void;
  initRunning: boolean;
  initError: string | null;
  initCopyState: CopyFeedbackState;
  onInit: () => void;
  onCopyInitCommand: () => void;
  remoteOpen: boolean;
  setRemoteOpen: (v: boolean) => void;
  remoteUrl: string;
  setRemoteUrl: (v: string) => void;
  remoteRunning: boolean;
  remoteError: string | null;
  remoteNotice: string | null;
  onSetRemote: () => void;
  remoteBusy: null | "fetch" | "pull" | "push";
  onRemoteAction: (kind: "fetch" | "pull" | "push") => void;
  remoteActionNotice: string | null;
  remoteActionError: string | null;
  /** 걸음 해시 → 그 걸음이 바꾼 볼트 개념. */
  concepts: ReadonlyMap<string, readonly { id: string; label: string; kind: string }[]>;
  egoFor: (nodeId: string) => ConceptEgo | null;
  kindLabel: (kind: string) => string;
  focusedConceptId: string | null;
  setFocusedConceptId: (id: string) => void;
}) {
  /**
   * 방금 남긴 커밋의 해시 — 지난 걸음 목록에서 **그 한 줄만** 확정 램프로
   * 정착시킨다(`--motion-settle`). 이 표면 최대의 확정인데 종전에는 결과 한
   * 줄만 120ms 페이드로 왔고, "썼다" 는 알겠는데 **어디에 박혔는지**를
   * 아무것도 안 보여줬다.
   *
   * 나머지 행은 손대지 않는다 — 이미 있던 역사가 다시 태어나면 "무엇이 방금
   * 일어났나" 라는 정보가 흐려진다. key 가 커밋 해시라 기존 행의 DOM 은
   * 재사용되고 애니메이션도 재생되지 않는다.
   */
  const settledHash = snapshotResult?.commitHash ?? null;

  if (stage === "loading") {
    return (
      <SetupFrame t={t} step={null} state="loading">
        <p className="text-body text-[color:var(--color-text-tertiary)]">{t("loading")}</p>
      </SetupFrame>
    );
  }
  if (stage === "not-installed") {
    /*
     * 강등 카드 3요소를 그대로 채운다 (`surfaces.md`) — **새 문구 0개**.
     * ① 왜: `install.title` / `install.body`
     * ② 어디서: `gitInstallGuide(platform)` 의 플랫폼별 명령(복사) + 다운로드 링크
     * ③ 다시 확인: `install.recheck`
     *
     * 「곧 됩니다」를 쓰지 않는다 — 오늘 안 되는 것은 안 된다고 쓰고, 대신 갈
     * 곳을 준다. 외부 링크는 클릭 전 경고로 선행 `↗` 를 단다(design.md).
     */
    const guide = gitInstallGuide(gitHostPlatformFrom(hostPlatformHint));
    const options = [guide.primary, ...guide.alternatives];
    return (
      <SetupFrame t={t} step={null} state="error">
        <div className="flex flex-col gap-3" data-testid="atlas-git-not-installed">
          <SetupHeading title={t("install.title")} body={t("install.body")} />
          <ul className="flex flex-col gap-2">
            {options.map((option) => (
              <li key={option.labelKey} className="flex items-center gap-2">
                <span className="text-label text-[color:var(--color-text-tertiary)]">
                  {t(option.labelKey)}
                </span>
                {option.command ? (
                  <code className="rounded-[var(--radius-chip)] bg-[color:var(--color-overlay-1)] px-2 py-0.5 font-mono text-label text-[color:var(--color-text-secondary)]">
                    {option.command}
                  </code>
                ) : option.href ? (
                  <a
                    href={option.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    data-testid="atlas-git-install-download"
                    className="rounded-[var(--radius-chip)] px-1 text-label text-[color:var(--color-indigo-accent)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]"
                  >
                    ↗ {option.href}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <button
            type="button"
            data-testid="atlas-git-install-recheck"
            onClick={() => {
              onRecheckGit();
            }}
            className={cn(SECONDARY_ACTION_CLASS, "self-start")}
          >
            <RefreshCw size={13} aria-hidden />
            {t("install.recheck")}
          </button>
        </div>
      </SetupFrame>
    );
  }

  if (stage === "error") {
    // 오류도 막다른 길이 아니어야 한다 — 폴더가 되돌아왔을 때 사용자가 앱을
    // 떠나지 않고 다시 확인할 수 있는 버튼을 같은 자리에 둔다.
    return (
      <SetupFrame t={t} step={null} state="error">
        <div className="flex flex-col gap-3" data-testid="atlas-git-load-error">
          <SetupHeading title={t("loadError")} body={loadErrorText ?? undefined} />
          <button
            type="button"
            data-testid="atlas-git-retry"
            onClick={onRetry}
            className={cn(SECONDARY_ACTION_CLASS, "self-start")}
          >
            <RefreshCw size={13} aria-hidden />
            {t("retryButton")}
          </button>
        </div>
      </SetupFrame>
    );
  }
  if (stage === "not-initialized") {
    // S2 — 소유자가 막혔던 dead-end 를 여는 화면 (2026-07-25).
    //
    // 이전 코드는 "Atlas 는 자동으로 git init 하지 않아요 — 터미널에서 직접
    // 실행하세요" 로 끝났고, 누를 것이 없어 사용자는 앱을 떠나야 했다. 헌장이
    // 금지한 건 **자동** 실행이지, 사용자가 자기가 고른 폴더에서 버튼을 누르는
    // 것이 아니다(소유자 결정 + Guardian 판정). 자동 실행은 여전히 0 —
    // `onInit` 은 이 버튼의 onClick 에서만 호출되고, init 은 커밋으로 연쇄하지
    // 않는다(빈 저장소 → "아직 남기지 않은 변경 N건" 상태로 착지).
    //
    // 2026-07-26 — 좌상단 정렬 전폭에서 셋업 프레임으로. 이 순간 사용자의 일은
    // 하나뿐이고, 화면도 하나만 말해야 한다.
    return (
      <SetupFrame t={t} step={3} state="not-initialized">
        <div className="flex flex-col gap-4" data-testid="atlas-git-not-initialized">
          <SetupHeading title={t("notInitialized")} body={t("notInitializedHint")} />
          {/* 무엇이 만들어지는지 **누르기 전에** 말한다. */}
          <p className="text-body leading-relaxed text-[color:var(--color-text-tertiary)]">
            {t("initWhatHappens")}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="atlas-git-init"
              disabled={initRunning}
              onClick={onInit}
              className={PRIMARY_ACTION_CLASS}
            >
              {initRunning ? t("initRunning") : t("initButton")}
            </button>
            <button
              type="button"
              data-testid="atlas-git-init-copy"
              title={t("initTerminalHint")}
              onClick={onCopyInitCommand}
              className={SECONDARY_ACTION_CLASS}
            >
              {initCopyState === "copied"
                ? t("webCopied")
                : initCopyState === "failed"
                  ? t("webCopyFailed")
                  : t("initTerminalButton")}
            </button>
          </div>

          {initError ? (
            <p
              className="git-fade-in text-label text-[color:var(--color-danger-text)]"
              data-testid="atlas-git-init-error"
            >
              {initError}
            </p>
          ) : null}

          {/* 되돌리는 방법을 **같은 화면에** — 처음 겪는 사용자가 가장 겁내는 지점. */}
          <p className="border-t border-[color:var(--color-divider)] pt-3 text-label leading-relaxed text-[color:var(--color-text-quaternary)]">
            {t("initEscape")}
          </p>
        </div>
      </SetupFrame>
    );
  }

  // ── 작업대 ─────────────────────────────────────────────────────────────
  const upstream = status?.upstream ?? null;
  const showRemoteSetup = remoteOpen && !upstream;
  const deltaByPath = new Map(
    diffFiles.map((file) => [file.path, { added: file.added, removed: file.removed }]),
  );
  const shownDiffFiles = selectedPath
    ? diffFiles.filter((file) => file.path === selectedPath)
    : diffFiles;

  const locationLine = (
    <LocationLine
      t={t}
      branch={status?.branch ?? null}
      upstream={upstream}
      ahead={status?.ahead ?? null}
      behind={status?.behind ?? null}
      remoteOpen={remoteOpen}
      setRemoteOpen={setRemoteOpen}
      remoteBusy={remoteBusy}
      onRemoteAction={onRemoteAction}
      notice={remoteActionNotice}
      error={remoteActionError}
    />
  );

  const dock = (
    <ActionDock
      t={t}
      onConnectRemote={() => setRemoteOpen(true)}
      hasChanges={hasChanges}
      changeCount={changeCount}
      predictedSubject={predictedSubject}
      confirming={confirming}
      setConfirming={setConfirming}
      pushOptIn={pushOptIn}
      setPushOptIn={setPushOptIn}
      snapshotting={snapshotting}
      snapshotResult={snapshotResult}
      snapshotError={snapshotError}
      confirmSnapshot={confirmSnapshot}
      upstream={upstream}
    />
  );

  const remotePanel = showRemoteSetup ? (
    <RemoteSetup
      t={t}
      remoteUrl={remoteUrl}
      setRemoteUrl={setRemoteUrl}
      remoteRunning={remoteRunning}
      remoteError={remoteError}
      remoteNotice={remoteNotice}
      onSubmit={onSetRemote}
    />
  ) : null;

  // `recall` — 남길 것이 없다. 이 순간의 일은 "되짚기" 하나뿐이므로 열을
  // 만들지 않는다. 구 화면이 여기서도 2열을 선언해 우측이 한 줄만 담긴 채
  // 세로 구분선만 화면 끝까지 그어져 있던 것이 소유자가 본 "절반이 빈 공간"
  // 이다 — 빈 열은 채우는 게 아니라 안 만드는 것이 답이다.
  if (!hasChanges) {
    return (
      <div
        data-testid="atlas-git-workbench"
        data-shape="recall"
        className="git-fade-in mx-auto flex w-full max-w-[var(--git-single-measure)] flex-col gap-4 lg:min-h-0 lg:flex-1"
      >
        <PageHeader t={t} inColumn showScope={false} trailing={locationLine} />
        {remotePanel}

        {/* 같은 작업면 — 모양이 달라도 표면은 하나다. 상태 문장이 이 안에
            있는 이유: 밖에 두면 헤더 블록과 작업면 사이가 벌어져(수직 중앙
            정렬) 문장 하나가 허공에 뜬 것으로 읽힌다. */}
        <div className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-panel)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4 lg:my-auto lg:min-h-0">
          <p className="shrink-0 text-body leading-relaxed text-[color:var(--color-text-tertiary)]">
            {t("noChangesHint")}
          </p>
          <div className="flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <SectionLabel>{t("stepsTab")}</SectionLabel>
            {history.length > 0 ? (
              <>
                <span aria-hidden className="text-label text-[color:var(--color-text-secondary)]">
                  {history.length}
                </span>
                <span className="sr-only">{t("stepsCount", { count: history.length })}</span>
              </>
            ) : null}
          </div>
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <StepList
              t={t}
              history={history}
              concepts={concepts}
              egoFor={egoFor}
              kindLabel={kindLabel}
              focusedConceptId={focusedConceptId}
              setFocusedConceptId={setFocusedConceptId}
              expandedHash={expandedHash}
              setExpandedHash={setExpandedHash}
              settledHash={settledHash}
            />
          </div>
          {dock}
        </div>
      </div>
    );
  }

  // `decide` — 남길 것이 있다. 좌: 무엇이 바뀌었고 무엇을 남길까 / 우: 그 증거.
  // 증거 열 최소 폭이 `--git-evidence-min`(600px)인 이유: 11px mono 80칼럼
  // ≈ 528px + gutter + padding. 시안 v1 의 420px 는 모든 줄을 잘랐고 **잘린
  // diff 는 증거가 아니다**. `lg` 미만은 세로로 쌓인다(증거가 목록 아래).
  const showEvidence = diffFiles.length > 0 || history.length > 0;

  return (
    <div
      data-testid="atlas-git-workbench"
      data-shape="decide"
      className="git-fade-in flex min-h-0 flex-1 flex-col gap-4"
    >
      <PageHeader t={t} inColumn showScope={false} trailing={locationLine} />

      {/* 작업면 — **경계가 있는 하나의 표면**.
          여백 자체는 없앨 수 없다(14개가 바뀐 날의 목록은 뷰포트보다 짧다).
          없앨 수 있는 건 그 여백이 **무엇으로 읽히는가** 다: 경계 없는 캔버스
          위에서 목록이 끊기면 "페이지가 거기서 끝났다" 로 읽히고, 경계 안에서
          끊기면 "이 목록이 아직 안 찼다" 로 읽힌다. 잉크는 1px 보더 + 한 단
          올린 surface 뿐이고, 표면은 라우트당 **하나**다(균일한 카드 나열이
          아니라 작업면 하나 — 안의 위계는 헤더/목록/도크가 진다). */}
      <div
        className={cn(
          // 높이는 `min(내용, 남은 공간)`. flex 자식의 기본값(`0 1 auto`) +
          // `min-h-0` 이 그대로 그 뜻이다 — 내용만큼만 자라고, 뷰포트를 넘으면
          // 줄어들며 안에서 스크롤한다. `flex-1` 로 늘려 두면 짧은 목록일 때
          // 표면 안에 아무도 고르지 않은 500px 빈 칸이 생긴다.
          "grid min-h-0 grid-cols-1 gap-5 rounded-[var(--radius-panel)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4 xl:my-auto xl:grid-rows-[minmax(0,1fr)]",
          showEvidence
            ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,var(--git-evidence-min))]"
            : // 증거 열이 없으면 전폭을 쓰지 않는다 — 한 줄짜리 목록을 1216px
              // 상자에 담으면 상자가 내용보다 커진다.
              "mx-auto w-full max-w-[var(--git-single-measure)]",
        )}
      >
        <div className="flex min-w-0 flex-col gap-3 xl:min-h-0">
          {remotePanel}
          <ChangeList
            t={t}
            kindGroups={kindGroups}
            otherChanges={otherChanges}
            statusCounts={statusCounts}
            deltaByPath={deltaByPath}
            selectedPath={selectedPath}
            setSelectedPath={setSelectedPath}
            othersOpen={othersOpen}
            setOthersOpen={setOthersOpen}
            stagedOutsideCount={status?.stagedOutsideVault.length ?? 0}
          />
          {dock}
        </div>

        {showEvidence ? (
          <div
            data-testid="atlas-git-evidence"
            className="flex min-w-0 flex-col gap-2 xl:min-h-0 xl:border-l xl:border-[color:var(--color-divider)] xl:pl-5"
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className="flex items-center gap-1.5">
                <EvidenceTab
                  active={evidenceTab === "diff"}
                  testId="atlas-git-diff-toggle"
                  onClick={() => setEvidenceTab("diff")}
                >
                  {t("diffTab")}
                </EvidenceTab>
                <EvidenceTab
                  active={evidenceTab === "history"}
                  testId="atlas-git-history-tab"
                  onClick={() => setEvidenceTab("history")}
                >
                  {t("stepsTab")}
                </EvidenceTab>
              </div>
              {/* 무엇의 증거인지 — 고른 것이 없으면 "전체" 라고 말한다. */}
              {evidenceTab === "diff" ? (
                <span className="min-w-0 truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                  {selectedPath ?? t("diffAllLabel")}
                </span>
              ) : null}
            </div>

            {evidenceTab === "diff" ? (
              shownDiffFiles.length > 0 ? (
                <DiffView
                  t={t}
                  files={shownDiffFiles}
                  showFileHeads={!selectedPath && shownDiffFiles.length > 1}
                />
              ) : (
                <p className="git-fade-in text-label leading-relaxed text-[color:var(--color-text-quaternary)]">
                  {t("diffEmpty")}
                </p>
              )
            ) : (
              <div className="git-fade-in overflow-y-auto max-xl:max-h-[var(--git-evidence-stack-max)] xl:min-h-0 xl:flex-1">
                <StepList
                  t={t}
                  history={history}
                  concepts={concepts}
                  egoFor={egoFor}
                  kindLabel={kindLabel}
                  focusedConceptId={focusedConceptId}
                  setFocusedConceptId={setFocusedConceptId}
                  expandedHash={expandedHash}
                  setExpandedHash={setExpandedHash}
                  settledHash={settledHash}
                />
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
