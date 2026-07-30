"use client";

import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Check, CircleAlert, Copy, Loader2, Terminal } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { AgentServerAvailability } from "@/shared/config";
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

import { AGENT_CLIENTS, type AgentClientId } from "../lib/agent-clients";

type ClientId = "claudeCode" | "cursor" | "antigravity" | "codex";

/**
 * 이 컴포넌트의 내부 id → 파일 계약의 도구 id.
 *
 * 두 이름 체계가 있는 것은 역사다(이쪽은 camelCase 라벨 키, 저쪽은 kebab 슬러그).
 * 합치는 것이 옳지만 그건 별개 정리라, 지금은 **한 곳에서만** 번역해 둔다 —
 * 여러 곳에서 손으로 번역하면 그중 하나가 틀린다.
 */
const CLIENT_TO_ID: Record<ClientId, AgentClientId> = {
  claudeCode: "claude-code",
  cursor: "cursor",
  antigravity: "antigravity",
  codex: "codex",
};

/** 역방향 — 렌더 순서를 `AGENT_CLIENTS` 에서 파생할 때 쓰는 번역. */
const ID_TO_CLIENT: Record<AgentClientId, ClientId> = {
  "claude-code": "claudeCode",
  cursor: "cursor",
  antigravity: "antigravity",
  codex: "codex",
};
type Feedback = "idle" | "busy" | "done" | "copied" | "failed";
export type AgentClientConfigState = "missing" | "invalid" | "ready";

export interface AgentClientButtonsProps {
  /**
   * 이 자리에서 서버를 띄울 방법을 아는가. 모르면(웹 세션) 실행 불가능한
   * 설정을 만들거나 복사하지 않는다 — 붙지 않는 설정은 도움이 아니라 함정이다.
   */
  serverAvailability: AgentServerAvailability;
  /** Tauri 전용 — `.mcp.json`·`.codex/config.toml` 등을 vault 폴더에 생성. 웹은 null. */
  /**
   * 설정 쓰기 — **어느 도구인지 함께 넘긴다.**
   *
   * 종전에는 인자가 없어서 구현이 "쓸 수 있는 것 전부"를 썼다. 그래서 어느 버튼을
   * 눌러도 같은 결과였고, 라벨이 도구를 말하는데 동작은 도구를 몰랐다. 인자를
   * 받는 것 자체가 그 결함의 재발을 막는다 — 구현이 도구를 무시하려면 이제
   * **일부러** 무시해야 한다.
   */
  onWriteConfigs: ((client: AgentClientId) => void | Promise<void>) | null;
  /** Cursor 딥링크(절대 경로 있을 때). 없으면 복사 강등. */
  cursorDeeplink: string | null;
  /** VS Code 딥링크. 없으면 복사 강등. */
  /** 복사 강등용 `.mcp.json` 본문. */
  mcpJsonSnippet: string;
  /** invalid vault-local `.mcp.json` 교체용 본문. 보통 OATLAS_VAULT=. */
  replacementMcpJsonSnippet?: string;
  /** 복사 강등용 Codex 한 줄 등록 명령. */
  codexCommand: string;
  /** 이미 `.mcp.json` 이 존재하는지(설치 앱) — 확인 문구 우선 표시. */
  mcpJsonReady?: boolean;
  /** 존재와 유효성을 분리한 현재 `.mcp.json` 상태. */
  mcpJsonState?: AgentClientConfigState;
  /** 존재와 유효성을 분리한 현재 `.codex/config.toml` 상태. */
  codexConfigState?: AgentClientConfigState;
  /** invalid Codex 설정을 사용자가 검토·교체할 때 복사할 vault-local TOML. */
  codexConfigSnippet?: string;
  /** 웹 세션(절대 경로 미상) — 딥링크 대신 복사 안내. */
  needsManualPath: boolean;
}

