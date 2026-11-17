"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { findProjectDocInList } from "@/entities/docs-vault";
import { MOTION, OVERLAY_RISE, OVERLAY_RISE_REDUCED, OVERLAY_SETTLED } from "@/shared/motion";
import { framerSpring, SPRING } from "@/shared/motion/spring";
import { usePrefersReducedMotion } from "@/shared/lib/render-timing/use-prefers-reduced-motion";
import { getProjectRuntimeDetailHref, getTopologyProjectNodeHref, projectDisplayName, type Project } from "@/entities/project";
import { OpenVaultCta } from "@/features/docs-vault-local";
import { useDataSourceMode, VaultSourceHydrationBoundary, useLocalVault, useVaultIdentityScope } from "@/entities/vault-session";
import { Link } from "@/i18n/navigation";
import { Copy, Plus } from "lucide-react";
import { useDocumentTitle } from "@/shared/lib/public-pages/use-document-title";
import { useCopyFeedback } from "@/shared/lib/clipboard/use-copy-feedback";
import { Button, buttonVariants, FeatureStage, OntologyMapKindGlyph } from "@/shared/ui";
import { badgeClass } from "@/shared/ui/badge-class";
import { usePanelPresence } from "@/shared/lib/render-timing/use-presence";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { controlClass } from "@/shared/ui/control-class";
import { PAGE_FRAME, PAGE_LEDE, PAGE_STAGE_FILL, PAGE_WAIT_LIFT } from "@/shared/ui/tokens/page-frame";
import { PageHeaderBar } from "@/shared/ui/layout/page-header-bar";
import { WaitStage } from "@/shared/ui/status/wait-stage";
import { cn } from "@/shared/lib/cn";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { useNavRailSettingsSlot } from "@/widgets/app-nav-rail";
import { resolveAuthoredDescription } from "../lib/authored-description";
import { resolveRiseBaseline, slugsToRise, type ShownProjects } from "../lib/rise-rule";
import { resolveRecentActivityAgo, type RecentActivityAgo } from "../lib/recent-activity";
import { useProjects, useSelectedProjectSlug, useVaultDocs } from "@/features/project-data-source";
import { ProjectCardArtwork } from "./ProjectCardArtwork";

type SelectorTranslator = ReturnType<typeof useTranslations<"projectPages.selector">>;

function formatAgo(ago: RecentActivityAgo, t: SelectorTranslator) {
  if (ago.unit === "today") return t("activityAgoToday");
  if (ago.unit === "yesterday") return t("activityAgoYesterday");
  return t("activityAgoDaysAgo", { days: ago.days });
}

let lastShown: ShownProjects | null = null;

const TILE_SPRING = framerSpring(SPRING.surface);
const NEW_PROJECT_HREF = `/project/new/?returnTo=${encodeURIComponent("/projects/")}`;

const TILE_SURFACE =
  "rounded-card border bg-[color:var(--color-panel)] shadow-[inset_0_1px_0_var(--color-overlay-1)]";

