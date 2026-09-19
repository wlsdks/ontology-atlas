"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
// `useSearchParams` is locale-agnostic, so it comes from raw next/navigation
// (`.claude/rules/architecture.md`, the i18n routing guard).
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, FileText, FolderSearch, Layers, Waypoints } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import { OpenVaultCta } from "@/features/docs-vault-local";
import { useTypingShortcuts } from "@/shared/lib/use-typing-shortcut";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { formatDate } from "@/shared/lib/format-date";
import { MOTION } from "@/shared/motion";
import {
  Button,
  EmptyState,
  InlineEditable,
  OntologyMapKindGlyph,
  OntologyMapTraceMark,
  controlClass,
  useToast,
} from "@/shared/ui";
import {
  getProjectEditHref,
  getProjectRuntimeDetailHref,
  getTopologyProjectHref,
  type Project,
} from "@/entities/project";
import { useProjects, useProjectMutations, useProjectBody, useVaultDocs } from "@/features/project-data-source";
import { buildDocsVaultHref, findProjectDocInList } from "@/entities/docs-vault";
import { VaultConflictError, useLocalVault } from "@/entities/vault-session";
import { resolveNodeAgentTarget } from "@/entities/knowledge-graph";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";
import { useChatWidth } from "@/widgets/acp-chat-panel";
import { useProjectAgent } from "../lib/use-project-agent";
import { ProjectAgentDock } from "./parts/ProjectAgentDock";
import { useOntologyInsight } from "@/features/vault-ontology";
import { CopyProjectLinkButton } from "@/features/project-share";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { useFailureSentence } from "@/shared/lib/use-failure-sentence";
import { useTaxonomy } from "@/features/taxonomy";
import { ProjectQuickEditPanel } from "@/features/project-quick-edit";
import { useConstructionReviewSession } from "@/features/construction-review-local";
import { resolveSubscribeUpdate } from "../model/resolve-subscribe-update";
import { resolveProjectTagline } from "../model/project-tagline";
import { stripDuplicateHeading } from "../model/strip-duplicate-heading";
import { buildProjectOntologyMetrics } from "../model/project-ontology-metrics";
import { buildProjectDomainComposition } from "../model/domain-composition";
import { buildConnectedProjects, findRelatesGraphProjectSlugs } from "../model/connected-projects";
import { buildAgentHandoffSnippet } from "../model/agent-handoff-snippet";
import { DomainCompositionRows } from "./DomainCompositionRows";
import { ProjectBrief } from "./ProjectBrief";
import { splitProjectBrief } from "../model/project-brief";
import { ConstructionReviewPanel } from "./construction-review/ConstructionReviewPanel";
import { TabBar } from "@/shared/ui/tab-bar";
import {
  compositionTabCount,
  parseProjectDetailTab,
  serializeProjectDetailTab,
  type ProjectDetailTab,
} from "../lib/project-detail-tab";

const SearchPalette = dynamic(
  () => import("@/widgets/search-palette").then((m) => m.SearchPalette),
  { ssr: false },
);
const ShortcutSheet = dynamic(
  () => import("@/widgets/shortcut-sheet").then((m) => m.ShortcutSheet),
  { ssr: false },
);

interface Props {
  slug: string;
  initialProject?: Project | null;
  initialRelated?: Project[];
}