export function AgentClientButtons({
  serverAvailability,
  onWriteConfigs,
  cursorDeeplink,
  mcpJsonSnippet,
  replacementMcpJsonSnippet,
  codexCommand,
  mcpJsonReady = false,
  mcpJsonState,
  codexConfigState = "missing",
  codexConfigSnippet,
  needsManualPath,
}: AgentClientButtonsProps) {
  const t = useTranslations("agentConnect");
  const toast = useToast();
  const [feedback, setFeedback] = useState<Record<ClientId, Feedback>>({
    claudeCode: "idle",
    cursor: "idle",
    antigravity: "idle",
    codex: "idle",
  });
  const resolvedMcpJsonState =
    mcpJsonState ?? (mcpJsonReady ? "ready" : "missing");
  const mcpJsonIsReady =
    resolvedMcpJsonState === "ready" || feedback.claudeCode === "done";
  const codexConfigIsReady =
    codexConfigState === "ready" || feedback.codex === "done";

  const setState = (id: ClientId, state: Feedback) =>
    setFeedback((prev) => ({ ...prev, [id]: state }));

  async function writeAndConfirm(id: ClientId) {
    if (!onWriteConfigs) return;
    setState(id, "busy");
    try {
      await onWriteConfigs(CLIENT_TO_ID[id]);
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

  if (!serverAvailability.launch) {
    return (
      <div className="flex flex-col gap-2" data-testid="agent-client-buttons">
        <div
          role="status"
          data-testid="agent-server-unavailable"
          // 경고 톤의 알파 사다리는 `--color-amber-source-*` 다(rgb 가
          // `--color-status-warning` 과 같은 244,183,49). 종전에는 존재하지
          // 않는 `--color-status-warning-a36/a10` 을 불렀고, **없는 토큰을
          // 부르는 `var()` 는 문법상 완전히 정상**이라 어떤 게이트도 안
          // 걸렸다 — 그 동안 이 경고 카드는 테두리가 본문색, 배경이 투명인
          // 평범한 카드로 렌더됐다(2026-07-28 실측). `text-large` 사고와
          // 같은 계열: 존재하지 않는 것은 리터럴을 남기지 않는다.
          className="rounded-md border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a10)] px-3 py-2.5"
        >
          <div className="flex items-start gap-2">
            <CircleAlert
              size={14}
              aria-hidden
              className="mt-0.5 shrink-0 text-[color:var(--color-status-warning)]"
            />
            <div className="min-w-0">
              <p className="text-body font-medium text-[color:var(--color-text-primary)]">
                {t("serverUnavailableTitle")}
              </p>
              <p className="mt-1 text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
                {t("serverUnavailableDesc")}
              </p>
              {/* 「왜 + 어디서」 계약 (`.claude/rules/surfaces.md`) — 이유만
                  말하고 갈 곳이 없으면 그건 강등이 아니라 막다른 길이다.
                  주 목적지는 앱이고, 앱을 못 까는 사람에게 소스 경로를 남긴다. */}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link
                  href="/download/"
                  data-testid="agent-connect-web-get-app"
                  className="inline-flex text-label font-medium text-[color:var(--color-indigo-accent)] transition-colors hover:text-[color:var(--color-text-primary)]"
                >
                  {t("serverUnavailableGetApp")}
                </Link>
                <Link
                  href="/docs/?slug=AGENT-GRAPH-WORKFLOW"
                  className="inline-flex text-label text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                >
                  {t("serverUnavailableSource")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /**
   * 도구별 렌더 조각 — **순서는 여기 없다.** 어제(2026-07-30 전역 스코프 탭)와
   * 같은 시트 안에서 이 버튼 열은 Claude Code → Cursor → Antigravity → Codex 로
   * 하드코딩돼 있었고, 전역 스코프 탭은 `AGENT_CLIENTS`(Claude Code → Codex →
   * Cursor → Antigravity)를 그대로 썼다 — 한 시트 안에서 같은 목록이 두 순서를
   * 가졌다(「하나의 목록, 두 진실」 부류). 렌더 순서를 그 배열에서 파생시켜
   * 다시 갈라질 자리를 없앤다. 게이트:
   * `AgentClientButtons.test.tsx` "render order follows AGENT_CLIENTS".
   */
  const clientRenderers: Record<ClientId, () => React.ReactNode> = {
    // Claude Code — 주 CTA. Tauri: .mcp.json 자동 생성. 웹: 복사.
    claudeCode: () =>
      mcpJsonIsReady ? (
        <ClientStatus
          testId="agent-client-claude-code"
          label={t("claudeCodeReady")}
        />
      ) : resolvedMcpJsonState === "invalid" ? (
        <ClientButton
          testId="agent-client-claude-code"
          primary
          icon={<Copy size={13} aria-hidden />}
          label={t("replaceClaudeCodeConfig")}
          feedback={feedback.claudeCode}
          copiedLabel={t("replaceClaudeCodeConfigDone")}
          onClick={() =>
            void copyAndConfirm(
              "claudeCode",
              replacementMcpJsonSnippet ?? mcpJsonSnippet,
            )
          }
        />
      ) : onWriteConfigs ? (
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
      ),

    // Cursor — **설치 앱에서는 파일을 쓴다.** 2026-07-30 조사로 `.cursor/mcp.json`
    // 프로젝트 스코프가 확인됐고, 딥링크는 착지 파일이 공식 문서에 명시되지 않았다.
    // 어디에 무엇이 생기는지 모르는 편의보다, 볼트 안 한 파일이 예측 가능하다.
    // 웹에서는 파일을 못 쓰니 딥링크가 남는다.
    cursor: () =>
      onWriteConfigs ? (
        <ClientButton
          testId="agent-client-cursor"
          icon={<Terminal size={13} aria-hidden />}
          label={t("connectCursor")}
          feedback={feedback.cursor}
          doneLabel={t("cursorDone")}
          busyLabel={t("connecting")}
          onClick={() => void writeAndConfirm("cursor")}
        />
      ) : cursorDeeplink ? (
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
      ),

    // Antigravity — 워크스페이스 `.agents/mcp_config.json`, stdio 명시, 키가
    // `mcpServers` 라 기존 라이터로 그냥 떨어진다(2026-07-30 조사).
    //
    // **VS Code 가 이 자리에서 빠졌다.** `.vscode/mcp.json` 을 지원하지만 키가
    // `mcpServers` 가 아니라 `servers` 라서 라이터를 하나 더 요구하는데, 그 값이
    // 겹침 대비 비쌌다. 스니펫은 고급 접기의 「다른 툴」 표에 남는다.
    antigravity: () =>
      onWriteConfigs ? (
        <ClientButton
          testId="agent-client-antigravity"
          icon={<Terminal size={13} aria-hidden />}
          label={t("connectAntigravity")}
          feedback={feedback.antigravity}
          doneLabel={t("antigravityDone")}
          busyLabel={t("connecting")}
          onClick={() => void writeAndConfirm("antigravity")}
        />
      ) : (
        <ClientButton
          testId="agent-client-antigravity"
          icon={<Copy size={13} aria-hidden />}
          label={t("copyAntigravityConfig")}
          feedback={feedback.antigravity}
          copiedLabel={t("copyConfigDone")}
          onClick={() => void copyAndConfirm("antigravity", mcpJsonSnippet)}
        />
      ),

    // Codex — Tauri: config 자동 생성. 웹: 한 줄 명령 복사.
    codex: () =>
      codexConfigIsReady ? (
        <ClientStatus
          testId="agent-client-codex"
          label={t("codexReady")}
        />
      ) : codexConfigState === "invalid" ? (
        <ClientButton
          testId="agent-client-codex"
          icon={<Copy size={13} aria-hidden />}
          label={t("replaceCodexConfig")}
          feedback={feedback.codex}
          copiedLabel={t("replaceCodexConfigDone")}
          onClick={() =>
            void copyAndConfirm(
              "codex",
              codexConfigSnippet ?? codexCommand,
            )
          }
        />
      ) : onWriteConfigs ? (
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
      ),
  };

  return (
    <div className="flex flex-col gap-2" data-testid="agent-client-buttons">
      {AGENT_CLIENTS.map((client) => (
        <Fragment key={client.id}>{clientRenderers[ID_TO_CLIENT[client.id]]()}</Fragment>
      ))}

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

function ClientStatus({
  testId,
  label,
}: {
  testId: string;
  label: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      data-testid={testId}
      data-state="ready"
      className="inline-flex min-h-[var(--control-h-md)] w-full items-center justify-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-body text-[color:var(--color-text-secondary)]"
    >
      <Check
        size={13}
        aria-hidden
        className="text-[color:var(--color-status-success)]"
      />
      {label}
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
