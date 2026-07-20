"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Cable, Check, Copy, X } from "lucide-react";
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
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
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
          className="inline-flex items-center gap-1 rounded border border-[color:var(--color-border-soft)] px-1.5 py-0.5 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]"
        >
          {copied ? <Check size={10} aria-hidden /> : <Copy size={10} aria-hidden />}
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <pre className="max-h-36 overflow-auto rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2 font-mono text-[10.5px] leading-relaxed text-[color:var(--color-text-secondary)]">
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
  useBodyScrollLock(open);

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
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
                  <Cable size={11} aria-hidden />
                  {t("title")}
                </p>
                <p className="mt-1 text-[13px] text-[color:var(--color-text-secondary)]">{t("subtitle")}</p>
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
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
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
                  <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-[color:var(--color-text-secondary)]">
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
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t("registerLabel")}
                </p>
                {snippets.needsManualPath ? (
                  <p className="text-[11.5px] leading-relaxed text-[color:var(--color-text-tertiary)]">
                    {t("manualPathHint")}
                  </p>
                ) : null}
                <CopyBlock label={t("claudeCode")} value={snippets.mcpJson} testId="agent-connect-copy-mcp" />
                <CopyBlock label={t("codex")} value={snippets.codexCommand} testId="agent-connect-copy-codex" />
                <p className="text-[11px] leading-relaxed text-[color:var(--color-text-quaternary)]">
                  {t("genericHint")}
                </p>
                {onWriteConfigs ? (
                  <button
                    type="button"
                    onClick={onWriteConfigs}
                    data-testid="agent-connect-write-configs"
                    className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] px-3 text-[11.5px] text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:var(--color-indigo-a24)]"
                  >
                    {t("writeConfigs")}
                  </button>
                ) : null}
              </section>

              {/* 이해받음의 순간 — 에이전트가 내 지도를 되말한다 */}
              <section aria-label={t("previewLabel")} className="flex flex-col gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t("previewLabel")}
                </p>
                {previewDomains.length > 0 ? (
                  <p
                    data-testid="agent-connect-preview"
                    className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[color:var(--color-text-secondary)]"
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
                  className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] px-3 text-[11.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]"
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
