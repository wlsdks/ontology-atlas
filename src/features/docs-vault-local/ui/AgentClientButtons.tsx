"use client";

import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Check, Copy, Info, Loader2 } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { AGENT_GRAPH_WORKFLOW_HREF, type AgentServerAvailability } from "@/shared/config";
import { copyText } from "@/shared/lib/copy-text";
import { cn } from "@/shared/lib/cn";
import { Button, buttonVariants } from "@/shared/ui/button";
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
import { WebManualConnectPanel } from "./WebManualConnectPanel";

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
  /**
   * 네 도구를 어떻게 놓는가.
   *
   * 기본 `stack` 은 지도 시트의 것이다 — 거기서는 이 열이 시트의 주 내용이라
   * 세로 전폭이 맞다. `grid` 는 설정의 **접히는 단계 안**에서 쓴다: 넷은
   * 「정답 하나 + 탈락 셋」이 아니라 **하나 고르는 것**인데, 세로 전폭 넷은
   * 각각이 큰 결정처럼 읽혔다(소유자 지적 2026-08-04). 2열이면 한 벌로 읽히고
   * 세로도 절반이다.
   *
   * ⚠️ 축을 «감으로» 늘린 것이 아니다. 넷은 서로 다른 파일에 쓰므로 한 사람이
   * 둘 이상 붙이는 것이 정상이고, 그 사실은 이미 2026-08-02 라운드가 채움을
   * 빼면서 확인했다. 여기서는 그 사실을 **배치**로도 말한다.
   */
  layout?: "stack" | "grid";
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
  layout = "stack",
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
    /**
     * **웹 = 막다른 길이 아니다.** 종전 이 자리는 「이 화면에서는 연결할 수
     * 없어요」 한 문장과 사람을 긴 문서로 떨구는 링크뿐이었다. 그 문장은
     * 거짓이다 — MCP 는 Atlas 가 아니라 **폴더**에 붙고, 에이전트가 자기
     * 세션에서 서버를 띄운다. 웹 사용자도 연결된다.
     *
     * 브라우저가 못 하는 것은 **설정을 대신 써 주는 것** 하나다(FSA 는 핸들만
     * 주고 경로를 안 준다). 그러니 능력의 범위를 실제보다 좁게 말하지 않고,
     * 브라우저가 모르는 그 값을 **아는 사람에게 묻는다**.
     *
     * 「왜 + 어디서」 계약(`.claude/rules/surfaces.md`)은 그대로다: 왜 자동이
     * 안 되는지 말하고, 갈 곳을 준다. 달라진 것은 갈 곳이 **이 자리에도**
     * 생겼다는 것이고, 앱(버튼 한 번)은 여전히 더 쉬운 길로 남는다.
     */
    return (
      <div className="flex flex-col gap-2" data-testid="agent-client-buttons">
        <div
          role="status"
          data-testid="agent-server-unavailable"
          className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5"
        >
          <div className="flex items-start gap-2">
            <Info
              size={ICON_SIZE.md}
              aria-hidden
              className="mt-0.5 shrink-0 text-[color:var(--color-text-quaternary)]"
            />
            <div className="min-w-0">
              <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {t("serverUnavailableTitle")}
              </p>
              <p className="mt-1 text-label leading-prose text-[color:var(--color-text-tertiary)]">
                {t("serverUnavailableDesc")}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link
                  href="/download/"
                  data-testid="agent-connect-web-get-app"
                  className="inline-flex text-label font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] transition-colors hover:text-[color:var(--color-text-primary)]"
                >
                  {t("serverUnavailableGetApp")}
                </Link>
                {/* 더 읽고 싶은 사람만 간다 — **주 경로가 아니다.** 종전에는
                    이것이 유일한 대안이라 연결하려던 사람이 시트를 잃고 문서
                    한가운데에 놓였다. */}
                <Link
                  href={AGENT_GRAPH_WORKFLOW_HREF}
                  className="inline-flex text-label text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                >
                  {t("serverUnavailableSource")}
                </Link>
              </div>
            </div>
          </div>
        </div>
        <WebManualConnectPanel />
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
    // Claude Code — Tauri: .mcp.json 자동 생성. 웹: 복사.
    //
    // **채움을 뺐다 (2026-08-02, 디자인 카운슬 S2).** 이 갈래만 `primary` 를
    // 무조건 참으로 하드코딩해 인디고 워시를 입었고, 나머지 셋에는 그 값을
    // 넘기는 경로 자체가 없었다. 실측 결과 넷은 `750×38, x=407` 로 치수 분산이
    // 0인데 하나만 채워져 있어서, 「선택지 넷」이 아니라 **「정답 하나 + 탈락
    // 셋」**으로 읽혔다. 넷은 서로 다른 파일에 쓴다(`.mcp.json` ·
    // `.codex/config.toml` · `.cursor/mcp.json` · `.agents/mcp_config.json`) —
    // 한 사람이 둘 이상 붙이는 것이 정상 시나리오라 «정답» 이 있을 수 없다.
    //
    // 어느 도구를 쓰는지 아는 신호(`recommendedClientId`)는 아직 없다. 없는
    // 신호를 있는 척 배선하는 대신 **잘못된 신호부터 끈다**.
    claudeCode: () =>
      mcpJsonIsReady ? (
        <ClientStatus
          testId="agent-client-claude-code"
          label={t("claudeCodeReady")}
        />
      ) : resolvedMcpJsonState === "invalid" ? (
        <ClientAction
          testId="agent-client-claude-code"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
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
        <ClientAction
          testId="agent-client-claude-code"
          label={t("connectClaudeCode")}
          feedback={feedback.claudeCode}
          doneLabel={t("claudeCodeDone")}
          busyLabel={t("connecting")}
          onClick={() => void writeAndConfirm("claudeCode")}
        />
      ) : (
        <ClientAction
          testId="agent-client-claude-code"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
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
        <ClientAction
          testId="agent-client-cursor"
          label={t("connectCursor")}
          feedback={feedback.cursor}
          doneLabel={t("cursorDone")}
          busyLabel={t("connecting")}
          onClick={() => void writeAndConfirm("cursor")}
        />
      ) : cursorDeeplink ? (
        <ClientLink
          testId="agent-client-cursor"
          icon={<ArrowUpRight size={ICON_SIZE.md} aria-hidden />}
          label={t("connectCursor")}
          href={cursorDeeplink}
        />
      ) : (
        <ClientAction
          testId="agent-client-cursor"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
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
        <ClientAction
          testId="agent-client-antigravity"
          label={t("connectAntigravity")}
          feedback={feedback.antigravity}
          doneLabel={t("antigravityDone")}
          busyLabel={t("connecting")}
          onClick={() => void writeAndConfirm("antigravity")}
        />
      ) : (
        <ClientAction
          testId="agent-client-antigravity"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
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
        <ClientAction
          testId="agent-client-codex"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
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
        <ClientAction
          testId="agent-client-codex"
          label={t("connectCodex")}
          feedback={feedback.codex}
          doneLabel={t("codexDone")}
          busyLabel={t("connecting")}
          onClick={() => void writeAndConfirm("codex")}
        />
      ) : (
        <ClientAction
          testId="agent-client-codex"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
          label={t("copyCodexCommand")}
          feedback={feedback.codex}
          copiedLabel={t("copyCodexCommandDone")}
          onClick={() => void copyAndConfirm("codex", codexCommand)}
        />
      ),
  };

  return (
    <div className="flex flex-col gap-2" data-testid="agent-client-buttons" data-layout={layout}>
      <div
        className={
          layout === "grid" ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"
        }
      >
        {AGENT_CLIENTS.map((client) => (
          <Fragment key={client.id}>{clientRenderers[ID_TO_CLIENT[client.id]]()}</Fragment>
        ))}
      </div>

      {needsManualPath ? (
        <p className="text-caption leading-label text-[color:var(--color-text-quaternary)]">
          {t("deeplinkWebNote")}{" "}
          <Link
            href="/download/"
            data-testid="agent-client-app-cta"
            className="font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            {t("deeplinkWebNoteCta")}
          </Link>
        </p>
      ) : null}

      {/* 핵심 평문 — stdio 를 로컬-퍼스트 장점으로 */}
      <p
        data-testid="agent-connect-server-line"
        className="mt-1 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5 text-label leading-prose text-[color:var(--color-text-tertiary)]"
      >
        {t("serverLine")}
      </p>
    </div>
  );
}

