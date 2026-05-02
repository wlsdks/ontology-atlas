"use client";

import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PermissionGate, useGlobalAdmin } from "@/features/permissions";
import { getProjectDetailHref, type Project } from "@/entities/project";
import { subscribeProjects } from "@/entities/project/api";
import type { KnowledgeEvidence } from "@/entities/knowledge-evidence";
import { subscribeKnowledgeEvidenceByDocument } from "@/entities/knowledge-evidence/api";
import {
  resolveKnowledgeJobActionState,
  type KnowledgeJob,
} from "@/entities/knowledge-job";
import { subscribeKnowledgeJobsByDocument } from "@/entities/knowledge-job/api";
import type { KnowledgeOutput } from "@/entities/knowledge-output";
import { subscribeKnowledgeOutputsByDocument } from "@/entities/knowledge-output/api";
import {
  getKnowledgeDocumentDetailHref,
  getKnowledgeDocumentListHref,
  getKnowledgeDocumentKindLabel,
  getKnowledgeDocumentStatusLabel,
  getKnowledgeMetadataFieldLabel,
  type KnowledgeDocument,
} from "@/entities/knowledge-document";
import {
  createKnowledgeDocumentVersion,
  downloadKnowledgeMarkdown,
  subscribeKnowledgeDocuments,
  subscribeKnowledgeVersionsByDocument,
  setKnowledgeDocumentCurrentVersion,
} from "@/entities/knowledge-document/api";
import {
  buildKnowledgeVersionMarkdownDiff,
  buildKnowledgeVersionMetadataDiff,
} from "@/entities/knowledge-version";
import type { KnowledgeVersion } from "@/entities/knowledge-version";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, buttonVariants } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { formatDate } from "@/shared/lib/format-date";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { DocumentOntologyEvidenceSection } from "@/widgets/document-ontology-evidence";
import { MountedGlobalSearch } from "@/widgets/global-search";
import { OperationsNav } from "@/widgets/operations-nav";
import { Info } from "./parts/Info";
import { JobStatusBadge } from "./parts/JobStatusBadge";
import { PanelButton } from "./parts/PanelButton";
import { resolveNodeKindLabel, resolveOutputNodeTitle } from "./parts/labels";

interface Props {
  documentId?: string;
  returnTo?: string;
}

type DetailPanel = "overview" | "compare" | "result";

