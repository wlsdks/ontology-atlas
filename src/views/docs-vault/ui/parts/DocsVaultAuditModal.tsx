"use client";

import { useEffect, useRef } from "react";
import { badgeClass } from "@/shared/ui/badge-class";
import type { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, Check, Clipboard, GitCompareArrows, HardDrive, Network } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { EXIT_TRANSITION, MOTION, useExitLockout } from "@/shared/motion";
import { Link } from "@/i18n/navigation";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { CloseButton, controlClass, useToast } from "@/shared/ui";
import {
  AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
  AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND,
} from "@/entities/knowledge-graph";
import type { VaultManifest } from "@/entities/docs-vault";
import type { SkillParityModel, SkillParityRow } from "../../lib/skill-parity";

const SOURCE_VAULT_RUNTIME_REPLAY_MARKERS = [
  "relation_name_parity",
  "pattern_walk/project_map",
] as const;

export interface DocsVaultAuditModalProps {
  /** Non-null only on desktop with a known absolute path; `null` draws no row rather than a half-true one. */
  skillParity?: SkillParityModel | null;
  /** The caller composes the handoff sentence. */
  onCopySkillParityHandoff?: (rows: SkillParityRow[]) => void;
  open: boolean;
  manifest: VaultManifest;
  nodeCount: number;
  edgeCount: number;
  graphHref: string;
  isLocalSourceLoaded: boolean;
  onClose: () => void;
  t: ReturnType<typeof useTranslations<"docsVault">>;
  tSkillParity: ReturnType<typeof useTranslations<"skillParity">>;
}

/**
 * The docs check modal. The proof markers (`SOURCE_VAULT_RUNTIME_REPLAY_MARKERS`) and the
 * graph-check copy are the agent handoff contract and stay literal. Open state is not persisted.
 */
