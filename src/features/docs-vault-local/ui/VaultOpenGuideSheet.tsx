"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { isDesktopShell } from "@/shared/lib/desktop-shell";
import { useHydrated } from "@/shared/lib/use-hydrated";
import { FolderOpen, HardDrive, ShieldCheck, Sparkles, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import {
  EXIT_TRANSITION,
  MOTION,
  SHEET_RISE,
  SHEET_SETTLED,
  useExitLockout,
} from '@/shared/motion';
import { mergeRefs } from "@/shared/lib/merge-refs";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { useDialogFocusTrap } from "@/shared/lib/use-dialog-focus-trap";
import { controlClass } from "@/shared/ui/control-class";
import { IconButton } from "@/shared/ui/controls";

/**
 * The pre-flight sheet before the OS folder picker: three reassurance lines and one
 * existing-versus-new branch. Modal contract as AgentConnectSheet (scrim, centred card, Esc and
 * scrim close, propagation stopped on the card).
 */
export interface VaultOpenGuideSheetProps {
  open: boolean;
  onClose: () => void;
  /** Closes the sheet and opens the OS folder picker (`vault.open()`). */
  onPickExisting?: () => void;
  /** Closes the sheet and enters the scaffold flow. */
  onCreateNew?: () => void;
  /**
   * Without the File System Access API both buttons would do nothing, so an honest notice and the
   * macOS app path replace them before anything is pressed.
   */
  unsupported?: boolean;
}

const BULLETS = [
  { icon: FolderOpen, key: "bulletAnyFolder", browserOnly: false },
  { icon: HardDrive, key: "bulletLocal", browserOnly: false },
  { icon: Sparkles, key: "bulletStarter", browserOnly: false },
  // Announces the browser's permission prompt after folder selection, which first-time users took
  // for a malfunction. Browser-only: the installed app opens an OS folder window without it.
  { icon: ShieldCheck, key: "bulletPermission", browserOnly: true },
] as const;

export function VaultOpenGuideSheet({
  open,
  onClose,
  onPickExisting,
  onCreateNew,
  unsupported = false,
}: VaultOpenGuideSheetProps) {
  const t = useTranslations("vaultOpenGuide");
  /*
   * `isDesktopShell()` is false in a static prerender; `useHydrated()` re-renders once after
   * hydration so the installed app gets the right value (see `use-hydrated.ts`).
   */
  const hydrated = useHydrated();
  const desktop = hydrated && isDesktopShell();
  const bullets = BULLETS.filter((bullet) => !bullet.browserOnly || !desktop);
  // Reuses the first-run card's unsupported notice key, so the two copies cannot drift.
  const tUnsupported = useTranslations("firstRunStarter");
  useBodyScrollLock(open);
  const dialogRef = useDialogFocusTrap<HTMLElement>({
    open,
    onEscape: onClose,
  });
  const { ref: scrimLockoutRef, onAnimationStart: scrimLockoutOnAnimationStart } = useExitLockout<HTMLDivElement>();
  const { ref: dialogLockoutRef, onAnimationStart: dialogLockoutOnAnimationStart } = useExitLockout<HTMLElement>();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={scrimLockoutRef}
          data-interactive-overlay="true"
          onAnimationStart={scrimLockoutOnAnimationStart}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: EXIT_TRANSITION }}
          transition={MOTION.base}
          /* At 200% browser text the rem breakpoints keep the fixed bottom bar in a wide window, so
             this consumer reserves its own bar space to keep the actions inside the viewport. */
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--color-backdrop-medium)] p-4 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+1rem)] sm:p-6 sm:max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+1.5rem)]"
          onClick={onClose}
          data-testid="vault-guide-scrim"
        >
          <motion.section
            ref={mergeRefs(dialogRef, dialogLockoutRef)}
            tabIndex={-1}
            onAnimationStart={dialogLockoutOnAnimationStart}
            initial={SHEET_RISE}
            animate={SHEET_SETTLED}
            exit={{ ...SHEET_RISE, transition: EXIT_TRANSITION }}
            transition={MOTION.base}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t("title")}
            data-testid="vault-guide-sheet"
            // Focus moves here on open so a screen reader starts from the title; the ring is removed
            // because this focus is for announcement (tests/e2e/dialog-focus-ring.spec.ts).
            className="flex max-h-full w-full max-w-[var(--dialog-w-sm)] flex-col overflow-y-auto rounded-sheet border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-3)] focus-visible:outline-none"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-5 py-4">
              <div>
                <h2 className="text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
                  {t("title")}
                </h2>
                <p className="mt-1 text-label leading-prose text-[color:var(--color-text-tertiary)]">
                  {/* Unsupported: the slot says why instead of promising a picker that will never come. */}
                  {/* The count comes from the rendered list, so it stays right as items change at runtime. */}
                  {unsupported
                    ? tUnsupported("unsupportedNotice")
                    : t("subtitle", { count: bullets.length })}
                </p>
              </div>
              <IconButton
                label={t("actionCancel")}
                onClick={onClose}
                data-testid="vault-guide-close"
                size="sm"
                tone="muted"
                className="hover:text-[color:var(--color-text-primary)]"
              >
                <X size={ICON_SIZE.md} aria-hidden />
              </IconButton>
            </header>

            {/* Unsupported: these bullets describe the browser picker flow, so one notice and one
               place to go replace them. */}
            <ul hidden={unsupported} className="flex flex-col gap-2.5 px-5 py-4">
              {bullets.map(({ icon: Icon, key }) => (
                <li key={key} className="flex items-start gap-2.5">
                  <Icon
                    size={14}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]"
                  />
                  <span className="text-body leading-body text-[color:var(--color-text-secondary)]">
                    {t(key)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-2 border-t border-[color:var(--color-border-soft)] px-5 py-4">
              {unsupported ? (
                <Link
                  href="/download/"
                  data-testid="vault-guide-unsupported-cta"
                  className={controlClass({
                    shape: "chip",
                    size: "lg",
                    tone: "onAccent",
                    className:
                      "w-full justify-center",
                  })}
                >
                  <HardDrive size={ICON_SIZE.md} aria-hidden />
                  {tUnsupported("unsupportedCta")}
                </Link>
              ) : null}
              <button
                type="button"
                hidden={unsupported}
                onClick={onPickExisting}
                data-testid="vault-guide-pick-existing"
                /* The two stacked buttons are one set, so both are `chip`/`lg` and share a height. */
                className={controlClass({
                  shape: "chip",
                  size: "lg",
                  tone: "onAccent",
                  className:
                    "w-full justify-center",
                })}
              >
                <FolderOpen size={ICON_SIZE.md} aria-hidden />
                {t("actionPickExisting")}
              </button>
              <button
                type="button"
                hidden={unsupported}
                onClick={onCreateNew}
                data-testid="vault-guide-create-new"
                className={controlClass({
                  shape: "chip",
                  size: "lg",
                  tone: "secondary",
                  className:
                    "w-full justify-center hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]",
                })}
              >
                <Sparkles size={ICON_SIZE.md} aria-hidden />
                {t("actionCreateNew")}
              </button>
              <button
                type="button"
                onClick={onClose}
                data-testid="vault-guide-cancel"
                className={controlClass({
                  shape: "link",
                  tone: "muted",
                  className:
                    "mt-0.5 self-center hover:text-[color:var(--color-text-secondary)]",
                })}
              >
                {t("actionCancel")}
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
