"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
// `History as HistoryIcon` — 사용성 검수 P0 (2026-07-23): 특정 HMR/번들 상태에서
// bare `History` 식별자가 전역 DOM History 생성자로 해석돼 `<History>` JSX 가
// "Illegal constructor" 로 화면 전체를 에러 바운더리로 추락시켰다(스택 확보,
// 간헐). 전역과 절대 충돌하지 않는 별칭으로 원천 차단.
import { Check, Copy, History as HistoryIcon, Monitor, X } from "lucide-react";
import { copyText } from "@/shared/lib/copy-text";
import {
  formatSnapshotSummary,
  groupChangesByKind,
} from "@/shared/lib/atlas-git-changes";
import {
  gitDiff,
  gitErrorMessage,
  gitHistory,
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
 * 데스크톱(Tauri): `src-tauri/src/git.rs` 5 command 를 `tauri-git.ts` 브리지로
 * 소비한다 — ① vault 변경 요약(kind별 A/M/D + 대표 슬러그, CLI
 * `buildChangeSummary` 와 같은 산식) ② "스냅샷 남기기" (명시 클릭 → 확인
 * 스텝 → `git_snapshot`; push 는 별도 opt-in 체크박스, 기본 off — 신뢰 헌장
 * "자동 실행 0 · 전송 opt-in") ③ 최근 히스토리 10건 ④ 미커밋 변경 diff.
 *
 * 웹(브라우저 vault): git subprocess 가 없으므로 정직하게 강등 — 세션
 * changeset 요약 + `ontology-atlas snapshot` 명령 복사 + 데스크톱 안내 한 줄.
 *
 * 신뢰 헌장 준수: 어떤 git 호출도 사용자 클릭 없이는 일어나지 않는다
 * (마운트 시 조회는 읽기 전용 status/diff/history 뿐, 쓰기 0). git 미초기화
 * 는 에러가 아니라 "직접 git init" 안내로만 — 자동 init 절대 금지.
 */

export interface AtlasGitPanelProps {
  /**
   * Tauri 데스크톱 vault 의 절대 경로 — `getTauriVaultRootPath(vault.handle)`
   * 로 얻는다. null/undefined 면 웹 강등 렌더.
   */
  vaultPath?: string | null;
  /** 웹 강등 요약에 쓸 세션 changeset — HomePage 의 `ontologyChangeset`. */
  sessionChangeset?: OntologyChangeset | null;
  onClose: () => void;
  className?: string;
}

const SNAPSHOT_CLI_COMMAND = "ontology-atlas snapshot";
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
  onClose,
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

  const [diffOpen, setDiffOpen] = useState(false);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [commandCopied, setCommandCopied] = useState(false);

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
      setDiffOpen(false);
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

  return (
    <section
      aria-label={t("title")}
      data-testid="atlas-git-panel"
      // 시트 골격은 호스트(HomePage 의 scrim+카드 셸)가 소유한다 — 여기서
      // 보더/배경을 또 얹으면 이중 카드가 된다(소유자 실보고 2026-07-23
      // "보기 안 좋고"). AgentConnectSheet 와 같은 역할 분담: 패널은 내용만.
      className={cn("flex w-full flex-col", className)}
    >
      {/* AgentConnectSheet 헤더 문법 — 인디고 mono eyebrow + body 서브타이틀,
          border-b 로 본문과 분리. 글자 크기 한 단 승격(소유자: "글자 너무 작아"). */}
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-[color:var(--color-border-soft)] px-5 py-4">
        <div>
          <p className="flex items-center gap-1.5 font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
            <HistoryIcon size={11} aria-hidden />
            {t("title")}
          </p>
          <p className="mt-1 text-body leading-relaxed text-[color:var(--color-text-secondary)]">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          aria-label={t("close")}
          data-testid="atlas-git-close"
          onClick={onClose}
          className="rounded p-1 text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
        >
          <X size={15} aria-hidden />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
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
          diffOpen={diffOpen}
          setDiffOpen={setDiffOpen}
          diffText={diffText}
          history={history}
          expandedHash={expandedHash}
          setExpandedHash={setExpandedHash}
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
  diffOpen,
  setDiffOpen,
  diffText,
  history,
  expandedHash,
  setExpandedHash,
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
  diffOpen: boolean;
  setDiffOpen: (v: boolean) => void;
  diffText: string;
  history: GitCommitInfo[];
  expandedHash: string | null;
  setExpandedHash: (v: string | null) => void;
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
    // 신뢰 헌장 ② — 자동 git init 금지. 상태로만 알리고 직접 실행을 안내한다.
    return (
      <div className="flex flex-col gap-1" data-testid="atlas-git-not-initialized">
        <p className="text-label text-[color:var(--color-text-secondary)]">{t("notInitialized")}</p>
        <p className="text-caption text-[color:var(--color-text-quaternary)]">
          {t("notInitializedHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {status?.branch ? (
        <p className="text-caption text-[color:var(--color-text-quaternary)]">
          {t("branchLabel")}{" "}
          <span className="font-mono text-[color:var(--color-text-tertiary)]">{status.branch}</span>
          {" · "}
          {status.upstream ? (
            <span className="font-mono text-[color:var(--color-text-tertiary)]">
              {status.upstream}
            </span>
          ) : (
            t("noUpstream")
          )}
        </p>
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
        {hasChanges ? (
          <button
            type="button"
            data-testid="atlas-git-diff-toggle"
            onClick={() => setDiffOpen(!diffOpen)}
            className="self-start text-caption text-[color:var(--color-text-tertiary)] underline decoration-[color:var(--color-border-soft)] underline-offset-2 transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            {diffOpen ? t("diffHide") : t("diffShow")}
          </button>
        ) : null}
        {diffOpen ? (
          diffText.trim() ? (
            <pre
              data-testid="atlas-git-diff-pre"
              className="max-h-56 overflow-auto rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2 font-mono text-caption leading-relaxed text-[color:var(--color-text-secondary)]"
            >
              {diffText}
            </pre>
          ) : (
            <p className="text-caption text-[color:var(--color-text-quaternary)]">
              {t("diffEmpty")}
            </p>
          )
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
      <section aria-label={t("webCommandHint")} className="flex flex-col gap-1.5">
        <p className="text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
          {t("webCommandHint")}
        </p>
        <div className="flex items-center justify-between gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2">
          <code className="min-w-0 truncate font-mono text-[12.5px] text-[color:var(--color-text-secondary)]">
            {SNAPSHOT_CLI_COMMAND}
          </code>
          <button
            type="button"
            data-testid="atlas-git-web-copy"
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
      </section>
    </div>
  );
}
