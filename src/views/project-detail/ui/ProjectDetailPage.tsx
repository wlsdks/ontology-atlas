"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, FileText, FolderSearch, Layers, Waypoints } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useLocale, useTranslations } from "next-intl";
import { OpenVaultCta } from "@/features/docs-vault-local";
import { useTypingShortcuts } from "@/shared/lib/use-typing-shortcut";
import { useClaimShellKey } from "@/shared/lib/shell-key-claims";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { formatDate } from "@/shared/lib/format-date";
import { MOTION } from "@/shared/motion";
import {
  Button,
  EmptyState,
  InlineEditable,
  OntologyMapKindGlyph,
  controlClass,
  useToast,
} from "@/shared/ui";
import {
  getProjectEditHref,
  getProjectRuntimeDetailHref,
  getTopologyProjectNodeHref,
  projectDisplayName,
  projectHasDisplayName,
  type Project,
} from "@/entities/project";
import {
  useProjects,
  useProjectMutations,
  useProjectBody,
  useVaultDocs,
  useVaultManifest,
} from "@/features/project-data-source";
import { buildDocsVaultHref, findProjectDocInList, hasSeveralProjectDocs } from "@/entities/docs-vault";
import { VaultConflictError, useLocalVault } from "@/entities/vault-session";
import { buildProjectOntologyMetrics, computeCanonicalCensus, resolveNodeAgentTarget } from "@/entities/knowledge-graph";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";
import { useChatWidth } from "@/widgets/acp-chat-panel";
import { useProjectAgent } from "../lib/use-project-agent";
import { ProjectAgentDock } from "./parts/ProjectAgentDock";
import { useOntologyInsight } from "@/features/vault-ontology";
import { CopyProjectLinkButton } from "@/features/project-share";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { useViewportBelow } from "@/shared/lib/use-viewport-below";
import { useFailureSentence } from "@/shared/lib/use-failure-sentence";
import { useTaxonomy } from "@/features/taxonomy";
import { ProjectQuickEditPanel } from "@/features/project-quick-edit";
import { useConstructionReviewSession } from "@/features/construction-review-local";
import { resolveSubscribeUpdate } from "../model/resolve-subscribe-update";
import { resolveProjectTagline } from "../model/project-tagline";
import { stripDuplicateHeading } from "../model/strip-duplicate-heading";
import { buildProjectDomainComposition } from "../model/domain-composition";
import { buildSurfaceComposition } from "../model/surface-composition";
import { buildConnectedProjects, findRelatesGraphProjectSlugs } from "../model/connected-projects";
import { buildAgentHandoffSnippet } from "../model/agent-handoff-snippet";
import { DomainCompositionRows } from "./DomainCompositionRows";
import { ProjectBriefSummary } from "./ProjectBriefSummary";
import { SurfaceCompositionBoard } from "./SurfaceCompositionBoard";
import { splitProjectBrief } from "../model/project-brief";
import { ConstructionReviewPanel } from "./construction-review/ConstructionReviewPanel";

const SearchPalette = dynamic(
  () => import("@/widgets/search-palette").then((m) => m.SearchPalette),
  { ssr: false },
);

interface Props {
  slug: string;
  initialProject?: Project | null;
  initialRelated?: Project[];
}

function ProjectDetailShell({
  children,
  dock = null,
  dockOpen = false,
}: {
  children: ReactNode;
  dock?: ReactNode;
  dockOpen?: boolean;
}) {
  // Below `xl` the open dock covers the page, so the page leaves the Tab order too.
  const dockCoversPage = useViewportBelow(1280) && dockOpen;
  return (
    // The dock is a sticky sibling of `main`: a column from `xl`, an overlay below it.
    <div className="relative flex min-h-full w-full">
      {/* Base `pb` plus an `lg:` override, since `max-lg:pb-[...]` loses to `md:py-14` by stylesheet
          order. The inset sits inside the cap, as `PAGE_FRAME` does on `/projects`. */}
      <main id="main" tabIndex={-1} inert={dockCoversPage} className="topology-ui-scale min-w-0 flex-1 bg-[color:var(--color-canvas)] px-[max(1.5rem,env(safe-area-inset-left))] pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)] md:px-0 md:pt-12 lg:pb-[max(3.5rem,env(safe-area-inset-bottom))]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={MOTION.base}
          // A named container: with the dock open the column is narrower than the viewport.
          className="@container/project-page mx-auto w-full max-w-[var(--page-max)] md:pr-[max(2.5rem,env(safe-area-inset-right))] md:pl-[max(2.5rem,env(safe-area-inset-left))]"
        >
          {children}
        </motion.div>
      </main>
      {dock}
    </div>
  );
}

