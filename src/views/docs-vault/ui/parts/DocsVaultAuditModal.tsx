"use client";

import { useEffect, useRef } from "react";
import type { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Check, Clipboard, HardDrive, Network, X } from "lucide-react";
import { MOTION } from "@/shared/motion";
import { Link } from "@/i18n/navigation";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { useToast } from "@/shared/ui";
import {
  AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
  AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND,
} from "@/shared/lib/ontology-tree";
import type { VaultManifest } from "@/entities/docs-vault";

const SOURCE_VAULT_RUNTIME_REPLAY_MARKERS = [
  "relation_name_parity",
  "pattern_walk/project_map",
] as const;

export interface DocsVaultAuditModalProps {
  open: boolean;
  manifest: VaultManifest;
  nodeCount: number;
  edgeCount: number;
  graphHref: string;
  isLocalSourceLoaded: boolean;
  onClose: () => void;
  t: ReturnType<typeof useTranslations<"docsVault">>;
}

/**
 * 문서함 점검 = 중앙 모달 (docs-chrome-round design-prescription.md ③-5,
 * implementation-contract.md §4). 기존 absolute 밴드(`DocsVaultSourceContractBar`,
 * 불균등 3-카드 그리드)를 대체 — 세로 3행 스택 + hairline 구분 + scrim +
 * focus trap. proof marker(`SOURCE_VAULT_RUNTIME_REPLAY_MARKERS`) 와
 * `그래프 점검 복사` 게이트는 문자 그대로 보존(에이전트 핸드오프 계약).
 *
 * open 상태는 persist 하지 않는다 — 페이지 로드마다 모달이 뜨면 modality
 * 위반이므로 항상 닫힌 채 시작(호출부가 `contractOpen` 을 순수 state 로 관리).
 */
