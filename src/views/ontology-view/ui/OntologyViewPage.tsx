"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Info, Link2, X } from "lucide-react";
import {
  getKnowledgeDocumentDetailHref,
  getKnowledgeDocumentListHref,
  type KnowledgeDocument,
} from "@/entities/knowledge-document";
import {
  ManualSourceChip,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { getOntologyKindLabel } from "@/entities/ontology-class";
import { ACCOUNT_QUERY_KEY } from "@/shared/lib/account-scope";
import {
  buildOntologyEgoSubgraph,
  buildOntologyTree,
  countTreeNodes,
  type OntologyEgoSubgraph,
  type OntologyTreeBuildResult,
} from "@/shared/lib/ontology-tree";
import { GlobalSearch, useGlobalSearchHotkey } from "@/widgets/global-search";
import { ManualEdgeCreateModal } from "@/widgets/manual-edge-create-modal";
import { ManualNodeCreateModal } from "@/widgets/manual-node-create-modal";
import { OntologyEgoGraph } from "@/widgets/ontology-ego-graph";
import { OntologyTreeView } from "@/widgets/ontology-tree-view";
import { useDataSourceMode } from "@/features/data-source-mode";
import {
  VaultOntologyStubsPanel,
  useOntologyInsight,
  isVaultSentinelDate,
} from "@/features/vault-ontology";
import { OperationsNav } from "@/widgets/operations-nav";
import { Tooltip, useToast } from "@/shared/ui";

/**
 * `/ontology` — ontology view v0 (T-6c).
 *
 * `knowledgePublic{Nodes,Edges}` 를 account-scoped 로 구독해 트리 구조로
 * 표시. Document 노드는 트리에서 제외 (근거 노드). 선택 행 클릭 시
 * 기본 동작은 noop — 추후 드릴-인 (T-6d 또는 별도 task) 으로 확장.
 */
export function OntologyViewPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const accountId = null;
  const dataSourceMode = useDataSourceMode();
  // ?account= 가 비었으면 인증 사용자의 owned membership 첫 번째로 자동 보강.

  const { insight, error } = useOntologyInsight(accountId);
  // vault / dogfood 모드는 노드 lastApprovedAt 이 sentinel — "근거 문서" /
  // "발행 시점" stat 도 의미 0. mode 감지해서 stat strip / search 안내 hide.
  const isVaultSentinelMode =
    insight !== null &&
    insight.nodes.length > 0 &&
    insight.nodes.every((n) => isVaultSentinelDate(n.lastApprovedAt));
  // documents 는 글로벌 검색 두 번째 source — 권한 게이팅은 Firestore rules 가
  // 처리. 권한 없으면 빈 배열, 검색 결과에서도 자동 제외.
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  // 트리 row 클릭 시 우측 (mobile bottom) 패널에 노드 상세 노출.
  const [selectedNode, setSelectedNode] = useState<KnowledgeGraphNode | null>(null);
  // 글로벌 검색 — ⌘K / Ctrl+K 로 토글, 결과 선택 시 selectedNode 로 점프 / 문서 라우트로 점프.
  const [searchOpen, setSearchOpen] = useState(false);
  // S5: 1-hop 기본, 사용자가 토글로 2-hop 까지 확장 가능. 노드 변경 시
  // 자동 1-hop 으로 복귀해 2-hop 의 큰 ego 를 누적해 보지 않게.
  const [egoHops, setEgoHops] = useState<1 | 2>(1);
  // setSelectedNode + setEgoHops(1) + URL ?node=<id> 동기화를 한 함수로.
  // 트리 / 검색 / neighbor 클릭 / 패널 닫기 모든 진입에서 같은 흐름.
  // history 안 쌓이게 router.replace 사용 (매 노드 클릭마다 뒤로가기 한 단계 X).
  const selectNode = (next: KnowledgeGraphNode | null) => {
    setSelectedNode(next);
    setEgoHops(1);
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set("node", next.id);
    } else {
      params.delete("node");
    }
    const qs = params.toString();
    router.replace(qs ? `/ontology/?${qs}` : "/ontology/", { scroll: false });
  };
  // manual node create — 사용자가 트리 surface 에서 직접 노드 추가하는 modal.
  const [manualOpen, setManualOpen] = useState(false);
  // manual edge create — 노드 상세 패널 "+ 관계 추가" 진입.
  const [edgeOpen, setEdgeOpen] = useState(false);
  const [edgeFromId, setEdgeFromId] = useState<string>("");

  // ESC 로 패널 닫기.
  useEffect(() => {
    if (!selectedNode) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") selectNode(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedNode]);

  // ⌘K / Ctrl+K — 검색 토글. 같은 hook 을 다른 surface 도 쓰므로 단일 진입점.
  useGlobalSearchHotkey(searchOpen, setSearchOpen);

  // deeplink — `?node=<id>` 를 selectedNode 와 양방향 동기화. URL 이 source
  // of truth: 외부 surface (검색 / 문서 / 직접 입력) 에서 URL 만 바뀌어도
  // 패널이 자동 열림. selectNode() 자체가 URL 도 갱신하므로 cycle 회피는
  // ID 비교로 (이미 같은 노드면 setState 호출 안 함).
  const deeplinkNodeId = searchParams.get("node");
  useEffect(() => {
    if (!insight) return;
    if (!deeplinkNodeId) {
      if (selectedNode) setSelectedNode(null);
      return;
    }
    if (selectedNode?.id === deeplinkNodeId) return;
    const found = insight.nodes.find((n) => n.id === deeplinkNodeId);
    if (found) setSelectedNode(found);
  }, [deeplinkNodeId, insight, selectedNode]);

  // 글로벌 검색 두 번째 source. permission 없는 사용자는 빈 배열로 받음.
  // 에러는 검색 가용성에만 영향 — 페이지 자체 에러로 승격하지 않음. 다만
  // 사용자가 "데이터 0" 인지 "권한 X" 인지 헷갈리지 않도록 한 줄 안내.
  const [documentsAccessError, setDocumentsAccessError] = useState<Error | null>(null);
  useEffect(() => {
    setDocuments([]);
    setDocumentsAccessError(null);
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void import("@/entities/knowledge-document/api").then(({ subscribeKnowledgeDocuments }) => {
      if (cancelled) return;
      unsubscribe = subscribeKnowledgeDocuments(
        accountId,
        (next) => {
          setDocuments(next);
          setDocumentsAccessError(null);
        },
        (err) => {
          setDocuments([]);
          setDocumentsAccessError(err);
        },
      );
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [accountId]);

  const treeResult: OntologyTreeBuildResult | null = useMemo(() => {
    if (!insight) return null;
    return buildOntologyTree(insight.nodes, insight.edges);
  }, [insight]);

  const totalNodes = treeResult ? countTreeNodes(treeResult.roots) : 0;
  const docCount = insight
    ? insight.nodes.filter((n) => n.kind === "document").length
    : 0;

  // evidenceId (= 실제 knowledge document ID) → document 노드 매핑.
  // document kind 노드의 evidenceIds[0] 이 자기 자신의 underlying document ID.
  // 일반 노드의 evidenceIds 도 같은 ID 공간을 쓰므로 lookup 으로 title 복원 가능.
  const documentTitleByEvidenceId = useMemo(() => {
    const map = new Map<string, string>();
    if (!insight) return map;
    for (const n of insight.nodes) {
      if (n.kind !== "document") continue;
      for (const eid of n.evidenceIds) {
        if (!map.has(eid)) map.set(eid, n.title);
      }
    }
    return map;
  }, [insight]);

  // 선택 노드의 ego subgraph — egoHops 에 따라 1-hop 또는 2-hop.
  const egoSubgraph: OntologyEgoSubgraph | null = useMemo(() => {
    if (!insight || !selectedNode) return null;
    return buildOntologyEgoSubgraph(selectedNode.id, insight.nodes, insight.edges, {
      hops: egoHops,
    });
  }, [insight, selectedNode, egoHops]);


  return (
    <div>
      {/* OperationsNav 는 풀폭으로 (다른 운영 페이지 — /knowledge 등 — 과
          동일 정렬). 이전엔 본문 max-w 안에 같이 갇혀 좌우 여백이 크게 잡혀
          가운데로 몰려 보이는 회귀가 있었음. */}
      <OperationsNav />
      <div className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-12">
      <section className="mb-8 space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
          Ontology
        </p>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <h1 className="flex items-center gap-2 break-keep text-2xl font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            온톨로지 트리
            <Tooltip
              content={
                <div className="max-w-[320px] space-y-2 text-left">
                  <p className="font-medium text-[color:var(--color-text-primary)]">
                    ontology 노드의 계층 뷰
                  </p>
                  <p className="text-[color:var(--color-text-tertiary)]">
                    vault 안 .md 파일의 frontmatter 가 그대로 자란 트리.
                    검수 단계 없이 즉시 반영 —{" "}
                    <span className="font-mono text-xs">project → domain → capability → element</span>{" "}
                    순서로 펼쳐서 보여줍니다.
                  </p>
                  <p className="text-[color:var(--color-text-tertiary)]">
                    문서 노드는 근거 역할이라 트리에서 제외돼요. <strong>그래프를 직접 그리려면 우측 &lsquo;빌더 열기&rsquo;</strong> 버튼을 눌러보세요.
                  </p>
                </div>
              }
              withProvider={false}
            >
              <button
                type="button"
                aria-label="온톨로지 트리가 무엇인지 설명"
                className="inline-flex items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                <Info size={15} aria-hidden />
              </button>
            </Tooltip>
          </h1>
          {/* 모바일에서 pill row 가 375 폭에 안 들어가 잘릴 때를 위해
              flex-wrap + horizontal scroll 보조. md+ 는 한 줄 유지. -mr/-ml
              음수 마진 + px padding 으로 우측 잘림 방지. */}
          <div className="-mx-1 flex w-full items-center gap-2 overflow-x-auto px-1 pb-1 md:w-auto md:flex-wrap md:overflow-visible md:pb-0">
            <Tooltip content="새 노드 직접 추가" withProvider={false}>
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                aria-label="ontology 노드 직접 추가"
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.16)] px-3 text-xs text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)]"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span className="hidden sm:inline">노드 추가</span>
              </button>
            </Tooltip>
            <Tooltip content="검색 (⌘K)" withProvider={false}>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="ontology 노드 검색 열기"
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <span className="hidden sm:inline">검색</span>
                <kbd className="hidden font-mono text-[10px] text-[color:var(--color-text-quaternary)] sm:inline">⌘K</kbd>
              </button>
            </Tooltip>
            <Tooltip content="빌더 캔버스 — 왼쪽 palette 에서 종류 골라 클릭, 핸들 drag 로 관계 추가" withProvider={false}>
              <Link
                href={"/ontology/edit/"}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-indigo-brand)] bg-[color:var(--color-indigo-brand)] px-4 text-xs font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-opacity hover:opacity-90"
                aria-label="온톨로지 빌더 — 캔버스에서 직접 그리기"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                  <path d="M10 6.5h4M17.5 10v4M10 17.5h4" />
                </svg>
                빌더 열기 →
              </Link>
            </Tooltip>
            <Tooltip content="ontology 인사이트 — kind 분포 · 허브 노드 · 최근 활동 · 미연결" withProvider={false}>
              <Link
                href={"/ontology/insights/"}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
                aria-label="ontology 인사이트 — kind 분포 · 허브 노드 · 최근 활동 · 미연결"
              >
                인사이트
              </Link>
            </Tooltip>
            <Tooltip content="관계 — 종류 분포 + 근거 풍부한 강한 관계" withProvider={false}>
              <Link
                href={"/ontology/relations/"}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
                aria-label="관계 — 종류 분포 + 근거 풍부한 강한 관계"
              >
                관계
              </Link>
            </Tooltip>
          </div>
        </div>
      </section>

      {/* vault / dogfood 모드는 "근거 문서" + "발행 시점" stat 의미 0 (cloud LLM
          추출/publish flow 의존) — 2 col grid. cloud 모드만 4 col stat strip. */}
      <section
        className={`mb-6 grid gap-3 ${isVaultSentinelMode ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}
      >
        <Stat label="트리 노드" value={String(totalNodes)} />
        <Stat label="총 관계" value={insight ? String(insight.edges.length) : "—"} />
        {isVaultSentinelMode ? null : (
          <>
            <Stat
              label="근거 문서"
              value={String(docCount)}
              hint={docCount > 0 ? "문서 목록 열기" : undefined}
              href={
                docCount > 0
                  ? getKnowledgeDocumentListHref(accountId)
                  : undefined
              }
            />
            <Stat
              label="발행 시점"
              value={
                insight?.meta?.publishedAt
                  ? insight.meta.publishedAt.toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "아직 없음"
              }
            />
          </>
        )}
      </section>

      {error ? (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-5 py-4 text-sm text-[color:var(--color-status-danger)]"
        >
          ontology 데이터를 불러오는 중 오류가 났어요. {error.message}
        </div>
      ) : null}

      {/* vault / dogfood 모드는 cloud Firestore 문서 검색 자체가 비활성 —
          "권한 없음" 안내는 cloud 모드 전용 (vault 사용자에게 어색). */}
      {documentsAccessError && !isVaultSentinelMode ? (
        <p className="mb-4 break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
          문서에 접근 권한이 없어 글로벌 검색에 문서가 포함되지 않아요. ontology 노드 검색만 가능해요.
        </p>
      ) : null}

      {!treeResult ? (
        <div className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-6 py-10 text-center text-sm text-[color:var(--color-text-tertiary)]">
          불러오는 중…
        </div>
      ) : (
        <>
          {dataSourceMode === 'local' ? (
            <div className="mb-4">
              <VaultOntologyStubsPanel />
            </div>
          ) : null}
          <OntologyTreeView
            result={treeResult}
            onSelect={(node) => selectNode(node)}
            emptyHint="ontology 가 아직 자라지 않았어요. 아래 단계로 첫 그래프를 시작할 수 있어요."
          />
          {/* 빈 상태 onboarding — tree / orphans 모두 비었을 때만 노출.
              "온톨로지란 무엇이고, 어떻게 자라는지" 가이드. 데이터 있을 때
              화면 뺏지 않게 빈 상태 한정. mode 별로 다른 다음-단계 안내:
              - local (vault 활성): frontmatter 추가 → 빌더 정리 (vault 열기 단계 skip)
              - 그 외: vault 열기 → frontmatter → 빌더 (3 step) */}
          {treeResult.roots.length === 0 && treeResult.orphans.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-5 py-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                Get started
              </p>
              <h2 className="mt-1.5 break-keep text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {dataSourceMode === 'local'
                  ? 'vault 가 비어있어요 — frontmatter 를 적으면 즉시 자라요'
                  : '문서가 자라면 트리도 자라요'}
              </h2>
              <p className="mt-2 break-keep text-sm leading-6 text-[color:var(--color-text-secondary)]">
                {dataSourceMode === 'local'
                  ? '활성 vault 에 ontology frontmatter 가 있는 .md 파일이 0 개. 다음 2 단계로 첫 노드를 만들어요.'
                  : '온톨로지는 vault frontmatter 의 개념·관계가 모인 그래프예요. 다음 3 단계로 첫 트리를 만들어 봐요.'}
              </p>
              <ol className="mt-4 space-y-2 text-sm text-[color:var(--color-text-secondary)]">
                {(dataSourceMode === 'local'
                  ? [
                      ["1", "frontmatter 적기", "vault 안 아무 .md 파일에 `kind: capability` 같은 frontmatter 추가하면 즉시 stub 노드로 등장."],
                      ["2", "빌더에서 정리", "/ontology/edit 캔버스에서 시각적으로 노드·관계 다듬으면 그대로 vault 에 저장 + 트리 갱신."],
                    ]
                  : [
                      ["1", "vault 열기", "/docs 에서 마크다운 폴더를 선택해 vault 를 활성화해요."],
                      ["2", "frontmatter 추가", "문서에 kind / capabilities / elements / relates 를 적으면 자동으로 stub 노드가 만들어져요."],
                      ["3", "빌더에서 정리", "/ontology/edit 캔버스에서 노드와 관계를 다듬으면 여기 트리에 그대로 자라요."],
                    ]
                ).map(([step, title, desc]) => (
                  <li key={step} className="flex gap-3">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color:rgba(94,106,210,0.35)] bg-[color:rgba(94,106,210,0.10)] font-mono text-[10px] text-[color:rgba(159,170,235,0.95)]">
                      {step}
                    </span>
                    <span className="break-keep">
                      <span className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{title}</span>
                      <span className="text-[color:var(--color-text-tertiary)]"> — {desc}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-5 flex flex-wrap gap-2">
                {dataSourceMode === 'local' ? (
                  <>
                    <Link
                      href={"/ontology/edit/"}
                      className="inline-flex items-center gap-1.5 break-keep rounded-full border border-[color:rgba(94,106,210,0.35)] bg-[color:rgba(94,106,210,0.10)] px-4 py-2 text-sm text-[color:rgba(159,170,235,0.95)] transition-colors hover:bg-[color:rgba(94,106,210,0.18)]"
                    >
                      빌더 열기 →
                    </Link>
                    <Link
                      href={"/docs/"}
                      className="inline-flex items-center gap-1.5 break-keep rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-4 py-2 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
                    >
                      vault 살펴보기
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href={"/docs/"}
                      className="inline-flex items-center gap-1.5 break-keep rounded-full border border-[color:rgba(94,106,210,0.35)] bg-[color:rgba(94,106,210,0.10)] px-4 py-2 text-sm text-[color:rgba(159,170,235,0.95)] transition-colors hover:bg-[color:rgba(94,106,210,0.18)]"
                    >
                      vault 열기 →
                    </Link>
                    <Link
                      href={"/ontology/edit/"}
                      className="inline-flex items-center gap-1.5 break-keep rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-4 py-2 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
                    >
                      빌더 열기
                    </Link>
                  </>
                )}
              </div>
              {/* UX-1 — local 모드 빈 vault 사용자에게 *복사·붙여넣기*
                  가능한 frontmatter snippet inline 노출. 사용자가 빌더
                  진입 없이도 vault 에 직접 `.md` 만들 수 있게. AI agent
                  (MCP) 도 이 형식 그대로 add_concept 호출. */}
              {dataSourceMode === 'local' ? (
                <details className="mt-4 rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-4 py-3">
                  <summary className="cursor-pointer list-none text-[12px] text-[color:var(--color-text-secondary)]">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">snippet</span>
                    <span className="ml-2">vault 의 첫 노드 — 이 frontmatter 를 `.md` 파일에 붙여넣으면 즉시 트리에 등장</span>
                  </summary>
                  <pre className="mt-3 overflow-x-auto rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3 font-mono text-[11.5px] leading-5 text-[color:var(--color-text-secondary)]">{`---
slug: capabilities/auth
kind: capability
title: 인증
domain: auth
relates:
  - elements/jwt
  - elements/refresh-token
---

# 인증

토큰 발급, 권한 검증, 세션 추적 등 사용자 인증 흐름.
`}</pre>
                  <p className="mt-2 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
                    위 내용을 vault 안 어떤 디렉토리에든 <code className="font-mono">capabilities/auth.md</code> 같은 이름으로 저장하세요. 더 자세한 frontmatter 키: <code className="font-mono">domain</code> · <code className="font-mono">capabilities</code> · <code className="font-mono">elements</code> · <code className="font-mono">relates</code> · <code className="font-mono">dependencies</code>.
                  </p>
                </details>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {selectedNode ? (
        <NodeDetailPanel
          node={selectedNode}
          accountId={accountId}
          documentTitleByEvidenceId={documentTitleByEvidenceId}
          ego={egoSubgraph}
          egoHops={egoHops}
          onChangeEgoHops={setEgoHops}
          onSelectNeighbor={(neighbor) => selectNode(neighbor)}
          onClose={() => selectNode(null)}
          onAddEdge={(fromNode) => {
            setEdgeFromId(fromNode.id);
            setEdgeOpen(true);
          }}
        />
      ) : null}

      <GlobalSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        nodes={insight?.nodes ?? []}
        onSelectNode={(node) => selectNode(node)}
        documents={documents}
        onSelectDocument={(document) => {
          // /knowledge/documents/view 라우트로 점프 — returnTo 로 검색 후 복귀 가능.
          router.push(
            getKnowledgeDocumentDetailHref(document.id, accountId, {
              returnTo: "/ontology/",
            }),
          );
        }}
      />

      <ManualNodeCreateModal
        open={manualOpen}
        onOpenChange={setManualOpen}
        accountId={accountId ?? ""}
        existingNodes={insight?.nodes ?? []}
        onCreated={(nodeId) => {
          // 새로 만든 노드를 즉시 selectedNode 로 띄움 — 사용자 만든 결과 확인.
          // insight 가 곧 onSnapshot 으로 갱신되면 패널이 정식 데이터로 교체됨.
          const justCreated = (insight?.nodes ?? []).find((n) => n.id === nodeId);
          if (justCreated) selectNode(justCreated);
        }}
      />

      <ManualEdgeCreateModal
        open={edgeOpen}
        onOpenChange={setEdgeOpen}
        accountId={accountId ?? ""}
        existingNodes={insight?.nodes ?? []}
        existingEdges={insight?.edges ?? []}
        prefillFromId={edgeFromId}
      />

      <OntologyMetaFooter
        meta={insight?.meta ?? null}
        nodeCount={insight?.nodes.length ?? 0}
        edgeCount={insight?.edges.length ?? 0}
        mode={dataSourceMode}
      />
      </div>
    </div>
  );
}

/**
 * V1.0 강점 가시화 footer — projection version + 마지막 publish + 노드/엣지
 * count + 현재 운영 모드. /ontology 페이지 하단 영구 노출.
 *
 * V1.0 모델은 schema versioning + projection 분리 + audit chain 까지 갖췄지만
 * UI 노출이 거의 없었다 (기획자 audit F6). footer 한 줄로 *지금 보고 있는
 * ontology 가 어느 시점·어느 buildup 인지* 사용자에게 알려줌.
 */
function OntologyMetaFooter({
  meta,
  nodeCount,
  edgeCount,
  mode,
}: {
  meta: { projectionVersion: string; publishedAt: Date } | null;
  nodeCount: number;
  edgeCount: number;
  mode: 'static' | 'local' | 'cloud';
}) {
  const formatPublished = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const modeLabel =
    mode === 'local' ? '로컬 vault' : mode === 'cloud' ? '클라우드' : '정적 데모';
  return (
    <footer className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[color:var(--color-divider)] pt-3 text-[11px] text-[color:var(--color-text-quaternary)]">
      <span className="font-mono uppercase tracking-[0.14em]">
        {nodeCount} nodes · {edgeCount} relations
      </span>
      <span aria-hidden>·</span>
      <span className="font-mono uppercase tracking-[0.14em]">
        mode: {modeLabel}
      </span>
      {meta ? (
        <>
          <span aria-hidden>·</span>
          <span className="font-mono">
            projection {meta.projectionVersion}
          </span>
          <span aria-hidden>·</span>
          <span className="font-mono">
            published {formatPublished(meta.publishedAt)}
          </span>
        </>
      ) : (
        <>
          <span aria-hidden>·</span>
          <span className="font-mono">no public projection yet</span>
        </>
      )}
    </footer>
  );
}

/**
 * "노드 링크 복사" 버튼 — `/ontology/?node=<id>&account=<acc>` 절대 URL 을
 * clipboard 에 쓰기. 진안 / 운영 사용자가 특정 노드를 다른 사람에게 공유할
 * 때 (Slack DM / spec 문서 인라인 링크) NodeDetailPanel 을 열어 두지 않고도
 * 같은 진입을 만들 수 있게 한다 (Fire 2).
 *
 * window.location.origin 은 `/ontology/?account=...` 과 결합해 절대 URL 로
 * 합성. accountId 가 null 이면 query 안에 ?account 없이 — 외부 방문자가
 * demo 공개 ontology 에 그대로 진입.
 */
function CopyNodeLinkButton({
  node,
  accountId,
}: {
  node: KnowledgeGraphNode;
  accountId: string | null;
}) {
  const { show } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const params = new URLSearchParams();
    params.set("node", node.id);
    if (accountId) params.set(ACCOUNT_QUERY_KEY, accountId);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/ontology/?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      show("노드 링크 복사됨", "success");
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.warn("[CopyNodeLinkButton] clipboard write failed", err);
      show("복사 실패 — 브라우저 권한 확인", "error");
    }
  };

  return (
    <Tooltip content="이 노드의 직접 링크 복사" withProvider={false}>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={copied ? "노드 링크 복사됨" : "노드 링크 복사"}
        className={
          copied
            ? "flex h-8 items-center gap-1 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.16)] px-2.5 text-[11px] text-[color:var(--color-indigo-accent)]"
            : "flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
        }
      >
        <Link2 size={14} aria-hidden />
        {copied ? <span className="font-mono text-[10px] uppercase tracking-[0.10em]">복사</span> : null}
      </button>
    </Tooltip>
  );
}

/**
 * 트리 row 클릭 시 노출되는 노드 상세 패널.
 *
 * 데스크톱 (md+) — 화면 우측 고정 카드 (right rail).
 * 모바일 — 화면 하단 고정 시트 (BottomTabBar 위).
 *
 * project kind 면 공개 detail 페이지 진입 CTA. unknown (stub) 이면 vault
 * 에 매칭 slug 가 없다는 안내 — 빌더에서 채우거나 frontmatter 에서 빼면 해결.
 */
function NodeDetailPanel({
  node,
  accountId,
  documentTitleByEvidenceId,
  ego,
  egoHops,
  onChangeEgoHops,
  onSelectNeighbor,
  onClose,
  onAddEdge,
}: {
  node: KnowledgeGraphNode;
  accountId: string | null;
  documentTitleByEvidenceId: Map<string, string>;
  ego: OntologyEgoSubgraph | null;
  egoHops: 1 | 2;
  onChangeEgoHops: (hops: 1 | 2) => void;
  onSelectNeighbor: (node: KnowledgeGraphNode) => void;
  onClose: () => void;
  onAddEdge: (fromNode: KnowledgeGraphNode) => void;
}) {
  const kindLabel = getOntologyKindLabel(node.kind);
  const isProject = node.kind === "project";
  const isStub = node.kind === "unknown";
  const isDocument = node.kind === "document";
  const projectSlug = isProject ? node.projectIds[0] ?? null : null;
  // document 노드는 evidenceIds[0] 가 자기 자신의 underlying ID — 직접 점프 CTA.
  // 그 외 노드는 evidenceIds 가 근거 문서 목록 — "관련 문서" 리스트.
  const ownDocumentId = isDocument ? node.evidenceIds[0] ?? null : null;
  const evidenceList = isDocument ? [] : node.evidenceIds;
  // audit N1 — "+N개 더" 가 텍스트라 더 보기 불가했음. 사용자가 토글해서
  // 모든 이웃 / 근거를 볼 수 있게. node 변경 시 state 초기화 (다른 노드의
  // 펼친 상태 가 새 패널에 새 옴 안 함).
  const [showAllNeighbors, setShowAllNeighbors] = useState(false);
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  useEffect(() => {
    setShowAllNeighbors(false);
    setShowAllEvidence(false);
  }, [node.id]);
  const NEIGHBOR_PREVIEW = 6;
  const EVIDENCE_PREVIEW = 6;
  const visibleEvidence = showAllEvidence
    ? evidenceList
    : evidenceList.slice(0, EVIDENCE_PREVIEW);
  const hiddenEvidenceCount = Math.max(0, evidenceList.length - visibleEvidence.length);
  const buildDocumentHref = (evidenceId: string) =>
    getKnowledgeDocumentDetailHref(evidenceId, accountId, {
      returnTo: "/ontology/",
    });

  return (
    <aside
      role="dialog"
      aria-label={`노드 상세: ${node.title}`}
      aria-modal="false"
      data-testid="ontology-node-detail"
      className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 mx-auto flex w-full max-w-md max-h-[min(60vh,520px)] flex-col overflow-y-auto overscroll-contain rounded-t-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5 py-4 shadow-[0_-12px_28px_rgba(0,0,0,0.45)] md:bottom-auto md:right-6 md:top-24 md:left-auto md:mx-0 md:w-[360px] md:max-h-[calc(100vh-7rem)] md:rounded-2xl md:shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {kindLabel}
            </p>
            <ManualSourceChip source={node.source} size="compact" />
          </div>
          <h2 className="mt-1 break-keep text-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {node.title}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CopyNodeLinkButton node={node} accountId={accountId} />
          {!isStub ? (
            <Tooltip content="이 노드를 from 으로 새 관계 추가" withProvider={false}>
            <button
              type="button"
              onClick={() => onAddEdge(node)}
              aria-label="이 노드에서 관계 추가"
              className="flex h-8 items-center gap-1 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.16)] px-2.5 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)]"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>관계</span>
            </button>
            </Tooltip>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {node.summary ? (
        <p className="mb-3 break-keep text-sm leading-6 text-[color:var(--color-text-secondary)]">
          {node.summary}
        </p>
      ) : null}

      {node.source === "manual" && node.manualNote ? (
        <div className="mb-3 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2">
          <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
            작성 메모
          </p>
          <p className="break-keep text-[11px] leading-5 text-[color:var(--color-text-secondary)]">
            {node.manualNote}
          </p>
        </div>
      ) : null}

      {/* "근거 수" stat 은 cloud LLM 추출 산출물 — vault 노드는 evidenceCount 0
          이라 의미 0. 둘 다 0 이면 row 자체 hide → 1-col grid 로 단순화. */}
      {(() => {
        const evidenceCount = node.evidenceCount ?? node.evidenceIds.length;
        const showEvidence = evidenceCount > 0;
        return (
          <dl
            className={`grid gap-2 text-[11px] ${showEvidence ? "grid-cols-2" : "grid-cols-1"}`}
          >
            <DetailRow
              label="연결 프로젝트"
              value={node.projectIds.length > 0 ? node.projectIds.join(", ") : "—"}
            />
            {showEvidence ? (
              <DetailRow label="근거 수" value={String(evidenceCount)} />
            ) : null}
          </dl>
        );
      })()}
      <p className="mt-2 break-all font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
        {node.id}
      </p>

      {ego && ego.neighbors.length > 0 ? (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              관계 {ego.neighbors.length}
              {egoHops === 2 && ego.neighbors.some((n) => n.hop === 2) ? (
                <span className="ml-1 text-[color:var(--color-text-tertiary)]">
                  · 1-hop {ego.neighbors.filter((n) => n.hop === 1).length} · 2-hop {ego.neighbors.filter((n) => n.hop === 2).length}
                </span>
              ) : null}
            </p>
            <div
              role="radiogroup"
              aria-label="ego 그래프 깊이"
              className="flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] p-0.5"
            >
              <button
                type="button"
                role="radio"
                aria-checked={egoHops === 1}
                onClick={() => onChangeEgoHops(1)}
                className={`rounded-full px-2 py-[1px] text-[10px] tracking-[0.02em] transition-colors ${
                  egoHops === 1
                    ? "bg-[color:rgba(94,106,210,0.18)] text-[color:rgba(159,170,235,0.95)]"
                    : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]"
                }`}
              >
                1-hop
              </button>
              <Tooltip content="한 다리 건넌 이웃까지 — 노드 수 늘어 라벨 겹침 가능" withProvider={false}>
              <button
                type="button"
                role="radio"
                aria-checked={egoHops === 2}
                onClick={() => onChangeEgoHops(2)}
                className={`rounded-full px-2 py-[1px] text-[10px] tracking-[0.02em] transition-colors ${
                  egoHops === 2
                    ? "bg-[color:rgba(94,106,210,0.18)] text-[color:rgba(159,170,235,0.95)]"
                    : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]"
                }`}
              >
                2-hop
              </button>
              </Tooltip>
            </div>
          </div>
          {/* ego SVG — 데스크톱·모바일 모두 노출. 큰 ego (>12) 도 작동
              하지만 라벨 겹침 가능 — 그 경우는 트리·검색 surface 가 보조.
              2-hop 토글 시 동심원 (1-hop inner / 2-hop outer) 으로 분리. */}
          <div className="mt-2 overflow-hidden rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
            <OntologyEgoGraph
              ego={ego}
              centerNode={node}
              onSelectNeighbor={onSelectNeighbor}
            />
          </div>
          <ul className="mt-2 space-y-1">
            {(showAllNeighbors ? ego.neighbors : ego.neighbors.slice(0, NEIGHBOR_PREVIEW)).map((neighbor) => {
              const isOutgoing = neighbor.direction === "outgoing";
              const arrow = isOutgoing ? "→" : "←";
              const relationLabel = neighbor.edge.label ?? neighbor.edge.type;
              const neighborTitle = neighbor.node?.title ?? neighbor.neighborId;
              const neighborKindLabel = neighbor.node ? getOntologyKindLabel(neighbor.node.kind) : "미연결";
              const ariaLabel = isOutgoing
                ? `${node.title} → ${relationLabel} → ${neighborTitle}`
                : `${neighborTitle} → ${relationLabel} → ${node.title}`;
              const clickable = neighbor.node !== null;
              const content = (
                <>
                  <span
                    className="inline-flex shrink-0 items-center font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]"
                    aria-hidden
                  >
                    {arrow} {relationLabel}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-secondary)]">
                    {neighborTitle}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                    {neighborKindLabel}
                  </span>
                </>
              );
              return (
                <li key={`${neighbor.edge.id}-${neighbor.direction}`}>
                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => neighbor.node && onSelectNeighbor(neighbor.node)}
                      aria-label={ariaLabel}
                      className="flex w-full items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-left text-[11px] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:bg-[color:rgba(94,106,210,0.06)]"
                    >
                      {content}
                    </button>
                  ) : (
                    <div
                      aria-label={ariaLabel}
                      className="flex w-full items-center gap-2 rounded-md border border-[color:rgba(255,179,71,0.20)] bg-[color:rgba(255,179,71,0.04)] px-2.5 py-1.5 text-[11px]"
                      title="이 ID 의 노드가 아직 그래프에 없어요"
                    >
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {ego.neighbors.length > NEIGHBOR_PREVIEW ? (
            <button
              type="button"
              onClick={() => setShowAllNeighbors((v) => !v)}
              aria-expanded={showAllNeighbors}
              className="mt-1.5 inline-flex items-center font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-indigo-accent)]"
            >
              {showAllNeighbors
                ? "접기"
                : `+${ego.neighbors.length - NEIGHBOR_PREVIEW}개 더`}
            </button>
          ) : null}
        </div>
      ) : null}

      {visibleEvidence.length > 0 ? (
        <div className="mt-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            관련 문서 {evidenceList.length}
          </p>
          <ul className="mt-2 space-y-1">
            {visibleEvidence.map((evidenceId) => {
              const title = documentTitleByEvidenceId.get(evidenceId) ?? evidenceId;
              return (
                <li key={evidenceId}>
                  <Link
                    href={buildDocumentHref(evidenceId)}
                    className="block truncate rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:rgba(159,170,235,0.95)]"
                    title={title}
                  >
                    {title}
                  </Link>
                </li>
              );
            })}
          </ul>
          {evidenceList.length > EVIDENCE_PREVIEW ? (
            <button
              type="button"
              onClick={() => setShowAllEvidence((v) => !v)}
              aria-expanded={showAllEvidence}
              className="mt-1.5 inline-flex items-center font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-indigo-accent)]"
            >
              {showAllEvidence
                ? "접기"
                : `+${hiddenEvidenceCount}개 더`}
            </button>
          ) : null}
        </div>
      ) : null}

      {isDocument && ownDocumentId ? (
        <Link
          href={buildDocumentHref(ownDocumentId)}
          className="mt-4 inline-flex items-center gap-1.5 break-keep rounded-full border border-[color:rgba(94,106,210,0.35)] bg-[color:rgba(94,106,210,0.10)] px-3.5 py-1.5 text-xs text-[color:rgba(159,170,235,0.95)] transition-colors hover:bg-[color:rgba(94,106,210,0.18)]"
        >
          문서 열기 →
        </Link>
      ) : null}

      {isProject && projectSlug ? (
        <Link
          href={`/project/${projectSlug}/`}
          className="mt-4 inline-flex items-center gap-1.5 break-keep rounded-full border border-[color:rgba(94,106,210,0.35)] bg-[color:rgba(94,106,210,0.10)] px-3.5 py-1.5 text-xs text-[color:rgba(159,170,235,0.95)] transition-colors hover:bg-[color:rgba(94,106,210,0.18)]"
        >
          공개 상세 페이지 →
        </Link>
      ) : null}
      {isStub ? (
        <p className="mt-4 break-keep rounded-md border border-[color:rgba(255,179,71,0.20)] bg-[color:rgba(255,179,71,0.06)] px-3 py-2 text-xs text-[color:rgba(238,198,128,0.95)]">
          미해결 참조 — frontmatter 가 가리킨 slug 가 vault 안에 없어요. 빌더(/ontology/edit)에서 이 이름으로 노드를 만들거나, frontmatter 에서 참조를 빼세요.
        </p>
      ) : null}
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
        {label}
      </p>
      <p className="mt-0.5 break-keep text-[color:var(--color-text-primary)]">
        {value}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  href,
  hint,
  hintFull,
  className,
}: {
  label: string;
  value: string;
  /** 강조 톤 — 0 이상의 신호가 있을 때만 사용. 기본 무채색. */
  accent?: "amber" | "indigo";
  /** truthy 면 카드 자체가 Link 로 렌더 — 사용자 행동 유도. */
  href?: string;
  /** 라벨이 입문자에게 외계어인 경우 카드 내부에 1 줄 풀설명 (짧게 유지). */
  hint?: string;
  /** hint 가 길면 별도 풀설명을 호버 title 로. UX-6: 좁은 카드 wrap 회피. */
  hintFull?: string;
  /** grid 안에서 col-span 등 layout 변형. */
  className?: string;
}) {
  const accentClass =
    accent === "amber"
      ? "border-[color:rgba(255,179,71,0.30)] bg-[color:rgba(255,179,71,0.06)]"
      : accent === "indigo"
        ? "border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.08)]"
        : "border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]";
  const labelClass =
    accent === "amber"
      ? "text-[color:rgba(238,198,128,0.95)]"
      : "text-[color:var(--color-text-quaternary)]";
  const body = (
    <>
      <p className={`font-mono text-[9px] uppercase tracking-[0.14em] ${labelClass}`}>
        {label}
      </p>
      <p className="mt-1.5 break-keep text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
        {value}
      </p>
      {hint ? (
        <p
          className="mt-1.5 break-keep text-[10px] leading-snug text-[color:var(--color-text-tertiary)]"
          title={hintFull ?? hint}
        >
          {hint}
        </p>
      ) : null}
    </>
  );
  const wrapperClass = `rounded-xl border px-4 py-3 ${accentClass}${className ? ` ${className}` : ""}`;
  if (href) {
    return (
      <Link
        href={href}
        className={`${wrapperClass} block transition-colors hover:border-[color:rgba(94,106,210,0.32)]`}
      >
        {body}
      </Link>
    );
  }
  return <div className={wrapperClass}>{body}</div>;
}
