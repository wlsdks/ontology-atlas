"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { MOTION, OVERLAY_RISE, OVERLAY_SETTLED } from "@/shared/motion";
import { Chip } from "@/shared/ui";
import type { ProjectDrawerModel } from "../../model/use-project-drawer-model";

/** One sentence on how the project connects, and the first neighbour to open next. */
export function ProjectNextProjects({
  model,
  onSelectProject,
}: {
  model: ProjectDrawerModel;
  onSelectProject: (slug: string) => void;
}) {
  const t = useTranslations("vaultWidgets.projectDrawer");
  const { relationshipSummary, nextProjects } = model;

  return (
    <motion.section
      initial={OVERLAY_RISE}
      animate={OVERLAY_SETTLED}
      transition={{ ...MOTION.base, delay: 0.03 }}
      className="mt-5 md:mt-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
          {t("connectionsTitle")}
        </h3>
      </div>
      <div className="mt-3 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
        <p className="text-body-lg leading-title text-[color:var(--color-text-secondary)]">
          {relationshipSummary ? t(relationshipSummary.key, relationshipSummary.values) : ""}
        </p>
        {nextProjects.length > 0 && (
          <div className="mt-4">
            <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
              {t("nextProjects")}
            </p>
            <div className="mt-2 flex flex-col items-start gap-2">
              <Chip
                size="lg"
                tone="secondary"
                onClick={() => onSelectProject(nextProjects[0]!.slug)}
                className="hover:border-[color:var(--color-indigo-brand)] hover:text-[color:var(--color-text-primary)]"
              >
                <span>{nextProjects[0]!.name}</span>
              </Chip>
              {nextProjects.length > 1 ? (
                <p className="text-body text-[color:var(--color-text-tertiary)]">
                  {t("moreRelated", { count: nextProjects.length - 1 })}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
}
