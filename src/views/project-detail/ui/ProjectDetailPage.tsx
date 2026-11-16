"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { PAGE_STAGE_FILL, PAGE_TITLE, PAGE_WAIT_LIFT } from "@/shared/ui/tokens/page-frame";
import { BrandPortrait } from "@/shared/ui/marks/brand-portrait";
import { useLocale, useTranslations } from "next-intl";
import { OpenVaultCta } from "@/features/docs-vault-local";
import { useTypingShortcuts } from "@/shared/lib/keyboard/use-typing-shortcut";
import { useClaimShellKey } from "@/shared/lib/keyboard/shell-key-claims";
import { formatDate } from "@/shared/lib/locale-text/format-date";
import { MOTION } from "@/shared/motion";
import {
  Button,
  FeatureStage,
  InlineEditable,
  OntologyMapKindGlyph,
  WaitStage,
  buttonVariants,
  controlClass,
  useToast,
} from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import {
  getProjectEditHref,
  getProjectRuntimeDetailHref,
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
import { buildDocsVaultHref, countWikiPages, findProjectDocInList } from "@/entities/docs-vault";
import { VaultConflictError, useLocalVault } from "@/entities/vault-session";
import { buildProjectOntologyMetrics, resolveNodeAgentTarget } from "@/entities/knowledge-graph";
import { getTauriVaultRootPath } from "@/shared/lib/vault-folder/tauri-vault-fs";
import { useChatWidth } from "@/widgets/acp-chat-panel";
import { useProjectAgent } from "../lib/use-project-agent";
import { ProjectAgentDock } from "./parts/ProjectAgentDock";
import {
  useAdaptiveRecentChanges,
  useMapEvidenceStates,
  useOntologyInsight,
  useVaultConceptFacts,
  type StaleEvidencePath,
} from "@/features/vault-ontology";
import { useDocumentTitle } from "@/shared/lib/public-pages/use-document-title";
import { useViewportBelow } from "@/shared/lib/use-viewport-below";
import { useFailureSentence } from "@/shared/lib/failures/use-failure-sentence";
import { useTaxonomy } from "@/features/taxonomy";
import { useConstructionReviewSession } from "@/features/construction-review-local";
import { resolveSubscribeUpdate } from "../model/resolve-subscribe-update";
import { resolveProjectTagline } from "../model/project-tagline";
import { stripDuplicateHeading } from "@/shared/lib/vault-document/strip-duplicate-heading";
import { buildProjectDomainComposition } from "../model/domain-composition";
import { buildConnectedProjects, findRelatesGraphProjectSlugs } from "../model/connected-projects";
import { buildAgentHandoffSnippet } from "../model/agent-handoff-snippet";
import { splitProjectBrief } from "../model/project-brief";
import { resolveProjectLead } from "../model/project-lead";
import { buildProjectToCheck, isProjectConcept } from "../model/project-to-check";
import { buildProjectChanged } from "../model/project-changed";
import { useProjectReviewRows } from "../model/use-project-review-rows";
import { DomainMasterDetail } from "./DomainMasterDetail";
import { ToCheckSection } from "./now/ToCheckSection";
import { ChangedSection } from "./now/ChangedSection";
import { SECTION_HEADING_CLASS } from "./now/now-parts";
import { ProjectActions } from "./ProjectActions";
import { ConstructionReviewPanel } from "./construction-review/ConstructionReviewPanel";

const NO_IDS: ReadonlySet<string> = new Set();
const NO_STALE_PATHS: ReadonlyMap<string, StaleEvidencePath> = new Map();
/** A2's three rows come before A3's in reading order, so A3's arrival continues the stagger. */
const TO_CHECK_ROWS_BEFORE_CHANGED = 3;

/* A lead paragraph needs no picture, and a remote one would be a request the reader did not ask for. */
const LEAD_MARKDOWN_COMPONENTS: Components = { img: ({ alt }) => <span>{alt}</span> };

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
  fillsHeight = false,
}: {
  children: ReactNode;
  dock?: ReactNode;
  dockOpen?: boolean;
  /** A page that is one centred stage stretches its column to the window's height. */
  fillsHeight?: boolean;
}) {
  // Below `xl` the open dock covers the page, so the page leaves the Tab order too.
  const dockCoversPage = useViewportBelow(1280) && dockOpen;
  return (
    // The dock is a sticky sibling of `main`: a column from `xl`, an overlay below it.
    <div className="relative flex min-h-full w-full">
      {/* Below `lg` the main reserves the tab bar; from `lg` the frame carries the breath, as `PAGE_FRAME` does. */}
      <main id="main" tabIndex={-1} inert={dockCoversPage} className={cn("topology-ui-scale min-w-0 flex-1 bg-[color:var(--color-canvas)] px-[max(1.5rem,env(safe-area-inset-left))] pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)] md:px-0 md:pt-12 lg:pb-0", fillsHeight && "flex flex-col")}>
        <motion.div
          // A stage brings its own entrance; rising here too would move it twice.
          initial={fillsHeight ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={MOTION.base}
          // A named container: with the dock open the column is narrower than the viewport.
          className={cn("@container/project-page mx-auto w-full max-w-[var(--page-max)] md:pr-[max(2.5rem,env(safe-area-inset-right))] md:pl-[max(2.5rem,env(safe-area-inset-left))] lg:pb-[max(3.5rem,env(safe-area-inset-bottom))]", fillsHeight && "flex flex-1 flex-col")}
        >
          {children}
        </motion.div>
      </main>
      {dock}
    </div>
  );
}

function ProjectDetailTopBar({ slug, projectName }: { slug?: string; projectName?: string | null }) {
  const t = useTranslations("projectPages.detail");
  return (
    <nav className="flex min-w-0 items-center gap-2.5">
      <Link
        href="/projects/"
        className={controlClass({ shape: "link", size: "lg", tone: "muted", className: "touch-hit-expand hover:text-[color:var(--color-text-primary)]" })}
      >
        {t("topBarProjectsLabel")}
      </Link>
      <ChevronRight aria-hidden size={ICON_SIZE.sm} className="shrink-0 text-[color:var(--color-text-quaternary)]" />
      {/* The display name in sans, since mono doubles Korean word gaps; truncates in the room left. */}
      <span aria-current="page" className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
        {projectName ?? slug ?? t("topBarProjectFallback")}
      </span>
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
    <ProjectDetailShell fillsHeight>
      <ProjectDetailTopBar slug={slug} />
      <div className={PAGE_STAGE_FILL}>
        <FeatureStage
          data-testid={testId}
          titleAs="h1"
          art={() => (
            <div className="flex justify-center">
              <BrandPortrait expression="curious" />
            </div>
          )}
          title={<span className="block text-balance">{title}</span>}
          body={description}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link href={'/projects/'} className={cn(buttonVariants({ variant: "primary", size: "lg" }), "atlas-touch-floor atlas-touch-floor-wide")}>
                {t("stateBackToWorkspace")}
              </Link>
              <Link href={'/topology/'} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "atlas-touch-floor atlas-touch-floor-wide")}>
                {t("stateBackToMap")}
              </Link>
            </div>
          }
        />
      </div>
    </ProjectDetailShell>
  );
}

