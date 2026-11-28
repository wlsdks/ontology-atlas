import { useTranslations } from "use-intl";
import { ChevronDown } from "lucide-react";
import type { Project, ProjectImpactMode } from "@/entities/project";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import type { ProjectDrawerModel } from "../../model/use-project-drawer-model";
import { ProjectBasicInfo } from "./ProjectBasicInfo";
import { ProjectConnectionLists } from "./ProjectConnectionLists";
import { ProjectRecords } from "./ProjectRecords";
import { ProjectTagsAndStack } from "./ProjectTagsAndStack";

/** The disclosure that holds everything past the overview: integrity warnings, basics, tags, connections and records. */
export function ProjectMoreInfo({
  project,
  model,
  impactMode,
  onChangeImpactMode,
  onSelectProject,
}: {
  project: Project;
  model: ProjectDrawerModel;
  impactMode: ProjectImpactMode;
  onChangeImpactMode: (mode: ProjectImpactMode) => void;
  onSelectProject: (slug: string) => void;
}) {
  const t = useTranslations("vaultWidgets.projectDrawer");
  const { integrityIssueLabels } = model;

  return (
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
        <ProjectBasicInfo
          project={project}
          model={model}
          impactMode={impactMode}
          onChangeImpactMode={onChangeImpactMode}
        />
        <ProjectTagsAndStack project={project} />
        <ProjectConnectionLists project={project} model={model} onSelectProject={onSelectProject} />
        <ProjectRecords project={project} />
      </div>
    </details>
  );
}