/**
 * 이 열의 표면은 **`shared/ui/button` 이 정한다** (2026-08-02, 디자인 카운슬 S3).
 *
 * 종전엔 세 조각(`ClientStatus`/`ClientButton`/`ClientLink`)이 같은 클래스
 * 문자열을 각자 손으로 다시 썼고, 그중 하나는 반투명 `--color-indigo-a24`
 * 워시로 프리미티브의 불투명 `primary`(#5e6ad2)를 흉내 냈다. 전수 결과 그
 * 워시는 24건/19파일인데 `Button` 프리미티브를 거친 곳은 **0건**이었다 —
 * 규격이 있는데 아무도 안 쓰면 그건 규격이 아니라 문서다.
 *
 * 프리미티브를 쓰면 focus-visible 링도 함께 따라온다. 실측: 이 화면 버튼들만
 * `focus-visible:ring` 이 하나도 없어 브라우저 기본
 * `outline: rgb(208,214,224) auto 1px` 이 떴고, 앱 나머지 아홉 곳 이상은
 * 인디고 링 토큰을 쓰고 있었다.
 *
 * 이 표면의 방언 셋만 덮는다 — 전폭(`w-full`) · 이 시트의 반지름
 * (`rounded-chip`) · 설정 시트 타입 방언(`text-body`). 나머지(색 · 상태 · 눌림 ·
 * 비활성 · 포커스 링)는 프리미티브가 소유한다. `size="sm"` 의 `h-8` 이 곧
 * `--control-h-md`(32px)라 높이는 종전 값 그대로다.
 */
