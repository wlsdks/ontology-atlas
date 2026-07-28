"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Cable, Check, ChevronDown, Copy, X } from "lucide-react";
import { MOTION } from "@/shared/motion";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { copyText } from "@/shared/lib/copy-text";
import type { AgentServerAvailability } from "@/shared/config";
import {
  AgentClientButtons,
  AgentConnectAction,
  type AgentClientConfigState,
} from "@/features/docs-vault-local";

/**
 * "AI 에이전트 연결" 시트 (#12/#17/C13 재설계, Phase 4).
 *
 * 첫 화면은 **3단계만** 보인다: ① 연결 버튼 누르기(클라이언트별 원클릭)
 * ② 에이전트 재시작 ③ 연결 확인(heartbeat). 스니펫·표준 triple·다른 툴 표는
 * "고급 · 자세한 검증" 접기 뒤로 강등한다("AI 가 급조한 느낌" 제거). 원클릭
 * 버튼은 지도 시트·설정 패널이 공유하는 `AgentClientButtons` 한 몸.
 *
 * 모달 골격은 ShortcutSheet 와 동일 계약 (scrim + 중앙 카드 + 토큰).
 */

export type AgentConnectState =
  | { kind: "connected"; agentLabel: string; agoLabel: string; focusTitle: string | null }
  | { kind: "stale"; agoLabel: string }
  | { kind: "none" };

export interface AgentConnectSnippets {
  /** `.mcp.json` 본문 (데스크톱: 경로 자동 / 웹: 플레이스홀더 포함). */
  mcpJson: string;
  /** Codex 등록 명령. */
  codexCommand: string;
  /** invalid vault-local `.mcp.json` 교체용 OATLAS_VAULT=. JSON. */
  replacementMcpJson: string;
  /** invalid vault-local Codex 설정을 교체할 때 복사할 TOML. */
  codexConfig: string;
  /** 경로를 스스로 채워야 하는 웹 세션인지 (안내 문구 노출). */
  needsManualPath: boolean;
  /** Cursor 원클릭 딥링크 (절대 경로 있을 때만, 없으면 null → 복사 강등). */
  cursorDeeplink: string | null;
  /** VS Code 원클릭 딥링크. */
  vscodeDeeplink: string | null;
}

export interface AgentConnectSheetProps {
  serverAvailability: AgentServerAvailability;
  /** vault 절대 경로 (설치 앱). 없으면 연결 행동을 그리지 않는다. */
  vaultPath?: string | null;
  open: boolean;
  onClose: () => void;
  status: AgentConnectState;
  snippets: AgentConnectSnippets;
  /** 사용자의 도메인 제목들 — 미리보기 문장이 되말한다. 빈 배열이면 문장 생략. */
  domainTitles: readonly string[];
  /** 기존 인계 페이로드 (INDEX 인계 메뉴와 동일 텍스트). */
  handoffText: string;
  /** 데스크톱 + 쓰기 가능 vault 일 때 — `.mcp.json` 등 설정 파일 자동 생성. */
  onWriteConfigs?: (() => void) | null;
  /** 이미 `.mcp.json` 이 존재하는지 (설치 앱) — 버튼 확인 문구 우선. */
  mcpJsonReady?: boolean;
  mcpJsonState?: AgentClientConfigState;
  codexConfigState?: AgentClientConfigState;
}

function CopyBlock({ label, value, testId }: { label: string; value: string; testId: string }) {
  const t = useTranslations("agentConnect");
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
          {label}
        </span>
        <button
          type="button"
          data-testid={testId}
          onClick={async () => {
            if (await copyText(value)) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            }
          }}
          className="inline-flex items-center gap-1 rounded border border-[color:var(--color-border-soft)] px-1.5 py-0.5 text-caption text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]"
        >
          {copied ? <Check size={10} aria-hidden /> : <Copy size={10} aria-hidden />}
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <pre className="max-h-36 overflow-auto rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2 font-mono text-label leading-relaxed text-[color:var(--color-text-secondary)]">
        {value}
      </pre>
    </div>
  );
}

/** 번호 배지 + 제목 + 설명 + 내용 — 첫 화면 3단계의 통일 문법. */
function StepRow({
  n,
  title,
  desc,
  children,
}: {
  n: number;
  title: string;
  desc?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex gap-3" data-testid={`agent-connect-step-${n}`}>
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-indigo-a16)] font-mono text-caption font-medium text-[color:var(--color-indigo-accent)]"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-[color:var(--color-text-primary)]">{title}</p>
        {desc ? (
          <p className="mt-0.5 text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
            {desc}
          </p>
        ) : null}
        {children ? <div className="mt-2.5">{children}</div> : null}
      </div>
    </section>
  );
}

