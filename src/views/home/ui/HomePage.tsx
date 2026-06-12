"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { BookOpen, Plus } from "lucide-react";
import { useTypingShortcuts } from "@/shared/lib/use-typing-shortcut";
import { useProjects } from "@/features/project-data-source";
import { useOntologyInsight } from "@/features/vault-ontology";
import { useLocalVault } from "@/features/docs-vault-local";
// 타입/기본값은 Sigma(WebGL) 의존성 없는 별도 모듈에서 직접 import해서
// SSR 평가 경로에 WebGL 참조가 끼지 않도록 한다.
import {
  DEFAULT_SIGMA_CONTROLS,
  type SigmaControlsState,
} from "@/widgets/topology-map-sigma/model/controls-state";
import type { TopologyRelationVisibilityStats } from "@/widgets/topology-map-sigma";
import { HeroCollapsed } from "@/widgets/hero-header";
import dynamic from "next/dynamic";
import { ProjectDrawer } from "@/widgets/project-drawer";
import { SearchHint } from "@/widgets/search-hint";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { useLocalStorageBoolean } from "@/shared/lib/use-local-storage-boolean";
import { useTaxonomy } from "@/features/taxonomy";

// 첫 방문에 바로 필요 없는 오버레이들은 지연 로딩.
// 초기 번들에서 분리되어 FCP/LCP 와 TTI 가 더 빨라진다.
// SigmaTopology 는 sigma.js + edge-curve + node-border 등 무거운 deps 를
// 끌고 와 chunk 가 큼. 첫 진입 / 캐시 비었을 때 chunk 다운로드 동안 빈
// 화면이 그대로 보여 "멈춤" 느낌이라, 데이터 구독 skeleton 과 동일 톤
// fallback 을 모듈 로드 단계에도 표시.
function TopologyLoadingFallback() {
  const t = useTranslations('topology');
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-full border border-[color:rgba(139,151,255,0.28)] bg-[color:var(--color-panel)] px-4 py-2 shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
        <span className="flex gap-1">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-indigo-accent)] [animation-delay:0ms]" />
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-indigo-accent)] [animation-delay:150ms]" />
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-indigo-accent)] [animation-delay:300ms]" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-tertiary)]">
          {t('loadingEngine')}
        </span>
      </div>
    </div>
  );
}

const SigmaTopology = dynamic(
  () => import("@/widgets/topology-map-sigma").then((m) => m.SigmaTopology),
  { ssr: false, loading: () => <TopologyLoadingFallback /> },
);
/** 안정 참조 빈 set — 영향 보기 비활성 시 매 render 새 Set 생성 회피. */
const EMPTY_IMPACT_SET: ReadonlySet<string> = new Set();
const SigmaControls = dynamic(
  () => import("@/widgets/topology-map-sigma").then((m) => m.SigmaControls),
  { ssr: false },
);
const SigmaHubRail = dynamic(
  () => import("@/widgets/topology-map-sigma").then((m) => m.SigmaHubRail),
  { ssr: false },
);
const TopologyEmptyState = dynamic(
  () => import("@/widgets/topology-map-sigma").then((m) => m.TopologyEmptyState),
  { ssr: false },
);
const SearchPalette = dynamic(
  () => import("@/widgets/search-palette").then((m) => m.SearchPalette),
  { ssr: false },
);
const ShortcutSheet = dynamic(
  () => import("@/widgets/shortcut-sheet").then((m) => m.ShortcutSheet),
  { ssr: false },
);
const DocsQuickDrawer = dynamic(
  () => import("@/widgets/docs-quick-drawer").then((m) => m.DocsQuickDrawer),
  { ssr: false },
);
const MountedGlobalSearch = dynamic(
  () =>
    import("@/widgets/global-search").then((m) => m.MountedGlobalSearch),
  { ssr: false },
);
import { GestureHint } from "@/widgets/gesture-hint";
import { PINNED_DOCS_STORAGE_PREFIX } from "@/widgets/docs-vault";
import { LiveAnnouncer, Tooltip, useToast } from "@/shared/ui";
import {
  detectOrphanProjects,
  detectPromotionCandidates,
  detectStaleProjects,
  getProjectDetailHref,
  type Project,
  type ProjectImpactMode,
} from "@/entities/project";
import { buildDocsVaultHref, buildNewNodeDoc } from "@/entities/docs-vault";
import {
  buildOntologyHealthSignals,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildOntologyReachability, IMPACT_EXCLUDED_RELATION_TYPES, computeOntologyChangeset, useChangeBaseline } from "@/shared/lib/ontology-tree";
import { useHomeRouteState } from "../model/use-home-route-state";
import {
  selectTopologyNodeRouteState,
  type TopologyAnalysisMode,
} from "../model/url-state";
import {
  buildTopologyAnalysisSummary,
  buildTopologyHealthActionTarget,
} from "../lib/topology-analysis";
import {
  countProjectRelationsWithinGraph,
  resolveTopologyOverlayState,
  resolveTopologyRenderState,
} from "../lib/topology-render-state";
import { resolveTopologySelectedOntologyNode } from "../lib/resolve-topology-selected-node";
import {
  buildNodeFrontmatterEdit,
  resolveTopologyNodeEditTarget,
} from "../lib/topology-node-edit";
import { CreateNodeForm, type CreateNodeKind } from "./CreateNodeForm";
import {
  buildVaultRelationPatch,
  VAULT_RELATION_KEYS,
  type VaultRelationKey,
} from "@/entities/docs-vault/lib/relation-proposal";
import { parseFrontmatter } from "@/shared/lib/parse-frontmatter";
import { replaceVaultBody } from "@/shared/lib/replace-vault-body";
import { TopologyOntologyDrawer } from "./TopologyOntologyDrawer";
import { TopologyNodePopover } from "./TopologyNodePopover";
import { buildTopologyOntologyDrawerModel } from "../lib/topology-ontology-drawer";
import { buildTopologyNodeFocus } from "../lib/topology-node-focus";
import {
  buildNodeSignificance,
  normalizeKindLabelKey,
} from "../lib/topology-node-significance";
import { buildOntologySkeleton } from "../lib/topology-ontology-skeleton";
import { buildRevealRadialLayout } from "../lib/topology-skeleton-layout";
import { buildSkeletonCardModels } from "../lib/topology-skeleton-cards";
import { computeRevealState } from "../lib/topology-reveal-state";
import { TopologyAnalysisBar } from "./TopologyAnalysisBar";
import { TopologyReviewLink } from "./TopologyReviewLink";
import { TopologyNoMatchesState } from "./TopologyNoMatchesState";

const LEFT_PANEL_COLLAPSED_KEY = "demo:left-panel-collapsed:v2";

