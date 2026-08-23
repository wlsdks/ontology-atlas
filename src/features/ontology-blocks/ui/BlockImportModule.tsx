"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PackageOpen, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import { MOTION } from "@/shared/motion";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { isPickerAbort } from "@/shared/lib/picker-abort";
import {
  isTauriVaultRuntime,
  pickTauriVaultDirectory,
} from "@/shared/lib/tauri-vault-fs";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";
import { controlClass } from "@/shared/ui/control-class";
import { IconButton } from "@/shared/ui/controls";
import { useLocalVault } from "@/features/docs-vault-local";
import { parseBlockManifest, type BlockManifest } from "../model/block-manifest";
import { readBlockDirectory, type BlockDirectoryHandleLike } from "../model/block-fsa";
import {
  planBlockImport,
  type BlockConflictResolution,
  type BlockImportFile,
} from "../model/merge-plan";

interface PreviewSource {
  files: BlockImportFile[];
  blockName: string;
  sourceProject: string;
  manifest?: BlockManifest;
}

type InlineText = { kind: "done" | "error"; text: string } | null;

interface ImportUiState {
  preview: PreviewSource | null;
  inlineText: InlineText;
}

type ImportUiAction =
  | { type: "open-preview"; preview: PreviewSource }
  | { type: "close-preview" }
  | { type: "set-inline-text"; inlineText: InlineText }
  | { type: "complete-import"; text: string }
  | { type: "discard-invalid-preview"; preview: PreviewSource; text: string };

function importUiReducer(state: ImportUiState, action: ImportUiAction): ImportUiState {
  switch (action.type) {
    case "open-preview":
      return { preview: action.preview, inlineText: null };
    case "close-preview":
      return { ...state, preview: null };
    case "set-inline-text":
      return { ...state, inlineText: action.inlineText };
    case "complete-import":
      return { preview: null, inlineText: { kind: "done", text: action.text } };
    case "discard-invalid-preview":
      // A newly selected folder may have replaced this preview while React was
      // retrying the render. Discard only the identity that failed planning.
      if (state.preview !== action.preview) return state;
      return { preview: null, inlineText: { kind: "error", text: action.text } };
  }
}

/**
 * "Import a block" (the merge preview). A self-contained module mounted permanently
 * inside the global INDEX panel (`TopologyIndexPanel`) — the same contract as
 * `FirstRunStarterModule` (it supplies its own state and labels and adds zero prop
 * surface to its host).
 *
 * Absolute contract: **zero writes before approval.** Pick a folder → parse `.md` with the
 * shared parser → build a new/conflict report with the pure dry run `planBlockImport`, and
 * only once the user confirms in a scrim-backed dialog does it write through the existing
 * vault write path (`createDoc`). Conflicts resolve by skipping (the default) or by an
 * automatic block-name prefix — consistent with the CLI's `import --rename` down to the
 * -2/-3 fallback (see `merge-plan.ts`).
 *
 * Defect found in the 2026-07-23 usability sweep: with no local vault loaded (the static
 * sample) the "import a block" row vanished without a trace, which read as hiding that the
 * feature exists. It now stays in the same place, disabled with a hint that opening your
 * own folder enables it — the same grammar as `RealmBlockExportAction`'s degradation.
 */
