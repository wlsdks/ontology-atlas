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
import { findVaultBacklinks } from "../lib/find-vault-backlinks";

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
  onVaultNodeDragStop?: (slug: string, position: { x: number; y: number }) => void;
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
  // 해 인스펙터에 frontmatter + array 키 (capabilities/elements/...) 까지
  // 함께 전달 (in-canvas rename + array 편집 가능).
  const vaultSelected = (() => {
    if (!selectedId || ephemeralSelected) return null;
    const doc = vault.manifest?.docs.find((d) => d.slug === selectedId);
    if (!doc || typeof doc.frontmatter.kind !== "string") return null;
    const fm = doc.frontmatter as Record<string, unknown>;
    const asStrings = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string")
        : [];
    const asString = (v: unknown): string =>
      typeof v === "string" ? v : "";
    return {
      slug: doc.slug,
      kind: String(doc.frontmatter.kind),
      title: doc.title || doc.slug,
      // V1.2 vault-adaptation — frontmatter scalar literals.
      description: asString(fm.description),
      domain: asString(fm.domain),
      capabilities: asStrings(fm.capabilities),
      elements: asStrings(fm.elements),
      dependencies: asStrings(fm.dependencies),
      relates: asStrings(fm.relates),
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

  // C-5 — vault frontmatter array 키 (capabilities/elements/dependencies/
  // relates) 편집. 빈 배열은 키 자체를 제거 (null) — frontmatter 깨끗.
  const editVaultArrayKey = useCallback(
    async (
      slug: string,
      key: "capabilities" | "elements" | "dependencies" | "relates",
      next: string[],
    ) => {
      try {
        await vault.updateFrontmatter(slug, {
          [key]: next.length === 0 ? null : next,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "저장 실패";
        toast.show(message, "error");
      }
    },
    [toast, vault],
  );

  // V1.2 vault-adaptation — frontmatter scalar literals (description / domain).
  // 빈 string 은 키 자체 제거 (null) — frontmatter 깨끗 유지. trim 후 빈 값이면
  // 명시적 삭제로 처리해 사용자가 의도적으로 비웠을 때 frontmatter 에 빈 문자열
  // 잔존 안 함.
  const editVaultLiteral = useCallback(
    async (slug: string, key: "description" | "domain", next: string) => {
      const trimmed = next.trim();
      try {
        await vault.updateFrontmatter(slug, {
          [key]: trimmed === "" ? null : trimmed,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "저장 실패";
        toast.show(message, "error");
      }
    },
    [toast, vault],
  );

  // C-5 fire — vault 노드 drag 좌표를 frontmatter.canvasPosition 으로 patch.
  // 같은 사용자가 재방문 시 + AI agent (MCP) 가 같은 vault read 시 동일 좌표.
  // skipRefresh 로 manifest 재빌드 생략 — drag 직후 사용자 시각엔 캔버스 위치
  // 그대로라 깜빡임 없게. 다음 cold load 부터 canvasPosition 반영.
  const persistVaultPosition = useCallback(
    async (slug: string, position: { x: number; y: number }) => {
      try {
        await vault.updateFrontmatter(
          slug,
          { canvasPosition: { x: position.x, y: position.y } },
          { skipRefresh: true },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "좌표 저장 실패";
        toast.show(message, "error");
      }
    },
    [toast, vault],
  );

  // C-5 vault delete — MCP delete_concept 와 같은 정책: backlinks 가 있으면
  // confirm 단계에서 list 보여주고 사용자가 의식적으로 진행하게. force 플래그
  // 는 별도 UI 없이 confirm 한 번 — UI 자체가 사용자 의도 게이트.
  const deleteVaultDoc = useCallback(
    async (slug: string) => {
      if (!vault.manifest) return;
      const backlinks = findVaultBacklinks(vault.manifest, slug);
      const message =
        backlinks.length > 0
          ? `"${slug}" 를 삭제하면 ${backlinks.length} 개 노드가 dangling 됩니다 (` +
            backlinks
              .slice(0, 3)
              .map((b) => b.slug)
              .join(", ") +
            (backlinks.length > 3 ? ` 외 ${backlinks.length - 3}개` : "") +
            ").\n\n그래도 삭제할까요?"
          : `"${slug}" 를 vault 에서 삭제할까요? 되돌릴 수 없습니다.`;
      // 정적 export + WebGL 캔버스 환경 — 가장 단순한 confirm dialog 가
      // SSR/hydration 위험 없음. modal UI 는 후속 PR 에서 OntologyEditPage 자체
      // dialog 컴포넌트로 통합 가능.
      if (typeof window !== "undefined" && !window.confirm(message)) return;
      setRenamingId(slug);
      try {
        await vault.deleteDoc(slug);
        toast.show(`"${slug}" 삭제`, "success");
        setSelectedId(null);
      } catch (err) {
        const m = err instanceof Error ? err.message : "삭제 실패";
        toast.show(m, "error");
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
              onVaultNodeDragStop={persistVaultPosition}
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
            onEditVaultArrayKey={editVaultArrayKey}
            onEditVaultLiteral={editVaultLiteral}
            onDeleteVault={deleteVaultDoc}
            saving={savingId !== null || renamingId !== null}
            onClearSelection={() => setSelectedId(null)}
          />
        </section>
      </main>
    </div>
  );
}
