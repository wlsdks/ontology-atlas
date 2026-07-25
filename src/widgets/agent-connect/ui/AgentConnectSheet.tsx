"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowRight, Cable, Check, ChevronDown, Copy, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { MOTION } from "@/shared/motion";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { copyText } from "@/shared/lib/copy-text";

/**
 * P2a — "AI 에이전트 연결" 시트 (전략 메모 채택 · 기술 검수 재스코프 M).
 *
 * 웨지 표면: 등록 스니펫 + heartbeat "파일 읽기" 기반 연결 확인 +
 * agent-brief 가 사용자의 도메인 이름을 되말하는 미리보기(이해받음의
 * 순간 — 감정 카피 규칙: 사용자 고유 명사 원문 포함). in-panel 프로세스
 * 실행(spawn verify)은 신규 능력이라 이 슬라이스에서 제외 — 연결 확인은
 * 에이전트가 남기는 heartbeat 파일(이미 폴링 중)로 한다.
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
  /** 경로를 스스로 채워야 하는 웹 세션인지 (안내 문구 노출). */
  needsManualPath: boolean;
}

export interface AgentConnectSheetProps {
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
}

function CopyBlock({ label, value, testId }: { label: string; value: string; testId: string }) {
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
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <pre className="max-h-36 overflow-auto rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2 font-mono text-label leading-relaxed text-[color:var(--color-text-secondary)]">
        {value}
      </pre>
    </div>
  );
}

