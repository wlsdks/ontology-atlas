"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Info, Maximize2, Minimize2, Wand2 } from "lucide-react";
import {
  vaultManifest as staticVaultManifestRaw,
  type VaultManifest,
} from "@/entities/docs-vault";
import { useDataSourceMode } from "@/features/data-source-mode";
import { VaultConflictError, useLocalVault } from "@/features/docs-vault-local";
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
import { OntologyInspector } from "./OntologyInspector";
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

function CanvasSkeleton() {
  const t = useTranslations("ontologyPages.edit.page");
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-xs text-[color:var(--color-text-quaternary)]">{t("canvasLoading")}</p>
    </div>
  );
}

export function OntologyEditPage() {
  const t = useTranslations("ontologyPages.edit.page");
  const tKinds = useTranslations("kinds");
  const dataSourceMode = useDataSourceMode();
  const vault = useLocalVault();

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
  // 팔레트 / 인스펙터 접기 상태 — 사용자가 캔버스 공간 더 필요할 때.
  // localStorage 저장 (페이지 재진입 시 마지막 선호 유지).
  const [paletteCollapsed, setPaletteCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("demo:builder-palette:collapsed:v1") === "1";
    } catch {
      return false;
    }
  });
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("demo:builder-inspector:collapsed:v1") === "1";
    } catch {
      return false;
    }
  });
  const togglePalette = useCallback(() => {
    setPaletteCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("demo:builder-palette:collapsed:v1", next ? "1" : "0");
      } catch { /* private mode */ }
      return next;
    });
  }, []);
  const toggleInspector = useCallback(() => {
    setInspectorCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("demo:builder-inspector:collapsed:v1", next ? "1" : "0");
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
          // vault 미선택 (static) 시 vault picker 안내 — static 은 read-only.
          toast.show(t("toastDemoMode"), "error");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : t("toastSaveFailed");
        toast.show(message, "error");
      } finally {
        setSavingId(null);
      }
    },
    [dataSourceMode, findById, removeNode, t, toast, vault],
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
      dependencies: asStrings(fm.dependencies),
      relates: asStrings(fm.relates),
    };
  }, [selectedId, ephemeralSelected, docsBySlug]);

  // 선택된 vault 노드를 frontmatter array 로 가리키는 다른 노드 list.
  // ontology 탐색 핵심 — '이 노드를 누가 사용하나'. delete 시 backlinks
  // 도 같은 함수 사용 (BlastRadiusConfirm).
  const vaultBacklinks = useMemo(() => {
    if (!vaultSelected) return [];
    return findVaultBacklinks(effectiveManifest, vaultSelected.slug);
  }, [vaultSelected, effectiveManifest]);

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

  // vault frontmatter array 키 (capabilities/elements/dependencies/
  // relates) 편집. 빈 배열은 키 자체를 제거 (null) — frontmatter 깨끗.
  const editVaultArrayKey = useCallback(
    async (
      slug: string,
      key: "capabilities" | "elements" | "dependencies" | "relates",
      next: string[],
    ) => {
      try {
        await vault.updateFrontmatter(
          slug,
          {
            [key]: next.length === 0 ? null : next,
          },
          { expectedMtime: getExpectedMtime(slug) },
        );
      } catch (err) {
        showVaultWriteError(err, t("toastSaveFailed"));
      }
    },
    [getExpectedMtime, showVaultWriteError, t, vault],
  );

  // 캔버스에서 vault A 핸들 → vault B 드래그 시 호출. source 의
  // frontmatter 에 적절한 array key 로 target slug 추가 — 인스펙터 array
  // editor 와 동일 진실원, ERD 빌더의 자연스러운 관계 추가 흐름.
  // kind pair 별 의미: project↔project=dependencies, domain→capability=
  // capabilities, capability→element=elements, 그 외=relates.
  const inferEdgeKey = useCallback(
    (
      sourceKind: string,
      targetKind: string,
    ): "capabilities" | "elements" | "dependencies" | "relates" => {
      if (sourceKind === "project" && targetKind === "project") return "dependencies";
      if (sourceKind === "domain" && targetKind === "capability") return "capabilities";
      if (sourceKind === "capability" && targetKind === "element") return "elements";
      return "relates";
    },
    [],
  );
  const connectVaultEdge = useCallback(
    async (
      sourceSlug: string,
      targetSlug: string,
      sourceKind: string,
      targetKind: string,
    ) => {
      // dogfood vault (read-only) 에선 patch 불가 — 안내 토스트.
      if (!hasLiveVault) {
        toast.show(t("toastVaultEdgeDemo"), "error");
        return;
      }
      const key = inferEdgeKey(sourceKind, targetKind);
      const sourceDoc = effectiveManifest.docs.find((d) => d.slug === sourceSlug);
      const existing = sourceDoc?.frontmatter[key];
      const currentArray = Array.isArray(existing)
        ? existing.filter((v): v is string => typeof v === "string")
        : [];
      // 자기 자신 또는 중복 reference 무시.
      const targetRef = targetSlug;
      if (sourceSlug === targetSlug || currentArray.includes(targetRef)) {
        toast.show(t("toastVaultEdgeDuplicate"), "info");
        return;
      }
      const next = [...currentArray, targetRef];
      try {
        await vault.updateFrontmatter(
          sourceSlug,
          { [key]: next },
          { expectedMtime: getExpectedMtime(sourceSlug) },
        );
        toast.show(
          t("toastVaultEdgeAdded", { key, source: sourceSlug, target: targetSlug }),
          "success",
        );
      } catch (err) {
        showVaultWriteError(err, t("toastSaveFailed"));
      }
    },
    [effectiveManifest, getExpectedMtime, hasLiveVault, inferEdgeKey, showVaultWriteError, t, toast, vault],
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
        toast.show(t("toastVaultEdgeDemo"), "error");
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
      await connectVaultEdge(
        sourceInfo.slug,
        targetInfo.slug,
        sourceInfo.kind,
        targetInfo.kind,
      );
      removeEphemeralEdge(edgeId);
    },
    [
      ephemeralEdges,
      hasLiveVault,
      toast,
      t,
      findById,
      vault,
      removeNode,
      docsBySlug,
      connectVaultEdge,
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
            : "mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-[1800px] flex-col px-3 py-3 md:px-5 md:py-4"
        }
      >
        <header className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* eyebrow 'ONTOLOGY BUILDER' 는 OperationsNav 의 SubNav 행이
                같은 caption ('ONTOLOGY') + active '빌더' pill 로 이미 노출 →
                중복 제거. h1 만 남겨 페이지 정체성 유지. */}
            <h1 className="text-xl font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {t("title")}
            </h1>
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
          <div className="flex items-center gap-2">
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
                  className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-3 text-xs text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:bg-[color:rgba(94,106,210,0.16)]"
                  aria-label={t("exportAriaLabel")}
                >
                  {t("exportButton")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadJsonLd({
                      ephemeralNodes,
                      ephemeralEdges,
                    })
                  }
                  className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.32)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={t("exportJsonLdAriaLabel")}
                >
                  {t("exportJsonLdButton")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadGraphML({
                      ephemeralNodes,
                      ephemeralEdges,
                    })
                  }
                  className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.32)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={t("exportGraphMlAriaLabel")}
                >
                  {t("exportGraphMlButton")}
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
                      ? "inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-[color:rgba(229,72,77,0.55)] bg-[color:rgba(229,72,77,0.18)] px-3 text-xs text-[color:rgba(236,116,116,0.95)] transition-colors hover:bg-[color:rgba(229,72,77,0.28)]"
                      : "inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(229,72,77,0.32)] hover:text-[color:var(--color-text-primary)]"
                  }
                  aria-label={t("clearAriaLabel", {
                    nodes: ephemeralNodes.length,
                    edges: ephemeralEdges.length,
                  })}
                >
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
              className="inline-flex h-8 shrink-0 items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] p-0.5"
            >
              <button
                type="button"
                role="radio"
                aria-checked={layoutMode === "dagre"}
                onClick={() => setLayoutMode("dagre")}
                title={t("layoutDagreTitle")}
                className={`rounded-full px-2 text-[10px] tracking-[0.04em] transition-colors ${
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
                className={`rounded-full px-2 text-[10px] tracking-[0.04em] transition-colors ${
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
        {/* 빌더는 palette (200) + canvas + inspector (280) = 480px+ 의 ERD
            레이아웃 — 모바일 (<md, 768px 미만) viewport 에서는 컬럼이 겹쳐
            unreadable. 데스크톱 권장 안내 + 트리 / 토폴로지 fallback CTA 를
            모바일에만 노출. md+ 에서는 정상 빌더. */}
        <section className="relative hidden flex-1 overflow-hidden rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] md:flex">
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
              empty={ephemeralNodes.length === 0 && ephemeralEdges.length === 0}
            />
          </div>
          <OntologyInspector
            ephemeralSelected={ephemeralSelected}
            vaultSelected={vaultSelected}
            vaultBacklinks={vaultBacklinks}
            onSelectBacklink={setSelectedId}
            vaultReadOnly={!hasLiveVault}
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
