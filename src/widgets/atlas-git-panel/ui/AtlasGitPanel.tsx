"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
// `History as HistoryIcon` — 사용성 검수 P0 (2026-07-23): 특정 HMR/번들 상태에서
// bare `History` 식별자가 전역 DOM History 생성자로 해석돼 `<History>` JSX 가
// "Illegal constructor" 로 화면 전체를 에러 바운더리로 추락시켰다(스택 확보,
// 간헐). 전역과 절대 충돌하지 않는 별칭으로 원천 차단.
import {
  Check,
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
  formatSnapshotSummary,
  groupChangesByKind,
} from "@/shared/lib/atlas-git-changes";
import {
  gitDiff,
  gitErrorMessage,
  gitHistory,
  gitInit,
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
import { cn } from "@/shared/lib/cn";

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
 * - **할 수 있다 → 작업대 모드.** 기존 2열(좌: 무엇을 남길까 / 우: 그 증거).
 *   상단 정렬 + 전폭이 맞다 — 여기서는 내용이 화면을 채운다.
 *
 * 어텐션 승자가 상태에 따라 바뀌는 것이 **의도**다. 셋업에서는 사용자의 일이
 * "연결"이고 작업대에서는 "무엇을 남길까"라서, 두 순간의 승자가 같을 수 없다.
 * (Toss 공개 발표 — 한 화면에 한 가지 / Apple HIG — clarity·hierarchy.)
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
  className?: string;
}

const SNAPSHOT_CLI_COMMAND = "ontology-atlas snapshot";
/** S1 보조 탈출구 — 터미널에서 직접 하려는 사용자용. git 용어는 여기서만 노출. */
const INIT_CLI_COMMAND = "git init";
const MAX_GROUP_SLUGS = 3;

/**
 * 셋업 모드의 주 동작 — 이 화면이 사용자에게 시키는 **단 하나**의 일.
 *
 * 높이는 `--git-setup-action-height` (데스크톱 36px = 고정 스케일 계약의 크롬
 * 타일과 같은 단, coarse 포인터에서 44px 로 승격). 램프는 `text-body`(12.5px)
 * — 구 11px 링크/버튼은 페이지 주 동작으로 읽히지 않았다(소유자 실측: 웹
 * 강등에서 유일한 진짜 다음 걸음이 복사 버튼보다 작았다).
 */
const PRIMARY_ACTION_CLASS =
  "inline-flex h-[var(--git-setup-action-height)] shrink-0 items-center justify-center gap-1.5 rounded-[var(--chrome-radius-inner)] bg-[color:var(--color-indigo-brand)] px-4 text-body font-semibold text-white transition-colors hover:bg-[color:var(--color-indigo-hover)] disabled:opacity-60";

/** 셋업 모드의 보조 탈출구 — 있지만 주 동작과 경쟁하지 않는 무게. */
const SECONDARY_ACTION_CLASS =
  "inline-flex h-[var(--git-setup-action-height)] shrink-0 items-center justify-center gap-1.5 rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] px-3.5 text-body text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]";

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
type GitStage = "web" | "no-vault" | "loading" | "error" | "not-initialized" | "workbench";

type SetupStep = 1 | 2 | 3;