function ProjectDetailTopBar({
  slug,
  projectName,
  projectDocSlug,
}: {
  slug?: string;
  projectName?: string | null;
  /** When known, the documents door opens the file this page is drawn from, not the vault root. */
  projectDocSlug?: string | null;
}) {
  const t = useTranslations("projectPages.detail");
  /** The map's address, not `/`, which is the gateway. */
  const workspaceHref = '/topology/';
  const projectsListHref = '/projects/';
  const docsVaultHref = projectDocSlug ? buildDocsVaultHref({ slug: projectDocSlug }) : '/docs/';
  return (
    /* Every piece on a ramp step, or the separator inherits 16px and outweighs the data. */
    <nav className="flex flex-wrap items-center gap-3">
      <Link
        href={workspaceHref}
        className={controlClass({
          shape: "link",
          size: "lg",
          className:
            "touch-hit-expand gap-1.5 break-keep hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]",
        })}
        aria-label={t("topBarBackToWorkspaceAria")}
      >
        <ArrowLeft size={ICON_SIZE.md} />
        {t("topBarWorkspaceFallback")}
      </Link>
      <span aria-hidden className="text-label text-[color:var(--color-text-quaternary)]">
        ▸
      </span>
      <Link
        href={projectsListHref}
        className={controlClass({ shape: "link", size: "lg", tone: "muted", className: "hover:text-[color:var(--color-text-primary)]" })}
      >
        {t("topBarProjectsLabel")}
      </Link>
      <span aria-hidden className="text-label text-[color:var(--color-text-quaternary)]">
        ▸
      </span>
      {/* The display name in sans, since mono doubles Korean word gaps; truncates in the room left. */}
      <span aria-current="page" className="min-w-0 flex-1 basis-32 truncate text-body text-[color:var(--color-text-primary)]">
        {projectName ?? slug ?? t("topBarProjectFallback")}
      </span>

      <div className="ml-auto hidden items-center gap-2 sm:flex">
        <Link href={docsVaultHref} data-testid="project-detail-docs-vault-link">
          <Button type="button" variant="ghost" size="sm">
            <BookOpen size={ICON_SIZE.md} aria-hidden="true" />
            {t("topBarDocsVault")}
          </Button>
        </Link>
        {slug ? (
          <CopyProjectLinkButton slug={slug} testId="project-detail-copy-link" className="justify-center" />
        ) : null}
      </div>
    </nav>
  );
}

function ProjectDetailState({
  title,
  description,
  testId,
  slug,
}: {
  title: string;
  description: string;
  testId: string;
  slug?: string;
}) {
  const t = useTranslations("projectPages.detail");
  return (
    <ProjectDetailShell>
      <ProjectDetailTopBar slug={slug} />
      <div className="mx-auto mt-16 w-full max-w-lg">
        <EmptyState
          titleAs="h1"
          tone="solid"
          align="center"
          icon={<FolderSearch size={ICON_SIZE.lg} aria-hidden />}
          /* A heading step, since a sentence stands under it. */
          title={
            <span
              data-testid={testId}
              className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
            >
              {title}
            </span>
          }
          description={description}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link href={'/projects/'}>
                <Button type="button" variant="primary" size="sm">
                  {t("stateBackToWorkspace")}
                </Button>
              </Link>
              <Link href={'/topology/'}>
                <Button type="button" variant="outline" size="sm">
                  {t("stateBackToMap")}
                </Button>
              </Link>
            </div>
          }
        />
      </div>
    </ProjectDetailShell>
  );
}