export function ProjectSelectorPage() {
  const t = useTranslations("projectPages.selector");
  useDocumentTitle(t("documentTitle"));
  const { projects, loaded } = useProjects();
  const dataSourceMode = useDataSourceMode();
  // The sample is not the person's folder, so nothing in it is their selection.
  const selection = useSelectedProjectSlug();
  const selectedSlug = dataSourceMode === "static" ? null : selection;
  const orderedProjects = useMemo(() => selectedFirst(projects, selectedSlug), [projects, selectedSlug]);
  const docs = useVaultDocs();
  const vault = useLocalVault();
  const tSwitch = useTranslations("vaultSwitch");
  const navRailSettingsSlot = useMemo(
    () => <AppSettingsMenu mode={dataSourceMode} triggerVariant="rail-tile" />,
    [dataSourceMode],
  );
  useNavRailSettingsSlot(navRailSettingsSlot);
  const reducedMotion = usePrefersReducedMotion();
  const staged = projects.length <= 1;
  const loading = dataSourceMode === "local" && (vault.status === "opening" || vault.status === "loading");
  const empty = projects.length === 0;
  const stage = usePanelPresence(empty && !loading);
  /* The list keeps the stage's frame until the stage has left, so nothing it stood in moves. */
  const placedOnStage = staged || stage.mounted;
  const openingName = vault.handle?.name;
  const ready = loaded && dataSourceMode === "local";
  const scope = useVaultIdentityScope();
  const [baseline, setBaseline] = useState<ShownProjects | null>(null);
  const setKey = projects.map((project) => project.slug).join("\n");
  if (ready && (baseline === null || baseline.scope !== scope)) {
    setBaseline({ scope, slugs: resolveRiseBaseline(lastShown, scope, setKey.split("\n")) });
  }
  useEffect(() => {
    if (ready) lastShown = { scope, slugs: new Set(setKey.split("\n")) };
  }, [ready, scope, setKey]);
  const rising = new Set(baseline ? slugsToRise(baseline.slugs, setKey.split("\n")) : []);
  const riseStart = reducedMotion ? OVERLAY_RISE_REDUCED : OVERLAY_RISE;
  const riseTransition = reducedMotion ? MOTION.fast : MOTION.base;

  return (
    <VaultSourceHydrationBoundary>
      <div className="flex min-h-full w-full">
        <main
          id="main"
          tabIndex={-1}
          className={cn(
            "flex min-w-0 flex-1 flex-col bg-[color:var(--color-canvas)]",
            !(placedOnStage || loading) && "max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]",
          )}
        >
          <PageHeaderBar
            frame="page"
            title={t("headerTitle")}
            meta={
              loading ? null : (
                <span
                  data-testid="project-selector-count"
                  className="text-label tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-tertiary)] max-sm:sr-only"
                >
                  {dataSourceMode === "static"
                    ? t("projectCountSample", { count: projects.length })
                    : t("projectCount", { count: projects.length })}
                </span>
              )
            }
            actions={
              <>
                {dataSourceMode === "static" ? <OpenVaultCta testId="project-selector-open-vault" /> : null}
                <div className="lg:hidden">
                  <AppSettingsMenu mode={dataSourceMode} triggerVariant="chrome-tile" />
                </div>
              </>
            }
          />
          <div className={cn(PAGE_FRAME, "relative", placedOnStage || loading ? PAGE_STAGE_FILL : "pt-8 md:pt-10 pb-6 md:pb-10")}>
            {loading ? (
              <WaitStage
                mark="mascot"
                delayed
                data-testid="project-selector-loading"
                className={PAGE_WAIT_LIFT}
                title={openingName ? tSwitch("openingNamed", { name: openingName }) : tSwitch("openingUnnamed")}
              />
            ) : (
            <>
            {stage.mounted ? (
              <div
                data-placement={empty ? "stage" : undefined}
                inert={stage.exiting}
                aria-hidden={stage.exiting || undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col",
                  /* Leaving, it keeps the box it stood in so it fades where it was. */
                  stage.exiting && cn("motion-swap-out pointer-events-none absolute inset-x-0 top-0 min-h-full px-5 md:px-10", PAGE_STAGE_FILL),
                )}
              >
                <FirstProjectStage t={t} />
              </div>
            ) : null}
            {empty ? null : (
            <motion.div
              data-placement={placedOnStage ? "stage" : "list"}
              className={cn("min-w-0", placedOnStage && "my-auto")}
              initial={stage.exiting ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              layout={reducedMotion ? false : "position"}
              layoutDependency={placedOnStage}
              transition={{ default: TILE_SPRING, opacity: riseTransition }}
            >
            <p className={`mt-2 max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))] ${PAGE_LEDE}`}>
              {dataSourceMode === "static" ? t("ledeSample") : projects.length === 1 ? t("ledeSole") : t("lede")}
            </p>

              <ul
                data-testid="project-selector-grid"
                className="mt-7 grid list-none grid-cols-1 gap-[var(--card-gap)] p-0 md:grid-cols-2"
              >
                {orderedProjects.map((project) => {
                  const doc = findProjectDocInList(docs, project.slug);
                  return (
                    <motion.li
                      key={project.slug}
                      className="flex min-w-0"
                      initial={rising.has(project.slug) ? riseStart : false}
                      animate={OVERLAY_SETTLED}
                      transition={riseTransition}
                    >
                      <ProjectCard
                        project={project}
                        description={resolveAuthoredDescription(doc, project)}
                        selected={project.slug === selectedSlug}
                        t={t}
                      />
                    </motion.li>
                  );
                })}
              </ul>
              {/* A card arriving above lengthens the grid; the section glides down instead of jumping. */}
              <motion.div layout={reducedMotion ? false : "position"} layoutDependency={setKey} transition={TILE_SPRING}>
                <NextProjectSection t={t} />
              </motion.div>
            </motion.div>
            )}
            </>
            )}
          </div>
        </main>
      </div>
    </VaultSourceHydrationBoundary>
  );
}

