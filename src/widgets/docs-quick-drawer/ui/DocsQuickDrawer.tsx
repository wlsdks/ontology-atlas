"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { AGENT_DOCK_INSET_SURFACE_CLASS } from "@/shared/ui/surfaces/agent-dock-surface";
import { EXIT_TRANSITION, MOTION, useExitLockout } from "@/shared/motion";
import { mergeRefs } from "@/shared/lib/merge-refs";
import { useLatinEyebrow } from "@/shared/lib/locale-text/latin-eyebrow";
import { cn } from "@/shared/lib/cn";
import {
  useDocsQuickDrawer,
  type DocsQuickDrawerContextProject,
} from "../model/use-docs-quick-drawer";
import { DocsDrawerBody } from "./doc-list/DocsDrawerBody";
import { DocsDrawerHeader } from "./search/DocsDrawerHeader";

interface Props {
  open: boolean;
  onClose: () => void;
  basePath?: string;
  getDocHref?: (slug?: string | null) => string;
  contextProject?: DocsQuickDrawerContextProject | null;
}

const SWIPE_DISMISS_OFFSET_PX = 120;
const SWIPE_DISMISS_VELOCITY_PX_PER_SECOND = 450;

export function DocsQuickDrawer({
  open,
  onClose,
  basePath = "/docs",
  getDocHref = (slug) =>
    slug
      ? `${basePath}/?slug=${encodeURIComponent(slug)}`
      : basePath,
  contextProject,
}: Props) {
  const t = useTranslations("vaultWidgets.docsDrawer");
  const eyebrow14 = useLatinEyebrow("tracking-[var(--tracking-caps-14)]");
  const model = useDocsQuickDrawer({ open, onClose, contextProject });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { ref: scrimLockoutRef, onAnimationStart: scrimLockoutOnAnimationStart } = useExitLockout<HTMLDivElement>();
  const { ref: panelLockoutRef, onAnimationStart: panelLockoutOnAnimationStart } = useExitLockout<HTMLDivElement>();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="docs-quick-drawer"
          ref={scrimLockoutRef}
          data-interactive-overlay="true"
          onAnimationStart={scrimLockoutOnAnimationStart}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: EXIT_TRANSITION }}
          transition={MOTION.base}
          className="pointer-events-auto fixed inset-0 z-40 bg-[color:var(--color-backdrop-medium)]"
          onClick={onClose}
        >
          <motion.aside
            ref={mergeRefs(panelRef, panelLockoutRef)}
            // eslint-disable-next-line no-restricted-syntax -- an edge drawer; Dialog has no edge variant yet
            role="dialog"
            aria-modal="true"
            aria-label={t("ariaLabel")}
            onAnimationStart={panelLockoutOnAnimationStart}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%", transition: EXIT_TRANSITION }}
            transition={MOTION.base}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.4 }}
            dragMomentum={false}
            onDragEnd={(_, panInfo) => {
              if (
                panInfo.offset.x > SWIPE_DISMISS_OFFSET_PX ||
                panInfo.velocity.x > SWIPE_DISMISS_VELOCITY_PX_PER_SECOND
              ) {
                onClose();
              }
            }}
            onClick={(event) => event.stopPropagation()}
            /*
             * Inset like the agent dock (`AGENT_DOCK_INSET_SURFACE_CLASS`) so all four edges show
             * and the two right-hand surfaces cannot drift apart.
             */
            className={`${AGENT_DOCK_INSET_SURFACE_CLASS} fixed right-3 flex w-full max-w-[380px] flex-col touch-pan-y`}
          >
            <DocsDrawerHeader model={model} getDocHref={getDocHref} onClose={onClose} />
            <DocsDrawerBody
              model={model}
              getDocHref={getDocHref}
              contextProject={contextProject}
              onClose={onClose}
            />

            <footer
              className={cn(
                "shrink-0 border-t border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-5 py-2.5",
              )}
            >
              <p className={`text-caption text-[color:var(--color-text-quaternary)] ${eyebrow14}`}>
                <kbd className="rounded-micro border border-[color:var(--color-overlay-3)] px-1 py-0.5 tabular-nums">↑↓</kbd>
                {" "}{t("footerMove")} ·{" "}
                <kbd className="rounded-micro border border-[color:var(--color-overlay-3)] px-1 py-0.5 tabular-nums">↵</kbd>
                {" "}{t("footerOpen")} ·{" "}
                <kbd className="rounded-micro border border-[color:var(--color-overlay-3)] px-1 py-0.5 tabular-nums">Esc</kbd>
                {" "}{t("footerClose")} · {t("footerSwipe")}
              </p>
            </footer>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
