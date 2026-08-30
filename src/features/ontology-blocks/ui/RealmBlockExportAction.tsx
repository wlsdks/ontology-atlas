"use client";

import { useState } from "react";
import { PackagePlus } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import { useLocalVault } from "@/entities/vault-session";
import type { OntologyTreeNode } from "@/entities/knowledge-graph";
import { isPickerAbort } from "@/shared/lib/picker-abort";
import {
  isTauriVaultRuntime,
  pickTauriVaultDirectory,
} from "@/shared/lib/tauri-vault-fs";
import { buildBlockManifest, type BlockCensus } from "../model/block-manifest";
import { writeBlockToDirectory, type BlockDirectoryHandleLike } from "../model/block-fsa";
import { collectSubtreeNodeIds, selectRealmBlockDocs } from "../model/collect-realm-block";
import { controlClass } from '@/shared/ui/control-class';

export interface RealmBlockExportActionProps {
  /** The realm root's title — this becomes the block name. */
  rootTitle: string;
  /** The realm census, carried into the manifest verbatim (same source as `TopologyRealmLedger`). */
  census: BlockCensus;
  /** The realm subtree — the source of truth for which nodes are exported. */
  subtree: OntologyTreeNode;
}

type ExportPhase = "idle" | "exporting" | "done" | "error";

/**
 * "Export this realm as a block", living as a quiet text action in the header of the
 * active realm's left panel (`TopologyRealmLedger`). A block is just a folder of `.md`:
 * the **original `.md` of every node in the realm subtree is copied verbatim**, with a
 * single `block-manifest.json` calling card alongside (no new file format — the
 * local-first charter in AGENTS.md).
 *
 * The same self-contained module contract as `FirstRunStarterModule` — it reads vault
 * state (`useLocalVault`) and labels (the `ontologyBlocks` i18n namespace) itself, so it
 * does not grow the host widget's prop surface.
 *
 * Defect found in the 2026-07-23 usability sweep: with no local vault loaded (the static
 * sample) this action vanished without a trace, which read as hiding that the feature
 * exists. It now stays in the same place, disabled with a hint that opening your own folder
 * enables it — the same "no directory picker means disabled plus a hint" degradation
 * pattern already established, just extended to the vault-not-loaded reason. Not a new pattern.
 */
export function RealmBlockExportAction({
  rootTitle,
  census,
  subtree,
}: RealmBlockExportActionProps) {
  const t = useTranslations("ontologyBlocks");
  const { status, manifest, fileHandles, handle } = useLocalVault();
  const [phase, setPhase] = useState<ExportPhase>("idle");
  const [exportedCount, setExportedCount] = useState(0);

  const vaultLoaded = status === "loaded" && Boolean(manifest);
  // Decided by whether it can be called, not by key presence (`in`); the installed app uses
  // a Tauri picker/shim implementing the same `FileSystemDirectoryHandle` contract.
  const supported =
    (typeof window !== "undefined" && typeof window.showDirectoryPicker === "function") ||
    isTauriVaultRuntime();

  const runExport = async () => {
    if (phase === "exporting" || !vaultLoaded || !manifest) return;
    setPhase("exporting");
    try {
      const target = (isTauriVaultRuntime()
        ? await pickTauriVaultDirectory(t("exportAria"))
        : await (
            window as unknown as {
              showDirectoryPicker: (opts?: {
                mode?: "read" | "readwrite";
              }) => Promise<BlockDirectoryHandleLike>;
            }
          ).showDirectoryPicker({ mode: "readwrite" })) as BlockDirectoryHandleLike | null;
      if (!target) {
        setPhase("idle");
        return;
      }

      const realmDocs = selectRealmBlockDocs(collectSubtreeNodeIds(subtree), manifest.docs);
      const files: { slug: string; content: string }[] = [];
      for (const doc of realmDocs) {
        const fh = fileHandles.get(doc.slug);
        if (!fh) continue; // skip entries with no file handle, such as a static fallback doc
        files.push({ slug: doc.slug, content: await (await fh.getFile()).text() });
      }
      const projectDoc = manifest.docs.find(
        (d) => typeof d.frontmatter.kind === "string" && d.frontmatter.kind.trim() === "project",
      );
      const blockManifest = buildBlockManifest({
        blockName: rootTitle,
        sourceProject: projectDoc?.title?.trim() || handle?.name || "",
        // App code — the workflow determinism rule does not apply here, so ISO serialization from Date.now.
        exportedAt: new Date(Date.now()).toISOString(),
        census,
        nodes: realmDocs,
      });
      await writeBlockToDirectory(
        target,
        files,
        `${JSON.stringify(blockManifest, null, 2)}\n`,
      );
      setExportedCount(files.length);
      setPhase("done");
    } catch (err) {
      if (isPickerAbort(err)) {
        setPhase("idle");
        return;
      }
      setPhase("error");
    }
  };

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {phase === "done" ? (
        <span
          data-testid="realm-block-export-done"
          className="truncate text-label text-[color:var(--topology-v2-panel-text-quaternary)]"
        >
          {t("exportDone", { count: exportedCount })}
        </span>
      ) : null}
      {phase === "error" ? (
        <span
          role="alert"
          data-testid="realm-block-export-error"
          className="truncate text-label text-[color:var(--color-status-danger)]"
        >
          {t("exportError")}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => void runExport()}
        disabled={!vaultLoaded || !supported || phase === "exporting"}
        aria-label={t("exportAria")}
        title={
          !vaultLoaded
            ? t("vaultRequiredHint")
            : supported
              ? t("exportAria")
              : t("exportUnsupportedHint")
        }
        data-testid="realm-block-export"
        className={controlClass({
          shape: "segment",
          size: "sm",
          tone: "muted",
          scope: "panel",
          className:
            "shrink-0 enabled:hover:text-[color:var(--topology-v2-panel-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset",
        })}
      >
        <PackagePlus size={ICON_SIZE.sm} aria-hidden="true" />
        {phase === "exporting" ? t("exportBusy") : t("exportAction")}
      </button>
    </span>
  );
}
