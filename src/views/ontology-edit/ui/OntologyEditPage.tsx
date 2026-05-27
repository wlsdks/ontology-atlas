"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Download,
  FileJson,
  Info,
  Maximize2,
  Minimize2,
  Network,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  vaultManifest as staticVaultManifestRaw,
  type VaultManifest,
} from "@/entities/docs-vault";
import { useDataSourceMode } from "@/features/data-source-mode";
import { VaultConflictError, useLocalVault } from "@/features/docs-vault-local";
import { isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";
import { slugify } from "@/shared/lib/slugify";
import { OperationsNav } from "@/widgets/operations-nav";
import { MountedGlobalSearch } from "@/widgets/global-search";
import { Tooltip, useToast } from "@/shared/ui";
import { useEphemeralNodes } from "../lib/use-ephemeral-nodes";
import { useEphemeralEdges } from "../lib/use-ephemeral-edges";
import { isUntitledTitle } from "../lib/is-untitled-title";
import { downloadAtlasFrontmatter } from "../lib/export-frontmatter";
import { downloadGraphML, downloadJsonLd } from "../lib/export-graph";
import { BlastRadiusConfirm } from "./BlastRadiusConfirm";
import type { VaultBacklinkMatch } from "../lib/find-vault-backlinks";
import { findVaultBacklinks } from "../lib/find-vault-backlinks";
import {
  buildVaultRelationPatch,
  inferVaultRelationKey,
  preflightVaultRelation,
  readVaultRelationValues,
  type VaultRelationKey,
  type VaultRelationProposal,
} from "../lib/relation-proposal";
import { resolveBuilderQueryNodeSlug } from "../lib/resolve-builder-query-node";
import { RelationWriteConfirm } from "./RelationWriteConfirm";
import { RelationPostSaveHandoff } from "./RelationPostSaveHandoff";

/**
 * 빌더 ephemeral 노드 → `${kind}s/${slug}.md` 로 vault 직접 작성.
 * frontmatter: kind / title / slug. 본문은 `# {title}` 한 줄 — 그 후
 * 사용자 또는 AI agent (MCP) 가 같은 vault 에서 이어서 편집한다.
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
import { OntologyInspector, type VaultArrayKey } from "./OntologyInspector";
import { BuilderOnboarding } from "./BuilderOnboarding";

/**
 * `/ontology/edit` — ERD canvas editor v1.
 *
 * SSR 회피: xyflow 내부 ResizeObserver / window 의존성 → `next/dynamic`
 * + `ssr: false` 로 client-only mount. Next.js 16 정적 export 와 호환.
 */
const OntologyEditCanvas = dynamic<{
  vaultManifest: import("@/entities/docs-vault").VaultManifest | null;
  ephemeralNodes: ReturnType<typeof useEphemeralNodes>["nodes"];
  ephemeralEdges: ReturnType<typeof useEphemeralEdges>["edges"];
  onSelectionChange?: (selectedId: string | null) => void;
  onConnect?: (connection: import("@xyflow/react").Connection) => void;
  onVaultConnect?: (
    sourceSlug: string,
    targetSlug: string,
    sourceKind: string,
    targetKind: string,
  ) => void;
  onPersistEphemeralEdge?: (edgeId: string) => void;
  onRemoveEphemeralEdge?: (edgeId: string) => void;
  onVaultNodeDragStop?: (slug: string, position: { x: number; y: number }) => void;
  autoLayoutToken?: number;
  layoutMode?: "dagre" | "force";
  focusNodeId?: string | null;
  focusToken?: number;
  selectedId?: string | null;
}>(
  () => import("./OntologyEditCanvas").then((m) => m.OntologyEditCanvas),
  { ssr: false, loading: () => <CanvasSkeleton /> },
);

const BUILDER_PALETTE_COLLAPSED_KEY = "demo:builder-palette:collapsed:v1";
const BUILDER_INSPECTOR_COLLAPSED_KEY = "demo:builder-inspector:collapsed:v1";

function CanvasSkeleton() {
  const t = useTranslations("ontologyPages.edit.page");
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-xs text-[color:var(--color-text-quaternary)]">{t("canvasLoading")}</p>
    </div>
  );
}

type BuilderEntryAnchor = {
  id: string;
  kind: string;
  label: string;
};

function buildBuilderEntryAnchors(manifest: VaultManifest): BuilderEntryAnchor[] {
  const picked = new Map<string, BuilderEntryAnchor>();
  const addFirst = (kind: string) => {
    const doc = manifest.docs.find((candidate) => candidate.frontmatter?.kind === kind);
    if (!doc || picked.has(doc.slug)) return;
    picked.set(doc.slug, {
      id: doc.slug,
      kind,
      label: doc.title || doc.slug,
    });
  };

  addFirst("project");
  for (const kind of ["domain", "capability", "element"]) {
    for (const doc of manifest.docs) {
      if (picked.size >= 6) break;
      if (doc.frontmatter?.kind !== kind || picked.has(doc.slug)) continue;
      picked.set(doc.slug, {
        id: doc.slug,
        kind,
        label: doc.title || doc.slug,
      });
    }
    if (picked.size >= 6) break;
  }

  return Array.from(picked.values());
}

