"use client";

import { useTranslations } from "next-intl";
import { BookOpen } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import type { Project } from "@/entities/project";
import { Chip, controlClass } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import type { ProjectRelation } from "../../lib/project-connections";
import type { ProjectDrawerModel } from "../../model/use-project-drawer-model";

const CARD_CLASS =
  "rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]";
const CAPTION_CLASS =
  "font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]";

function RelationChip({
  relation,
  onSelectProject,
}: {
  relation: ProjectRelation;
  onSelectProject: (slug: string) => void;
}) {
  return (
    <li>
      <Chip
        size="lg"
        tone="secondary"
        onClick={() => onSelectProject(relation.project.slug)}
        className="hover:border-[color:var(--color-indigo-brand)] hover:text-[color:var(--color-text-primary)]"
      >
        <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
          {relation.relationship.label}
        </span>
        <span>{relation.project.name}</span>
      </Chip>
    </li>
  );
}

/** What the project depends on (with the slugs that no longer resolve), what uses it, and its related documents. */
export function ProjectConnectionLists({
  project,
  model,
  onSelectProject,
}: {
  project: Project;
  model: ProjectDrawerModel;
  onSelectProject: (slug: string) => void;
}) {
  const t = useTranslations("vaultWidgets.projectDrawer");
  const {
    referencedBy,
    missingDependencyIssues,
    dependencyRelations,
    referencedByRelations,
    relatedDocs,
    relatedDocDetails,
  } = model;

  if (
    project.dependencies.length === 0 &&
    referencedBy.length === 0 &&
    missingDependencyIssues.length === 0
  ) {
    return null;
  }

  return (
    <section>
      <h3 className={CAPTION_CLASS}>{t("connections")}</h3>
      <div className="mt-3 grid gap-3">
        {(project.dependencies.length > 0 || missingDependencyIssues.length > 0) && (
          <div className={CARD_CLASS}>
            <p className={CAPTION_CLASS}>{t("dependsOn")}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {dependencyRelations.map((relation) => (
                <RelationChip
                  key={relation.project.slug}
                  relation={relation}
                  onSelectProject={onSelectProject}
                />
              ))}
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
          <div className={CARD_CLASS}>
            <p className={CAPTION_CLASS}>{t("usedBy")}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {referencedByRelations.map((relation) => (
                <RelationChip
                  key={relation.project.slug}
                  relation={relation}
                  onSelectProject={onSelectProject}
                />
              ))}
            </ul>
          </div>
        )}
        {relatedDocs.length > 0 && relatedDocDetails && (
          <div data-testid="project-drawer-related-docs" className={`motion-swap-in ${CARD_CLASS}`}>
            <p className={`flex items-center gap-1.5 ${CAPTION_CLASS}`}>
              <BookOpen size={ICON_SIZE.sm} aria-hidden />
              {t("relatedDocs", { count: relatedDocs.length })}
            </p>
            <ul className="mt-3 flex flex-col gap-1">
              {relatedDocs.map((match, index) => {
                const excerpt = relatedDocDetails[index]?.excerpt ?? "";
                const hasExcerpt = excerpt.trim().length > 0;
                return (
                  <li key={match.doc.slug}>
                    <Link
                      href={buildDocsVaultHref({ slug: match.doc.slug })}
                      className={controlClass({ shape: "row", size: "sm", tone: "secondary", className: "group flex-col items-start gap-1 border border-transparent hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]" })}
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex-1 truncate">{match.doc.title}</span>
                        <span
                          className="font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]"
                          title={match.reasons.join(", ")}
                        >
                          {match.reasons[0]}
                        </span>
                      </span>
                      {hasExcerpt && (
                        <p className="hidden line-clamp-2 text-label leading-label text-[color:var(--color-text-quaternary)] [@media(hover:hover)]:group-hover:block">
                          {excerpt}
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
  );
}