export function BlockImportModule() {
  const t = useTranslations("ontologyBlocks");
  const { status, manifest, createDoc } = useLocalVault();
  const [{ preview, inlineText }, dispatchImportUi] = useReducer(importUiReducer, {
    preview: null,
    inlineText: null,
  });
  const [resolution, setResolution] = useState<BlockConflictResolution>("skip");

  /*
   * The conflict-resolution choice — the role was already correct, but **arrow-key
   * movement was missing** (it promised navigation and nothing happened).
   *
   * ⚠️ The container stays put: it is nearly the primitive canonical but uses `p-1`/`gap-1`
   * (the canonical is `p-px`/`gap-px`), and an inactive segment carries hover ink that is
   * not in the value layer. If it were only the inset, migrating would be right, but hover
   * is entangled, so container convergence waits until the hover axis is decided.
   */
  const resolutionGroup = useRovingRadioGroup<BlockConflictResolution>({
    value: resolution,
    values: ["skip", "prefix"],
    onChange: setResolution,
  });
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState(false);

  const existingSlugs = useMemo(
    () => new Set(manifest?.docs.map((d) => d.slug) ?? []),
    [manifest],
  );

  const existingUidClaims = useMemo(() => {
    const claims = new Set<string>();
    for (const doc of manifest?.docs ?? []) {
      const uid = doc.frontmatter.uid;
      if (typeof uid === "string" && uid.trim()) claims.add(uid.trim());
      const merged = doc.frontmatter.merged_uids;
      if (Array.isArray(merged)) {
        for (const value of merged) {
          if (typeof value === "string" && value.trim()) claims.add(value.trim());
        }
      }
    }
    return claims;
  }, [manifest]);

  const { plan, planError } = useMemo(() => {
    if (!preview) return { plan: null, planError: false };
    try {
      return {
        plan: planBlockImport(preview.files, existingSlugs, {
          resolution,
          blockName: preview.blockName,
          sourceProject: preview.sourceProject,
          manifest: preview.manifest,
          existingUidClaims,
        }),
        planError: false,
      };
    } catch {
      return { plan: null, planError: true };
    }
  }, [preview, existingSlugs, existingUidClaims, resolution]);

  if (planError && preview) {
    dispatchImportUi({ type: "discard-invalid-preview", preview, text: t("importError") });
  }

  const vaultLoaded = status === "loaded" && Boolean(manifest);
  const open = preview !== null;
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatchImportUi({ type: "close-preview" });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Decided by whether it can be called, not by key presence (`in`) — judging "supported"
  // in an environment where the value is undefined paints a raw JS error where the user
  // copy belongs. The installed app uses a Tauri picker/shim implementing the same folder IO contract.
  const supported =
    (typeof window !== "undefined" && typeof window.showDirectoryPicker === "function") ||
    isTauriVaultRuntime();

  const pickBlockFolder = async () => {
    if (!vaultLoaded) return;
    dispatchImportUi({ type: "set-inline-text", inlineText: null });
    try {
      const dir = (isTauriVaultRuntime()
        ? await pickTauriVaultDirectory(t("importAria"))
        : await (
            window as unknown as {
              showDirectoryPicker: (opts?: {
                mode?: "read" | "readwrite";
              }) => Promise<unknown>;
            }
          ).showDirectoryPicker({ mode: "read" })) as BlockDirectoryHandleLike | null;
      if (!dir) return;
      const { files, manifestRaw } = await readBlockDirectory(dir);
      if (files.length === 0) {
        dispatchImportUi({ type: "set-inline-text", inlineText: { kind: "error", text: t("importEmpty") } });
        return;
      }
      const blockManifest = manifestRaw ? parseBlockManifest(manifestRaw) : null;
      if (manifestRaw && !blockManifest) {
        throw new Error("Invalid ontology block manifest");
      }
      setResolution("skip");
      setDialogError(false);
      dispatchImportUi({
        type: "open-preview",
        preview: {
          files,
          blockName: blockManifest?.blockName?.trim() || dir.name,
          sourceProject: blockManifest?.sourceProject?.trim() || dir.name,
          ...(blockManifest ? { manifest: blockManifest } : {}),
        },
      });
    } catch (err) {
      if (isPickerAbort(err)) return;
      dispatchImportUi({ type: "set-inline-text", inlineText: { kind: "error", text: t("importError") } });
    }
  };

  const confirmImport = async () => {
    if (!preview || !plan || plan.writes.length === 0 || busy) return;
    setBusy(true);
    setDialogError(false);
    try {
      for (let i = 0; i < plan.writes.length; i += 1) {
        const write = plan.writes[i];
        // Reload the manifest only on the last write — the same contract as bootstrap's run of creates.
        await createDoc(write.slug, write.content, {
          skipRefresh: i < plan.writes.length - 1,
        });
      }
      dispatchImportUi({ type: "complete-import", text: t("importDone", { count: plan.writes.length }) });
    } catch {
      setDialogError(true);
    } finally {
      setBusy(false);
    }
  };

  const newEntries = plan?.entries.filter((e) => e.status === "new") ?? [];
  const conflictEntries =
    plan?.entries.filter(
      (e) => e.status === "conflict-skipped" || e.status === "conflict-renamed",
    ) ?? [];

  return (
    <>
        {/* The same quiet row grammar as the "documents not on the map" row — no permanent button noise. */}
      <button
        type="button"
        onClick={() => void pickBlockFolder()}
        disabled={!vaultLoaded || !supported}
        title={
          !vaultLoaded
            ? t("vaultRequiredHint")
            : supported
              ? t("importAria")
              : t("exportUnsupportedHint")
        }
        data-testid="block-import-open"
        className={controlClass({
          shape: "chip",
          className:
            "mt-2 shrink-0 border-[color:var(--topology-v2-panel-border)] text-left enabled:hover:bg-[color:var(--topology-v2-panel-row-hover)]",
        })}
      >
        <PackageOpen
          size={ICON_SIZE.sm}
          aria-hidden="true"
          className="shrink-0 text-[color:var(--topology-v2-panel-text-quaternary)]"
        />
        <span className="min-w-0 flex-1 truncate text-[color:var(--topology-v2-panel-text-tertiary)]">
          {t("importAction")}
        </span>
        {inlineText ? (
          <span
            data-testid="block-import-inline"
            className={`shrink-0 truncate ${
              inlineText.kind === "error"
                ? "text-[color:var(--color-status-danger)]"
                : "text-[color:var(--topology-v2-panel-text-quaternary)]"
            }`}
          >
            {inlineText.text}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open && plan && preview ? (
          <motion.div
            data-interactive-overlay="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={MOTION.base}
            className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--color-backdrop-medium)] p-6"
            onClick={() => dispatchImportUi({ type: "close-preview" })}
          >
            <motion.section
              initial={{ opacity: 0, y: 12, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.985 }}
              transition={MOTION.base}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={t("dialogAria")}
              data-testid="block-import-dialog"
              className="flex max-h-[calc(100vh-3rem)] w-full max-w-[440px] flex-col overflow-hidden rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-3)]"
            >
              <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-5 py-4">
                <div className="min-w-0">
                  <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-accent)]">
                    {t("dialogTitle")}
                  </p>
                  <p className="mt-1 truncate text-body text-[color:var(--color-text-secondary)]">
                    {t("blockLine", {
                      blockName: preview.blockName,
                      count: preview.files.length,
                    })}
                  </p>
                  <p className="mt-0.5 text-label text-[color:var(--color-text-quaternary)]">
                    {t("dialogSubtitle")}
                  </p>
                </div>
                <IconButton
                  label={t("closeAria")}
                  onClick={() => dispatchImportUi({ type: "close-preview" })}
                  data-testid="block-import-close"
                  className="hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]"
                >
                  <X size={ICON_SIZE.md} />
                </IconButton>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <section data-testid="block-import-new">
                  <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                    {t("newHeading", { count: newEntries.length })}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {newEntries.map((entry) => (
                      <li
                        key={entry.originalSlug}
                        className="flex items-baseline justify-between gap-3 text-body"
                      >
                        <span className="min-w-0 truncate text-[color:var(--color-text-secondary)]">
                          {entry.title}
                        </span>
                        <span className="shrink-0 font-mono text-label text-[color:var(--color-text-quaternary)]">
                          {entry.finalSlug}
                        </span>
                      </li>
                    ))}
                    {newEntries.length === 0 ? (
                      <li className="text-label text-[color:var(--color-text-quaternary)]">—</li>
                    ) : null}
                  </ul>
                </section>

                <section data-testid="block-import-conflicts" className="mt-4">
                  <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                    {t("conflictHeading", { count: conflictEntries.length })}
                  </p>
                  {conflictEntries.length === 0 ? (
                    <p className="mt-1.5 text-label text-[color:var(--color-text-quaternary)]">
                      {t("conflictNone")}
                    </p>
                  ) : (
                    <>
                      <ul className="mt-1.5 space-y-1">
                        {conflictEntries.map((entry) => (
                          <li
                            key={entry.originalSlug}
                            className="flex min-w-0 items-baseline gap-2 text-body"
                          >
                            <span className="min-w-0 truncate font-mono text-label text-[color:var(--color-text-secondary)]">
                              {entry.originalSlug}
                            </span>
                            {entry.status === "conflict-renamed" ? (
                              <span className="min-w-0 truncate font-mono text-label text-[color:var(--color-indigo-accent)]">
                                → {entry.finalSlug}
                              </span>
                            ) : (
                              <span className="shrink-0 text-label text-[color:var(--color-text-quaternary)]">
                                {t("skippedTag")}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <div
                        {...resolutionGroup.groupProps}
                        aria-label={t("resolutionLabel")}
                        className="mt-2.5 grid grid-cols-2 gap-1 rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-1"
                      >
                        <button
                          {...resolutionGroup.itemProps(0)}
                          type="button"
                          data-testid="block-import-resolution-skip"
                          className={controlClass({
                            shape: "segment",
                            truncate: true,
                            active: resolution === "skip",
                            className: "min-w-0 hover:text-[color:var(--color-text-primary)]",
                          })}
                        >
                          {t("resolutionSkip")}
                        </button>
                        <button
                          {...resolutionGroup.itemProps(1)}
                          type="button"
                          data-testid="block-import-resolution-prefix"
                          className={controlClass({
                            shape: "segment",
                            truncate: true,
                            active: resolution === "prefix",
                            className: "min-w-0 hover:text-[color:var(--color-text-primary)]",
                          })}
                        >
                          {t("resolutionPrefix")}
                        </button>
                      </div>
                    </>
                  )}
                </section>

                {plan.kindlessCount > 0 ? (
                  <p className="mt-3 text-label text-[color:var(--color-text-quaternary)]">
                    {t("kindlessNote", { count: plan.kindlessCount })}
                  </p>
                ) : null}

                {dialogError ? (
                  <p role="alert" className="mt-3 text-label text-[color:var(--color-status-danger)]">
                    {t("importWriteError")}
                  </p>
                ) : null}
              </div>

              <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-5 py-3">
                <button
                  type="button"
                  onClick={() => dispatchImportUi({ type: "close-preview" })}
                  data-testid="block-import-cancel"
                  className={controlClass({
                    shape: "segment",
                    size: "lg",
                    className:
                      "hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]",
                  })}
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void confirmImport()}
                  disabled={busy || plan.writes.length === 0}
                  data-testid="block-import-confirm"
                  className={controlClass({
                    shape: "segment",
                    size: "lg",
                    tone: "onAccent",
                    className: "enabled:hover:bg-[color:var(--color-indigo-brand-hover)]",
                  })}
                >
                  {busy ? t("confirmBusy") : t("confirm", { count: plan.writes.length })}
                </button>
              </footer>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
