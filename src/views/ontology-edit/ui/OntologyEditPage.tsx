"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ACCOUNT_QUERY_KEY, appendAccountQuery } from "@/shared/lib/account-scope";
import { addManualKnowledgeNode } from "@/entities/knowledge-graph";
import { slugify } from "@/shared/lib/slugify";
import { OperationsNav } from "@/widgets/operations-nav";
import { useToast } from "@/shared/ui";
import { useEphemeralNodes } from "../lib/use-ephemeral-nodes";
import { useEphemeralEdges } from "../lib/use-ephemeral-edges";
import { downloadAtlasFrontmatter } from "../lib/export-frontmatter";
import { OntologyKindPalette } from "./OntologyKindPalette";
import { OntologyInspector } from "./OntologyInspector";
import { AtlasOnboarding } from "./AtlasOnboarding";

/**
 * `/ontology/edit` — ERD canvas editor v1 (Track C-1~C-3).
 *
 * SSR 회피: xyflow 내부 ResizeObserver / window 의존성 → `next/dynamic`
 * + `ssr: false` 로 client-only mount. Next.js 16 정적 export 와 호환.
 */
const OntologyEditCanvas = dynamic<{
  accountId: string | null;
  ephemeralNodes: ReturnType<typeof useEphemeralNodes>["nodes"];
  ephemeralEdges: ReturnType<typeof useEphemeralEdges>["edges"];
  onSelectionChange?: (selectedId: string | null) => void;
  onConnect?: (connection: import("@xyflow/react").Connection) => void;
}>(
  () => import("./OntologyEditCanvas").then((m) => m.OntologyEditCanvas),
  { ssr: false, loading: () => <CanvasSkeleton /> },
);

function CanvasSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-xs text-[color:var(--color-text-quaternary)]">캔버스 불러오는 중…</p>
    </div>
  );
}