function clientControlClass(extra?: string) {
  return cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full rounded-chip text-body", extra);
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
      // 상태는 눌리지 않는다 — 프리미티브의 press 어포던스만 되돌린다.
      className={clientControlClass("active:translate-y-0")}
    >
      <Check
        size={ICON_SIZE.md}
        aria-hidden
        className="text-[color:var(--color-status-success)]"
      />
      {label}
    </div>
  );
}

function ClientAction({
  testId,
  icon,
  label,
  feedback,
  doneLabel,
  copiedLabel,
  busyLabel,
  onClick,
}: {
  testId: string;
  /** 상태를 나르는 글리프만 넘긴다 — 상태 없는 장식은 자리를 안 받는다. */
  icon?: React.ReactNode;
  label: string;
  feedback: Feedback;
  doneLabel?: string;
  copiedLabel?: string;
  busyLabel?: string;
  onClick: () => void;
}) {
  const isDone = feedback === "done";
  const isCopied = feedback === "copied";
  const isBusy = feedback === "busy";
  const shownIcon = isBusy ? (
    <Loader2 size={ICON_SIZE.md} aria-hidden className="animate-spin" />
  ) : isDone || isCopied ? (
    <Check size={ICON_SIZE.md} aria-hidden />
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
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid={testId}
      data-state={feedback}
      onClick={onClick}
      disabled={isBusy}
      className={clientControlClass()}
    >
      {shownIcon}
      {shownLabel}
    </Button>
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
      className={clientControlClass()}
    >
      {icon}
      {label}
    </a>
  );
}
