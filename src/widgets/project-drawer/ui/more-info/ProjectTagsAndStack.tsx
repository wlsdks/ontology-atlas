import { useTranslations } from "use-intl";
import type { Project } from "@/entities/project";
import { cn } from "@/shared/lib/cn";

export function ProjectTagsAndStack({ project }: { project: Project }) {
  const t = useTranslations("vaultWidgets.projectDrawer");
  if (project.tags.length === 0 && project.stack.length === 0) return null;

  return (
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
  );
}