/** The selected project leads; the rest keep the order they were derived in. */
function selectedFirst(projects: Project[], selectedSlug: string | null): Project[] {
  const selected = projects.find((project) => project.slug === selectedSlug);
  return selected ? [selected, ...projects.filter((project) => project !== selected)] : projects;
}

function ProjectCard({
  project,
  description,
  selected,
  t,
}: {
  project: Project;
  description: string | null;
  selected: boolean;
  t: SelectorTranslator;
}) {
  const locale = useLocale();
  const name = projectDisplayName(project, locale);
  const detailHref = getProjectRuntimeDetailHref(project.slug);
  const ago = formatAgo(resolveRecentActivityAgo(project.updatedAt, new Date()), t);

  return (
    /* The name's link stretches over the card; the footer doors stand above it on `z-[1]`. */
    <article
      data-testid="project-selector-card"
      data-selected={selected || undefined}
      className={cn(
        TILE_SURFACE,
        "group relative flex w-full min-w-0 flex-col transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] focus-within:border-[color:var(--color-border-strong)]",
        selected ? "border-[color:var(--color-border-strong)]" : "border-[color:var(--color-border-soft)]",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col p-[var(--card-pad)]">
        <div className="flex min-w-0 items-center gap-2.5">
          <OntologyMapKindGlyph kind="project" className="shrink-0" />
          <h2 className="min-w-0 truncate text-title font-[var(--font-weight-strong)] tracking-[var(--tracking-card)]">
            <Link
              href={detailHref}
              prefetch={false}
              aria-current={selected ? "true" : undefined}
              className={controlClass({
                shape: "link",
                tone: "secondary",
                hoverInk: "strong",
                className:
                  "min-w-0 max-w-full text-title text-[color:var(--color-text-primary)] after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:ring-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[color:var(--color-indigo-focus-ring)]",
              })}
              /* The focus ring outlines the whole card, which is what the pointer presses. */
            >
              <span className="min-w-0 truncate">{name}</span>
            </Link>
          </h2>
          {selected ? (
            <span
              data-testid="project-selector-selected-tag"
              className={badgeClass({
                shape: "tag",
                className: "shrink-0 border border-[color:var(--color-border-soft)] py-0.5 text-[color:var(--color-text-secondary)]",
              })}
            >
              {t("selectedTag")}
            </span>
          ) : null}
        </div>
        {/* No reserved lines: the row stretches cards and pins footers. The clamp is a last resort. */}
        <p className="mt-2.5 line-clamp-4 text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
          {description ?? (
            <span className="text-[color:var(--color-text-tertiary)]">{t("cardDescriptionFallback")}</span>
          )}
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-[color:var(--color-divider)] px-[var(--card-pad)] py-3">
        <span className="mr-auto text-label text-[color:var(--color-text-tertiary)]">
          {t("cardUpdatedPrefix")} {ago}
        </span>
        <Link
          href={getTopologyProjectNodeHref(project.slug)}
          prefetch={false}
          className={controlClass({ shape: "chip", size: "md", tone: "secondary", className: "relative z-[1]" })}
        >
          {t("footTopologyView")}
        </Link>
        <Link
          href={detailHref}
          prefetch={false}
          aria-label={t("cardDetailAriaLabel", { name })}
          className={controlClass({ shape: "chip", size: "md", tone: "secondary", className: "relative z-[1]" })}
        >
          {t("footDetail")}
        </Link>
      </div>
    </article>
  );
}


/**
 * The page's one way to add a project, set apart from the cards it would add to: the form or a
 * request to paste into an agent, each control under the sentence that explains it.
 */
function NextProjectSection({ t }: { t: SelectorTranslator }) {
  const copy = useCopyFeedback();
  const copyLabel = copyLabelFor(copy.state, t);
  const sentence =
    "min-w-0 max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))] text-pretty text-body leading-body text-[color:var(--color-text-tertiary)]";
  return (
    <section
      data-testid="project-selector-next-slot"
      aria-labelledby="project-selector-next-slot-title"
      className="mt-8 border-t border-[color:var(--color-divider)] pt-5"
    >
      <h2 id="project-selector-next-slot-title" className="text-body leading-body text-[color:var(--color-text-secondary)]">
        {t("nextSlotTitle")}
      </h2>
      <div className="mt-3 grid min-w-0 grid-cols-1 gap-x-[var(--card-gap)] gap-y-5 md:grid-cols-2">
        <div className="flex min-w-0 flex-col items-start gap-3">
          <p className={sentence}>{t("nextSlotFormSub")}</p>
          <Link
            href={NEW_PROJECT_HREF}
            data-testid="project-selector-new-cta"
            className={controlClass({ shape: "chip", size: "md", tone: "secondary" })}
          >
            <Plus size={ICON_SIZE.sm} aria-hidden />
            {t("ctaNewProject")}
          </Link>
        </div>
        <div className="flex min-w-0 flex-col items-start gap-3">
          <p className={sentence}>{t("nextSlotSub")}</p>
          <button
            type="button"
            data-testid="project-selector-next-copy"
            onClick={() => void copy.copy(t("nextSlotPrompt"))}
            className={controlClass({ shape: "chip", size: "md", tone: "secondary", className: "max-w-full" })}
          >
            <Copy size={ICON_SIZE.sm} aria-hidden />
            <span aria-live="polite" className="min-w-0 truncate">{copyLabel}</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function copyLabelFor(state: ReturnType<typeof useCopyFeedback>["state"], t: SelectorTranslator) {
  return state === "copied" ? t("nextSlotCopied") : state === "failed" ? t("nextSlotCopyError") : t("nextSlotCopy");
}

/** The sentence's backticked span is what the person types, so it reads as code. */
function withInlineCode(sentence: string) {
  return sentence.split("`").map((part, index) => (index % 2 === 1 ? (
    <code key={index} className="whitespace-nowrap rounded-micro bg-[color:var(--color-overlay-2)] px-1 font-mono text-[color:var(--color-text-primary)]">{part}</code>
  ) : part));
}

/** A folder with no project yet: the card it will hold, drawn being composed, and the same two ways in as the tile. */
function FirstProjectStage({ t }: { t: SelectorTranslator }) {
  const copy = useCopyFeedback();
  const copyLabel = copyLabelFor(copy.state, t);
  return (
    <FeatureStage
      data-testid="project-selector-first-stage"
      artWidth="wide"
      art={(state) => <ProjectCardArtwork {...state} />}
      title={t("stageTitle")}
      body={t("stageBody")}
      action={
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={NEW_PROJECT_HREF}
            data-testid="project-selector-new-cta"
            className={cn(buttonVariants({ variant: "primary", size: "lg" }), "atlas-touch-floor atlas-touch-floor-wide")}
          >
            <Plus size={ICON_SIZE.lg} aria-hidden />
            {t("ctaNewProject")}
          </Link>
          <Button
            size="lg"
            variant="ghost"
            data-testid="project-selector-next-copy"
            onClick={() => void copy.copy(t("nextSlotPrompt"))}
            className="max-w-full"
          >
            <Copy size={ICON_SIZE.lg} aria-hidden />
            <span aria-live="polite" className="min-w-0 truncate">{copyLabel}</span>
          </Button>
        </div>
      }
      note={<p className="text-pretty">{withInlineCode(t("emptyStateDesc"))}</p>}
    />
  );
}
