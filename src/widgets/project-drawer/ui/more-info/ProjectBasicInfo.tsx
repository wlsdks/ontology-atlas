"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ProjectMetaGrid, type Project, type ProjectImpactMode } from "@/entities/project";
import { CopyProjectLinkButton } from "@/features/project-share";
import { useTaxonomy } from "@/features/taxonomy";
import { EXIT_TRANSITION, MOTION, useExitLockout } from "@/shared/motion";
import { cn } from "@/shared/lib/cn";
import { useRovingRadioGroup } from "@/shared/lib/keyboard/use-roving-radio-group";
import { controlClass } from "@/shared/ui";
import { IMPACT_MODE_COPY_KEYS } from "../../lib/impact-mode-copy";
import type { ProjectDrawerModel } from "../../model/use-project-drawer-model";

const CAPTION_CLASS =
  "font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]";
const INSIGHT_CELL_CLASS =
  "rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3.5 py-3";
const INSIGHT_VALUE_CLASS =
  "mt-1 text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]";

/** Status, owner and link counts, the completeness and freshness read-outs, and the impact-mode switch. */
export function ProjectBasicInfo({
  project,
  model,
  impactMode,
  onChangeImpactMode,
}: {
  project: Project;
  model: ProjectDrawerModel;
  impactMode: ProjectImpactMode;
  onChangeImpactMode: (mode: ProjectImpactMode) => void;
}) {
  const t = useTranslations("vaultWidgets.projectDrawer");
  const tFreshness = useTranslations("projectFreshness");
  const { statusLabel } = useTaxonomy();
  const { ref: impactModeHelpLockoutRef, onAnimationStart: impactModeHelpLockoutOnAnimationStart } =
    useExitLockout<HTMLSpanElement>();
  const { impactInsight, completenessInsight, freshnessInsight, referencedBy } = model;

  const impactModeHelpKey =
    IMPACT_MODE_COPY_KEYS.find((item) => item.mode === impactMode)?.helpKey ?? "impactHelpNone";
  const impactGroup = useRovingRadioGroup({
    value: impactMode,
    values: IMPACT_MODE_COPY_KEYS.map((item) => item.mode),
    onChange: onChangeImpactMode,
  });

  const signalItems = [
    { label: t("signalStatus"), value: statusLabel(project.status) },
    { label: t("signalOwner"), value: project.owner ?? t("ownerFallback") },
    { label: t("signalConnected"), value: String(referencedBy.length) },
    { label: t("signalDeps"), value: String(project.dependencies.length) },
  ];

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <h3 className={CAPTION_CLASS}>{t("basicInfo")}</h3>
        {impactInsight ? (
          <span
            id="project-drawer-impact-help"
            data-testid="project-drawer-impact-help"
            className="text-body text-[color:var(--color-text-tertiary)]"
          >
            <AnimatePresence mode="wait" initial={false}>
              {/* Kept under reduced motion: an opacity-only swap with no movement. */}
              <motion.span
                key={impactModeHelpKey}
                ref={impactModeHelpLockoutRef}
                onAnimationStart={impactModeHelpLockoutOnAnimationStart}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: EXIT_TRANSITION }}
                transition={MOTION.fast}
              >
                {t(impactModeHelpKey)}
              </motion.span>
            </AnimatePresence>
          </span>
        ) : null}
      </div>
      <ProjectMetaGrid
        items={signalItems}
        className="mt-3"
        cellClassName="bg-[color:var(--color-panel)] px-4 py-3.5"
      />

      {(completenessInsight || freshnessInsight) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {completenessInsight ? (
            <div className={INSIGHT_CELL_CLASS}>
              <p className={CAPTION_CLASS}>{t("completeness")}</p>
              <p className={INSIGHT_VALUE_CLASS}>{completenessInsight.score}%</p>
            </div>
          ) : null}
          {freshnessInsight ? (
            <div className={INSIGHT_CELL_CLASS}>
              <p className={CAPTION_CLASS}>{t("freshness")}</p>
              <p className={INSIGHT_VALUE_CLASS}>{tFreshness(freshnessInsight.level)}</p>
            </div>
          ) : null}
        </div>
      )}

      {impactInsight && (
        <div
          {...impactGroup.groupProps}
          aria-label={t("impactModeGroupAria")}
          className="mt-3 flex flex-wrap gap-2"
        >
          {/*
           * title carries the per-mode help for mouse users, and aria-label leads with the visible
           * label (Label-in-Name) so touch and screen readers get the same information.
           */}
          {IMPACT_MODE_COPY_KEYS.map((item, index) => {
            const active = impactMode === item.mode;
            const label = t(item.labelKey);
            const help = t(item.helpKey);
            return (
              <button
                key={item.mode}
                {...impactGroup.itemProps(index)}
                type="button"
                aria-describedby="project-drawer-impact-help"
                title={help}
                aria-label={`${label} — ${help}`}
                className={controlClass({
                  shape: "pill",
                  size: "md",
                  tone: active ? "default" : "muted",
                  className: cn(
                    "px-3",
                    active
                      ? "border-[color:var(--color-indigo-brand)] bg-[color:var(--color-indigo-a12)]"
                      : "border-[color:var(--color-divider)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]",
                  ),
                })}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3">
        <CopyProjectLinkButton
          slug={project.slug}
          testId="project-drawer-copy-link"
          className="h-10 w-full justify-center"
        />
      </div>
    </section>
  );
}