function BuilderCanvasEntryRail({
  anchors,
  nodeCount,
  relationCount,
  onFocusAnchor,
}: {
  anchors: BuilderEntryAnchor[];
  nodeCount: number;
  relationCount: number;
  onFocusAnchor: (id: string) => void;
}) {
  const t = useTranslations("ontologyPages.edit.page.canvasEntryRail");
  if (anchors.length === 0) return null;

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[min(520px,calc(100%-1.5rem))] rounded-lg border border-[color:var(--color-border-soft)] bg-[color:rgba(15,16,17,0.94)] p-2 shadow-[0_14px_34px_rgba(0,0,0,0.30)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <Network size={12} className="text-[color:var(--color-indigo-accent)]" />
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t("label")}
          </p>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)]">
          {t("stats", { nodes: nodeCount, relations: relationCount })}
        </p>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {anchors.map((anchor) => (
          <button
            key={anchor.id}
            type="button"
            onClick={() => onFocusAnchor(anchor.id)}
            className="pointer-events-auto flex max-w-[190px] items-center gap-1.5 truncate rounded-md border border-[color:rgba(94,106,210,0.22)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 text-left text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.38)] hover:bg-[color:rgba(94,106,210,0.13)] hover:text-[color:var(--color-text-primary)]"
            title={t("anchorTitle", { kind: anchor.kind, label: anchor.label })}
          >
            <span className="shrink-0 font-mono uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              {anchor.kind.slice(0, 1)}
            </span>
            <span className="truncate">{anchor.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BuilderWriteSummary({
  writable,
  isDesktopRuntime,
  persistedNodes,
  persistedRelations,
  draftNodes,
  draftEdges,
  selectedVaultSlug,
  pendingRelation,
}: {
  writable: boolean;
  isDesktopRuntime: boolean;
  persistedNodes: number;
  persistedRelations: number;
  draftNodes: number;
  draftEdges: number;
  selectedVaultSlug?: string | null;
  pendingRelation?: VaultRelationProposal | null;
}) {
  const t = useTranslations("ontologyPages.edit.page.writeSummary");
  type SummaryHref =
    | "/docs/?intent=local"
    | "/download/"
    | "/ontology/insights/"
    | `/ontology/insights/?node=${string}`;
  const sourceHref: SummaryHref = isDesktopRuntime ? "/docs/?intent=local" : "/download/";
  const proofHref: SummaryHref = selectedVaultSlug
    ? `/ontology/insights/?node=${encodeURIComponent(selectedVaultSlug)}`
    : "/ontology/insights/";
  const sourceAction = writable
    ? {}
    : {
        href: sourceHref,
        actionLabel: isDesktopRuntime
          ? t("sourceActionLocal")
          : t("sourceActionDownload"),
      };
  const items: Array<{
    label: string;
    value: string;
    body: string;
    accent: "indigo" | "amber" | "neutral";
    href?: SummaryHref;
    actionLabel?: string;
  }> = [
    {
      label: t("sourceLabel"),
      value: writable ? t("sourceWritable") : t("sourceReadonly"),
      body: writable
        ? t("sourceBodyWritable", { nodes: persistedNodes, relations: persistedRelations })
        : t("sourceBodyReadonly", { nodes: persistedNodes, relations: persistedRelations }),
      accent: writable ? "indigo" : "amber",
      ...sourceAction,
    },
    {
      label: t("draftLabel"),
      value: t("draftValue", { nodes: draftNodes, edges: draftEdges }),
      body: t("draftBody"),
      accent: draftNodes > 0 || draftEdges > 0 ? "indigo" : "neutral",
    },
    {
      label: t("guardLabel"),
      value: pendingRelation ? t("guardValueReview") : t("guardValue"),
      body: pendingRelation
        ? t("guardBodyReview", {
            source: pendingRelation.sourceSlug,
            key: pendingRelation.inferredKey,
            target: pendingRelation.targetSlug,
          })
        : t("guardBody"),
      accent: pendingRelation ? "indigo" : "neutral",
    },
    {
      label: t("proofLabel"),
      value: selectedVaultSlug ? t("proofValueSelected") : t("proofValue"),
      body: selectedVaultSlug
        ? t("proofBodySelected", { slug: selectedVaultSlug })
        : t("proofBody"),
      accent: "neutral",
      href: proofHref,
      actionLabel: selectedVaultSlug ? t("proofActionSelected") : t("proofAction"),
    },
  ];

  return (
    <section
      aria-label={t("ariaLabel")}
      className="mb-2 hidden grid-cols-4 gap-2 md:grid"
    >
      {items.map((item) => {
        const accentClass =
          item.accent === "indigo"
            ? "border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.07)]"
            : item.accent === "amber"
              ? "border-[color:rgba(244,183,49,0.30)] bg-[color:rgba(244,183,49,0.06)]"
              : "border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]";
        return (
          <article
            key={item.label}
            className={`min-w-0 rounded-lg border px-3 py-2 ${accentClass}`}
          >
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {item.label}
            </p>
            <p className="mt-0.5 truncate text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {item.value}
            </p>
            <p className="mt-1 truncate text-[10px] text-[color:var(--color-text-tertiary)]">
              {item.body}
            </p>
            {item.href && item.actionLabel ? (
              <Link
                href={item.href}
                className="mt-1.5 inline-flex text-[10px] font-[var(--font-weight-signature)] text-[color:rgba(159,170,235,0.95)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                {item.actionLabel}
              </Link>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

export function OntologyEditPage() {
  const t = useTranslations("ontologyPages.edit.page");
  const tKinds = useTranslations("kinds");
  const searchParams = useSearchParams();
  const dataSourceMode = useDataSourceMode();
  const vault = useLocalVault();
  const isDesktopRuntime = isTauriVaultRuntime();
  const demoSaveToastKey = isDesktopRuntime
    ? "toastDemoModePicker"
    : "toastDemoModeDownload";
  const demoEdgeToastKey = isDesktopRuntime
    ? "toastVaultEdgeDemoPicker"
    : "toastVaultEdgeDemoDownload";

  const { nodes: ephemeralNodes, addNode: addNodeRaw, clearAll, updateNode, findById, removeNode } =
    useEphemeralNodes();
  // ephemeral 노드의 kindLabel / placeholder 도 locale 별로 caller 가
  // 미리 만들어 hook 에 주입 — hook 자체는 i18n 무지.
  const addNode = useCallback(
    (kind: 'project' | 'domain' | 'capability' | 'element') =>
      addNodeRaw(kind, {
        kindLabel: tKinds(kind),
        defaultTitle: t('untitledPlaceholder'),
      }),
    [addNodeRaw, tKinds, t],
  );
  const {
    edges: ephemeralEdges,
    addEdge: addEphemeralEdge,
    clearAll: clearEphemeralEdges,
    removeEdge: removeEphemeralEdge,
  } = useEphemeralEdges();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // 자동 정렬 토큰 — increment 마다 캔버스가 frontmatter.canvasPosition
  // 무시하고 자동 layout 으로 노드 위치 reset (in-memory only). frontmatter
  // 자체는 그대로라 다음 mount 부터 다시 사용자 좌표 복원 (선호 보존). 사용자가
  // 다시 drag-stop 하면 그때부터 새 frontmatter 좌표로 갱신.
  const [autoLayoutToken, setAutoLayoutToken] = useState(0);
  // focusToken — 외부 (검색 등) 가 noticed 변화 트리거. 매 increment 시
  // canvas 가 focusNodeId 노드로 viewport pan.
  const [focusToken, setFocusToken] = useState(0);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  // layout 알고리즘 — dagre (default, kind 계층 LR) 또는 force (organic).
  // 헤더 토글로 사용자가 선택. 변경 시 in-memory layout 만 재계산 (frontmatter 그대로).
  const [layoutMode, setLayoutMode] = useState<"dagre" | "force">("dagre");
  // 팔레트 선호 — null 은 아직 사용자가 선택하지 않았다는 뜻. 이 경우
  // persisted graph 가 있으면 graph-first 로 접고, 빈 캔버스면 펼쳐 둔다.
  const [paletteCollapsedPreference, setPaletteCollapsedPreference] = useState<
    boolean | null
  >(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem(BUILDER_PALETTE_COLLAPSED_KEY);
      return stored === null ? null : stored === "1";
    } catch {
      return null;
    }
  });
  // 인스펙터 접기 상태 — 사용자가 캔버스 공간 더 필요할 때.
  // localStorage 저장 (페이지 재진입 시 마지막 선호 유지).
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(BUILDER_INSPECTOR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleInspector = useCallback(() => {
    setInspectorCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(BUILDER_INSPECTOR_COLLAPSED_KEY, next ? "1" : "0");
      } catch { /* private mode */ }
      return next;
    });
  }, []);
  // Blast-radius modal state — driven by deleteVaultDoc requesting a
  // confirmation. Stays null when the user is not actively confirming a
  // delete; opens when delete is clicked and resolves on cancel/confirm.
  const [pendingDelete, setPendingDelete] = useState<{
    slug: string;
    title?: string;
    backlinks: VaultBacklinkMatch[];
  } | null>(null);
  const [pendingRelation, setPendingRelation] =
    useState<VaultRelationProposal | null>(null);
  const [pendingRelationKey, setPendingRelationKey] =
    useState<VaultRelationKey>("relates");
  const [lastSavedRelation, setLastSavedRelation] =
    useState<(VaultRelationProposal & { selectedKey: VaultRelationKey }) | null>(null);
  // Clear-all 두 단계 confirm — 첫 클릭에 confirming=true (3s), 같은 버튼
  // 다시 클릭 시 실제 clear. 실수로 임시 작업 다 날아가는 회귀 방지.
  const [clearConfirming, setClearConfirming] = useState(false);
  useEffect(() => {
    if (!clearConfirming) return;
    const timer = setTimeout(() => setClearConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [clearConfirming]);
  const toast = useToast();

  const saveEphemeral = useCallback(
    async (nodeId: string) => {
      const node = findById(nodeId);
      if (!node) return;
      // placeholder ("(enter a name)" / "(이름 입력)") 그대로 통과 시
      // slugify 가 "enter-a-name.md" 를 만들어 vault 에 silent pollution.
      // Inspector 의 save 버튼은 같은 룰로 disabled 되지만 다른 진입점에서
      // 들어올 수 있어 함수 자체에서 가드.
      if (isUntitledTitle(node.title, t("untitledPlaceholder"))) {
        toast.show(t("toastEmptyName"), "error");
        return;
      }
      const slug = slugify(node.title);
      if (!slug) {
        toast.show(t("toastEmptyName"), "error");
        return;
      }
      setSavingId(nodeId);
      try {
        if (dataSourceMode === "local") {
          // vault `.md` 직접 작성. 경로 = `${kind}s/${slug}.md`
          // (capabilities/auth-platform — dogfood vault 와 같은 폴더 패턴).
          // kind 복수형: capability→capabilities, element→elements,
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
          toast.show(
            t("toastSaveSuccess", { title: node.title, path: vaultSlug }),
            "success",
          );
          removeNode(nodeId);
          // 저장된 노드의 vault id 로 select 전환 — 이어서 dependencies /
          // capabilities 등 frontmatter 편집 흐름이 끊기지 않게.
          setSelectedId(vaultSlug);
        } else {
          // vault 미선택 (static) 시 runtime 별 local-work 진입점 안내.
          toast.show(t(demoSaveToastKey), "error");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : t("toastSaveFailed");
        toast.show(message, "error");
      } finally {
        setSavingId(null);
      }
    },
    [dataSourceMode, demoSaveToastKey, findById, removeNode, t, toast, vault],
  );
  const ephemeralSelected = findById(selectedId);
  // vault 모드에서는 selectedId 가 vault slug. manifest 에서 lookup 해
  // 인스펙터에 frontmatter + array 키 (capabilities/elements/...) 까지
  // 함께 전달 (in-canvas rename + array 편집 가능).
  //
  // 빌더 진실원 우선순위: live vault.manifest > 빌드타임 dogfood 매니페스트.
  // 인스펙터 lookup 도 같은 우선순위 — vault 안 고른 사용자가 dogfood 노드
  // 클릭 시 정확한 frontmatter 를 본다. hasLiveVault 가 false 면 인스펙터는
  // read-only — patch 시도하면 disk 권한 없어 어차피 fail.
  const hasLiveVault = vault.manifest !== null;
  const effectiveManifest = vault.manifest ?? (staticVaultManifestRaw as VaultManifest);
  const builderGraphStats = useMemo(() => {
    const relationKeys = [
      "domains",
      "capabilities",
      "elements",
      "dependencies",
      "depends_on",
      "relates",
      "contains",
      "describes",
    ] as const;
    let persistedNodes = 0;
    let persistedRelations = 0;
    for (const doc of effectiveManifest.docs) {
      if (typeof doc.frontmatter.kind !== "string") continue;
      persistedNodes += 1;
      const fm = doc.frontmatter as Record<string, unknown>;
      for (const key of relationKeys) {
        const value = fm[key];
        if (Array.isArray(value)) {
          persistedRelations += value.filter((item) => typeof item === "string").length;
        }
      }
    }
    return { persistedNodes, persistedRelations };
  }, [effectiveManifest]);
  const builderEntryAnchors = useMemo(
    () => buildBuilderEntryAnchors(effectiveManifest),
    [effectiveManifest],
  );
  const focusBuilderAnchor = useCallback((id: string) => {
    setSelectedId(id);
    setFocusNodeId(id);
    setFocusToken((n) => n + 1);
  }, []);
  const paletteCollapsed =
    paletteCollapsedPreference ?? (builderGraphStats.persistedNodes > 0);
  const togglePalette = useCallback(() => {
    const next = !paletteCollapsed;
    try {
      window.localStorage.setItem(BUILDER_PALETTE_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // private mode
    }
    setPaletteCollapsedPreference(next);
  }, [paletteCollapsed]);
  // slug → doc Map 한 번 — vaultSelected 재계산 외에도 다른 lookup 에서
  // 재사용. 이전엔 매 render 마다 manifest.docs.find 로 O(N) 스캔.
  const docsBySlug = useMemo(
    () => new Map(effectiveManifest.docs.map((d) => [d.slug, d])),
    [effectiveManifest],
  );
  const getExpectedMtime = useCallback(
    (slug: string) => docsBySlug.get(slug)?.mtime,
    [docsBySlug],
  );
  const showVaultWriteError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof VaultConflictError) {
        toast.show(t("toastVaultConflict"), "error");
        return;
      }
      const message = err instanceof Error ? err.message : fallback;
      toast.show(message, "error");
    },
    [t, toast],
  );
  const vaultSelected = useMemo(() => {
    if (!selectedId || ephemeralSelected) return null;
    const doc = docsBySlug.get(selectedId);
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
      description: asString(fm.description),
      domain: asString(fm.domain),
      capabilities: asStrings(fm.capabilities),
      elements: asStrings(fm.elements),
      dependencies: readVaultRelationValues(fm, "dependencies"),
      relates: asStrings(fm.relates),
      domains: asStrings(fm.domains),
      contains: asStrings(fm.contains),
      describes: asStrings(fm.describes),
    };
  }, [selectedId, ephemeralSelected, docsBySlug]);

  const queryNodeId = searchParams.get("node");
  const resolvedQueryNodeId = useMemo(
    () => resolveBuilderQueryNodeSlug(queryNodeId, effectiveManifest.docs),
    [effectiveManifest.docs, queryNodeId],
  );
  useEffect(() => {
    if (!resolvedQueryNodeId) return;
    if (selectedId === resolvedQueryNodeId) return;
    window.queueMicrotask(() => {
      setSelectedId(resolvedQueryNodeId);
      setFocusNodeId(resolvedQueryNodeId);
      setFocusToken((n) => n + 1);
    });
  }, [resolvedQueryNodeId, selectedId]);

  // 선택된 vault 노드를 frontmatter array 로 가리키는 다른 노드 list.
  // ontology 탐색 핵심 — '이 노드를 누가 사용하나'. delete 시 backlinks
  // 도 같은 함수 사용 (BlastRadiusConfirm).
  const vaultBacklinks = useMemo(() => {
    if (!vaultSelected) return [];
    return findVaultBacklinks(effectiveManifest, vaultSelected.slug);
  }, [vaultSelected, effectiveManifest]);

  const pendingRelationPreflight = useMemo(
    () =>
      pendingRelation
        ? preflightVaultRelation(effectiveManifest, pendingRelation, pendingRelationKey)
        : null,
    [effectiveManifest, pendingRelation, pendingRelationKey],
  );

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const renameVaultDoc = useCallback(
    async (slug: string, nextTitle: string) => {
      const trimmed = nextTitle.trim();
      if (!trimmed) {
        toast.show(t("toastTitleEmpty"), "error");
        return;
      }
      setRenamingId(slug);
      try {
        await vault.updateFrontmatter(
          slug,
          { title: trimmed },
          { expectedMtime: getExpectedMtime(slug) },
        );
        toast.show(t("toastTitleSaved", { title: trimmed }), "success");
      } catch (err) {
        showVaultWriteError(err, t("toastTitleSaveFailed"));
      } finally {
        setRenamingId(null);
      }
    },
    [getExpectedMtime, showVaultWriteError, t, toast, vault],
  );

  // vault graph array 키 편집. 빈 배열은 키 자체를 제거 (null) —
  // frontmatter 깨끗.
  const editVaultArrayKey = useCallback(
    async (
      slug: string,
      key: VaultArrayKey,
      next: string[],
    ) => {
      try {
        const patch =
          key === "dependencies"
            ? { dependencies: next.length === 0 ? null : next, depends_on: null }
            : { [key]: next.length === 0 ? null : next };
        await vault.updateFrontmatter(
          slug,
          patch,
          { expectedMtime: getExpectedMtime(slug) },
        );
      } catch (err) {
        showVaultWriteError(err, t("toastSaveFailed"));
      }
    },
    [getExpectedMtime, showVaultWriteError, t, vault],
  );

  const writeVaultRelation = useCallback(
    async (
      sourceSlug: string,
      targetSlug: string,
      key: VaultRelationKey,
    ): Promise<boolean> => {
      // dogfood vault (read-only) 에선 patch 불가 — 안내 토스트.
      if (!hasLiveVault) {
        toast.show(t(demoEdgeToastKey), "error");
        return false;
      }
      const sourceDoc = effectiveManifest.docs.find((d) => d.slug === sourceSlug);
      const relationPatch = buildVaultRelationPatch(
        (sourceDoc?.frontmatter ?? {}) as Record<string, unknown>,
        key,
        targetSlug,
      );
      // 자기 자신 또는 중복 reference 무시.
      if (sourceSlug === targetSlug || relationPatch.alreadyExists) {
        toast.show(t("toastVaultEdgeDuplicate"), "info");
        return true;
      }
      try {
        await vault.updateFrontmatter(
          sourceSlug,
          relationPatch.patch,
          { expectedMtime: getExpectedMtime(sourceSlug) },
        );
        toast.show(
          t("toastVaultEdgeAdded", { key, source: sourceSlug, target: targetSlug }),
          "success",
        );
        return true;
      } catch (err) {
        showVaultWriteError(err, t("toastSaveFailed"));
        return false;
      }
    },
    [demoEdgeToastKey, effectiveManifest, getExpectedMtime, hasLiveVault, showVaultWriteError, t, toast, vault],
  );

  // 캔버스에서 vault A 핸들 → vault B 드래그 시 호출. 바로 쓰지 않고
  // inferred relation key, 대안, frontmatter write scope 를 먼저 보여준다.
  const connectVaultEdge = useCallback(
    (
      sourceSlug: string,
      targetSlug: string,
      sourceKind: string,
      targetKind: string,
    ) => {
      if (!hasLiveVault) {
        toast.show(t(demoEdgeToastKey), "error");
        return;
      }
      if (sourceSlug === targetSlug) {
        toast.show(t("toastVaultEdgeDuplicate"), "info");
        return;
      }
      const inferredKey = inferVaultRelationKey(sourceKind, targetKind);
      const sourceDoc = docsBySlug.get(sourceSlug);
      if (
        readVaultRelationValues(
          (sourceDoc?.frontmatter ?? {}) as Record<string, unknown>,
          inferredKey,
        ).includes(targetSlug)
      ) {
        toast.show(t("toastVaultEdgeDuplicate"), "info");
        return;
      }
      setPendingRelation({
        sourceSlug,
        targetSlug,
        sourceKind,
        targetKind,
        inferredKey,
      });
      setPendingRelationKey(inferredKey);
      setLastSavedRelation(null);
    },
    [demoEdgeToastKey, docsBySlug, hasLiveVault, t, toast],
  );
  /**
   * Round 4 cut I — ephemeral edge "Save" 칩 클릭 orchestrator.
   *
   * 호출 흐름:
   *   1. edge id 로 useEphemeralEdges 에서 edge lookup
   *   2. source / target 각각 resolve:
   *      - ReactFlow node id 가 ephemeralNodes 에 있으면 ephemeral 노드:
   *        title 검증 → vault.createDoc 으로 vault 화 → vaultSlug 획득.
   *      - 그 외엔 vault 노드 (id == vault slug 직접) → docsBySlug 에서
   *        kind 추출.
   *   3. 두 endpoint 의 vault slug + kind 로 connectVaultEdge 호출 —
   *      source frontmatter array 에 target slug append.
   *   4. removeEphemeralEdge 로 in-memory ephemeral edge 정리.
   *
   * vault↔vault edge 는 이미 OntologyEditCanvas.handleConnect 가 자동
   * persist 하므로 여기로 들어오지 않는다 — 본 함수는 한쪽 이상이
   * ephemeral 인 edge 만 처리.
   *
   * 자동-persist 안 한 이유: ephemeral 노드 title 비었을 때 untitled.md
   * silent pollution 위험 (AGENTS.md self-approving 원칙 위반). 명시적
   * 사용자 클릭 + title 검증 (toastEdgePersistNeedsTitle).
   */
  const persistEphemeralEdge = useCallback(
    async (edgeId: string) => {
      const edge = ephemeralEdges.find((e) => e.id === edgeId);
      if (!edge) return;
      if (!hasLiveVault) {
        toast.show(t(demoEdgeToastKey), "error");
        return;
      }
      const resolveEndpoint = async (
        nodeId: string,
      ): Promise<{ slug: string; kind: string } | null> => {
        const ephem = findById(nodeId);
        if (ephem) {
          // placeholder ("(enter a name)") 통과 시 enter-a-name.md silent
          // 생성 → reject. Round 4 가 약속한 "no untitled.md pollution"
          // 를 chip 진입점에서도 보장.
          if (isUntitledTitle(ephem.title, t("untitledPlaceholder"))) {
            toast.show(t("toastEdgePersistNeedsTitle"), "error");
            return null;
          }
          const slug = slugify(ephem.title);
          if (!slug) {
            toast.show(t("toastEdgePersistNeedsTitle"), "error");
            return null;
          }
          const folder =
            ephem.kind === "capability"
              ? "capabilities"
              : ephem.kind === "element"
                ? "elements"
                : ephem.kind === "domain"
                  ? "domains"
                  : ephem.kind === "project"
                    ? "projects"
                    : `${ephem.kind}s`;
          const vaultSlug = `${folder}/${slug}`;
          try {
            const md = buildVaultMarkdown({
              kind: ephem.kind,
              title: ephem.title,
              slug: vaultSlug,
            });
            await vault.createDoc(vaultSlug, md);
            removeNode(nodeId);
            return { slug: vaultSlug, kind: ephem.kind };
          } catch (err) {
            const message =
              err instanceof Error ? err.message : t("toastSaveFailed");
            toast.show(message, "error");
            return null;
          }
        }
        // vault 노드 — 이미 영구화. id == vault slug.
        const doc = docsBySlug.get(nodeId);
        if (!doc || typeof doc.frontmatter.kind !== "string") return null;
        return { slug: doc.slug, kind: String(doc.frontmatter.kind) };
      };
      const sourceInfo = await resolveEndpoint(edge.source);
      if (!sourceInfo) return;
      const targetInfo = await resolveEndpoint(edge.target);
      if (!targetInfo) return;
      await writeVaultRelation(
        sourceInfo.slug,
        targetInfo.slug,
        inferVaultRelationKey(sourceInfo.kind, targetInfo.kind),
      );
      removeEphemeralEdge(edgeId);
    },
    [
      demoEdgeToastKey,
      ephemeralEdges,
      hasLiveVault,
      toast,
      t,
      findById,
      vault,
      removeNode,
      docsBySlug,
      writeVaultRelation,
      removeEphemeralEdge,
    ],
  );

  // V1.2 vault-adaptation — frontmatter scalar literals (description / domain).
  // 빈 string 은 키 자체 제거 (null) — frontmatter 깨끗 유지. trim 후 빈 값이면
  // 명시적 삭제로 처리해 사용자가 의도적으로 비웠을 때 frontmatter 에 빈 문자열
  // 잔존 안 함.
  const editVaultLiteral = useCallback(
    async (slug: string, key: "description" | "domain", next: string) => {
      const trimmed = next.trim();
      try {
        await vault.updateFrontmatter(
          slug,
          {
            [key]: trimmed === "" ? null : trimmed,
          },
          { expectedMtime: getExpectedMtime(slug) },
        );
      } catch (err) {
        showVaultWriteError(err, t("toastSaveFailed"));
      }
    },
    [getExpectedMtime, showVaultWriteError, t, vault],
  );

  // vault 노드 drag 좌표를 frontmatter.canvasPosition 으로 patch.
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
        const message = err instanceof Error ? err.message : t("toastPositionSaveFailed");
        toast.show(message, "error");
      }
    },
    [t, toast, vault],
  );

  // vault delete — BlastRadiusConfirm modal 로 backlinks 를 시각적으로
  // 보여주고 의식적인 confirm 을 받음. 데이터는 findVaultBacklinks 그대로
  // 사용하고 surface 만 native confirm() 에서 다이얼로그로 승격.
  const deleteVaultDoc = useCallback(
    (slug: string) => {
      if (!vault.manifest) return;
      const backlinks = findVaultBacklinks(vault.manifest, slug);
      const doc = vault.manifest.docs.find((d) => d.slug === slug);
      setPendingDelete({ slug, title: doc?.title, backlinks });
    },
    [vault],
  );

  const confirmPendingRelation = useCallback(async () => {
    if (!pendingRelation) return;
    const { sourceSlug, targetSlug } = pendingRelation;
    const key = pendingRelationKey;
    const relationWritten = await writeVaultRelation(sourceSlug, targetSlug, key);
    if (relationWritten) {
      setLastSavedRelation({ ...pendingRelation, selectedKey: key });
      setPendingRelation(null);
    }
  }, [pendingRelation, pendingRelationKey, writeVaultRelation]);

  // Modal 의 confirm 버튼이 눌린 후 실제 delete 수행.
  const confirmPendingDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const { slug } = pendingDelete;
    setPendingDelete(null);
    setRenamingId(slug);
    try {
      await vault.deleteDoc(slug);
      toast.show(t("toastDeleteSuccess", { slug }), "success");
      setSelectedId(null);
    } catch (err) {
      const m = err instanceof Error ? err.message : t("toastDeleteFailed");
      toast.show(m, "error");
    } finally {
      setRenamingId(null);
    }
  }, [pendingDelete, t, toast, vault]);

  const treeHref = "/ontology/";

  // Atlas 캔버스 단축키.
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
      // 단축키로 4 kind 모두 추가 — palette 클릭과 1:1 (P/D/C/E).
      // N (legacy alias) 도 P 와 동일 — 기존 사용자 호환.
      const kindByKey: Record<string, "project" | "domain" | "capability" | "element"> = {
        p: "project",
        n: "project",
        d: "domain",
        c: "capability",
        e: "element",
      };
      const lower = event.key.toLowerCase();
      if (lower in kindByKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        const newId = addNode(kindByKey[lower]);
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
      <p>{t("helpIntro")}</p>
      <ul className="space-y-1 pl-3 text-[color:var(--color-text-tertiary)]">
        <li>· {t("helpStepPalette")}</li>
        <li>· {t("helpStepConnect")}</li>
        <li>· {t("helpStepEphemeral")}</li>
      </ul>
      <p className="font-mono text-[10px] tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
        {t("helpShortcuts")}
      </p>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
      {/* OperationsNav 가 ontology surface (/, /ontology*) 에선 SubNav 행을
          inline 으로 함께 렌더 — 한 nav block 으로 융합. */}
      {fullscreen ? null : <OperationsNav />}
      {/* ⇧⌘K — 큰 ontology 에서 노드 빠른 점프. 선택 시 인스펙터에서 즉시
          편집 가능. fullscreen 모드에선 hotkey 도 작동 (캔버스에 mount). */}
      <MountedGlobalSearch
        hotkeyShift
        onSelectNode={(node) => {
          setSelectedId(node.id);
          setFocusNodeId(node.id);
          setFocusToken((n) => n + 1);
        }}
      />
      <main
        className={
          fullscreen
            ? "flex h-dvh w-full flex-col px-2 py-2"
            : "mx-auto flex h-[calc(100dvh-5.75rem)] w-full max-w-[1800px] flex-col px-3 py-3 md:px-5 md:py-4"
        }
      >
        <header className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3 py-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t("eyebrow")}
            </p>
            <div className="mt-0.5 flex min-w-0 items-center gap-2">
              <h1 className="truncate text-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] md:text-xl">
                {t("title")}
              </h1>
              <span className="hidden h-4 w-px bg-[color:var(--color-border-soft)] sm:block" />
              <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] sm:inline">
                {t("statusSummary", {
                  nodes: ephemeralNodes.length,
                  edges: ephemeralEdges.length,
                })}
              </span>
              <Tooltip content={helpTooltip} withProvider={false}>
                <span
                  role="img"
                  aria-label={t("helpAriaLabel")}
                  className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-indigo-accent)]"
                >
                  <Info size={13} />
                </span>
              </Tooltip>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {ephemeralNodes.length > 0 || ephemeralEdges.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    downloadAtlasFrontmatter({
                      ephemeralNodes,
                      ephemeralEdges,
                    })
                  }
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-2.5 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:bg-[color:rgba(94,106,210,0.16)]"
                  aria-label={t("exportAriaLabel")}
                >
                  <Download size={12} />
                  <span className="hidden lg:inline">{t("exportButton")}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadJsonLd({
                      ephemeralNodes,
                      ephemeralEdges,
                    })
                  }
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.32)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={t("exportJsonLdAriaLabel")}
                >
                  <FileJson size={12} />
                  <span className="hidden xl:inline">{t("exportJsonLdButton")}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadGraphML({
                      ephemeralNodes,
                      ephemeralEdges,
                    })
                  }
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.32)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={t("exportGraphMlAriaLabel")}
                >
                  <Network size={12} />
                  <span className="hidden xl:inline">{t("exportGraphMlButton")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (clearConfirming) {
                      clearAll();
                      clearEphemeralEdges();
                      setClearConfirming(false);
                    } else {
                      setClearConfirming(true);
                    }
                  }}
                  className={
                    clearConfirming
                      ? "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:rgba(229,72,77,0.55)] bg-[color:rgba(229,72,77,0.18)] px-2.5 text-[11px] text-[color:rgba(236,116,116,0.95)] transition-colors hover:bg-[color:rgba(229,72,77,0.28)]"
                      : "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(229,72,77,0.32)] hover:text-[color:var(--color-text-primary)]"
                  }
                  aria-label={t("clearAriaLabel", {
                    nodes: ephemeralNodes.length,
                    edges: ephemeralEdges.length,
                  })}
                >
                  <Trash2 size={12} />
                  {clearConfirming
                    ? t("clearButtonConfirm", {
                        nodes: ephemeralNodes.length,
                        edges: ephemeralEdges.length,
                      })
                    : t("clearButton", {
                        nodes: ephemeralNodes.length,
                        edges: ephemeralEdges.length,
                      })}
                </button>
              </>
            ) : null}
            {/* 레이아웃 알고리즘 토글 — dagre (계층 LR) ↔ force (organic) */}
            <div
              role="radiogroup"
              aria-label={t("layoutGroupAriaLabel")}
              className="inline-flex h-8 shrink-0 items-center rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] p-0.5"
            >
              <button
                type="button"
                role="radio"
                aria-checked={layoutMode === "dagre"}
                onClick={() => setLayoutMode("dagre")}
                title={t("layoutDagreTitle")}
                className={`rounded px-2 text-[10px] tracking-[0.04em] transition-colors ${
                  layoutMode === "dagre"
                    ? "bg-[color:rgba(94,106,210,0.18)] text-[color:rgba(159,170,235,0.95)]"
                    : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]"
                }`}
              >
                {t("layoutDagre")}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={layoutMode === "force"}
                onClick={() => setLayoutMode("force")}
                title={t("layoutForceTitle")}
                className={`rounded px-2 text-[10px] tracking-[0.04em] transition-colors ${
                  layoutMode === "force"
                    ? "bg-[color:rgba(94,106,210,0.18)] text-[color:rgba(159,170,235,0.95)]"
                    : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]"
                }`}
              >
                {t("layoutForce")}
              </button>
            </div>
            <Tooltip content={t("autoLayoutTooltip")} withProvider={false}>
              <button
                type="button"
                onClick={() => setAutoLayoutToken((n) => n + 1)}
                aria-label={t("autoLayoutAriaLabel")}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
              >
                <Wand2 size={12} />
                {t("autoLayoutButton")}
              </button>
            </Tooltip>
            {/* 헤더 '트리로 보기 ↗' link 는 OntologySubNav 의 [트리] 탭과
                중복이라 제거. 모바일 fallback CTA 는 별도 — SubNav 가 mount
                안 되는 풀폭 안내 화면에서만 노출. */}
            <button
              type="button"
              onClick={() => setFullscreen((current) => !current)}
              aria-label={fullscreen ? t("fullscreenExit") : t("fullscreenEnter")}
              title={fullscreen ? t("fullscreenExit") : t("fullscreenEnter")}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
            >
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </header>
        <BuilderWriteSummary
          writable={hasLiveVault}
          isDesktopRuntime={isDesktopRuntime}
          persistedNodes={builderGraphStats.persistedNodes}
          persistedRelations={builderGraphStats.persistedRelations}
          draftNodes={ephemeralNodes.length}
          draftEdges={ephemeralEdges.length}
          selectedVaultSlug={vaultSelected?.slug ?? null}
          pendingRelation={pendingRelation}
        />
        {/* 빌더는 palette (200) + canvas + inspector (280) = 480px+ 의 ERD
            레이아웃 — 모바일 (<md, 768px 미만) viewport 에서는 컬럼이 겹쳐
            unreadable. 데스크톱 권장 안내 + 트리 / 토폴로지 fallback CTA 를
            모바일에만 노출. md+ 에서는 정상 빌더. */}
        <section className="relative hidden flex-1 overflow-hidden rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] md:flex">
          <OntologyKindPalette
            collapsed={paletteCollapsed}
            onToggleCollapsed={togglePalette}
            onAddNode={(kind) => {
              const newId = addNode(kind);
              // 추가 직후 inspector 가 바로 열리도록 self-select.
              setSelectedId(newId);
            }}
          />
          <div className="relative flex-1">
            <BuilderCanvasEntryRail
              anchors={builderEntryAnchors}
              nodeCount={builderGraphStats.persistedNodes}
              relationCount={builderGraphStats.persistedRelations}
              onFocusAnchor={focusBuilderAnchor}
            />
            <OntologyEditCanvas
              vaultManifest={vault.manifest ?? null}
              ephemeralNodes={ephemeralNodes}
              ephemeralEdges={ephemeralEdges}
              onSelectionChange={setSelectedId}
              onConnect={addEphemeralEdge}
              onVaultConnect={connectVaultEdge}
              onPersistEphemeralEdge={persistEphemeralEdge}
              onRemoveEphemeralEdge={removeEphemeralEdge}
              onVaultNodeDragStop={persistVaultPosition}
              autoLayoutToken={autoLayoutToken}
              layoutMode={layoutMode}
              focusNodeId={focusNodeId}
              focusToken={focusToken}
              selectedId={selectedId}
            />
            <BuilderOnboarding
              empty={
                builderGraphStats.persistedNodes === 0 &&
                ephemeralNodes.length === 0 &&
                ephemeralEdges.length === 0
              }
              isDesktopRuntime={isDesktopRuntime}
            />
            {pendingRelation && pendingRelationPreflight ? (
              <RelationWriteConfirm
                proposal={pendingRelation}
                selectedKey={pendingRelationKey}
                preflight={pendingRelationPreflight}
                onSelectKey={setPendingRelationKey}
                onCancel={() => setPendingRelation(null)}
                onConfirm={() => void confirmPendingRelation()}
                labels={{
                  title: t("relationConfirm.title"),
                  body: t("relationConfirm.body", {
                    sourceKind: pendingRelation.sourceKind,
                    targetKind: pendingRelation.targetKind,
                    inferredKey: pendingRelation.inferredKey,
                  }),
                  inferred: t("relationConfirm.inferred"),
                  inferredKey: t("relationConfirm.inferredKey"),
                  inferenceReason: t("relationConfirm.inferenceReason"),
                  alternatives: t("relationConfirm.alternatives"),
                  writeScope: t("relationConfirm.writeScope"),
                  writeFile: t("relationConfirm.writeFile"),
                  writeChangedFiles: t("relationConfirm.writeChangedFiles"),
                  writeUnchangedFiles: t("relationConfirm.writeUnchangedFiles"),
                  writeBoundary: t("relationConfirm.writeBoundary"),
                  writeBoundaryValue: t("relationConfirm.writeBoundaryValue"),
                  writeKey: t("relationConfirm.writeKey"),
                  writeMeaning: t("relationConfirm.writeMeaning"),
                  writeMutation: t("relationConfirm.writeMutation"),
                  writeFrontmatterPatch: t("relationConfirm.writeFrontmatterPatch"),
                  mcpWriteArgs: t("relationConfirm.mcpWriteArgs"),
                  mcpWritePolicy: t("relationConfirm.mcpWritePolicy"),
                  mcpWritePolicyReady: t("relationConfirm.mcpWritePolicyReady"),
                  mcpWritePolicyBlocked: t(
                    "relationConfirm.mcpWritePolicyBlocked",
                  ),
                  graphEffect: t("relationConfirm.graphEffect"),
                  graphEdge: t("relationConfirm.graphEdge"),
                  graphRelation: t("relationConfirm.graphRelation"),
                  graphSurfaces: t("relationConfirm.graphSurfaces"),
                  graphSurfacesValue: t("relationConfirm.graphSurfacesValue"),
                  graphAlternativeWarning: t("relationConfirm.graphAlternativeWarning"),
                  endpointReview: t("relationConfirm.endpointReview"),
                  endpointReviewBody: t("relationConfirm.endpointReviewBody"),
                  sourceOntology: t("relationConfirm.sourceOntology"),
                  targetOntology: t("relationConfirm.targetOntology"),
                  sourceBuilder: t("relationConfirm.sourceBuilder"),
                  targetBuilder: t("relationConfirm.targetBuilder"),
                  postSaveGraphHandoff: t(
                    "relationConfirm.postSaveGraphHandoff",
                  ),
                  postSaveGraphHandoffBody: t(
                    "relationConfirm.postSaveGraphHandoffBody",
                  ),
                  postSavePathHandoff: t(
                    "relationConfirm.postSavePathHandoff",
                  ),
                  postSaveSourceFocus: t("relationConfirm.postSaveSourceFocus"),
                  postSaveTargetFocus: t("relationConfirm.postSaveTargetFocus"),
                  postSaveQueryCockpit: t(
                    "relationConfirm.postSaveQueryCockpit",
                  ),
                  saveChecklist: t("relationConfirm.saveChecklist"),
                  saveChecklistSelectedKey: t(
                    "relationConfirm.saveChecklistSelectedKey",
                  ),
                  saveChecklistPreflight: t(
                    "relationConfirm.saveChecklistPreflight",
                  ),
                  saveChecklistTraversal: t(
                    "relationConfirm.saveChecklistTraversal",
                  ),
                  saveChecklistSyncGate: t(
                    "relationConfirm.saveChecklistSyncGate",
                  ),
                  saveChecklistReady: t("relationConfirm.saveChecklistReady"),
                  saveChecklistReview: t("relationConfirm.saveChecklistReview"),
                  saveChecklistBlocked: t("relationConfirm.saveChecklistBlocked"),
                  saveChecklistSyncRequired: t(
                    "relationConfirm.saveChecklistSyncRequired",
                  ),
                  preflight: t("relationConfirm.preflight"),
                  preflightEvidence: t("relationConfirm.preflightEvidence"),
                  preflightExact: t("relationConfirm.preflightExact"),
                  preflightInverse: t("relationConfirm.preflightInverse"),
                  preflightPath: t("relationConfirm.preflightPath"),
                  preflightClear: t("relationConfirm.preflightClear"),
                  preflightPresent: t("relationConfirm.preflightPresent"),
                  preflightActionSafe: t("relationConfirm.preflightActionSafe"),
                  preflightActionReview: t(
                    "relationConfirm.preflightActionReview",
                  ),
                  preflightActionBlocked: t(
                    "relationConfirm.preflightActionBlocked",
                  ),
                  traversalCheck: t("relationConfirm.traversalCheck"),
                  traversalCheckBody: t("relationConfirm.traversalCheckBody"),
                  traversalContract: t("relationConfirm.traversalContract"),
                  traversalContractBody: t("relationConfirm.traversalContractBody"),
                  agentCheck: t("relationConfirm.agentCheck"),
                  postSaveCheck: t("relationConfirm.postSaveCheck"),
                  path: t("relationConfirm.path"),
                  copyCliPreflight: t("relationConfirm.copyCliPreflight"),
                  copyCliPreflightCopied: t(
                    "relationConfirm.copyCliPreflightCopied",
                  ),
                  copyCliPreflightFailed: t(
                    "relationConfirm.copyCliPreflightFailed",
                  ),
                  copyMcpPreflight: t("relationConfirm.copyMcpPreflight"),
                  copyMcpPreflightCopied: t(
                    "relationConfirm.copyMcpPreflightCopied",
                  ),
                  copyMcpPreflightFailed: t(
                    "relationConfirm.copyMcpPreflightFailed",
                  ),
                  copyPostSaveSyncGate: t("relationConfirm.copyPostSaveSyncGate"),
                  copyPostSaveSyncGateCopied: t(
                    "relationConfirm.copyPostSaveSyncGateCopied",
                  ),
                  copyPostSaveSyncGateFailed: t(
                    "relationConfirm.copyPostSaveSyncGateFailed",
                  ),
                  copyMcpWrite: t("relationConfirm.copyMcpWrite"),
                  copyMcpWriteCopied: t("relationConfirm.copyMcpWriteCopied"),
                  copyMcpWriteFailed: t("relationConfirm.copyMcpWriteFailed"),
                  cancel: t("relationConfirm.cancel"),
                  confirm: t("relationConfirm.confirm"),
                  copyPacket: t("relationConfirm.copyPacket"),
                  copyPacketCopied: t("relationConfirm.copyPacketCopied"),
                  copyPacketFailed: t("relationConfirm.copyPacketFailed"),
                  closeAriaLabel: t("relationConfirm.closeAriaLabel"),
                  decisionLabels: {
                    safe_to_add: t("relationConfirm.decisions.safeToAdd.label"),
                    skip_existing: t("relationConfirm.decisions.skipExisting.label"),
                    review_inverse: t("relationConfirm.decisions.reviewInverse.label"),
                    review_path: t("relationConfirm.decisions.reviewPath.label"),
                  },
                  decisionHints: {
                    safe_to_add: t("relationConfirm.decisions.safeToAdd.hint"),
                    skip_existing: t("relationConfirm.decisions.skipExisting.hint"),
                    review_inverse: t("relationConfirm.decisions.reviewInverse.hint"),
                    review_path: t("relationConfirm.decisions.reviewPath.hint"),
                  },
                  relationKeyLabels: {
                    domains: t("relationConfirm.keys.domains.label"),
                    capabilities: t("relationConfirm.keys.capabilities.label"),
                    elements: t("relationConfirm.keys.elements.label"),
                    dependencies: t("relationConfirm.keys.dependencies.label"),
                    contains: t("relationConfirm.keys.contains.label"),
                    describes: t("relationConfirm.keys.describes.label"),
                    relates: t("relationConfirm.keys.relates.label"),
                  },
                  relationKeyHints: {
                    domains: t("relationConfirm.keys.domains.hint"),
                    capabilities: t("relationConfirm.keys.capabilities.hint"),
                    elements: t("relationConfirm.keys.elements.hint"),
                    dependencies: t("relationConfirm.keys.dependencies.hint"),
                    contains: t("relationConfirm.keys.contains.hint"),
                    describes: t("relationConfirm.keys.describes.hint"),
                    relates: t("relationConfirm.keys.relates.hint"),
                  },
                }}
              />
            ) : null}
            {!pendingRelation && lastSavedRelation ? (
              <RelationPostSaveHandoff
                relation={lastSavedRelation}
                onDismiss={() => setLastSavedRelation(null)}
                labels={{
                  title: t("relationPostSave.title"),
                  body: t("relationPostSave.body"),
                  relationLabel: t("relationPostSave.relationLabel"),
                  openPath: t("relationPostSave.openPath"),
                  sourceFocus: t("relationPostSave.sourceFocus"),
                  targetFocus: t("relationPostSave.targetFocus"),
                  queryCockpit: t("relationPostSave.queryCockpit"),
                  copyProofPacket: t("relationPostSave.copyProofPacket"),
                  copyProofPacketCopied: t(
                    "relationPostSave.copyProofPacketCopied",
                  ),
                  copyProofPacketFailed: t(
                    "relationPostSave.copyProofPacketFailed",
                  ),
                  copySyncGate: t("relationPostSave.copySyncGate"),
                  copySyncGateCopied: t("relationPostSave.copySyncGateCopied"),
                  copySyncGateFailed: t("relationPostSave.copySyncGateFailed"),
                  closeAriaLabel: t("relationPostSave.closeAriaLabel"),
                }}
              />
            ) : null}
          </div>
          <OntologyInspector
            ephemeralSelected={ephemeralSelected}
            vaultSelected={vaultSelected}
            vaultBacklinks={vaultBacklinks}
            onSelectBacklink={setSelectedId}
            vaultReadOnly={!hasLiveVault}
            isDesktopRuntime={isDesktopRuntime}
            untitledPlaceholder={t('untitledPlaceholder')}
            onRenameEphemeral={(id, title) => updateNode(id, { title })}
            onSaveEphemeral={saveEphemeral}
            onSaveVaultRename={renameVaultDoc}
            onEditVaultArrayKey={editVaultArrayKey}
            onEditVaultLiteral={editVaultLiteral}
            onDeleteVault={deleteVaultDoc}
            saving={savingId !== null || renamingId !== null}
            onClearSelection={() => setSelectedId(null)}
            collapsed={inspectorCollapsed}
            onToggleCollapsed={toggleInspector}
          />
        </section>
        {/* 모바일 fallback — md 미만에서 빌더 layout 이 겹치므로 데스크톱
            안내 + 트리 / 토폴로지 진입점 노출. */}
        <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-6 py-10 text-center md:hidden">
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-indigo-accent)]">
              {t("mobileEyebrow")}
            </p>
            <h2 className="text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {t("mobileTitle")}
            </h2>
            <p className="max-w-xs break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
              {t("mobileBody")}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              href={treeHref}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.14)] px-3 text-[12px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)]"
            >
              {t("mobileTreeCta")}
            </Link>
            <Link
              href="/topology/"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-[12px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
            >
              {t("mobileTopologyCta")}
            </Link>
          </div>
        </section>
      </main>
      <BlastRadiusConfirm
        open={pendingDelete !== null}
        slug={pendingDelete?.slug ?? ""}
        title={pendingDelete?.title}
        backlinks={pendingDelete?.backlinks ?? []}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmPendingDelete()}
      />
    </div>
  );
}