function DetailContent({ documentId, returnTo }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = null;
  const scopedProjectId = searchParams.get("project")?.trim() || "";
  const returnToParam = searchParams.get("returnTo")?.trim() || returnTo || "";
  const autoStartJob = searchParams.get("jobStatus") === "autostart";
  const { user } = useGlobalAdmin();
  const [document, setDocument] = useState<KnowledgeDocument | null>(null);
  useDocumentTitle(
    document?.title ? `${document.title} · oh-my-ontology` : "문서 상세 · oh-my-ontology",
  );
  const [versions, setVersions] = useState<KnowledgeVersion[]>([]);
  const [jobs, setJobs] = useState<KnowledgeJob[]>([]);
  const [outputs, setOutputs] = useState<KnowledgeOutput[]>([]);
  const [evidence, setEvidence] = useState<KnowledgeEvidence[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [blockingError, setBlockingError] = useState<string | null>(null);
  const [connectionIssue, setConnectionIssue] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploadMarkdown, setUploadMarkdown] = useState("");
  const [selectedUploadFileName, setSelectedUploadFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [markdownByVersionId, setMarkdownByVersionId] = useState<Record<string, string>>({});
  const [activePanel, setActivePanel] = useState<DetailPanel>("overview");

  const handleStreamRecovered = useCallback(() => {
    setBlockingError(null);
    setConnectionIssue(null);
  }, []);

  const handleStreamIssue = useCallback((error: Error, fallbackMessage: string) => {
    const message = error.message?.trim() || fallbackMessage;
    const nextMessage = /invalid_grant|permission|credential|token|auth/i.test(message)
      ? "실시간 연결이 잠시 불안정합니다."
      : message;
    setConnectionIssue(`${nextMessage} 잠시 후 자동으로 다시 연결합니다.`);
  }, []);

  useEffect(() => {
    if (!documentId) return;
    const unsubscribe = subscribeKnowledgeDocuments(
      accountId,
      (nextDocuments) => {
        const nextDocument =
          nextDocuments.find((candidate) => candidate.id === documentId) ?? null;
        setDocument(nextDocument);
        setBlockingError(nextDocument ? null : "문서를 찾을 수 없습니다.");
        setConnectionIssue(null);
      },
      (error) => {
        setBlockingError(
          error instanceof Error ? error.message : "문서 조회 실패",
        );
      },
    );
    return () => unsubscribe();
  }, [accountId, documentId]);

  useEffect(() => {
    if (!documentId) return;
    const unsubscribe = subscribeKnowledgeVersionsByDocument(
      accountId,
      documentId,
      (nextVersions) => {
        setVersions(nextVersions);
        handleStreamRecovered();
      },
      (error) => handleStreamIssue(error, "버전 목록을 불러오지 못했습니다."),
    );
    return () => unsubscribe();
  }, [accountId, documentId, handleStreamIssue, handleStreamRecovered]);

  // 복귀 링크에 프로젝트 이름을 표시하려고 projects 전체 한 번 구독.
  // 500노드 규모에서도 가볍고, 이후 stepper/back link에서 slug → name 변환에 사용.
  useEffect(() => {
    const unsubscribe = subscribeProjects(accountId, setProjects);
    return () => unsubscribe();
  }, [accountId]);

  useEffect(() => {
    if (!documentId) return;
    const unsubscribe = subscribeKnowledgeJobsByDocument(
      accountId,
      documentId,
      (nextJobs) => {
        setJobs(nextJobs);
        handleStreamRecovered();
      },
      (error) => handleStreamIssue(error, "분석 상태를 불러오지 못했습니다."),
    );
    return () => unsubscribe();
  }, [accountId, documentId, handleStreamIssue, handleStreamRecovered]);

  useEffect(() => {
    if (!documentId) return;
    const unsubscribe = subscribeKnowledgeOutputsByDocument(
      accountId,
      documentId,
      (nextOutputs) => {
        setOutputs(nextOutputs);
        handleStreamRecovered();
      },
      (error) => handleStreamIssue(error, "분석 결과를 불러오지 못했습니다."),
    );
    return () => unsubscribe();
  }, [accountId, documentId, handleStreamIssue, handleStreamRecovered]);

  useEffect(() => {
    if (!documentId) return;
    const unsubscribe = subscribeKnowledgeEvidenceByDocument(
      accountId,
      documentId,
      (nextEvidence) => {
        setEvidence(nextEvidence);
        handleStreamRecovered();
      },
      (error) => handleStreamIssue(error, "근거 목록을 불러오지 못했습니다."),
    );
    return () => unsubscribe();
  }, [accountId, documentId, handleStreamIssue, handleStreamRecovered]);

  const selectedVersionId =
    searchParams.get("version") ?? document?.currentVersionId ?? versions[0]?.id;
  const selectedVersion =
    versions.find((version) => version.id === selectedVersionId) ?? versions[0] ?? null;
  const currentVersion =
    versions.find((version) => version.id === document?.currentVersionId) ?? versions[0] ?? null;
  const selectedVersionJob =
    (selectedVersion
      ? jobs.find((job) => job.documentVersionId === selectedVersion.id)
      : null) ?? null;
  const latestJob = selectedVersionJob ?? jobs[0] ?? null;
  const selectedVersionJobs = selectedVersion
    ? jobs.filter((job) => job.documentVersionId === selectedVersion.id)
    : [];
  const selectedVersionOutputs = selectedVersion
    ? outputs.filter((output) => output.documentVersionId === selectedVersion.id)
    : [];
  const latestOutput =
    (latestJob
      ? selectedVersionOutputs.find((output) => output.jobId === latestJob.id)
      : null) ??
    selectedVersionOutputs[0] ??
    null;
  const selectedVersionEvidence = selectedVersion
    ? evidence.filter((entry) => entry.documentVersionId === selectedVersion.id)
    : [];
  const hasComparePanel = versions.length > 1;
  const hasResultPanel = Boolean(
    latestJob || latestOutput || selectedVersionEvidence.length > 0,
  );
  const candidateProjectNodes = latestOutput?.nodes.filter(
    (node) => node.kind === "project",
  ) ?? [];
  const candidateDomainNodes = latestOutput?.nodes.filter(
    (node) => node.kind === "domain",
  ) ?? [];
  const candidateCapabilityNodes = latestOutput?.nodes.filter(
    (node) => node.kind === "capability",
  ) ?? [];
  const candidateElementNodes = latestOutput?.nodes.filter(
    (node) => node.kind === "element",
  ) ?? [];
  const candidateRelatedNodes = latestOutput?.nodes.filter(
    (node) => node.kind === "concept",
  ) ?? [];

  useEffect(() => {
    queueMicrotask(() => {
      setActivePanel((current) => {
        if (current === "compare" && !hasComparePanel) {
          return hasResultPanel ? "result" : "overview";
        }
        if (current === "result" && !hasResultPanel) {
          return "overview";
        }
        if (
          autoStartJob &&
          current === "overview" &&
          hasResultPanel &&
          Boolean(latestOutput)
        ) {
          return "result";
        }
        return current;
      });
    });
  }, [autoStartJob, hasComparePanel, hasResultPanel, latestOutput]);

  const metadataDiff =
    currentVersion && selectedVersion
      ? buildKnowledgeVersionMetadataDiff({
          currentVersion,
          selectedVersion,
        })
      : [];
  const markdownDiff =
    currentVersion && selectedVersion
      ? buildKnowledgeVersionMarkdownDiff({
          currentVersion,
          selectedVersion,
          currentMarkdown: markdownByVersionId[currentVersion.id] ?? "",
          selectedMarkdown: markdownByVersionId[selectedVersion.id] ?? "",
        })
      : null;
  const jobActionState = latestJob
    ? resolveKnowledgeJobActionState(latestJob.status)
    : null;
  const primaryProjectId =
    (scopedProjectId && document?.projectIds.includes(scopedProjectId)
      ? scopedProjectId
      : document?.projectIds[0]) ?? null;
  const primaryProject = primaryProjectId
    ? projects.find((p) => p.slug === primaryProjectId) ?? null
    : null;
  const primaryProjectName = primaryProject?.name ?? primaryProjectId;
  const safeReturnTo =
    returnToParam ||
    getKnowledgeDocumentListHref(
      accountId,
      primaryProjectId ? { projectId: primaryProjectId } : undefined,
    );
  const hasRenderableData = document !== null || versions.length > 0;
  const currentDocumentDetailHref = documentId
    ? getKnowledgeDocumentDetailHref(documentId, accountId, {
        projectId: primaryProjectId,
        returnTo: safeReturnTo,
      })
    : null;
  const primaryProjectPublicHref = primaryProjectId
    ? getProjectDetailHref(primaryProjectId, accountId)
    : null;
  const primaryProjectEditHref = primaryProjectId && currentDocumentDetailHref
    ? `/project/${encodeURIComponent(primaryProjectId)}/edit/?returnTo=${encodeURIComponent(
        currentDocumentDetailHref,
      )}`
    : null;
  const selectedVersionIsCurrent =
    Boolean(selectedVersion) && document?.currentVersionId === selectedVersion?.id;
  const shouldPromotePublic =
    Boolean(selectedVersionIsCurrent && document?.status === "published" && primaryProjectPublicHref);
  const primaryActionLabel: string | null = !selectedVersionIsCurrent
    ? "이 버전을 기준으로"
    : shouldPromotePublic
      ? "공개 화면 보기"
      : null;
  const flowStep = !selectedVersionIsCurrent
    ? {
        label: "기준 버전 확인",
        helper: "먼저 지금 작업할 버전을 맞추세요.",
      }
    : document?.status === "published"
      ? {
          label: "공개 화면에 보임",
          helper: "공개 화면에서 바로 결과를 볼 수 있어요.",
        }
      : {
          label: "vault 에서 직접 추가",
          helper:
            "이 문서엔 ontology 노드가 없어요. /docs 의 vault frontmatter 에 kind / capabilities / elements 를 적거나 /ontology/edit 빌더에서 노드를 만드세요.",
        };

  // 2단계 stepper — upload / publish. mission v2 가 cloud LLM 추출을 제거 +
  // 검수 큐 surface 도 빠져 review stage 가 사라짐. vault frontmatter 가
  // 자기-승인이라 upload 후 바로 publish.
  const stepperStages = [
    { key: "upload", label: "올리기" },
    { key: "publish", label: "공개" },
  ] as const;
  const currentStepIndex =
    document?.status === "published"
      ? 1
      : !selectedVersionIsCurrent
        ? 0
        : 0;
  const stepSummary =
    document?.status === "published"
      ? "모두 끝났어요 — 공개 화면에서 보입니다."
      : selectedVersionIsCurrent
        ? "이 문서엔 ontology 노드가 없어요. vault frontmatter 또는 빌더에서 직접 추가하세요."
        : "먼저 작업할 기준 버전을 정해 주세요.";

  useEffect(() => {
    if (activePanel === "compare" && !hasComparePanel) {
      queueMicrotask(() => setActivePanel(hasResultPanel ? "result" : "overview"));
      return;
    }
    if (activePanel === "result" && !hasResultPanel) {
      queueMicrotask(() => setActivePanel(hasComparePanel ? "compare" : "overview"));
    }
  }, [activePanel, hasComparePanel, hasResultPanel]);

  useEffect(() => {
    const targets = [currentVersion, selectedVersion].filter(
      (version): version is KnowledgeVersion => Boolean(version),
    );
    if (targets.length === 0) return;
    const missingTargets = targets.filter(
      (version) => markdownByVersionId[version.id] === undefined,
    );
    if (missingTargets.length === 0) return;

    let cancelled = false;
    void Promise.all(
      missingTargets.map(async (version) => {
        const markdown = await downloadKnowledgeMarkdown(version.storagePath);
        return [version.id, markdown] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        setMarkdownByVersionId((current) => {
          const next = { ...current };
          for (const [versionId, markdown] of entries) {
            next[versionId] = markdown;
          }
          return next;
        });
      })
      .catch((error) => {
        if (!cancelled) {
          handleStreamIssue(
            error instanceof Error ? error : new Error("버전 마크다운 불러오기 실패"),
            "버전 마크다운을 불러오지 못했습니다.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentVersion, handleStreamIssue, selectedVersion, markdownByVersionId]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setSelectedUploadFileName(file.name);
    setUploadMarkdown(text);
  };

  const handleCreateVersion = async () => {
    if (!documentId || !uploadMarkdown.trim()) return;
    setIsUploading(true);
    setActionError(null);
    try {
      const { versionId } = await createKnowledgeDocumentVersion({
        accountId,
        documentId,
        rawMarkdown: uploadMarkdown,
        createdBy: user?.email ?? "unknown-admin",
      });
      setSelectedUploadFileName(null);
      setUploadMarkdown("");
      router.replace(
        getKnowledgeDocumentDetailHref(documentId, accountId, {
          versionId,
          projectId: primaryProjectId,
          returnTo: safeReturnTo,
        }),
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "버전 업로드 실패");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSetCurrentVersion = async () => {
    if (!document || !selectedVersion) return;
    setActionError(null);
    try {
      await setKnowledgeDocumentCurrentVersion({ document, version: selectedVersion });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "현재 작업 기준 버전 지정 실패",
      );
    }
  };

  if (!documentId) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>문서 ID가 없습니다</CardTitle>
            <CardDescription>상세 화면 주소에는 `?id=` 문서 식별자가 필요합니다.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (blockingError && !hasRenderableData) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>불러오지 못했습니다</CardTitle>
            <CardDescription>{blockingError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={safeReturnTo} className="inline-flex">
              <Button variant="outline" type="button">
                이전 화면으로
              </Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)]">
      <OperationsNav />
      {/* ⌘K 글로벌 검색 — 문서 보다가 ontology · 다른 문서 빠르게 점프. */}
      <MountedGlobalSearch
        accountId={accountId}
        returnTo={getKnowledgeDocumentDetailHref(documentId ?? "")}
      />
      <div className="mx-auto max-w-7xl px-5 py-6 md:px-12 md:py-10">
        {/* 복귀 링크 — returnTo가 있으면 "프로젝트명으로 돌아가기" 형태로 강조,
            없으면 문서 리스트로 회귀. 시각적 화살표 + 프로젝트 이름으로 컨텍스트
            유지. */}
        <Link
          href={safeReturnTo}
          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-1.5 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.28)] hover:text-[color:var(--color-text-primary)]"
        >
          <span aria-hidden="true">←</span>
          {returnToParam && primaryProjectName
            ? `${primaryProjectName}으로 돌아가기`
            : "문서 리스트로 돌아가기"}
        </Link>

        <header className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)] md:text-4xl">
              {document?.title ?? "문서 상세"}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-tertiary)]">
              <Badge>{getKnowledgeDocumentKindLabel(document?.kind ?? "")}</Badge>
              <Badge>{getKnowledgeDocumentStatusLabel(document?.status)}</Badge>
            </div>
            {(primaryProjectPublicHref || primaryProjectEditHref || document?.id) && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {primaryProjectPublicHref && (
                  <Link
                    href={primaryProjectPublicHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="프로젝트 공개 화면을 새 탭에서 보기"
                    className="inline-flex"
                  >
                    <Button type="button" size="sm" variant="outline">
                      프로젝트 공개 화면 ↗
                    </Button>
                  </Link>
                )}
                {primaryProjectEditHref && (
                  <Link href={primaryProjectEditHref} className="inline-flex">
                    <Button type="button" size="sm" variant="ghost">
                      프로젝트 수정
                    </Button>
                  </Link>
                )}
              </div>
            )}
            {connectionIssue && (
              <div role="status" className="mt-4 rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 py-3 text-sm text-[color:var(--color-text-secondary)]">
                {connectionIssue}
              </div>
            )}
            {actionError && (
              <div
                role="alert"
                aria-live="assertive"
                className="mt-4 rounded-lg border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-4 py-3 text-sm text-[color:var(--color-status-danger)]"
              >
                {actionError}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2 md:justify-end">
          </div>
        </header>

        {/* 업로드 → 분해 → 리뷰 → 공개 4단계 progress stepper. 현재 단계는 인디고
            dot + 굵은 텍스트로, 지나온 단계는 체크, 앞으로의 단계는 dim 처리.
            document.status + latestJob 기반 단일 currentStepIndex 로 일관된 표시. */}
        {document ? (
          <section
            aria-label="문서 진행 상태"
            className="mt-6 rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-5 py-4"
          >
            <ol className="flex flex-wrap items-center gap-2 md:gap-0">
              {stepperStages.map((stage, index) => {
                const state =
                  index < currentStepIndex
                    ? "done"
                    : index === currentStepIndex
                      ? "current"
                      : "future";
                const dotClasses =
                  state === "done"
                    ? "border-[color:rgba(94,106,210,0.6)] bg-[color:rgba(94,106,210,0.18)] text-[color:var(--color-indigo-accent)]"
                    : state === "current"
                      ? "border-[color:var(--color-indigo-brand)] bg-[color:var(--color-indigo-brand)] text-white"
                      : "border-[color:var(--color-overlay-3)] bg-transparent text-[color:var(--color-text-quaternary)]";
                const labelClasses =
                  state === "current"
                    ? "text-[color:var(--color-text-primary)] font-[var(--font-weight-signature)]"
                    : state === "done"
                      ? "text-[color:var(--color-text-secondary)]"
                      : "text-[color:var(--color-text-quaternary)]";
                return (
                  <li
                    key={stage.key}
                    className="flex items-center gap-2"
                    aria-current={state === "current" ? "step" : undefined}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-mono ${dotClasses}`}
                    >
                      {state === "done" ? "✓" : index + 1}
                    </span>
                    <span className={`text-[12px] ${labelClasses}`}>
                      {stage.label}
                    </span>
                    {index < stepperStages.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="mx-2 h-px w-8 bg-[color:var(--color-divider)] md:w-12"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                {stepSummary}
              </p>
              {/* 현재 단계에 맞는 다음 액션 CTA를 stepper 안에 바로 노출. 이전엔
                  탭 안 "지금 할 일"까지 스크롤해야 발견 가능했던 버튼들을 여기로
                  올려 한 눈에 "다음에 뭐 누르지" 해결. */}
              {currentStepIndex === 1 && primaryProjectPublicHref ? (
                <Link
                  href={primaryProjectPublicHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "shrink-0",
                  )}
                >
                  공개 화면 확인 ↗
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}

        {!accountId ? (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>작업 공간을 먼저 고르세요</CardTitle>
              <CardDescription>
                지금은 공개 기본 데이터를 보고 있습니다. 작업 결과는 선택한 공간 안에서 이어집니다.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>현재 상태</CardTitle>
            <CardDescription>지금 기준 버전과 분석 상태만 먼저 봅니다.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm text-[color:var(--color-text-secondary)]">
            <Badge variant="indigo">{flowStep.label}</Badge>
            <Badge>기준 {document?.currentVersionId ?? "없음"}</Badge>
            {latestJob ? (
              <JobStatusBadge status={latestJob.status} />
            ) : (
              <Badge>분석 없음</Badge>
            )}
            <p className="w-full text-xs text-[color:var(--color-text-tertiary)]">{flowStep.helper}</p>
          </CardContent>
        </Card>

        <section role="tablist" aria-label="문서 상세 패널" className="mt-6 flex flex-wrap gap-2">
          <PanelButton
            id="knowledge-detail-tab-overview"
            active={activePanel === "overview"}
            controls="knowledge-detail-panel-overview"
            onClick={() => setActivePanel("overview")}
          >
            개요와 버전
          </PanelButton>
          {hasComparePanel ? (
            <PanelButton
              id="knowledge-detail-tab-compare"
              active={activePanel === "compare"}
              controls="knowledge-detail-panel-compare"
              onClick={() => setActivePanel("compare")}
            >
              변경 비교
            </PanelButton>
          ) : null}
          {hasResultPanel ? (
            <PanelButton
              id="knowledge-detail-tab-result"
              active={activePanel === "result"}
              controls="knowledge-detail-panel-result"
              onClick={() => setActivePanel("result")}
            >
              분석 결과
            </PanelButton>
          ) : null}
        </section>

        {activePanel === "overview" && (
          <section
            id="knowledge-detail-panel-overview"
            role="tabpanel"
            aria-labelledby="knowledge-detail-tab-overview"
            className="mt-6 grid gap-6 xl:grid-cols-[0.82fr_1.18fr]"
          >
            <Card>
              <CardHeader>
                <CardTitle>버전 이력</CardTitle>
                <CardDescription>
                  현재 작업 기준 버전과 비교할 대상을 선택합니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {versions.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[color:var(--color-divider)] px-4 py-6 text-sm text-[color:var(--color-text-tertiary)]">
                    아직 버전이 없습니다. 아래 &ldquo;본문 수정&rdquo; 카드에서 첫 마크다운을 올려보세요.
                  </p>
                ) : (
                  versions.map((version) => {
                    const href = getKnowledgeDocumentDetailHref(documentId, accountId, {
                      versionId: version.id,
                      projectId: primaryProjectId,
                      returnTo: safeReturnTo,
                    });
                    const isCurrent = document?.currentVersionId === version.id;
                    const isSelected = selectedVersion?.id === version.id;
                    return (
                      <Link
                        key={version.id}
                        href={href}
                        className={`block rounded-lg border px-4 py-3 transition-colors ${
                          isSelected
                            ? "border-[color:var(--color-indigo-brand)] bg-[color:rgba(94,106,210,0.1)]"
                            : "border-[color:var(--color-border-soft)]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                            {version.id}
                          </p>
                          {isCurrent && <Badge variant="indigo">기준</Badge>}
                        </div>
                        <p className="mt-2 text-xs text-[color:var(--color-text-tertiary)]">
                          {formatDate(version.createdAt)} · {version.createdBy}
                        </p>
                      </Link>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>지금 할 일</CardTitle>
                  <CardDescription>
                    선택한 버전 기준으로 다음 행동 하나만 먼저 보여줍니다.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedVersion ? (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Info label="등록 시각">{formatDate(selectedVersion.createdAt)}</Info>
                        <Info label="연결 프로젝트">{selectedVersion.projectIds.join(", ") || "—"}</Info>
                      </div>
                      {latestOutput ? (
                        <div className="rounded-lg border border-[color:var(--color-border-soft)] px-4 py-4">
                          <p className="text-sm text-[color:var(--color-text-primary)]">
                            {latestOutput.summary}
                          </p>
                          <p className="mt-3 text-xs text-[color:var(--color-text-tertiary)]">
                            항목 {latestOutput.nodeCount}개 · 연결 {latestOutput.edgeCount}개
                          </p>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        {shouldPromotePublic && primaryProjectPublicHref && primaryActionLabel ? (
                          <Link
                            href={primaryProjectPublicHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="공개 화면을 새 탭에서 보기"
                            className="inline-flex"
                          >
                            <Button type="button">{primaryActionLabel}</Button>
                          </Link>
                        ) : !selectedVersionIsCurrent && primaryActionLabel ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void handleSetCurrentVersion()}
                            disabled={
                              !document || document.currentVersionId === selectedVersion.id
                            }
                          >
                            {primaryActionLabel}
                          </Button>
                        ) : null}
                      </div>
                      <p className="text-xs text-[color:var(--color-text-tertiary)]">
                        {flowStep.helper}
                      </p>
                      <details className="rounded-lg border border-[color:var(--color-border-soft)] px-4 py-3">
                        <summary className="cursor-pointer list-none text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                          원문
                        </summary>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <Info label="버전 ID">{selectedVersion.id}</Info>
                          <Info label="작성자">{selectedVersion.createdBy}</Info>
                        </div>
                        <pre className="mt-4 max-h-[280px] overflow-auto rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3 text-xs text-[color:var(--color-text-tertiary)]">
                          {markdownByVersionId[selectedVersion.id] ?? "마크다운 원문을 불러오는 중…"}
                        </pre>
                      </details>
                    </>
                  ) : (
                    <p className="text-sm text-[color:var(--color-text-tertiary)]">
                      선택 가능한 버전이 없습니다.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>본문 수정</CardTitle>
                  <CardDescription>
                    내용을 바꾸려면 새 마크다운을 올리거나 직접 입력합니다. 저장하면 새 버전으로 기록됩니다.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <label
                        htmlFor="knowledge-version-file"
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
                      >
                        파일 선택
                      </label>
                      <input
                        id="knowledge-version-file"
                        type="file"
                        accept=".md,text/markdown,text/plain"
                        onChange={handleFileChange}
                        className="sr-only"
                      />
                      <p className="text-sm text-[color:var(--color-text-tertiary)]">
                        {selectedUploadFileName ?? "선택한 파일이 없습니다."}
                      </p>
                    </div>
                    <textarea
                      value={uploadMarkdown}
                      onChange={(event) => setUploadMarkdown(event.target.value)}
                      className="min-h-[220px] w-full rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-3 font-mono text-xs text-[color:var(--color-text-primary)] outline-none transition-colors placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:var(--color-indigo-accent)]"
                      placeholder="# 수정된 마크다운 원문"
                    />
                    <Button type="button" onClick={() => void handleCreateVersion()} disabled={isUploading || !uploadMarkdown.trim()}>
                      {isUploading ? "저장 중..." : "변경 저장"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {activePanel === "compare" && hasComparePanel && (
          <section
            id="knowledge-detail-panel-compare"
            role="tabpanel"
            aria-labelledby="knowledge-detail-tab-compare"
            className="mt-6 grid gap-6 xl:grid-cols-[0.82fr_1.18fr]"
          >
            <Card>
              <CardHeader>
                <CardTitle>비교 기준 선택</CardTitle>
                <CardDescription>
                  비교할 버전을 먼저 고르면 우측에서 차이만 집중해서 볼 수 있습니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {versions.map((version) => {
                  const href = getKnowledgeDocumentDetailHref(documentId, accountId, {
                    versionId: version.id,
                    projectId: primaryProjectId,
                    returnTo: safeReturnTo,
                  });
                  const isCurrent = document?.currentVersionId === version.id;
                  const isSelected = selectedVersion?.id === version.id;
                  return (
                    <Link
                      key={version.id}
                      href={href}
                      className={`block rounded-lg border px-4 py-3 transition-colors ${
                        isSelected
                          ? "border-[color:var(--color-indigo-brand)] bg-[color:rgba(94,106,210,0.1)]"
                          : "border-[color:var(--color-border-soft)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                          {version.id}
                        </p>
                        {isCurrent && <Badge variant="indigo">기준</Badge>}
                      </div>
                      <p className="mt-2 text-xs text-[color:var(--color-text-tertiary)]">
                        {formatDate(version.createdAt)} · {version.createdBy}
                      </p>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>변경 비교</CardTitle>
                <CardDescription>
                  달라진 부분만 빠르게 확인합니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
                    메타데이터 변경
                  </p>
                  <div className="mt-3 space-y-2">
                    {metadataDiff.map((entry: (typeof metadataDiff)[number]) => (
                      <div
                        key={entry.field}
                        className="rounded-lg border border-[color:var(--color-border-soft)] px-3 py-3 text-sm"
                      >
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                          {getKnowledgeMetadataFieldLabel(entry.field)}
                        </p>
                        <p className="mt-2 text-[color:var(--color-text-secondary)]">
                          현재 작업 기준 버전: {entry.currentValue || "—"}
                        </p>
                        <p className="mt-1 text-[color:var(--color-text-primary)]">
                          선택한 버전: {entry.selectedValue || "—"}
                        </p>
                        <p className="mt-1 text-xs text-[color:var(--color-text-tertiary)]">
                          {entry.changed ? "변경됨" : "변경 없음"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
                    마크다운 변경
                  </p>
                  {markdownDiff ? (
                    <div className="mt-3 rounded-lg border border-[color:var(--color-border-soft)] px-3 py-3 text-sm text-[color:var(--color-text-secondary)]">
                      <p>변경 여부: {markdownDiff.hasChanges ? "있음" : "없음"}</p>
                      <p>현재 작업 기준 버전 줄 수: {markdownDiff.currentLineCount}</p>
                      <p>선택한 버전 줄 수: {markdownDiff.selectedLineCount}</p>
                      <p>현재 작업 기준 버전 글자 수: {markdownDiff.currentCharCount}</p>
                      <p>선택한 버전 글자 수: {markdownDiff.selectedCharCount}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-[color:var(--color-text-tertiary)]">
                      비교 가능한 버전이 없습니다.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {activePanel === "result" && hasResultPanel && (
          <section
            id="knowledge-detail-panel-result"
            role="tabpanel"
            aria-labelledby="knowledge-detail-tab-result"
            className="mt-6 grid gap-6 xl:grid-cols-[0.82fr_1.18fr]"
          >
            <Card>
              <CardHeader>
                <CardTitle>분석 상태</CardTitle>
                <CardDescription>
                  현재 상태와 다음 행동 하나만 먼저 보여줍니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!latestJob ? (
                  <>
                    <p className="text-sm text-[color:var(--color-text-tertiary)]">
                      이 문서에 매달린 ontology 노드가 없어요. vault frontmatter (`/docs`) 또는 빌더 (`/ontology/edit`) 에서 노드를 직접 추가하세요.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Link href="/docs/" className="inline-flex">
                        <Button type="button" size="sm" variant="outline">
                          vault 열기
                        </Button>
                      </Link>
                      <Link href="/ontology/edit/" className="inline-flex">
                        <Button type="button" size="sm" variant="ghost">
                          빌더 열기
                        </Button>
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <JobStatusBadge status={latestJob.status} />
                      <span className="text-xs text-[color:var(--color-text-tertiary)]">
                        시도 {latestJob.attemptCount}/{latestJob.maxAttempts}
                      </span>
                    </div>
                    <p className="text-sm text-[color:var(--color-text-secondary)]">
                      {jobActionState?.helperText}
                    </p>
                    {latestJob.errorCode && (
                      <div className="rounded-lg border border-[color:var(--color-border-soft)] px-3 py-3 text-sm text-[color:var(--color-text-secondary)]">
                        <p>오류 코드: {latestJob.errorCode}</p>
                        <p className="mt-1">오류 메시지: {latestJob.errorMessage || "—"}</p>
                        <p className="mt-1">최근 갱신: {formatDate(latestJob.updatedAt)}</p>
                      </div>
                    )}
                    <details className="rounded-lg border border-[color:var(--color-border-soft)] px-3 py-3">
                      <summary className="cursor-pointer list-none text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                        작업 이력 보기
                      </summary>
                      {selectedVersionJobs.length === 0 ? (
                        <p className="mt-3 text-sm text-[color:var(--color-text-tertiary)]">
                          이 버전에 연결된 분석이 아직 없어요.
                        </p>
                      ) : (
                        <div className="mt-3 space-y-2 border-t border-[color:var(--color-border-soft)] pt-3">
                          {selectedVersionJobs.slice(0, 4).map((job) => (
                            <div
                              key={job.id}
                              className="rounded-lg border border-[color:var(--color-border-soft)] px-3 py-3 text-sm"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-mono text-[11px] text-[color:var(--color-text-primary)]">
                                  {job.id}
                                </p>
                                <JobStatusBadge status={job.status} />
                              </div>
                              <p className="mt-2 text-xs text-[color:var(--color-text-tertiary)]">
                                시도 {job.attemptCount}/{job.maxAttempts} · {formatDate(job.updatedAt)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </details>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>분석 결과와 근거</CardTitle>
                <CardDescription>
                  결과 요약만 먼저 보고, 필요할 때만 펼칩니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {latestOutput ? (
                  <>
                    <div className="rounded-lg border border-[color:var(--color-border-soft)] px-3 py-3">
                      <p className="text-sm text-[color:var(--color-text-primary)]">
                        {latestOutput.summary}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-tertiary)]">
                        <Badge>{latestOutput.provider === "stub" ? "임시 분석기" : latestOutput.provider}</Badge>
                        <Badge>항목 {latestOutput.nodeCount}</Badge>
                        <Badge>연결 {latestOutput.edgeCount}</Badge>
                        <Badge>경고 {latestOutput.warningCount}</Badge>
                      </div>
                    </div>

                    <details className="rounded-lg border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.08)] px-4 py-4">
                      <summary className="cursor-pointer list-none text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                        후보와 근거 펼치기
                      </summary>
                      <div className="mt-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <Info label="요약">{latestOutput.summary}</Info>
                          <Info label="생성 시각">{formatDate(latestOutput.createdAt)}</Info>
                          <Info label="분석기">
                            {latestOutput.provider === "stub" ? "임시 분석기" : latestOutput.provider}
                          </Info>
                          <Info label="분석 버전">{latestOutput.extractorVersion}</Info>
                        </div>
                        <div className="mt-4">
                          <p className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
                            연결 후보
                          </p>
                          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <Info label="프로젝트 후보 수">
                              {String(candidateProjectNodes.length)}
                            </Info>
                            <Info label="도메인 후보 수">
                              {String(candidateDomainNodes.length)}
                            </Info>
                            <Info label="기능 후보 수">
                              {String(candidateCapabilityNodes.length)}
                            </Info>
                            <Info label="요소 후보 수">
                              {String(candidateElementNodes.length)}
                            </Info>
                          </div>
                          {candidateRelatedNodes.length > 0 && (
                            <div className="mt-3">
                              <p className="text-[11px] text-[color:var(--color-text-quaternary)]">
                                관련 개념
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {candidateRelatedNodes.map((node) => (
                                  <Badge key={node.tempId}>{node.title}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="mt-3 space-y-3">
                            {latestOutput.edges.length === 0 ? (
                              <p className="text-sm text-[color:var(--color-text-tertiary)]">
                                아직 연결 후보가 없습니다.
                              </p>
                            ) : (
                              latestOutput.edges.slice(0, 6).map((edge) => (
                                <div
                                  key={edge.tempId}
                                  className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-3"
                                >
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-tertiary)]">
                                    <Badge>{edge.label || edge.type}</Badge>
                                    <Badge>신뢰도 {Math.round(edge.confidence * 100)}%</Badge>
                                  </div>
                                  <p className="mt-3 text-sm text-[color:var(--color-text-primary)]">
                                    {resolveOutputNodeTitle(latestOutput, edge.fromTempId)} →{" "}
                                    {resolveOutputNodeTitle(latestOutput, edge.toTempId)}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                        <div className="mt-4">
                          <p className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
                            항목 후보
                          </p>
                          <div className="mt-3 space-y-3">
                            {latestOutput.nodes.slice(0, 8).map((node) => (
                              <div
                                key={node.tempId}
                                className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-3"
                              >
                                <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-tertiary)]">
                                  <Badge>{resolveNodeKindLabel(node.kind)}</Badge>
                                  <Badge>신뢰도 {Math.round(node.confidence * 100)}%</Badge>
                                  {node.projectIds.map((projectId) => (
                                    <Badge key={`${node.tempId}-${projectId}`}>{projectId}</Badge>
                                  ))}
                                </div>
                                <p className="mt-3 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                                  {node.title}
                                </p>
                                <p className="mt-1 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                                  {node.summary || "요약 없음"}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="mt-4">
                          <p className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
                            근거 발췌
                          </p>
                          <div className="mt-3 space-y-3">
                            {selectedVersionEvidence.length === 0 ? (
                              <p className="text-sm text-[color:var(--color-text-tertiary)]">
                                표시할 근거가 없습니다.
                              </p>
                            ) : (
                              selectedVersionEvidence.slice(0, 6).map((entry) => (
                                <div
                                  key={entry.id}
                                  className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-3"
                                >
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-tertiary)]">
                                    <Badge>근거 {entry.id}</Badge>
                                    <Badge>범위 {entry.charStart}-{entry.charEnd}</Badge>
                                  </div>
                                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[color:var(--color-text-primary)]">
                                    {entry.excerpt || "발췌 텍스트가 없습니다."}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </details>
                  </>
                ) : (
                  <p className="text-sm text-[color:var(--color-text-tertiary)]">
                    이 문서에 매달린 ontology 노드가 없습니다.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {/* 검수 → 결과 흐름 closure — 이 문서가 어떤 ontology 노드의 evidence
            로 반영되었는지. 매치 0 이면 자체 숨김. */}
        {documentId ? (
          <DocumentOntologyEvidenceSection
            accountId={accountId}
            documentId={documentId}
          />
        ) : null}
      </div>
    </main>
  );
}

// Fire 4 — Info / PanelButton 분리:
//   src/views/knowledge-document-detail/ui/parts/Info.tsx
//   src/views/knowledge-document-detail/ui/parts/PanelButton.tsx

// Fire 4 — JobStatusBadge 분리: src/views/knowledge-document-detail/ui/parts/JobStatusBadge.tsx

// Fire 4 — labels 분리: src/views/knowledge-document-detail/ui/parts/labels.ts

export function KnowledgeDocumentDetailPage(props: Props) {
  return (
    <PermissionGate>
      <DetailContent {...props} />
    </PermissionGate>
  );
}