export function AgentConnectSheet({
  serverAvailability,
  vaultPath = null,
  open,
  onClose,
  status,
  snippets,
  domainTitles,
  handoffText,
  onWriteConfigs = null,
  mcpJsonReady = false,
  mcpJsonState,
  codexConfigState,
}: AgentConnectSheetProps) {
  const t = useTranslations("agentConnect");
  const dialogRef = useRef<HTMLElement | null>(null);
  const [handoffCopied, setHandoffCopied] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  useBodyScrollLock(open);

  // 고급 접기의 다른-툴 표. 대부분의 MCP 클라이언트가 같은 표준 stdio
  // triple(command/args/env)을 쓰고, 다른 건 설정 파일 *위치* 뿐이다.
  const otherTools: ReadonlyArray<{ tool: string; locations: readonly string[]; note: string }> = [
    { tool: "Claude Code", locations: [".mcp.json"], note: t("otherToolsProjectRoot") },
    {
      tool: "Cursor",
      locations: [".cursor/mcp.json", "~/.cursor/mcp.json"],
      note: t("otherToolsCursorScopes"),
    },
    { tool: "Codex", locations: [".codex/config.toml", "codex mcp add"], note: t("otherToolsCodexNote") },
    { tool: "Claude Desktop", locations: ["설정 → Developer"], note: t("otherToolsClaudeDesktopNote") },
  ];

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // ShortcutSheet 와 같은 모달 계약: 포커스를 안으로 잡아 순환.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const getFocusables = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hasAttribute("disabled"),
      );
    getFocusables()[0]?.focus({ preventScroll: true });

    const trapHandler = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = getFocusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trapHandler);
    return () => window.removeEventListener("keydown", trapHandler);
  }, [open]);

  // [M-12] 4개까지만 보여주되, 나머지는 "외 N개" 로 명시.
  const previewDomains = domainTitles.slice(0, 4);
  const remainingDomainsCount = domainTitles.length - previewDomains.length;
  const domainsLabel =
    remainingDomainsCount > 0
      ? `${previewDomains.join(" · ")} ${t("previewMoreDomains", { count: remainingDomainsCount })}`
      : previewDomains.join(" · ");

  const statusDotColor =
    status.kind === "connected"
      ? "var(--color-status-success)"
      : status.kind === "stale"
        ? "var(--color-status-warning)"
        : "var(--color-text-quaternary)";
  const statusText =
    status.kind === "connected"
      ? status.focusTitle
        ? t("statusConnectedFocus", {
            agent: status.agentLabel,
            ago: status.agoLabel,
            focus: status.focusTitle,
          })
        : t("statusConnected", { agent: status.agentLabel, ago: status.agoLabel })
      : status.kind === "stale"
        ? t("statusStale", { ago: status.agoLabel })
        : t("statusNone");

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-interactive-overlay="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MOTION.base}
          className="pointer-events-auto fixed inset-0 z-50 flex items-stretch justify-center bg-[color:var(--color-backdrop-medium)] sm:items-center sm:p-6"
          onClick={onClose}
          data-testid="agent-connect-scrim"
        >
          <motion.section
            ref={dialogRef}
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={MOTION.base}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t("title")}
            data-testid="agent-connect-sheet"
            className="flex h-[calc(100dvh-var(--topology-mobile-bottom-tab-reserve))] w-full flex-col overflow-hidden border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-2xl sm:h-auto sm:max-h-[calc(100vh-3rem)] sm:max-w-[560px] sm:rounded-[var(--topology-shortcut-sheet-radius)]"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-[color:var(--color-border-soft)] px-5 py-4">
              <div>
                <p className="flex items-center gap-1.5 font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
                  <Cable size={11} aria-hidden />
                  {t("title")}
                </p>
                <p className="mt-1 text-body text-[color:var(--color-text-secondary)]">{t("subtitle")}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("close")}
                data-testid="agent-connect-close"
                className="rounded p-1 text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                <X size={15} aria-hidden />
              </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
              {/* ① 연결 버튼 누르기 — 클라이언트별 원클릭 */}
              <StepRow
                n={1}
                title={t("step1Title")}
                desc={serverAvailability.launch ? t("step1Desc") : undefined}
              >
                <AgentConnectAction
                  vaultPath={vaultPath}
                  launch={serverAvailability.launch}
                  onWritten={onWriteConfigs}
                />
                <AgentClientButtons
                  serverAvailability={serverAvailability}
                  onWriteConfigs={onWriteConfigs}
                  cursorDeeplink={snippets.cursorDeeplink}
                  vscodeDeeplink={snippets.vscodeDeeplink}
                  mcpJsonSnippet={snippets.mcpJson}
                  replacementMcpJsonSnippet={snippets.replacementMcpJson}
                  codexCommand={snippets.codexCommand}
                  codexConfigSnippet={snippets.codexConfig}
                  mcpJsonReady={mcpJsonReady}
                  mcpJsonState={mcpJsonState}
                  codexConfigState={codexConfigState}
                  needsManualPath={snippets.needsManualPath}
                />
              </StepRow>

              {serverAvailability.launch ? (
                <>
                  {/* ② 에이전트 재시작 */}
                  <StepRow n={2} title={t("step2Title")} desc={t("step2Desc")} />

                  {/* ③ 연결 확인 — heartbeat 파일 기반 (조용한 수집 0) */}
                  <StepRow n={3} title={t("step3Title")} desc={t("step3Desc")}>
                    <div
                      data-testid="agent-connect-status"
                      className="flex items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5"
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: statusDotColor }}
                      />
                      <p className="min-w-0 flex-1 text-body leading-relaxed text-[color:var(--color-text-secondary)]">
                        {statusText}
                      </p>
                    </div>
                  </StepRow>
                </>
              ) : null}

              {/* 이해받음의 순간 — 에이전트가 내 지도를 되말한다 (첫 화면 유지) */}
              {previewDomains.length > 0 ? (
                <section aria-label={t("previewLabel")} className="flex flex-col gap-2">
                  <p className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                    {t("previewLabel")}
                  </p>
                  <p
                    data-testid="agent-connect-preview"
                    className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5 text-body leading-relaxed text-[color:var(--color-text-secondary)]"
                  >
                    {t("previewSentence", { domains: domainsLabel })}
                  </p>
                  <button
                    type="button"
                    data-testid="agent-connect-copy-handoff"
                    onClick={async () => {
                      if (await copyText(handoffText)) {
                        setHandoffCopied(true);
                        window.setTimeout(() => setHandoffCopied(false), 1600);
                      }
                    }}
                    className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] px-3 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]"
                  >
                    {handoffCopied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
                    {handoffCopied ? t("handoffCopied") : t("copyHandoff")}
                  </button>
                </section>
              ) : null}

              {/* 고급 · 자세한 검증 — 스니펫·표준 triple·다른 툴 표 강등 */}
              {serverAvailability.launch ? (
                <section aria-label={t("advancedToggle")} className="flex flex-col gap-3 border-t border-[color:var(--color-border-soft)] pt-4">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  aria-expanded={advancedOpen}
                  data-testid="agent-connect-advanced-toggle"
                  className="flex items-center gap-1.5 self-start font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                >
                  <ChevronDown
                    size={11}
                    aria-hidden
                    className="transition-transform"
                    style={{ transform: advancedOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                  />
                  {t("advancedToggle")}
                </button>
                <AnimatePresence initial={false}>
                  {advancedOpen && (
                    <motion.div
                      key="advanced"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={MOTION.base}
                      style={{ overflow: "hidden" }}
                      data-testid="agent-connect-advanced"
                    >
                      <div className="flex flex-col gap-3 pt-0.5">
                        {snippets.needsManualPath ? (
                          <p className="text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
                            {t("manualPathHint")}
                          </p>
                        ) : null}
                        <CopyBlock
                          label={t("claudeCode")}
                          value={snippets.mcpJson}
                          testId="agent-connect-copy-mcp"
                        />
                        <CopyBlock
                          label={t("codex")}
                          value={snippets.codexCommand}
                          testId="agent-connect-copy-codex"
                        />
                        <p className="text-label leading-relaxed text-[color:var(--color-text-quaternary)]">
                          {t("genericHint")}
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-label">
                            <thead>
                              <tr className="border-b border-[color:var(--color-border-soft)] text-left text-[color:var(--color-text-quaternary)]">
                                <th className="py-1.5 pr-3 font-medium">{t("otherToolsColTool")}</th>
                                <th className="py-1.5 font-medium">{t("otherToolsColLocation")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {otherTools.map((row) => (
                                <tr
                                  key={row.tool}
                                  className="border-b border-[color:var(--color-border-soft)] align-top last:border-b-0"
                                >
                                  <td className="whitespace-nowrap py-2 pr-3 text-[color:var(--color-text-secondary)]">
                                    {row.tool}
                                  </td>
                                  <td className="py-2 text-[color:var(--color-text-tertiary)]">
                                    {row.locations.length > 0 ? (
                                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                        {row.locations.map((loc, i) => (
                                          <span key={loc} className="inline-flex items-center gap-1.5">
                                            {i > 0 ? (
                                              <span aria-hidden className="text-[color:var(--color-text-quaternary)]">
                                                /
                                              </span>
                                            ) : null}
                                            <code className="rounded bg-[color:var(--color-overlay-1)] px-1 py-0.5 font-mono text-[color:var(--color-text-secondary)]">
                                              {loc}
                                            </code>
                                          </span>
                                        ))}
                                      </span>
                                    ) : null}
                                    <span className="mt-0.5 block text-caption text-[color:var(--color-text-quaternary)]">
                                      {row.note}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                </section>
              ) : null}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
