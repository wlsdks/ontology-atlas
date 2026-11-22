"use client";

import type { DragControls } from "framer-motion";
import { useTranslations } from "next-intl";
import type { Project } from "@/entities/project";
import { useTaxonomy } from "@/features/taxonomy";
import { badgeClass } from "@/shared/ui/badge-class";
import { CloseButton } from "@/shared/ui";

export function ProjectDrawerHeader({
  project,
  isContainerNode,
  containerLabel,
  dragControls,
  onClose,
}: {
  project: Project;
  isContainerNode: boolean;
  containerLabel?: string | null;
  dragControls: DragControls;
  onClose: () => void;
}) {
  const t = useTranslations("vaultWidgets.projectDrawer");
  const { categoryLabel } = useTaxonomy();

  return (
    <header className="sticky top-0 border-b border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-4 py-3 md:px-6 md:py-4">
      {/* The swipe area includes the handle's padding; on md+ no swipe is attached. */}
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
        <CloseButton onClick={onClose} label={t("closeAriaLabel")} />
      </div>
    </header>
  );
}
