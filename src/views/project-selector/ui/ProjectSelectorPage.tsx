"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, FolderKanban, Shield } from "lucide-react";
import { useScopedAccountAccess } from "@/features/account-scope";
import { useTaxonomy } from "@/features/taxonomy";
import {
  getKnowledgeDocumentListHref,
  getKnowledgeDocumentNewHref,
} from "@/entities/knowledge-document";
import {
  getProjectDetailHref,
  getTopologyProjectHref,
  type Project,
} from "@/entities/project";
import { ProjectQuickCreatePanel } from "@/features/project-quick-create";
import { useProjectMutations, useProjects } from "@/features/project-data-source";
import { downloadProjectsCsv } from "@/features/project-export";
import { useKnowledgePublicNodes } from "@/entities/knowledge-graph";
import { PublicAccountMenu } from "@/widgets/account-menu";
import { WorkspaceOntologyStrip } from "@/widgets/workspace-ontology-strip";
import {
  ACCOUNT_QUERY_KEY,
} from "@/shared/lib/account-scope";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui";
import { useDocumentTitle } from "@/shared/lib/use-document-title";

const PROJECT_LIST_PAGE_SIZE = 60;
const PROJECT_LIST_LIMIT_QUERY_KEY = "limit";
const PROJECT_LIST_QUERY_KEY = "q";
const PROJECT_LIST_CATEGORY_QUERY_KEY = "cat";
const PROJECT_LIST_STATUS_QUERY_KEY = "st";

function parseProjectListLimit(raw: string | null) {
  if (!raw) return PROJECT_LIST_PAGE_SIZE;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return PROJECT_LIST_PAGE_SIZE;
  return Math.max(PROJECT_LIST_PAGE_SIZE, Math.floor(parsed));
}

function matchesProject(project: Project, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [
    project.name,
    project.slug,
    project.description,
    ...(project.tags ?? []),
    ...(project.stack ?? []),
  ].some((value) => value?.toLowerCase().includes(normalized));
}

function matchesCategory(project: Project, category: string | null) {
  if (!category) return true;
  return project.category === category;
}

function matchesStatus(project: Project, status: string | null) {
  if (!status) return true;
  return project.status === status;
}