export function DocsVaultAuditModal({
  open,
  manifest,
  nodeCount,
  edgeCount,
  graphHref,
  isLocalSourceLoaded,
  onClose,
  t,
}: DocsVaultAuditModalProps) {
  const toast = useToast();
  const { state: gateCopyState, copy: copyGate } = useCopyFeedback(1500);
  const copiedGate = gateCopyState === "copied";
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Esc 로 닫기.
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus trap — 열리면 다이얼로그 내부 첫 focusable 로 이동, Tab 이 바깥으로
  // 빠져나가지 않게 순환. 닫히면 트리거(점검 타일)로 focus 복원.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const selector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = dialog.querySelectorAll<HTMLElement>(selector);
    focusables[0]?.focus();

    const trapHandler = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", trapHandler);
    return () => {
      window.removeEventListener("keydown", trapHandler);
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  const sourceLabel = isLocalSourceLoaded
    ? t("sourceContract.filesLocalValue", { count: manifest.docs.length })
    : t("sourceContract.filesSampleValue", { count: manifest.docs.length });

  const cells = [
    {
      key: "files",
      icon: HardDrive,
      label: t("sourceContract.filesLabel"),
      value: sourceLabel,
      body: t("sourceContract.filesBody"),
      chip: t("sourceContract.filesChip"),
      href: "/docs/",
      cta: t("sourceContract.filesCta"),
    },
    {
      key: "graph",
      icon: Network,
      label: t("sourceContract.graphLabel"),
      value: t("sourceContract.graphValue", { nodes: nodeCount, edges: edgeCount }),
      body: t("sourceContract.graphBody"),
      chip: t("sourceContract.graphChip"),
      href: graphHref,
      cta: t("sourceContract.graphCta"),
    },
    {
      key: "agent",
      icon: Bot,
      label: t("sourceContract.agentLabel"),
      value: t("sourceContract.agentValue", {
        count: AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
      }),
      body: t("sourceContract.agentBody"),
      chip: t("sourceContract.agentChip"),
      href: "/ontology/insights/",
      cta: t("sourceContract.agentCta"),
      copyText: AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND,
      copyCta: t("sourceContract.agentCopyGate"),
      copyAriaLabel: t("sourceContract.agentCopyGateAriaLabel"),
      copySuccess: t("sourceContract.agentCopyGateSuccess"),
      proofMarkers: SOURCE_VAULT_RUNTIME_REPLAY_MARKERS,
    },
  ] as const;

  async function handleCopyGate(text: string, successMessage: string) {
    const ok = await copyGate(text);
    toast.show(ok ? successMessage : t("sourceContract.copyFailed"), ok ? "success" : "error");
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="docs-audit-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MOTION.fast}
          className="fixed inset-0 z-50 flex justify-center px-4"
          style={{ paddingTop: "max(96px, 18vh)" }}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <div
            className="fixed inset-0 -z-10 bg-[color:var(--docs-scrim)]"
            aria-hidden
          />
          <div
            id="docs-source-contract"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="docs-audit-modal-title"
            aria-describedby="docs-audit-modal-subtitle"
            style={{ width: "var(--docs-audit-modal-width)" }}
            className="h-fit max-h-[calc(100vh-2*max(96px,18vh))] max-w-full overflow-auto rounded-[var(--chrome-radius)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] shadow-[var(--chrome-shadow)]"
          >
            <div className="flex items-start gap-3 px-4 py-3.5">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[var(--chrome-radius-inner)] bg-[color:var(--chrome-active-surface)] text-[color:rgba(205,212,255,0.9)]">
                <HardDrive size={14} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  id="docs-audit-modal-title"
                  className="text-[15px] font-[650] text-[color:var(--color-text-primary)]"
                >
                  {t("header.contractToggleLabel")}
                </p>
                <p
                  id="docs-audit-modal-subtitle"
                  className="mt-0.5 text-[12px] text-[color:var(--color-text-tertiary)]"
                >
                  {t("sourceContract.modalSubtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                title={t("sourceContract.closeTitle")}
                aria-label={t("header.contractToggleHide")}
                className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]"
              >
                <X size={14} aria-hidden />
              </button>
            </div>

            {cells.map((cell) => {
              const Icon = cell.icon;
              return (
                <div
                  key={cell.key}
                  className="grid grid-cols-[36px_1fr] items-start gap-3 border-t border-[color:var(--color-divider)] px-4 py-3.5 sm:grid-cols-[36px_1fr_auto]"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a06)] text-[color:rgba(205,212,255,0.9)]">
                    <Icon size={14} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:rgba(200,210,255,0.82)]">
                        {cell.label}
                      </span>
                      <span className="rounded-sm border border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a06)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                        {cell.chip}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[12.5px] font-semibold text-[color:var(--color-text-primary)]">
                      {cell.value}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
                      {cell.body}
                    </p>
                    {"proofMarkers" in cell ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {cell.proofMarkers.map((marker) => (
                          <span
                            key={marker}
                            className="rounded-sm border border-[color:var(--color-indigo-line-a15)] bg-[color:var(--color-indigo-a06)] px-1.5 py-0.5 font-mono text-[9px] text-[color:var(--color-text-quaternary)]"
                          >
                            {marker}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="col-span-2 ml-[48px] flex min-w-0 flex-wrap items-center gap-1.5 sm:col-span-1 sm:ml-0 sm:flex-col sm:items-end">
                    <Link
                      href={cell.href}
                      className="inline-flex h-7 min-w-0 items-center rounded-sm border border-[color:var(--color-divider)] px-2 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a40)] hover:text-[color:var(--color-text-primary)]"
                    >
                      {cell.cta}
                    </Link>
                    {"copyText" in cell ? (
                      <button
                        type="button"
                        aria-label={cell.copyAriaLabel}
                        onClick={() => void handleCopyGate(cell.copyText, cell.copySuccess)}
                        className="inline-flex h-6 min-w-0 items-center gap-1 rounded-sm border border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a06)] px-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-line-a40)] hover:text-[color:var(--color-text-primary)]"
                      >
                        {copiedGate ? <Check size={10} aria-hidden /> : <Clipboard size={10} aria-hidden />}
                        <span className="truncate">{cell.copyCta}</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
