"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { badgeClass } from "@/shared/ui/badge-class";
import Image from "next/image";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from "framer-motion";
import {
  EXIT_TRANSITION,
  MOTION,
  OVERLAY_RISE,
  OVERLAY_SETTLED,
  OVERLAY_SPRING,
  useExitLockout,
} from '@/shared/motion';
import { mergeRefs } from "@/shared/lib/merge-refs";
import { ArrowUpRight, BookOpen, ChevronDown, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { cn } from "@/shared/lib/cn";
import { Chip, controlClass, IconButton } from "@/shared/ui";
import { buildDocsVaultHref, findRelatedDocs } from "@/entities/docs-vault";
import { useStaticVaultSource } from "@/entities/vault-session";
import { formatDate } from "@/shared/lib/format-date";
import {
  formatProjectIntegrityIssue,
  getProjectRelationshipMeta,
  getProjectRuntimeDetailHref,
  getProjectIntegrityIssues,
  ProjectMetaGrid,
  resolveProjectCompletenessInsight,
  resolveProjectFreshnessInsight,
  resolveProjectImpactInsight,
  resolveProjectRelationshipKind,
  projectDisplayName,
  type Project,
  type ProjectImpactMode,
} from "@/entities/project";
import { buildOntologyNodeHref } from "@/entities/knowledge-graph";
import { CopyProjectLinkButton } from "@/features/project-share";
import { useTaxonomy } from "@/features/taxonomy";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { PublicQuickActions } from "@/widgets/public-quick-actions";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";
import { IMPACT_MODE_COPY_KEYS } from "../lib/impact-mode-copy";

interface Props {
  project: Project | null;
  allProjects: Project[];
  /** The active container id — appended to the detail page URL as `?pj=` to keep context. */
  activeProjectId?: string | null;
  impactMode: ProjectImpactMode;
  onChangeImpactMode: (mode: ProjectImpactMode) => void;
  onClose: () => void;
  onSelectProject: (slug: string) => void;
  /** The active container's name. Shown as a "Project · {label}" badge in the header. */
  containerLabel?: string | null;
  /**
   * "Open topology" for a Layer 0 container's synthetic project, performing the `?pj=` zoom-in as
   * an explicit second step.
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
  // Freshness grade → human language (the model returns only the grade).
  const tFreshness = useTranslations("projectFreshness");
  const isContainerNode = project?.category === "__container__";
  // The Layer 1 title drops the container prefix; the breadcrumb chip carries it.
  const locale = useLocale();
  const displayName = (() => {
    if (!project) return "";
    // The word the map label draws for this project on this screen (`display_<locale>`).
    const name = projectDisplayName(project, locale);
    const prefix = containerLabel?.trim();
    if (!prefix || isContainerNode) return name;
    const sep = `${prefix} · `;
    if (name.startsWith(sep)) {
      const rest = name.slice(sep.length).trim();
      return rest.length > 0 ? rest : name;
    }
    return name;
  })();
  const asideRef = useRef<HTMLElement | null>(null);
  const { ref: asideLockoutRef, onAnimationStart: asideLockoutOnAnimationStart } = useExitLockout<HTMLElement>();
  const { ref: contentSwapLockoutRef, onAnimationStart: contentSwapLockoutOnAnimationStart } = useExitLockout<HTMLDivElement>();
  const { ref: impactModeHelpLockoutRef, onAnimationStart: impactModeHelpLockoutOnAnimationStart } = useExitLockout<HTMLSpanElement>();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { categories, statuses, categoryLabel, statusLabel } = useTaxonomy();
  // Swipe down closes only from the handle (dragListener=false) so it does not fight the content's
  // vertical scroll.
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

  // Focus the close button on open so keyboard and screen-reader users enter the new context.
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
  // The active mode's help key, looked up once for the helper span and the crossfade key.
  const impactModeHelpKey =
    IMPACT_MODE_COPY_KEYS.find((item) => item.mode === impactMode)?.helpKey ??
    "impactHelpNone";

  /* Impact mode is an exclusive choice with `none` as off, so it is a radiogroup. */
  const impactGroup = useRovingRadioGroup({
    value: impactMode,
    values: IMPACT_MODE_COPY_KEYS.map((item) => item.mode),
    onChange: onChangeImpactMode,
  });

  // The public drawer groups the summary so it reads in the order "description → key facts → connections".
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

  // Top 5 related vault documents, hidden without permission. Reads the chosen sample rather than
  // the bundled manifest so it matches the rest of the screen.
  const { manifest: staticManifest } = useStaticVaultSource();
  const relatedDocs = useMemo(() => {
    if (!project) return [];
    return findRelatedDocs(
      staticManifest.docs,
      {
        projectSlug: project.slug,
        projectName: project.name,
      },
      5,
    );
  }, [project, staticManifest]);
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
  // The detail URL keeps `?pj=` so going back returns to the same container view.
  const detailHref = project
    ? getProjectRuntimeDetailHref(project.slug)
    : "#";
  // Deep-link to the top related document, or the vault home without one (buildDocsVaultHref).
  const primaryRelatedDocSlug = relatedDocs[0]?.doc.slug ?? null;
  const docsVaultHref = buildDocsVaultHref({ slug: primaryRelatedDocSlug });
  // onClick pushes through the router before the drawer unmounts, since Link's default click raced
  // framer-motion's drag; the href stays for prefetch and middle-click.
  const handleDetailClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return; // Keep the default behaviour for a new tab or window.
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
          ref={mergeRefs(asideRef, asideLockoutRef)}
          onAnimationStart={asideLockoutOnAnimationStart}
          role="dialog"
          aria-modal="true"
          aria-label={project ? t("ariaLabelWithName", { name: project.name }) : t("ariaLabelFallback")}
          aria-describedby={project ? `project-drawer-summary-${project.slug}` : undefined}
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1, y: 0 }}
          exit={{ x: "100%", opacity: 0, transition: EXIT_TRANSITION }}
          // The critically damped overlay spring; overshoot needs explicit approval.
          transition={OVERLAY_SPRING}
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
          className="fixed inset-x-0 bottom-0 top-[38%] z-30 flex w-full flex-col overflow-y-auto overscroll-y-contain rounded-t-sheet border-t border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-3)] lg:inset-y-0 lg:right-0 lg:left-auto lg:top-0 lg:max-w-md lg:rounded-none lg:border-t-0 lg:border-l"
        >
          <header className="sticky top-0 border-b border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-4 py-3 md:px-6 md:py-4">
            {/* The swipe area includes the handle's padding; on md+ no swipe is attached. */}
            <div
              onPointerDown={(event) => dragControls.start(event)}
              aria-hidden="true"
              className="-mx-4 -mt-3 mb-2 flex cursor-grab touch-none justify-center py-3 active:cursor-grabbing md:hidden"
            >
              <span className="h-1 w-12 rounded-full bg-[color:var(--color-border-strong)]" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-tertiary)]">
                  {isContainerNode ? t("categoryProject") : categoryLabel(project.category)}
                </span>
                {containerLabel && !isContainerNode ? (
                  <span className={badgeClass({ shape: "pill", className: "border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-a12)] font-mono uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-indigo-line-a90)]" })}>
                    Project · {containerLabel}
                  </span>
                ) : null}
                {isContainerNode ? (
                  <span className={badgeClass({ shape: "pill", className: "border border-[color:var(--color-amber-docs-a45)] bg-[color:var(--color-amber-docs-a12)] font-mono uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-amber-docs-a95)]" })}>
                    {t("containerBadge")}
                  </span>
                ) : project.isHub ? (
                  <span className={badgeClass({ shape: "pill", className: "border border-[color:var(--color-indigo-accent-a50)] bg-[color:var(--color-indigo-a16)] font-mono uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-indigo-text-soft)]" })}>
                    {t("hubBadge")}
                  </span>
                ) : (
                  <span className={badgeClass({ shape: "pill", className: "border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-2)] font-mono uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-tertiary)]" })}>
                    {t("serviceBadge")}
                  </span>
                )}
              </div>
              <IconButton
                onClick={onClose}
                size="lg"
                className="hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                label={t("closeAriaLabel")}
              >
                <X size={ICON_SIZE.lg} />
              </IconButton>
            </div>
          </header>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={project.slug}
              ref={contentSwapLockoutRef}
              onAnimationStart={contentSwapLockoutOnAnimationStart}
              initial={{ opacity: 0, x: 18, y: 6 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: -14, y: -4, transition: EXIT_TRANSITION }}
              transition={MOTION.base}
              className="flex-1 px-4 py-4 md:px-6 md:py-6"
            >
              <motion.section
                initial={OVERLAY_RISE}
                animate={OVERLAY_SETTLED}
                transition={MOTION.base}
                /*
                 * An in-flow card, so it uses the card radius, not the sheet step, keeping the
                 * nesting grammar.
                 */
                className="overflow-hidden rounded-panel border border-[color:var(--color-divider)] bg-[linear-gradient(180deg,var(--color-overlay-1)_0%,transparent_100%)]"
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
                      className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] text-display"
                      aria-hidden="true"
                    >
                      {project.icon}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    {/*
                     * A container has no meaningful status or progress, so the eyebrow line is
                     * hidden.
                     */}
                    {!isContainerNode && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                          {statusLabel(project.status)}
                        </span>
                        {project.progress !== undefined && (
                          <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                            {project.progress}%
                          </span>
                        )}
                      </div>
                    )}

                    <h2
                      className={cn(
                        "mt-2 text-hero leading-display-tight tracking-[var(--tracking-section)] font-[var(--font-weight-signature)]",
                        isContainerNode
                          ? "text-[color:var(--color-amber-docs-a95)]"
                          : project.isHub
                            ? "text-[color:var(--color-indigo-accent)]"
                            : "text-[color:var(--color-text-primary)]",
                      )}
                    >
                      {displayName}
                    </h2>

                    {project.nameEn && project.nameEn !== project.name && (
                      <p className="mt-1 text-body-lg text-[color:var(--color-text-tertiary)]">
                        {project.nameEn}
                      </p>
                    )}
                  </div>
                </div>

                <p
                  data-testid="project-drawer-meta"
                  id={`project-drawer-summary-${project.slug}`}
                  className="mt-5 line-clamp-4 text-title leading-display text-[color:var(--color-text-secondary)]"
                >
                  {project.description}
                </p>

                <div className="mt-5">
                  {isContainerNode ? (
                    // Layer 0 container: enter the map inside this project; containers have no
                    // detail route.
                    <button
                      type="button"
                      onClick={() => {
                        if (!project) return;
                        onEnterContainer?.(project.slug);
                        onClose();
                      }}
                      className={controlClass({
                        shape: "card",
                        size: "lg",
                        tone: "strong",
                        className:
                          "w-full justify-center border-[color:var(--color-amber-docs-a45)] bg-[color:var(--color-amber-docs-a10)] font-[var(--font-weight-signature)] hover:border-[color:var(--color-amber-docs-a65)] hover:bg-[color:var(--color-amber-docs-a16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-amber-docs-a50)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]",
                      })}
                    >
                      {t("openContainerTopology")}
                    </button>
                  ) : onEnterContainer && project.isHub && !activeProjectId ? (
                    // Layer 0 hub: the primary action zooms into its container.
                    <button
                      type="button"
                      onClick={() => {
                        if (!project) return;
                        onEnterContainer(project.slug);
                        onClose();
                      }}
                      className={controlClass({
                        shape: "card",
                        size: "lg",
                        tone: "strong",
                        className:
                          "w-full justify-center border-[color:var(--color-indigo-a38)] bg-[color:var(--color-indigo-a12)] font-[var(--font-weight-signature)] hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]",
                      })}
                    >
                      {t("openHubTopology")}
                    </button>
                  ) : project.isHub && activeProjectId ? (
                    // Layer 1 hub: already open, so no primary CTA.
                    null
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <Link
                        href={detailHref}
                        prefetch
                        onClick={handleDetailClick}
                        className={controlClass({
                        shape: "card",
                        size: "lg",
                        tone: "strong",
                        className:
                          "w-full justify-center border-[color:var(--color-indigo-a38)] bg-[color:var(--color-indigo-a12)] font-[var(--font-weight-signature)] hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]",
                      })}
                      >
                        {t("openProjectDetail")}
                      </Link>
                      <Link
                        href={docsVaultHref}
                        title={
                          primaryRelatedDocSlug
                            ? t("openDocsVaultTitleWithDoc", { name: project.name })
                            : t("openDocsVaultTitleEmpty")
                        }
                        className={controlClass({ shape: "chip", size: "lg", tone: "accentOnTint", className: "h-10 justify-center gap-1.5 border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a06)] hover:border-[color:var(--color-indigo-a55)] hover:text-[color:var(--color-text-primary)]" })}
                      >
                        <BookOpen size={ICON_SIZE.sm} />
                        {t("openDocsVault")}
                      </Link>
                      {/*
                       * Links to the ontology full detail through a `project:<slug>` deep link;
                       * opening the topology here would be a self-link.
                       */}
                      <Link
                        href={buildOntologyNodeHref(`project:${project.slug}`)}
                        className={controlClass({ shape: "chip", size: "lg", tone: "secondary", className: "h-10 justify-center border-[color:var(--color-divider)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]" })}
                      >
                        {t("openOntology")}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
              </motion.section>


              {/* Connections are for hubs and nodes; a container is a set of hubs. */}
              {!isContainerNode && (
                <motion.section
                  initial={OVERLAY_RISE}
                  animate={OVERLAY_SETTLED}
                  transition={{ ...MOTION.base, delay: 0.03 }}
                  className="mt-5 md:mt-6"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                      {t("connectionsTitle")}
                    </h3>
                  </div>
                  <div className="mt-3 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
                    <p className="text-body-lg leading-title text-[color:var(--color-text-secondary)]">
                      {relationshipSummary}
                    </p>
                    {relatedProjects.length > 0 && (
                      <div className="mt-4">
                        <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                          {t("nextProjects")}
                        </p>
                        <div className="mt-2 flex flex-col items-start gap-2">
                          <Chip
                            size="lg"
                            tone="secondary"
                            onClick={() => onSelectProject(relatedProjects[0]!.slug)}
                            className="hover:border-[color:var(--color-indigo-brand)] hover:text-[color:var(--color-text-primary)]"
                          >
                            <span>{relatedProjects[0]!.name}</span>
                          </Chip>
                          {relatedProjects.length > 1 ? (
                            <p className="text-body text-[color:var(--color-text-tertiary)]">
                              {t("moreRelated", { count: relatedProjects.length - 1 })}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.section>
              )}

              {/* Basic info is for hubs and nodes; a container's cells would be blank. */}
              {!isContainerNode && (
              <details className="mt-5 overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
                <summary
                  data-testid="project-drawer-more-info-summary"
                  className="group flex list-none items-center justify-between gap-3 px-4 py-3 text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-1)]"
                >
                  <div className="min-w-0">
                    <p>{t("moreInfoSummary")}</p>
                    <p className="mt-1 text-body font-normal text-[color:var(--color-text-tertiary)]">
                      {t("moreInfoHint")}
                    </p>
                  </div>
                  <ChevronDown
                    size={ICON_SIZE.lg}
                    aria-hidden="true"
                    className="shrink-0 text-[color:var(--color-text-tertiary)] transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="space-y-5 border-t border-[color:var(--color-border-soft)] px-4 py-4">
                  {integrityIssueLabels.length > 0 && (
                    <section
                      data-testid="project-drawer-integrity"
                      className="rounded-panel border border-[color:var(--color-amber-source-a25)] bg-[color:var(--color-amber-source-a08)] px-4 py-3.5"
                    >
                      <h3 className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-status-warning)]">
                        {t("integrityTitle")}
                      </h3>
                      <ul className="mt-2 space-y-1.5 text-body leading-body text-[color:var(--color-text-secondary)]">
                        {integrityIssueLabels.map((label) => (
                          <li key={label}>{label}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <section>
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                        {t("basicInfo")}
                      </h3>
                      {impactInsight ? (
                        <span
                          id="project-drawer-impact-help"
                          data-testid="project-drawer-impact-help"
                          className="text-body text-[color:var(--color-text-tertiary)]"
                        >
                          {/* Only the helper text crossfades, on a confirmed click. */}
                          <AnimatePresence mode="wait" initial={false}>
                            {/*
                             * Kept under reduced motion: an opacity-only swap with no movement.
                             */}
                            <motion.span
                              key={impactModeHelpKey}
                              ref={impactModeHelpLockoutRef}
                              onAnimationStart={impactModeHelpLockoutOnAnimationStart}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0, transition: EXIT_TRANSITION }}
                              transition={MOTION.fast}
                            >
                              {t(impactModeHelpKey)}
                            </motion.span>
                          </AnimatePresence>
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
                          <div className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3.5 py-3">
                            <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                              {t("completeness")}
                            </p>
                            <p className="mt-1 text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                              {completenessInsight.score}%
                            </p>
                          </div>
                        ) : null}
                        {freshnessInsight ? (
                          <div className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3.5 py-3">
                            <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                              {t("freshness")}
                            </p>
                            <p className="mt-1 text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                              {tFreshness(freshnessInsight.level)}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {impactInsight && (
                      <div
                        {...impactGroup.groupProps}
                        aria-label={t("impactModeGroupAria")}
                        className="mt-3 flex flex-wrap gap-2"
                      >
                        {/*
                         * title carries the per-mode help for mouse users, and aria-label leads
                         * with the visible label (Label-in-Name) so touch and screen readers get
                         * the same information.
                         */}
                        {IMPACT_MODE_COPY_KEYS.map((item, index) => {
                          const active = impactMode === item.mode;
                          const label = t(item.labelKey);
                          const help = t(item.helpKey);
                          return (
                            <button
                              key={item.mode}
                              {...impactGroup.itemProps(index)}
                              type="button"
                              aria-describedby="project-drawer-impact-help"
                              title={help}
                              aria-label={`${label} — ${help}`}
                              className={controlClass({
                                shape: "pill",
                                size: "md",
                                tone: active ? "default" : "muted",
                                className: cn(
                                  "px-3 py-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-08)]",
                                  active
                                    ? "border-[color:var(--color-indigo-brand)] bg-[color:var(--color-indigo-a12)]"
                                    : "border-[color:var(--color-divider)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]",
                                ),
                              })}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-3">
                      <CopyProjectLinkButton
                        slug={project.slug}
                        testId="project-drawer-copy-link"
                        className="h-10 w-full justify-center"
                      />
                    </div>
                  </section>

                  {(project.tags.length > 0 || project.stack.length > 0) && (
                    <section>
                      <h3 className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                        {t("tagsAndStack")}
                      </h3>
                      <div className="mt-3 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
                        {project.tags.length > 0 && (
                          <div>
                            <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                              {t("tags")}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {project.tags.map((tag) => (
                                <span
                                  key={`tag-${tag}`}
                                  className="rounded-full border border-[color:var(--color-divider)] px-2.5 py-1 text-caption leading-display-tight text-[color:var(--color-text-tertiary)]"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {project.stack.length > 0 && (
                          <div className={cn(project.tags.length > 0 && "mt-4")}>
                            <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                              {t("stack")}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {project.stack.map((item) => (
                                <span
                                  key={`stack-${item}`}
                                  className="rounded-full bg-[color:var(--color-elevated)] px-2.5 py-1 font-mono text-caption leading-display-tight text-[color:var(--color-text-secondary)]"
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
                      <h3 className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                        {t("connections")}
                      </h3>
                      <div className="mt-3 grid gap-3">
                        {(project.dependencies.length > 0 ||
                          missingDependencyIssues.length > 0) && (
                          <div className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
                            <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                              {t("dependsOn")}
                            </p>
                            <ul className="mt-3 flex flex-wrap gap-1.5">
                              {dependencyItems.map((item) => {
                                if (!item) return null;
                                return (
                                  <li key={item.project.slug}>
                                    <Chip
                                      size="lg"
                                      tone="secondary"
                                      onClick={() => onSelectProject(item.project.slug)}
                                      className="hover:border-[color:var(--color-indigo-brand)] hover:text-[color:var(--color-text-primary)]"
                                    >
                                      <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
                                        {item.relationship.label}
                                      </span>
                                      <span>{item.project.name}</span>
                                    </Chip>
                                  </li>
                                );
                              })}
                              {missingDependencyIssues.map((issue) => (
                                <li key={`missing-${issue.dependencySlug}`}>
                                  <span
                                    data-testid={`project-drawer-missing-dependency-${issue.dependencySlug}`}
                                    className="rounded-chip border border-[color:var(--color-amber-source-a25)] bg-[color:var(--color-amber-source-a08)] px-2.5 py-1 text-body text-[color:var(--color-status-warning)]"
                                  >
                                    {t("missingPrefix", { slug: issue.dependencySlug })}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {referencedBy.length > 0 && (
                          <div className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
                            <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                              {t("usedBy")}
                            </p>
                            <ul className="mt-3 flex flex-wrap gap-1.5">
                              {referencedByItems.map((item) => (
                                <li key={item.project.slug}>
                                  <Chip
                                    size="lg"
                                    tone="secondary"
                                    onClick={() => onSelectProject(item.project.slug)}
                                    className="hover:border-[color:var(--color-indigo-brand)] hover:text-[color:var(--color-text-primary)]"
                                  >
                                    <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
                                      {item.relationship.label}
                                    </span>
                                    <span>{item.project.name}</span>
                                  </Chip>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {relatedDocs.length > 0 && (
                          <div className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
                            <p className="flex items-center gap-1.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                              <BookOpen size={ICON_SIZE.sm} aria-hidden />
                              {t("relatedDocs", { count: relatedDocs.length })}
                            </p>
                            <ul className="mt-3 flex flex-col gap-1">
                              {relatedDocs.map((m) => {
                                const hasExcerpt = m.doc.excerpt.trim().length > 0;
                                return (
                                  <li key={m.doc.slug}>
                                    <Link
                                      href={buildDocsVaultHref({ slug: m.doc.slug })}
                                      className={controlClass({ shape: "row", size: "sm", tone: "secondary", className: "group flex-col items-start gap-1 border border-transparent hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]" })}
                                    >
                                      <span className="flex items-center gap-2">
                                        <span className="flex-1 truncate">
                                          {m.doc.title}
                                        </span>
                                        <span
                                          className="font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]"
                                          title={m.reasons.join(', ')}
                                        >
                                          {m.reasons[0]}
                                        </span>
                                      </span>
                                      {hasExcerpt && (
                                        <p className="hidden line-clamp-2 text-label leading-label text-[color:var(--color-text-quaternary)] [@media(hover:hover)]:group-hover:block">
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
                    <details className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3">
                      <summary className=" list-none text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                        {t("moreScreensAndRecords")}
                      </summary>
                      <div className="mt-4 space-y-5 border-t border-[color:var(--color-border-soft)] pt-4">
                        {project.screenshots[0] && (
                          <section>
                            <h3 className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                              {t("screenshotsTitle")}
                            </h3>
                            <div className="mt-3 overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)]">
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
                            <h3 className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                              {t("timelineTitle")}
                            </h3>
                            <dl className="mt-3 space-y-2 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4 text-body-lg text-[color:var(--color-text-secondary)]">
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
                            <h3 className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                              {t("linksTitle")}
                            </h3>
                            <ul className="mt-3 space-y-2 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4">
                              {project.links.map((link, idx) => (
                                <li key={`${link.url}-${idx}`}>
                                  <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={controlClass({ shape: "link", tone: "accent", className: "gap-1.5 text-body-lg hover:text-[color:var(--color-indigo-hover)]" })}
                                  >
                                    <ArrowUpRight size={ICON_SIZE.md} aria-hidden />
                                    {link.label}
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
                <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
                  {t.rich("footerUpdated", {
                    slug: project.slug,
                    date: formatDate(project.updatedAt),
                    value: (chunks) => <span className="normal-case tracking-normal">{chunks}</span>,
                  })}
                </p>
              </footer>
            </motion.div>
          </AnimatePresence>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