export function HomePage() {
  const t = useTranslations('topology');
  const tKinds = useTranslations('kinds');
  const tEdgeTypes = useTranslations('edgeTypes');
  const { categories: taxonomyCategories } = useTaxonomy();
  const [sigmaControls, setSigmaControls] = useState<SigmaControlsState>(
    DEFAULT_SIGMA_CONTROLS,
  );
  const [localGraphStack, setLocalGraphStack] = useState<string[]>([]);
  const localGraphRoot =
    localGraphStack.length > 0 ? localGraphStack[localGraphStack.length - 1] : null;
  const [fitViewToken, setFitViewToken] = useState(0);
  const [sigmaVisibleCount, setSigmaVisibleCount] = useState<number | null>(null);
  const [sigmaGraphStats, setSigmaGraphStats] = useState<{
    key: string;
    nodes: number;
    relations: number;
  } | null>(null);
  const [sigmaRelationVisibility, setSigmaRelationVisibility] = useState<
    (TopologyRelationVisibilityStats & { key: string }) | null
  >(null);
  const [, setSigmaHintDismissed] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem('demo:sigma-hint-dismissed:v1') === '1';
    } catch {
      return true;
    }
  });
  const dismissSigmaHint = useCallback(() => {
    setSigmaHintDismissed(true);
    try {
      window.localStorage.setItem('demo:sigma-hint-dismissed:v1', '1');
    } catch {
      /* private mode — skip */
    }
  }, []);
  const router = useRouter();
  // mode-aware projects read — local 모드는 vault 매니페스트 sync, static 은
  // 빌드타임 dogfood 매니페스트. mission T7 — vault 의 .md 가 즉시 list/topology 에 반영.
  const projectsQuery = useProjects();
  const projects = projectsQuery.projects;
  const projectsError = projectsQuery.error;
  const [routeState, setRouteState] = useHomeRouteState();
  // 상세 화면에서 Cmd+K를 누르면 홈으로 이동하며 sessionStorage 플래그를
  // 남긴다. 여기서 그 플래그가 있으면 첫 렌더부터 검색 팔레트를 열어 hydration
  // mismatch 없이 한 번에 보이게 한다. lazy initializer는 클라이언트에서만 실제
  // 실행되므로 SSR은 항상 false, 클라이언트 hydration도 sessionStorage 없는
  // 서버 프리렌더 기준 false → 불일치 없음.
  const [searchOpen, setSearchOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      if (window.sessionStorage.getItem("demo:open-search") === "1") {
        window.sessionStorage.removeItem("demo:open-search");
        return true;
      }
    } catch {
      /* private mode — skip */
    }
    return false;
  });
  // ⇧⌘K — ontology / 문서 / 프로젝트 통합 검색 (project 전용
  // SearchPalette 와 별 슬롯). MountedGlobalSearch 가 controlled mode 로
  // 이 open state 를 받아 동작.
  const [ontologySearchOpen, setOntologySearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      if (window.sessionStorage.getItem("demo:open-shortcuts") === "1") {
        window.sessionStorage.removeItem("demo:open-shortcuts");
        return true;
      }
    } catch {
      /* private mode */
    }
    return false;
  });
  const [docsDrawerOpen, setDocsDrawerOpen] = useState(false);
  const [docsPinnedCount, setDocsPinnedCount] = useState(0);
  // SSR 과 첫 클라이언트 렌더가 같아야 한다 — useState 초기화에서
  // localStorage 를 읽으면 hydration mismatch (TopologyAnalysisBar
  // className 의 leftPanelExpanded 분기가 서버/클라 불일치). 저장된
  // 선호는 useSyncExternalStore 의 server snapshot 으로 SSR 기본값을 유지한
  // 뒤 클라이언트 snapshot 에서 반영한다.
  const leftPanelCollapsed = useLocalStorageBoolean(LEFT_PANEL_COLLAPSED_KEY, true);
  const [topologyRelayoutToken, setTopologyRelayoutToken] = useState(0);
  // useProjects 실패 시 UI 가 빈 채로 영구 고착되는 걸 막기 위한 에러
  // 상태. 사용자 vault 디스크 read 실패 / 권한 만료 등의 경우 배너 노출
  // + "다시 시도" 버튼으로 복구.
  const toast = useToast();
  const prefetchedProjectHrefsRef = useRef(new Set<string>());
  const preloadedImageUrlsRef = useRef(new Set<string>());
  const {
    activeCategory,
    selectedSlug,
    impactMode,
    analysisMode,
    pathSourceSlug,
    pathTargetSlug,
  } = routeState;
  const renderProjects = projects;
  const selectedProject = useMemo(
    () =>
      selectedSlug
        ? (renderProjects.find((p) => p.slug === selectedSlug) ?? null)
        : null,
    [selectedSlug, renderProjects],
  );
  // R+ ontology 노드 클릭 시 (#259 후속) drawer 가 비지 않게 ontology
  // insight 에서 노드 정보 찾기. selectedSlug 가 ontology id 인데 project
  // 매칭이 없을 때만 사용 — 즉 토폴로지에서 domain/capability/element
  // 노드 클릭한 케이스.
  const { insight: ontologyInsight } = useOntologyInsight();
  // 변경점 baseline(공유 스토어)이 찍혀 있으면, 기준 이후 added/changed 된
  // ontology 노드를 토폴로지에서 pulse 로 강조 — /ontology 변경 패널과 같은
  // 기준을 spatial view 에서도 본다(회의·리뷰).
  const changeBaseline = useChangeBaseline();
  // changeset 을 1회 계산 — pulse(touchedNodeIds)와 재진입 리뷰 pill(#5) 둘 다 사용.
  const ontologyChangeset = useMemo(
    () =>
      computeOntologyChangeset(changeBaseline, ontologyInsight?.nodes ?? [], ontologyInsight?.edges ?? []),
    [changeBaseline, ontologyInsight],
  );
  const changedSlugs = ontologyChangeset.touchedNodeIds;
  const selectedOntologyNode = useMemo(() => {
    if (!selectedSlug || selectedProject) return null;
    if (!ontologyInsight) return null;
    return resolveTopologySelectedOntologyNode(selectedSlug, ontologyInsight.nodes);
  }, [selectedSlug, selectedProject, ontologyInsight]);
  // "지도에서 영향 보기" 토글 — 선택 노드의 전이 blast radius(영향받는 노드 set)
  // 를 그래프에서 공간적으로 강조. drawer 의 숫자(iter 3)를 부분그래프로.
  // *어느 노드에 대해* 켜졌는지를 state 로 둔다 — 선택이 바뀌면 derived active
  // 가 자동으로 false (effect 로 reset 안 함 → cascading render 회피).
  const [impactNodeSlug, setImpactNodeSlug] = useState<string | null>(null);
  const impactHighlightActive = impactNodeSlug != null && impactNodeSlug === selectedSlug;
  const toggleImpactHighlight = useCallback(() => {
    setImpactNodeSlug((prev) => (prev === selectedSlug ? null : (selectedSlug ?? null)));
  }, [selectedSlug]);
  const impactHighlightSet = useMemo<ReadonlySet<string>>(() => {
    if (!impactHighlightActive || !selectedOntologyNode || !ontologyInsight) {
      return EMPTY_IMPACT_SET;
    }
    // incoming = 이 노드를 (전이적으로) 의존하는 쪽 = 변경 시 영향받는 노드.
    // limit 크게 → 전체 reachable 노드 id 수집(요약 카운트 아닌 set 필요).
    // excludeTypes: soft association(related_to/describes) 제외 — drawer 의
    // "Affected" 카운트와 같은 의존 blast-radius 의미로 맞춰, overlay 가 강조하는
    // 노드 set 이 드로어 수치와 일치하게(related_to 웹 비-discriminating 제거). iter 27.
    const reach = buildOntologyReachability(selectedOntologyNode.id, ontologyInsight.nodes, ontologyInsight.edges, {
      direction: "incoming",
      depth: Math.max(ontologyInsight.nodes.length, 1),
      limit: ontologyInsight.nodes.length + 1,
      excludeTypes: IMPACT_EXCLUDED_RELATION_TYPES,
    });
    const set = new Set<string>([selectedOntologyNode.id]);
    for (const layer of reach.layers) {
      for (const n of layer.nodes) set.add(n.id);
    }
    return set;
  }, [impactHighlightActive, selectedOntologyNode, ontologyInsight]);
  // S1.1 — 토폴로지를 온톨로지의 1차 편집 surface 로. writable 로컬 vault 면
  // 선택 노드를 자기 .md 문서로 해석해 drawer 에서 domain 인라인 편집을 허용.
  const vault = useLocalVault();
  const nodeEditTarget = useMemo(
    () =>
      selectedOntologyNode
        ? resolveTopologyNodeEditTarget(selectedOntologyNode, vault.manifest?.docs ?? [])
        : null,
    [selectedOntologyNode, vault.manifest],
  );
  const saveNodeDomain = useCallback(
    async (next: string) => {
      if (!nodeEditTarget) return;
      const { updates, changed } = buildNodeFrontmatterEdit(nodeEditTarget.frontmatter, {
        domain: next,
      });
      if (!changed) return;
      try {
        await vault.updateFrontmatter(nodeEditTarget.vaultSlug, updates, {
          expectedMtime: nodeEditTarget.mtime,
        });
        toast.show(t("ontologyDrawer.domainEdit.saved"), "success");
      } catch {
        toast.show(t("ontologyDrawer.domainEdit.error"), "error");
      }
    },
    [nodeEditTarget, vault, toast, t],
  );
  // S2 — 토폴로지에서 새 노드를 직접 생성. writable 로컬 vault 일 때만.
  const [createNodeOpen, setCreateNodeOpen] = useState(false);
  const canCreateNode = vault.manifest !== null;
  const createNode = useCallback(
    async (input: { title: string; kind: CreateNodeKind; domain?: string }) => {
      try {
        const { slug, markdown } = buildNewNodeDoc(input);
        await vault.createDoc(slug, markdown);
        toast.show(t("createNode.toastSaved", { slug }), "success");
        setCreateNodeOpen(false);
      } catch (err) {
        const exists = err instanceof Error && err.message.includes("already exists");
        toast.show(exists ? t("createNode.toastExists") : t("createNode.toastError"), "error");
      }
    },
    [vault, toast, t],
  );
  // S3 — 토폴로지에서 선택 노드(source)로부터 관계 생성. 후보 target = 자기 제외한
  // vault 문서 노드. 빌더와 같은 buildVaultRelationPatch 경로 재사용(본문 보존 append).
  const relationTargets = useMemo(() => {
    if (!nodeEditTarget || !ontologyInsight) return [];
    const seen = new Set<string>();
    const out: { slug: string; title: string }[] = [];
    for (const n of ontologyInsight.nodes) {
      const slug = n.evidenceIds[0];
      if (!slug || slug === nodeEditTarget.vaultSlug || seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, title: n.title });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }, [nodeEditTarget, ontologyInsight]);
  const createRelation = useCallback(
    async (input: { targetSlug: string; relationKey: VaultRelationKey }) => {
      if (!nodeEditTarget) return;
      const { patch, alreadyExists } = buildVaultRelationPatch(
        nodeEditTarget.frontmatter,
        input.relationKey,
        input.targetSlug,
      );
      if (alreadyExists) {
        toast.show(t("relationCreate.toastExists"), "info");
        return;
      }
      try {
        await vault.updateFrontmatter(nodeEditTarget.vaultSlug, patch, {
          expectedMtime: nodeEditTarget.mtime,
        });
        toast.show(
          t("relationCreate.toastSaved", { key: input.relationKey, target: input.targetSlug }),
          "success",
        );
      } catch {
        toast.show(t("relationCreate.toastError"), "error");
      }
    },
    [nodeEditTarget, vault, toast, t],
  );
  // S4 — 노드 "설명"(본문) 편집. manifest 의 excerpt 는 잘려 있어 편집 시
  // 손실 위험 → 편집 전 fileHandle 로 *raw 전체*를 읽어 본문을 시드한다.
  // 본문 로드 완료 전엔 explanationEdit 를 안 띄워 truncation 을 막는다.
  const [nodeBody, setNodeBody] = useState<{ slug: string; raw: string; body: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const target = nodeEditTarget;
    const fh =
      target && vault.manifest !== null ? vault.fileHandles.get(target.vaultSlug) : null;
    if (!target || !fh) {
      // 동기 setState 회피(cascading-render 경고) — microtask 로 defer.
      window.queueMicrotask(() => {
        if (!cancelled) setNodeBody(null);
      });
      return () => {
        cancelled = true;
      };
    }
    fh.getFile()
      .then((f) => f.text())
      .then((raw) => {
        if (!cancelled) {
          setNodeBody({ slug: target.vaultSlug, raw, body: parseFrontmatter(raw).body.trim() });
        }
      })
      .catch(() => {
        if (!cancelled) setNodeBody(null);
      });
    return () => {
      cancelled = true;
    };
  }, [nodeEditTarget, vault.manifest, vault.fileHandles]);
  const saveNodeExplanation = useCallback(
    async (next: string) => {
      if (!nodeEditTarget || !nodeBody || nodeBody.slug !== nodeEditTarget.vaultSlug) return;
      try {
        const content = replaceVaultBody(nodeBody.raw, next);
        await vault.saveDoc(nodeEditTarget.vaultSlug, content, {
          expectedMtime: nodeEditTarget.mtime,
        });
        toast.show(t("explanationEdit.saved"), "success");
      } catch {
        toast.show(t("explanationEdit.error"), "error");
      }
    },
    [nodeEditTarget, nodeBody, vault, toast, t],
  );
  const combinedFitToken = fitViewToken;
  const analysisModeRef = useRef<TopologyAnalysisMode>("overview");
  // 클라이언트 사이드 동적 타이틀 — 선택 프로젝트 컨텍스트를 브라우저 탭에
  // 노출 (정적 export 환경의 page metadata 한계 보완).
  useDocumentTitle(
    Array.from(
      new Set(
        [
          selectedProject?.name,
          selectedOntologyNode?.title,
          t('documentTitle'),
          "ontology-atlas",
        ].filter((value): value is string => Boolean(value)),
      ),
    ).join(" · ") || null,
  );
  const projectBySlug = useMemo(
    () => new Map(renderProjects.map((project) => [project.slug, project])),
    [renderProjects],
  );
  // reverse dependency map: slug → 이 slug 를 의존하는 프로젝트들.
  // localGraphProjects 2-hop 확장에서 매번 projects 전체 순회를 피하려고 1회
  // 계산해 재사용. O(E) 빌드, 조회 O(1).
  const reverseDeps = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const project of renderProjects) {
      for (const dep of project.dependencies) {
        const existing = map.get(dep);
        if (existing) {
          existing.push(project.slug);
        } else {
          map.set(dep, [project.slug]);
        }
      }
    }
    return map;
  }, [renderProjects]);

  const hubs = useMemo(() => renderProjects.filter((p) => p.isHub), [renderProjects]);
  // 지난 7일 내 updatedAt 된 프로젝트 수. hero subtitle 성장 카운터용.
  // Date.now() 는 순수 경고 때문에 useState lazy initializer 로 mount 시 1회
  // 만 캡처 (re-render 마다 경계 흔들리는 것도 방지 — 세션 동안 "이번 주"
  // 기준점이 안정적).
  const [mountNowMs] = useState<number>(() => Date.now());
  const recentlyUpdatedCount = useMemo(() => {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    return renderProjects.reduce((n, p) => {
      const updated = p.updatedAt ? p.updatedAt.getTime() : 0;
      return mountNowMs - updated < SEVEN_DAYS_MS ? n + 1 : n;
    }, 0);
  }, [renderProjects, mountNowMs]);
  // Local graph 모드: 선택 노드 + 2-hop 이웃만 Sigma에 넘김. 전체 지도에서
  // 벗어나 해당 노드 주변만 집중해서 볼 수 있게 한다. Esc 또는 닫기 버튼으로
  // 전체 맵 복귀.
  const localGraphProjects = useMemo(() => {
    if (!localGraphRoot) return renderProjects;
    // bySlug/reverseDeps 는 상위 useMemo 결과 재사용 — 매번 동일 Map 재생성
    // 방지. dep 확장 = O(|deps|), 역방향 확장 = O(|reverseDeps[slug]|).
    // 전체는 O(N + E) 로 2-hop 서브그래프 추출.
    const visited = new Set<string>([localGraphRoot]);
    let frontier = [localGraphRoot];
    for (let hop = 0; hop < 2; hop += 1) {
      const next: string[] = [];
      for (const slug of frontier) {
        const project = projectBySlug.get(slug);
        if (!project) continue;
        for (const dep of project.dependencies) {
          if (!visited.has(dep) && projectBySlug.has(dep)) {
            visited.add(dep);
            next.push(dep);
          }
        }
        const refs = reverseDeps.get(slug);
        if (refs) {
          for (const ref of refs) {
            if (!visited.has(ref)) {
              visited.add(ref);
              next.push(ref);
            }
          }
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    return renderProjects.filter((p) => visited.has(p.slug));
  }, [renderProjects, localGraphRoot, projectBySlug, reverseDeps]);

  // 구조 골격 진입 — root /topology 에서만(local-graph ego 제외). ontology 노드를
  // 결정론적 radial 골격으로 배치할 precomputed 좌표(slug→{x,y,size}) + 진입에
  // 보일 slug 집합을 계산해 SigmaTopology 에 데이터로 넘긴다. 클릭-레벨 확장:
  // 선택 노드(도메인→역량 전개, 역량→요소 전개)가 reveal 상태를 정해 같은
  // props 채널로 흐른다 — 좌표는 항상 결정론, 모션은 entrance fade 만.
  // FSD: widget 은 view 를 import 못 하므로 view(HomePage)가 계산해 props 로 전달.
  const topologySkeleton = useMemo(() => {
    if (localGraphRoot !== null || !ontologyInsight || ontologyInsight.nodes.length === 0) {
      return null;
    }
    const skel = buildOntologySkeleton(ontologyInsight.nodes, ontologyInsight.edges);
    const reveal = computeRevealState({
      skeleton: skel,
      nodes: ontologyInsight.nodes,
      edges: ontologyInsight.edges,
      selectedSlug: selectedOntologyNode?.id ?? null,
    });
    const layout = buildRevealRadialLayout(skel, ontologyInsight.nodes, reveal, {
      width: 1000,
      height: 1000,
      // 와이드 뷰포트 — 정원은 autoRescale 후 좌우가 비고 세로 거리가 멀어
      // 보인다. 타원으로 화면 비율에 맞춰 카드 간격을 죄인다.
      aspectX: 1.45,
    });
    const map = new Map<string, { x: number; y: number; size: number }>();
    const slugs = new Set<string>(reveal.visibleSlugs);
    for (const pt of layout.points) {
      if (!reveal.visibleSlugs.has(pt.id)) continue;
      const weight = skel.subtreeWeightBySlug.get(pt.id) ?? 0;
      const sizeBase =
        pt.tier === 0 ? 13 : pt.tier === 1 ? 8.5 : pt.tier === 2 ? 5 : 3.4;
      const sizeCap =
        pt.tier === 0 ? 16 : pt.tier === 1 ? 12 : pt.tier === 2 ? 7 : 4.6;
      // 토폴로지 좌표계는 원점(0,0) 중심(FA2 동일) — 레이아웃의 (500,500) 중심을
      // 원점으로 offset. y 는 부호반전(레이아웃 +y-down → Sigma +y-up).
      const coord = {
        x: pt.x - 500,
        y: 500 - pt.y,
        size: Math.min(sizeCap, sizeBase + 1.6 * Math.sqrt(weight)),
      };
      map.set(pt.id, coord);
      // id 정규화 — ontologyInsight 노드는 `project:`/`domain:`/`capability:`
      // prefixed id 지만, 토폴로지 그래프의 project 노드는 bare slug
      // (`ontology-atlas`) 다(renderProjects 출처). bare alias 를 같이 등록해
      // stamp/skeleton 매칭 누락(→ FA2 좌표로 bbox 폭파)을 막는다.
      const colon = pt.id.indexOf(':');
      if (colon >= 0) {
        const bare = pt.id.slice(colon + 1);
        if (!map.has(bare)) map.set(bare, coord);
        slugs.add(bare);
      }
    }
    // 펼친 자식 카드의 플러시 정렬(MindNode) — 부모를 향한 모서리를 노드
    // 좌표에 고정해, 폭이 제각각인 카드들이 지그재그로 보이지 않게.
    const anchorBySlug = new Map<string, "left" | "right">();
    const flushChildren = (parentSlug: string | null, children: readonly string[]) => {
      if (!parentSlug) return;
      const parent = layout.pointById.get(parentSlug);
      if (!parent) return;
      for (const child of children) {
        const pt = layout.pointById.get(child);
        if (!pt) continue;
        anchorBySlug.set(child, pt.x >= parent.x ? "left" : "right");
      }
    };
    flushChildren(reveal.scopeDomainSlug, reveal.domainCapabilitySlugs);
    flushChildren(reveal.scopeCapabilitySlug, reveal.capabilityElementSlugs);
    // 선택 노드의 자식 중 지도에 카드로 펼쳐진 집합 — 팝오버가 같은 노드를
    // 두 번 나열하지 않게 (도킹 열과 중복 제거).
    const expandedChildIds = new Set<string>(
      selectedOntologyNode?.id === reveal.scopeDomainSlug
        ? reveal.domainCapabilitySlugs
        : selectedOntologyNode?.id === reveal.scopeCapabilitySlug
          ? reveal.capabilityElementSlugs
          : [],
    );
    return {
      layout: map as ReadonlyMap<string, { x: number; y: number; size: number }>,
      slugs: slugs as ReadonlySet<string>,
      expandedChildIds: expandedChildIds as ReadonlySet<string>,
      // 노드의 "상" — Sigma 점 대신 디자인된 DOM 카드 (위계 타이포 + kind
      // data-mark + count). 골격이라 카드 수는 ~20-60 바운드.
      cards: buildSkeletonCardModels(skel, reveal, ontologyInsight.nodes, {
        anchorBySlug,
        // 펼친 자식 열은 부모 카드 rect 기준 px 도킹 — 그래프 좌표 배치는
        // 줌 배율에 따라 간격이 늘어나 "공백 과다"가 된다.
        dock: true,
      }),
    };
  }, [localGraphRoot, ontologyInsight, selectedOntologyNode]);

  useEffect(() => {
    if (!localGraphRoot) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLocalGraphStack((stack) => stack.slice(0, -1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [localGraphRoot]);

  const canvasSelectedSlug = selectedProject?.slug ?? selectedOntologyNode?.id ?? selectedSlug;
  const drawerProject = selectedProject;

  // 노드 클릭 default = 컴팩트 ego 팝오버. 풀스크린 드로어는 "전체 상세" opt-in.
  // overview first, details-on-demand — 설계: docs/TOPOLOGY-FOCUS-AND-SCALE.md
  // 어느 노드의 전체 상세가 열렸는지를 slug 로 들고, 현재 선택 노드와 일치할
  // 때만 드로어 — 다른 노드를 고르면 자동으로 팝오버부터(effect 불필요).
  const [fullDetailSlug, setFullDetailSlug] = useState<string | null>(null);
  const fullDetailOpen =
    fullDetailSlug != null && fullDetailSlug === selectedOntologyNode?.id;
  // 작성된 frontmatter `significance` (approach C override) — 있으면 "왜 중요한가"
  // 줄을 derive 대신 그걸로. 미지정 키는 파서가 보존하므로 schema 변경 0.
  const authoredSignificance = useMemo(() => {
    const value = nodeEditTarget?.frontmatter?.significance;
    return typeof value === "string" ? value : null;
  }, [nodeEditTarget]);
  // drawer model 1회 빌드로 focus(팝오버 연결) + significance(평문 so-what) 둘 다
  // 파생 — 재계산 0, count drift 불가.
  const nodeFocusData = useMemo(() => {
    if (!selectedOntologyNode || !ontologyInsight) return null;
    const model = buildTopologyOntologyDrawerModel(
      selectedOntologyNode,
      ontologyInsight.nodes,
      ontologyInsight.edges,
    );
    return {
      focus: buildTopologyNodeFocus(selectedOntologyNode, model),
      significance: buildNodeSignificance(selectedOntologyNode, model, {
        authoredSignificance,
      }),
    };
  }, [selectedOntologyNode, ontologyInsight, authoredSignificance]);
  const nodeFocus = nodeFocusData?.focus ?? null;
  // 구조 모델 → i18n 문장(보간·select·plural 은 메시지가 담당) → 팝오버 prop.
  const nodeSignificancePresentation = useMemo(() => {
    const significance = nodeFocusData?.significance;
    if (!significance) return null;
    const kindLabel = tKinds(normalizeKindLabelKey(significance.kind));
    return {
      whatLine: significance.ownerDomainTitle
        ? t("significance.whatWithDomain", {
            kind: kindLabel,
            domain: significance.ownerDomainTitle,
          })
        : t("significance.what", { kind: kindLabel }),
      importanceLine:
        significance.importance.authored ??
        t("significance.importance", {
          level: significance.importance.level,
          count: significance.importance.usedByCount,
        }),
      dependsOnLine: t("significance.dependsOn", {
        count: significance.dependsOn.count,
        names: significance.dependsOn.names.join(", "),
      }),
      impactLine: t("significance.impact", {
        count: significance.impact.reachCount,
      }),
      level: significance.importance.level,
    };
  }, [nodeFocusData, t, tKinds]);

  const handleSelect = useCallback(
    (
      slug: string,
      options?: { preserveImpact?: boolean },
    ) => {
      // Ontology node clicks and shareable vault slugs both stay on
      // /topology; selected-node resolution happens against ontologyInsight.
      // 노드 선택 = drawer 열기. 허브를 선택하면 포커스 모드 자동 활성,
      // 일반 노드는 포커스 해제.
      // projectBySlug Map 으로 O(1) lookup — 이전엔 매 클릭마다
      // renderProjects.find 로 O(N) 스캔.
      // 새 노드 선택(연결 클릭 포함) = 항상 컴팩트 팝오버부터.
      setFullDetailSlug(null);
      const project = projectBySlug.get(slug);
      setRouteState((current) =>
        selectTopologyNodeRouteState(current, slug, {
          isHub: Boolean(project?.isHub),
          preserveImpact: options?.preserveImpact,
        }),
      );
      dismissSigmaHint();
    },
    [projectBySlug, setRouteState, dismissSigmaHint],
  );

  const handleClose = useCallback(() => {
    setFullDetailSlug(null);
    setRouteState((current) => ({
      ...current,
      selectedSlug: null,
      focusedHubSlug: null,
      impactMode: "none",
    }));
  }, [setRouteState]);


  const handleSelectImpactMode = useCallback(
    (nextMode: ProjectImpactMode) => {
      setRouteState((current) => ({
        ...current,
        impactMode: nextMode,
      }));
    },
    [setRouteState],
  );

  // '문서' 버튼에 띄울 pinned 뱃지 카운트 — 드로어 닫힐 때 localStorage 에서
  // 갱신. 드로어 내부에서 pin 토글하고 닫으면 즉시 버튼에 반영.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(
        `${PINNED_DOCS_STORAGE_PREFIX}server`,
      );
      if (!raw) {
        queueMicrotask(() => setDocsPinnedCount(0));
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      const nextCount = Array.isArray(parsed)
        ? parsed.filter((s): s is string => typeof s === "string").length
        : 0;
      queueMicrotask(() => setDocsPinnedCount(nextCount));
    } catch {
      queueMicrotask(() => setDocsPinnedCount(0));
    }
  }, [docsDrawerOpen]);

  // 공용 useTypingShortcuts로 글로벌 키 단축키 통합.
  useTypingShortcuts([
    // ⇧⌘K (ontology / 문서 통합 검색) — useTypingShortcuts 는 첫 일치 후
    // return 하므로 ⌘K 보다 먼저 정의해야 한다.
    {
      combo: { key: "k", meta: true, shift: true },
      onFire: () => setOntologySearchOpen((v) => !v),
    },
    {
      combo: { key: "k", meta: true },
      onFire: () => setSearchOpen((v) => !v),
    },
    {
      combo: { key: "?" },
      onFire: () => setShortcutsOpen((v) => !v),
    },
    {
      combo: { key: "d" },
      onFire: () => setDocsDrawerOpen((v) => !v),
    },
  ]);

  const drawerOpen = drawerProject !== null || selectedOntologyNode !== null;
  const analysisSelectedTitle = compactTopologyPanelTitle(
    selectedProject?.name ?? selectedOntologyNode?.title ?? null,
  );
  const pathSourceTitle = useMemo(
    () =>
      resolveTopologyNodeTitle({
        slug: pathSourceSlug,
        projectBySlug,
        ontologyNodes: ontologyInsight?.nodes,
      }),
    [pathSourceSlug, projectBySlug, ontologyInsight?.nodes],
  );
  const pathTargetTitle = useMemo(
    () =>
      resolveTopologyNodeTitle({
        slug: pathTargetSlug,
        projectBySlug,
        ontologyNodes: ontologyInsight?.nodes,
      }),
    [pathTargetSlug, projectBySlug, ontologyInsight?.nodes],
  );
  const topologyHealthSummary = useMemo(() => {
    const now = new Date(mountNowMs);
    const stale = detectStaleProjects(renderProjects, {
      now,
      daysThreshold: 30,
    });
    const orphan = detectOrphanProjects(renderProjects);
    const promotion = detectPromotionCandidates(renderProjects, {
      minFanIn: 4,
    });
    const ontologySignals = ontologyInsight
      ? buildOntologyHealthSignals(ontologyInsight.nodes, ontologyInsight.edges, {
          now,
          staleDaysThreshold: 30,
          promotionMinFanIn: 4,
        })
      : { stale: [], orphan: [], promotion: [] };
    const staleSignals = [...stale, ...ontologySignals.stale];
    const orphanSignals = [...orphan, ...ontologySignals.orphan];
    const promotionSignals = [...promotion, ...ontologySignals.promotion];

    return {
      staleCount: staleSignals.length,
      orphanCount: orphanSignals.length,
      promotionCount: promotionSignals.length,
      actionTarget: buildTopologyHealthActionTarget({
        stale: staleSignals,
        orphan: orphanSignals,
        promotion: promotionSignals,
      }),
    };
  }, [renderProjects, ontologyInsight, mountNowMs]);
  const topologyTotalNodes =
    renderProjects.length + (ontologyInsight?.nodes.length ?? 0);
  const topologyTotalRelations =
    renderProjects.reduce((sum, project) => sum + project.dependencies.length, 0) +
    (ontologyInsight?.edges.length ?? 0);
  const visibleTopologyNodeCount =
    localGraphRoot === null ? topologyTotalNodes : localGraphProjects.length;
  const visibleTopologyRelationCount =
    localGraphRoot === null
      ? topologyTotalRelations
      : countProjectRelationsWithinGraph(localGraphProjects);
  const visibleTopologyStatsKey = useMemo(
    () =>
      [
        localGraphRoot ?? "__root__",
        localGraphProjects
          .map((project) => `${project.slug}:${project.dependencies.join(",")}`)
          .join("|"),
        ontologyInsight ? `${ontologyInsight.nodes.length}:${ontologyInsight.edges.length}` : "0:0",
      ].join("::"),
    [localGraphRoot, localGraphProjects, ontologyInsight],
  );
  const currentSigmaGraphStats =
    sigmaGraphStats?.key === visibleTopologyStatsKey ? sigmaGraphStats : null;
  const currentSigmaRelationVisibility =
    sigmaRelationVisibility?.key === visibleTopologyStatsKey
      ? sigmaRelationVisibility
      : null;
  const topologyRenderState = resolveTopologyRenderState({
    dataReady: projectsQuery.loaded,
    totalNodes: currentSigmaGraphStats?.nodes ?? visibleTopologyNodeCount,
    totalRelations: currentSigmaGraphStats?.relations ?? visibleTopologyRelationCount,
  });
  const topologyFiltersActive =
    activeCategory !== null ||
    sigmaControls.searchQuery.trim().length > 0 ||
    sigmaControls.depthLimit !== null ||
    sigmaControls.hubsOnly;
  const overviewRelationVisibility =
    analysisMode === "overview" && !topologyFiltersActive && localGraphRoot === null
      ? currentSigmaRelationVisibility
        ? currentSigmaRelationVisibility.mode === "skeleton"
          ? currentSigmaRelationVisibility
          : { ...currentSigmaRelationVisibility, total: topologyTotalRelations }
        : null
      : null;
  const topologyOverlayState = resolveTopologyOverlayState({
    dataReady: projectsQuery.loaded,
    totalNodes: currentSigmaGraphStats?.nodes ?? visibleTopologyNodeCount,
    totalRelations: currentSigmaGraphStats?.relations ?? visibleTopologyRelationCount,
    visibleNodes: sigmaVisibleCount,
    filtersActive: topologyFiltersActive,
  });
  const emptyTopologyNodeCount = currentSigmaGraphStats?.nodes ?? visibleTopologyNodeCount;
  const handleSigmaGraphStatsChange = useCallback(
    (stats: { nodes: number; relations: number }) => {
      setSigmaGraphStats({ key: visibleTopologyStatsKey, ...stats });
    },
    [visibleTopologyStatsKey],
  );
  const handleSigmaRelationVisibilityChange = useCallback(
    (stats: TopologyRelationVisibilityStats) => {
      setSigmaRelationVisibility({ key: visibleTopologyStatsKey, ...stats });
    },
    [visibleTopologyStatsKey],
  );
  const clearTopologyFilters = useCallback(() => {
    setSigmaControls((current) => ({
      ...current,
      searchQuery: "",
      depthLimit: null,
      hubsOnly: false,
    }));
    setRouteState((current) => ({
      ...current,
      activeCategory: null,
    }));
  }, [setRouteState]);
  const analysisSummary = buildTopologyAnalysisSummary({
    mode: analysisMode,
    selectedTitle: analysisSelectedTitle,
    visibleCount: sigmaVisibleCount,
    totalCount: topologyTotalNodes,
    relationCount: topologyTotalRelations,
    ...topologyHealthSummary,
  });

  useEffect(() => {
    if (analysisModeRef.current === analysisMode) return;
    analysisModeRef.current = analysisMode;

    setSigmaControls((current) => {
      if (analysisMode === "focus") {
        return {
          ...current,
          depthLimit: current.depthLimit ?? 2,
          hubsOnly: false,
          overlays: {
            ...current.overlays,
            backrefHighlight: true,
            auditHighlight: false,
          },
        };
      }
      if (analysisMode === "health") {
        return {
          ...current,
          depthLimit: null,
          hubsOnly: false,
          overlays: {
            ...current.overlays,
            auditHighlight: true,
            backrefHighlight: false,
          },
        };
      }
      if (analysisMode === "path") {
        return {
          ...current,
          depthLimit: null,
          hubsOnly: false,
          overlays: {
            ...current.overlays,
            auditHighlight: false,
          },
        };
      }
      return {
        ...current,
        depthLimit: null,
        overlays: {
          ...current.overlays,
          auditHighlight: false,
        },
      };
    });
  }, [analysisMode]);

  const handleSelectAnalysisMode = useCallback(
    (mode: TopologyAnalysisMode) => {
      setRouteState((current) => ({
        ...current,
        analysisMode: mode,
        pathSourceSlug: mode === "path" ? current.pathSourceSlug : null,
        pathTargetSlug: mode === "path" ? current.pathTargetSlug : null,
      }));
    },
    [setRouteState],
  );

  const handlePathSelectionChange = useCallback(
    (selection: { sourceSlug: string | null; targetSlug: string | null }) => {
      setRouteState((current) => ({
        ...current,
        analysisMode: "path",
        selectedSlug: selection.sourceSlug ?? current.selectedSlug,
        pathSourceSlug: selection.sourceSlug,
        pathTargetSlug: selection.targetSlug,
      }));
    },
    [setRouteState],
  );

  const preloadProjectAsset = useCallback(
    (slug: string) => {
      const project = projectBySlug.get(slug);
      if (!project) return;

      const href = getProjectDetailHref(slug);
      if (!prefetchedProjectHrefsRef.current.has(href)) {
        prefetchedProjectHrefsRef.current.add(href);
        router.prefetch(href);
      }

      project.screenshots.slice(0, 2).forEach((url) => {
        if (!url || preloadedImageUrlsRef.current.has(url)) return;
        preloadedImageUrlsRef.current.add(url);
        const image = new window.Image();
        image.decoding = "async";
        image.src = url;
        image.decode?.().catch(() => {});
      });
    },
    [projectBySlug, router],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const candidateSlugs = new Set<string>();
    if (selectedSlug) candidateSlugs.add(selectedSlug);

    // 허브 top 5 도 백그라운드 preload — 홈에 오자마자 사용자가 허브를
    // 클릭해 드로어 열 때 스크린샷 즉시 뜨도록. idle callback 으로 현재
    // 인터랙션 방해 없이 수행.
    const addTopHubs = () => {
      hubs.slice(0, 5).forEach((hub) => candidateSlugs.add(hub.slug));
      candidateSlugs.forEach(preloadProjectAsset);
    };
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(addTopHubs);
      return () => win.cancelIdleCallback?.(id);
    }
    const handle = window.setTimeout(addTopHubs, 200);
    return () => window.clearTimeout(handle);
  }, [hubs, preloadProjectAsset, selectedSlug]);

  return (
    <main id="main" className="relative h-screen w-screen overflow-hidden bg-[color:var(--color-canvas)]">
      {/*
        스크린리더 랜드마크 명시 + SEO h1. 시각 디자인은 canvas 중심이라
        visible h1 을 두기 어려워 sr-only 로 문서 구조 only 에 보이게 한다.
      */}
      <h1 className="sr-only">
        {t('srHeading')}
      </h1>
      <GestureHint
        disabled={drawerOpen}
      />
      <LiveAnnouncer
        message={(() => {
          if (!selectedProject) return "";
          const deps = selectedProject.dependencies.length;
          // reverseDeps 는 위 useMemo 결과 — projects 전체 재filter 안 해도
          // O(1) lookup. 이전엔 매 render 마다 projects.filter 로 O(N*D).
          const referenced = reverseDeps.get(selectedProject.slug)?.length ?? 0;
          return t('selectionAnnouncement', {
            name: selectedProject.name,
            deps,
            referenced,
          });
        })()}
      />
      <>
            {/* 모바일 전용 미니 브랜드 라벨 */}
            <div className="pointer-events-none absolute left-4 top-[22px] z-10 -translate-y-1/2 md:hidden">
              <div className="flex items-center gap-2">
                <Image
                  src="/logo.png"
                  alt=""
                  aria-hidden="true"
                  width={26}
                  height={26}
                  priority
                  className="h-[26px] w-[26px] shrink-0 rounded-[7px] border border-[color:var(--color-border-soft)] object-cover"
                />
                <div>
                  <span
                    translate="no"
                    className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]"
                  >
                    ontology-atlas
                  </span>
                  <p className="mt-0.5 max-w-[180px] text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
                    {t('mobileTagline')}
                  </p>
                </div>
              </div>
            </div>
            {(() => {
              // 성장 시그널 — 지난 7일 내 updatedAt 된 프로젝트 수.
              // "지식이 자라고 있다" 를 2초 안에 느끼게 하는 카운터. 0 이면 숨김.
              const growthLabel = recentlyUpdatedCount > 0
                ? t('workspace.growthThisWeek', { count: recentlyUpdatedCount })
                : "";
              const workspaceSubtitle = t('workspace.subtitle', {
                concepts: topologyTotalNodes,
                relations: topologyTotalRelations,
                growth: growthLabel,
              });
              const workspaceEyebrow = t('workspace.eyebrow', {
                concepts: topologyTotalNodes,
              });
              // 확장 hero 패널 제거 (사용자 결정 2026-06-11) — 컴팩트 pill 이
              // 유일한 상태고, ontology 칩 스트립을 pill 아래에 통합한다.
              // 확장형의 큰 타이틀+버튼 그리드는 지도와 경쟁하는 chrome 이었다.
              void workspaceEyebrow;
              return (
                <div className="topology-ui-scale pointer-events-none absolute left-4 top-4 z-10 hidden md:flex md:flex-col md:items-start md:gap-2 md:left-6 md:top-6 xl:left-8 xl:top-8">
                  <HeroCollapsed
                    // 확장 hero 가 사라진 surface — 토글은 의미가 없고
                    // 분석 패널만 아래로 점프시켰다(사용자 보고). 드로어가
                    // 열려 있을 때만 "닫기" 동작으로.
                    onExpand={drawerOpen ? handleClose : undefined}
                    title={selectedProject?.name ?? t('workspace.fallbackTitle')}
                    subtitle={
                      selectedProject
                        ? t('workspace.selectedEyebrow')
                        : topologyTotalNodes > 0
                          ? workspaceSubtitle
                          : t('workspace.expandHint')
                    }
                    icon={selectedProject?.icon ?? null}
                    ariaLabel={
                      drawerOpen
                        ? t('hero.closeSelected')
                        : t('hero.expandLeftPanel')
                    }
                    titleText={
                      drawerOpen
                        ? t('hero.closeSelected')
                        : t('hero.expandLeftPanel')
                    }
                    docsVaultHref={"/docs/"}
                    ontologyHref={"/ontology/"}
                  />
                  {/* WorkspaceOntologyStrip 제거(2026-06-11) — 분석 패널과
                      겹쳤고(사용자 보고), 카운트는 pill·범례가, 온톨로지
                      진입은 우측 라운드 버튼이 이미 담당. */}
                </div>
              );
            })()}
            <SearchHint
              onOpenSearch={() => {
                setSearchOpen(true);
              }}
              onRelayout={() => {
                setTopologyRelayoutToken((current) => current + 1);
                toast.show(t('controls.relayoutToast'), "info");
              }}
            />
            <div className="topology-ui-scale absolute right-4 top-4 z-20 flex items-center gap-2 md:right-6 md:top-6 xl:right-8 xl:top-8">
              <TopologyReviewLink
                changeset={ontologyChangeset}
                label={(count) => t('controls.reviewLabel', { count })}
                ariaLabel={(count) => t('controls.reviewAria', { count })}
              />
              <Tooltip content={t('controls.docsTooltip')} side="bottom" withProvider={false}>
              <button
                type="button"
                onClick={() => setDocsDrawerOpen((v) => !v)}
                aria-expanded={docsDrawerOpen}
                aria-label={t('controls.docsAriaLabel')}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3.5 text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] shadow-[0_10px_26px_rgba(0,0,0,0.14)] transition-[background-color,border-color,box-shadow,transform] duration-180 ease-out hover:border-[color:rgba(94,106,210,0.38)] hover:bg-[color:var(--color-panel)] active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] motion-reduce:transition-none motion-reduce:transform-none"
              >
                <BookOpen size={15} className="text-[color:var(--color-indigo-accent)]" />
                <span>{t('controls.docsLabel')}</span>
                {docsPinnedCount > 0 ? (
                  <span
                    className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[color:rgba(94,106,210,0.28)] px-1.5 font-mono text-[10px] tabular-nums text-[color:var(--color-indigo-accent)]"
                    aria-label={t('controls.pinnedDocsCount', { count: docsPinnedCount })}
                    title={t('controls.pinnedDocsCount', { count: docsPinnedCount })}
                  >
                    {docsPinnedCount}
                  </span>
                ) : null}
                <kbd
                  aria-hidden="true"
                  className="hidden rounded border border-[color:var(--color-overlay-3)] px-1 py-0.5 font-mono text-[9px] text-[color:var(--color-text-quaternary)] sm:inline"
                >
                  D
                </kbd>
              </button>
              </Tooltip>
              {canCreateNode ? (
                <Tooltip content={t('createNode.toggleTooltip')} side="bottom" withProvider={false}>
                  <button
                    type="button"
                    onClick={() => setCreateNodeOpen((v) => !v)}
                    aria-expanded={createNodeOpen}
                    aria-label={t('createNode.toggleAria')}
                    data-testid="topology-create-node-toggle"
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.14)] px-3.5 text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] shadow-[0_10px_26px_rgba(0,0,0,0.14)] transition-[background-color,border-color] duration-180 ease-out hover:bg-[color:rgba(94,106,210,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] motion-reduce:transition-none"
                  >
                    <Plus size={15} aria-hidden />
                    <span>{t('createNode.toggleLabel')}</span>
                  </button>
                </Tooltip>
              ) : null}
            </div>
            {canCreateNode && createNodeOpen ? (
              <div
                className="absolute inset-x-4 top-[9rem] z-30 md:left-auto md:right-[7.5rem] md:top-[9rem] md:w-[min(560px,calc(100vw-11rem))] xl:right-40 xl:top-[9.5rem]"
                data-testid="topology-create-node-panel"
              >
                <CreateNodeForm
                  onCreate={createNode}
                  onCancel={() => setCreateNodeOpen(false)}
                  labels={{
                    heading: t('createNode.heading'),
                    titlePlaceholder: t('createNode.titlePlaceholder'),
                    kind: t('createNode.kind'),
                    domain: t('createNode.domain'),
                    domainPlaceholder: t('createNode.domainPlaceholder'),
                    create: t('createNode.create'),
                    cancel: t('createNode.cancel'),
                    kindLabels: {
                      domain: t('createNode.kindDomain'),
                      capability: t('createNode.kindCapability'),
                      element: t('createNode.kindElement'),
                    },
                  }}
                />
              </div>
            ) : null}
            <TopologyAnalysisBar
              mode={analysisMode}
              summary={analysisSummary}
              healthAction={topologyHealthSummary.actionTarget}
              selectedSlug={selectedSlug}
              selectedTitle={analysisSelectedTitle}
              pathSourceSlug={pathSourceSlug}
              pathTargetSlug={pathTargetSlug}
              pathSourceTitle={pathSourceTitle}
              pathTargetTitle={pathTargetTitle}
              overviewRelationVisibility={overviewRelationVisibility}
              rightPanelReserved={drawerOpen}
              leftPanelExpanded={false}
              createPanelReserved={createNodeOpen}
              onModeChange={handleSelectAnalysisMode}
              onHealthAction={(slug) => handleSelect(slug)}
              labels={{
                title: t("analysis.title"),
                overview: t("analysis.overview"),
                focus: t("analysis.focus"),
                path: t("analysis.path"),
                health: t("analysis.health"),
                metricNodes: t("analysis.metricNodes"),
                metricRelations: t("analysis.metricRelations"),
                metricIssues: t("analysis.metricIssues"),
                healthStale: t("analysis.healthStale"),
                healthOrphan: t("analysis.healthOrphan"),
                healthPromotion: t("analysis.healthPromotion"),
                healthInspect: t("analysis.healthInspect"),
                healthCopy: t("analysis.healthCopy"),
                healthOpenOntology: t("analysis.healthOpenOntology"),
                healthRepair: t("analysis.healthRepair"),
                healthCopied: t("analysis.healthCopied"),
                actions: t("analysis.actions"),
                healthCopyTools: t("analysis.healthCopyTools"),
                healthMcpCopy: t("analysis.healthMcpCopy"),
                healthMcpCopied: t("analysis.healthMcpCopied"),
                healthMcpImpactCopy: t("analysis.healthMcpImpactCopy"),
                healthMcpImpactCopied: t("analysis.healthMcpImpactCopied"),
                healthSyncGateCopy: t("analysis.healthSyncGateCopy"),
                healthSyncGateCopied: t("analysis.healthSyncGateCopied"),
                healthHandoffSummary: t("analysis.healthHandoffSummary"),
                healthRepairOrderTitle: t("analysis.healthRepairOrderTitle"),
                healthRepairOrderInspect: t("analysis.healthRepairOrderInspect"),
                healthRepairOrderRepair: t("analysis.healthRepairOrderRepair"),
                healthRepairOrderSync: t("analysis.healthRepairOrderSync"),
                healthRepairTargetLabel: t("analysis.healthRepairTargetLabel"),
                overviewBriefCopy: t("analysis.overviewBriefCopy"),
                overviewBriefCopied: t("analysis.overviewBriefCopied"),
                overviewHandoffSummary: t("analysis.overviewHandoffSummary"),
                overviewWorkOrderTitle: t("analysis.overviewWorkOrderTitle"),
                overviewWorkOrderRead: t("analysis.overviewWorkOrderRead"),
                overviewWorkOrderFocus: t("analysis.overviewWorkOrderFocus"),
                overviewWorkOrderPath: t("analysis.overviewWorkOrderPath"),
                overviewWorkOrderHealth: t("analysis.overviewWorkOrderHealth"),
                overviewBriefCopyAriaLabel: t(
                  "analysis.overviewBriefCopyAriaLabel",
                ),
                overviewBriefCopiedAriaLabel: t(
                  "analysis.overviewBriefCopiedAriaLabel",
                ),
                overviewBriefTitle: t("analysis.overviewBriefTitle"),
                overviewBriefTotalNodes: t("analysis.overviewBriefTotalNodes"),
                overviewBriefTotalRelations: t(
                  "analysis.overviewBriefTotalRelations",
                ),
                overviewBriefHealthSignals: t(
                  "analysis.overviewBriefHealthSignals",
                ),
                overviewBriefHealthUrl: t("analysis.overviewBriefHealthUrl"),
                overviewBriefInsightsUrl: t("analysis.overviewBriefInsightsUrl"),
                overviewBriefAgentCheck: t("analysis.overviewBriefAgentCheck"),
                overviewBriefMcpCheck: t("analysis.overviewBriefMcpCheck"),
                overviewBriefMcpQueryPlan: t(
                  "analysis.overviewBriefMcpQueryPlan",
                ),
                overviewBriefWorkspaceCheck: t(
                  "analysis.overviewBriefWorkspaceCheck",
                ),
                overviewBriefMcpWorkspaceCheck: t(
                  "analysis.overviewBriefMcpWorkspaceCheck",
                ),
                overviewRelationVisibleCountSuffix: t(
                  "analysis.overviewRelationVisibleCountSuffix",
                ),
                overviewSkeletonCardCountSuffix: t(
                  "analysis.overviewSkeletonCardCountSuffix",
                ),
                overviewRelationLodNotice: t("analysis.overviewRelationLodNotice"),
                overviewRelationPreparingNotice: t(
                  "analysis.overviewRelationPreparingNotice",
                ),
                overviewSkeletonNotice: t("analysis.overviewSkeletonNotice"),
                overviewReanalyzeCopy: t("analysis.overviewReanalyzeCopy"),
                overviewReanalyzeCopied: t("analysis.overviewReanalyzeCopied"),
                overviewSyncCopy: t("analysis.overviewSyncCopy"),
                overviewSyncCopied: t("analysis.overviewSyncCopied"),
                overviewReanalyzeCopyAriaLabel: t(
                  "analysis.overviewReanalyzeCopyAriaLabel",
                ),
                overviewReanalyzeCopiedAriaLabel: t(
                  "analysis.overviewReanalyzeCopiedAriaLabel",
                ),
                overviewSyncCopyAriaLabel: t("analysis.overviewSyncCopyAriaLabel"),
                overviewSyncCopiedAriaLabel: t(
                  "analysis.overviewSyncCopiedAriaLabel",
                ),
                focusBriefCopy: t("analysis.focusBriefCopy"),
                focusBriefCopied: t("analysis.focusBriefCopied"),
                focusMcpCopy: t("analysis.focusMcpCopy"),
                focusMcpCopied: t("analysis.focusMcpCopied"),
                focusMcpImpactCopy: t("analysis.focusMcpImpactCopy"),
                focusMcpImpactCopied: t("analysis.focusMcpImpactCopied"),
                focusSyncGateCopy: t("analysis.focusSyncGateCopy"),
                focusSyncGateCopied: t("analysis.focusSyncGateCopied"),
                focusEnhanceCopy: t("analysis.focusEnhanceCopy"),
                focusEnhanceCopied: t("analysis.focusEnhanceCopied"),
                focusOpenOntology: t("analysis.focusOpenOntology"),
                focusOpenBuilder: t("analysis.focusOpenBuilder"),
                focusHandoffSummary: t("analysis.focusHandoffSummary"),
                focusReviewOrderTitle: t("analysis.focusReviewOrderTitle"),
                focusReviewOrderProfile: t("analysis.focusReviewOrderProfile"),
                focusReviewOrderImpact: t("analysis.focusReviewOrderImpact"),
                focusReviewOrderRepair: t("analysis.focusReviewOrderRepair"),
                focusReviewOrderSync: t("analysis.focusReviewOrderSync"),
                focusBriefCopyAriaLabel: t("analysis.focusBriefCopyAriaLabel"),
                focusBriefCopiedAriaLabel: t(
                  "analysis.focusBriefCopiedAriaLabel",
                ),
                focusMcpCopyAriaLabel: t("analysis.focusMcpCopyAriaLabel"),
                focusMcpCopiedAriaLabel: t("analysis.focusMcpCopiedAriaLabel"),
                focusMcpImpactCopyAriaLabel: t(
                  "analysis.focusMcpImpactCopyAriaLabel",
                ),
                focusMcpImpactCopiedAriaLabel: t(
                  "analysis.focusMcpImpactCopiedAriaLabel",
                ),
                focusSyncGateCopyAriaLabel: t(
                  "analysis.focusSyncGateCopyAriaLabel",
                ),
                focusSyncGateCopiedAriaLabel: t(
                  "analysis.focusSyncGateCopiedAriaLabel",
                ),
                focusEnhanceCopyAriaLabel: t(
                  "analysis.focusEnhanceCopyAriaLabel",
                ),
                focusEnhanceCopiedAriaLabel: t(
                  "analysis.focusEnhanceCopiedAriaLabel",
                ),
                focusBriefTitle: t("analysis.focusBriefTitle"),
                focusBriefNode: t("analysis.focusBriefNode"),
                focusBriefUrl: t("analysis.focusBriefUrl"),
                focusBriefOntologyUrl: t("analysis.focusBriefOntologyUrl"),
                focusBriefBuilderUrl: t("analysis.focusBriefBuilderUrl"),
                focusBriefReviewFocus: t("analysis.focusBriefReviewFocus"),
                focusBriefAgentCheck: t("analysis.focusBriefAgentCheck"),
                focusBriefMcpCheck: t("analysis.focusBriefMcpCheck"),
                focusBriefImpactCheck: t("analysis.focusBriefImpactCheck"),
                focusBriefMcpImpactCheck: t("analysis.focusBriefMcpImpactCheck"),
                focusBriefSyncGate: t("analysis.focusBriefSyncGate"),
                healthMcpCopyAriaLabel: t("analysis.healthMcpCopyAriaLabel"),
                healthMcpCopiedAriaLabel: t(
                  "analysis.healthMcpCopiedAriaLabel",
                ),
                healthMcpImpactCopyAriaLabel: t(
                  "analysis.healthMcpImpactCopyAriaLabel",
                ),
                healthMcpImpactCopiedAriaLabel: t(
                  "analysis.healthMcpImpactCopiedAriaLabel",
                ),
                healthSyncGateCopyAriaLabel: t(
                  "analysis.healthSyncGateCopyAriaLabel",
                ),
                healthSyncGateCopiedAriaLabel: t(
                  "analysis.healthSyncGateCopiedAriaLabel",
                ),
                healthCopyAriaLabel: t("analysis.healthCopyAriaLabel"),
                healthCopiedAriaLabel: t("analysis.healthCopiedAriaLabel"),
                healthEvidenceTitle: t("analysis.healthEvidenceTitle"),
                healthEvidenceTotal: t("analysis.healthEvidenceTotal"),
                healthEvidenceInspectUrl: t("analysis.healthEvidenceInspectUrl"),
                healthEvidenceOntologyUrl: t(
                  "analysis.healthEvidenceOntologyUrl",
                ),
                healthEvidenceRepairUrl: t("analysis.healthEvidenceRepairUrl"),
                healthEvidenceNextAction: t("analysis.healthEvidenceNextAction"),
                healthEvidenceAgentCheck: t("analysis.healthEvidenceAgentCheck"),
                healthEvidenceMcpCheck: t("analysis.healthEvidenceMcpCheck"),
                healthEvidenceRelationPreflight: t(
                  "analysis.healthEvidenceRelationPreflight",
                ),
                healthEvidenceMcpRelationPreflight: t(
                  "analysis.healthEvidenceMcpRelationPreflight",
                ),
                healthEvidenceImpactCheck: t("analysis.healthEvidenceImpactCheck"),
                healthEvidenceMcpImpactCheck: t(
                  "analysis.healthEvidenceMcpImpactCheck",
                ),
                healthEvidenceSyncGate: t("analysis.healthEvidenceSyncGate"),
                healthEvidenceActionKindStale: t(
                  "analysis.healthEvidenceActionKindStale",
                ),
                healthEvidenceActionKindOrphan: t(
                  "analysis.healthEvidenceActionKindOrphan",
                ),
                healthEvidenceActionKindPromotion: t(
                  "analysis.healthEvidenceActionKindPromotion",
                ),
                healthEvidenceActionStale: t("analysis.healthEvidenceActionStale"),
                healthEvidenceActionOrphan: t("analysis.healthEvidenceActionOrphan"),
                healthEvidenceActionPromotion: t(
                  "analysis.healthEvidenceActionPromotion",
                ),
                healthEvidenceNone: t("analysis.healthEvidenceNone"),
                healthEvidenceUrl: t("analysis.healthEvidenceUrl"),
                focusPrompt: t("analysis.focusPrompt"),
                focusSelected: t("analysis.focusSelected", {
                  title: analysisSelectedTitle ?? "",
                }),
                pathPrompt: t("analysis.pathPrompt"),
                pathSelected: t("analysis.pathSelected", {
                  title: pathSourceTitle ?? analysisSelectedTitle ?? "",
                }),
                pathResolved: t("analysis.pathResolved", {
                  source: pathSourceTitle ?? "",
                  target: pathTargetTitle ?? "",
                }),
                pathEvidenceCopy: t("analysis.pathEvidenceCopy"),
                pathEvidenceCopied: t("analysis.pathEvidenceCopied"),
                pathEvidenceCopyAriaLabel: t(
                  "analysis.pathEvidenceCopyAriaLabel",
                ),
                pathEvidenceCopiedAriaLabel: t(
                  "analysis.pathEvidenceCopiedAriaLabel",
                ),
                pathMcpCopy: t("analysis.pathMcpCopy"),
                pathMcpCopied: t("analysis.pathMcpCopied"),
                pathMcpCopyAriaLabel: t("analysis.pathMcpCopyAriaLabel"),
                pathMcpCopiedAriaLabel: t("analysis.pathMcpCopiedAriaLabel"),
                pathRelationPreflightCopy: t(
                  "analysis.pathRelationPreflightCopy",
                ),
                pathRelationPreflightCopied: t(
                  "analysis.pathRelationPreflightCopied",
                ),
                pathRelationPreflightCopyAriaLabel: t(
                  "analysis.pathRelationPreflightCopyAriaLabel",
                ),
                pathRelationPreflightCopiedAriaLabel: t(
                  "analysis.pathRelationPreflightCopiedAriaLabel",
                ),
                pathExplainRelationCopy: t("analysis.pathExplainRelationCopy"),
                pathExplainRelationCopied: t(
                  "analysis.pathExplainRelationCopied",
                ),
                pathExplainRelationCopyAriaLabel: t(
                  "analysis.pathExplainRelationCopyAriaLabel",
                ),
                pathExplainRelationCopiedAriaLabel: t(
                  "analysis.pathExplainRelationCopiedAriaLabel",
                ),
                pathAllPathsPlanCopy: t("analysis.pathAllPathsPlanCopy"),
                pathAllPathsPlanCopied: t("analysis.pathAllPathsPlanCopied"),
                pathAllPathsPlanCopyAriaLabel: t(
                  "analysis.pathAllPathsPlanCopyAriaLabel",
                ),
                pathAllPathsPlanCopiedAriaLabel: t(
                  "analysis.pathAllPathsPlanCopiedAriaLabel",
                ),
                pathAllPathsCopy: t("analysis.pathAllPathsCopy"),
                pathAllPathsCopied: t("analysis.pathAllPathsCopied"),
                pathAllPathsCopyAriaLabel: t(
                  "analysis.pathAllPathsCopyAriaLabel",
                ),
                pathAllPathsCopiedAriaLabel: t(
                  "analysis.pathAllPathsCopiedAriaLabel",
                ),
                pathHandoffSummary: t("analysis.pathHandoffSummary"),
                pathCopyTools: t("analysis.pathCopyTools"),
                pathProofOrderTitle: t("analysis.pathProofOrderTitle"),
                pathProofOrderDesc: t("analysis.pathProofOrderDesc"),
                pathProofChecklist: t("analysis.pathProofChecklist"),
                pathProofVisiblePath: t("analysis.pathProofVisiblePath"),
                pathProofRelationPreflight: t(
                  "analysis.pathProofRelationPreflight",
                ),
                pathProofExplainRelation: t(
                  "analysis.pathProofExplainRelation",
                ),
                pathProofBoundedTraversal: t(
                  "analysis.pathProofBoundedTraversal",
                ),
                pathProofPostWriteSync: t("analysis.pathProofPostWriteSync"),
                pathProofStatusReady: t("analysis.pathProofStatusReady"),
                pathProofStatusRequired: t("analysis.pathProofStatusRequired"),
                pathProofStatusAfterWrite: t("analysis.pathProofStatusAfterWrite"),
                pathEvidenceTitle: t("analysis.pathEvidenceTitle"),
                pathEvidenceSource: t("analysis.pathEvidenceSource"),
                pathEvidenceTarget: t("analysis.pathEvidenceTarget"),
                pathEvidenceUrl: t("analysis.pathEvidenceUrl"),
                pathEvidenceSourceOntologyUrl: t(
                  "analysis.pathEvidenceSourceOntologyUrl",
                ),
                pathEvidenceTargetOntologyUrl: t(
                  "analysis.pathEvidenceTargetOntologyUrl",
                ),
                pathEvidenceSourceBuilderUrl: t(
                  "analysis.pathEvidenceSourceBuilderUrl",
                ),
                pathEvidenceTargetBuilderUrl: t(
                  "analysis.pathEvidenceTargetBuilderUrl",
                ),
                pathEvidenceCliCheck: t("analysis.pathEvidenceCliCheck"),
                pathEvidenceMcpCheck: t("analysis.pathEvidenceMcpCheck"),
                pathEvidenceRelationPreflightReason: t(
                  "analysis.pathEvidenceRelationPreflightReason",
                ),
                pathEvidenceRelationPreflightMcpCheck: t(
                  "analysis.pathEvidenceRelationPreflightMcpCheck",
                ),
                pathEvidenceExplainRelationMcpCheck: t(
                  "analysis.pathEvidenceExplainRelationMcpCheck",
                ),
                pathEvidenceAllPathsPlanMcpCheck: t(
                  "analysis.pathEvidenceAllPathsPlanMcpCheck",
                ),
                pathEvidenceAllPathsMcpCheck: t(
                  "analysis.pathEvidenceAllPathsMcpCheck",
                ),
                pathEvidenceAllPathsCopyInstruction: t(
                  "analysis.pathEvidenceAllPathsCopyInstruction",
                ),
                pathEvidencePostWriteSyncGate: t(
                  "analysis.pathEvidencePostWriteSyncGate",
                ),
                pathSourceOntology: t("analysis.pathSourceOntology"),
                pathTargetOntology: t("analysis.pathTargetOntology"),
                pathSourceBuilder: t("analysis.pathSourceBuilder"),
                pathTargetBuilder: t("analysis.pathTargetBuilder"),
                healthPrompt: t("analysis.healthPrompt", {
                  count: analysisSummary.primaryMetric,
                }),
                overviewPrompt: t("analysis.overviewPrompt"),
              }}
            />
          </>
        <div className="absolute inset-0">
          <>
              <div
                key={localGraphRoot ?? '__root__'}
                className="absolute inset-0 animate-[sigmaFade_220ms_ease-out]"
              >
                {/* Empty-state overlay when the visible Sigma graph has 0–1
                    nodes — the lone Sigma dot otherwise reads as a broken
                    canvas. 빈 vault 는 Sigma 를 아예 마운트하지 않고 바로 빈
                    상태만 보여 WebGL/토폴로지 모양이 잠깐 보이는 회귀를 막는다. */}
                {topologyOverlayState.kind === "structural-empty" && !createNodeOpen ? (
                  <TopologyEmptyState
                    projectCount={emptyTopologyNodeCount}
                    reason={topologyOverlayState.emptyReason}
                    canCreateNode={canCreateNode}
                    onCreateNode={() => setCreateNodeOpen(true)}
                  />
                ) : topologyOverlayState.kind === "filter-sparse" ? (
                  <TopologyNoMatchesState
                    onClearFilters={clearTopologyFilters}
                    variant="sparse"
                  />
                ) : null}
                {topologyRenderState.renderCanvas ? (
                  <SigmaTopology
                    key={localGraphRoot ?? "__root__"}
                    projects={localGraphProjects}
                    categories={taxonomyCategories}
                    selectedSlug={canvasSelectedSlug}
                    onSelectProject={(slug) => handleSelect(slug)}
                    onProjectOpen={(slug) => setLocalGraphStack((stack) => [...stack, slug])}
                    fitViewToken={combinedFitToken}
                    relayoutToken={topologyRelayoutToken}
                    onVisibleCountChange={setSigmaVisibleCount}
                    onGraphStatsChange={handleSigmaGraphStatsChange}
                    onRelationVisibilityChange={handleSigmaRelationVisibilityChange}
                    onPaneClick={handleClose}
                    onFirstInteraction={dismissSigmaHint}
                    activeCategory={activeCategory}
                    depthLimit={sigmaControls.depthLimit}
                    searchQuery={sigmaControls.searchQuery}
                    forces={sigmaControls.forces}
                    hubsOnly={sigmaControls.hubsOnly}
                    overlays={sigmaControls.overlays}
                    changedSlugs={changedSlugs}
                    // R14: /topology 는 vault ontology 의 도메인/역량/요소
                    // 노드와 그 관계까지 같은 그래프에 그린다. project 1 개 +
                    // dependencies 0 인 dogfood 상황에서 빈 화면이었던 회귀를
                    // 메우면서, 사용자가 "ontology 와 topology 는 연계되어야"
                    // 라고 약속한 본질을 살린다. local-graph (drawer 의 ego)
                    // 에서는 project 의존만 보이게 끔 — 좁은 시야 위해.
                    showOntologyNodes={localGraphRoot === null}
                    skeletonLayout={topologySkeleton?.layout ?? null}
                    skeletonSlugs={topologySkeleton?.slugs ?? null}
                    skeletonCards={topologySkeleton?.cards ?? null}
                    pathWorkflowActive={analysisMode === "path"}
                    pathSelection={{
                      sourceSlug: pathSourceSlug,
                      targetSlug: pathTargetSlug,
                    }}
                    onPathSelectionChange={handlePathSelectionChange}
                    impactNodes={impactHighlightSet}
                  />
                ) : null}
              </div>
              <style jsx>{`
                @keyframes sigmaFade {
                  from { opacity: 0.5; transform: scale(0.995); }
                  to { opacity: 1; transform: scale(1); }
                }
              `}</style>
              {createNodeOpen ? null : (
                <SigmaControls
                  value={sigmaControls}
                  onChange={setSigmaControls}
                  onFitView={() => setFitViewToken((t) => t + 1)}
                  visibleCount={sigmaVisibleCount}
                  totalCount={
                    localGraphRoot === null
                      ? topologyTotalNodes
                      : localGraphProjects.length
                  }
                />
              )}
              {/* 단축키 도움말 진입점 — 우상단 SigmaControls 아래 36×36 아이콘.
                  ? 키 단축키도 같은 sheet 를 열지만 시각적 affordance 가 없으면
                  발견성 낮음. 모바일은 키보드가 없어 의미 0 → 데스크톱(md+)
                  에서만 노출. */}
              {createNodeOpen ? null : (
                <Tooltip content={t('controls.shortcutsTooltip')} side="left" withProvider={false}>
                <button
                  type="button"
                  onClick={() => setShortcutsOpen(true)}
                  aria-label={t('controls.shortcutsAriaLabel')}
                  className="topology-ui-scale pointer-events-auto absolute right-4 top-[228px] z-20 hidden h-9 w-9 items-center justify-center rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] font-mono text-[14px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)] md:right-6 md:flex xl:right-8"
                >
                  ?
                </button>
                </Tooltip>
              )}
              <SigmaHubRail
                projects={renderProjects}
                selectedSlug={canvasSelectedSlug}
                onSelect={(slug) => handleSelect(slug)}
                // Hero 패널이 펼쳐져 있을 때 겹침 방지. hero 가 Collapsed
                // (pill) 이거나 drawer 상태면 Hub Rail 이 정상 노출.
                suppressed={!leftPanelCollapsed && !drawerOpen}
              />
              {localGraphStack.length > 0 ? (
                <div className="pointer-events-auto absolute left-1/2 top-[96px] z-30 flex max-w-[70vw] -translate-x-1/2 items-center gap-2 rounded-full border border-[color:rgba(139,151,255,0.32)] bg-[color:var(--color-panel)] px-3 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
                    Local
                  </span>
                  <button
                    type="button"
                    onClick={() => setLocalGraphStack([])}
                    className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
                  >
                    Root
                  </button>
                  {localGraphStack.map((slug, idx) => (
                    <span key={slug} className="flex items-center gap-2">
                      <span className="text-[color:var(--color-text-quaternary)]">▸</span>
                      <button
                        type="button"
                        onClick={() =>
                          setLocalGraphStack((stack) => stack.slice(0, idx + 1))
                        }
                        className={`truncate text-[12px] transition-colors ${
                          idx === localGraphStack.length - 1
                            ? 'text-[color:var(--color-text-primary)]'
                            : 'text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]'
                        }`}
                        title={slug}
                      >
                        {slug}
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setLocalGraphStack((stack) => stack.slice(0, -1))}
                    className="ml-2 rounded-full border border-[color:var(--color-divider)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
                  >
                    Esc
                  </button>
                </div>
              ) : null}

              {/* 필터 컨텍스트 — 현재 visible 노드 수가 전체보다 적으면 표시.
                  SigmaControls 검색창 배지와 중복이지만, controls가 접힌 상태에서도
                  필터 중임을 알려주는 컨텍스트 칩. */}
              {sigmaVisibleCount !== null && sigmaVisibleCount < localGraphProjects.length ? (
                <div className="pointer-events-none absolute bottom-6 left-[220px] z-10 rounded-md border border-[color:rgba(139,151,255,0.28)] bg-[color:var(--color-panel)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:rgba(139,151,255,0.9)] md:left-[228px] xl:left-[236px]">
                  filter · {sigmaVisibleCount} / {localGraphProjects.length}
                </div>
              ) : null}

              {/* 매칭 0건 empty state */}
              {topologyOverlayState.kind === "filter-empty" ? (
                <TopologyNoMatchesState onClearFilters={clearTopologyFilters} />
              ) : null}

            </>
        </div>
        {projectsError ? (
          <div
            role="alert"
            className="pointer-events-auto absolute left-1/2 top-[52px] z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[color:rgba(236,116,116,0.32)] bg-[color:rgba(18,20,26,0.98)] px-4 py-2 text-[12px] text-[color:var(--color-text-primary)] shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:rgba(236,116,116,0.9)]">
              Error
            </span>
            <span>{projectsError}</span>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
              className="ml-2 rounded-full border border-[color:var(--color-divider)] px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
            >
              {t('errorBanner.retry')}
            </button>
          </div>
        ) : null}
        <ProjectDrawer
          project={drawerProject}
          allProjects={renderProjects}
          activeProjectId={null}
          impactMode={impactMode}
          onChangeImpactMode={handleSelectImpactMode}
          onClose={handleClose}
          onSelectProject={(slug) =>
            handleSelect(slug, { preserveImpact: impactMode !== "none" })
          }
          containerLabel={null}
        />
        {selectedOntologyNode && ontologyInsight && nodeFocus && !fullDetailOpen ? (
          <div className="fixed inset-x-4 bottom-4 z-50 flex justify-center 2xl:inset-x-auto 2xl:bottom-auto 2xl:right-6 2xl:top-20 2xl:block">
            <TopologyNodePopover
              focus={nodeFocus}
              significance={nodeSignificancePresentation}
              expandedChildIds={topologySkeleton?.expandedChildIds ?? null}
              labels={{
                connections: t("nodePopover.connections"),
                usedBy: t("nodePopover.usedBy"),
                dependsOn: t("nodePopover.dependsOn"),
                noConnections: t("nodePopover.noConnections"),
                openFullDetail: t("nodePopover.openFullDetail"),
                close: t("controls.close"),
                moreSuffix: t("nodePopover.moreSuffix"),
                // 컴포넌트가 {count} 를 치환 — raw 템플릿 그대로 전달.
                expandedNote: t.raw("nodePopover.expandedNote") as string,
                kindLabels: {
                  project: tKinds(normalizeKindLabelKey("project")),
                  domain: tKinds(normalizeKindLabelKey("domain")),
                  capability: tKinds(normalizeKindLabelKey("capability")),
                  element: tKinds(normalizeKindLabelKey("element")),
                  document: tKinds(normalizeKindLabelKey("document")),
                  "vault-readme": tKinds(normalizeKindLabelKey("vault-readme")),
                  unknown: tKinds(normalizeKindLabelKey("unknown")),
                },
                relationTypeLabels: {
                  contains: tEdgeTypes("contains"),
                  belongs_to: tEdgeTypes("belongs_to"),
                  depends_on: tEdgeTypes("depends_on"),
                  implements: tEdgeTypes("implements"),
                  uses: tEdgeTypes("uses"),
                  describes: tEdgeTypes("describes"),
                  related_to: tEdgeTypes("related_to"),
                },
              }}
              onSelectConnection={(id) => handleSelect(id)}
              onOpenFullDetail={() => setFullDetailSlug(selectedOntologyNode.id)}
              onClose={handleClose}
              className="max-2xl:max-h-[360px] max-2xl:w-[min(560px,calc(100vw-2rem))]"
            />
          </div>
        ) : null}
        {selectedOntologyNode && ontologyInsight && fullDetailOpen ? (
          <TopologyOntologyDrawer
            node={selectedOntologyNode}
            nodes={ontologyInsight.nodes}
            edges={ontologyInsight.edges}
            onClose={handleClose}
            closeLabel={t("controls.close")}
            impactActive={impactHighlightActive}
            onToggleImpact={toggleImpactHighlight}
            onSelectNode={(slug) => handleSelect(slug)}
            labels={{
              caption: t("ontologyDrawer.caption"),
              source: t("ontologyDrawer.source"),
              noSource: t("ontologyDrawer.noSource"),
              description: t("ontologyDrawer.descriptionLabel"),
              keyFacts: t("ontologyDrawer.keyFacts"),
              fullNote: t("ontologyDrawer.fullNote"),
              domainContext: t("ontologyDrawer.domainContext"),
              relations: t("ontologyDrawer.relations"),
              incoming: t("ontologyDrawer.incoming"),
              outgoing: t("ontologyDrawer.outgoing"),
              reachTitle: t("ontologyDrawer.reachTitle"),
              reachDependents: t("ontologyDrawer.reachDependents"),
              reachDependencies: t("ontologyDrawer.reachDependencies"),
              reachShowOnMap: t("ontologyDrawer.reachShowOnMap"),
              reachHideOnMap: t("ontologyDrawer.reachHideOnMap"),
              noRelations: t("ontologyDrawer.noRelations"),
              openTopologyFocus: t("ontologyDrawer.openTopologyFocus"),
              openOntology: t("ontologyDrawer.openOntology"),
              openBuilder: t("ontologyDrawer.openBuilder"),
              openSource: t("ontologyDrawer.openSource"),
              collaboratorTitle: t("ontologyDrawer.collaboratorTitle"),
              collaboratorBody: t("ontologyDrawer.collaboratorBody"),
              collaboratorCopy: t("ontologyDrawer.collaboratorCopy"),
              collaboratorCopyVocabulary: t(
                "ontologyDrawer.collaboratorCopyVocabulary",
              ),
              collaboratorCopyCliProfile: t(
                "ontologyDrawer.collaboratorCopyCliProfile",
              ),
              collaboratorCopyMcpProfile: t(
                "ontologyDrawer.collaboratorCopyMcpProfile",
              ),
              collaboratorCopyCliImpact: t(
                "ontologyDrawer.collaboratorCopyCliImpact",
              ),
              collaboratorCopyMcpImpact: t(
                "ontologyDrawer.collaboratorCopyMcpImpact",
              ),
              collaboratorCopySyncGate: t(
                "ontologyDrawer.collaboratorCopySyncGate",
              ),
              collaboratorCopySuccess: t("ontologyDrawer.collaboratorCopySuccess"),
              collaboratorCopyError: t("ontologyDrawer.collaboratorCopyError"),
              collaboratorBriefKind: t("ontologyDrawer.collaboratorBriefKind"),
              collaboratorBriefNode: t("ontologyDrawer.collaboratorBriefNode"),
              collaboratorBriefReviewLens: t(
                "ontologyDrawer.collaboratorBriefReviewLens",
              ),
              collaboratorBriefSource: t("ontologyDrawer.collaboratorBriefSource"),
              collaboratorBriefRelations: t(
                "ontologyDrawer.collaboratorBriefRelations",
              ),
              collaboratorBriefReviewPrompt: t(
                "ontologyDrawer.collaboratorBriefReviewPrompt",
              ),
              collaboratorBriefOutgoingCount: t(
                "ontologyDrawer.collaboratorBriefOutgoingCount",
              ),
              collaboratorBriefIncomingCount: t(
                "ontologyDrawer.collaboratorBriefIncomingCount",
              ),
              collaboratorBriefRelationTypes: t(
                "ontologyDrawer.collaboratorBriefRelationTypes",
              ),
              collaboratorVocabularyTerm: t(
                "ontologyDrawer.collaboratorVocabularyTerm",
              ),
              collaboratorVocabularySlug: t(
                "ontologyDrawer.collaboratorVocabularySlug",
              ),
              collaboratorVocabularyKind: t(
                "ontologyDrawer.collaboratorVocabularyKind",
              ),
              collaboratorVocabularySource: t(
                "ontologyDrawer.collaboratorVocabularySource",
              ),
              collaboratorVocabularyRelationSummary: t(
                "ontologyDrawer.collaboratorVocabularyRelationSummary",
              ),
              collaboratorVocabularyTitle: t(
                "ontologyDrawer.collaboratorVocabularyTitle",
              ),
              collaboratorVocabularyMeaning: t(
                "ontologyDrawer.collaboratorVocabularyMeaning",
              ),
              collaboratorVocabularyReuse: t(
                "ontologyDrawer.collaboratorVocabularyReuse",
              ),
              collaboratorVocabularyAnchors: t(
                "ontologyDrawer.collaboratorVocabularyAnchors",
              ),
              collaboratorBriefReviewQuestions: t(
                "ontologyDrawer.collaboratorBriefReviewQuestions",
              ),
              collaboratorBriefImpactSummary: t(
                "ontologyDrawer.collaboratorBriefImpactSummary",
              ),
              collaboratorBriefFirstIncoming: t(
                "ontologyDrawer.collaboratorBriefFirstIncoming",
              ),
              collaboratorBriefFirstOutgoing: t(
                "ontologyDrawer.collaboratorBriefFirstOutgoing",
              ),
              collaboratorBriefNoImpactRelation: t(
                "ontologyDrawer.collaboratorBriefNoImpactRelation",
              ),
              collaboratorBriefPreviewRelations: t(
                "ontologyDrawer.collaboratorBriefPreviewRelations",
              ),
              collaboratorBriefNoPreviewRelations: t(
                "ontologyDrawer.collaboratorBriefNoPreviewRelations",
              ),
              collaboratorBriefHandoff: t("ontologyDrawer.collaboratorBriefHandoff"),
              collaboratorBriefTopology: t(
                "ontologyDrawer.collaboratorBriefTopology",
              ),
              collaboratorBriefOntology: t(
                "ontologyDrawer.collaboratorBriefOntology",
              ),
              collaboratorBriefBuilder: t("ontologyDrawer.collaboratorBriefBuilder"),
              collaboratorBriefAgentCheck: t(
                "ontologyDrawer.collaboratorBriefAgentCheck",
              ),
              collaboratorBriefMcpCheck: t(
                "ontologyDrawer.collaboratorBriefMcpCheck",
              ),
              collaboratorBriefImpactCheck: t(
                "ontologyDrawer.collaboratorBriefImpactCheck",
              ),
              collaboratorBriefMcpImpactCheck: t(
                "ontologyDrawer.collaboratorBriefMcpImpactCheck",
              ),
              collaboratorBriefSyncGate: t(
                "ontologyDrawer.collaboratorBriefSyncGate",
              ),
              collaboratorHandoffOrderTitle: t(
                "ontologyDrawer.collaboratorHandoffOrderTitle",
              ),
              collaboratorHandoffProfileStep: t(
                "ontologyDrawer.collaboratorHandoffProfileStep",
              ),
              collaboratorHandoffImpactStep: t(
                "ontologyDrawer.collaboratorHandoffImpactStep",
              ),
              collaboratorHandoffSyncStep: t(
                "ontologyDrawer.collaboratorHandoffSyncStep",
              ),
              collaboratorLensLabels: {
                project: t("ontologyDrawer.collaboratorLens.project"),
                domain: t("ontologyDrawer.collaboratorLens.domain"),
                capability: t("ontologyDrawer.collaboratorLens.capability"),
                element: t("ontologyDrawer.collaboratorLens.element"),
                node: t("ontologyDrawer.collaboratorLens.node"),
              },
              collaboratorReviewLabels: {
                define_owner: t("ontologyDrawer.collaboratorReview.defineOwner"),
                explain_usage: t("ontologyDrawer.collaboratorReview.explainUsage"),
                confirm_dependents: t("ontologyDrawer.collaboratorReview.confirmDependents"),
                trace_impact: t("ontologyDrawer.collaboratorReview.traceImpact"),
              },
              collaboratorImpactLabels: {
                needs_owner: t("ontologyDrawer.collaboratorImpact.needsOwner"),
                usage_only: t("ontologyDrawer.collaboratorImpact.usageOnly"),
                dependent_only: t(
                  "ontologyDrawer.collaboratorImpact.dependentOnly",
                ),
                bidirectional: t(
                  "ontologyDrawer.collaboratorImpact.bidirectional",
                ),
              },
              collaboratorReviewQuestionLabels: {
                define_owner: [
                  t("ontologyDrawer.collaboratorReviewQuestions.defineOwnerOwner"),
                  t("ontologyDrawer.collaboratorReviewQuestions.defineOwnerRelation"),
                  t("ontologyDrawer.collaboratorReviewQuestions.defineOwnerMeaning"),
                ],
                explain_usage: [
                  t("ontologyDrawer.collaboratorReviewQuestions.explainUsageDepends"),
                  t("ontologyDrawer.collaboratorReviewQuestions.explainUsageWhy"),
                  t("ontologyDrawer.collaboratorReviewQuestions.explainUsageAudience"),
                ],
                confirm_dependents: [
                  t("ontologyDrawer.collaboratorReviewQuestions.confirmDependentsWho"),
                  t("ontologyDrawer.collaboratorReviewQuestions.confirmDependentsChange"),
                  t("ontologyDrawer.collaboratorReviewQuestions.confirmDependentsNotify"),
                ],
                trace_impact: [
                  t("ontologyDrawer.collaboratorReviewQuestions.traceImpactIncoming"),
                  t("ontologyDrawer.collaboratorReviewQuestions.traceImpactOutgoing"),
                  t("ontologyDrawer.collaboratorReviewQuestions.traceImpactBoundary"),
                ],
              },
              collaboratorChipLabels: {
                source: t("ontologyDrawer.collaboratorChip.source"),
                impact: t("ontologyDrawer.collaboratorChip.impact"),
                vocabulary: t("ontologyDrawer.collaboratorChip.vocabulary"),
              },
              relationTypeLabels: {
                contains: tEdgeTypes("contains"),
                belongs_to: tEdgeTypes("belongs_to"),
                depends_on: tEdgeTypes("depends_on"),
                implements: tEdgeTypes("implements"),
                uses: tEdgeTypes("uses"),
                describes: tEdgeTypes("describes"),
                related_to: tEdgeTypes("related_to"),
              },
            }}
            domainEdit={
              nodeEditTarget && vault.manifest !== null
                ? {
                    value:
                      typeof nodeEditTarget.frontmatter.domain === "string"
                        ? nodeEditTarget.frontmatter.domain
                        : "",
                    onSave: saveNodeDomain,
                    labels: {
                      field: t("ontologyDrawer.domainEdit.field"),
                      edit: t("ontologyDrawer.domainEdit.edit"),
                      save: t("ontologyDrawer.domainEdit.save"),
                      cancel: t("ontologyDrawer.domainEdit.cancel"),
                      placeholder: t("ontologyDrawer.domainEdit.placeholder"),
                      empty: t("ontologyDrawer.domainEdit.empty"),
                      saving: t("ontologyDrawer.domainEdit.saving"),
                    },
                  }
                : null
            }
            relationEdit={
              nodeEditTarget && vault.manifest !== null
                ? {
                    targets: relationTargets,
                    relationKeys: VAULT_RELATION_KEYS,
                    defaultRelationKey: "relates",
                    onCreate: createRelation,
                    labels: {
                      heading: t("relationCreate.heading"),
                      target: t("relationCreate.target"),
                      targetPlaceholder: t("relationCreate.targetPlaceholder"),
                      relation: t("relationCreate.relation"),
                      create: t("relationCreate.create"),
                      cancel: t("relationCreate.cancel"),
                      relationKeyLabels: {
                        domains: t("relationCreate.keyDomains"),
                        capabilities: t("relationCreate.keyCapabilities"),
                        elements: t("relationCreate.keyElements"),
                        dependencies: t("relationCreate.keyDependencies"),
                        contains: t("relationCreate.keyContains"),
                        describes: t("relationCreate.keyDescribes"),
                        relates: t("relationCreate.keyRelates"),
                      },
                    },
                  }
                : null
            }
            explanationEdit={
              nodeEditTarget &&
              vault.manifest !== null &&
              nodeBody &&
              nodeBody.slug === nodeEditTarget.vaultSlug
                ? {
                    value: nodeBody.body,
                    onSave: saveNodeExplanation,
                    labels: {
                      heading: t("explanationEdit.heading"),
                      edit: t("explanationEdit.edit"),
                      save: t("explanationEdit.save"),
                      cancel: t("explanationEdit.cancel"),
                      placeholder: t("explanationEdit.placeholder"),
                      empty: t("explanationEdit.empty"),
                      saving: t("explanationEdit.saving"),
                    },
                  }
                : null
            }
          />
        ) : null}
        <SearchPalette
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          projects={renderProjects}
          onSelect={(slug) => {
            handleSelect(slug);
          }}
          containerLabel={null}
        />
        {/* ⇧⌘K — ontology / 문서 통합 검색. project 전용 SearchPalette 와
            별 슬롯이라 SearchPalette 의 layer filter / 최근 검색 같은 고유
            기능 보존. controlled (open/onOpenChange) — hotkey 는 위
            useTypingShortcuts 가 관리. */}
        <MountedGlobalSearch
          open={ontologySearchOpen}
          onOpenChange={setOntologySearchOpen}
          onSelectProject={(project) => handleSelect(project.slug)}
        />
        <ShortcutSheet
          open={shortcutsOpen}
          onClose={() => setShortcutsOpen(false)}
        />
        <DocsQuickDrawer
          open={docsDrawerOpen}
          onClose={() => setDocsDrawerOpen(false)}
          getDocHref={(slug) => buildDocsVaultHref({ slug })}
          contextProject={
            selectedProject
              ? {
                  slug: selectedProject.slug,
                  name: selectedProject.name,
                }
              : null
          }
        />
    </main>
  );
}

function resolveTopologyNodeTitle({
  slug,
  projectBySlug,
  ontologyNodes,
}: {
  slug: string | null;
  projectBySlug: ReadonlyMap<string, Project>;
  ontologyNodes: readonly KnowledgeGraphNode[] | null | undefined;
}): string | null {
  if (!slug) return null;

  const project = projectBySlug.get(slug);
  if (project) return project.name;

  const title = resolveTopologySelectedOntologyNode(slug, ontologyNodes)?.title ?? slug;
  return compactTopologyPanelTitle(title);
}

function compactTopologyPanelTitle(title: string | null): string | null {
  if (!title) return null;
  const stripped = title.replace(/\s*\(.*$/, "").trim();
  return stripped.length > 0 ? stripped : title;
}
