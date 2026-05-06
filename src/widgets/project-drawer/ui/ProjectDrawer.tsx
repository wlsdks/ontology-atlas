"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from "framer-motion";
import { MOTION, SPRING } from "@/shared/motion";
import { ArrowUpRight, BookOpen, ChevronDown, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import {
  buildDocsVaultHref,
  findRelatedDocs,
  vaultManifest,
  type VaultManifest,
} from "@/entities/docs-vault";
import { formatDate } from "@/shared/lib/format-date";
import {
  formatProjectIntegrityIssue,
  getProjectRelationshipMeta,
  getProjectDetailHref,
  getProjectIntegrityIssues,
  ProjectMetaGrid,
  resolveProjectCompletenessInsight,
  resolveProjectFreshnessInsight,
  resolveProjectImpactInsight,
  resolveProjectRelationshipKind,
  type Project,
  type ProjectImpactMode,
} from "@/entities/project";
import { buildOntologyNodeHref } from "@/entities/knowledge-graph";
import { CopyProjectLinkButton } from "@/features/project-share";
import { useTaxonomy } from "@/features/taxonomy";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { PublicQuickActions } from "@/widgets/public-quick-actions";

interface Props {
  project: Project | null;
  allProjects: Project[];
  /** 활성 컨테이너 id — 상세 페이지 URL 에 `?pj=` 로 이어 붙여 컨텍스트 유지. */
  activeProjectId?: string | null;
  impactMode: ProjectImpactMode;
  onChangeImpactMode: (mode: ProjectImpactMode) => void;
  onClose: () => void;
  onSelectProject: (slug: string) => void;
  /** 활성 컨테이너 이름. 헤더에 "Project · {label}" 배지. */
  containerLabel?: string | null;
  /**
   * Layer 0 컨테이너 synthetic project 가 선택됐을 때, "토폴로지 열기" CTA
   * 를 눌러 실제 `?pj=` zoom-in 하기 위한 콜백. 클릭 즉시 진입이 아니라
   * drawer 안에서 2-step 으로 진입시키기 위한 explicit step.
   */
  onEnterContainer?: (slug: string) => void;
}

export function ProjectDrawer({
  project,
  allProjects,
  activeProjectId,
  impactMode,
  onChangeImpactMode,
  onClose,
  onSelectProject,
  containerLabel,
  onEnterContainer,
}: Props) {
  const t = useTranslations("vaultWidgets.projectDrawer");
  const isContainerNode = project?.category === "__container__";
  // Layer 1 drawer 제목에서도 container 이름 prefix 단축. "Demo Reactor · Router"
  // → "Router" (breadcrumb chip 에 이미 컨테이너 맥락 있음).
  const displayName = (() => {
    if (!project) return "";
    const prefix = containerLabel?.trim();
    if (!prefix || isContainerNode) return project.name;
    const sep = `${prefix} · `;
    if (project.name.startsWith(sep)) {
      const rest = project.name.slice(sep.length).trim();
      return rest.length > 0 ? rest : project.name;
    }
    return project.name;
  })();
  const asideRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { categories, statuses, categoryLabel, statusLabel } = useTaxonomy();
  // 모바일 bottom-sheet 스타일: 드래그 핸들 바에서만 아래로 스와이프하면 닫힘.
  // 컨텐츠 영역의 수직 스크롤과 충돌하지 않도록 dragListener=false 로 통제.
  const dragControls = useDragControls();

  useBodyScrollLock(Boolean(project));

  useEffect(() => {
    if (!project) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [project, onClose]);

  // 드로어 오픈 시 포커스를 닫기 버튼으로 이동. 스크린리더·키보드 사용자가
  // 새 컨텍스트에 바로 진입할 수 있게 한다. 닫히면 브라우저 기본 포커스 흐름
  // 으로 돌아간다 (캔버스 pane 이 포커스를 받을 수 있음).
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!project) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const aside = asideRef.current;
    if (!aside) return;
    const closeBtn = aside.querySelector<HTMLButtonElement>(
      `button[aria-label="${t("closeAriaLabel")}"]`,
    );
    closeBtn?.focus();
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, [project, t]);

  useEffect(() => {
    if (!project) return;
    const aside = asideRef.current;
    if (!aside) return;

    const trapHandler = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = Array.from(
        aside.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", trapHandler);
    return () => window.removeEventListener("keydown", trapHandler);
  }, [project]);

  useEffect(() => {
    if (!project) return;
    const handler = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (asideRef.current && asideRef.current.contains(target)) return;
      if (target.closest('[data-interactive-overlay="true"]')) return;
      onClose();
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [project, onClose]);

  useEffect(() => {
    if (!project || !asideRef.current) return;
    asideRef.current.scrollTo({
      top: 0,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [project, reducedMotion]);

  const bySlug = useMemo(
    () => new Map(allProjects.map((candidate) => [candidate.slug, candidate])),
    [allProjects],
  );

  const referencedBy = useMemo(
    () =>
      project
        ? allProjects.filter((candidate) =>
            candidate.dependencies.includes(project.slug),
          )
        : [],
    [allProjects, project],
  );

  const integrityIssues = useMemo(
    () =>
      project
        ? getProjectIntegrityIssues(project, {
            allProjects,
            categoryIds: categories.map((category) => category.id),
            statusIds: statuses.map((status) => status.id),
          })
        : [],
    [allProjects, categories, project, statuses],
  );

  const integrityIssueLabels = useMemo(
    () => integrityIssues.map(formatProjectIntegrityIssue),
    [integrityIssues],
  );

  const missingDependencyIssues = useMemo(
    () =>
      integrityIssues.filter(
        (
          issue,
        ): issue is Extract<
          (typeof integrityIssues)[number],
          { code: "missing-dependency" }
        > => issue.code === "missing-dependency",
      ),
    [integrityIssues],
  );

  const completenessInsight = useMemo(
    () => (project ? resolveProjectCompletenessInsight(project) : null),
    [project],
  );
  const freshnessInsight = useMemo(
    () => (project ? resolveProjectFreshnessInsight(project) : null),
    [project],
  );
  const impactInsight = useMemo(
    () =>
      project
        ? resolveProjectImpactInsight(allProjects, project.slug, impactMode)
        : null,
    [allProjects, impactMode, project],
  );

  // 공개용 드로어는 "설명 → 핵심 정보 → 연결" 순서가 먼저 읽히도록 요약 정보를 묶는다.
  const signalItems = project
    ? [
        { label: t("signalStatus"), value: statusLabel(project.status) },
        { label: t("signalOwner"), value: project.owner ?? t("ownerFallback") },
        { label: t("signalConnected"), value: String(referencedBy.length) },
        { label: t("signalDeps"), value: String(project.dependencies.length) },
      ]
    : [];

  const dependencyItems = project
    ? project.dependencies.map((depSlug) => {
        const dependency = bySlug.get(depSlug);
        if (!dependency) return null;
        return {
          project: dependency,
          relationship: getProjectRelationshipMeta(
            resolveProjectRelationshipKind(depSlug),
          ),
        };
      })
    : [];

  const referencedByItems = project
    ? referencedBy.map((refProject) => ({
        project: refProject,
        relationship: getProjectRelationshipMeta(
          resolveProjectRelationshipKind(project.slug),
        ),
      }))
    : [];

  // 관련 문서 — Docs Vault 에서 이 프로젝트를 인용하는 md top 5.
  // 권한 없으면 섹션 자체 숨김 (게스트/로그인 안 된 사용자에게 admin 문서
  // 링크 새는 것 방지).
  const relatedDocs = useMemo(() => {
    if (!project) return [];
    const manifest = vaultManifest as VaultManifest;
    return findRelatedDocs(
      manifest.docs,
      {
        projectSlug: project.slug,
        projectName: project.name,
      },
      5,
    );
  }, [project]);
  const relationshipSummary = project
    ? (() => {
        if (project.isHub && referencedBy.length > 0) {
          return t("summaryHubReferenced", { count: referencedBy.length });
        }

        if (project.dependencies.length === 0 && referencedBy.length === 0) {
          return t("summaryStandalone");
        }

        if (project.dependencies.length > 0 && referencedBy.length > 0) {
          return t("summaryBoth", {
            deps: project.dependencies.length,
            refs: referencedBy.length,
          });
        }

        if (project.dependencies.length > 0) {
          return t("summaryDepsOnly", { count: project.dependencies.length });
        }

        return t("summaryRefsOnly", { count: referencedBy.length });
      })()
    : "";
  const relatedProjects = project
    ? [
        ...dependencyItems
          .map((item) => item?.project)
          .filter((candidate): candidate is Project => Boolean(candidate)),
        ...referencedByItems.map((item) => item.project),
      ]
        .filter((candidate, index, array) =>
          array.findIndex((item) => item.slug === candidate.slug) === index,
        )
        .slice(0, 3)
    : [];
  // 상세 페이지 URL — 컨테이너 컨텍스트(`?pj=`) 까지 유지해 zoom-in 에서
  // 온 사용자가 뒤로 갈 때도 같은 컨테이너 뷰로 돌아올 수 있게.
  const detailHref = project
    ? getProjectDetailHref(project.slug)
    : "#";
  // 관련 문서 top 1 slug — 있으면 문서 볼트가 그 문서를 바로 열게 딥링크.
  // 없으면 볼트 홈 ('/docs/') 로. URL 형식은 buildDocsVaultHref 에 위임.
  const primaryRelatedDocSlug = relatedDocs[0]?.doc.slug ?? null;
  const docsVaultHref = buildDocsVaultHref({ slug: primaryRelatedDocSlug });
  // `<Link>` 의 기본 click 이 framer-motion drag 속성·drawer 언마운트와
  // race 해 가끔 navigate 가 소실되는 케이스가 보고됐다. onClick 에서
  // 명시적으로 router.push 해 drawer 닫히기 전에 navigation 을 먼저 kick
  // off. 보조적으로 Link 의 href 도 동일하게 둬 hover prefetch + 미들클릭
  // (새 탭) 은 그대로 유지.
  const handleDetailClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return; // 새 탭/창 등 기본 동작 유지.
      }
      event.preventDefault();
      router.push(detailHref);
    },
    [detailHref, router],
  );
  return (
    <AnimatePresence>
      {project && (
        <motion.aside
          data-testid="project-drawer"
          ref={asideRef}
          role="dialog"
          aria-modal="true"
          aria-label={project ? t("ariaLabelWithName", { name: project.name }) : t("ariaLabelFallback")}
          aria-describedby={project ? `project-drawer-summary-${project.slug}` : undefined}
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1, y: 0 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={SPRING.sheet}
          drag="y"
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.4 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 120 || info.velocity.y > 500) {
              onClose();
            }
          }}
          className="fixed inset-x-0 bottom-0 top-[38%] z-30 flex w-full flex-col overflow-y-auto overscroll-y-contain rounded-t-[28px] border-t border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-2xl lg:inset-y-0 lg:right-0 lg:left-auto lg:top-0 lg:max-w-md lg:rounded-none lg:border-t-0 lg:border-l"
        >
          <header className="sticky top-0 border-b border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-4 py-3 md:px-6 md:py-4">
            {/*
              아래로 스와이프해서 닫는 영역. 핸들 바 주위 패딩까지 터치 영역으로 확보.
              데스크탑(md+)에서는 드래그 대상 자체가 숨겨지므로 스와이프가 붙지 않는다.
            */}
            <div
              onPointerDown={(event) => dragControls.start(event)}
              aria-hidden="true"
              className="-mx-4 -mt-3 mb-2 flex cursor-grab touch-none justify-center py-3 active:cursor-grabbing md:hidden"
            >
              <span className="h-1 w-12 rounded-full bg-[color:var(--color-border-strong)]" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
                  {isContainerNode ? t("categoryProject") : categoryLabel(project.category)}
                </span>
                {containerLabel && !isContainerNode ? (
                  <span className="rounded-full border border-[color:rgba(139,151,255,0.32)] bg-[color:rgba(94,106,210,0.12)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:rgba(139,151,255,0.95)]">
                    Project · {containerLabel}
                  </span>
                ) : null}
                {isContainerNode ? (
                  <span className="rounded-full border border-[color:rgba(224,196,140,0.45)] bg-[color:rgba(224,196,140,0.12)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:rgba(224,196,140,0.95)]">
                    {t("containerBadge")}
                  </span>
                ) : project.isHub ? (
                  <span className="rounded-full border border-[color:rgba(113,112,255,0.5)] bg-[color:rgba(94,106,210,0.16)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                    {t("hubBadge")}
                  </span>
                ) : (
                  <span className="rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-2)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
                    {t("serviceBadge")}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                aria-label={t("closeAriaLabel")}
              >
                <X size={16} />
              </button>
            </div>
          </header>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={project.slug}
              initial={{ opacity: 0, x: 18, y: 6 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: -14, y: -4 }}
              transition={MOTION.medium}
              className="flex-1 px-4 py-4 md:px-6 md:py-6"
            >
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={MOTION.medium}
                className="overflow-hidden rounded-[20px] border border-[color:var(--color-divider)] bg-[linear-gradient(180deg,var(--color-overlay-1)_0%,rgba(255,255,255,0)_100%)]"
              >
              <div className="relative px-5 py-5">
                <div
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-0 h-full w-px",
                    project.isHub
                      ? "bg-[color:var(--color-indigo-brand)]"
                      : "bg-[color:var(--color-divider)]",
                  )}
                />

                <div className="flex items-start gap-3">
                  {project.icon && (
                    <span
                      data-testid="project-drawer-icon"
                      className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] text-xl"
                      aria-hidden="true"
                    >
                      {project.icon}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    {/* Container synthetic 은 lifecycle status(개발중 등) 의미
                        없음. progress 도 0~100 아무 값 들어가 있어 오해 소지.
                        Container 일 땐 eyebrow 라인 자체를 숨긴다. */}
                    {!isContainerNode && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                          {statusLabel(project.status)}
                        </span>
                        {project.progress !== undefined && (
                          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                            {project.progress}%
                          </span>
                        )}
                      </div>
                    )}

                    <h2
                      className={cn(
                        "mt-2 text-[30px] leading-[1.04] tracking-[var(--tracking-section)] font-[var(--font-weight-signature)]",
                        isContainerNode
                          ? "text-[color:rgba(224,196,140,0.95)]"
                          : project.isHub
                            ? "text-[color:var(--color-indigo-accent)]"
                            : "text-[color:var(--color-text-primary)]",
                      )}
                    >
                      {displayName}
                    </h2>

                    {project.nameEn && project.nameEn !== project.name && (
                      <p className="mt-1 text-sm text-[color:var(--color-text-tertiary)]">
                        {project.nameEn}
                      </p>
                    )}
                  </div>
                </div>

                <p
                  data-testid="project-drawer-meta"
                  id={`project-drawer-summary-${project.slug}`}
                  className="mt-5 line-clamp-4 text-[15px] leading-7 text-[color:var(--color-text-secondary)]"
                >
                  {project.description}
                </p>

                <div className="mt-5">
                  {isContainerNode ? (
                    // Layer 0 컨테이너: 이 프로젝트 안의 허브/노드 지도로 진입.
                    // 상세 페이지 이동은 없음 (컨테이너는 별도 detail route 미존재).
                    <button
                      type="button"
                      onClick={() => {
                        if (!project) return;
                        onEnterContainer?.(project.slug);
                        onClose();
                      }}
                      className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(224,196,140,0.45)] bg-[color:rgba(224,196,140,0.1)] px-3 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(224,196,140,0.65)] hover:bg-[color:rgba(224,196,140,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(224,196,140,0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                    >
                      {t("openContainerTopology")} <ArrowUpRight size={14} />
                    </button>
                  ) : onEnterContainer && project.isHub && !activeProjectId ? (
                    // Layer 0 Hub — 아직 컨테이너에 진입 안 한 상태. primary
                    // action 은 "이 허브가 속한 컨테이너로 zoom-in".
                    <button
                      type="button"
                      onClick={() => {
                        if (!project) return;
                        onEnterContainer(project.slug);
                        onClose();
                      }}
                      className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.38)] bg-[color:rgba(94,106,210,0.12)] px-3 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                    >
                      {t("openHubTopology")} <ArrowUpRight size={14} />
                    </button>
                  ) : project.isHub && activeProjectId ? (
                    // Layer 1 Hub — 이미 해당 컨테이너 안에서 이 허브를
                    // focus 한 상태. "토폴로지 열기" 는 모순 (이미 열려있음).
                    // drawer 본문 (설명 · 연결 프로젝트 · 기본 정보) 이 이미
                    // "상세" 역할을 하므로 primary CTA 생략. canvas focus
                    // 상태가 시각적 상세를 담당.
                    null
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <Link
                        href={detailHref}
                        prefetch
                        onClick={handleDetailClick}
                        className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.38)] bg-[color:rgba(94,106,210,0.12)] px-3 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                      >
                        {t("openProjectDetail")} <ArrowUpRight size={14} />
                      </Link>
                      <Link
                        href={docsVaultHref}
                        title={
                          primaryRelatedDocSlug
                            ? t("openDocsVaultTitleWithDoc", { name: project.name })
                            : t("openDocsVaultTitleEmpty")
                        }
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.04)] px-3 text-sm text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:rgba(94,106,210,0.55)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                      >
                        <BookOpen size={13} />
                        {t("openDocsVault")}
                      </Link>
                      {/* drawer 는 topology view 안에서만 마운트되어
                          openTopology 가 self-link no-op 이었다. 1원칙:
                          ontology / topology / docs 셋 다 같은 vault doc
                          의 다른 투영 → 여기서 missing 한 cross-link 은
                          ontology 트리. project:<slug> deeplink 로 NodeDetailPanel
                          이 자동 열린다 (fm.slug 가 filename 과 다른 경우엔
                          매칭 실패해도 페이지는 graceful 로드). */}
                      <Link
                        href={buildOntologyNodeHref(`project:${project.slug}`)}
                        className="inline-flex h-10 items-center justify-center rounded-md border border-[color:var(--color-divider)] px-3 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                      >
                        {t("openOntology")}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
              </motion.section>


              {/* Container 는 "어디와 연결돼 있나" 섹션이 의미 mismatch.
                  Container 는 Hub 집합이지 다른 Project 와의 edge 를 갖는
                  entity 가 아님. primary CTA "토폴로지 열기" 로 이미 내부
                  탐색 경로 제공하므로 Hub/Node 한정 섹션 표시. */}
              {!isContainerNode && (
                <motion.section
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...MOTION.medium, delay: 0.03 }}
                  className="mt-5 md:mt-6"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                      {t("connectionsTitle")}
                    </h3>
                  </div>
                  <div className="mt-3 rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4">
                    <p className="text-sm leading-6 text-[color:var(--color-text-secondary)]">
                      {relationshipSummary}
                    </p>
                    {relatedProjects.length > 0 && (
                      <div className="mt-4">
                        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                          {t("nextProjects")}
                        </p>
                        <div className="mt-2 flex flex-col items-start gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectProject(relatedProjects[0]!.slug)}
                            className="inline-flex items-center gap-2 rounded-md border border-[color:var(--color-divider)] px-2.5 py-1.5 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:text-[color:var(--color-text-primary)]"
                          >
                            <span>{relatedProjects[0]!.name}</span>
                            <ArrowUpRight size={12} aria-hidden="true" />
                          </button>
                          {relatedProjects.length > 1 ? (
                            <p className="text-xs text-[color:var(--color-text-tertiary)]">
                              {t("moreRelated", { count: relatedProjects.length - 1 })}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.section>
              )}

              {/* Container 는 태그·링크·상태 모두 비어 있어 "기본 정보 더 보기"
                  expander 가 열어도 빈 칸만 노출. Hub/Node 에만 표시. */}
              {!isContainerNode && (
              <details className="mt-5 overflow-hidden rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
                <summary className="group flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-1)]">
                  <div className="min-w-0">
                    <p>{t("moreInfoSummary")}</p>
                    <p className="mt-1 text-xs font-normal text-[color:var(--color-text-tertiary)]">
                      {t("moreInfoHint")}
                    </p>
                  </div>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className="shrink-0 text-[color:var(--color-text-tertiary)] transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="space-y-5 border-t border-[color:var(--color-border-soft)] px-4 py-4">
                  {integrityIssueLabels.length > 0 && (
                    <section
                      data-testid="project-drawer-integrity"
                      className="rounded-2xl border border-[color:rgba(244,183,49,0.25)] bg-[color:rgba(244,183,49,0.08)] px-4 py-3.5"
                    >
                      <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-status-warning)]">
                        {t("integrityTitle")}
                      </h3>
                      <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[color:var(--color-text-secondary)]">
                        {integrityIssueLabels.map((label) => (
                          <li key={label}>{label}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <section>
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                        {t("basicInfo")}
                      </h3>
                      {impactInsight ? (
                        <span
                          id="project-drawer-impact-help"
                          className="text-xs text-[color:var(--color-text-tertiary)]"
                        >
                          {impactMode === "none" ? t("impactNone") : t("impactConnections")}
                        </span>
                      ) : null}
                    </div>
                    <ProjectMetaGrid
                      items={signalItems}
                      className="mt-3"
                      cellClassName="bg-[color:var(--color-panel)] px-4 py-3.5"
                    />

                    {(completenessInsight || freshnessInsight) && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {completenessInsight ? (
                          <div className="rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3.5 py-3">
                            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                              {t("completeness")}
                            </p>
                            <p className="mt-1 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                              {completenessInsight.score}%
                            </p>
                          </div>
                        ) : null}
                        {freshnessInsight ? (
                          <div className="rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3.5 py-3">
                            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                              {t("freshness")}
                            </p>
                            <p className="mt-1 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                              {freshnessInsight.label}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {impactInsight && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[
                          { mode: "none" as const, label: t("impactModeNone") },
                          { mode: "upstream" as const, label: t("impactModeUpstream") },
                          { mode: "downstream" as const, label: t("impactModeDownstream") },
                          { mode: "network" as const, label: t("impactModeNetwork") },
                        ].map((item) => {
                          const active = impactMode === item.mode;
                          return (
                            <button
                              key={item.mode}
                              type="button"
                              onClick={() => onChangeImpactMode(item.mode)}
                              aria-pressed={active}
                              aria-describedby="project-drawer-impact-help"
                              className={cn(
                                "rounded-full border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] transition-colors",
                                active
                                  ? "border-[color:var(--color-indigo-brand)] bg-[color:rgba(94,106,210,0.12)] text-[color:var(--color-text-primary)]"
                                  : "border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]",
                              )}
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-3">
                      <CopyProjectLinkButton
                        slug={project.slug}
                        href={getProjectDetailHref(project.slug)}
                        testId="project-drawer-copy-link"
                        className="h-10 w-full justify-center"
                      />
                    </div>
                  </section>

                  {(project.tags.length > 0 || project.stack.length > 0) && (
                    <section>
                      <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                        {t("tagsAndStack")}
                      </h3>
                      <div className="mt-3 rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4">
                        {project.tags.length > 0 && (
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                              {t("tags")}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {project.tags.map((tag) => (
                                <span
                                  key={`tag-${tag}`}
                                  className="rounded-full border border-[color:var(--color-divider)] px-2.5 py-1 text-[10px] leading-none text-[color:var(--color-text-tertiary)]"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {project.stack.length > 0 && (
                          <div className={cn(project.tags.length > 0 && "mt-4")}>
                            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                              {t("stack")}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {project.stack.map((item) => (
                                <span
                                  key={`stack-${item}`}
                                  className="rounded-full bg-[color:var(--color-elevated)] px-2.5 py-1 font-mono text-[10px] leading-none text-[color:var(--color-text-secondary)]"
                                >
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {(project.dependencies.length > 0 ||
                    referencedBy.length > 0 ||
                    missingDependencyIssues.length > 0) && (
                    <section>
                      <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                        {t("connections")}
                      </h3>
                      <div className="mt-3 grid gap-3">
                        {(project.dependencies.length > 0 ||
                          missingDependencyIssues.length > 0) && (
                          <div className="rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4">
                            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                              {t("dependsOn")}
                            </p>
                            <ul className="mt-3 flex flex-wrap gap-1.5">
                              {dependencyItems.map((item) => {
                                if (!item) return null;
                                return (
                                  <li key={item.project.slug}>
                                    <button
                                      onClick={() => onSelectProject(item.project.slug)}
                                      className="inline-flex items-center gap-2 rounded-md border border-[color:var(--color-divider)] px-2.5 py-1 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:text-[color:var(--color-text-primary)]"
                                    >
                                      <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                                        {item.relationship.label}
                                      </span>
                                      <span>{item.project.name}</span>
                                    </button>
                                  </li>
                                );
                              })}
                              {missingDependencyIssues.map((issue) => (
                                <li key={`missing-${issue.dependencySlug}`}>
                                  <span
                                    data-testid={`project-drawer-missing-dependency-${issue.dependencySlug}`}
                                    className="rounded-md border border-[color:rgba(244,183,49,0.25)] bg-[color:rgba(244,183,49,0.08)] px-2.5 py-1 text-xs text-[color:var(--color-status-warning)]"
                                  >
                                    {t("missingPrefix", { slug: issue.dependencySlug })}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {referencedBy.length > 0 && (
                          <div className="rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4">
                            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                              {t("usedBy")}
                            </p>
                            <ul className="mt-3 flex flex-wrap gap-1.5">
                              {referencedByItems.map((item) => (
                                <li key={item.project.slug}>
                                  <button
                                    onClick={() => onSelectProject(item.project.slug)}
                                    className="inline-flex items-center gap-2 rounded-md border border-[color:var(--color-divider)] px-2.5 py-1 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:text-[color:var(--color-text-primary)]"
                                  >
                                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                                      {item.relationship.label}
                                    </span>
                                    <span>{item.project.name}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {relatedDocs.length > 0 && (
                          <div className="rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4">
                            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                              <BookOpen size={11} aria-hidden />
                              {t("relatedDocs", { count: relatedDocs.length })}
                            </p>
                            <ul className="mt-3 flex flex-col gap-1">
                              {relatedDocs.map((m) => {
                                const hasExcerpt = m.doc.excerpt.trim().length > 0;
                                return (
                                  <li key={m.doc.slug}>
                                    <Link
                                      href={buildDocsVaultHref({ slug: m.doc.slug })}
                                      className="group flex flex-col gap-1 rounded-md border border-transparent px-2 py-1 text-left text-[12px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(139,151,255,0.3)] hover:text-[color:var(--color-text-primary)]"
                                    >
                                      <span className="flex items-center gap-2">
                                        <span className="flex-1 truncate">
                                          {m.doc.title}
                                        </span>
                                        <span
                                          className="font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]"
                                          title={m.reasons.join(', ')}
                                        >
                                          {m.reasons[0]}
                                        </span>
                                      </span>
                                      {hasExcerpt && (
                                        <p className="hidden line-clamp-2 text-[11px] leading-4 text-[color:var(--color-text-quaternary)] [@media(hover:hover)]:group-hover:block">
                                          {m.doc.excerpt}
                                        </p>
                                      )}
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {(project.screenshots[0] ||
                    project.timeline?.startedAt ||
                    project.timeline?.launchedAt ||
                    project.links.length > 0) && (
                    <details className="rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3">
                      <summary className="cursor-pointer list-none text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                        {t("moreScreensAndRecords")}
                      </summary>
                      <div className="mt-4 space-y-5 border-t border-[color:var(--color-border-soft)] pt-4">
                        {project.screenshots[0] && (
                          <section>
                            <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                              {t("screenshotsTitle")}
                            </h3>
                            <div className="mt-3 overflow-hidden rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)]">
                              <Image
                                src={project.screenshots[0]}
                                alt={t("screenshotAlt", { name: project.name })}
                                width={1600}
                                height={900}
                                sizes="(min-width: 768px) 480px, 100vw"
                                className="aspect-[16/9] w-full object-cover"
                                unoptimized
                              />
                            </div>
                          </section>
                        )}

                        {(project.timeline?.startedAt || project.timeline?.launchedAt) && (
                          <section>
                            <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                              {t("timelineTitle")}
                            </h3>
                            <dl className="mt-3 space-y-2 rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4 text-sm text-[color:var(--color-text-secondary)]">
                              {project.timeline?.startedAt && (
                                <div className="flex items-baseline justify-between gap-4">
                                  <dt className="text-[color:var(--color-text-tertiary)]">
                                    {t("timelineStarted")}
                                  </dt>
                                  <dd className="font-mono">
                                    {formatDate(project.timeline.startedAt)}
                                  </dd>
                                </div>
                              )}
                              {project.timeline?.launchedAt && (
                                <div className="flex items-baseline justify-between gap-4">
                                  <dt className="text-[color:var(--color-text-tertiary)]">
                                    {t("timelineLaunched")}
                                  </dt>
                                  <dd className="font-mono">
                                    {formatDate(project.timeline.launchedAt)}
                                  </dd>
                                </div>
                              )}
                            </dl>
                          </section>
                        )}

                        {project.links.length > 0 && (
                          <section>
                            <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                              {t("linksTitle")}
                            </h3>
                            <ul className="mt-3 space-y-2 rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4">
                              {project.links.map((link, idx) => (
                                <li key={`${link.url}-${idx}`}>
                                  <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-indigo-accent)] transition-colors hover:text-[color:var(--color-indigo-hover)]"
                                  >
                                    {link.label}
                                    <ArrowUpRight size={14} />
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </section>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              </details>
              )}

              <div className="mt-5">
                <PublicQuickActions
                  projectSlug={project.slug}
                  label={t("manageLabel")}
                  className="w-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] shadow-none"
                />
              </div>

              <footer className="mt-6 border-t border-[color:var(--color-overlay-2)] pt-4 md:mt-8">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {t("footerUpdated", { slug: project.slug, date: formatDate(project.updatedAt) })}
                </p>
              </footer>
            </motion.div>
          </AnimatePresence>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