export function AtlasGitPanel({
  vaultPath = null,
  sessionChangeset = null,
  className,
}: AtlasGitPanelProps) {
  const t = useTranslations("atlasGit");

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
  const [loadErrorText, setLoadErrorText] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [pushOptIn, setPushOptIn] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [snapshotResult, setSnapshotResult] = useState<GitSnapshotResult | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  /**
   * 증거 pane 탭 — 바뀐 줄 / 최근 기록. 목록 좌 · 증거 우(#85).
   *
   * `null` = **아직 사용자가 고르지 않음**. 이때 탭은 상태를 따라간다: 남기지
   * 않은 변경이 있으면 `바뀐 줄`(#85 계약), 다 남겼으면 `최근 기록`. S4("모두
   * 남겼어요")에서 우측 열이 "왼쪽에서 문서를 고르면…" 한 줄만 띄운 채 비어
   * 있던 것이 이 페이지 여백 체감의 절반이었다 — 그 순간 사용자가 보고 싶은
   * 건 방금 남긴 걸음이다.
   */
  const [evidenceTabChoice, setEvidenceTabChoice] = useState<"diff" | "history" | null>(null);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [commandCopied, setCommandCopied] = useState(false);

  // S1 (기록 시작) · S4 (보낼 곳 등록) 상태.
  const [initRunning, setInitRunning] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [initCopied, setInitCopied] = useState(false);
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

  const kindGroups = useMemo(() => groupChangesByKind(changes), [changes]);
  const predictedSubject = useMemo(() => formatSnapshotSummary(changes), [changes]);
  const hasChanges = changes.length > 0;
  const evidenceTab = evidenceTabChoice ?? (hasChanges ? "diff" : "history");

  const stage: GitStage = !bridgeAvailable
    ? "web"
    : !vaultPath
      ? "no-vault"
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
      // 사용자의 명시 선택을 지운다 — 남긴 직후 우측 증거 pane 이 "방금 남긴
      // 걸음"으로 자동 착지하게(변경이 남아 있으면 계속 `바뀐 줄`).
      setEvidenceTabChoice(null);
      await refresh();
    } catch (err) {
      setSnapshotError(gitErrorMessage(err));
    } finally {
      setSnapshotting(false);
    }
  }, [vaultPath, pushOptIn, refresh]);

  const copyCliCommand = useCallback(async () => {
    if (await copyText(SNAPSHOT_CLI_COMMAND)) {
      setCommandCopied(true);
      window.setTimeout(() => setCommandCopied(false), 1600);
    }
  }, []);

  const copyInitCommand = useCallback(async () => {
    if (await copyText(INIT_CLI_COMMAND)) {
      setInitCopied(true);
      window.setTimeout(() => setInitCopied(false), 1600);
    }
  }, []);

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
      {/* 작업대에서만 헤더가 페이지 상단에 고정된다 — 그 아래로 전폭 2열이
          이어지므로 전폭 구분선이 실제 표면 폭을 말한다.

          셋업에서는 헤더가 **과업 기둥 안으로 들어온다**. 이유: 1216px 짜리
          구분선 아래에 520px 짜리 내용이 놓이면 선이 약속한 폭과 내용이 주는
          폭이 어긋나 "나머지가 안 그려진 화면" 으로 읽힌다(소유자가 본 그
          위화감의 절반이 이것이다). 목적지 정체성은 레일의 활성 항목 + 기둥
          맨 위의 h1 이 그대로 진다. */}
      {stage !== "workbench" ? null : <PageHeader t={t} />}

      {/* 스크롤 프레임. 셋업 모드의 단일 기둥은 `m-auto` 로 이 프레임 정중앙에
          선다 — `justify-center` 대신 auto margin 인 이유: 내용이 프레임보다
          길어지면 auto margin 이 0 으로 접혀 위쪽이 잘리지 않는다. */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto px-5",
          stage === "workbench" ? "gap-5 py-5" : "py-6",
        )}
      >
        {stage === "workbench" || stage === "not-initialized" || stage === "loading" || stage === "error" ? (
          <DesktopBody
            key={stage}
            t={t}
            stage={stage}
            loadErrorText={loadErrorText}
            status={status}
            kindGroups={kindGroups}
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
            diffText={diffText}
            history={history}
            expandedHash={expandedHash}
            setExpandedHash={setExpandedHash}
            initRunning={initRunning}
            initError={initError}
            initCopied={initCopied}
            onInit={startTracking}
            onCopyInitCommand={copyInitCommand}
            remoteUrl={remoteUrl}
            setRemoteUrl={setRemoteUrl}
            remoteRunning={remoteRunning}
            remoteError={remoteError}
            remoteNotice={remoteNotice}
            onSetRemote={submitRemote}
          />
        ) : stage === "no-vault" ? (
          <NoVaultSetup key={stage} t={t} />
        ) : (
          <WebSetup
            key={stage}
            t={t}
            sessionChangeset={sessionChangeset}
            commandCopied={commandCopied}
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
 * `inColumn` = 셋업 기둥 안에 놓인 형태. 전폭 구분선을 떼고 좌우 패딩을
 * 기둥에 맡긴다 — 선의 폭과 내용의 폭이 어긋나지 않게.
 */
function PageHeader({ t, inColumn = false }: { t: Translator; inColumn?: boolean }) {
  return (
    <header
      className={cn(
        "flex shrink-0 flex-col gap-1.5",
        inColumn
          ? "pb-1"
          : "border-b border-[color:var(--color-border-soft)] px-5 pb-4 pt-1",
      )}
    >
      <h1 className="flex items-center gap-2 text-title font-semibold tracking-[-0.005em] text-[color:var(--color-text-primary)] sm:text-[length:var(--text-display)]">
        <HistoryIcon size={18} aria-hidden className="text-[color:var(--color-indigo-accent)]" />
        {t("title")}
      </h1>
      {/* 구 `subtitle`("vault 의 변경을 git 스냅샷으로 남깁니다")은 12글자에
          시스템 용어가 3개(vault·git·스냅샷)라 삭제했다. 그 자리를 스코프
          고지가 대신한다 — 사용자가 두 번째로 확인해야 하는 건 제품 설명이
          아니라 "내 폴더 밖은 안 건드린다" 다. */}
      <p className="flex items-center gap-1.5 text-label leading-relaxed text-[color:var(--color-text-quaternary)]">
        <ShieldCheck size={11} aria-hidden className="shrink-0" />
        {t("scopeNotice")}
      </p>
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
              <span aria-hidden className="pr-1 text-label text-[color:var(--color-text-quaternary)]">
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
 * 전역으로 무력화한다.
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
      className="topology-chrome-in m-auto flex w-full max-w-[var(--git-setup-measure)] flex-col gap-4"
    >
      {/* 헤더가 기둥의 첫 줄이다 — 셋업에서 이 화면은 "발자취 대시보드" 가
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
  commandCopied,
  copyCliCommand,
}: {
  t: Translator;
  sessionChangeset: OntologyChangeset | null;
  commandCopied: boolean;
  copyCliCommand: () => void;
}) {
  const rows = sessionChangeset
    ? ([
        ["webNodesAdded", sessionChangeset.addedNodes.length],
        ["webNodesChanged", sessionChangeset.changedNodes.length],
        ["webNodesRemoved", sessionChangeset.removedNodes.length],
        ["webEdgesAdded", sessionChangeset.addedEdges.length],
        ["webEdgesRemoved", sessionChangeset.removedEdges.length],
      ] as const).filter(([, count]) => count > 0)
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
            {commandCopied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
            {commandCopied ? t("webCopied") : t("webCopyCommand")}
          </button>
        </div>
      </div>
    </SetupFrame>
  );
}

/**
 * S1 — 앱은 열렸는데 폴더가 없다.
 *
 * 이전엔 이 상태가 웹 강등 화면으로 떨어졌다: 데스크톱 앱 안에서 "브라우저는
 * git 을 실행할 권한이 없어요 / 앱 받기 →" 를 보여줬다는 뜻이다 — 이미 앱을
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
 * S4 — 보낼 곳(원격) 등록. **실패 지점에서 바로 해결한다**: 이전엔 push 가
 * "upstream 없어 전송 불가" 로 끝나 사용자가 무엇을 해야 할지 몰랐다.
 *
 * 주소는 사용자가 입력한 것만 쓴다 — 우리가 제안·추측·자동탐지하지 않는다
 * (신뢰 헌장). 등록은 전송이 아니다: 여기서는 주소만 저장하고, 보내기는
 * 사용자가 스냅샷 화면에서 따로 눌러야 한다.
 *
 * 이건 연결 사다리의 걸음이 **아니다** — 선택이고, 이 컴퓨터에만 쌓는 것도
 * 정당한 종착지다. 그래서 작업대 안의 보조 카드로 산다.
 *
 * amber 는 이 표면에서 뱃지가 독점하므로 여기서는 좌측 보더에만 warning
 * 알파 사다리를 쓴다(중립 surface + 알파 보더 — 새 채색 0).
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
      className="flex flex-col gap-2 rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-divider)] border-l-2 border-l-[color:var(--color-amber-source-a30)] bg-[color:var(--color-overlay-1)] p-3"
    >
      <p className="text-label font-semibold text-[color:var(--color-text-primary)]">
        {t("noUpstream")}
      </p>
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
          className="min-w-[220px] flex-1 rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-canvas)] px-2.5 py-1.5 font-mono text-label text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)]"
        />
        <button
          type="button"
          data-testid="atlas-git-remote-submit"
          disabled={remoteRunning || remoteUrl.trim() === ""}
          onClick={onSubmit}
          className="rounded-[var(--chrome-radius-inner)] bg-[color:var(--color-indigo-brand)] px-3 py-1.5 text-label font-semibold text-white transition-colors hover:bg-[color:var(--color-indigo-hover)] disabled:opacity-50"
        >
          {remoteRunning ? t("remoteRunning") : t("remoteSubmit")}
        </button>
      </div>
      {remoteError ? (
        <div className="topology-chrome-in flex flex-col gap-0.5" data-testid="atlas-git-remote-error">
          <p className="text-label text-[color:var(--color-danger-text)]">{remoteError}</p>
          {/* 실패해도 데이터가 안전함을 매번 말한다. */}
          <p className="text-caption text-[color:var(--color-text-quaternary)]">
            {t("remoteFailedSafe")}
          </p>
        </div>
      ) : null}
      {remoteNotice ? (
        <p
          className="topology-chrome-in text-label text-[color:var(--color-text-secondary)]"
          data-testid="atlas-git-remote-notice"
        >
          {remoteNotice}
        </p>
      ) : null}
      <p className="text-caption text-[color:var(--color-text-quaternary)]">{t("remoteHelp")}</p>
    </div>
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
      className="topology-chrome-in text-caption text-[color:var(--color-text-tertiary)]"
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

function DesktopBody({
  t,
  stage,
  loadErrorText,
  status,
  kindGroups,
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
  diffText,
  history,
  expandedHash,
  setExpandedHash,
  initRunning,
  initError,
  initCopied,
  onInit,
  onCopyInitCommand,
  remoteUrl,
  setRemoteUrl,
  remoteRunning,
  remoteError,
  remoteNotice,
  onSetRemote,
}: {
  t: Translator;
  stage: Extract<GitStage, "loading" | "error" | "not-initialized" | "workbench">;
  loadErrorText: string | null;
  status: GitStatusResult | null;
  kindGroups: ReturnType<typeof groupChangesByKind>;
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
  diffText: string;
  history: GitCommitInfo[];
  expandedHash: string | null;
  setExpandedHash: (v: string | null) => void;
  initRunning: boolean;
  initError: string | null;
  initCopied: boolean;
  onInit: () => void;
  onCopyInitCommand: () => void;
  remoteUrl: string;
  setRemoteUrl: (v: string) => void;
  remoteRunning: boolean;
  remoteError: string | null;
  remoteNotice: string | null;
  onSetRemote: () => void;
}) {
  if (stage === "loading") {
    return (
      <SetupFrame t={t} step={null} state="loading">
        <p className="text-body text-[color:var(--color-text-tertiary)]">{t("loading")}</p>
      </SetupFrame>
    );
  }
  if (stage === "error") {
    // 오류도 막다른 길이 아니어야 한다 — 폴더가 되돌아왔을 때 사용자가 앱을
    // 떠나지 않고 다시 확인할 수 있는 버튼을 같은 자리에 둔다.
    return (
      <SetupFrame t={t} step={null} state="error">
        <div className="flex flex-col gap-3" data-testid="atlas-git-load-error">
          <SetupHeading
            title={t("loadError")}
            body={loadErrorText ?? undefined}
          />
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
              {initCopied ? t("webCopied") : t("initTerminalButton")}
            </button>
          </div>

          {initError ? (
            <p
              className="topology-chrome-in text-label text-[color:var(--color-danger-text)]"
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

  return (
    // 작업대 — 여기서부터 이 화면은 자기 일을 할 수 있다. 2열 (#85) —
    // 좌: 무엇이 바뀌었고 무엇을 남길까 / 우: 그 증거.
    // `lg` 미만은 세로로 쌓인다(증거가 목록 아래). 증거 열 최소 폭이 **600px**
    // 인 이유: 11px mono 80칼럼 ≈ 528px + gutter + padding. 시안 v1 의 420px 는
    // 모든 줄을 잘랐고 **잘린 diff 는 증거가 아니다**.
    <div
      data-testid="atlas-git-workbench"
      className="topology-chrome-in grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)]"
    >
      <div className="flex min-w-0 flex-col gap-4">
      {status?.branch ? (
        <p
          className="text-caption text-[color:var(--color-text-quaternary)]"
          title={
            status.upstream
              ? t("locationChipHint", { branch: status.branch, upstream: status.upstream })
              : undefined
          }
        >
          {/* 브랜치·원격 이름은 사용자가 정한 고유명사라 번역하지 않는다 —
              터미널·저장소 페이지에서 그대로 다시 마주치는 문자열이다.
              구 `branchLabel`("브랜치") 라벨은 삭제: `main → origin/main` 이
              이미 무엇인지 말한다. */}
          <span className="font-mono text-[color:var(--color-text-tertiary)]">
            {status.upstream
              ? t("locationChip", { branch: status.branch, upstream: status.upstream })
              : status.branch}
          </span>
          {status.upstream ? null : <> · {t("noUpstream")}</>}
        </p>
      ) : null}

      {/* S3 — 보낼 곳이 없으면 실패 지점이 아니라 **여기서** 해결한다.
          이전엔 push 가 "upstream 없어 전송 불가" 로 끝나 사용자가 뭘 해야
          하는지 몰랐다. 주소는 사용자가 입력한 것만 쓴다(제안·추측 0). */}
      {status?.initialized && !status.upstream ? (
        <RemoteSetup
          t={t}
          remoteUrl={remoteUrl}
          setRemoteUrl={setRemoteUrl}
          remoteRunning={remoteRunning}
          remoteError={remoteError}
          remoteNotice={remoteNotice}
          onSubmit={onSetRemote}
        />
      ) : null}

      <div className="flex flex-col gap-2">
        <SectionLabel>{t("changesTitle")}</SectionLabel>
        {hasChanges ? (
          <ul className="flex flex-col gap-1.5" data-testid="atlas-git-change-groups">
            {kindGroups.map((group) => {
              const shownSlugs = group.slugs.slice(0, MAX_GROUP_SLUGS);
              const overflow = group.slugs.length - shownSlugs.length;
              const countParts = [
                group.counts.added > 0 ? t("statusAdded", { count: group.counts.added }) : null,
                group.counts.modified > 0
                  ? t("statusModified", { count: group.counts.modified })
                  : null,
                group.counts.deleted > 0
                  ? t("statusDeleted", { count: group.counts.deleted })
                  : null,
                group.counts.renamed > 0
                  ? t("statusRenamed", { count: group.counts.renamed })
                  : null,
              ].filter(Boolean);
              return (
                <li key={group.kind ?? "__other"} className="flex flex-col gap-0.5">
                  <span className="text-label text-[color:var(--color-text-secondary)]">
                    <span className="font-medium text-[color:var(--color-text-primary)]">
                      {group.kind ?? t("kindOther")}
                    </span>
                    {" · "}
                    {countParts.join(" · ")}
                  </span>
                  <span className="font-mono text-caption text-[color:var(--color-text-quaternary)]">
                    {shownSlugs.join(", ")}
                    {overflow > 0 ? ` · ${t("moreSlugs", { count: overflow })}` : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          // 버튼이 이미 `모두 남겼어요` 라고 말한다 — 같은 문장을 목록 자리에
          // 또 쓰면 무라벨 중복이다. 여기는 "그래서 지금 무슨 상태냐" 를 말하는
          // 힌트 문장을 쓴다.
          <p className="text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
            {t("noChangesHint")}
          </p>
        )}
        {status && status.stagedOutsideVault.length > 0 ? (
          <p className="text-caption text-[color:var(--color-text-quaternary)]">
            {t("stagedOutsideNotice", { count: status.stagedOutsideVault.length })}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        {confirming ? (
          <div
            className="topology-chrome-in flex flex-col gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3"
            data-testid="atlas-git-confirm-step"
          >
            <p className="text-caption text-[color:var(--color-text-tertiary)]">
              {t("confirmBody")}
            </p>
            <p className="font-mono text-label text-[color:var(--color-text-primary)]">
              {predictedSubject}
            </p>
            <label className="flex items-center gap-2 text-label text-[color:var(--color-text-secondary)]">
              <input
                type="checkbox"
                data-testid="atlas-git-push-optin"
                checked={pushOptIn}
                disabled={!status?.upstream}
                onChange={(event) => setPushOptIn(event.target.checked)}
                className="accent-[var(--color-indigo-accent)]"
              />
              {t("pushOptIn")}
            </label>
            <p className="text-caption text-[color:var(--color-text-quaternary)]">
              {status?.upstream ? t("pushOptInHint", { upstream: status.upstream }) : t("pushNoUpstream")}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="atlas-git-confirm-button"
                disabled={snapshotting}
                onClick={confirmSnapshot}
                className="rounded-md bg-[color:var(--color-indigo-accent)] px-3 py-1.5 text-label font-medium text-white transition-colors hover:bg-[color:var(--color-indigo-hover)] disabled:opacity-50"
              >
                {snapshotting ? t("snapshotRunning") : t("confirmButton")}
              </button>
              <button
                type="button"
                data-testid="atlas-git-cancel-button"
                disabled={snapshotting}
                onClick={() => setConfirming(false)}
                className="rounded-md border border-[color:var(--color-border-soft)] px-3 py-1.5 text-label text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
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
            className="self-start rounded-md border border-[color:var(--color-border-soft)] px-3 py-1.5 text-label font-medium text-[color:var(--color-text-primary)] transition-colors enabled:hover:border-[color:var(--color-indigo-a46)] disabled:cursor-not-allowed disabled:text-[color:var(--color-text-quaternary)]"
          >
            {hasChanges ? t("snapshotButton", { count: changeCount }) : t("noChanges")}
          </button>
        )}
        {snapshotError ? (
          <p className="topology-chrome-in text-caption text-[color:var(--color-text-secondary)]" data-testid="atlas-git-snapshot-error">
            {snapshotError}
          </p>
        ) : null}
        {snapshotResult ? (
          <SnapshotResultLine t={t} result={snapshotResult} fallbackCount={changeCount} />
        ) : null}
      </div>

      </div>

      {/* 증거 pane — 고른 것의 근거. 탭 틀은 고정, 본문만 스크롤한다. */}
      <div
        data-testid="atlas-git-evidence"
        className="flex min-h-0 min-w-0 flex-col gap-2 lg:border-l lg:border-[color:var(--color-divider)] lg:pl-5"
      >
        <div className="flex shrink-0 items-center gap-1.5">
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
            {t("historyTitle")}
          </EvidenceTab>
        </div>

        {evidenceTab === "diff" ? (
          diffText.trim() ? (
            <pre
              data-testid="atlas-git-diff-pre"
              className="min-h-0 flex-1 overflow-auto rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2 font-mono text-label leading-relaxed text-[color:var(--color-text-secondary)]"
            >
              {diffText}
            </pre>
          ) : (
            <p className="text-label text-[color:var(--color-text-quaternary)]">
              {hasChanges ? t("diffEmpty") : t("evidenceEmpty")}
            </p>
          )
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2">
          <SectionLabel>{t("historyTitle")}</SectionLabel>
          {history.length > 0 ? (
            <ul className="flex flex-col">
              {history.map((commit) => (
                <li key={commit.hash}>
                  <button
                    type="button"
                    data-testid="atlas-git-history-item"
                    aria-expanded={expandedHash === commit.hash}
                    onClick={() =>
                      setExpandedHash(expandedHash === commit.hash ? null : commit.hash)
                    }
                    className="flex w-full items-baseline gap-2 rounded px-1 py-1 text-left transition-colors hover:bg-[color:var(--color-overlay-2)]"
                  >
                    <span className="shrink-0 font-mono text-caption text-[color:var(--color-text-quaternary)]">
                      {commit.shortHash}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-label text-[color:var(--color-text-secondary)]">
                      {commit.subject}
                    </span>
                    <span className="shrink-0 text-caption text-[color:var(--color-text-quaternary)]">
                      {commit.relativeTime}
                    </span>
                  </button>
                  {expandedHash === commit.hash ? (
                    <p
                      className="px-1 pb-1 font-mono text-caption text-[color:var(--color-text-quaternary)]"
                      data-testid="atlas-git-history-detail"
                    >
                      {t("historyItemDetail", { hash: commit.hash, isoTime: commit.isoTime })}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-label text-[color:var(--color-text-tertiary)]">
                {t("historyEmpty")}
              </p>
              <p className="text-caption leading-relaxed text-[color:var(--color-text-quaternary)]">
                {t("historyEmptyHint")}
              </p>
            </div>
          )}
        </div>
          </div>
        )}
      </div>
    </div>
  );
}