export function OntologyEditPage() {
  const searchParams = useSearchParams();
  const accountId = null;

  const { nodes: ephemeralNodes, addNode, clearAll, updateNode, findById, removeNode } =
    useEphemeralNodes();
  const { edges: ephemeralEdges, addEdge: addEphemeralEdge, clearAll: clearEphemeralEdges } =
    useEphemeralEdges();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const toast = useToast();

  const saveEphemeral = useCallback(
    async (nodeId: string) => {
      if (!accountId) {
        toast.show("계정이 확인되지 않았어요.", "error");
        return;
      }
      const node = findById(nodeId);
      if (!node) return;
      const slug = slugify(node.title);
      if (!slug) {
        toast.show("이름이 비어 있어 저장할 수 없어요.", "error");
        return;
      }
      const id = `${node.kind}.${slug}`;
      setSavingId(nodeId);
      try {
        await addManualKnowledgeNode({
          accountId,
          id,
          title: node.title,
          kind: node.kind,
        });
        toast.show(`"${node.title}" 저장 완료`, "success");
        removeNode(nodeId);
        setSelectedId(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "저장 실패";
        toast.show(message, "error");
      } finally {
        setSavingId(null);
      }
    },
    [accountId, findById, removeNode, toast],
  );
  const ephemeralSelected = findById(selectedId);
  // approved 노드 detail 은 useApprovedGraphFlow 가 캔버스 내부에 있어 page 에선
  // id 만 알 수 있음. 임시로 ephemeral 외 선택 = approved 가정.
  const approvedSelected =
    selectedId && !ephemeralSelected
      ? { id: selectedId, kind: "(승인)", title: selectedId }
      : null;

  const treeHref = accountId
    ? `/ontology/?${ACCOUNT_QUERY_KEY}=${encodeURIComponent(accountId)}`
    : "/ontology/";

  // C-14 keyboard shortcuts — Atlas 캔버스 단축키.
  // 스코프: input/textarea 포커스 시 비활성. 항상 ephemeral 만 영향.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      // Esc — 선택 해제
      if (event.key === "Escape") {
        if (selectedId) {
          event.preventDefault();
          setSelectedId(null);
        }
        return;
      }
      // N — palette 첫 kind (project) 추가 + 즉시 select
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        const newId = addNode("project");
        setSelectedId(newId);
        return;
      }
      // Delete / Backspace — selected ephemeral 노드 제거
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedId &&
        findById(selectedId)
      ) {
        event.preventDefault();
        removeNode(selectedId);
        setSelectedId(null);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, addNode, removeNode, findById]);

  return (
    <div className="min-h-dvh bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
      <OperationsNav />
      <main className="mx-auto flex h-[calc(100dvh-3.5rem)] max-w-[1400px] flex-col px-4 py-4 md:px-6">
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-indigo-accent)]">
              Ontology Atlas
            </p>
            <h1 className="mt-1 text-2xl font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              온톨로지 아틀라스
            </h1>
            <p className="mt-1 max-w-xl text-xs leading-5 text-[color:var(--color-text-tertiary)]">
              지식 그래프를 끌어다 그려서 만드는 워크스페이스. 왼쪽 palette 에서 종류를 골라 클릭하면 새 노드가 생기고,
              핸들에서 drag 해 다른 노드로 drop 하면 관계가 추가돼요. 임시 노드는 인디고 dashed 표시 → 인스펙터에서 저장.
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px] tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              <kbd className="rounded border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-1.5 py-0.5">N</kbd>
              <span>새 노드</span>
              <span aria-hidden>·</span>
              <kbd className="rounded border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-1.5 py-0.5">Del</kbd>
              <span>선택 노드 삭제</span>
              <span aria-hidden>·</span>
              <kbd className="rounded border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-1.5 py-0.5">Esc</kbd>
              <span>선택 해제</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {ephemeralNodes.length > 0 || ephemeralEdges.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    downloadAtlasFrontmatter({
                      ephemeralNodes,
                      ephemeralEdges,
                      accountId: accountId ?? "unscoped",
                    })
                  }
                  className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-3 text-xs text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:bg-[color:rgba(94,106,210,0.16)]"
                  aria-label="현재 캔버스를 frontmatter md 로 내보내기"
                >
                  md 내보내기 ↓
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearAll();
                    clearEphemeralEdges();
                  }}
                  className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(229,72,77,0.32)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={`임시 노드 ${ephemeralNodes.length}개 + 임시 관계 ${ephemeralEdges.length}개 모두 지우기`}
                >
                  임시 {ephemeralNodes.length}개 / 관계 {ephemeralEdges.length}개 지우기
                </button>
              </>
            ) : null}
            <Link
              href={treeHref}
              className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
              aria-label="ontology 트리로 보기 (read-only)"
            >
              트리로 보기 ↗
            </Link>
          </div>
        </header>
        <section className="relative flex flex-1 overflow-hidden rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)]">
          <OntologyKindPalette
            onAddNode={(kind) => {
              const newId = addNode(kind);
              // 추가 직후 inspector 가 바로 열리도록 self-select.
              setSelectedId(newId);
            }}
          />
          <div className="relative flex-1">
            <OntologyEditCanvas
              accountId={accountId ?? null}
              ephemeralNodes={ephemeralNodes}
              ephemeralEdges={ephemeralEdges}
              onSelectionChange={setSelectedId}
              onConnect={addEphemeralEdge}
            />
            <AtlasOnboarding
              empty={ephemeralNodes.length === 0 && ephemeralEdges.length === 0}
            />
          </div>
          <OntologyInspector
            ephemeralSelected={ephemeralSelected}
            approvedSelected={approvedSelected}
            onRenameEphemeral={(id, title) => updateNode(id, { title })}
            onSaveEphemeral={saveEphemeral}
            saving={savingId !== null}
            onClearSelection={() => setSelectedId(null)}
          />
        </section>
      </main>
    </div>
  );
}
