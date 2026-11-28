import { useMemo } from "react";
import { useTranslations } from "use-intl";

import { controlClass } from "@/shared/ui";

const FORM_SECTION_IDS = [
  "project-form-basics",
  "project-form-story",
  "project-form-network",
  "project-form-operations",
] as const;

export function ProjectFormSectionNav() {
  const t = useTranslations("settings.projectForm");
  const FORM_SECTIONS = useMemo(
    () => [
      {
        id: FORM_SECTION_IDS[0],
        label: t("sections.basicsLabel"),
        description: t("sections.basicsDescription"),
      },
      {
        id: FORM_SECTION_IDS[1],
        label: t("sections.storyLabel"),
        description: t("sections.storyDescription"),
      },
      {
        id: FORM_SECTION_IDS[2],
        label: t("sections.networkLabel"),
        description: t("sections.networkDescription"),
      },
      {
        id: FORM_SECTION_IDS[3],
        label: t("sections.operationsLabel"),
        description: t("sections.operationsDescription"),
      },
    ],
    [t],
  );
  return (
    <div className="rounded-panel border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
          {t("sections.navLabel")}
        </p>
        <nav className="flex flex-wrap gap-2">
          {FORM_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={controlClass({
                shape: "pill",
                size: "lg",
                tone: "secondary",
                className:
                  "hover:border-[color:var(--color-indigo-brand)] hover:text-[color:var(--color-text-primary)]",
              })}
            >
              {section.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