export function ProjectDetailPage({
  slug,
  initialProject = null,
  initialRelated = [],
}: Props) {
  const t = useTranslations("projectPages.detail");
  const failureSentence = useFailureSentence();
  const router = useRouter();
  const constructionReview = useConstructionReviewSession(slug);
  const { show: showToast } = useToast();
  const [project, setProject] = useState<Project | null>(
    initialProject,
  );
  const [related, setRelated] = useState<Project[]>(
    initialRelated,
  );
  const [resolved, setResolved] = useState(
    !slug || Boolean(initialProject),
  );
  const { statusLabel: rawStatusLabel } = useTaxonomy();
  // A missing value stays undefined; 'active' is the form's legacy fallback id (to-input.ts).
  const statusLabel = (id: string | undefined): string =>
    id === "active" ? t("statusActive") : rawStatusLabel(id);

  // Cmd+K opens this page's own palette in place; the shell's search stands aside here.
  const [searchOpen, setSearchOpen] = useState(false);
  useClaimShellKey("search");
  useTypingShortcuts([
    {
      combo: { key: "k", meta: true },
      onFire: () => setSearchOpen((v) => !v),
    },
  ]);
  const handleSearchSelect = useCallback(
    (nextSlug: string) => {
      setSearchOpen(false);
      if (nextSlug === slug) return;
      router.push(getProjectRuntimeDetailHref(nextSlug));
    },
    [router, slug],
  );

  // The display name the map, INDEX and Library draw; the document title is set client-side.
  const locale = useLocale();
  const displayName = project ? projectDisplayName(project, locale) : undefined;
  useDocumentTitle(
    Array.from(
      new Set(
        [displayName, t("documentTitleSuffix")].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    ).join(" · ") || null,
  );

  const projectsQuery = useProjects();
  const projectMutations = useProjectMutations();
  // Most documents have no `detail:` field, so the body is read from the file itself.
  const { body: vaultBody } = useProjectBody(project?.slug ?? null);
  const bodyContent = project?.detail ?? vaultBody ?? null;
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const { next, related: nextRelated } = resolveSubscribeUpdate(
      projectsQuery.projects,
      slug,
    );
    window.queueMicrotask(() => {
      if (cancelled) return;
      if (next) {
        setProject(next);
      } else if (projectsQuery.loaded || projectsQuery.error !== null) {
        // A settled local source is the only truth, even for a slug the static data knows.
        setProject(null);
      }
      setRelated(nextRelated);
      if (projectsQuery.loaded || projectsQuery.error !== null) setResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    projectsQuery.projects,
    projectsQuery.loaded,
    projectsQuery.error,
    slug,
  ]);

  const { insight } = useOntologyInsight();
  const insightNodes = insight?.nodes ?? [];
  const insightEdges = insight?.edges ?? [];
  const localVault = useLocalVault();
  const nativeVaultRootPath = localVault.handle ? (getTauriVaultRootPath(localVault.handle) ?? null) : null;
  const agent = useProjectAgent(nativeVaultRootPath);
  const chatWidth = useChatWidth();
  const insightNodeList = insight?.nodes;
  const agentKnownSlugs = useMemo(
    () => new Set((insightNodeList ?? []).map((node) => resolveNodeAgentTarget(node).ref ?? node.id)),
    [insightNodeList],
  );

  const handoffCopy = useCopyFeedback();
  const briefCopy = useCopyFeedback();
  const vaultDocs = useVaultDocs();
  // One manifest, so sources and wiki pages are counted from the same folder.
  const vaultManifest = useVaultManifest();

  if (!slug) {
    return (
      <ProjectDetailState
        testId="project-detail-invalid"
        title={t("stateInvalidTitle")}
        description={t("stateInvalidDesc")}
        slug={slug}
      />
    );
  }

  if (!project) {
    if (!resolved) {
      return (
        <ProjectDetailState
          testId="project-detail-loading"
          title={t("stateLoadingTitle")}
          description={t("stateLoadingDesc")}
          slug={slug}
        />
      );
    }

    return (
        <ProjectDetailState
          testId="project-detail-not-found"
          title={t("stateNotFoundTitle")}
          description={t("stateNotFoundDesc")}
          slug={slug}
        />
      );
  }

  const projectDoc = findProjectDocInList(vaultDocs, project.slug);
  const metrics = buildProjectOntologyMetrics(insightNodes, insightEdges, project.slug);
  const folderCensus = computeCanonicalCensus(insightNodes, insightEdges);
  const domainComposition = buildProjectDomainComposition(insightNodes, insightEdges, project.slug);
  // Ontology figures are this project's; sources and wiki pages are the folder's, as the caption says.
  const surfaceCells = buildSurfaceComposition({
    metrics,
    domains: domainComposition.domains,
    manifest: vaultManifest,
    docs: vaultDocs,
    labels: {
      domains: t("metricDomains"),
      capabilities: t("metricCapabilities"),
      elements: t("metricElements"),
      sources: t("surfaceSources"),
      wikiPages: t("surfaceWikiPages"),
      planOnlyDomains: (count) => t("surfacePlanOnly", { count }),
      relations: (count) => t("surfaceRelations", { count }),
      ontologyEmpty: t("surfaceOntologyEmpty"),
      libraryEmpty: t("surfaceLibraryEmpty"),
      harnessHolds: t("surfaceHarnessHolds"),
    },
    hrefs: {
      ontology: getTopologyProjectNodeHref(project.slug),
      library: "/library/",
      harness: "/architecture/",
    },
  });
  const relatesGraphSlugs = findRelatesGraphProjectSlugs(insightNodes, insightEdges, project.slug);
  const connectedProjects = buildConnectedProjects(project, related, relatesGraphSlugs);
  // One project cannot be connected, so the card is not drawn; documents decide, not `related`,
  // which starts as every bundled project and would flash the card.
  const folderHasSeveralProjects = hasSeveralProjectDocs(vaultDocs);
  const handoffSnippet = buildAgentHandoffSnippet(project.slug);

  const canManageProject = projectMutations.canEdit;
  /* A sentence in the page's language inside `saveErrorPrefix`; the raw error goes to the console only. */
  const projectSaveErrorMessage = (err: unknown) => {
    if (err instanceof VaultConflictError) return t("saveErrorConflict");
    const failure = failureSentence(err, t("saveErrorGeneric"));
    if (failure.detail) console.error("project save failed", failure.detail);
    return failure.sentence;
  };
  const saveProjectField = async (
    field: "name" | "description",
    next: string,
  ) => {
    if (!project || !canManageProject) return;
    try {
      // Edits the display key when the document has one, the word the person sees.
      await projectMutations.patchProject(
        project.slug,
        field === "name"
          ? projectHasDisplayName(project, locale)
            ? { displayName: { locale, value: next } }
            : { name: next }
          : { description: next.trim() ? next : null },
      );
      showToast(field === "name" ? t("saveSuccessName") : t("saveSuccessDescription"), "success");
    } catch (err) {
      const message = projectSaveErrorMessage(err);
      showToast(t("saveErrorPrefix", { message }), "error");
      throw err;
    }
  };

  const heroTagline = resolveProjectTagline({ description: project.description });
  const dedupedBodyContent = stripDuplicateHeading(bodyContent, project.name);
  const heroMeta = [
    project.isHub ? t("heroLabelHub") : t("heroLabel"),
    // statusLabel(undefined) is a truthy "—" that would survive the filter.
    project.status ? statusLabel(project.status) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  /* Hierarchy from weight and space within the existing ramp, not a new size step; the size lives
     here, not string-patched at the call site where a renamed token would silently do nothing. */
  const storyMarkdownClassName =
    "text-body-lg leading-prose text-[color:var(--color-text-secondary)] [&>*:first-child]:mt-0 [&_a]:text-[color:var(--color-indigo-accent)] [&_a]:underline-offset-2 [&_a:hover]:text-[color:var(--color-indigo-hover)] [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-[color:var(--color-border-strong)] [&_blockquote]:pl-3.5 [&_blockquote]:text-[color:var(--color-text-tertiary)] [&_code]:rounded-micro [&_code]:border [&_code]:border-[color:var(--color-border-soft)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-body [&_code]:text-[color:var(--color-text-tertiary)] [&_h1]:mt-9 [&_h1]:mb-3 [&_h1]:text-title [&_h1]:font-[var(--font-weight-strong)] [&_h1]:tracking-title [&_h1]:text-[color:var(--color-text-primary)] [&_h2]:mt-9 [&_h2]:mb-3 [&_h2]:text-title [&_h2]:font-[var(--font-weight-strong)] [&_h2]:tracking-title [&_h2]:text-[color:var(--color-text-primary)] [&_h3]:mt-7 [&_h3]:mb-2 [&_h3]:text-body-lg [&_h3]:font-[var(--font-weight-strong)] [&_h3]:text-[color:var(--color-text-primary)] [&_hr]:my-7 [&_hr]:border-[color:var(--color-border-soft)] [&_li]:mb-1.5 [&_li]:list-disc [&_li]:pl-1 [&_li::marker]:text-[color:var(--color-text-quaternary)] [&_ol]:my-3 [&_ol]:pl-5.5 [&_p]:mb-3.5 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-[var(--radius-card)] [&_pre]:border [&_pre]:border-[color:var(--color-border-soft)] [&_pre]:bg-[color:var(--color-overlay-1)] [&_pre]:p-3.5 [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-body [&_strong]:font-[var(--font-weight-strong)] [&_strong]:text-[color:var(--color-text-primary)] [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border-t [&_td]:border-[color:var(--color-divider)] [&_td]:py-2 [&_td]:pr-4 [&_th]:pb-2 [&_th]:pr-4 [&_th]:text-left [&_th]:font-mono [&_th]:text-caption [&_th]:uppercase [&_th]:tracking-caption [&_th]:text-[color:var(--color-text-quaternary)] [&_ul]:my-3 [&_ul]:pl-5.5";
  const projectFullEditHref = getProjectEditHref(project.slug, {
    returnTo: getProjectRuntimeDetailHref(project.slug),
  });

  const handleCopyHandoff = () => {
    void handoffCopy.copy(handoffSnippet);
  };
  const handoffCopyLabel =
    handoffCopy.state === "copied"
      ? t("handoffCopiedLabel")
      : handoffCopy.state === "failed"
        ? t("handoffCopyErrorLabel")
        : t("handoffCopyLabel");
  const briefIsStructured = splitProjectBrief(dedupedBodyContent).sections.length > 0;
  const briefPrompt = t("briefPrompt", { slug: project.slug, doc: projectDoc?.path ?? `${project.slug}.md` });
  const briefCopyLabel =
    briefCopy.state === "copied"
      ? t("briefAskCopied")
      : briefCopy.state === "failed"
        ? t("briefAskCopyError")
        : t("briefAskCopy");

  return (
    <ProjectDetailShell
      dockOpen={agent.route === "agent" && Boolean(agent.runtime && nativeVaultRootPath) && agent.open}
      dock={
        agent.route === "agent" && agent.runtime && nativeVaultRootPath ? (
          <ProjectAgentDock
            open={agent.open}
            projectName={displayName ?? project.name}
            runtime={agent.runtime}
            runtimes={agent.runtimes}
            onRuntimeChange={agent.setRuntimeId}
            vaultRoot={nativeVaultRootPath}
            mcpServers={agent.mcpServers}
            openingRequest={agent.openingRequest}
            knownSlugs={agentKnownSlugs}
            onClose={() => agent.setOpen(false)}
            chatWidth={chatWidth}
          />
        ) : null
      }
    >
      <ProjectDetailTopBar
        slug={slug}
        projectName={displayName ?? project.name}
        projectDocSlug={projectDoc?.slug ?? null}
      />

      <header className="@container/project-hero mt-6 flex flex-col gap-6 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] shadow-[inset_0_1px_0_var(--color-overlay-1)]">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Actions sit beside the name only when the band itself is `@5xl` wide, not the viewport,
              which the dock narrows; otherwise the buttons take their own row. */}
          <div className="flex min-w-0 flex-wrap items-start gap-x-8 gap-y-4 @5xl/project-hero:flex-nowrap">
            <div className="min-w-0 flex-1 basis-96">
              {/* The glyph leads the name inside its line, as the list's cards draw it, so the band has one start line. */}
              <div className="flex min-w-0 items-center gap-2.5">
                <OntologyMapKindGlyph kind="project" size={ICON_SIZE.lg} className="shrink-0" />
                <InlineEditable
                  as="h1"
                  value={displayName ?? project.name}
                  editable={canManageProject}
                  onSave={(next) => saveProjectField("name", next)}
                  ariaLabel={t("inlineNameAria")}
                  className="min-w-0 text-display leading-display-tight font-[var(--font-weight-strong)] tracking-[var(--tracking-card)] text-pretty text-[color:var(--color-text-primary)]"
                />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-[color:var(--color-text-tertiary)]">
                <span>{heroMeta}</span>
                <span aria-hidden className="text-[color:var(--color-text-quaternary)]">
                  ·
                </span>
                <span>{t("heroUpdatedAt", { date: formatDate(project.updatedAt) })}</span>
              </div>
              <InlineEditable
                as="p"
                multiline
                value={heroTagline ?? project.description}
                editable={canManageProject}
                onSave={(next) => saveProjectField("description", next)}
                ariaLabel={t("inlineDescriptionAria")}
                placeholder={t("inlineDescriptionPlaceholder")}
                dataTestId="project-detail-description"
                // The overview prose's own box, so hero and card words share both edges.
                className="mt-2.5 max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))] break-keep text-body-lg leading-body-lg text-pretty text-[color:var(--color-text-secondary)]"
              />
            </div>
            {/* Shrinks and wraps, or at 390px the actions push the page wider. */}
            <div className="flex min-w-0 basis-full flex-wrap items-center gap-2 @5xl/project-hero:ml-auto @5xl/project-hero:basis-auto">
              {/* Opening on the map is the one filled control; the reviewer's picker is second, outlined. */}
              <Link href={getTopologyProjectNodeHref(project.slug)} data-testid="project-detail-topology-link">
                <Button type="button" variant="primary" size="sm">
                  {t("topBarTopologyView")}
                </Button>
              </Link>
              <input
                {...constructionReview.inputProps}
                data-testid="construction-review-ingress"
                aria-label={t("constructionReview.openResult")}
                className="sr-only"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={constructionReview.status === "reading"}
                onClick={constructionReview.openPicker}
              >
                <FileText size={ICON_SIZE.md} aria-hidden="true" />
                {constructionReview.status === "reading"
                  ? t("constructionReview.readingResult")
                  : t("constructionReview.openResult")}
              </Button>
              {canManageProject ? (
                <ProjectQuickEditPanel
                  project={project}
                  settingsHref={projectFullEditHref}
                  triggerVariant="outline"
                  displayName={displayName ?? null}
                  displayLocale={locale}
                />
              ) : null}
            </div>
          </div>

          {/* View-only: the reason and the control that makes it editable, under the words it concerns. */}
          {canManageProject ? null : (
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <span
                data-testid="project-detail-readonly-badge"
                className="min-w-0 break-keep text-label leading-body text-[color:var(--color-text-tertiary)]"
              >
                {t("readOnlyBadge")}
              </span>
              <OpenVaultCta testId="project-detail-open-vault" />
            </div>
          )}

        </div>
      </header>

      {constructionReview.status === "ready" && constructionReview.review ? (
        <ConstructionReviewPanel
          key={`${constructionReview.review.sourceDigest}:${constructionReview.review.planDigest}`}
          review={constructionReview.review}
        />
      ) : null}

      {constructionReview.status === "blocked" && constructionReview.errorState ? (
        <section
          data-testid="construction-review-error"
          data-envelope-state={constructionReview.errorState}
          className="mt-[var(--section-gap)] rounded-panel border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] p-[var(--card-pad)] sm:px-5"
        >
          <h2 className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-danger-text)]">
            {t("constructionReview.errorTitle")}
          </h2>
          <p className="mt-1.5 text-body leading-prose text-[color:var(--color-text-secondary)]">
            {t(`constructionReview.errors.${constructionReview.errorState}`)}
          </p>
        </section>
      ) : null}

      {/* The page's first answer: how much of each Atlas surface is built for this project. */}
      <section data-testid="project-detail-composition" className="mt-[var(--section-gap)]">
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            {t("compositionHeading")}
          </h2>
          {/* Only the ontology half is this project's; the caption says the rest counts the folder. */}
          <span className="text-label text-[color:var(--color-text-quaternary)]">
            {t("surfaceFolderScope")}
          </span>
          {/* The folder's concept count by `computeCanonicalCensus`, the map INDEX's rule; no folder
              relation count beside the cell's differently scoped one. */}
          <span
            data-testid="project-detail-global-census"
            className="ml-auto hidden text-label tabular-nums text-[color:var(--color-text-tertiary)] md:inline"
          >
            {t("globalCensus", { concepts: folderCensus.conceptCount })}
          </span>
        </div>
        <SurfaceCompositionBoard
          cells={surfaceCells}
          titles={{
            ontology: t("surfaceOntology"),
            library: t("surfaceLibrary"),
            harness: t("surfaceHarness"),
          }}
          // No ontology door: the hero's primary action already opens the map.
          openLabels={{
            library: t("surfaceOpenLibrary"),
            harness: t("surfaceOpenHarness"),
          }}
        />
      </section>

      {/* One column of bands: nothing beside a list of unknown length can match its height. */}
      <section
        data-testid="project-detail-domains"
        className="mt-[var(--section-gap)] min-w-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] shadow-[inset_0_1px_0_var(--color-overlay-1)]"
      >
        <div className="mb-2.5 flex items-baseline gap-2">
          <span className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            {t("domainsCardTitle")}
          </span>
          <span className="text-body tabular-nums text-[color:var(--color-text-tertiary)]">
            {domainComposition.domains.length}
          </span>
        </div>
        {domainComposition.domains.length > 0 ? (
          <DomainCompositionRows
            domains={domainComposition.domains}
            labels={{
              capabilityUnit: t("domainCapabilityLabel"),
              elementUnit: t("domainElementLabel"),
              legendCaption: t("domainRowsLegendCaption"),
              overlapNote: t("domainOverlapNote"),
              rowToggleAria: (row) =>
                t("domainRowToggleAria", {
                  title: row.title,
                  total: row.total,
                  capabilities: row.capabilityCount,
                  elements: row.elementCount,
                }),
              mapLinkLabel: t("domainRowMapLink"),
              capabilityLinkAria: (title) => t("domainCapabilityLinkAria", { name: title }),
              capabilitiesEmpty: t("domainRowCapabilitiesEmpty"),
            }}
          />
        ) : (
          <div data-testid="project-detail-composition-empty">
            <EmptyState
              size="compact"
              icon={<Layers size={ICON_SIZE.lg} aria-hidden />}
              title={t("domainEmptyTitle")}
              description={t("domainEmptyHint")}
              action={
                <Link
                  href="/topology/?workbench=create"
                  data-testid="project-detail-composition-empty-action"
                  className={controlClass({
                    shape: "link",
                    tone: "accent",
                    hoverInk: "strong",
                    className: "rounded-chip hover:underline",
                  })}
                >
                  {t("domainEmptyAction")}
                </Link>
              }
            />
          </div>
        )}
      </section>

      <article
        data-testid="project-detail-body"
        className="mt-[var(--section-gap)] min-w-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] shadow-[inset_0_1px_0_var(--color-overlay-1)]"
      >
        <div className="p-[var(--card-pad)]">
          <div className="mb-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t("bodyCardTitle")}
            </span>
            {bodyContent ? (
              <Link
                href={projectDoc ? buildDocsVaultHref({ slug: projectDoc.slug }) : "/docs/"}
                data-testid="project-detail-body-continue"
                className={controlClass({ shape: "link", tone: "accent", className: "ml-auto" })}
              >
                {t("bodyContinue")}
              </Link>
            ) : null}
          </div>
          {bodyContent ? (
            <ProjectBriefSummary
              body={dedupedBodyContent ?? bodyContent}
              // The reading column (`docs/DECISIONS.md`, 2026-09-12), left-aligned inside a card, at
              // body-lg so it does not outrank the hero; hierarchy is weight and space, not size.
              proseClassName={`${storyMarkdownClassName} max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))]`}
              coversLabel={t("bodyCovers")}
              leadSentence={heroTagline}
              sectionNames={{
                includes: t("bodySectionIncludes"),
                excludes: t("bodySectionExcludes"),
                uncertainty: t("bodySectionUncertainty"),
                competencyAnswers: t("bodySectionCompetencyAnswers"),
              }}
            />
          ) : (
            <div data-testid="project-detail-body-empty">
              <EmptyState
                size="compact"
                icon={<FileText size={ICON_SIZE.lg} aria-hidden />}
                title={t("bodyEmptyHint")}
              />
            </div>
          )}
        </div>
        {/* The ask that rewrites this overview sits under it, since it is about these words. */}
        <div
          data-testid="project-detail-brief-ask"
          data-brief-state={briefIsStructured ? "structured" : "unstructured"}
          data-agent-route={agent.route}
          className="border-t border-[color:var(--color-divider)] px-[var(--card-pad)] py-3"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2.5">
            <p className="min-w-0 max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))] flex-1 basis-80 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
              {agent.route === "agent"
                ? t("briefAskAgent")
                : briefIsStructured
                  ? t("briefAskStructured")
                  : t("briefAskUnstructured")}
            </p>
            {agent.route === "agent" ? (
              <Button
                type="button"
                variant={briefIsStructured ? "outline" : "primary"}
                size="sm"
                onClick={() => agent.start(briefPrompt)}
                data-testid="project-detail-brief-ask-open"
                className="ml-auto"
              >
                {t("briefAskOpen")}
              </Button>
            ) : (
              <Button
                type="button"
                variant={briefIsStructured ? "outline" : "primary"}
                size="sm"
                onClick={() => void briefCopy.copy(briefPrompt)}
                data-testid="project-detail-brief-ask-copy"
                className="ml-auto"
              >
                {briefCopyLabel}
              </Button>
            )}
          </div>
          <details className="mt-2">
            <summary className="w-fit select-none text-body leading-body text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)]">
              {t("handoffHumanCaption")}
            </summary>
            <pre className="mt-2 max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))] overflow-x-auto font-mono text-body leading-prose whitespace-pre-wrap break-keep text-[color:var(--color-text-quaternary)]">
              {briefPrompt}
            </pre>
          </details>
        </div>
      </article>

      <aside
        data-testid="project-detail-connected"
        className={`mt-[var(--section-gap)] grid min-w-0 grid-cols-1 gap-[var(--card-gap)] ${
          connectedProjects.length > 0 || folderHasSeveralProjects ? "@3xl/project-page:grid-cols-2" : ""
        }`}
      >
        {connectedProjects.length > 0 || folderHasSeveralProjects ? (
          <section
            data-testid="project-detail-connected-card"
            className="min-w-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] shadow-[inset_0_1px_0_var(--color-overlay-1)]"
          >
            {/* No relation mark: `map-kind-glyph.tsx` is one per row, never a heading marker. */}
            <div className="mb-2.5 flex items-baseline gap-2">
              <span className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                {t("connectedTitle")}
              </span>
              <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                {t("connectedRelation")}
              </span>
            </div>
            {connectedProjects.length > 0 ? (
              <div className="space-y-2.5">
                {connectedProjects.slice(0, 1).map((candidate) => (
                  <Link
                    key={candidate.slug}
                    href={getProjectRuntimeDetailHref(candidate.slug)}
                    className={controlClass({ shape: "card", size: "lg", tone: "secondary", className: "gap-3 px-3 py-3 text-body-lg hover:border-[color:var(--color-indigo-a28)] hover:text-[color:var(--color-text-primary)]" })}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                        {projectDisplayName(candidate, locale)}
                      </p>
                      <p className="mt-1 truncate text-body text-[color:var(--color-text-tertiary)]">
                        {candidate.description || candidate.slug}
                      </p>
                    </div>
                  </Link>
                ))}
                {connectedProjects.length > 1 ? (
                  <p className="text-body text-[color:var(--color-text-tertiary)]">
                    {t("connectedMoreNote", { count: connectedProjects.length - 1 })}
                  </p>
                ) : null}
              </div>
            ) : (
              <div data-testid="project-detail-connected-empty">
                <EmptyState
                  size="compact"
                  icon={<Waypoints size={ICON_SIZE.lg} aria-hidden />}
                  title={t("connectedEmpty")}
                  /* Keeps Korean words whole; the shared `EmptyState` paragraph cannot carry it. */
                  description={<span className="break-keep">{t("connectedEmptyHint")}</span>}
                  action={
                    <Link
                      href="/projects/"
                      data-testid="project-detail-connected-empty-action"
                      className={controlClass({
                        shape: "link",
                        tone: "accent",
                        hoverInk: "strong",
                        className: "rounded-chip hover:underline",
                      })}
                    >
                      {t("connectedEmptyAction")}
                    </Link>
                  }
                />
              </div>
            )}
          </section>
        ) : null}

        <section
          data-testid="project-detail-handoff"
          className="@container/handoff min-w-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] shadow-[inset_0_1px_0_var(--color-overlay-1)]"
        >
          <div className="flex min-w-0 flex-col gap-3 @2xl/handoff:flex-row @2xl/handoff:items-center @2xl/handoff:gap-6">
            <div className="min-w-0 flex-1">
              <h2 className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                {t("handoffTitle")}
              </h2>
              <p className="mt-1.5 max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))] break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
                {t("handoffDesc")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyHandoff}
              data-testid="project-detail-handoff-copy"
              className="self-start @2xl/handoff:self-center"
            >
              {/* The longest label reserves the width, so "copied" does not resize the button. */}
              <span className="inline-grid">
                {[t("handoffCopyLabel"), t("handoffCopiedLabel"), t("handoffCopyErrorLabel")].map((option) => (
                  <span
                    key={option}
                    aria-hidden={option === handoffCopyLabel ? undefined : true}
                    className={
                      option === handoffCopyLabel ? "col-start-1 row-start-1" : "invisible col-start-1 row-start-1"
                    }
                  >
                    {option}
                  </span>
                ))}
              </span>
            </Button>
            <span className="sr-only" aria-live="polite" aria-atomic="true">
              {handoffCopy.state === "idle" ? "" : handoffCopyLabel}
            </span>
          </div>
          <details className="mt-3 border-t border-[color:var(--color-divider)] pt-3">
            <summary className="w-fit select-none text-body leading-body text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)]">
              {t("handoffHumanCaption")}
            </summary>
            <pre className="mt-2 max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))] overflow-x-auto font-mono text-body leading-prose whitespace-pre-wrap text-[color:var(--color-text-quaternary)]">
              {handoffSnippet}
            </pre>
          </details>
        </section>
      </aside>
      <footer className="mt-[var(--section-gap)] border-t border-[color:var(--color-overlay-2)] pt-6 pb-[var(--page-bottom-breath)]">
        {/* The slug and Markdown path a person types next; slug and date when the document is unknown. */}
        <p
          data-testid="project-detail-footer"
          className="font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]"
        >
          {projectDoc
            ? t.rich("footerSummaryDoc", {
                slug: project.slug,
                path: projectDoc.path,
                value: (chunks) => <span className="normal-case tracking-normal">{chunks}</span>,
              })
            : t.rich("footerSummary", {
                slug: project.slug,
                date: formatDate(project.updatedAt),
                value: (chunks) => <span className="normal-case tracking-normal">{chunks}</span>,
              })}
        </p>
      </footer>

      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        projects={related}
        onSelect={handleSearchSelect}
        containerLabel={null}
      />
    </ProjectDetailShell>
  );
}
