"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Info, Maximize2, Minimize2 } from "lucide-react";
import { ACCOUNT_QUERY_KEY } from "@/shared/lib/account-scope";
import { useUserAuth } from "@/features/user-auth";
import { addManualKnowledgeNode } from "@/entities/knowledge-graph";
import { useDataSourceMode } from "@/features/data-source-mode";
import { useLocalVault } from "@/features/docs-vault-local";
import { slugify } from "@/shared/lib/slugify";
import { OperationsNav } from "@/widgets/operations-nav";
import { Tooltip, useToast } from "@/shared/ui";
import { useEphemeralNodes } from "../lib/use-ephemeral-nodes";
import { useEphemeralEdges } from "../lib/use-ephemeral-edges";
import { downloadAtlasFrontmatter } from "../lib/export-frontmatter";

/**
 * P1-1 (UX-4) — local 모드 vault `.md` write path.
 *
 * 빌더 ephemeral 노드 → `${kind}/${slug}.md` 로 vault 직접 작성.
 * frontmatter 는 mission v2 V1.x 호환 — kind / title / domain. 본문은
 * `# {title}` 한 줄. 사용자가 그 후 vault 에서 직접 편집 가능.
 *
 * mission v2 의 *사람 + AI agent 양립* 약속의 코드 구현 — 빌더로 만든
 * 노드를 AI agent (MCP) 가 같은 vault 에서 즉시 본다.
 */