function ProjectDetailShell({ children, dock = null }: { children: ReactNode; dock?: ReactNode }) {
  return (
    // `relative` because the agent dock below `xl` is absolutely positioned against this row; at
    // `xl` it is a sibling of `main` and takes its width from the row, the placement the Library
    // measured on 2026-09-05 (a frame whose only child is absolute collapses inside a column).
    <div className="relative flex min-h-full w-full">
      {/* The rail lives in the layout (AppShell) since the persistent-shell work. */}
      {/* The bottom reserve is a base `pb` plus an `lg:` override — `max-lg:pb-[...]` is emitted
          before `md:py-14` in the stylesheet and silently lost between 768 and 1023, leaving the
          content end 1px from the tab bar's top (measured 968.1 against a top of 967 at 768×1024).
          Replaced with a deterministic composition that does not depend on variant order. */}
      <main id="main" tabIndex={-1} className="topology-ui-scale min-w-0 flex-1 bg-[color:var(--color-canvas)] px-[max(1.5rem,env(safe-area-inset-left))] pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)] md:px-10 md:pt-12 lg:pb-[max(3.5rem,env(safe-area-inset-bottom))] xl:px-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={MOTION.base}
          // The page column is a named container: with the agent dock open the column is
          // narrower than the viewport says, and the two-track zone below reads the column.
          className="@container/project-page mx-auto w-full max-w-[var(--page-max)]"
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
  census,
  projectDocSlug,
}: {
  slug?: string;
  projectName?: string | null;
  census?: { concepts: number; relations: number } | null;
  /**
   * The vault slug of this project's own Markdown document. When known, the documents door opens
   * **that file** rather than the vault's root: the frontmatter of that one file is what this whole
   * page is drawn from, and until 2026-09-19 the page had no door to it — "Ontology documents" led
   * to the vault root and left the person to find the project's file by hand.
   */
  projectDocSlug?: string | null;
}) {
  const t = useTranslations("projectPages.detail");
  /**
   * This link's label is "map" (`topBarWorkspaceFallback`) and its aria is "back to the map", so its
   * destination must be **the map's address**.
   *
   * It used to be `/`. That was the value from before 2026-07-30, when `/` split off into the
   * gateway (marketing); after that this link said map and sent people to the download page —
   * measured in the rc.5 review (2026-08-01): the screen it landed on contained
   * `download-primary-cta` and zero map canvases.
   *
   * And this page happens to be the product's only public demo address (`/project/storefront/`).
   */
  const workspaceHref = '/topology/';
  const projectsListHref = '/projects/';
  // Same label either way: the door is the Ontology documents; when the file is known it opens on it.
  const docsVaultHref = projectDocSlug ? buildDocsVaultHref({ slug: projectDocSlug }) : '/docs/';
  return (
    /* Without a size class the `▸` separator inherits the root 16px and renders 33–45% larger than
       the link beside it (12.5px) and the label (11px) — ink outweighing data. The whole breadcrumb
       is pinned to type-ramp tokens, and the separator sits at the quietest step (`text-label`). */
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
        className={controlClass({ shape: "link", tone: "muted", className: "font-mono uppercase tracking-[var(--tracking-caps-12)] hover:text-[color:var(--color-text-primary)]" })}
      >
        {t("topBarProjectsLabel")}
      </Link>
      <span aria-hidden className="text-label text-[color:var(--color-text-quaternary)]">
        ▸
      </span>
      <span className="max-w-[240px] truncate font-mono text-label text-[color:var(--color-text-primary)]">
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
          <CopyProjectLinkButton slug={slug} testId="project-detail-copy-link" className="h-10 justify-center" />
        ) : null}
        {census ? (
          <span
            data-testid="project-detail-global-census"
            className="hidden font-mono text-label tracking-[var(--tracking-caps-08)] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)] md:inline"
          >
            {t("globalCensus", { concepts: census.concepts, relations: census.relations })}
          </span>
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
      {/*
        This slot used to have its own bespoke card — a full-width box with the text bunched at the
        top left and mostly empty space. The app already has `EmptyState` (tone=solid, align=center)
        for "the page body is entirely empty", and only this screen did not use it. An empty state
        that looks different per surface is itself the drift, so it goes back to the shared primitive.
      */}
      <div className="mx-auto mt-16 w-full max-w-lg">
        <EmptyState
          titleAs="h1"
          tone="solid"
          align="center"
          icon={<FolderSearch size={ICON_SIZE.lg} aria-hidden />}
          title={<span data-testid={testId}>{title}</span>}
          description={description}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              {/* The list comes first — what someone who lands here wants is to pick another project. */}
              <Link href={'/projects/'}>
                <Button type="button" variant="primary" size="sm">
                  {t("stateBackToWorkspace")}
                </Button>
              </Link>
              {/* The label says "open the map" — `/` is the gateway, not the map. */}
              <Link href={'/topology/'}>
                <Button type="button" variant="ghost" size="sm">
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
  // The tab lives in the URL — it has to be shareable and reproducible by an agent. Left as hidden
  // state, "which tab they were on" disappears from the handoff packet.
  const searchParams = useSearchParams();
  const activeTab = parseProjectDetailTab(searchParams.get("tab"));
  const selectTab = useCallback(
    (key: string) => {
      const next = serializeProjectDetailTab(key as ProjectDetailTab);
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("tab", next);
      else params.delete("tab");
      const query = params.toString();
      // `replace` — switching tabs is not a move worth a back-history entry.
      router.replace(query ? `?${query}` : "?", { scroll: false });
    },
    [router, searchParams],
  );
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
  // Derivation is honest, so a missing frontmatter value is undefined. 'active' is the form-local
  // fallback (to-input.ts), whose legacy id is kept as-is and converted to a friendly label here.
  const statusLabel = (id: string | undefined): string =>
    id === "active" ? t("statusActive") : rawStatusLabel(id);

  // On the detail page, Cmd+K and ? both open as overlays on the current page — bouncing to home
  // would dismiss the overlay and lose the "you are here" context.
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useTypingShortcuts([
    {
      combo: { key: "k", meta: true },
      onFire: () => setSearchOpen((v) => !v),
    },
    {
      combo: { key: "?" },
      onFire: () => setShortcutsOpen((v) => !v),
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

  // Client-side dynamic title. Static export metadata is prebuilt per slug, but user context
  // (project.name) exists only on the client.
  useDocumentTitle(
    Array.from(
      new Set(
        [project?.name, t("documentTitleSuffix")].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    ).join(" · ") || null,
  );

  // Mode-aware project read — the local vault or the build-time dogfood manifest. One hook always
  // holds the latest snapshot, so there is no list/subscribe race.
  const projectsQuery = useProjects();
  const projectMutations = useProjectMutations();
  // Lazy-loads the body (project.md). `project.detail` is the editor form's separate frontmatter
  // `detail:` field and is absent from most real vault documents — the actual body has to be read
  // from the vault file separately. Fallback order: an explicit `detail` field, then the real
  // project.md body.
  const { body: vaultBody } = useProjectBody(project?.slug ?? null);
  const bodyContent = project?.detail ?? vaultBody ?? null;
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    // The static-mode fallback used to carry 15 `SEED_PROJECTS`, and their content described
    // **already-removed features as fact** (Firebase Hosting, Sigma/WebGL, a whitelist admin). The
    // `/project/[slug]` routes are generated from the vault, so those slugs were unreachable to begin
    // with — unreachable data describing a product that does not exist, so it was deleted. With no
    // project, the not-found state below states that honestly.
    const { next, related: nextRelated } = resolveSubscribeUpdate(
      projectsQuery.projects,
      slug,
    );
    window.queueMicrotask(() => {
      if (cancelled) return;
      if (next) {
        setProject(next);
      } else if (projectsQuery.loaded || projectsQuery.error !== null) {
        // Once the local source is settled, a missing slug must not leave a canonical static fact
        // behind. Even for the same slug, the current vault is the only source of truth.
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

  // This project's ontology nodes and relations — the hero metric strip, the mini domain map, the
  // domain composition rows, and connected projects (relates) all derive from here. The
  // vault (local) over build-time dogfood (static) precedence is already handled by
  // `useOntologyInsight`, so this component needs no mode branch.
  const { insight } = useOntologyInsight();
  const insightNodes = insight?.nodes ?? [];
  const insightEdges = insight?.edges ?? [];
  // The agent that can lay the overview out from this page: only the installed app knows a
  // native folder path, and only a guarded runtime may open the dock (`useProjectAgent`).
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

  // The one Markdown file this page is drawn from — the door in the top bar and the path in the footer.
  const projectDoc = findProjectDocInList(vaultDocs, project.slug);
  const metrics = buildProjectOntologyMetrics(insightNodes, insightEdges, project.slug);
  const domainComposition = buildProjectDomainComposition(insightNodes, insightEdges, project.slug);
  const relatesGraphSlugs = findRelatesGraphProjectSlugs(insightNodes, insightEdges, project.slug);
  const connectedProjects = buildConnectedProjects(project, related, relatesGraphSlugs);
  const handoffSnippet = buildAgentHandoffSnippet(project.slug);

  const canManageProject = projectMutations.canEdit;
  /*
   * ⚠️ The toast prefix wraps this in a Korean sentence (`saveErrorPrefix`), so what goes inside it
   * must be a sentence in the same language. It used to be `err.message` — the vault layer's
   * English, spliced into Korean prose. A toast has no `data-*` attribute to hide the machine half
   * in, so the English goes to the console, which is the other place the gate permits.
   */
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
      await projectMutations.patchProject(
        project.slug,
        field === "name"
          ? { name: next }
          : { description: next.trim() ? next : null },
      );
      showToast(field === "name" ? t("saveSuccessName") : t("saveSuccessDescription"), "success");
    } catch (err) {
      const message = projectSaveErrorMessage(err);
      showToast(t("saveErrorPrefix", { message }), "error");
      throw err;
    }
  };

  // `statusLabel(undefined)` returns "—" to mark a placeholder, and being truthy it survives
  // `.filter(Boolean)` — so the line is only populated when `project.status` itself exists, avoiding
  // a dash collision like "individual project · —".
  // The hero is an overview and the body is the detail: passing the raw excerpt through cuts mid-word
  // (see `project-tagline.ts`). A value the user was editing is their input and is left alone.
  const heroTagline = resolveProjectTagline({ description: project.description });
  // The body's leading `# project name` is the same sentence as the hero title — right when the file
  // is read on its own, but on this screen it spends the same ink twice.
  const dedupedBodyContent = stripDuplicateHeading(bodyContent, project.name);
  const heroMeta = [
    project.isHub ? t("heroLabelHub") : t("heroLabel"),
    project.status ? statusLabel(project.status) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  /*
    "It just looks like a run of characters" had four causes: ① the paragraph gap (10px) was narrower
    than the line height (23.6px), so paragraph boundaries vanished ② headings had no bottom margin
    at all, sticking the title to the paragraph after it ③ short lines strung across a wide card left
    the reading eye nowhere to go ④ quotes, code blocks, and tables had no styling, so everything was
    the same grey text.

    Hierarchy is built from **weight (650) plus vertical space (36/12), not a size jump** — enlarging
    is the cheap answer under a neutrals-plus-one-indigo charter, and a new ramp step would incur
    `TYPE_RAMP_STEPS` registration debt. Every value used here is inside the existing ramp.

    The body is set at `--text-reading` and stands in the reading column (`--measure-doc-column`):
    the measure spent at the size the body is set in, plus a gutter each side, centred in the
    card. Until 2026-09-19 the body was 14px under a `--measure-prose` cap, which resolved at
    that size to a 550px run left-aligned inside a 932px card at 1512 (1180px at 1920) — the
    "empty space to the right of the text" the owner named on 2026-09-12 when the Library's
    column was widened and centred (`docs/DECISIONS.md`, "The reading column is worth more of
    its pane than the measure was buying"). The card keeps its track; the column inside it is
    the same box the Library's open page reads.
  */
  const storyMarkdownClassName =
    "text-reading leading-prose text-[color:var(--color-text-secondary)] [&>*:first-child]:mt-0 [&_a]:text-[color:var(--color-indigo-accent)] [&_a]:underline-offset-2 [&_a:hover]:text-[color:var(--color-indigo-hover)] [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-[color:var(--color-border-strong)] [&_blockquote]:pl-3.5 [&_blockquote]:text-[color:var(--color-text-tertiary)] [&_code]:rounded-micro [&_code]:border [&_code]:border-[color:var(--color-border-soft)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-body [&_code]:text-[color:var(--color-text-tertiary)] [&_h1]:mt-9 [&_h1]:mb-3 [&_h1]:text-title [&_h1]:font-[var(--font-weight-strong)] [&_h1]:tracking-title [&_h1]:text-[color:var(--color-text-primary)] [&_h2]:mt-9 [&_h2]:mb-3 [&_h2]:text-title [&_h2]:font-[var(--font-weight-strong)] [&_h2]:tracking-title [&_h2]:text-[color:var(--color-text-primary)] [&_h3]:mt-7 [&_h3]:mb-2 [&_h3]:text-body-lg [&_h3]:font-[var(--font-weight-strong)] [&_h3]:text-[color:var(--color-text-primary)] [&_hr]:my-7 [&_hr]:border-[color:var(--color-border-soft)] [&_li]:mb-1.5 [&_li]:list-disc [&_li]:pl-1 [&_li::marker]:text-[color:var(--color-text-quaternary)] [&_ol]:my-3 [&_ol]:pl-[22px] [&_p]:mb-3.5 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-[var(--radius-card)] [&_pre]:border [&_pre]:border-[color:var(--color-border-soft)] [&_pre]:bg-[color:var(--color-overlay-1)] [&_pre]:p-3.5 [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-body [&_strong]:font-[var(--font-weight-strong)] [&_strong]:text-[color:var(--color-text-primary)] [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border-t [&_td]:border-[color:var(--color-divider)] [&_td]:py-2 [&_td]:pr-4 [&_th]:pb-2 [&_th]:pr-4 [&_th]:text-left [&_th]:font-mono [&_th]:text-caption [&_th]:uppercase [&_th]:tracking-caption [&_th]:text-[color:var(--color-text-quaternary)] [&_ul]:my-3 [&_ul]:pl-[22px]";
  const projectFullEditHref = getProjectEditHref(project.slug, {
    returnTo: getProjectRuntimeDetailHref(project.slug),
  });

  // Only the ontology's own hierarchy (domain ⊃ capability ⊃ element) becomes chips.
  const primaryMetrics: Array<{ label: string; value: number }> = [
    { label: t("metricDomains"), value: metrics.domains },
    { label: t("metricCapabilities"), value: metrics.capabilities },
    { label: t("metricElements"), value: metrics.elements },
  ];
  // The meta figures are a different kind and have no reason to carry the same weight — demoted to plain text.
  // A zero is not drawn (the "match 0 → hide" rule this page already applies to the domain rows):
  // "Documents 0" under a header counting 125 concepts in a folder of 126 Markdown files read as a
  // contradiction, when it only meant no `kind: document` node is linked to this project.
  const secondaryMetrics: Array<{ label: string; value: number }> = [
    { label: t("metricDocuments"), value: metrics.documents },
    { label: t("metricRelations"), value: metrics.relations },
  ].filter((item) => item.value > 0);

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
      dock={
        agent.route === "agent" && agent.runtime && nativeVaultRootPath ? (
          <ProjectAgentDock
            open={agent.open}
            projectName={project.name}
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
        projectName={project.name}
        census={{ concepts: insightNodes.length, relations: insightEdges.length }}
        projectDocSlug={projectDoc?.slug ?? null}
      />

      {/* zone 1 — hero band: glyph, title, and description plus the engraved metric strip and the
          topology/edit actions. **The right column is deliberately empty** — see the comment below
          about removing the radial map. */}
      <header className="@container/project-hero mt-6 flex flex-col gap-6 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[18px_20px] shadow-[inset_0_1px_0_var(--color-overlay-1)] lg:p-[18px_26px]">
        <div className="flex min-w-0 flex-1 flex-col">
          {/*
            The action cluster stands beside the name only when the hero band itself is wide
            enough (`@5xl`, 64rem of the `project-hero` container). Below that it takes a row of
            its own: with `sm:flex-nowrap` the four controls kept their full width and the name
            column took what was left — 250px at 1024 and 80px at 768, where "Online Store" broke
            in two and the definition ran nine lines (measured 2026-09-19). A viewport breakpoint
            (`xl:`) fixed those widths and then failed the same way with the agent dock open at
            1280, where the band is 600px wide under an `xl` viewport (captured the same day). The
            band's own width is the fact; a name and its definition outrank four buttons, so the
            buttons are the ones that move.
          */}
          <div className="flex flex-wrap items-start gap-3.5 @5xl/project-hero:flex-nowrap">
            <OntologyMapKindGlyph kind="project" size={30} className="mt-1 shrink-0" />
            <div className="min-w-0 flex-1">
              <InlineEditable
                as="h1"
                value={project.name}
                editable={canManageProject}
                onSave={(next) => saveProjectField("name", next)}
                ariaLabel={t("inlineNameAria")}
                className="text-display leading-display-tight font-[var(--font-weight-strong)] tracking-[var(--tracking-card)] text-pretty text-[color:var(--color-text-primary)]"
              />
              {/*
                The meta row ends here. The description used to flow **into** this dot row, so a
                paragraph-length text was treated as 13px tertiary meta — half of the "it feels
                cramped" impression was that. A definition matters more than meta, so it sits in its
                own block one tone up (secondary).
              */}
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
                // `break-keep` — this description broke mid-word as 「a|hop」 at 576px (measured
                // 2026-08-15 by the korean-word-break instrument).
                // The cap is the column box, not a per-line `ch` count: `64ch` resolved at this
                // element's own 14px to 534px inside a 1350px band (2026-09-19), the same three-
                // right-edges defect the Library removed on 2026-09-19 (#1667).
                className="mt-2.5 max-w-[var(--measure-doc-column)] break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]"
              />
            </div>
            {/* `flex-none` created horizontal overflow at a 390px viewport, the read-only badge and
                its actions pushing the page out — allow shrinking with `min-w-0` and wrap instead. */}
            <div className="flex min-w-0 basis-full flex-wrap items-center gap-2 @5xl/project-hero:ml-auto @5xl/project-hero:basis-auto">
              {/*
                Order and weight follow what a person on this page does most: open the project on the
                map. That is the one filled control; the review-envelope picker beside it is a
                reviewer's tool and stands second in outline. Until 2026-09-19 the picker was first
                and both were outline, so the page's primary action read as one of two equals.
              */}
              <Link href={getTopologyProjectHref(project.slug)} data-testid="project-detail-topology-link">
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
                <ProjectQuickEditPanel project={project} settingsHref={projectFullEditHref} />
              ) : (
                // With no vault chosen (static/dogfood) there was no edit entry point at all and
                // nothing explaining why — this badge states the reason and the next action in one
                // line. It is not an action but a typed fact about state.
                //
                // 2026-08-07: that "next action" existed **only as words**. The badge said *"open a
                // folder to edit"* while this screen had zero controls that open a folder (measured
                // exhaustively) — a dead CTA. The badge keeps stating the state, and the path that
                // does the job is placed beside it. Not overlaying state and action on one element
                // preserves the earlier comment's judgement.
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span
                    data-testid="project-detail-readonly-badge"
                    // `flex-none` created horizontal page overflow at 390px (an overflow-sweep
                    // regression) — when narrow, the badge text wraps instead.
                    className="inline-flex min-w-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 font-mono text-label text-[color:var(--color-text-tertiary)]"
                  >
                    {t("readOnlyBadge")}
                  </span>
                  <OpenVaultCta testId="project-detail-open-vault" />
                </div>
              )}
            </div>
          </div>

          {/*
            Statistics are quiet chips rather than huge numbers — easy to scan without stealing
            attention from the title. But five at the same weight reads as "everything matters, so
            nothing does". The ontology's own hierarchy (domain ⊃ capability ⊃ element) and the meta
            figures (documents, relations) are different kinds, so only the first three stay chips and
            the last two are demoted to plain text.

            The scope caption at the front breaks the confusion with the census at the top (the whole
            vault) — 440 and 453 on one screen reads as one of them being wrong, when in fact only the
            scope differs.

            `pb-5` is the breathing room between the description block and this rule — it used to be
            0px, with the line sitting directly under the text.
          */}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[color:var(--color-border-soft)] pt-3.5">
            <span className="text-caption uppercase tracking-caption text-[color:var(--color-text-quaternary)]">
              {t("heroScopeCaption")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {primaryMetrics.map((item) => (
                <span
                  key={item.label}
                  className="inline-flex items-baseline gap-1.5 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1"
                >
                  <span className="text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
                    {item.label}
                  </span>
                  <span className="font-mono text-label tabular-nums text-[color:var(--color-text-secondary)]">
                    {item.value}
                  </span>
                </span>
              ))}
            </div>
            <span className="ml-auto font-mono text-label tabular-nums text-[color:var(--color-text-quaternary)]">
              {secondaryMetrics
                .map((item) => `${item.label} ${item.value}`)
                .join(" · ")}
            </span>
          </div>
        </div>

        {/*
          ## The radial domain map was removed (2026-08-12, owner chose option B)

          This slot held an SVG with lines radiating from one project hexagon to nine domain squares,
          captioned with the promise **"the fuller a domain, the larger it is"**. That promise was
          measured (storefront, 1512 wide):

          - the square width difference between a 17-domain and a 6-domain was **4.7px** — between 17
            and 16 it was **0.3px**. "Larger" could not be judged by eye.
          - two of the radial lines **ran straight through the centre label**.

          A promise that cannot be kept is not ink but a misunderstanding. So the same fact moved to a
          judgeable form (rows plus a proportional bar plus a numeric column), and that list lives in
          **exactly one place, the composition tab**.

          ⚠️ **Why the list was not put here — the measurement decided it.** The first attempt put the
          nine rows here (the right column) as instructed and measured them. The rows themselves were
          fine (all nine at 42.00px, zero overlap). But the band grew from **206 to 495px** (50% of a
          1512×982 viewport), leaving a **290px empty strip** in the left column — and above all,
          opening the composition tab drew **the same nine rows with the same numbers twice on one
          screen**. That is the very defect this rework removed, so the list has **only one home**. To
          revert, put `DomainCompositionRows` here — but then the tab's list must be deleted.

          (The "view on the map" link that used to be here was removed earlier — it duplicated the
          label and destination of the hero's primary action button.)
        */}
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

      {/* Tabs split by **the question they answer**, not by "kind of information": overview = what is
          this (the body), composition = what is it made of. The project.md body runs to thousands of
          px in the dogfood vault, so keeping both in one scroll left no way to scan "what is it made
          of" (owner: "you don't have to show everything by scrolling").

          The component reuses the app's single tab bar (`shared/ui/tab-bar`) — the same grammar as the
          insights and history evidence panes, so no new idiom appears. */}
      <div className="mt-[var(--section-gap)]">
        <TabBar
          /* This tab bar is **shared** with insights. Without a prefix, `aria-controls` points at
             insights' panel ids, which do not resolve here — a measured violation (axe
             `aria-valid-attr-value`). The two panels below draw `role="tabpanel"` under this prefix. */
          idPrefix="project-detail"
          ariaLabel={t("tabs.ariaLabel")}
          activeKey={activeTab}
          onSelect={selectTab}
          items={[
            { key: "overview", label: t("tabs.overview") },
            {
              key: "composition",
              label: t("tabs.composition"),
              count: compositionTabCount(domainComposition.domains.length),
            },
          ]}
        />
      </div>

      {/* zone 3 — left: the body (overview tab only) / right: connected projects plus the agent
          handoff.
          **The right rail sits outside the tabs** — it is cross-tab context valid from any tab, and
          "connected projects" in particular is the first surface of treating project-to-project
          relations as ontology, so it must not be hidden behind a tab (the same grammar as the
          left/right split of the history destination). */}
      {/*
        Two tracks from `@3xl` (48rem) of the page column, not from the `lg` viewport: with the
        agent dock open at 1280 the column is about 600px under an `xl` viewport, and the viewport
        rule squeezed the overview card to 170px beside a 400px rail (captured 2026-09-19).
      */}
      <section className="mt-[var(--section-gap)] grid grid-cols-1 items-start gap-[var(--card-gap)] @3xl/project-page:grid-cols-[minmax(0,1fr)_400px]">
        {/* The left column is **the tab body**. Putting composition in its own section and hiding it
            with `hidden` made the grid's first track vanish under `display:none`, pulling the 400px
            right rail into the 1fr track and stretching it (a measured defect). If the left **always
            draws something**, the track cannot collapse. */}
        {activeTab === "composition" ? (
          <section
            data-tab-panel="composition"
            id="project-detail-tabpanel-composition"
            role="tabpanel"
            aria-labelledby="project-detail-tab-composition"
            tabIndex={0}
            className="min-w-0"
          >
            {domainComposition.domains.length > 0 ? (
              /*
                The section header ("domain composition · contains · 6") was removed. The tab label
                already reads "composition 6", so both the title and the count were duplicates, and a
                33px header on the left alone misaligned the starting edge against the right rail's
                first card, making the whole grid look crooked.

                The footnote (`domainOverlapNote`) was pulled out of here too and gathered in one place
                under the hero row — that sentence explains "the hero chip sum ≠ the row sum", and the
                hero is where both numbers are visible together.
              */
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
              // The tab remains even at zero domains (spatial memory) — instead, the next step is offered here.
              <div data-testid="project-detail-composition-empty">
                <EmptyState
                  size="compact"
                  icon={<Layers size={ICON_SIZE.lg} aria-hidden />}
                  title={t("domainEmptyTitle")}
                  description={t("domainEmptyHint")}
                  /* The hint said where to do it — "connect a domain on the
                     map" — and then made the reader go find the map. One door,
                     the same address the insights empty states use. */
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
        ) : (
        <article
          data-tab-panel="overview"
          id="project-detail-tabpanel-overview"
          role="tabpanel"
          aria-labelledby="project-detail-tab-overview"
          tabIndex={0}
          className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] shadow-[inset_0_1px_0_var(--color-overlay-1)] md:p-[16px_18px]"
        >
          {/*
            One reading column, centred: the measure spent at `--text-reading` (the doc column
            minus its two gutters — the card's own padding is the gutter here), and the title
            stands on the same start line as the prose. The card keeps the grid track; what
            changed on 2026-09-19 is that the line inside it is the column, not a 14px `ch` cap
            left-aligned in a card twice its width. See `storyMarkdownClassName`.
          */}
          <div
            data-testid="project-detail-body-column"
            className="mx-auto w-full max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))]"
          >
          <div className="mb-2.5 flex items-baseline gap-2">
            <span className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t("bodyCardTitle")}
            </span>
            <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
              {t("bodyCardGcap")}
            </span>
          </div>
          {bodyContent ? (
            // The column above is the line; no per-line cap here. `ProjectBrief` draws the body's
            // `##` sections as blocks and falls back to prose (with `break-keep`, which covers every
            // markdown paragraph: the Korean body broke mid-word as 「jangba|gi」 at 584px, 2026-08-12).
            <ProjectBrief body={dedupedBodyContent ?? bodyContent} proseClassName={storyMarkdownClassName} />
          ) : (
            <div data-testid="project-detail-body-empty">
              <EmptyState
                size="compact"
                icon={<FileText size={ICON_SIZE.lg} aria-hidden />}
                title={t("bodyEmptyHint")}
              />
            </div>
          )}
          {/*
            The ask (owner, 2026-09-19): this is the place the agent should analyse and lay out. The
            page cannot start a turn itself yet (the Library's dock is where turns run), so it hands
            over the exact instructions: read the map through MCP, write four sections, change only
            the body with `patch_concept` under `expected_mtime`. The person reviews the file in the
            Library; nothing is written from here.
          */}
          <div
            data-testid="project-detail-brief-ask"
            data-brief-state={briefIsStructured ? "structured" : "unstructured"}
            data-agent-route={agent.route}
            className="mt-6 border-t border-[color:var(--color-divider)] pt-4"
          >
            <span className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t("briefAskTitle")}
            </span>
            <p className="mt-1 mb-3 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
              {agent.route === "agent"
                ? t("briefAskAgent")
                : briefIsStructured
                  ? t("briefAskStructured")
                  : t("briefAskUnstructured")}
            </p>
            {/*
              In the installed app with a guarded runtime ready, the ask opens the dock beside this
              page and seats the same instructions as the first turn; the person still decides every
              file write at the permission card. Everywhere else the instructions are copied.
            */}
            {agent.route === "agent" ? (
              <Button
                type="button"
                variant={briefIsStructured ? "outline" : "primary"}
                size="sm"
                onClick={() => agent.start(briefPrompt)}
                data-testid="project-detail-brief-ask-open"
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
              >
                {briefCopyLabel}
              </Button>
            )}
            <details className="mt-3">
              <summary className="select-none text-body leading-body text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)]">
                {t("handoffHumanCaption")}
              </summary>
              <pre className="mt-2 overflow-x-auto font-mono text-body leading-prose whitespace-pre-wrap break-keep text-[color:var(--color-text-quaternary)]">
                {briefPrompt}
              </pre>
            </details>
          </div>
          </div>
        </article>
        )}

        {/* The right rail sits **outside the tabs** — it is context valid from any tab, and "connected
            projects" is the first surface of treating project-to-project relations as ontology, so it
            must not be hidden behind a tab. */}
        <aside data-testid="project-detail-connected" className="flex flex-col gap-[var(--card-gap)]">
          <section className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] shadow-[inset_0_1px_0_var(--color-overlay-1)] md:p-[16px_18px]">
            <div className="mb-2.5 flex items-baseline gap-2">
              <OntologyMapTraceMark containment={false} />
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
                    {/* No decorative arrow after a label — this link navigates inside the app (it is
                        not `target="_blank"`). `↗` is used only as a leading warning on links that
                        **leave** the app, and that something is pressable is already said by the
                        border and hover. The hover translate that accompanied it carried no
                        information and was removed too. */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                        {candidate.name}
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
                  /*
                   * `break-keep` — this description broke mid-word as 「yeogi natan|inimnida」 at 280px
                   * (measured 2026-08-12, same instrument). `EmptyState`'s description `<p>` is shared,
                   * so the rule is applied narrowly through the span wrapped here.
                   */
                  description={<span className="break-keep">{t("connectedEmptyHint")}</span>}
                  /* A second project is what unblocks this card, and the
                     project list is where one is made. */
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

          <section className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] shadow-[inset_0_1px_0_var(--color-overlay-1)] md:p-[16px_18px]">
            {/*
              What this card actually does is "copy a starting prompt so my AI can pick up reading this
              project". Yet it was named "agent handoff" with the caption "a person does not need to
              read this — it is for an AI agent". Owner's verdict: *"Too AI-ish."* (too AI-ish). Both
              were right — it is internal jargon, and a negative framing ("you don't need to read this")
              pushes the reader away while never actually saying what it does.

              The order is now explanation → button → (collapsed) preview. Say what it does first, and
              let whoever wants the code expand it.
            */}
            <div className="mb-2">
              <span className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                {t("handoffTitle")}
              </span>
            </div>
            {/*
             * `break-keep` — **Korean trips the reader when it breaks mid-word** (measured 2026-08-12).
             *
             * This paragraph broke as 「i peurojeok|iteo-ui map-eul」 in the 400px rail (362px real width).
             * Instrument: a `Range` per character reveals the characters on either side of the line
             * break — both Korean with no space means mid-word. The cause is `word-break: normal`, and
             * this repository already used `break-keep` elsewhere.
             */}
            <p className="mb-3 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
              {t("handoffDesc")}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={handleCopyHandoff}>
              {handoffCopyLabel}
            </Button>
            <details className="mt-3">
              <summary className=" select-none text-body leading-body text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)]">
                {t("handoffHumanCaption")}
              </summary>
              <pre className="mt-2 overflow-x-auto font-mono text-body leading-prose whitespace-pre-wrap text-[color:var(--color-text-quaternary)]">
                {handoffSnippet}
              </pre>
            </details>
          </section>
        </aside>
      </section>

      <footer className="mt-[var(--section-gap)] border-t border-[color:var(--color-overlay-2)] pt-6 pb-[var(--page-bottom-breath)]">
        {/*
          The footer names the file: slug and the Markdown path this page is drawn from, the two
          things a person types into an agent or a terminal next. The updated date used to stand
          here as well, a second copy of the hero's; the path is what was missing (2026-09-19).
          Without a known document the footer keeps the older slug-and-date form.
        */}
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
      <ShortcutSheet
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </ProjectDetailShell>
  );
}
