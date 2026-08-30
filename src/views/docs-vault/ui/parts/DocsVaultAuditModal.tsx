"use client";

import { useEffect, useRef } from "react";
import { badgeClass } from "@/shared/ui/badge-class";
import type { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, Check, Clipboard, GitCompareArrows, HardDrive, Network, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { MOTION } from "@/shared/motion";
import { Link } from "@/i18n/navigation";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { IconButton, controlClass, useToast } from "@/shared/ui";
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
  /**
   * Skill-copy parity — non-null **only on desktop, when the absolute path is known**.
   * `null` means the row is not drawn at all: not drawing a half-true row is this modal's
   * existing convention (the same grammar as the `useAgentFilesModel` gate).
   */
  skillParity?: SkillParityModel | null;
  /** Copies the diverged rows as a sentence to hand an agent — the caller composes the string. */
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
 * The docs check is a centre modal, replacing the old absolute band
 * (`DocsVaultSourceContractBar` with its uneven three-card grid): a vertical three-row stack
 * with hairline dividers, a scrim, and a focus trap. The proof markers
 * (`SOURCE_VAULT_RUNTIME_REPLAY_MARKERS`) and the graph-check copy gate are preserved
 * literally — they are the agent handoff contract.
 *
 * The open state is not persisted — a modal appearing on every page load violates modality, so
 * it always starts closed (the caller holds `contractOpen` as plain state).
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

    // Close on Esc.
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus trap — on open, focus moves to the first focusable inside the dialog and Tab cycles
  // rather than escaping. On close, focus is restored to the trigger (the check tile).
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

  // This modal is inline framer, outside the reach of the global reduced-motion kill layer, so
  // it branches here directly.
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
      // **Silent truncation reads as "we saw everything".** If the walk hit a limit or skipped a
      // cache directory, it is said **right where** the user reads the document count — written
      // on another screen, whoever trusts this number never sees it.
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
   * Row 4 — skill copies. **Why here and not the sidebar:** frequency decides placement. This
   * fact is looked at right after `agent-setup` and right after editing a skill — a few times a
   * month, not a few times a day. The sidebar is the permanent navigation surface for choosing a
   * document daily, and a permanent slot belongs to a permanent question.
   *
   * Measurement settled it (design council, hierarchy seat, 2026-07-29): at 1512×900, putting the
   * skill list in the sidebar makes the chrome above the tree **519px of 856px (61%)**, pushing
   * the vault tree — the docs surface's protagonist — below the fold. At 390px the sidebar is a
   * drawer and is not visible at all, whereas this modal's trigger is still in the top chrome at
   * that width.
   *
   * And this modal **already has the grammar for the job** — label, chip, value, one sentence, a
   * copy action on the right. This is a place to add one row to an existing workflow rather than
   * build new chrome.
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // Leaving is faster than entering — measured, the two were the same speed.
          transition={reducedMotion ? MOTION.fast : MOTION.base}
          className="fixed inset-0 z-50 flex justify-center px-4"
          style={{ paddingTop: "max(96px, 18vh)" }}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          {/* The scrim **does not receive clicks.** If it did, the outside-click test
              (`event.target === event.currentTarget`) would be false forever — the real target
              being this child — making outside-click-to-close a dead affordance (measured
              2026-07-29: the modal did not close). It handles the visuals only; the parent
              receives the event. */}
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
              <IconButton
                label={t("header.contractToggleHide")}
                onClick={onClose}
                title={t("sourceContract.closeTitle")}
                className="flex-none hover:text-[color:var(--color-text-primary)]"
              >
                <X size={ICON_SIZE.md} aria-hidden />
              </IconButton>
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
                  {/* The value is this row's attention winner — the same step as other rows'
                      values, but **the zero state does not shout**: all-agreed is neutral. */}
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
                  {/* **A mark every object receives carries zero bits** — what agrees is not
                      named. Only what diverges appears by name. */}
                  {disagreeing.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {disagreeing.map((row) => (
                        <span key={row.name}
                          data-testid={`docs-audit-skill-parity-${row.name}`}
                          data-verdict={row.verdict}
                          // `--color-amber-source-*` is the **warning ramp** — globals.css states
                          // `amber-source(244,183,49 == --color-status-warning)`. The quarantined
                          // token is the differently named `--color-amber-docs-*`.
                          // (The hierarchy seat confused the two and prescribed a swap; the
                          // design-system seat corrected it, catching a token with no gate.)
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
