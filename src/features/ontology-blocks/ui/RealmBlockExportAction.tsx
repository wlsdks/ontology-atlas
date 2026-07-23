"use client";

import { useState } from "react";
import { PackagePlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocalVault } from "@/features/docs-vault-local";
import type { OntologyTreeNode } from "@/shared/lib/ontology-tree";
import { buildBlockManifest, type BlockCensus } from "../model/block-manifest";
import { writeBlockToDirectory, type BlockDirectoryHandleLike } from "../model/block-fsa";
import { collectSubtreeNodeIds, selectRealmBlockDocs } from "../model/collect-realm-block";

export interface RealmBlockExportActionProps {
  /** 영역 루트 제목 — 블록 이름이 된다. */
  rootTitle: string;
  /** 영역 census — 매니페스트에 그대로 실린다 (TopologyRealmLedger 와 같은 출처). */
  census: BlockCensus;
  /** 영역 서브트리 — export 대상 노드 집합의 진실원. */
  subtree: OntologyTreeNode;
}

type ExportPhase = "idle" | "exporting" | "done" | "error";

/**
 * 온톨로지 블록 Slice A — "이 영역을 블록으로 내보내기". realm 활성 좌측
 * 패널(`TopologyRealmLedger`) 헤더의 조용한 텍스트 액션으로 산다. 블록 =
 * 그냥 .md 폴더: realm 서브트리에 속한 노드의 **원본 .md 를 그대로 복사**
 * 하고 `block-manifest.json` 명함 하나만 곁들인다 (새 파일 포맷 금지 —
 * AGENTS.md 로컬-퍼스트 헌장).
 *
 * FirstRunStarterModule 과 같은 자립 모듈 계약 — vault 상태(`useLocalVault`)
 * 와 라벨(`ontologyBlocks` i18n)을 스스로 읽어, 호스트 위젯의 prop 표면을
 * 늘리지 않는다. 로컬 vault 미로드(정적 샘플)면 렌더 자체를 하지 않고,
 * 디렉터리 picker 가 없는 환경(Safari/Firefox·일부 WebView)은 비활성 +
 * 짧은 힌트로 사전 강등한다 (G1 — 눌러야 실패 금지).
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

  if (status !== "loaded" || !manifest) return null;

  const supported =
    typeof window !== "undefined" && "showDirectoryPicker" in window;

  const runExport = async () => {
    if (phase === "exporting") return;
    setPhase("exporting");
    try {
      const target = (await (
        window as unknown as {
          showDirectoryPicker: (opts?: {
            mode?: "read" | "readwrite";
          }) => Promise<BlockDirectoryHandleLike>;
        }
      ).showDirectoryPicker({ mode: "readwrite" })) as BlockDirectoryHandleLike;

      const realmDocs = selectRealmBlockDocs(collectSubtreeNodeIds(subtree), manifest.docs);
      const files: { slug: string; content: string }[] = [];
      for (const doc of realmDocs) {
        const fh = fileHandles.get(doc.slug);
        if (!fh) continue; // 정적 fallback doc 등 파일 핸들 없는 항목은 건너뜀
        files.push({ slug: doc.slug, content: await (await fh.getFile()).text() });
      }
      const projectDoc = manifest.docs.find(
        (d) => typeof d.frontmatter.kind === "string" && d.frontmatter.kind.trim() === "project",
      );
      const blockManifest = buildBlockManifest({
        blockName: rootTitle,
        sourceProject: projectDoc?.title?.trim() || handle?.name || "",
        // 앱 코드 — 워크플로 결정론 규율 비적용, Date.now 기반 ISO 직렬화.
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
      if (err instanceof DOMException && err.name === "AbortError") {
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
        disabled={!supported || phase === "exporting"}
        aria-label={t("exportAria")}
        title={supported ? t("exportAria") : t("exportUnsupportedHint")}
        data-testid="realm-block-export"
        className="inline-flex shrink-0 items-center gap-1 rounded-[var(--chrome-radius-inner)] px-1 py-0.5 text-label text-[color:var(--topology-v2-panel-text-quaternary)] transition-colors enabled:hover:text-[color:var(--topology-v2-panel-text-primary)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
      >
        <PackagePlus size={11} aria-hidden="true" />
        {phase === "exporting" ? t("exportBusy") : t("exportAction")}
      </button>
    </span>
  );
}
