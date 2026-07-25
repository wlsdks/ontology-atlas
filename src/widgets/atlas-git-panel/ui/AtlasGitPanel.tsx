"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
// `History as HistoryIcon` — 사용성 검수 P0 (2026-07-23): 특정 HMR/번들 상태에서
// bare `History` 식별자가 전역 DOM History 생성자로 해석돼 `<History>` JSX 가
// "Illegal constructor" 로 화면 전체를 에러 바운더리로 추락시켰다(스택 확보,
// 간헐). 전역과 절대 충돌하지 않는 별칭으로 원천 차단.
import { Check, Copy, History as HistoryIcon, Monitor, ShieldCheck } from "lucide-react";
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
 * Atlas Git — 스냅샷/발자취 패널 (웹 GUI 첫 진입점).
 *
 * 데스크톱(Tauri): `src-tauri/src/git.rs` 7 command 를 `tauri-git.ts` 브리지로
 * 소비한다 — ① vault 변경 요약(kind별 A/M/D + 대표 슬러그, CLI
 * `buildChangeSummary` 와 같은 산식) ② 남기기(명시 클릭 → 확인 스텝 →
 * `git_snapshot`; 보내기는 별도 opt-in 체크박스, 기본 off) ③ 최근 발자취
 * ④ 아직 남기지 않은 변경의 바뀐 줄 ⑤ 기록 시작(`git_init`) ⑥ 보낼 곳
 * 등록(`git_set_remote`).
 *
 * 웹(브라우저 vault): 브라우저는 프로세스를 띄울 수 없으므로 정직하게 강등 —
 * 세션 changeset 요약 + `ontology-atlas snapshot` 명령 복사 + 앱 안내.
 * 이건 고칠 수 있는 결함이 아니라 표면의 성질이다.
 *
 * 신뢰 헌장 준수: **쓰기 명령은 사용자 클릭 뒤에만** 일어난다 — 마운트 시
 * 조회는 읽기 전용(status/diff/history)뿐이고, `git_init`/`git_set_remote`/
 * `git_snapshot` 은 각각의 버튼 onClick 에서만 호출된다(테스트가 이 계약을
 * 고정한다).
 *
 * 2026-07-25 — 구 dead-end 제거: "Atlas 는 자동으로 git init 하지 않아요,
 * 터미널에서 직접 실행하세요" 로 끝나 사용자가 앱을 떠나야 했다. 헌장이
 * 금지한 건 *자동* 실행이지 사용자가 누르는 버튼이 아니다. 지금은 같은 자리에
 * 동작하는 "기록 시작하기" 가 있고, 무엇이 만들어지는지(.git)와 되돌리는
 * 방법을 누르기 전에 말한다. 자동 실행은 여전히 0.
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