export function ProjectSelectorPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const accountId = null;
  // 로그인 사용자가 ?account= 없이 진입하면 본인 워크스페이스로 자동 스코프 —
  const activeContainerName: string | null = null;
  const returnTo = searchParams.get("returnTo");
  const scopedAccess = useScopedAccountAccess();
  const { categoryLabel, statusLabel, categories, statuses } = useTaxonomy();
  const isSignedIn = scopedAccess.kind !== "guest" && scopedAccess.kind !== "loading";
  // 진실원 모드 (local/cloud/static) — local 모드는 vault 가 활성화돼 있어
  // 비로그인이라도 mutation 가능. static 만 read-only.
  const projectMutations = useProjectMutations();
  const canMutateProjects = projectMutations.canCreate;
  const { projects } = useProjects(accountId);
  const [accountName, setAccountName] = useState<string | null>(null);
  const query = searchParams.get(PROJECT_LIST_QUERY_KEY) ?? "";
  const selectedCategory = searchParams.get(PROJECT_LIST_CATEGORY_QUERY_KEY);
  const selectedStatus = searchParams.get(PROJECT_LIST_STATUS_QUERY_KEY);
  const visibleCount = parseProjectListLimit(
    searchParams.get(PROJECT_LIST_LIMIT_QUERY_KEY),
  );
  // P1-5 — 탭·검색 컨텍스트. 컨테이너·계정 이름이 겹치면 Set dedup.
  // 페이지 메타 타이틀("프로젝트 · oh-my-ontology")과 동일한 첫 어휘를 사용해
  // 정적 메타와 동적 갱신 사이에 flicker 가 보이지 않게 한다.
  useDocumentTitle(
    Array.from(
      new Set(
        ["프로젝트", activeContainerName, accountName, "oh-my-ontology"].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    ).join(" · ") || null,
  );

  // ontology nodes — 카드별 count badge 데이터. 부모 한 번 hook + count map
  // (1994 카드 각자 subscribe 회피). 권한 없으면 빈 배열, badge 자동 숨김.
  const ontologyNodes = useKnowledgePublicNodes(accountId);
  const ontologyCountBySlug = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of ontologyNodes) {
      if (node.kind === "document" || node.kind === "project") continue;
      for (const slug of node.projectIds) {
        map.set(slug, (map.get(slug) ?? 0) + 1);
      }
    }
    return map;
  }, [ontologyNodes]);

  // single-user 모드: account 이름 fetch 안 함.

  const accountDisplayName = accountId ? accountName ?? accountId : null;

  const filteredProjects = useMemo(
    () =>
      projects
        .filter(
          (project) =>
            matchesProject(project, query) &&
            matchesCategory(project, selectedCategory) &&
            matchesStatus(project, selectedStatus),
        )
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    [projects, query, selectedCategory, selectedStatus],
  );
  const visibleProjects = filteredProjects.slice(0, visibleCount);
  const hasMoreProjects = visibleCount < filteredProjects.length;
  const hasActiveFilter = Boolean(
    query.trim() || selectedCategory || selectedStatus,
  );
  // 카테고리·상태별 카운트 — 칩 옆에 N 으로 노출해 사용자가 어느 필터가
  // 의미 있는지 한눈에 본다 (현재 query 와 다른 axis 필터까지 적용한 결과).
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of projects) {
      if (!matchesProject(project, query)) continue;
      if (!matchesStatus(project, selectedStatus)) continue;
      counts.set(project.category, (counts.get(project.category) ?? 0) + 1);
    }
    return counts;
  }, [projects, query, selectedStatus]);
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of projects) {
      if (!matchesProject(project, query)) continue;
      if (!matchesCategory(project, selectedCategory)) continue;
      counts.set(project.status, (counts.get(project.status) ?? 0) + 1);
    }
    return counts;
  }, [projects, query, selectedCategory]);

  const loginHref = "/login";
  const signupHref = "/signup";
  const overviewHref = "/";
  const knowledgeDocumentsHref = getKnowledgeDocumentListHref(accountId);
  const replaceVisibleLimit = useCallback(
    (nextLimit: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextLimit && nextLimit > PROJECT_LIST_PAGE_SIZE) {
        params.set(PROJECT_LIST_LIMIT_QUERY_KEY, String(nextLimit));
      } else {
        params.delete(PROJECT_LIST_LIMIT_QUERY_KEY);
      }
      const nextSearch = params.toString();
      router.replace(`${pathname}${nextSearch ? `?${nextSearch}` : ""}`, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );
  const replaceQuery = useCallback(
    (nextQuery: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete(PROJECT_LIST_LIMIT_QUERY_KEY);
      const trimmedQuery = nextQuery.trim();
      if (trimmedQuery) {
        params.set(PROJECT_LIST_QUERY_KEY, trimmedQuery);
      } else {
        params.delete(PROJECT_LIST_QUERY_KEY);
      }
      const nextSearch = params.toString();
      router.replace(`${pathname}${nextSearch ? `?${nextSearch}` : ""}`, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );
  const replaceFilter = useCallback(
    (key: string, nextValue: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete(PROJECT_LIST_LIMIT_QUERY_KEY);
      if (nextValue) {
        params.set(key, nextValue);
      } else {
        params.delete(key);
      }
      const nextSearch = params.toString();
      router.replace(`${pathname}${nextSearch ? `?${nextSearch}` : ""}`, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );
  const clearAllFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(PROJECT_LIST_QUERY_KEY);
    params.delete(PROJECT_LIST_CATEGORY_QUERY_KEY);
    params.delete(PROJECT_LIST_STATUS_QUERY_KEY);
    params.delete(PROJECT_LIST_LIMIT_QUERY_KEY);
    const nextSearch = params.toString();
    router.replace(`${pathname}${nextSearch ? `?${nextSearch}` : ""}`, {
      scroll: false,
    });
  }, [pathname, router, searchParams]);
  const getPostCreateHref = (project: { slug: string; name: string }) =>
    getKnowledgeDocumentNewHref(accountId, {
      projectId: project.slug,
      returnTo: returnTo || getProjectDetailHref(project.slug, accountId),
      title: `${project.name} 명세`,
    });

  if (scopedAccess.kind === "loading") {
    // audit A4 — 이전엔 빈 main + aria-hidden="true" 라 스크린 리더가 페이지를
    // 통째 무시. role=status + sr-only 텍스트로 로딩 안내를 명시.
    return (
      <main className="min-h-screen bg-[color:var(--color-canvas)]">
        <div role="status" aria-live="polite" className="sr-only">
          워크스페이스를 확인하고 있어요…
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)] px-5 py-6 md:px-10 md:py-14">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center justify-end gap-3">
          <Link
            href={overviewHref}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-[color:rgba(224,196,140,0.4)] bg-[color:rgba(224,196,140,0.08)] px-4 text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(224,196,140,0.6)] hover:bg-[color:rgba(224,196,140,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(224,196,140,0.5)]"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            워크스페이스 지도
          </Link>
          <PublicAccountMenu
            accountId={accountId}
            accountLabel={accountDisplayName}
          />
        </div>

        {/* 헤더 압축 — 큰 rounded panel 의 280px 빈공간 제거. eyebrow + 작은
            제목 + 카운트 + 컨테이너 selector 를 한 줄로 정렬해 위 공간을
            줄이고, 필터 행이 자연스럽게 따라오게 한다. */}
        <header className="flex flex-col gap-3 border-b border-[color:var(--color-border-soft)] pb-5 md:flex-row md:items-end md:justify-between md:gap-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              프로젝트 목록
            </p>
            <div className="mt-1 flex items-baseline gap-3">
              <h1 className="text-[32px] font-[var(--font-weight-signature)] leading-tight tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)] md:text-3xl">
                프로젝트
              </h1>
              {projects.length > 0 ? (
                <span className="font-mono text-[12px] text-[color:var(--color-text-quaternary)]">
                  {hasActiveFilter
                    ? `${filteredProjects.length} / ${projects.length}`
                    : `${projects.length}개`}
                </span>
              ) : null}
            </div>
          </div>
        </header>

        {/* 워크스페이스 ontology 한 줄 strip — 노드 카운트 + stub 강조.
            매치 0 자동 숨김. 공개 surface 가벼운 가시. */}
        <WorkspaceOntologyStrip accountId={accountId} />

        {/* 검색 + 단계·상태 칩 — 1,979 프로젝트를 단계(작업중/예정) 와
            상태(개발중/운영중/기획/아이디어) 로 즉시 좁힐 수 있게. 칩에
            카운트를 합성해 사용자가 어느 필터가 의미 있는지 한눈에 본다. */}
        <section className="mt-6 flex flex-col gap-4">
          <div className="relative">
            <input
              name="project-selector-search"
              value={query}
              onChange={(event) => {
                replaceQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  replaceQuery("");
                }
              }}
              placeholder="이름, 설명, 태그로 검색…"
              className="h-11 w-full rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 text-sm text-[color:var(--color-text-primary)] outline-none transition-colors placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:var(--color-indigo-accent)]"
              type="search"
              autoComplete="off"
              aria-label="프로젝트 검색"
            />
          </div>
          {(categories.length > 0 || statuses.length > 0) ? (
            <div className="flex flex-col gap-3">
              {categories.length > 0 ? (
                <FilterChipRow
                  label="단계"
                  options={categories.map((c) => ({
                    value: c.id,
                    label: c.label || c.id,
                    count: categoryCounts.get(c.id) ?? 0,
                  }))}
                  selected={selectedCategory}
                  onSelect={(v) =>
                    replaceFilter(PROJECT_LIST_CATEGORY_QUERY_KEY, v)
                  }
                />
              ) : null}
              {statuses.length > 0 ? (
                <FilterChipRow
                  label="상태"
                  options={statuses.map((s) => ({
                    value: s.id,
                    label: s.label || s.id,
                    count: statusCounts.get(s.id) ?? 0,
                  }))}
                  selected={selectedStatus}
                  onSelect={(v) =>
                    replaceFilter(PROJECT_LIST_STATUS_QUERY_KEY, v)
                  }
                />
              ) : null}
              {hasActiveFilter ? (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="self-start font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
                >
                  필터 모두 지우기 ×
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="mt-6">
          {filteredProjects.length === 0 ? (
            <Card className="rounded-[24px]">
              <CardHeader>
                <CardTitle>
                  {projects.length === 0
                    ? activeContainerName
                      ? `"${activeContainerName}" 컨테이너에 프로젝트가 없습니다`
                      : "프로젝트가 없습니다"
                    : "검색 결과가 없습니다"}
                </CardTitle>
                <CardDescription>
                  {projects.length === 0
                    ? activeContainerName
                      ? canMutateProjects
                        ? "이 컨테이너는 비어 있습니다. 마이그레이션 또는 직접 생성으로 채워보세요."
                        : "이 컨테이너는 아직 비어 있습니다. 다른 컨테이너로 전환해보세요."
                      : canMutateProjects
                        ? "첫 프로젝트를 만들면 바로 들어갑니다."
                        : "아직 볼 프로젝트가 없습니다."
                    : "다른 이름으로 다시 찾아보세요."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {projects.length === 0 && canMutateProjects ? (
                  <>
                    <div className="w-full">
                        <ProjectQuickCreatePanel
                          accountId={accountId}
                          projects={projects}
                          categories={categories}
                          statuses={statuses}
                          initiallyOpen
                        submitLabel="만들고 첫 문서 쓰기"
                        onCreated={(project) => {
                          const target = getPostCreateHref(project);
                          if (returnTo) {
                            router.replace(target);
                            return;
                          }
                          router.push(target);
                        }}
                      />
                    </div>
                  </>
                ) : null}
                {projects.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      replaceQuery("");
                    }}
                  >
                    검색 지우기
                  </Button>
                ) : !isSignedIn ? (
                  <>
                    <Link href={loginHref} className="inline-flex">
                      <Button type="button" variant="outline">
                        로그인
                      </Button>
                    </Link>
                    <Link href={signupHref} className="inline-flex">
                      <Button type="button">
                        회원가입
                      </Button>
                    </Link>
                  </>
                ) : !canMutateProjects ? (
                  // 로그인 + 멤버이지만 편집 권한 없음 + 0 프로젝트 = dead-end 회피.
                  // overview (전체 토폴로지) 로 회귀 동선 노출.
                  <Link href={overviewHref} className="inline-flex">
                    <Button type="button" variant="outline">
                      워크스페이스 지도로
                    </Button>
                  </Link>
                ) : null}
                {projects.length > 0 ? (
                  <Link href={overviewHref} className="inline-flex">
                    <Button type="button" variant="ghost">
                      전체 토폴로지
                    </Button>
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-3 text-xs text-[color:var(--color-text-tertiary)]">
                <span>
                  {filteredProjects.length}개 중 {visibleProjects.length}개 표시
                </span>
                {hasMoreProjects ? (
                  <span className="font-mono uppercase tracking-[0.1em]">
                    필요할 때 더 불러오기
                  </span>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleProjects.map((project) => (
                <article key={project.slug} className="relative h-full">
                  {/* 카드 전체가 프로젝트 상세로 가는 stretched link.
                      after pseudo 가 article 전체를 덮어 어디를 탭해도 동작.
                      "토폴로지 보기" 는 relative z-10 으로 link overlay
                      위로 올라가 별도 액션 보존. */}
                  <Card className="flex h-full flex-col rounded-[24px] transition-colors hover:border-[color:rgba(94,106,210,0.28)]">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <Link
                          href={getProjectDetailHref(project.slug, accountId)}
                          prefetch={false}
                          aria-label={`${project.name} 상세로 가기`}
                          className="min-w-0 rounded-md after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                        >
                          <CardTitle className="truncate break-keep">{project.name}</CardTitle>
                          <CardDescription className="mt-2 line-clamp-2 break-keep">
                            {project.description || "설명이 아직 없는 프로젝트입니다."}
                          </CardDescription>
                        </Link>
                        <FolderKanban
                          size={18}
                          aria-label="프로젝트"
                          className="shrink-0 text-[color:var(--color-text-tertiary)]"
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col justify-between space-y-4">
                      {/* 카드 내 요약 3 fact. "구분" 은 category (lifecycle
                          phase: 작업중/예정), "상태" 는 status (구체 단계:
                          개발중/운영중/기획/아이디어). 두 축이 서로 겹쳐 보여
                          label 을 "단계 / 상태" 로 명확히 분리. */}
                      <div className="grid grid-cols-3 gap-2 rounded-[18px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-3">
                        <QuickFact label="단계" value={categoryLabel(project.category)} />
                        <QuickFact label="상태" value={statusLabel(project.status)} />
                        <QuickFact label="연결" value={`${project.dependencies.length}개`} />
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 text-sm text-[color:var(--color-text-secondary)]">
                          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                            {project.slug}
                          </span>
                          {(() => {
                            const ontologyCount = ontologyCountBySlug.get(project.slug) ?? 0;
                            if (ontologyCount === 0) return null;
                            return (
                              <span
                                className="shrink-0 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.08)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:rgba(159,170,235,0.95)]"
                                title={`이 프로젝트의 ontology 노드 ${ontologyCount}개`}
                              >
                                Ontology {ontologyCount}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="inline-flex items-center gap-1 break-keep text-[12px] text-[color:var(--color-indigo-accent)]">
                            상세 보기
                            <ArrowRight size={13} aria-hidden="true" />
                          </span>
                          {/* relative z-10 으로 stretched link 위에 떠 있어
                              자체 액션이 동작. prefetch={false} — 데모 slug
                              는 static export 페이지가 없어 자동 prefetch 가
                              404 소음만 만든다. */}
                          <Link
                            href={getTopologyProjectHref(project.slug, accountId)}
                            prefetch={false}
                            className="relative z-10 inline-flex h-8 items-center break-keep rounded-md border border-[color:var(--color-divider)] px-3 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
                          >
                            토폴로지 보기
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </article>
                ))}
              </div>
              {hasMoreProjects ? (
                <div className="mt-6 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      replaceVisibleLimit(
                        Math.min(
                          visibleCount + PROJECT_LIST_PAGE_SIZE,
                          filteredProjects.length,
                        ),
                      )
                    }
                  >
                    더 보기
                    <span className="font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
                      {visibleProjects.length}/{filteredProjects.length}
                    </span>
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>

        {canMutateProjects && projects.length > 0 ? (
          <section className="mt-6">
            <details className="rounded-[20px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                    새 프로젝트 등록
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                    목록 맨 아래에서 새 프로젝트를 빠르게 추가하고 첫 문서로 이동합니다.
                  </p>
                </div>
                <span className="rounded-full border border-[color:var(--color-divider)] px-3 py-1 text-xs text-[color:var(--color-text-secondary)]">
                  폼 열기
                </span>
              </summary>
              <div className="mt-4 border-t border-[color:var(--color-divider)] pt-4">
                <ProjectQuickCreatePanel
                  accountId={accountId}
                  projects={projects}
                  categories={categories}
                  statuses={statuses}
                  submitLabel="만들고 첫 문서 쓰기"
                  onCreated={(project) => {
                    const target = getPostCreateHref(project);
                    if (returnTo) {
                      router.replace(target);
                      return;
                    }
                    router.push(target);
                  }}
                />
              </div>
            </details>
          </section>
        ) : null}

        {canMutateProjects && (
          <section className="mt-8 grid gap-4 md:grid-cols-2">
            {canMutateProjects && (
              <details className="rounded-[20px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]">
                  <div>
                    <p className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                      <Shield size={12} aria-hidden="true" />
                      관리 도구
                    </p>
                  </div>
                  <span className="rounded-full border border-[color:var(--color-divider)] px-3 py-1 text-xs text-[color:var(--color-text-secondary)]">
                    펼치기
                  </span>
                </summary>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-[color:var(--color-divider)] pt-4">
                  <Link href={knowledgeDocumentsHref} className="inline-flex">
                    <Button type="button" variant="primary">
                      문서 목록
                    </Button>
                  </Link>
                  {/* CSV 백업 — 현재 목록(검색 필터 적용 전 전체) 을 다운로드.
                      import 과 동일 스키마라 round-trip 가능. */}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      const stamp = new Date().toISOString().slice(0, 10);
                      downloadProjectsCsv(
                        projects,
                        `demo-projects-${accountId ?? "workspace"}-${stamp}.csv`,
                      );
                    }}
                  >
                    CSV 내보내기 ({projects.length})
                  </Button>
                </div>
              </details>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function QuickFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
        {label}
      </p>
      <p className="mt-1 text-sm text-[color:var(--color-text-primary)]">{value}</p>
    </div>
  );
}

interface FilterChipOption {
  value: string;
  label: string;
  count: number;
}

interface FilterChipRowProps {
  label: string;
  options: ReadonlyArray<FilterChipOption>;
  selected: string | null;
  onSelect: (value: string | null) => void;
}

// 단계·상태 칩 1줄. 카운트 0 인 옵션은 숨겨 노이즈 제거. 같은 값을 다시
// 누르면 해제(toggle) — 별도 "모두" 버튼 없이 직관 동작.
//
// 모바일(<768)은 한 줄 가로 스크롤(토스 결), md+ 는 wrap. 스크롤 영역
// 안에 라벨까지 같이 두면 라벨이 같이 밀려 사라지므로, 라벨은 좌측에
// 고정해 두고 칩만 스크롤되게 한다.
function FilterChipRow({ label, options, selected, onSelect }: FilterChipRowProps) {
  const visible = options.filter((o) => o.count > 0 || o.value === selected);
  if (visible.length === 0) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1.5 w-10 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {label}
      </span>
      <div className="-mr-4 flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto pr-4 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] md:mr-0 md:flex-wrap md:overflow-visible md:pr-0">
        {visible.map((option) => {
          const active = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(active ? null : option.value)}
              className={
                active
                  ? "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-[color:rgba(94,106,210,0.45)] bg-[color:rgba(94,106,210,0.14)] px-3 text-[12px] text-[color:var(--color-text-primary)]"
                  : "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
              }
              aria-pressed={active}
            >
              <span>{option.label}</span>
              <span className="font-mono text-[10px] tabular-nums text-[color:var(--color-text-quaternary)]">
                {option.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