function ProjectDetailLoading({ slug }: { slug: string }) {
  const t = useTranslations("projectPages.detail");
  return (
    <ProjectDetailShell fillsHeight>
      <ProjectDetailTopBar slug={slug} />
      <div className={cn(PAGE_STAGE_FILL, "relative")}>
        <WaitStage mark="mascot" delayed data-testid="project-detail-loading" className={PAGE_WAIT_LIFT} title={t("stateLoadingTitle")} />
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
  const tMapDial = useTranslations("mapDial");
  const tHex = useTranslations("topology.hexBoard");
  const tIndex = useTranslations("topology.index");
  const failureSentence = useFailureSentence();
  const router = useRouter();
  const constructionReview = useConstructionReviewSession(slug);
  const reviewOutcomeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (constructionReview.status === "ready" || constructionReview.status === "blocked") {
      const outcome = reviewOutcomeRef.current;
      outcome?.focus({ preventScroll: true });
      outcome?.scrollIntoView?.({ block: "start" });
    }
  }, [constructionReview.status]);
  const openReviewPicker = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus({ preventScroll: true });
    constructionReview.openPicker();
  };
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
  // A missing value stays undefined; 'active' is the derivation's fallback status id.
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

  const vaultDocs = useVaultDocs();
  // One manifest, so sources and wiki pages are counted from the same folder.
  const vaultManifest = useVaultManifest();
  const reducedMotion = useReducedMotion() ?? false;
  // The map's own walk and window, so the page and the map name the same states and days.
  const evidence = useMapEvidenceStates({ nodes: insightNodeList, enabled: true });
  const recentChanges = useAdaptiveRecentChanges();
  const reviewRows = useProjectReviewRows(vaultDocs);
  const conceptFacts = useVaultConceptFacts();

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
      return <ProjectDetailLoading slug={slug} />;
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
  const domainComposition = buildProjectDomainComposition(insightNodes, insightEdges, project.slug);
  const soleProject = insightNodes.filter((node) => node.kind === "project").length <= 1;
  const domainsOverlap =
    domainComposition.domains.reduce((sum, row) => sum + row.total, 0) > metrics.capabilities + metrics.elements;
  // Sources and wiki pages are the folder's; nothing ties a file to one project.
  const librarySources = vaultManifest?.sources?.length ?? 0;
  const libraryWikiPages = countWikiPages(vaultDocs);
  const evidenceMeasured = evidence.availability === "measured";
  const projectCapabilities = insightNodes.filter((node) => node.kind === "capability" && isProjectConcept(node, project.slug));
  const staleIds = evidenceMeasured
    ? new Set(projectCapabilities.filter((node) => evidence.states.get(node.id) === "stale").map((node) => node.id))
    : NO_IDS;
  const domainNameById = new Map<string, string>();
  for (const domain of domainComposition.domains) {
    domainNameById.set(domain.id, domain.title);
    for (const capability of domain.capabilities) if (!domainNameById.has(capability.id)) domainNameById.set(capability.id, domain.title);
  }
  const toCheck = buildProjectToCheck({
    nodes: insightNodes,
    projectSlug: project.slug,
    reviewRows,
    stalePaths: evidenceMeasured ? evidence.stalePaths : NO_STALE_PATHS,
    findingsBySlug: conceptFacts,
    domainNameById,
  });
  const changed = buildProjectChanged(recentChanges.reading ? [] : recentChanges.rows, insightNodes, project.slug);
  const relatesGraphSlugs = findRelatesGraphProjectSlugs(insightNodes, insightEdges, project.slug);
  const connectedProjects = buildConnectedProjects(project, related, relatesGraphSlugs);

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
  const leadParagraph = bodyContent ? resolveProjectLead(dedupedBodyContent ?? bodyContent, heroTagline) : "";
  const heroMeta = [
    project.isHub ? t("heroLabelHub") : soleProject ? null : t("heroLabel"),
    // statusLabel(undefined) is a truthy "—" that would survive the filter.
    project.status ? statusLabel(project.status) : null,
    t("heroUpdatedAt", { date: formatDate(project.updatedAt) }),
  ]
    .filter(Boolean)
    .join(" · ");
  const projectHref = getProjectRuntimeDetailHref(project.slug);
  const documentHref = projectDoc ? buildDocsVaultHref({ slug: projectDoc.slug }) : "/docs/";
  const briefIsStructured = splitProjectBrief(dedupedBodyContent).sections.length > 0;
  const hasLibrary = librarySources + libraryWikiPages > 0;
  const quietLinkClass = controlClass({ shape: "link", tone: "accent", className: "touch-hit-expand" });

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
      <ProjectDetailTopBar slug={slug} projectName={displayName ?? project.name} />

      {/*
        Band A. From a 64rem page column the brief sits beside what to check and what changed, with
        the name and actions above them; from 90rem those two sit side by side. Narrower, one column.
      */}
      <div
        data-testid="project-detail-identity"
        className="mt-8 grid min-w-0 grid-cols-1 gap-x-12 gap-y-6 [grid-template-areas:'name'_'text'_'actions'_'now'] @5xl/project-page:grid-cols-[minmax(0,var(--measure-prose))_minmax(22rem,1fr)] @5xl/project-page:gap-y-6 @5xl/project-page:[grid-template-areas:'name_actions'_'text_now'] @[90rem]/project-page:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
      >
        <div className="min-w-0 [grid-area:name]">
          <div className="flex min-w-0 items-center gap-3">
            <OntologyMapKindGlyph kind="project" size={ICON_SIZE.lg} className="shrink-0" />
            <InlineEditable
              as="h1"
              value={displayName ?? project.name}
              editable={canManageProject}
              onSave={(next) => saveProjectField("name", next)}
              ariaLabel={t("inlineNameAria")}
              className={`min-w-0 text-pretty ${PAGE_TITLE}`}
            />
          </div>
          <p className="mt-1 text-body text-[color:var(--color-text-tertiary)]">{heroMeta}</p>
        </div>

        <div className="min-w-0 [grid-area:actions] @5xl/project-page:justify-self-end">
          <ProjectActions
            project={project}
            displayName={displayName ?? null}
            canManage={canManageProject}
            fullEditHref={getProjectEditHref(project.slug, { returnTo: projectHref })}
            projectHref={projectHref}
            documentHref={documentHref}
            handoffSnippet={buildAgentHandoffSnippet(project.slug)}
            brief={{
              prompt: t("briefPrompt", { slug: project.slug, doc: projectDoc?.path ?? `${project.slug}.md` }),
              explanation:
                agent.route === "agent"
                  ? t("briefAskAgent")
                  : briefIsStructured
                    ? t("briefAskStructured")
                    : t("briefAskUnstructured"),
              startAgent: agent.route === "agent" ? agent.start : null,
            }}
            review={{
              inputProps: constructionReview.inputProps,
              openPicker: constructionReview.openPicker,
              reading: constructionReview.status === "reading",
            }}
          />
        </div>

        <div data-testid="project-detail-body" className="min-w-0 [grid-area:text]">
          <InlineEditable
            as="p"
            multiline
            value={heroTagline ?? project.description}
            editable={canManageProject}
            onSave={(next) => saveProjectField("description", next)}
            ariaLabel={t("inlineDescriptionAria")}
            placeholder={t("inlineDescriptionPlaceholder")}
            dataTestId="project-detail-description"
            className="max-w-[var(--measure-prose)] break-keep text-pretty text-title leading-title text-[color:var(--color-text-primary)]"
          />
          {leadParagraph ? (
            <div
              data-testid="project-detail-lead"
              className="mt-3 max-w-[var(--measure-prose)] break-keep text-pretty text-reading leading-prose text-[color:var(--color-text-secondary)] [&_a]:text-[color:var(--color-indigo-accent)] [&_code]:font-mono [&_code]:text-body-lg [&_p+p]:mt-3 [&_strong]:font-[var(--font-weight-strong)] [&_strong]:text-[color:var(--color-text-primary)]"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={LEAD_MARKDOWN_COMPONENTS}>{leadParagraph}</ReactMarkdown>
            </div>
          ) : null}
          {bodyContent ? (
            <Link
              href={documentHref}
              data-testid="project-detail-body-continue"
              className={cn(quietLinkClass, "mt-3")}
            >
              {t("bodyContinue")}
            </Link>
          ) : (
            <p data-testid="project-detail-body-empty" className="mt-3 text-body text-[color:var(--color-text-tertiary)]">
              {t("bodyEmptyHint")}
            </p>
          )}
          {/* View-only: the reason and the control that makes it editable, under the words it concerns. */}
          {canManageProject ? null : (
            <div className="mt-5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <span
                data-testid="project-detail-readonly-badge"
                className="min-w-0 break-keep text-label leading-body text-[color:var(--color-text-tertiary)]"
              >
                {t("readOnlyBadge")}
              </span>
              <OpenVaultCta testId="project-detail-open-vault" className="atlas-touch-floor atlas-touch-floor-wide" />
            </div>
          )}
        </div>

        {/* One hairline in the gap beside the brief; A3 under A2, or beside it from 90rem. */}
        <div
          data-testid="project-detail-now"
          className="relative grid min-w-0 grid-cols-1 content-start gap-x-12 gap-y-5 border-t border-[color:var(--color-divider)] pt-5 [grid-area:now] @5xl/project-page:border-t-0 @5xl/project-page:pt-0 @5xl/project-page:before:absolute @5xl/project-page:before:inset-y-0 @5xl/project-page:before:-left-6 @5xl/project-page:before:w-px @5xl/project-page:before:bg-[color:var(--color-divider)] @[90rem]/project-page:grid-cols-2"
        >
          <ToCheckSection
            projectName={displayName ?? project.name}
            toCheck={toCheck}
            availability={evidence.availability}
            staleCount={staleIds.size}
            capabilityTotal={projectCapabilities.length}
            reducedMotion={reducedMotion}
          />
          <div className="relative min-w-0 border-t border-[color:var(--color-divider)] pt-5 @[90rem]/project-page:border-t-0 @[90rem]/project-page:pt-0 @[90rem]/project-page:before:absolute @[90rem]/project-page:before:inset-y-0 @[90rem]/project-page:before:-left-6 @[90rem]/project-page:before:w-px @[90rem]/project-page:before:bg-[color:var(--color-divider)]">
            <ChangedSection
              changed={changed}
              windowDays={recentChanges.windowDays}
              reading={recentChanges.reading}
              reducedMotion={reducedMotion}
              arrivalOffset={TO_CHECK_ROWS_BEFORE_CHANGED}
            />
          </div>
        </div>
      </div>

      {constructionReview.status === "ready" || constructionReview.status === "blocked" ? (
        <div ref={reviewOutcomeRef} tabIndex={-1} role="region"
          aria-label={t("constructionReview.resultRegion")}
          data-testid="construction-review-outcome" className="scroll-mt-6 focus:outline-none">
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
              <Button type="button" variant="outline" size="sm" onClick={openReviewPicker}
                data-testid="construction-review-retry" className="atlas-touch-floor atlas-touch-floor-wide mt-4">
                {t("constructionReview.retryFile")}
              </Button>
            </section>
          ) : null}
        </div>
      ) : null}

      <section
        data-testid="project-detail-composition"
        aria-labelledby="project-detail-composition-title"
        className="mt-[var(--section-gap)] border-t border-[color:var(--color-divider)] pt-8"
      >
        <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2
            id="project-detail-composition-title"
            className={SECTION_HEADING_CLASS}
          >
            {t("compositionHeading")}
          </h2>
          <p data-testid="project-detail-composition-counts" className="text-body-lg tabular-nums text-[color:var(--color-text-tertiary)]">
            {t("compositionCounts", {
              domains: metrics.domains,
              capabilities: metrics.capabilities,
              elements: metrics.elements,
              relations: metrics.relations,
            })}
          </p>
        </div>
        {domainComposition.domains.length > 0 ? (
          <DomainMasterDetail
            domains={domainComposition.domains}
            maxTotal={domainComposition.maxTotal}
            marks={{ staleIds, changedIds: changed.changedIds }}
            labels={{
              listLabel: t("metricDomains"),
              capabilityUnit: t("domainCapabilityLabel"),
              elementUnit: t("domainElementLabel"),
              legendCaption: t("domainRowsLegendCaption"),
              overlapNote: domainsOverlap ? t("domainOverlapNote") : "",
              optionAria: (row) =>
                t("domainOptionAria", {
                  title: row.title,
                  total: row.total,
                  capabilities: row.capabilityCount,
                  elements: row.elementCount,
                }),
              counts: (row) => t("domainCounts", { capabilities: row.capabilityCount, elements: row.elementCount }),
              capabilityLinkAria: (title) => t("domainCapabilityLinkAria", { name: title }),
              capabilitiesEmpty: t("domainRowCapabilitiesEmpty"),
              showMore: (count) => tMapDial("moreMembers", { count }),
              elementCount: (count) => t("capabilityElementCount", { count }),
              mapLinkLabel: t("domainRowMapLink"),
              domainStale: (count) => tHex("domainStale", { count }),
              staleMark: tHex("legendStale"),
              recentMark: tIndex("freshTitle"),
            }}
          />
        ) : (
          <p
            data-testid="project-detail-composition-empty"
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-body-lg text-[color:var(--color-text-secondary)]"
          >
            {t("domainEmptyTitle")}
            <Link href="/topology/?workbench=create" data-testid="project-detail-composition-empty-action" className={quietLinkClass}>
              {t("domainEmptyAction")}
            </Link>
          </p>
        )}
      </section>

      {/* One quiet line: what else the folder holds, where this project connects, and the file it is drawn from. */}
      <footer
        data-testid="project-detail-closing"
        className="mt-[var(--section-gap)] flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-[color:var(--color-divider)] pt-5 pb-[var(--page-bottom-breath)] text-body text-[color:var(--color-text-tertiary)]"
      >
        {hasLibrary ? (
          <span data-testid="project-detail-library-line" className="flex flex-wrap items-baseline gap-x-3">
            <span className="tabular-nums">
              {t("libraryCounts", { sources: librarySources, wikiPages: libraryWikiPages })}
              {soleProject ? null : ` · ${t("surfaceFolderScope")}`}
            </span>
            <Link href="/library/" prefetch={false} className={quietLinkClass}>
              {t("surfaceOpenLibrary")}
            </Link>
          </span>
        ) : null}
        {nativeVaultRootPath !== null ? (
          <Link href="/architecture/" prefetch={false} data-testid="project-detail-harness-link" className={quietLinkClass}>
            {t("surfaceOpenHarness")}
          </Link>
        ) : null}
        <Link href="/changes/" prefetch={false} data-testid="project-detail-changes-link" className={quietLinkClass}>
          {t("surfaceOpenChanges")}
        </Link>
        {connectedProjects.length > 0 ? (
          <span data-testid="project-detail-connected" className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            {t("connectedTitle")}
            <Link href={getProjectRuntimeDetailHref(connectedProjects[0].slug)} className={quietLinkClass}>
              {projectDisplayName(connectedProjects[0], locale)}
            </Link>
            {connectedProjects.length > 1 ? <span>{t("connectedMoreNote", { count: connectedProjects.length - 1 })}</span> : null}
          </span>
        ) : null}
        {/* The slug and Markdown path a person types next; slug and date when the document is unknown. */}
        <p data-testid="project-detail-footer" className="ml-auto min-w-0 break-all font-mono text-label text-[color:var(--color-text-quaternary)]">
          {projectDoc
            ? t.rich("footerSummaryDoc", { slug: project.slug, path: projectDoc.path, value: (chunks) => <span>{chunks}</span> })
            : t.rich("footerSummary", {
                slug: project.slug,
                date: formatDate(project.updatedAt),
                value: (chunks) => <span>{chunks}</span>,
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