const noopSubscribe = () => () => {};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
      {children}
    </span>
  );
}

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

  /** 증거 pane 탭 — 바뀐 줄 / 최근 기록. 목록 좌 · 증거 우(#85). */
  const [evidenceTab, setEvidenceTab] = useState<"diff" | "history">("diff");
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

  const confirmSnapshot = useCallback(async () => {
    if (!vaultPath) return;
    setSnapshotting(true);
    setSnapshotError(null);
    try {
      const result = await gitSnapshot(vaultPath, { push: pushOptIn });
      setSnapshotResult(result);
      setConfirming(false);
      setPushOptIn(false);
      setEvidenceTab("diff");
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
      // 시트 골격은 호스트(HomePage 의 scrim+카드 셸)가 소유한다 — 여기서
      // 보더/배경을 또 얹으면 이중 카드가 된다(소유자 실보고 2026-07-23
      // "보기 안 좋고"). AgentConnectSheet 와 같은 역할 분담: 패널은 내용만.
      className={cn("flex w-full flex-col", className)}
    >
      {/* 페이지 헤더 (2026-07-25 목적지 승격 후속). 모달이 삭제되면서 이 패널의
          유일한 소비자가 `/git/` 목적지가 됐는데, 헤더는 여전히 모달 문법
          (11px 인디고 mono eyebrow + 닫기 X)이었다 — 페이지 제목으로는 너무
          작고, 목적지에는 "닫기" 라는 개념이 없다(레일로 다른 곳에 가면 그게
          나가기다). 램프 한 단이 아니라 **목적지 헤드라인**(`--text-display`)
          으로 올린다. */}
      <header className="flex shrink-0 flex-col gap-1.5 border-b border-[color:var(--color-border-soft)] px-5 pb-4 pt-1">
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

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
      {desktop ? (
        <DesktopBody
          t={t}
          loadState={loadState}
          loadErrorText={loadErrorText}
          status={status}
          kindGroups={kindGroups}
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
          evidenceTab={evidenceTab}
          setEvidenceTab={setEvidenceTab}
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
      ) : (
        <WebBody
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
        <div className="flex flex-col gap-0.5" data-testid="atlas-git-remote-error">
          <p className="text-label text-[color:var(--color-danger-text)]">{remoteError}</p>
          {/* 실패해도 데이터가 안전함을 매번 말한다. */}
          <p className="text-caption text-[color:var(--color-text-quaternary)]">
            {t("remoteFailedSafe")}
          </p>
        </div>
      ) : null}
      {remoteNotice ? (
        <p
          className="text-label text-[color:var(--color-text-secondary)]"
          data-testid="atlas-git-remote-notice"
        >
          {remoteNotice}
        </p>
      ) : null}
      <p className="text-caption text-[color:var(--color-text-quaternary)]">{t("remoteHelp")}</p>
    </div>
  );
}

function DesktopBody({
  t,
  loadState,
  loadErrorText,
  status,
  kindGroups,
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
  loadState: "loading" | "ready" | "error";
  loadErrorText: string | null;
  status: GitStatusResult | null;
  kindGroups: ReturnType<typeof groupChangesByKind>;
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
  if (loadState === "loading" && !status) {
    return <p className="text-label text-[color:var(--color-text-tertiary)]">{t("loading")}</p>;
  }
  if (loadState === "error") {
    return (
      <p className="text-label text-[color:var(--color-text-secondary)]" data-testid="atlas-git-load-error">
        {t("loadError")}
        {loadErrorText ? ` — ${loadErrorText}` : null}
      </p>
    );
  }
  if (status && !status.initialized) {
    // S1 — 소유자가 막혔던 dead-end 를 여는 화면 (2026-07-25).
    //
    // 이전 코드는 "Atlas 는 자동으로 git init 하지 않아요 — 터미널에서 직접
    // 실행하세요" 로 끝났고, 누를 것이 없어 사용자는 앱을 떠나야 했다. 헌장이
    // 금지한 건 **자동** 실행이지, 사용자가 자기가 고른 폴더에서 버튼을 누르는
    // 것이 아니다(소유자 결정 + Guardian 판정). 자동 실행은 여전히 0 —
    // `onInit` 은 이 버튼의 onClick 에서만 호출되고, init 은 커밋으로 연쇄하지
    // 않는다(빈 저장소 → "아직 남기지 않은 변경 N건" 상태로 착지).
    return (
      <div className="flex flex-col gap-3" data-testid="atlas-git-not-initialized">
        <div className="flex flex-col gap-2">
          <p className="text-body-lg font-semibold text-[color:var(--color-text-primary)]">
            {t("notInitialized")}
          </p>
          <p className="text-body leading-relaxed text-[color:var(--color-text-secondary)]">
            {t("notInitializedHint")}
          </p>
          {/* 무엇이 만들어지는지 **누르기 전에** 말한다. */}
          <p className="text-body leading-relaxed text-[color:var(--color-text-tertiary)]">
            {t("initWhatHappens")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="atlas-git-init"
            disabled={initRunning}
            onClick={onInit}
            className="rounded-[var(--chrome-radius-inner)] bg-[color:var(--color-indigo-brand)] px-3.5 py-2 text-label font-semibold text-white transition-colors hover:bg-[color:var(--color-indigo-hover)] disabled:opacity-60"
          >
            {initRunning ? t("initRunning") : t("initButton")}
          </button>
          <button
            type="button"
            data-testid="atlas-git-init-copy"
            title={t("initTerminalHint")}
            onClick={onCopyInitCommand}
            className="rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] px-3 py-2 text-label text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
          >
            {initCopied ? t("webCopied") : t("initTerminalButton")}
          </button>
        </div>

        {initError ? (
          <p
            className="text-label text-[color:var(--color-danger-text)]"
            data-testid="atlas-git-init-error"
          >
            {initError}
          </p>
        ) : null}

        {/* 되돌리는 방법을 **같은 화면에** — 처음 겪는 사용자가 가장 겁내는 지점. */}
        <p className="border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
          {t("initEscape")}
        </p>
      </div>
    );
  }

  return (
    // 2열 (#85) — 좌: 무엇이 바뀌었고 무엇을 남길까 / 우: 그 증거.
    // `lg` 미만은 세로로 쌓인다(증거가 목록 아래). 증거 열 최소 폭이 **600px**
    // 인 이유: 11px mono 80칼럼 ≈ 528px + gutter + padding. 시안 v1 의 420px 는
    // 모든 줄을 잘랐고 **잘린 diff 는 증거가 아니다**.
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)]">
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

      {/* S4 — 보낼 곳이 없으면 실패 지점이 아니라 **여기서** 해결한다.
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
          <p className="text-label text-[color:var(--color-text-tertiary)]">{t("noChanges")}</p>
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
            className="flex flex-col gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3"
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
              {status?.upstream ? t("pushOptInHint") : t("pushNoUpstream")}
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
            {hasChanges ? t("snapshotButton") : t("noChanges")}
          </button>
        )}
        {snapshotError ? (
          <p className="text-caption text-[color:var(--color-text-secondary)]" data-testid="atlas-git-snapshot-error">
            {snapshotError}
          </p>
        ) : null}
        {snapshotResult ? (
          <p className="text-caption text-[color:var(--color-text-tertiary)]" data-testid="atlas-git-snapshot-result">
            {snapshotResult.committed
              ? t("snapshotDone", { subject: snapshotResult.subject ?? "" })
              : t("snapshotNoChanges")}
            {snapshotResult.push
              ? ` · ${snapshotResult.push.pushed ? t("pushDone") : t("pushFailed")}`
              : null}
          </p>
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
            <p className="text-label text-[color:var(--color-text-tertiary)]">{t("historyEmpty")}</p>
          )}
        </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WebBody({
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
    <div className="flex flex-col gap-5" data-testid="atlas-git-web-body">
      {/* 세션 변경 — AgentConnectSheet 상태 블록 문법(라벨 + 표면 카드 +
          상태 점). 이전엔 라벨("이 세션에서 감지된 변경")과 빈 상태 문장
          ("...감지된 변경이 없어요")이 사실상 중복이었다(소유자 실보고
          Image #16) — 카드 안 문장은 라벨을 반복하지 않는 짧은 상태로. */}
      <section aria-label={t("webSummaryTitle")} className="flex flex-col gap-1.5">
        <SectionLabel>{t("webSummaryTitle")}</SectionLabel>
        <div className="flex items-center gap-2.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor:
                rows.length > 0 ? "var(--color-status-warning)" : "var(--color-text-quaternary)",
            }}
          />
          {rows.length > 0 ? (
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
              {rows.map(([key, count]) => (
                <li key={key} className="text-body text-[color:var(--color-text-secondary)]">
                  {t(key, { count })}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-[color:var(--color-text-tertiary)]">{t("webNoChanges")}</p>
          )}
        </div>
      </section>

      {/* CLI 인계 — FirstRunStarter cli-bridge 행 문법(설명 + code + 복사
          버튼을 한 카드로 묶음). 코드/버튼 크기 한 단 승격. */}
      {/* `webCommandHint`("누르면 …복사돼요")는 **버튼 툴팁** 문구다 — 박스 위
          라벨 자리에 쓰면 버튼이 아닌 것을 누르라고 말하는 꼴이 된다. 보이는
          라벨은 `webCommandLabel`, 툴팁은 복사 버튼에만. */}
      <section aria-label={t("webCommandLabel")} className="flex flex-col gap-1.5">
        <p className="text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
          {t("webCommandLabel")}
        </p>
        <div className="flex items-center justify-between gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2">
          <code className="min-w-0 truncate font-mono text-body text-[color:var(--color-text-secondary)]">
            {SNAPSHOT_CLI_COMMAND}
          </code>
          <button
            type="button"
            data-testid="atlas-git-web-copy"
            title={t("webCommandHint")}
            onClick={copyCliCommand}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]"
          >
            {commandCopied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
            {commandCopied ? t("webCopied") : t("webCopyCommand")}
          </button>
        </div>
        <p className="flex items-center gap-1.5 text-label text-[color:var(--color-text-quaternary)]">
          <Monitor size={11} aria-hidden className="shrink-0" />
          {t("webDesktopHint")}
        </p>
        {/* 문제를 실제로 해결하는 동작 — 설명만 하고 갈 곳을 안 주면 여전히
            dead-end 다(이 웨이브가 고치고 있는 결함과 같은 종류). */}
        <Link
          href="/download"
          data-testid="atlas-git-web-get-app"
          className="self-start text-label text-[color:var(--color-indigo-accent)] underline-offset-2 transition-colors hover:underline"
        >
          {t("webGetApp")} →
        </Link>
      </section>
    </div>
  );
}
