"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PackageOpen, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { MOTION } from "@/shared/motion";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { isPickerAbort } from "@/shared/lib/picker-abort";
import {
  isTauriVaultRuntime,
  pickTauriVaultDirectory,
} from "@/shared/lib/tauri-vault-fs";
import { useLocalVault } from "@/features/docs-vault-local";
import { parseBlockManifest } from "../model/block-manifest";
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
}

/**
 * 온톨로지 블록 Slice A — "블록 가져오기" (병합 프리뷰). 전역 INDEX 패널
 * (`TopologyIndexPanel`) 안에 상시 마운트되는 자립 모듈 — FirstRunStarterModule
 * 과 같은 계약(상태·라벨 자급, 호스트 prop 표면 0).
 *
 * 절대 계약: **승인 전 쓰기 0.** 폴더 선택 → 공유 파서로 .md 파싱 →
 * `planBlockImport` 순수 dry-run 으로 신규/충돌 리포트만 만든 뒤, 사용자가
 * scrim 딸린 다이얼로그에서 확인해야만 기존 vault 쓰기 경로(`createDoc`)로
 * 기록한다. 충돌 해소는 건너뛰기(기본) 또는 블록명 자동 접두사 — CLI
 * `import --rename` 과 같은 -2/-3 폴백까지 정합 (`merge-plan.ts` 참고).
 *
 * P1 결함② (사용성 전수 검수 2026-07-23) — 로컬 vault 미로드(정적 샘플)일 때
 * "블록 가져오기" 행이 흔적 없이 사라져 "기능 존재 은폐"로 읽혔다. 이제
 * 같은 자리에 disabled + "내 폴더를 열면 쓸 수 있어요" 힌트로 남는다 —
 * `RealmBlockExportAction` G1 강등과 같은 문법.
 */
export function BlockImportModule() {
  const t = useTranslations("ontologyBlocks");
  const { status, manifest, createDoc } = useLocalVault();
  const [preview, setPreview] = useState<PreviewSource | null>(null);
  const [resolution, setResolution] = useState<BlockConflictResolution>("skip");
  const [busy, setBusy] = useState(false);
  const [inlineText, setInlineText] = useState<{ kind: "done" | "error"; text: string } | null>(
    null,
  );
  const [dialogError, setDialogError] = useState(false);

  const vaultLoaded = status === "loaded" && Boolean(manifest);
  const open = preview !== null;
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const existingSlugs = useMemo(
    () => new Set(manifest?.docs.map((d) => d.slug) ?? []),
    [manifest],
  );

  const plan = useMemo(() => {
    if (!preview) return null;
    return planBlockImport(preview.files, existingSlugs, {
      resolution,
      blockName: preview.blockName,
      sourceProject: preview.sourceProject,
    });
  }, [preview, existingSlugs, resolution]);

  // 키 존재(`in`)가 아니라 호출 가능한지로 판정 — 값이 undefined 인 환경에서
  // "지원함"으로 오판하면 원문 JS 오류가 사용자 문구 자리에 그려진다.
  // 설치 앱은 같은 폴더 IO 계약을 구현한 Tauri picker/shim을 사용한다.
  const supported =
    (typeof window !== "undefined" && typeof window.showDirectoryPicker === "function") ||
    isTauriVaultRuntime();

  const pickBlockFolder = async () => {
    if (!vaultLoaded) return;
    setInlineText(null);
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
        setInlineText({ kind: "error", text: t("importEmpty") });
        return;
      }
      const blockManifest = manifestRaw ? parseBlockManifest(manifestRaw) : null;
      setResolution("skip");
      setDialogError(false);
      setPreview({
        files,
        blockName: blockManifest?.blockName?.trim() || dir.name,
        sourceProject: blockManifest?.sourceProject?.trim() || dir.name,
      });
    } catch (err) {
      if (isPickerAbort(err)) return;
      setInlineText({ kind: "error", text: t("importError") });
    }
  };

  const confirmImport = async () => {
    if (!preview || !plan || plan.writes.length === 0 || busy) return;
    setBusy(true);
    setDialogError(false);
    try {
      for (let i = 0; i < plan.writes.length; i += 1) {
        const write = plan.writes[i];
        // 마지막 쓰기에서만 매니페스트 리로드 — 부트스트랩 연속 생성과 같은 계약.
        await createDoc(write.slug, write.content, {
          skipRefresh: i < plan.writes.length - 1,
        });
      }
      setPreview(null);
      setInlineText({ kind: "done", text: t("importDone", { count: plan.writes.length }) });
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
      {/* "지도에 없는 문서" 행과 같은 조용한 행 문법 — 상시 버튼 소음 금지. */}
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
        className="mt-2 flex shrink-0 items-center gap-2 rounded-[var(--chrome-radius-inner)] border border-[color:var(--topology-v2-panel-border)] px-2 py-1.5 text-left text-label transition-colors enabled:hover:bg-[color:var(--topology-v2-panel-row-hover)] disabled:opacity-50"
      >
        <PackageOpen
          size={11}
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
            onClick={() => setPreview(null)}
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
              className="flex max-h-[calc(100vh-3rem)] w-full max-w-[440px] flex-col overflow-hidden rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-3)]"
            >
              <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-5 py-4">
                <div className="min-w-0">
                  <p className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
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
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  aria-label={t("closeAria")}
                  data-testid="block-import-close"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]"
                >
                  <X size={14} />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <section data-testid="block-import-new">
                  <p className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
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
                  <p className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
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
                        role="radiogroup"
                        aria-label={t("resolutionLabel")}
                        className="mt-2.5 grid grid-cols-2 gap-1 rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-1"
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={resolution === "skip"}
                          data-testid="block-import-resolution-skip"
                          onClick={() => setResolution("skip")}
                          className={`min-w-0 truncate rounded-[var(--chrome-radius-inner)] px-2 py-1 text-label transition-colors ${
                            resolution === "skip"
                              ? "bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]"
                              : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]"
                          }`}
                        >
                          {t("resolutionSkip")}
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={resolution === "prefix"}
                          data-testid="block-import-resolution-prefix"
                          onClick={() => setResolution("prefix")}
                          className={`min-w-0 truncate rounded-[var(--chrome-radius-inner)] px-2 py-1 text-label transition-colors ${
                            resolution === "prefix"
                              ? "bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]"
                              : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]"
                          }`}
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
                  onClick={() => setPreview(null)}
                  data-testid="block-import-cancel"
                  className="rounded-md px-3 py-1.5 text-body text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void confirmImport()}
                  disabled={busy || plan.writes.length === 0}
                  data-testid="block-import-confirm"
                  className="rounded-md bg-[color:var(--color-indigo-brand)] px-3 py-1.5 text-body font-medium text-white transition-colors enabled:hover:bg-[color:var(--color-indigo-accent)] disabled:opacity-50"
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
