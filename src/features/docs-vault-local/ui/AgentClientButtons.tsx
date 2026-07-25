"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Check, Copy, Loader2, Terminal } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { copyText } from "@/shared/lib/copy-text";
import { useToast } from "@/shared/ui";

/**
 * 클라이언트별 원클릭 연결 버튼 묶음 (#12, Phase 4). 지도 시트와 설정 패널이
 * **같은 컴포넌트**를 공유한다 — 4개 클라이언트 버튼(Claude Code · Cursor ·
 * VS Code · Codex) + "따로 켜둘 서버가 없다"는 핵심 평문 한 줄.
 *
 * 강등 규칙(정직):
 * - Tauri(설치 앱): `onWriteConfigs` 로 폴더에 설정 파일을 직접 쓰고 완료 확인.
 * - 웹: 절대 경로를 모르므로 딥링크가 성립 안 함 → 설정 내용 복사 + 안내로 강등.
 *
 * feature 레이어에 두어 두 widget(agent-connect·app-settings-menu)이
 * 동일 레이어 cross-import 없이 가져다 쓴다.
 */

type ClientId = "claudeCode" | "cursor" | "vscode" | "codex";
type Feedback = "idle" | "busy" | "done" | "copied" | "failed";

export interface AgentClientButtonsProps {
  /** Tauri 전용 — `.mcp.json`·`.codex/config.toml` 등을 vault 폴더에 생성. 웹은 null. */
  onWriteConfigs: (() => void | Promise<void>) | null;
  /** Cursor 딥링크(절대 경로 있을 때). 없으면 복사 강등. */
  cursorDeeplink: string | null;
  /** VS Code 딥링크. 없으면 복사 강등. */
  vscodeDeeplink: string | null;
  /** 복사 강등용 `.mcp.json` 본문. */
  mcpJsonSnippet: string;
  /** 복사 강등용 Codex 한 줄 등록 명령. */
  codexCommand: string;
  /** 이미 `.mcp.json` 이 존재하는지(설치 앱) — 확인 문구 우선 표시. */
  mcpJsonReady?: boolean;
  /** 웹 세션(절대 경로 미상) — 딥링크 대신 복사 안내. */
  needsManualPath: boolean;
}

