import { useCallback } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "use-intl";
import { BookOpen } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { buildOntologyNodeHref } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import { useTaxonomy } from "@/features/taxonomy";
import { MOTION, OVERLAY_RISE, OVERLAY_SETTLED } from "@/shared/motion";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { isPlainLeftClick } from "../../lib/drawer-interaction";
import type { ProjectDrawerModel } from "../../model/use-project-drawer-model";

const PRIMARY_ACTION_CLASS =
  "w-full justify-center border-[color:var(--color-indigo-a38)] bg-[color:var(--color-indigo-a12)] font-[var(--font-weight-signature)] hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a16)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]";

const CONTAINER_ACTION_CLASS =
  "w-full justify-center border-[color:var(--color-amber-docs-a45)] bg-[color:var(--color-amber-docs-a10)] font-[var(--font-weight-signature)] hover:border-[color:var(--color-amber-docs-a65)] hover:bg-[color:var(--color-amber-docs-a16)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-amber-docs-a50)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]";

/** The project's identity and its way in: status, name, description and the action that fits its kind. */
export function ProjectOverviewCard({
  project,
  model,
  activeProjectId,
  onEnterContainer,
  onClose,
}: {
  project: Project;
  model: ProjectDrawerModel;
  activeProjectId?: string | null;
  onEnterContainer?: (slug: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("vaultWidgets.projectDrawer");
  const router = useRouter();
  const { statusLabel } = useTaxonomy();
  const { isContainerNode, displayName, detailHref, docsVaultHref, primaryRelatedDocSlug } = model;

  // The click pushes through the router before the drawer unmounts, since Link's default click raced
  // framer-motion's drag; the href stays for prefetch and middle-click.
  const handleDetailClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (!isPlainLeftClick(event)) return;
      event.preventDefault();
      router.push(detailHref);
    },
    [detailHref, router],
  );

  return (
    <motion.section
      initial={OVERLAY_RISE}
      animate={OVERLAY_SETTLED}
      transition={MOTION.base}
      /* An in-flow card, so it uses the card radius, not the sheet step, keeping the nesting grammar. */
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
            <button
              type="button"
              onClick={() => {
                onEnterContainer?.(project.slug);
                onClose();
              }}
              className={controlClass({
                shape: "card",
                size: "lg",
                tone: "strong",
                className: CONTAINER_ACTION_CLASS,
              })}
            >
              {t("openContainerTopology")}
            </button>
          ) : onEnterContainer && project.isHub && !activeProjectId ? (
            <button
              type="button"
              onClick={() => {
                onEnterContainer(project.slug);
                onClose();
              }}
              className={controlClass({
                shape: "card",
                size: "lg",
                tone: "strong",
                className: PRIMARY_ACTION_CLASS,
              })}
            >
              {t("openHubTopology")}
            </button>
          ) : project.isHub && activeProjectId ? (
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
                  className: PRIMARY_ACTION_CLASS,
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
                className={controlClass({ shape: "chip", size: "lg", tone: "accent", className: "h-10 justify-center gap-1.5 text-body-lg border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a06)] hover:border-[color:var(--color-indigo-a55)] hover:text-[color:var(--color-text-primary)]" })}
              >
                <BookOpen size={ICON_SIZE.sm} />
                {t("openDocsVault")}
              </Link>
              {/* The ontology full detail through a `project:<slug>` deep link; the topology here would be a self-link. */}
              <Link
                href={buildOntologyNodeHref(`project:${project.slug}`)}
                className={controlClass({ shape: "chip", size: "lg", tone: "secondary", className: "h-10 justify-center text-body-lg border-[color:var(--color-divider)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]" })}
              >
                {t("openOntology")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}