export function DocsVaultAuditModal({
  skillParity = null,
  onCopySkillParityHandoff,
  open,
  manifest,
  nodeCount,
  edgeCount,
  graphHref,
  isLocalSourceLoaded,
  onClose,
  tSkillParity,
  t,
}: DocsVaultAuditModalProps) {
  const toast = useToast();
  const { state: gateCopyState, copy: copyGate } = useCopyFeedback(1500);
  const copiedGate = gateCopyState === "copied";
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const { ref: scrimLockoutRef, onAnimationStart: scrimLockoutOnAnimationStart } = useExitLockout<HTMLDivElement>();

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus trap: focus the first control on open, cycle Tab, restore the trigger on close.
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

  // Inline framer sits outside the global reduced-motion layer, so it branches here.
  const reducedMotion = useReducedMotion();

  const sourceLabel = isLocalSourceLoaded
    ? t("sourceContract.filesLocalValue", { count: manifest.docs.length })
    : t("sourceContract.filesSampleValue", { count: manifest.docs.length });

  const cells = [
    {
      key: "files",
      icon: HardDrive,
      label: t("sourceContract.filesLabel"),
      value: sourceLabel,
      // A limited or skipped walk is said beside the document count, or the count reads as complete.
      body: [
        t("sourceContract.filesBody"),
        manifest.walkTruncated ? t("sourceContract.filesTruncated") : "",
        manifest.prunedDirs?.length
          ? t("sourceContract.filesPruned", {
              count: manifest.prunedDirs.length,
              names: manifest.prunedDirs.slice(0, 3).join(" · "),
            })
          : "",
      ]
        .filter(Boolean)
        .join(" "),
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

  /**
   * Skill copies live here, not in the sidebar: they are checked a few times a month, and a
   * sidebar slot pushes the vault tree down.
   */
  const skillParityRows = skillParity?.rows ?? [];
  const disagreeing = skillParityRows.filter((row) => row.verdict !== "agreed");

  async function handleCopyGate(text: string, successMessage: string) {
    const ok = await copyGate(text);
    toast.show(ok ? successMessage : t("sourceContract.copyFailed"), ok ? "success" : "error");
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="docs-audit-modal"
          ref={scrimLockoutRef}
          onAnimationStart={scrimLockoutOnAnimationStart}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: EXIT_TRANSITION }}
          // Leaving is faster than entering.
          transition={reducedMotion ? MOTION.fast : MOTION.base}
          className="fixed inset-0 z-50 flex justify-center px-4"
          style={{ paddingTop: "max(96px, 18vh)" }}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          {/* The scrim takes no clicks, or the parent's `event.target === event.currentTarget`
             outside-click check never matches. */}
          <div
            className="pointer-events-none fixed inset-0 -z-10 bg-[color:var(--docs-scrim)]"
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
            className="h-fit max-h-[calc(100dvh-2*max(96px,18vh))] max-w-full overflow-auto rounded-[var(--chrome-radius)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] shadow-[var(--chrome-shadow)]"
          >
            <div className="flex items-start gap-3 px-4 py-3.5">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[var(--chrome-radius-inner)] bg-[color:var(--chrome-active-surface)] text-[color:var(--color-indigo-pale-a90)]">
                <HardDrive size={ICON_SIZE.md} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  id="docs-audit-modal-title"
                  className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
                >
                  {t("header.contractToggleLabel")}
                </p>
                <p
                  id="docs-audit-modal-subtitle"
                  className="mt-0.5 text-body text-[color:var(--color-text-tertiary)]"
                >
                  {t("sourceContract.modalSubtitle")}
                </p>
              </div>
              <CloseButton
                label={t("header.contractToggleHide")}
                onClick={onClose}
                title={t("sourceContract.closeTitle")}
                className="flex-none"
              />
            </div>

            {cells.map((cell) => {
              const Icon = cell.icon;
              return (
                <div
                  key={cell.key}
                  className="grid grid-cols-[36px_1fr] items-start gap-3 border-t border-[color:var(--color-divider)] px-4 py-3.5 sm:grid-cols-[36px_1fr_auto]"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a06)] text-[color:var(--color-indigo-pale-a90)]">
                    <Icon size={14} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-pale-a82)]">
                        {cell.label}
                      </span>
                      <span className={badgeClass({ shape: "micro", className: "border border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a06)] font-mono uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]" })}>
                        {cell.chip}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                      {cell.value}
                    </p>
                    <p className="mt-0.5 text-label leading-label text-[color:var(--color-text-tertiary)]">
                      {cell.body}
                    </p>
                    {"proofMarkers" in cell ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {cell.proofMarkers.map((marker) => (
                          <span key={marker}
                            className={badgeClass({ shape: "micro", className: "border border-[color:var(--color-indigo-line-a15)] bg-[color:var(--color-indigo-a06)] font-mono text-[color:var(--color-text-quaternary)]" })}
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
                      className={controlClass({ shape: "chip", tone: "secondary", className: "h-7 min-w-0 border-[color:var(--color-divider)] px-2 text-label hover:border-[color:var(--color-indigo-line-a40)] hover:text-[color:var(--color-text-primary)]" })}
                    >
                      {cell.cta}
                    </Link>
                    {"copyText" in cell ? (
                      <button
                        type="button"
                        aria-label={cell.copyAriaLabel}
                        onClick={() => void handleCopyGate(cell.copyText, cell.copySuccess)}
                        className={controlClass({
                          shape: "chip",
                          size: "sm",
                          className:
                            "min-w-0 gap-1 font-mono uppercase tracking-[var(--tracking-caps-08)] hover:border-[color:var(--color-indigo-line-a40)] hover:text-[color:var(--color-text-primary)]",
                        })}
                      >
                        {copiedGate ? <Check size={ICON_SIZE.sm} aria-hidden /> : <Clipboard size={ICON_SIZE.sm} aria-hidden />}
                        <span className="truncate">{cell.copyCta}</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {skillParityRows.length > 0 ? (
              <div
                data-testid="docs-audit-skill-parity"
                className="grid grid-cols-[36px_1fr] items-start gap-3 border-t border-[color:var(--color-divider)] px-4 py-3.5 sm:grid-cols-[36px_1fr_auto]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a06)] text-[color:var(--color-indigo-pale-a90)]">
                  <GitCompareArrows size={ICON_SIZE.md} aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-pale-a82)]">
                      {tSkillParity("header")}
                    </span>
                    <span className={badgeClass({ shape: "micro", className: "border border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a06)] font-mono uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]" })}>
                      {tSkillParity("chip")}
                    </span>
                  </div>
                  {/* All-agreed is neutral; only a divergence draws attention. */}
                  <p
                    data-testid="docs-audit-skill-parity-value"
                    className="mt-0.5 truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]"
                  >
                    {disagreeing.length > 0
                      ? tSkillParity("valueDisagreeing", {
                          total: skillParityRows.length,
                          count: disagreeing.length,
                        })
                      : tSkillParity("valueAgreed", { total: skillParityRows.length })}
                  </p>
                  <p className="mt-0.5 text-label leading-label text-[color:var(--color-text-tertiary)]">
                    {tSkillParity("body")}
                  </p>
                  {/* Only what diverges is named. */}
                  {disagreeing.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {disagreeing.map((row) => (
                        <span key={row.name}
                          data-testid={`docs-audit-skill-parity-${row.name}`}
                          data-verdict={row.verdict}
                          // `--color-amber-source-*` is the warning ramp (globals.css); the quarantined one is `--color-amber-docs-*`.
                          className={badgeClass({ shape: "micro", className: "border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] font-mono text-[color:var(--color-amber-source-a90)]" })}
                        >
                          {row.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="col-span-2 ml-[48px] flex min-w-0 flex-wrap items-center gap-1.5 sm:col-span-1 sm:ml-0 sm:flex-col sm:items-end">
                  {disagreeing.length > 0 && onCopySkillParityHandoff ? (
                    <button
                      type="button"
                      data-testid="docs-audit-skill-parity-copy"
                      onClick={() => onCopySkillParityHandoff(disagreeing)}
                      className={controlClass({
                          shape: "chip",
                          size: "sm",
                          className:
                            "min-w-0 gap-1 font-mono uppercase tracking-[var(--tracking-caps-08)] hover:border-[color:var(--color-indigo-line-a40)] hover:text-[color:var(--color-text-primary)]",
                        })}
                    >
                      <Clipboard size={ICON_SIZE.sm} aria-hidden />
                      <span className="truncate">{tSkillParity("copyHandoff")}</span>
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
