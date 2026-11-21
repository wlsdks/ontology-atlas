"use client";

import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import {
  EXIT_TRANSITION,
  MOTION,
  OVERLAY_SPRING,
  useExitLockout,
} from "@/shared/motion";
import { mergeRefs } from "@/shared/lib/merge-refs";
import { formatDate } from "@/shared/lib/locale-text/format-date";
import type { Project, ProjectImpactMode } from "@/entities/project";
import { PublicQuickActions } from "@/widgets/public-quick-actions";
import { shouldDismissOnDrag } from "../lib/drawer-interaction";
import { useDrawerDialog } from "../model/use-drawer-dialog";
import { useProjectDrawerModel } from "../model/use-project-drawer-model";
import { ProjectDrawerHeader } from "./ProjectDrawerHeader";
import { ProjectMoreInfo } from "./more-info/ProjectMoreInfo";
import { ProjectNextProjects } from "./overview/ProjectNextProjects";
import { ProjectOverviewCard } from "./overview/ProjectOverviewCard";

interface Props {
  project: Project | null;
  allProjects: Project[];
  activeProjectId?: string | null;
  impactMode: ProjectImpactMode;
  onChangeImpactMode: (mode: ProjectImpactMode) => void;
  onClose: () => void;
  onSelectProject: (slug: string) => void;
  containerLabel?: string | null;
  onEnterContainer?: (slug: string) => void;
}

export function ProjectDrawer({
  project,
  allProjects,
  activeProjectId,
  impactMode,
  onChangeImpactMode,
  onClose,
  onSelectProject,
  containerLabel,
  onEnterContainer,
}: Props) {
  const t = useTranslations("vaultWidgets.projectDrawer");
  const { ref: asideLockoutRef, onAnimationStart: asideLockoutOnAnimationStart } = useExitLockout<HTMLElement>();
  const { ref: contentSwapLockoutRef, onAnimationStart: contentSwapLockoutOnAnimationStart } = useExitLockout<HTMLDivElement>();
  // Swipe down closes only from the handle (dragListener=false) so it does not fight the content's
  // vertical scroll.
  const dragControls = useDragControls();
  const asideRef = useDrawerDialog({
    subject: project,
    onClose,
    closeLabel: t("closeAriaLabel"),
  });
  const model = useProjectDrawerModel({ project, allProjects, impactMode, containerLabel });

  return (
    <AnimatePresence>
      {project && (
        <motion.aside
          data-testid="project-drawer"
          ref={mergeRefs(asideRef, asideLockoutRef)}
          onAnimationStart={asideLockoutOnAnimationStart}
          role="dialog"
          aria-modal="true"
          aria-label={t("ariaLabelWithName", { name: project.name })}
          aria-describedby={`project-drawer-summary-${project.slug}`}
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1, y: 0 }}
          exit={{ x: "100%", opacity: 0, transition: EXIT_TRANSITION }}
          // The critically damped overlay spring; overshoot needs explicit approval.
          transition={OVERLAY_SPRING}
          drag="y"
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.4 }}
          onDragEnd={(_, info) => {
            if (shouldDismissOnDrag(info.offset.y, info.velocity.y)) onClose();
          }}
          className="fixed inset-x-0 bottom-0 top-[38%] z-30 flex w-full flex-col overflow-y-auto overscroll-y-contain rounded-t-sheet border-t border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-3)] lg:inset-y-0 lg:right-0 lg:left-auto lg:top-0 lg:max-w-md lg:rounded-none lg:border-t-0 lg:border-l"
        >
          <ProjectDrawerHeader
            project={project}
            isContainerNode={model.isContainerNode}
            containerLabel={containerLabel}
            dragControls={dragControls}
            onClose={onClose}
          />

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={project.slug}
              ref={contentSwapLockoutRef}
              onAnimationStart={contentSwapLockoutOnAnimationStart}
              initial={{ opacity: 0, x: 18, y: 6 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: -14, y: -4, transition: EXIT_TRANSITION }}
              transition={MOTION.base}
              className="flex-1 px-4 py-4 md:px-6 md:py-6"
            >
              <ProjectOverviewCard
                project={project}
                model={model}
                activeProjectId={activeProjectId}
                onEnterContainer={onEnterContainer}
                onClose={onClose}
              />

              {!model.isContainerNode && (
                <ProjectNextProjects model={model} onSelectProject={onSelectProject} />
              )}

              {!model.isContainerNode && (
                <ProjectMoreInfo
                  project={project}
                  model={model}
                  impactMode={impactMode}
                  onChangeImpactMode={onChangeImpactMode}
                  onSelectProject={onSelectProject}
                />
              )}

              <div className="mt-5">
                <PublicQuickActions
                  projectSlug={project.slug}
                  label={t("manageLabel")}
                  className="w-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] shadow-none"
                />
              </div>

              <footer className="mt-6 border-t border-[color:var(--color-overlay-2)] pt-4 md:mt-8">
                <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
                  {t.rich("footerUpdated", {
                    slug: project.slug,
                    date: formatDate(project.updatedAt),
                    value: (chunks) => <span className="normal-case tracking-normal">{chunks}</span>,
                  })}
                </p>
              </footer>
            </motion.div>
          </AnimatePresence>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