export function AgentClientButtons({
  onWriteConfigs,
  cursorDeeplink,
  vscodeDeeplink,
  mcpJsonSnippet,
  codexCommand,
  mcpJsonReady = false,
  needsManualPath,
}: AgentClientButtonsProps) {
  const t = useTranslations("agentConnect");
  const toast = useToast();
  const [feedback, setFeedback] = useState<Record<ClientId, Feedback>>({
    claudeCode: mcpJsonReady ? "done" : "idle",
    cursor: "idle",
    vscode: "idle",
    codex: "idle",
  });

  const setState = (id: ClientId, state: Feedback) =>
    setFeedback((prev) => ({ ...prev, [id]: state }));

  async function writeAndConfirm(id: ClientId) {
    if (!onWriteConfigs) return;
    setState(id, "busy");
    try {
      await onWriteConfigs();
      setState(id, "done");
    } catch {
      setState(id, "failed");
    }
  }

  async function copyAndConfirm(id: ClientId, value: string) {
    const ok = await copyText(value);
    setState(id, ok ? "copied" : "failed");
    // 인라인 라벨 전환(2초)에 더해 캐노니컬 토스트로 확실히 확인시킨다 —
    // sonnet 최종 검수 D3 (공방 저장 흐름과 동일한 확인 문법).
    if (ok) {
      toast.show(t("copiedToast"), "success");
      window.setTimeout(() => setState(id, "idle"), 2000);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="agent-client-buttons">
      {/* ① Claude Code — 최상단·최강. Tauri: .mcp.json 자동 생성. 웹: 복사. */}
      {onWriteConfigs ? (
        <ClientButton
          testId="agent-client-claude-code"
          primary
          icon={<Terminal size={13} aria-hidden />}
          label={t("connectClaudeCode")}
          feedback={feedback.claudeCode}
          doneLabel={t("claudeCodeDone")}
          busyLabel={t("connecting")}
          onClick={() => void writeAndConfirm("claudeCode")}
        />
      ) : (
        <ClientButton
          testId="agent-client-claude-code"
          primary
          icon={<Copy size={13} aria-hidden />}
          label={t("copyClaudeCodeConfig")}
          feedback={feedback.claudeCode}
          copiedLabel={t("copyClaudeCodeConfigDone")}
          onClick={() => void copyAndConfirm("claudeCode", mcpJsonSnippet)}
        />
      )}

      {/* ② Cursor — 딥링크(있으면) 없으면 복사 강등 */}
      {cursorDeeplink ? (
        <ClientLink
          testId="agent-client-cursor"
          icon={<ArrowUpRight size={13} aria-hidden />}
          label={t("connectCursor")}
          href={cursorDeeplink}
        />
      ) : (
        <ClientButton
          testId="agent-client-cursor"
          icon={<Copy size={13} aria-hidden />}
          label={t("copyCursorConfig")}
          feedback={feedback.cursor}
          copiedLabel={t("copyConfigDone")}
          onClick={() => void copyAndConfirm("cursor", mcpJsonSnippet)}
        />
      )}

      {/* ③ VS Code — 딥링크(있으면) 없으면 복사 강등 */}
      {vscodeDeeplink ? (
        <ClientLink
          testId="agent-client-vscode"
          icon={<ArrowUpRight size={13} aria-hidden />}
          label={t("connectVsCode")}
          href={vscodeDeeplink}
        />
      ) : (
        <ClientButton
          testId="agent-client-vscode"
          icon={<Copy size={13} aria-hidden />}
          label={t("copyVsCodeConfig")}
          feedback={feedback.vscode}
          copiedLabel={t("copyConfigDone")}
          onClick={() => void copyAndConfirm("vscode", mcpJsonSnippet)}
        />
      )}

      {/* ④ Codex — Tauri: config 자동 생성. 웹: 한 줄 명령 복사 */}
      {onWriteConfigs ? (
        <ClientButton
          testId="agent-client-codex"
          icon={<Terminal size={13} aria-hidden />}
          label={t("connectCodex")}
          feedback={feedback.codex}
          doneLabel={t("codexDone")}
          busyLabel={t("connecting")}
          onClick={() => void writeAndConfirm("codex")}
        />
      ) : (
        <ClientButton
          testId="agent-client-codex"
          icon={<Copy size={13} aria-hidden />}
          label={t("copyCodexCommand")}
          feedback={feedback.codex}
          copiedLabel={t("copyCodexCommandDone")}
          onClick={() => void copyAndConfirm("codex", codexCommand)}
        />
      )}

      {needsManualPath ? (
        <p className="text-caption leading-relaxed text-[color:var(--color-text-quaternary)]">
          {t("deeplinkWebNote")}{" "}
          <Link
            href="/download/"
            data-testid="agent-client-app-cta"
            className="font-medium text-[color:var(--color-indigo-accent)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            {t("deeplinkWebNoteCta")}
          </Link>
        </p>
      ) : null}

      {/* 핵심 평문 — stdio 를 로컬-퍼스트 장점으로 */}
      <p
        data-testid="agent-connect-server-line"
        className="mt-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5 text-label leading-relaxed text-[color:var(--color-text-tertiary)]"
      >
        {t("serverLine")}
      </p>
    </div>
  );
}

function ClientButton({
  testId,
  icon,
  label,
  feedback,
  doneLabel,
  copiedLabel,
  busyLabel,
  primary = false,
  onClick,
}: {
  testId: string;
  icon: React.ReactNode;
  label: string;
  feedback: Feedback;
  doneLabel?: string;
  copiedLabel?: string;
  busyLabel?: string;
  primary?: boolean;
  onClick: () => void;
}) {
  const isDone = feedback === "done";
  const isCopied = feedback === "copied";
  const isBusy = feedback === "busy";
  const shownIcon = isBusy ? (
    <Loader2 size={13} aria-hidden className="animate-spin" />
  ) : isDone || isCopied ? (
    <Check size={13} aria-hidden />
  ) : (
    icon
  );
  const shownLabel = isBusy
    ? (busyLabel ?? label)
    : isDone
      ? (doneLabel ?? label)
      : isCopied
        ? (copiedLabel ?? label)
        : label;
  return (
    <button
      type="button"
      data-testid={testId}
      data-state={feedback}
      onClick={onClick}
      disabled={isBusy}
      className={
        primary
          ? "inline-flex min-h-[var(--control-h-md)] w-full items-center justify-center gap-2 rounded-md border border-[color:var(--color-indigo-line-a54)] bg-[color:var(--color-indigo-a24)] px-3 py-2 text-body font-medium text-[color:var(--color-indigo-pale-a94)] transition-colors hover:bg-[color:var(--color-indigo-a32)] disabled:opacity-70"
          : "inline-flex min-h-[var(--control-h-md)] w-full items-center justify-center gap-2 rounded-md border border-[color:var(--color-border-soft)] px-3 py-2 text-body text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)] disabled:opacity-70"
      }
    >
      {shownIcon}
      {shownLabel}
    </button>
  );
}

function ClientLink({
  testId,
  icon,
  label,
  href,
}: {
  testId: string;
  icon: React.ReactNode;
  label: string;
  href: string;
}) {
  // 딥링크는 커스텀 URL 스킴이라 next Link 가 아닌 순수 anchor. 새 창 없이
  // OS 가 클라이언트를 깨운다.
  return (
    <a
      href={href}
      data-testid={testId}
      className="inline-flex min-h-[var(--control-h-md)] w-full items-center justify-center gap-2 rounded-md border border-[color:var(--color-border-soft)] px-3 py-2 text-body text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]"
    >
      {icon}
      {label}
    </a>
  );
}
