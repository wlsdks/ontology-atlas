"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PermissionGate, useGlobalAdmin } from "@/features/permissions";
import { useDataSourceMode } from "@/features/data-source-mode";
import { getProjectDetailHref } from "@/entities/project";
import {
  getKnowledgeDocumentDetailHref,
  getKnowledgeDocumentKindLabel,
  getKnowledgeDocumentListHref,
  getKnowledgeDocumentNewHref,
  getKnowledgeDocumentStatusLabel,
  getKnowledgeReviewWorkspaceHref,
  subscribeKnowledgeDocuments,
  subscribeKnowledgeVersionsByDocument,
  type KnowledgeDocument,
} from "@/entities/knowledge-document";
import { subscribeKnowledgeEvidenceByDocument } from "@/entities/knowledge-evidence";
import {
  approveKnowledgeOutput,
  dismissStubNode,
  promoteStubNode,
  publishKnowledgeProjection,
  subscribeKnowledgePublicGraph,
  subscribeStubNodes,
  type KnowledgeGraphNode,
  type StubNode,
} from "@/entities/knowledge-graph";
import {
  enqueueKnowledgeExtractionJob,
  getKnowledgeJobStatusLabel,
  resolveKnowledgeJobActionState,
  subscribeKnowledgeJobsByDocument,
  type KnowledgeJob,
} from "@/entities/knowledge-job";
import {
  subscribeKnowledgeOutputsByDocument,
  type KnowledgeOutput,
} from "@/entities/knowledge-output";
import { CandidateOntologyMatch } from "@/widgets/candidate-ontology-match";
import { OntologyOutputBadges } from "@/widgets/ontology-output-badges";
import { OntologyStubList } from "@/widgets/ontology-stub-list";
import type { KnowledgeEvidence } from "@/entities/knowledge-evidence";
import type { KnowledgeVersion } from "@/entities/knowledge-version";
import { formatDate } from "@/shared/lib/format-date";
import { MountedGlobalSearch } from "@/widgets/global-search";
import { OperationsNav } from "@/widgets/operations-nav";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tooltip,
  useToast,
} from "@/shared/ui";

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const accountId = null;
  const { user } = useGlobalAdmin();
  const dataSourceMode = useDataSourceMode();
  const requestedDocumentId = searchParams.get("id");
  const scopedProjectId = searchParams.get("project")?.trim() || "";
  const returnTo = searchParams.get("returnTo")?.trim() || "";

  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [versions, setVersions] = useState<KnowledgeVersion[]>([]);
  const [jobs, setJobs] = useState<KnowledgeJob[]>([]);
  const [outputs, setOutputs] = useState<KnowledgeOutput[]>([]);
  const [evidence, setEvidence] = useState<KnowledgeEvidence[]>([]);
  const [stubs, setStubs] = useState<StubNode[]>([]);
  // 기존 ontology approved nodes — 후보 옆 "비슷한 노드" 매칭에 사용.
  // 권한 게이팅은 Firestore rules — 권한 없으면 빈 배열, widget 자체 숨김.
  const [existingOntologyNodes, setExistingOntologyNodes] = useState<KnowledgeGraphNode[]>([]);
  const [busyStubNodeId, setBusyStubNodeId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const toast = useToast();
  const [isEnqueueing, setIsEnqueueing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  // 승인 후 공개 반영 전 상태 플래그. approve 성공 시 true, publish 성공 시 false.
  // primary CTA가 자연스레 "승인 → 공개 반영" 순서로 이어지도록 한다.
  const [hasApprovedPending, setHasApprovedPending] = useState(false);
  // T-11 partial approve — 검수자가 잘못된 후보를 체크 해제. 빈 set 이면
  // 전체 승인 (기존 동작). 비어 있지 않으면 latestOutput 의 nodes/edges 중
  // 제외된 tempId 만 빼고 acceptedTempIds 로 전달.
  const [excludedNodeTempIds, setExcludedNodeTempIds] = useState<Set<string>>(new Set());
  const [excludedEdgeTempIds, setExcludedEdgeTempIds] = useState<Set<string>>(new Set());
  // A0-2 — 200+ 후보 검수 가능하도록 그룹별 / 섹션별 "더 보기" 토글. 기본
  // 4 노드 / 6 엣지 / 6 evidence 표시, 토글 시 풀 노출.
  const [expandedNodeGroups, setExpandedNodeGroups] = useState<Set<string>>(new Set());
  const [edgesExpanded, setEdgesExpanded] = useState(false);
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);

  const NODE_GROUP_PREVIEW = 4;
  const EDGE_PREVIEW = 6;
  const EVIDENCE_PREVIEW = 6;

  const toggleNodeGroupExpansion = (key: string) => {
    setExpandedNodeGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    const unsubscribe = subscribeKnowledgeDocuments(accountId, setDocuments);
    return () => unsubscribe();
  }, [accountId]);

  // T-13c — stub placeholder list (account-scoped). 검수 큐 별도 섹션에 노출.
  useEffect(() => {
    const unsubscribe = subscribeStubNodes(accountId, setStubs, (err) => {
      console.warn("[KnowledgeReviewWorkspace] subscribeStubNodes failed", err);
    });
    return () => unsubscribe();
  }, [accountId]);

  // 후보 dedup 매칭용 — public projection 의 nodes. 검수자가 promote 결정 전에
  // "이미 비슷한 노드가 있나?" 답을 받음.
  useEffect(() => {
    setExistingOntologyNodes([]);
    const unsubscribe = subscribeKnowledgePublicGraph(
      accountId,
      (insight) => setExistingOntologyNodes(insight.nodes),
      () => setExistingOntologyNodes([]),
    );
    return () => unsubscribe();
  }, [accountId]);

  const handlePromoteStub = async (
    nodeId: string,
    newKind: "project" | "domain" | "capability" | "element" | "document",
  ) => {
    setBusyStubNodeId(nodeId);
    setActionError(null);
    try {
      await promoteStubNode({ nodeId, newKind, accountId });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "stub 승격 실패");
    } finally {
      setBusyStubNodeId(null);
    }
  };

  const handleDismissStub = async (nodeId: string) => {
    setBusyStubNodeId(nodeId);
    setActionError(null);
    try {
      await dismissStubNode({ nodeId, accountId });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "stub 삭제 실패");
    } finally {
      setBusyStubNodeId(null);
    }
  };

  const reviewQueue = useMemo(() => {
    const rankByStatus: Record<string, number> = {
      succeeded: 0,
      reviewing: 1,
      published: 2,
      processing: 3,
      leased: 4,
      queued: 5,
      failed: 6,
      draft: 7,
      ready: 8,
    };

    return [...documents].sort((left, right) => {
      const leftRank = rankByStatus[left.latestJobStatus ?? left.status] ?? 99;
      const rightRank = rankByStatus[right.latestJobStatus ?? right.status] ?? 99;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return right.updatedAt.getTime() - left.updatedAt.getTime();
    });
  }, [documents]);

  const scopedQueue = useMemo(
    () =>
      scopedProjectId
        ? reviewQueue.filter((document) => document.projectIds.includes(scopedProjectId))
        : reviewQueue,
    [reviewQueue, scopedProjectId],
  );

  const selectedDocumentId = requestedDocumentId || scopedQueue[0]?.id || reviewQueue[0]?.id || null;
  const selectedDocument =
    reviewQueue.find((document) => document.id === selectedDocumentId) ?? null;
  const primaryProjectId =
    (scopedProjectId && selectedDocument?.projectIds.includes(scopedProjectId)
      ? scopedProjectId
      : selectedDocument?.projectIds[0]) ?? null;
  const primaryProjectPublicHref = primaryProjectId
    ? getProjectDetailHref(primaryProjectId, accountId)
    : null;
  const safeReturnTo = returnTo || primaryProjectPublicHref || getKnowledgeDocumentListHref(accountId);
  const documentNewHref = getKnowledgeDocumentNewHref(accountId, {
    projectId: scopedProjectId,
    returnTo,
  });
  const primaryProjectEditHref = primaryProjectId && selectedDocument
    ? (
        `/project/${encodeURIComponent(primaryProjectId)}/edit/?returnTo=${encodeURIComponent(
          getKnowledgeReviewWorkspaceHref(selectedDocument.id, accountId, {
            projectId: primaryProjectId,
            returnTo: safeReturnTo,
          }),
        )}`
      )
    : null;

  useEffect(() => {
    if (!selectedDocumentId) {
      queueMicrotask(() => {
        setVersions([]);
        setJobs([]);
        setOutputs([]);
        setEvidence([]);
      });
      return;
    }

    const unsubscribeVersions = subscribeKnowledgeVersionsByDocument(
      accountId,
      selectedDocumentId,
      setVersions,
    );
    const unsubscribeJobs = subscribeKnowledgeJobsByDocument(
      accountId,
      selectedDocumentId,
      setJobs,
    );
    const unsubscribeOutputs = subscribeKnowledgeOutputsByDocument(
      accountId,
      selectedDocumentId,
      setOutputs,
    );
    const unsubscribeEvidence = subscribeKnowledgeEvidenceByDocument(
      accountId,
      selectedDocumentId,
      setEvidence,
    );

    return () => {
      unsubscribeVersions();
      unsubscribeJobs();
      unsubscribeOutputs();
      unsubscribeEvidence();
    };
  }, [accountId, selectedDocumentId]);

  const selectedVersion =
    versions.find((version) => version.id === selectedDocument?.currentVersionId) ??
    versions[0] ??
    null;

  const latestJob =
    jobs.find((job) => job.documentVersionId === selectedVersion?.id) ?? jobs[0] ?? null;
  const latestOutput =
    outputs.find((output) => output.documentVersionId === selectedVersion?.id) ??
    outputs[0] ??
    null;
  const selectedEvidence = evidence.filter(
    (entry) =>
      entry.documentVersionId === selectedVersion?.id &&
      (!latestOutput || entry.sourceOutputId === latestOutput.id),
  );
  const jobActionState = latestJob
    ? resolveKnowledgeJobActionState(latestJob.status)
    : null;
  // 승인 대기 → 공개 반영을 primary로. 그 외엔 기존 흐름 유지.
  type PrimaryStage = "enqueue" | "approve" | "publish";
  const primaryStage: PrimaryStage =
    hasApprovedPending && !isPublishing
      ? "publish"
      : latestOutput
        ? "approve"
        : "enqueue";
  const primaryActionLabel =
    primaryStage === "publish"
      ? isPublishing
        ? "공개에 보이는 중..."
        : "공개 화면에 보이기"
      : primaryStage === "approve"
        ? isApproving
          ? "골라내는 중..."
          : "고른 결과 저장"
        : isEnqueueing
          ? "요청 중..."
          : latestJob?.status === "failed"
            ? "다시 분석"
            : "분석 시작";
  const flowStep = selectedDocument?.status === "published"
    ? {
        label: "4. 공개 화면에 보임",
        helper: "고른 결과가 공개 지도에 보이고 있습니다.",
      }
    : hasApprovedPending
      ? {
          label: "4. 공개에 보이기",
          helper: "골라내기는 끝났어요. 공개 화면에 보이기만 누르면 됩니다.",
        }
      : latestOutput
        ? {
            label: "3. 골라내기",
            helper: "후보를 살펴보고 고를 것을 정해 주세요. 그다음 공개 단계가 열립니다.",
          }
      : latestJob?.status === "failed"
        ? {
            label: "2. 분석 다시",
            helper: "분석이 막혔어요. 다시 시도하면 됩니다.",
          }
        : latestJob
          ? {
              label: "2. 분석 중",
              helper: "끝나면 바로 골라내기 단계로 이어집니다.",
            }
          : {
              label: "2. 분석 시작",
              helper:
                jobActionState?.helperText ??
                "아직 분석을 안 돌렸으면 먼저 분석 시작을 눌러 주세요.",
            };

  const candidateNodeGroups = useMemo(() => {
    const initial = {
      project: [] as KnowledgeOutput["nodes"],
      domain: [] as KnowledgeOutput["nodes"],
      capability: [] as KnowledgeOutput["nodes"],
      element: [] as KnowledgeOutput["nodes"],
      concept: [] as KnowledgeOutput["nodes"],
      document: [] as KnowledgeOutput["nodes"],
      other: [] as KnowledgeOutput["nodes"],
    };

    for (const node of latestOutput?.nodes ?? []) {
      const key =
        node.kind in initial ? (node.kind as keyof typeof initial) : "other";
      initial[key].push(node);
    }

    return initial;
  }, [latestOutput]);

  const nodeLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of latestOutput?.nodes ?? []) {
      map.set(node.tempId, node.title);
    }
    return map;
  }, [latestOutput]);

  const queueSummary = useMemo(
    () => ({
      ready: scopedQueue.filter((document) => document.latestJobStatus === "succeeded").length,
      failed: scopedQueue.filter((document) => document.latestJobStatus === "failed").length,
      published: scopedQueue.filter((document) => document.status === "published").length,
    }),
    [scopedQueue],
  );

  const handleEnqueue = async () => {
    if (!selectedDocument || !selectedVersion) return;
    setActionError(null);
    setNotice(null);
    setIsEnqueueing(true);
    try {
      const result = await enqueueKnowledgeExtractionJob({
        accountId,
        documentId: selectedDocument.id,
        documentVersionId: selectedVersion.id,
      });
      setNotice(
        result.created
          ? `새 추출 작업을 만들었습니다. (${result.jobId})`
          : `기존 작업을 이어서 사용합니다. (${result.jobId})`,
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "추출 요청 실패");
    } finally {
      setIsEnqueueing(false);
    }
  };

  const allNodeTempIds = useMemo(
    () => (latestOutput?.nodes ?? []).map((n) => n.tempId).filter(Boolean) as string[],
    [latestOutput],
  );
  const allEdgeTempIds = useMemo(
    () => (latestOutput?.edges ?? []).map((e) => e.tempId).filter(Boolean) as string[],
    [latestOutput],
  );
  const hasExclusions = excludedNodeTempIds.size > 0 || excludedEdgeTempIds.size > 0;

  // output 이 바뀌면 (다른 문서 / 재추출) exclusion + expand 상태 reset.
  // 이전 선택이 새 tempId 와 안 맞아 의미 없는 잔재가 됨.
  useEffect(() => {
    setExcludedNodeTempIds(new Set());
    setExcludedEdgeTempIds(new Set());
    setExpandedNodeGroups(new Set());
    setEdgesExpanded(false);
    setEvidenceExpanded(false);
  }, [latestOutput?.id]);

  const toggleNodeExclusion = (tempId: string) => {
    setExcludedNodeTempIds((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  };
  const toggleEdgeExclusion = (tempId: string) => {
    setExcludedEdgeTempIds((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  };

  const handleApprove = async () => {
    if (!selectedDocument || !selectedVersion || !latestOutput) return;
    setActionError(null);
    setNotice(null);
    setIsApproving(true);
    try {
      const acceptedNodeTempIds = hasExclusions
        ? allNodeTempIds.filter((id) => !excludedNodeTempIds.has(id))
        : undefined;
      const acceptedEdgeTempIds = hasExclusions
        ? allEdgeTempIds.filter((id) => !excludedEdgeTempIds.has(id))
        : undefined;
      const result = await approveKnowledgeOutput({
        accountId,
        documentId: selectedDocument.id,
        documentVersionId: selectedVersion.id,
        outputId: latestOutput.id,
        ...(acceptedNodeTempIds !== undefined ? { acceptedNodeTempIds } : {}),
        ...(acceptedEdgeTempIds !== undefined ? { acceptedEdgeTempIds } : {}),
      });
      setNotice(
        hasExclusions
          ? `선택한 일부를 승인했습니다 (항목 ${result.approvedNodeCount} / ${allNodeTempIds.length}, 연결 ${result.approvedEdgeCount} / ${allEdgeTempIds.length}). 제외한 후보는 reject 액션으로 별도 기록할 수 있어요.`
          : `선택한 결과를 승인했습니다. 항목 ${result.approvedNodeCount}개, 연결 ${result.approvedEdgeCount}개 — 이제 "공개 지도 전체 반영" 버튼으로 마무리해주세요.`,
      );
      setHasApprovedPending(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "후보 승인 실패");
    } finally {
      setIsApproving(false);
    }
  };

  const handlePublish = async () => {
    setActionError(null);
    setNotice("공개 지도 전체에 반영 중입니다...");
    setIsPublishing(true);
    try {
      const result = await publishKnowledgeProjection({ accountId });
      setNotice(
        `공개 지도 전체에 반영했습니다. 항목 ${result.nodeCount}개, 연결 ${result.edgeCount}개`,
      );
      toast.show(
        `공개 화면에 보였어요 — 프로젝트 상세에서 지도로 확인할 수 있습니다`,
        "success",
      );
      setHasApprovedPending(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "공개 화면에 보이기 실패");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)]">
      <h1 className="sr-only">문서 확인</h1>
      <OperationsNav accountId={accountId} />
      {/* ⌘K 글로벌 검색 — 검수 중에도 ontology · 다른 문서 빠르게 점프. */}
      <MountedGlobalSearch accountId={accountId} returnTo="/review/knowledge/" />
      <div className="mx-auto max-w-7xl px-5 py-6 md:px-12 md:py-10">
        {dataSourceMode === 'local' ? (
          <section
            aria-labelledby="review-local-banner"
            className="mb-6 rounded-2xl border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.06)] px-5 py-4"
          >
            <p
              id="review-local-banner"
              className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-indigo-accent)]"
            >
              local 모드
            </p>
            <p className="mt-2 break-keep text-[13px] leading-6 text-[color:var(--color-text-secondary)]">
              vault 의 frontmatter <strong className="text-[color:var(--color-text-primary)]">자체가 자기-승인</strong>입니다.
              여기 (cloud 검수 큐) 는 AI 추출 결과를 사람이 골라내는 단계라
              local 모드에서는 의미 없습니다. 노드를 늘리려면 vault 문서 상단에{" "}
              <code className="rounded bg-[color:var(--color-overlay-2)] px-1 font-mono text-[11.5px]">kind:</code>
              {" "}추가하거나 빌더에서 직접 그리세요.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/docs/"
                className="inline-flex h-8 items-center gap-1 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.14)] px-3 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)]"
              >
                vault 열기 →
              </Link>
              <Link
                href="/ontology/edit/"
                className="inline-flex h-8 items-center gap-1 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
              >
                빌더에서 직접 그리기 →
              </Link>
            </div>
          </section>
        ) : null}
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="break-keep text-[28px] font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)] md:text-4xl">
              문서 확인
            </h1>
            <p className="mt-3 max-w-3xl break-keep text-sm leading-6 text-[color:var(--color-text-secondary)]">
              분석 결과를 살펴보고 공개 화면에 보일 것을 골라냅니다.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2 md:justify-end">
            <details className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                다른 화면 열기
              </summary>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-[color:var(--color-border-soft)] pt-4">
                <Link
                  href={getKnowledgeDocumentListHref(
                    accountId,
                    primaryProjectId ? { projectId: primaryProjectId, returnTo: safeReturnTo } : undefined,
                  )}
                  className="inline-flex"
                >
                  <Button type="button" variant="ghost" size="sm">
                    문서 목록
                  </Button>
                </Link>
                {selectedDocument ? (
                  <Link
                    href={getKnowledgeDocumentDetailHref(selectedDocument.id, accountId, {
                      projectId: primaryProjectId,
                      returnTo: safeReturnTo,
                    })}
                    className="inline-flex"
                  >
                    <Button type="button" variant="outline" size="sm">
                      선택 문서 상세
                    </Button>
                  </Link>
                ) : null}
                {primaryProjectPublicHref ? (
                  <Link
                    href={primaryProjectPublicHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="프로젝트 공개 화면을 새 탭에서 보기"
                    className="inline-flex"
                  >
                    <Button type="button" variant="outline" size="sm">
                      프로젝트 공개 화면 ↗
                    </Button>
                  </Link>
                ) : null}
                {primaryProjectEditHref ? (
                  <Link href={primaryProjectEditHref} className="inline-flex">
                    <Button type="button" variant="ghost" size="sm">
                      프로젝트 수정
                    </Button>
                  </Link>
                ) : null}
              </div>
            </details>
          </div>
        </header>

        {!accountId ? (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>작업 공간을 먼저 고르세요</CardTitle>
              <CardDescription>
                지금은 공개 기본 데이터를 보고 있습니다. 검토 결과는 선택한 공간 안에서 이어집니다.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {/*
          검토 상태 카드 — 이전엔 단계 칩("4. 공개 반영 완료") 과 카운터 칩
          (검토 가능 N / 재확인 N / 반영됨 N) 을 같은 row 에 섞어, 둘이
          같은 의미 단위처럼 읽혔다. 단계는 stepper, 카운터는 stat group
          으로 시각적으로 분리해 "지금 어디까지 왔는가" 와 "큐에 무엇이
          몇 개" 가 별개임을 한눈에 보이게 한다.
        */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>지금 어디까지 왔어요</CardTitle>
            <CardDescription>지금 손댈 수만 먼저 보여줍니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ReviewStepper currentLabel={flowStep.label} helper={flowStep.helper} />
            <div className="border-t border-[color:var(--color-border-soft)] pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
                지금 큐
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <ReviewStat label="볼 수 있는 것" value={queueSummary.ready} tone="primary" />
                <ReviewStat label="다시 봐야 할 것" value={queueSummary.failed} tone={queueSummary.failed > 0 ? 'attention' : 'muted'} />
                <ReviewStat label="공개됨" value={queueSummary.published} tone="muted" />
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="mt-8 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="xl:sticky xl:top-8 xl:self-start">
            <CardHeader>
              <CardTitle>지금 볼 문서</CardTitle>
              <CardDescription>
                지금 살펴볼 문서를 고릅니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {scopedQueue.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[color:var(--color-divider)] px-4 py-6">
                  <p className="text-sm text-[color:var(--color-text-tertiary)]">
                    {scopedProjectId
                      ? "이 프로젝트에 연결된 문서가 아직 없어요."
                      : "아직 살펴볼 문서가 없어요."}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[color:var(--color-text-quaternary)]">
                    문서를 올리고 분석을 돌리면 여기에 목록이 나타납니다.
                  </p>
                  <Link
                    href={getKnowledgeDocumentListHref(accountId, {
                      projectId: scopedProjectId,
                      returnTo,
                    })}
                    className="mt-3 inline-flex h-9 items-center rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.08)] px-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.14)]"
                  >
                    문서 목록으로 이동 →
                  </Link>
                </div>
              ) : (
                scopedQueue.map((document) => {
                  const isActive = document.id === selectedDocumentId;
                  const queueProjectId =
                    (scopedProjectId && document.projectIds.includes(scopedProjectId)
                      ? scopedProjectId
                      : document.projectIds[0]) ?? undefined;
                  return (
                    <Link
                      key={document.id}
                      href={getKnowledgeReviewWorkspaceHref(document.id, accountId, {
                        projectId: queueProjectId,
                        returnTo: safeReturnTo,
                      })}
                      className={`block rounded-2xl border px-4 py-3 transition-colors ${
                        isActive
                          ? "border-[color:var(--color-indigo-brand)] bg-[color:rgba(94,106,210,0.1)]"
                          : "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                            {document.title}
                          </p>
                          <p className="mt-1 text-xs text-[color:var(--color-text-tertiary)]">
                            {getKnowledgeDocumentKindLabel(document.kind)} · {document.projectIds.join(", ") || "프로젝트 미연결"}
                          </p>
                        </div>
                        <Badge
                          className="shrink-0"
                          variant={document.latestJobStatus === "failed" ? "indigo" : "default"}
                        >
                          {getKnowledgeJobStatusLabel(document.latestJobStatus)}
                        </Badge>
                      </div>
                      <p className="mt-3 text-xs text-[color:var(--color-text-quaternary)]">
                        업데이트 {formatDate(document.updatedAt)}
                      </p>
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {!selectedDocument ? (
              <Card>
                <CardHeader>
                  <CardTitle>고른 문서가 없어요</CardTitle>
                  <CardDescription>
                    {scopedQueue.length > 0
                      ? `왼쪽 "지금 볼 문서" 목록에서 살펴볼 문서를 먼저 고르세요. 지금 ${scopedQueue.length}개가 기다리고 있어요.`
                      : "살펴볼 문서가 없어요. 문서를 먼저 올리고 분석을 돌리면 이 목록에 채워집니다."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    href={
                      scopedQueue.length > 0
                        ? getKnowledgeDocumentListHref(accountId, {
                            projectId: scopedProjectId,
                            returnTo,
                          })
                        : documentNewHref
                    }
                    className="inline-flex h-9 items-center rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.08)] px-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
                  >
                    {scopedQueue.length > 0 ? "문서 목록 열기" : "문서 올리러 가기"} →
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <CardTitle>{selectedDocument.title}</CardTitle>
                        <CardDescription className="mt-2">
                          지금 보는 문서와 현재 기준 상태입니다.
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{getKnowledgeDocumentKindLabel(selectedDocument.kind)}</Badge>
                        <Badge>{getKnowledgeDocumentStatusLabel(selectedDocument.status)}</Badge>
                        <Badge>{selectedDocument.projectIds.join(", ") || "프로젝트 미연결"}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-4">
                    <Info label="현재 작업 기준 버전">
                      {selectedDocument.currentVersionId ?? "없음"}
                    </Info>
                    <Info label="최근 분석 상태">
                      {latestJob ? getKnowledgeJobStatusLabel(latestJob.status) : "없음"}
                    </Info>
                    <Info label="항목 후보 수">
                      {latestOutput ? String(latestOutput.nodeCount) : "0"}
                    </Info>
                    <Info label="근거 수">
                      {String(selectedEvidence.length)}
                    </Info>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>지금 할 일</CardTitle>
                    <CardDescription>
                      다음 행동 하나만 먼저 보여줍니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {actionError ? (
                      <div
                        role="alert"
                        aria-live="assertive"
                        className="rounded-lg border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-4 py-3 text-sm text-[color:var(--color-status-danger)]"
                      >
                        {actionError}
                      </div>
                    ) : null}
                    {notice ? (
                      <div role="status" className="rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 py-3 text-sm text-[color:var(--color-text-primary)]">
                        {notice}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        onClick={() => {
                          if (primaryStage === "publish") return void handlePublish();
                          if (primaryStage === "approve") return void handleApprove();
                          return void handleEnqueue();
                        }}
                        disabled={
                          primaryStage === "publish"
                            ? isPublishing
                            : primaryStage === "approve"
                              ? isApproving || isPublishing
                              : !selectedVersion || isEnqueueing || isPublishing
                        }
                      >
                        {primaryActionLabel}
                      </Button>
                      {primaryStage === "publish" && latestOutput && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => void handleEnqueue()}
                          disabled={!selectedVersion || isEnqueueing}
                        >
                          {isEnqueueing ? "요청 중..." : "다시 분석"}
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-[color:var(--color-text-tertiary)]">
                      {flowStep.helper}
                    </p>
                    {notice?.includes("공개 지도 전체에 반영했습니다") && primaryProjectPublicHref ? (
                      <Link
                        href={primaryProjectPublicHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="공개 화면을 새 탭에서 보기"
                        className="inline-flex"
                      >
                        <Button type="button" variant="outline" size="sm">
                          공개 화면에서 보기 ↗
                        </Button>
                      </Link>
                    ) : null}
                  </CardContent>
                </Card>

                {!latestOutput ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>아직 살펴볼 결과가 없어요</CardTitle>
                      <CardDescription>
                        현재 기준 버전에 연결된 최신 분석 결과가 없어요. 먼저 분석을 돌리거나 문서 상세에서 버전을 정리하세요.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Link
                        href={getKnowledgeDocumentDetailHref(selectedDocument.id, accountId)}
                        className="inline-flex"
                      >
                        <Button type="button" variant="outline">
                          문서 상세에서 정리
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                ) : (
                  <section className="grid gap-6 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
                    {stubs.length > 0 ? (
                      <Card className="xl:col-span-2">
                        <CardHeader>
                          <CardTitle>미해결 stub</CardTitle>
                          <CardDescription>
                            frontmatter relates 가 가리킨 미존재 노드들. 검수 후 promote 또는 dismiss.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <OntologyStubList
                            stubs={stubs}
                            busyNodeId={busyStubNodeId}
                            onPromote={(nodeId, newKind) => {
                              void handlePromoteStub(nodeId, newKind);
                            }}
                            onDismiss={(nodeId) => {
                              void handleDismissStub(nodeId);
                            }}
                          />
                        </CardContent>
                      </Card>
                    ) : null}
                    <Card>
                      <CardHeader>
                        <CardTitle>항목 후보</CardTitle>
                        <CardDescription>
                          종류와 상위 후보만 먼저 보여줍니다.
                        </CardDescription>
                        {latestOutput ? (
                          <div className="mt-3">
                            <OntologyOutputBadges output={latestOutput} layout="row" />
                          </div>
                        ) : null}
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                          <Info label="프로젝트">{String(candidateNodeGroups.project.length)}</Info>
                          <Info label="도메인">{String(candidateNodeGroups.domain.length)}</Info>
                          <Info label="기능">{String(candidateNodeGroups.capability.length)}</Info>
                          <Info label="요소">{String(candidateNodeGroups.element.length)}</Info>
                          <Info label="관련 개념">{String(candidateNodeGroups.concept.length)}</Info>
                          <Info label="문서">{String(candidateNodeGroups.document.length)}</Info>
                        </div>
                        <details className="rounded-lg border border-[color:var(--color-border-soft)] px-4 py-3">
                          <summary className="cursor-pointer list-none text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                            항목 후보 펼치기
                          </summary>
                          <div className="mt-4 space-y-4 border-t border-[color:var(--color-border-soft)] pt-4">
                          {(
                            [
                              ["domain", "도메인 후보"],
                              ["capability", "기능 후보"],
                              ["element", "요소 후보"],
                              ["concept", "관련 개념"],
                            ] as const
                          ).map(([key, label]) => {
                            const items = candidateNodeGroups[key];
                            if (items.length === 0) return null;
                            const isGroupExpanded = expandedNodeGroups.has(key);
                            const visibleItems = isGroupExpanded
                              ? items
                              : items.slice(0, NODE_GROUP_PREVIEW);
                            const hiddenCount = items.length - visibleItems.length;
                            return (
                              <div key={key}>
                                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                                  {label} <span className="ml-1 text-[color:var(--color-text-tertiary)]">{items.length}</span>
                                </p>
                                <div className="mt-3 space-y-2">
                                  {visibleItems.map((node) => {
                                    const isExcluded = excludedNodeTempIds.has(node.tempId);
                                    return (
                                      <div
                                        key={node.tempId}
                                        className={`rounded-2xl border px-4 py-3 transition-colors ${
                                          isExcluded
                                            ? "border-[color:rgba(255,99,99,0.25)] bg-[color:rgba(255,99,99,0.04)] opacity-60"
                                            : "border-[color:var(--color-border-soft)]"
                                        }`}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0 flex-1">
                                            <p
                                              className={`text-sm font-[var(--font-weight-signature)] ${
                                                isExcluded
                                                  ? "text-[color:var(--color-text-tertiary)] line-through"
                                                  : "text-[color:var(--color-text-primary)]"
                                              }`}
                                            >
                                              {node.title}
                                            </p>
                                            <p className="mt-1 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                                              {node.summary || "요약 없음"}
                                            </p>
                                          </div>
                                          <div className="flex shrink-0 items-center gap-2">
                                            <Badge>{formatConfidence(node.confidence)}</Badge>
                                            <button
                                              type="button"
                                              role="checkbox"
                                              aria-checked={!isExcluded}
                                              aria-label={
                                                isExcluded
                                                  ? "이 노드를 다시 승인 대상에 포함"
                                                  : "이 노드를 승인에서 제외"
                                              }
                                              title={
                                                isExcluded
                                                  ? "다시 포함"
                                                  : "이 노드는 승인 안 함"
                                              }
                                              onClick={() => toggleNodeExclusion(node.tempId)}
                                              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] transition-colors ${
                                                isExcluded
                                                  ? "border-[color:rgba(255,99,99,0.45)] bg-[color:rgba(255,99,99,0.10)] text-[color:rgba(248,180,180,0.95)]"
                                                  : "border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-tertiary)] hover:border-[color:rgba(94,106,210,0.40)] hover:text-[color:var(--color-text-primary)]"
                                              }`}
                                            >
                                              {isExcluded ? "✕" : "✓"}
                                            </button>
                                          </div>
                                        </div>
                                        {/* 후보 ↔ 기존 ontology 비슷도 매칭 — 매치 0 자동 숨김.
                                            score ≥ 80 (정확 일치) 시 amber 경고로 dedup 회피. */}
                                        <CandidateOntologyMatch
                                          candidate={{ title: node.title, kind: node.kind }}
                                          existingNodes={existingOntologyNodes}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                                {(hiddenCount > 0 || isGroupExpanded) ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleNodeGroupExpansion(key)}
                                    className="mt-2 inline-flex items-center gap-1 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-1.5 text-xs text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.40)] hover:text-[color:var(--color-text-primary)]"
                                  >
                                    {isGroupExpanded
                                      ? "처음 4 개만 보기"
                                      : `+${hiddenCount}개 더 보기 (총 ${items.length})`}
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                          </div>
                        </details>
                      </CardContent>
                    </Card>

                    <div className="space-y-6">
                      <details className="rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4">
                        <summary className="cursor-pointer list-none text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                          후보 연결
                        </summary>
                        <div className="mt-4 space-y-3 border-t border-[color:var(--color-border-soft)] pt-4">
                          {latestOutput.edges.length === 0 ? (
                            <p className="text-sm text-[color:var(--color-text-tertiary)]">
                              추출된 연결 후보가 없습니다.
                            </p>
                          ) : (
                            (edgesExpanded
                              ? latestOutput.edges
                              : latestOutput.edges.slice(0, EDGE_PREVIEW)
                            ).map((edge) => {
                              const isExcluded = excludedEdgeTempIds.has(edge.tempId);
                              return (
                                <div
                                  key={edge.tempId}
                                  className={`rounded-2xl border px-4 py-3 transition-colors ${
                                    isExcluded
                                      ? "border-[color:rgba(255,99,99,0.25)] bg-[color:rgba(255,99,99,0.04)] opacity-60"
                                      : "border-[color:var(--color-border-soft)]"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p
                                        className={`text-sm font-[var(--font-weight-signature)] ${
                                          isExcluded
                                            ? "text-[color:var(--color-text-tertiary)] line-through"
                                            : "text-[color:var(--color-text-primary)]"
                                        }`}
                                      >
                                        {nodeLookup.get(edge.fromTempId) || edge.fromTempId}
                                        {" → "}
                                        {nodeLookup.get(edge.toTempId) || edge.toTempId}
                                      </p>
                                      <p className="mt-1 text-xs text-[color:var(--color-text-tertiary)]">
                                        {getEdgeTypeLabel(edge.type)}
                                        {edge.label ? ` · ${edge.label}` : ""}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <Badge>{formatConfidence(edge.confidence)}</Badge>
                                      <button
                                        type="button"
                                        role="checkbox"
                                        aria-checked={!isExcluded}
                                        aria-label={
                                          isExcluded
                                            ? "이 연결을 다시 승인 대상에 포함"
                                            : "이 연결을 승인에서 제외"
                                        }
                                        title={
                                          isExcluded ? "다시 포함" : "이 연결은 승인 안 함"
                                        }
                                        onClick={() => toggleEdgeExclusion(edge.tempId)}
                                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] transition-colors ${
                                          isExcluded
                                            ? "border-[color:rgba(255,99,99,0.45)] bg-[color:rgba(255,99,99,0.10)] text-[color:rgba(248,180,180,0.95)]"
                                            : "border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-tertiary)] hover:border-[color:rgba(94,106,210,0.40)] hover:text-[color:var(--color-text-primary)]"
                                        }`}
                                      >
                                        {isExcluded ? "✕" : "✓"}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                          {latestOutput.edges.length > EDGE_PREVIEW ? (
                            <button
                              type="button"
                              onClick={() => setEdgesExpanded((p) => !p)}
                              className="mt-1 inline-flex items-center gap-1 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-1.5 text-xs text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.40)] hover:text-[color:var(--color-text-primary)]"
                            >
                              {edgesExpanded
                                ? `처음 ${EDGE_PREVIEW} 개만 보기`
                                : `+${latestOutput.edges.length - EDGE_PREVIEW}개 더 보기 (총 ${latestOutput.edges.length})`}
                            </button>
                          ) : null}
                        </div>
                      </details>

                      <details className="rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4">
                        <summary className="cursor-pointer list-none text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                          근거 발췌
                        </summary>
                        <div className="mt-4 space-y-3 border-t border-[color:var(--color-border-soft)] pt-4">
                          {selectedEvidence.length === 0 ? (
                            <p className="text-sm text-[color:var(--color-text-tertiary)]">
                              아직 연결된 근거가 없습니다.
                            </p>
                          ) : (
                            (evidenceExpanded
                              ? selectedEvidence
                              : selectedEvidence.slice(0, EVIDENCE_PREVIEW)
                            ).map((entry) => (
                              <div
                                key={entry.id}
                                className="rounded-2xl border border-[color:var(--color-border-soft)] px-4 py-3"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                                    {entry.chunkId}
                                  </p>
                                  <p className="text-xs text-[color:var(--color-text-tertiary)]">
                                    {entry.charStart}–{entry.charEnd}
                                  </p>
                                </div>
                                <p className="mt-3 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                                  {entry.excerpt || "발췌 없음"}
                                </p>
                              </div>
                            ))
                          )}
                          {selectedEvidence.length > EVIDENCE_PREVIEW ? (
                            <button
                              type="button"
                              onClick={() => setEvidenceExpanded((p) => !p)}
                              className="mt-1 inline-flex items-center gap-1 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-1.5 text-xs text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.40)] hover:text-[color:var(--color-text-primary)]"
                            >
                              {evidenceExpanded
                                ? `처음 ${EVIDENCE_PREVIEW} 개만 보기`
                                : `+${selectedEvidence.length - EVIDENCE_PREVIEW}개 더 보기 (총 ${selectedEvidence.length})`}
                            </button>
                          ) : null}
                        </div>
                      </details>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Info({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--color-border-soft)] px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
        {label}
      </p>
      <p className="mt-2 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
        {children}
      </p>
    </div>
  );
}

function formatConfidence(value: number) {
  if (!Number.isFinite(value)) return "신뢰도 없음";
  return `신뢰도 ${Math.round(value * 100)}%`;
}

function getEdgeTypeLabel(type: string) {
  switch (type) {
    case "references_project":
      return "프로젝트 참조";
    case "describes_domain":
      return "도메인 설명";
    case "has_capability":
      return "기능 포함";
    case "has_element":
      return "요소 포함";
    case "relates_concept":
      return "관련 개념 연결";
    default:
      return type || "연결 유형 없음";
  }
}

export function KnowledgeReviewWorkspacePage() {
  return (
    <PermissionGate>
      <WorkspaceContent />
    </PermissionGate>
  );
}

// 단계: 올리기 → 분석 → 골라내기 → 공개. flowStep.label 의 "N. ..." prefix 로
// 현재 단계를 매칭한다 (parseInt). 매칭 실패 시 helper 만 노출 (안전).
//
// description 은 hover tooltip 노출용 — 첫 사용자가 각 단계의 역할을 한 눈에
// 이해할 수 있게 명사형 짧은 설명.
const REVIEW_STAGES = [
  {
    num: 1,
    label: "올리기",
    description: "md / pdf 등 문서 파일을 등록합니다.",
  },
  {
    num: 2,
    label: "분석",
    description: "Anthropic LLM 이 본문을 읽고 노드·관계 후보를 추출합니다.",
  },
  {
    num: 3,
    label: "골라내기",
    description: "추출 후보를 검토해 어떤 것을 승인할지 결정합니다.",
  },
  {
    num: 4,
    label: "공개",
    description:
      "승인한 그래프를 비-로그인 방문자도 볼 수 있게 발행합니다 (knowledgePublic).",
  },
] as const;

function ReviewStepper({
  currentLabel,
  helper,
}: {
  currentLabel: string;
  helper: string;
}) {
  const match = currentLabel.match(/^(\d+)/);
  const currentNum = match ? Number(match[1]) : null;
  const totalStages = REVIEW_STAGES.length;
  const currentStage = REVIEW_STAGES.find((s) => s.num === currentNum) ?? null;
  const cleanLabel = currentLabel.replace(/^\d+\.\s*/, "");
  // 진행률 — 1단계 25%, 4단계 100%. progress bar 노출용.
  const progressPercent = currentNum
    ? Math.round((currentNum / totalStages) * 100)
    : 0;
  return (
    <div>
      {/* 모바일 — 4단계 도식이 들어가지 않아 한글 글자 단위 wrap 됐다.
          현재 단계 한 줄 + progress bar 로 압축. md+ 에서는 기존
          horizontal stepper 유지. */}
      <div className="md:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="break-keep text-[14px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {currentStage?.label ?? cleanLabel}
          </p>
          <p className="shrink-0 font-mono text-[11px] tabular-nums text-[color:var(--color-text-quaternary)]">
            {currentNum ?? 0} / {totalStages}
          </p>
        </div>
        <div
          aria-hidden
          className="mt-2 h-1 overflow-hidden rounded-full bg-[color:var(--color-border-soft)]"
        >
          <div
            className="h-full bg-[color:var(--color-indigo-brand)] transition-[width] duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="mt-3 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
          {helper}
        </p>
      </div>

      {/* 데스크톱 — 4단계 가로 stepper 그대로. */}
      <div className="hidden md:block">
        <ol className="flex items-center gap-2" aria-label="문서 확인 단계 진행">
          {REVIEW_STAGES.map((stage, idx) => {
            const isCurrent = currentNum === stage.num;
            const isPast = currentNum !== null && currentNum > stage.num;
            const dotCls = isCurrent
              ? "border-[color:var(--color-indigo-brand)] bg-[color:rgba(94,106,210,0.18)] text-[color:var(--color-text-primary)]"
              : isPast
                ? "border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.08)] text-[color:var(--color-text-secondary)]"
                : "border-[color:var(--color-overlay-3)] bg-transparent text-[color:var(--color-text-quaternary)]";
            const labelCls = isCurrent
              ? "text-[color:var(--color-text-primary)]"
              : "text-[color:var(--color-text-tertiary)]";
            return (
              <li key={stage.num} className="flex items-center gap-2">
                <Tooltip
                  content={
                    <div className="max-w-[220px] text-left">
                      <p className="font-medium">
                        {stage.num}. {stage.label}
                      </p>
                      <p className="mt-1 text-[color:var(--color-text-tertiary)]">
                        {stage.description}
                      </p>
                    </div>
                  }
                  withProvider={false}
                >
                  <button
                    type="button"
                    aria-label={`${stage.num}단계: ${stage.label} — ${stage.description}`}
                    aria-current={isCurrent ? "step" : undefined}
                    className="inline-flex items-center gap-2 rounded-full"
                  >
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border font-mono text-[11px] tabular-nums ${dotCls}`}
                    >
                      {stage.num}
                    </span>
                    <span className={`whitespace-nowrap break-keep text-[12px] ${labelCls}`}>{stage.label}</span>
                  </button>
                </Tooltip>
                {idx < REVIEW_STAGES.length - 1 ? (
                  <span
                    aria-hidden
                    className={`h-px w-4 ${isPast ? "bg-[color:rgba(94,106,210,0.32)]" : "bg-[color:var(--color-border-soft)]"}`}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
          {cleanLabel} — {helper}
        </p>
      </div>
    </div>
  );
}

function ReviewStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "primary" | "attention" | "muted";
}) {
  const valueCls =
    tone === "primary"
      ? "text-[color:var(--color-text-primary)]"
      : tone === "attention"
        ? "text-[color:var(--color-indigo-accent)]"
        : "text-[color:var(--color-text-tertiary)]";
  return (
    <div className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5">
      <p className="break-keep text-[11px] leading-tight text-[color:var(--color-text-quaternary)]">
        {label}
      </p>
      <p className={`mt-1 text-xl tabular-nums font-[var(--font-weight-signature)] ${valueCls}`}>
        {value}
      </p>
    </div>
  );
}