function buildVaultMarkdown(args: {
  kind: string;
  title: string;
  slug: string;
}): string {
  const lines = ["---"];
  lines.push(`slug: ${args.slug}`);
  lines.push(`kind: ${args.kind}`);
  // title 에 콜론 / 따옴표 들어갈 수 있으니 안전하게 quote.
  const safeTitle =
    /[:#\[\]{}"',&|*!%@`]/.test(args.title)
      ? `"${args.title.replace(/"/g, '\\"')}"`
      : args.title;
  lines.push(`title: ${safeTitle}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${args.title}`);
  lines.push("");
  return lines.join("\n");
}
import { OntologyKindPalette } from "./OntologyKindPalette";
import { OntologyInspector } from "./OntologyInspector";
import { BuilderOnboarding } from "./BuilderOnboarding";

/**
 * `/ontology/edit` — ERD canvas editor v1 (Track C-1~C-3).
 *
 * SSR 회피: xyflow 내부 ResizeObserver / window 의존성 → `next/dynamic`
 * + `ssr: false` 로 client-only mount. Next.js 16 정적 export 와 호환.
 */
const OntologyEditCanvas = dynamic<{
  accountId: string | null;
  vaultManifest: import("@/entities/docs-vault").VaultManifest | null;
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
  // single-user 모드: account scope 가 곧 로그인 사용자 uid. 비로그인 사용자는
  // 캔버스 자체를 볼 수 있지만 manual node 저장 시 toast 로 막힌다.
  const { user } = useUserAuth();
  const accountId = user?.uid ?? null;
  const dataSourceMode = useDataSourceMode();
  const vault = useLocalVault();

  const { nodes: ephemeralNodes, addNode, clearAll, updateNode, findById, removeNode } =
    useEphemeralNodes();
  const { edges: ephemeralEdges, addEdge: addEphemeralEdge, clearAll: clearEphemeralEdges } =
    useEphemeralEdges();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const toast = useToast();

  const saveEphemeral = useCallback(
    async (nodeId: string) => {
      const node = findById(nodeId);
      if (!node) return;
      const slug = slugify(node.title);
      if (!slug) {
        toast.show("이름이 비어 있어 저장할 수 없어요.", "error");
        return;
      }
      setSavingId(nodeId);
      try {
        if (dataSourceMode === "local") {
          // P1-1: vault `.md` 직접 작성. 경로 = `${kind}s/${slug}.md`
          // (capabilities/auth-platform 같은 형식 — dogfood vault 와 일치).
          // kind 의 복수형: capability→capabilities, element→elements,
          // domain→domains, project→projects. 그 외는 kind 그대로 +s.
          const folder =
            node.kind === "capability"
              ? "capabilities"
              : node.kind === "element"
                ? "elements"
                : node.kind === "domain"
                  ? "domains"
                  : node.kind === "project"
                    ? "projects"
                    : `${node.kind}s`;
          const vaultSlug = `${folder}/${slug}`;
          const md = buildVaultMarkdown({
            kind: node.kind,
            title: node.title,
            slug: vaultSlug,
          });
          await vault.createDoc(vaultSlug, md);
          toast.show(`"${node.title}" → vault/${vaultSlug}.md 저장`, "success");
          removeNode(nodeId);
          setSelectedId(null);
        } else if (dataSourceMode === "cloud") {
          if (!accountId) {
            toast.show("계정이 확인되지 않았어요. 로그인하세요.", "error");
            return;
          }
          const id = `${node.kind}.${slug}`;
          await addManualKnowledgeNode({
            accountId,
            id,
            title: node.title,
            kind: node.kind,
          });
          toast.show(`"${node.title}" 저장 완료`, "success");
          removeNode(nodeId);
          setSelectedId(null);
        } else {
          // static — vault 미선택 + 비로그인. 둘 중 하나 활성화 안내.
          toast.show(
            "데모 모드라 저장할 수 없어요. /docs 에서 vault 폴더를 열거나 로그인하세요.",
            "error",
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "저장 실패";
        toast.show(message, "error");
      } finally {
        setSavingId(null);
      }
    },
    [accountId, dataSourceMode, findById, removeNode, toast, vault],
  );
  const ephemeralSelected = findById(selectedId);
  // C-5 — vault 모드에서는 selectedId 가 vault slug. manifest 에서 lookup
  // 해 인스펙터에 frontmatter 와 함께 전달 (in-canvas rename 가능).
  const vaultSelected = (() => {
    if (!selectedId || ephemeralSelected) return null;
    const doc = vault.manifest?.docs.find((d) => d.slug === selectedId);
    if (!doc || typeof doc.frontmatter.kind !== "string") return null;
    return {
      slug: doc.slug,
      kind: String(doc.frontmatter.kind),
      title: doc.title || doc.slug,
    };
  })();
  // cloud approved 모드 fallback — vault 매니페스트 없을 때만. 현재 사용자
  // 흐름에서는 vault 모드가 default 라 사실상 dead 지만 cloud 모드 잔존
  // 사용자 보호용으로 placeholder 유지.
  const approvedSelected =
    selectedId && !ephemeralSelected && !vaultSelected && !vault.manifest
      ? { id: selectedId, kind: "(승인)", title: selectedId }
      : null;

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const renameVaultDoc = useCallback(
    async (slug: string, nextTitle: string) => {
      const trimmed = nextTitle.trim();
      if (!trimmed) {
        toast.show("제목이 비어 있어 저장할 수 없어요.", "error");
        return;
      }
      setRenamingId(slug);
      try {
        await vault.updateFrontmatter(slug, { title: trimmed });
        toast.show(`"${trimmed}" 제목 저장`, "success");
      } catch (err) {
        const message = err instanceof Error ? err.message : "제목 저장 실패";
        toast.show(message, "error");
      } finally {
        setRenamingId(null);
      }
    },
    [toast, vault],
  );

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
      // Esc — 선택 해제 / fullscreen 종료
      if (event.key === "Escape") {
        if (selectedId) {
          event.preventDefault();
          setSelectedId(null);
          return;
        }
        if (fullscreen) {
          event.preventDefault();
          setFullscreen(false);
        }
        return;
      }
      // F — fullscreen 토글
      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        setFullscreen((current) => !current);
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
  }, [selectedId, addNode, removeNode, findById, fullscreen]);

  const helpTooltip = (
    <div className="max-w-xs space-y-2 text-[12px] leading-5">
      <p>
        지식 그래프를 끌어다 그려서 만드는 워크스페이스.
      </p>
      <ul className="space-y-1 pl-3 text-[color:var(--color-text-tertiary)]">
        <li>· 왼쪽 palette 에서 종류를 골라 <strong>클릭</strong> → 새 노드 추가</li>
        <li>· 노드의 <strong>핸들에서 drag</strong> → 다른 노드로 drop → 관계 추가</li>
        <li>· 임시 노드는 인디고 <strong>dashed</strong> → 인스펙터에서 이름 입력 + 저장</li>
      </ul>
      <p className="font-mono text-[10px] tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
        N · 새 노드  /  Del · 선택 삭제  /  Esc · 선택 해제  /  F · 전체 화면
      </p>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
      {fullscreen ? null : <OperationsNav />}
      <main
        className={
          fullscreen
            ? "flex h-dvh w-full flex-col px-2 py-2"
            : "mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-[1800px] flex-col px-3 py-3 md:px-5 md:py-4"
        }
      >
        <header className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-indigo-accent)]">
              Ontology Builder
            </p>
            <h1 className="text-xl font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              온톨로지 빌더
            </h1>
            <Tooltip content={helpTooltip} withProvider={false}>
              <span
                role="img"
                aria-label="빌더 사용법 안내"
                className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-indigo-accent)]"
              >
                <Info size={13} />
              </span>
            </Tooltip>
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
              className="inline-flex h-8 shrink-0 items-center gap-1 px-2 text-[11px] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              aria-label="ontology 트리로 보기 (read-only)"
            >
              트리로 보기 <span aria-hidden>↗</span>
            </Link>
            <button
              type="button"
              onClick={() => setFullscreen((current) => !current)}
              aria-label={fullscreen ? "전체 화면 종료 (F)" : "전체 화면 (F)"}
              title={fullscreen ? "전체 화면 종료 (F)" : "전체 화면 (F)"}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
            >
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
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
              vaultManifest={vault.manifest ?? null}
              ephemeralNodes={ephemeralNodes}
              ephemeralEdges={ephemeralEdges}
              onSelectionChange={setSelectedId}
              onConnect={addEphemeralEdge}
            />
            <BuilderOnboarding
              empty={ephemeralNodes.length === 0 && ephemeralEdges.length === 0}
            />
          </div>
          <OntologyInspector
            ephemeralSelected={ephemeralSelected}
            approvedSelected={approvedSelected}
            vaultSelected={vaultSelected}
            onRenameEphemeral={(id, title) => updateNode(id, { title })}
            onSaveEphemeral={saveEphemeral}
            onSaveVaultRename={renameVaultDoc}
            saving={savingId !== null || renamingId !== null}
            onClearSelection={() => setSelectedId(null)}
          />
        </section>
      </main>
    </div>
  );
}
