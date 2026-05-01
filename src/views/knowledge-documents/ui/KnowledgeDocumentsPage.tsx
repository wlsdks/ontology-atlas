"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, FilePlus2, Search, SlidersHorizontal } from "lucide-react";
import { PermissionGate } from "@/features/permissions";
import { useGlobalAdmin } from "@/features/permissions";
import {
  KNOWLEDGE_DOCUMENT_KIND_OPTIONS,
  KNOWLEDGE_DOCUMENT_STATUS_OPTIONS,
  getKnowledgeDocumentDetailHref,
  getKnowledgeDocumentKindLabel,
  getKnowledgeDocumentNewHref,
  getKnowledgeDocumentStatusLabel,
  subscribeKnowledgeDocuments,
  type KnowledgeDocument,
} from "@/entities/knowledge-document";
import {
  getKnowledgeJobStatusLabel,
  KNOWLEDGE_JOB_STATUS_OPTIONS,
} from "@/entities/knowledge-job";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui";
import { formatDate } from "@/shared/lib/format-date";
import { useKnowledgePublicNodes } from "@/entities/knowledge-graph";
import { MountedGlobalSearch } from "@/widgets/global-search";
import { OperationsNav } from "@/widgets/operations-nav";

const KNOWLEDGE_DOCUMENT_PAGE_SIZE = 60;
const KNOWLEDGE_DOCUMENT_LIMIT_QUERY_KEY = "limit";

type KnowledgeDocumentFilters = {
  project: string;
  kind: string;
  docStatus: string;
  jobStatus: string;
  query: string;
};

function parseKnowledgeDocumentLimit(raw: string | null) {
  if (!raw) return KNOWLEDGE_DOCUMENT_PAGE_SIZE;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return KNOWLEDGE_DOCUMENT_PAGE_SIZE;
  return Math.max(KNOWLEDGE_DOCUMENT_PAGE_SIZE, Math.floor(parsed));
}

function DocumentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = null;
  const { user } = useGlobalAdmin();
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const visibleCount = parseKnowledgeDocumentLimit(
    searchParams.get(KNOWLEDGE_DOCUMENT_LIMIT_QUERY_KEY),
  );

  useEffect(() => {
    const unsubscribe = subscribeKnowledgeDocuments(
      accountId,
      setDocuments,
      (error) => setLoadError(error.message),
    );
    return () => unsubscribe();
  }, [accountId]);

  const filters = useMemo(
    () => ({
      project: searchParams.get("project") ?? "",
      kind: searchParams.get("kind") ?? "",
      docStatus: searchParams.get("docStatus") ?? "",
      jobStatus: searchParams.get("jobStatus") ?? "",
      query: searchParams.get("q") ?? "",
    }),
    [searchParams],
  );
  const hasActiveFilters = Boolean(
    filters.project ||
      filters.kind ||
      filters.docStatus ||
      filters.jobStatus ||
      filters.query,
  );
  const [filtersOpen, setFiltersOpen] = useState(hasActiveFilters);
  const isFilterPanelOpen = filtersOpen || hasActiveFilters;

  const visibleDocuments = useMemo(() => {
    return documents.filter((document) => {
      if (filters.project && !document.projectIds.includes(filters.project))
        return false;
      if (filters.kind && document.kind !== filters.kind) return false;
      if (filters.docStatus && document.status !== filters.docStatus)
        return false;
      if (
        filters.jobStatus &&
        (document.latestJobStatus ?? "none") !== filters.jobStatus
      ) {
        return false;
      }
      if (filters.query) {
        const haystack =
          `${document.title} ${document.kind} ${document.projectIds.join(" ")}`.toLowerCase();
        if (!haystack.includes(filters.query.toLowerCase())) return false;
      }
      return true;
    });
  }, [documents, filters]);
  const visibleDocumentRows = visibleDocuments.slice(0, visibleCount);
  const hasMoreDocuments = visibleCount < visibleDocuments.length;

  // ontology evidence count by documentId — 어떤 문서가 ontology 에 잘 기여하나.
  // 부모 1 fetch + count map (각 카드 / 행 각자 subscribe 회피).
  const ontologyNodes = useKnowledgePublicNodes(accountId);
  const ontologyCountByDocId = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of ontologyNodes) {
      if (node.kind === "document" || node.kind === "project") continue;
      for (const docId of node.evidenceIds) {
        map.set(docId, (map.get(docId) ?? 0) + 1);
      }
    }
    return map;
  }, [ontologyNodes]);

  const summary = useMemo(
    () => ({
      total: documents.length,
      success: documents.filter(
        (document) => document.latestJobStatus === "succeeded",
      ).length,
      failed: documents.filter(
        (document) => document.latestJobStatus === "failed",
      ).length,
      draft: documents.filter((document) => document.status === "draft").length,
    }),
    [documents],
  );
  const safeReturnTo =
    searchParams.get("returnTo") ??
    (searchParams.toString()
      ? `/knowledge/documents/?${searchParams.toString()}`
      : "/knowledge/documents/");

  const replaceListUrl = useCallback(
    (params: URLSearchParams) => {
      const query = params.toString();
      router.replace(
        query ? `/knowledge/documents/?${query}` : "/knowledge/documents/",
        { scroll: false },
      );
    },
    [router],
  );

  const updateFilter = useCallback(
    (patch: Partial<KnowledgeDocumentFilters>) => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete(KNOWLEDGE_DOCUMENT_LIMIT_QUERY_KEY);
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      replaceListUrl(next);
    },
    [replaceListUrl, searchParams],
  );

  const updateVisibleLimit = useCallback(
    (nextLimit: number | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (nextLimit && nextLimit > KNOWLEDGE_DOCUMENT_PAGE_SIZE) {
        next.set(KNOWLEDGE_DOCUMENT_LIMIT_QUERY_KEY, String(nextLimit));
      } else {
        next.delete(KNOWLEDGE_DOCUMENT_LIMIT_QUERY_KEY);
      }
      replaceListUrl(next);
    },
    [replaceListUrl, searchParams],
  );

  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)]">
      <h1 className="sr-only">문서 목록</h1>
      <OperationsNav />
      {/* ⌘K 글로벌 검색 — accountId 만 받고 ontology + documents 자체 구독.
          기본 동작 = ontology 노드는 /ontology 점프, document 는 view 페이지 점프. */}
      <MountedGlobalSearch accountId={accountId} returnTo="/knowledge/documents/" />
      <div className="mx-auto max-w-6xl px-5 py-6 md:px-12 md:py-10">
        {/* audit N3 — 이전엔 md:hidden 으로 데스크톱 사용자가 breadcrumb 없이
            OperationsNav 만 의존. 모든 viewport 에서 노출. */}
        <Link
          href={"/knowledge/"}
          className="inline-flex items-center gap-1.5 break-keep text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          <ArrowLeft size={14} />
          문서
        </Link>
        <header className="mt-3 flex flex-col gap-4 md:mt-0 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="break-keep text-[28px] font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)] md:text-4xl">
              문서 목록
            </h1>
            <p className="mt-3 max-w-xl break-keep text-sm leading-6 text-[color:var(--color-text-secondary)]">
              지금 손댈 문서만 먼저 보여줍니다.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2 md:justify-end">
            {/* "문서 홈" 버튼은 BottomTabBar / OperationsNav 의 "문서" 탭이
                이미 같은 destination 을 노출해 모바일·데스크톱 모두 중복.
                드랍해 헤더를 슬림하게. */}
            <Link
              href={getKnowledgeDocumentNewHref(accountId, {
                projectId: filters.project || undefined,
                returnTo: safeReturnTo,
              })}
              className="inline-flex"
            >
              <Button size="sm" type="button">
                <FilePlus2 size={14} />
                새 문서 올리기
              </Button>
            </Link>
          </div>
        </header>

        <section className="mt-8">
          {!loadError && !accountId ? (
            <Card className="mb-4">
              <CardContent className="py-4 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                <p className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  공개 기본 데이터
                </p>
                <p className="mt-1">
                  현재는 데모 문서 전체를 보고 있습니다. 개인 작업 공간을 고르면
                  해당 문서만 좁혀 볼 수 있습니다.
                </p>
              </CardContent>
            </Card>
          ) : null}
          {!loadError ? (
          <Card className="mb-6">
            <CardContent className="space-y-4 py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                    문서 상태
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <OverviewPill label="전체" value={summary.total} />
                    <OverviewPill
                      label="확인 필요"
                      value={summary.failed}
                      tone="indigo"
                      icon={<AlertCircle size={13} />}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFiltersOpen((current) => !current)}
                    aria-expanded={isFilterPanelOpen}
                    aria-controls="knowledge-document-filter-panel"
                  >
                    <SlidersHorizontal size={14} />
                    {isFilterPanelOpen ? "필터 접기" : "필터 열기"}
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-[color:var(--color-border-soft)] pt-4 text-xs text-[color:var(--color-text-tertiary)]">
                <Badge>결과 {visibleDocuments.length}건</Badge>
                <Badge>프로젝트 {filters.project || "전체"}</Badge>
                {(filters.kind || filters.docStatus || filters.jobStatus || filters.query) && (
                  <Badge>필터 적용됨</Badge>
                )}
              </div>
              {isFilterPanelOpen && (
                <div id="knowledge-document-filter-panel" className="grid gap-3 border-t border-[color:var(--color-border-soft)] pt-4 md:grid-cols-5">
                  <Field id="knowledge-documents-project-filter" label="프로젝트">
                    <input
                      id="knowledge-documents-project-filter"
                      name="project"
                      value={filters.project}
                      onChange={(event) =>
                        updateFilter({ project: event.target.value })
                      }
                      placeholder="reactor…"
                      className={inputClassName}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>
                  <Field id="knowledge-documents-kind-filter" label="문서 유형">
                    <select
                      id="knowledge-documents-kind-filter"
                      name="kind"
                      value={filters.kind}
                      onChange={(event) => updateFilter({ kind: event.target.value })}
                      className={inputClassName}
                    >
                      <option value="">전체 문서 유형</option>
                      {KNOWLEDGE_DOCUMENT_KIND_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id="knowledge-documents-status-filter" label="문서 상태">
                    <select
                      id="knowledge-documents-status-filter"
                      name="docStatus"
                      value={filters.docStatus}
                      onChange={(event) =>
                        updateFilter({ docStatus: event.target.value })
                      }
                      className={inputClassName}
                    >
                      <option value="">전체 문서 상태</option>
                      {KNOWLEDGE_DOCUMENT_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id="knowledge-documents-job-filter" label="분석 상태">
                    <select
                      id="knowledge-documents-job-filter"
                      name="jobStatus"
                      value={filters.jobStatus}
                      onChange={(event) =>
                        updateFilter({ jobStatus: event.target.value })
                      }
                      className={inputClassName}
                    >
                      <option value="">전체 분석 상태</option>
                      {KNOWLEDGE_JOB_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id="knowledge-documents-search-filter" label="검색">
                    <div className="relative">
                      <Search
                        size={14}
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-text-quaternary)]"
                      />
                      <input
                        id="knowledge-documents-search-filter"
                        name="q"
                        type="search"
                        value={filters.query}
                        onChange={(event) =>
                          updateFilter({ query: event.target.value })
                        }
                        placeholder="인증, 정책, IAM…"
                        className={`${inputClassName} pl-9`}
                        autoComplete="off"
                      />
                    </div>
                  </Field>
                </div>
              )}
            </CardContent>
          </Card>
          ) : null}

          {loadError ? (
            <div role="alert" aria-live="assertive">
              <Card className="border-[color:rgba(229,72,77,0.32)]">
                <CardHeader>
                  <CardTitle>불러오지 못했습니다</CardTitle>
                  <CardDescription className="text-[color:var(--color-status-danger)]">
                    {loadError}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm leading-6 text-[color:var(--color-text-secondary)]">
                    로컬 개발 환경에서는 데이터 프록시가 꺼져 있으면 문서 목록을 읽을 수 없습니다. <code>pnpm dev:admin-proxy</code> 실행 후 다시 시도하세요.
                  </p>
                  <Button type="button" variant="outline" onClick={() => router.refresh()}>
                    재시도
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : documents.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{accountId ? "문서가 없습니다" : "작업 공간을 고르세요"}</CardTitle>
                <CardDescription>
                  {accountId
                    ? "첫 문서를 등록하면 바로 이어집니다."
                    : "상단에서 작업 공간을 고르면 문서를 바로 볼 수 있습니다."}
                </CardDescription>
              </CardHeader>
              {accountId ? (
                <CardContent>
                  <Link
                    href={getKnowledgeDocumentNewHref(accountId, {
                      projectId: filters.project || undefined,
                      returnTo: safeReturnTo,
                    })}
                    className="inline-flex"
                  >
                    <Button type="button">새 문서 등록</Button>
                  </Link>
                </CardContent>
              ) : null}
            </Card>
          ) : visibleDocuments.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>필터 결과가 없습니다</CardTitle>
                <CardDescription>
                  일치하는 문서가 없습니다. 필터를 비우고 다시 보세요.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    router.replace(
                      "/knowledge/documents/",
                    )
                  }
                >
                  필터 초기화
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-3 md:hidden">
                {visibleDocumentRows.map((document) => (
                  <Card key={document.id}>
                    <CardContent className="space-y-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={getKnowledgeDocumentDetailHref(document.id, accountId, {
                              projectId: filters.project || undefined,
                              returnTo: safeReturnTo,
                            })}
                            className="block"
                          >
                            <p className="text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                              {document.title}
                            </p>
                            <p className="mt-1 text-xs text-[color:var(--color-text-tertiary)]">
                              {getKnowledgeDocumentKindLabel(document.kind)}
                            </p>
                          </Link>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge
                            variant={
                              document.latestJobStatus === "failed" ? "indigo" : "default"
                            }
                          >
                            {getKnowledgeJobStatusLabel(document.latestJobStatus)}
                          </Badge>
                          {(() => {
                            const c = ontologyCountByDocId.get(document.id) ?? 0;
                            if (c === 0) return null;
                            return (
                              <span
                                className="rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.08)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:rgba(159,170,235,0.95)]"
                                title={`이 문서가 근거인 ontology 노드 ${c}개`}
                              >
                                Ontology {c}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <InfoBlock label="문서 상태">
                          {getKnowledgeDocumentStatusLabel(document.status)}
                        </InfoBlock>
                        <InfoBlock label="업데이트">
                          {formatDate(document.updatedAt)}
                        </InfoBlock>
                        <InfoBlock label="연결 프로젝트" className="col-span-2">
                          {document.projectIds.join(", ") || "프로젝트 미연결"}
                        </InfoBlock>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={getKnowledgeDocumentDetailHref(document.id, accountId, {
                            projectId: filters.project || undefined,
                            returnTo: safeReturnTo,
                          })}
                          className="inline-flex"
                        >
                          <Button size="sm" type="button">
                            문서 상세
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-2xl border border-[color:var(--color-border-soft)] md:block">
                <table className="w-full border-collapse text-left">
                <thead className="bg-[color:var(--color-overlay-1)]">
                  <tr className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                    <th className="px-4 py-3">문서</th>
                    <th className="px-4 py-3">프로젝트</th>
                    <th className="px-4 py-3">상태</th>
                    <th className="px-4 py-3">최근 분석 상태</th>
                    <th className="px-4 py-3">Ontology</th>
                    <th className="px-4 py-3">업데이트</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDocumentRows.map((document) => (
                    <tr
                      key={document.id}
                      className="border-t border-[color:var(--color-overlay-2)] text-sm text-[color:var(--color-text-secondary)]"
                    >
                      <td className="px-4 py-4">
                        <Link
                          href={getKnowledgeDocumentDetailHref(document.id, accountId, {
                            projectId: filters.project || undefined,
                            returnTo: safeReturnTo,
                          })}
                          className="block"
                        >
                          <p className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                            {document.title}
                          </p>
                          <p className="mt-1 text-xs text-[color:var(--color-text-tertiary)]">
                            {getKnowledgeDocumentKindLabel(document.kind)}
                          </p>
                        </Link>
                      </td>
                      <td className="px-4 py-4">{document.projectIds.join(", ") || "-"}</td>
                      <td className="px-4 py-4">
                        <Badge variant="default">
                          {getKnowledgeDocumentStatusLabel(document.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Badge
                          variant={
                            document.latestJobStatus === "failed"
                              ? "indigo"
                              : "default"
                          }
                        >
                          {getKnowledgeJobStatusLabel(document.latestJobStatus)}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        {(() => {
                          const c = ontologyCountByDocId.get(document.id) ?? 0;
                          if (c === 0) return <span className="text-[color:var(--color-text-quaternary)]">—</span>;
                          return (
                            <span
                              className="rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.08)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:rgba(159,170,235,0.95)]"
                              title={`이 문서가 근거인 ontology 노드 ${c}개`}
                            >
                              {c}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-4 text-xs text-[color:var(--color-text-tertiary)]">
                        {formatDate(document.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
              {hasMoreDocuments ? (
                <div className="mt-5 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      updateVisibleLimit(
                        Math.min(
                          visibleCount + KNOWLEDGE_DOCUMENT_PAGE_SIZE,
                          visibleDocuments.length,
                        ),
                      )
                    }
                  >
                    더 보기
                    <span className="font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
                      {visibleDocumentRows.length}/{visibleDocuments.length}
                    </span>
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function OverviewPill({
  label,
  value,
  tone = "default",
  icon,
}: {
  label: string;
  value: number;
  tone?: "default" | "indigo";
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 ${
        tone === "indigo"
          ? "border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.1)] text-[color:var(--color-text-primary)]"
          : "border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-secondary)]"
      }`}
    >
      {icon && <span className="text-[color:var(--color-text-tertiary)]">{icon}</span>}
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
        {label}
      </span>
      <span className="text-sm font-[var(--font-weight-signature)] tabular-nums text-[color:var(--color-text-primary)]">
        {value}
      </span>
    </div>
  );
}

function InfoBlock({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
        {label}
      </p>
      <p className="mt-2 text-sm text-[color:var(--color-text-primary)]">{children}</p>
    </div>
  );
}

const inputClassName =
  "h-10 rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 text-sm text-[color:var(--color-text-primary)] outline-none transition-colors placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:var(--color-indigo-accent)]";

export function KnowledgeDocumentsPage() {
  return (
    <PermissionGate>
      <DocumentsContent />
    </PermissionGate>
  );
}
