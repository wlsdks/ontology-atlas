"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { badgeClass } from "@/shared/ui/badge-class";
import Image from "next/image";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from "framer-motion";
import { EXIT_TRANSITION, MOTION, OVERLAY_SPRING } from "@/shared/motion";
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
   * Callback for the "open topology" CTA when a Layer 0 container's synthetic project
   * is selected, performing the real `?pj=` zoom-in. It is an explicit step so entry
   * happens in two steps inside the drawer rather than immediately on click.
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
  // The Layer 1 drawer title also drops the container-name prefix: "Demo Reactor ·
  // Router" → "Router" (the breadcrumb chip already carries the container context).
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
  // Mobile bottom-sheet style: swiping down closes only from the drag handle bar. It is
  // controlled with dragListener=false so it does not fight the content area's vertical scroll.
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

  // Move focus to the close button when the drawer opens, so screen-reader and keyboard
  // users enter the new context directly. On close it returns to the browser's default
  // focus flow (the canvas pane can take focus).
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
  // rank16 (design council B6) — the 4 impact-mode pills are each a different graph
  // operation, so the help text has to differ per mode. The active mode's help key is
  // looked up here, in one place, and used for both the helper span and the crossfade
  // animation key.
  const impactModeHelpKey =
    IMPACT_MODE_COPY_KEYS.find((item) => item.mode === impactMode)?.helpKey ??
    "impactHelpNone";

  /*
   * Impact mode is an **exclusive single selection** (`none` is inside the options as
   * the «off» value, making it a textbook radiogroup, and re-clicking does not clear
   * it). Siblings previously carried `aria-pressed` side by side, which left **the
   * exclusivity out of the accessibility tree**.
   *
   * The container stays as it is — `shape:'pill'` plus an uppercase mono caption is not
   * a value-layer chip-ramp combination (the decision rule from 2026-08-15 (8): drawn
   * as a stock chip means a variant; carrying its own tone/pill geometry means the hook
   * directly).
   */
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

  // Related documents — the top 5 md files in the source vault citing this project.
  // Without permission the section is hidden entirely (so admin document links do not
  // leak to guests or signed-out users).
  // Importing the manifest directly would always surface dogfood documents regardless
  // of the "view the example business" choice, pointing at a different vault from the
  // rest of the screen.
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
  // The detail page URL — it keeps the container context (`?pj=`) so a user who arrived
  // from a zoom-in returns to the same container view on going back.
  const detailHref = project
    ? getProjectRuntimeDetailHref(project.slug)
    : "#";
  // The top related document's slug — with one, the source vault deep-links straight to
  // that document; without one, the vault home ('/docs/'). The URL format is delegated
  // to buildDocsVaultHref.
  const primaryRelatedDocSlug = relatedDocs[0]?.doc.slug ?? null;
  const docsVaultHref = buildDocsVaultHref({ slug: primaryRelatedDocSlug });
  // `<Link>`'s default click was reported to race with framer-motion's drag properties
  // and the drawer unmount, occasionally losing the navigation. onClick pushes through
  // the router explicitly so navigation kicks off before the drawer closes. The Link's
  // href is kept identical as a backup, preserving hover prefetch and middle-click
  // (new tab).
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
          ref={asideRef}
          role="dialog"
          aria-modal="true"
          aria-label={project ? t("ariaLabelWithName", { name: project.name }) : t("ariaLabelFallback")}
          aria-describedby={project ? `project-drawer-summary-${project.slug}` : undefined}
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1, y: 0 }}
          exit={{ x: "100%", opacity: 0, pointerEvents: "none", transition: EXIT_TRANSITION }}
          // Migrated to the critically damped overlay spring (2026-07-28). The old
          // `SPRING.sheet` (stiffness 280 / damping 30) was underdamped and overshot, and
          // it was an **unregistered exception** with this as its only consumer — this
          // surface alone bounced, with no registration and no gate. In an app whose
          // identity is restraint, overshoot is something to approve explicitly.
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
            {/*
              The area you swipe down to close. The padding around the handle bar is
              included in the touch target. On desktop (md+) the drag target itself is
              hidden, so no swipe is attached.
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
              initial={{ opacity: 0, x: 18, y: 6 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: -14, y: -4, pointerEvents: "none", transition: EXIT_TRANSITION }}
              transition={MOTION.base}
              className="flex-1 px-4 py-4 md:px-6 md:py-6"
            >
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={MOTION.base}
                /* The hero is an in-flow content card scrolling inside the drawer — the
                 * sheet step (rounded-sheet) belongs to a floating surface and cannot be
                 * used here. At 20px the container was rounder than its child icon tiles
                 * (12px), which also inverted the nesting grammar. */
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
                    {/* A container synthetic has no meaningful lifecycle status (in
                        development and so on), and progress carries an arbitrary 0–100
                        value that invites misreading. For a container the eyebrow line is
                        hidden entirely. */}
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
                    // Layer 0 container: enter the hub/node map inside this project. No
                    // navigation to a detail page (a container has no separate detail route).
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
                    // Layer 0 hub — the container has not been entered yet. The primary
                    // action is "zoom in to the container this hub belongs to".
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
                    // Layer 1 hub — already focused on this hub inside that container.
                    // "Open topology" would contradict itself (it is already open). The
                    // drawer body (description · connected projects · basic info) already
                    // plays the "detail" role, so the primary CTA is omitted; the canvas
                    // focus state carries the visual detail.
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
                      {/* The drawer mounts only inside the topology view, so openTopology
                          was a self-link no-op. First principle: ontology, topology and
                          docs are three projections of the same vault document → the
                          cross-link missing here is the ontology tree. A
                          `project:<slug>` deep link opens the full detail (FullDetailA1)
                          automatically (and where fm.slug differs from the filename, a
                          failed match still loads the page gracefully). */}
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


              {/* The "what is this connected to" section is a meaning mismatch for a
                  container: a container is a set of hubs, not an entity with edges to
                  other projects. The primary CTA "open topology" already provides the
                  internal exploration route, so this section is shown for hubs and nodes
                  only. */}
              {!isContainerNode && (
                <motion.section
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
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

              {/* For a container, tags, links and status are all empty, so the "show more
                  basic info" expander would open onto blank cells. Shown for hubs and
                  nodes only. */}
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
                          {/* rank16 — only the helper text crossfades over 120ms on a mode
                              switch (on a confirmed click, not on hover). It is a pure text
                              swap unrelated to node selection or drag physics, so the
                              per-mode wording has to register immediately. */}
                          <AnimatePresence mode="wait" initial={false}>
                            {/* Give it time even under reduced motion (2026-07-28). This is
                                an **opacity-only** text swap with no movement axis touching
                                the vestibular system at all — turning it off loses only the
                                information "the wording changed" and gains nothing (the same
                                shape as the tour card fixed the same day). */}
                            <motion.span
                              key={impactModeHelpKey}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0, pointerEvents: "none", transition: EXIT_TRANSITION }}
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
                        {/* rank16 (design council B6) — the 4 pills trigger different graph
                            operations (no emphasis / dependency closure / dependent closure
                            / bidirectional closure) while previously having no title or
                            aria-label at all, so even hover could not distinguish the
                            direction. title (the mouse tooltip) carries the per-mode help,
                            and aria-label leads with the visual label (Label-in-Name) so
                            screen readers and touch get the same information — never depend
                            on title alone. */}
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
                                    {link.label}
                                    <ArrowUpRight size={ICON_SIZE.md} />
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