export function AgentConnectSheet({
  open,
  onClose,
  status,
  snippets,
  domainTitles,
  handoffText,
  onWriteConfigs = null,
}: AgentConnectSheetProps) {
  const t = useTranslations("agentConnect");
  const dialogRef = useRef<HTMLElement | null>(null);
  const [handoffCopied, setHandoffCopied] = useState(false);
  const [otherToolsOpen, setOtherToolsOpen] = useState(false);
  useBodyScrollLock(open);

  // "다른 툴로 연결" — 정적 표. 대부분의 MCP 클라이언트가 같은 표준 stdio
  // triple(command/args/env)을 쓰고, 다른 건 설정 파일 *위치* 뿐이다. 빠르게
  // 변하는 경로는 하드코딩하지 않고 "각 툴 문서 참고" 로 남긴다.
  const otherTools: ReadonlyArray<{ tool: string; locations: readonly string[]; note: string }> = [
    { tool: "Claude Code", locations: [".mcp.json"], note: t("otherToolsProjectRoot") },
    {
      tool: "Cursor",
      locations: [".cursor/mcp.json", "~/.cursor/mcp.json"],
      note: t("otherToolsCursorScopes"),
    },
    { tool: "Codex", locations: [".codex/config.toml", "codex mcp add"], note: t("otherToolsCodexNote") },
    { tool: "Antigravity · Windsurf · Zed", locations: [], note: t("otherToolsSeeDocs") },
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

  // ShortcutSheet 와 같은 모달 계약: 열리면 첫 동작(닫기)으로 포커스를
  // 넘기고, Tab/Shift+Tab 이 배경 레일·지도까지 새지 않게 내부에서 순환한다.
  // 닫힌 뒤의 복귀 지점은 전역 launcher 가 소유한다(교차 route trigger 포함).
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

  // [M-12] 4개까지만 보여주되, 나머지는 "외 N개" 로 명시 — 조용한 누락은
  // "에이전트가 전부 읽는다" 는 이 화면의 신뢰 장치를 깎는다.
  const previewDomains = domainTitles.slice(0, 4);
  const remainingDomainsCount = domainTitles.length - previewDomains.length;
  const domainsLabel =
    remainingDomainsCount > 0
      ? `${previewDomains.join(" · ")} ${t("previewMoreDomains", { count: remainingDomainsCount })}`
      : previewDomains.join(" · ");

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-interactive-overlay="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MOTION.fast}
          className="pointer-events-auto fixed inset-0 z-50 flex items-stretch justify-center bg-[color:var(--color-backdrop-medium)] sm:items-center sm:p-6"
          onClick={onClose}
          data-testid="agent-connect-scrim"
        >
          <motion.section
            ref={dialogRef}
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={MOTION.medium}
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
              {/* 연결 상태 — heartbeat 파일 기반 (조용한 수집 0: 에이전트가
                  스스로 남긴 로컬 파일을 읽을 뿐이다) */}
              <section aria-label={t("statusLabel")} data-testid="agent-connect-status">
                <p className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t("statusLabel")}
                </p>
                <div className="mt-1.5 flex items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        status.kind === "connected"
                          ? "var(--color-status-success)"
                          : status.kind === "stale"
                            ? "var(--color-status-warning)"
                            : "var(--color-text-quaternary)",
                    }}
                  />
                  <p className="min-w-0 flex-1 text-body leading-relaxed text-[color:var(--color-text-secondary)]">
                    {status.kind === "connected"
                      ? status.focusTitle
                        ? t("statusConnectedFocus", {
                            agent: status.agentLabel,
                            ago: status.agoLabel,
                            focus: status.focusTitle,
                          })
                        : t("statusConnected", { agent: status.agentLabel, ago: status.agoLabel })
                      : status.kind === "stale"
                        ? t("statusStale", { ago: status.agoLabel })
                        : t("statusNone")}
                  </p>
                </div>
              </section>

              {/* 등록 스니펫 */}
              <section aria-label={t("registerLabel")} className="flex flex-col gap-3">
                <p className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t("registerLabel")}
                </p>
                {snippets.needsManualPath ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
                      {t("manualPathHint")}
                    </p>
                    {/* ease-of-use G3 (2026-07-23) — 비개발자는 "절대 경로를 직접
                        채우라"는 안내 앞에서 사실상 막힌다(브라우저는 구조적으로
                        폴더 경로를 앱에 알려주지 않는다). 정직한 강등의 나머지
                        반쪽: macOS 앱에서는 이 칸이 자동으로 채워진다는 다리. */}
                    <Link
                      href="/download/"
                      data-testid="agent-connect-manual-path-app-cta"
                      className="inline-flex w-fit items-center gap-1 text-label font-medium text-[color:var(--color-indigo-accent)] transition-colors hover:text-[color:var(--color-text-primary)]"
                    >
                      {t("manualPathAppCta")}
                      <ArrowRight size={11} aria-hidden />
                    </Link>
                  </div>
                ) : null}
                <CopyBlock label={t("claudeCode")} value={snippets.mcpJson} testId="agent-connect-copy-mcp" />
                <CopyBlock label={t("codex")} value={snippets.codexCommand} testId="agent-connect-copy-codex" />
                <p className="text-label leading-relaxed text-[color:var(--color-text-quaternary)]">
                  {t("genericHint")}
                </p>
                {onWriteConfigs ? (
                  <button
                    type="button"
                    onClick={onWriteConfigs}
                    data-testid="agent-connect-write-configs"
                    className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] px-3 text-label text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:var(--color-indigo-a24)]"
                  >
                    {t("writeConfigs")}
                  </button>
                ) : null}
              </section>

              {/* 다른 툴로 연결 — 접힌 정적 표. 표준 stdio triple 은 모든 MCP
                  클라이언트가 동일, 다른 건 설정 파일 위치뿐. */}
              <section aria-label={t("otherToolsToggle")} className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setOtherToolsOpen((v) => !v)}
                  aria-expanded={otherToolsOpen}
                  data-testid="agent-connect-other-tools-toggle"
                  className="flex items-center gap-1.5 self-start font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                >
                  <ChevronDown
                    size={11}
                    aria-hidden
                    className="transition-transform"
                    style={{ transform: otherToolsOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                  />
                  {t("otherToolsToggle")}
                </button>
                <AnimatePresence initial={false}>
                  {otherToolsOpen && (
                    <motion.div
                      key="other-tools"
                      // 디스클로저 = 부드러운 높이 펼침(0→auto)+페이드. caret 회전과
                      // 짝을 이뤄 "펼쳐진다"는 감각. MOTION.medium(280ms easeOut) 재사용,
                      // overflow-hidden 으로 펼침 중 클리핑. MotionConfig reducedMotion=
                      // "user"(레이아웃 상주 MotionProvider)가 감소 선호 시 스냅.
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={MOTION.medium}
                      style={{ overflow: "hidden" }}
                      data-testid="agent-connect-other-tools"
                    >
                      <div className="flex flex-col gap-3 pt-0.5">
                    <p className="text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
                      {t("otherToolsIntro")}
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
                    <CopyBlock
                      label={t("otherToolsTripleLabel")}
                      value={snippets.mcpJson}
                      testId="agent-connect-copy-triple"
                    />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              {/* 이해받음의 순간 — 에이전트가 내 지도를 되말한다 */}
              <section aria-label={t("previewLabel")} className="flex flex-col gap-2">
                <p className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t("previewLabel")}
                </p>
                {previewDomains.length > 0 ? (
                  <p
                    data-testid="agent-connect-preview"
                    className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5 text-body leading-relaxed text-[color:var(--color-text-secondary)]"
                  >
                    {t("previewSentence", { domains: domainsLabel })}
                  </p>
                ) : null}
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
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
