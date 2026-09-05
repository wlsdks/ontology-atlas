"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { isDesktopShell } from "@/shared/lib/desktop-shell";
import { useHydrated } from "@/shared/lib/use-hydrated";
import { FolderOpen, HardDrive, ShieldCheck, Sparkles, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { EXIT_TRANSITION, MOTION, useExitLockout } from "@/shared/motion";
import { mergeRefs } from "@/shared/lib/merge-refs";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { useDialogFocusTrap } from "@/shared/lib/use-dialog-focus-trap";
import { controlClass } from "@/shared/ui/control-class";
import { IconButton } from "@/shared/ui/controls";

/**
 * The pre-flight sheet for opening a folder. The first-run card's folder CTA used to go straight to
 * the OS folder picker with zero explanation, so a first-time user faced "which folder do I pick /
 * what happens if I do / are my files safe?" and backed out (measured in a live walkthrough). This
 * shows three reassurance lines and one existing-versus-new branch before the OS window opens.
 *
 * The modal skeleton follows the same contract as AgentConnectSheet (scrim + centred card + tokens,
 * Esc and scrim to close, click propagation stopped on the card).
 */
export interface VaultOpenGuideSheetProps {
  open: boolean;
  onClose: () => void;
  /** "Pick an existing folder" — closes the sheet and opens the OS folder picker (`vault.open()`). */
  onPickExisting?: () => void;
  /** "Start fresh with an empty folder" — closes the sheet and enters the vault creation (scaffold) flow. */
  onCreateNew?: () => void;
  /**
   * In a browser without the File System Access API (Safari, Firefox) both buttons on this sheet are
   * **pressable and do nothing** — the sheet closes, and why it failed and where to go both vanish
   * from the screen. When true, the two CTAs are replaced by an honest notice plus the macOS app
   * path — a fact known before pressing rather than a failure learned by pressing.
   */
  unsupported?: boolean;
}

const BULLETS = [
  { icon: FolderOpen, key: "bulletAnyFolder", browserOnly: false },
  { icon: HardDrive, key: "bulletLocal", browserOnly: false },
  { icon: Sparkles, key: "bulletStarter", browserOnly: false },
  // Owner report from real use (2026-07-24) — the browser's standard permission prompt right after
  // folder selection ("let this site view files…") was not announced, so first-time users mistook it
  // for our popup or a malfunction. One line warns of it in advance.
  //
  // ⚠️ **True only in a browser** (measured 2026-08-08 in the installed app). This line was drawn
  // unconditionally, so the installed app's first-run card said "once you pick, **the browser** asks
  // to allow" — the app opens an OS folder window and has no such prompt. The same card's heading
  // already correctly said "the OS folder picker", so one card contradicted itself. That is the same
  // kind of lie as writing that something does not work when it does
  // (`.claude/rules/surfaces.md`).
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
   * `isDesktopShell()` is **a fact only the browser knows**, so it is always false in a static
   * prerender. `useHydrated()` re-renders once after hydration to make the value right in the
   * installed app — the trap that once cost this repository its left rail permanently (see the
   * `use-hydrated.ts` preamble).
   */
  const hydrated = useHydrated();
  const desktop = hydrated && isDesktopShell();
  const bullets = BULLETS.filter((bullet) => !bullet.browserOnly || !desktop);
  // The unsupported notice already exists on the first-run card — two copies of the same fact drift
  // when only one is fixed. The card and this sheet read the same key (the same reuse pattern by
  // which `FirstRunStarterModule` reads the glossary from `searchWidgets`).
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
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--color-backdrop-medium)] p-4 sm:p-6"
          onClick={onClose}
          data-testid="vault-guide-scrim"
        >
          <motion.section
            ref={mergeRefs(dialogRef, dialogLockoutRef)}
            tabIndex={-1}
            onAnimationStart={dialogLockoutOnAnimationStart}
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985, transition: EXIT_TRANSITION }}
            transition={MOTION.base}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t("title")}
            data-testid="vault-guide-sheet"
            // Focus moves to this container on open, so a screen reader starts from the title. That
            // focus is **for announcement**, not a sign that something is pressable, so the ring is
            // removed — leaving it draws the browser's default focus ring (system sky blue) around
            // the first modal a user sees in the app, in a colour that is not indigo (measured in the
            // 2026-08-04 audit, reproduced on both app and web. Gate:
            // tests/e2e/dialog-focus-ring.spec.ts).
            className="flex w-full max-w-[420px] flex-col overflow-hidden rounded-sheet border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-3)] focus-visible:outline-none"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-5 py-4">
              <div>
                <h2 className="text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
                  {t("title")}
                </h2>
                <p className="mt-1 text-label leading-prose text-[color:var(--color-text-tertiary)]">
                  {/* In an unsupported browser, "before the OS folder picker opens" promises a window
                      that will never come — that slot carries why it cannot instead. */}
                  {/* The count is not pinned into the copy. When a fourth bullet was added on
                      2026-07-24 this line's "just three things" was not updated, leaving the card
                      **saying three and showing four** (measured 2026-08-08). The count now comes
                      from the list actually rendered, so it stays right as items are added or drop
                      out at runtime. */}
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

            {/* When unsupported, these bullets all describe the browser picker flow (the permission
                prompt, the empty-folder scaffold), so leaving them teaches a procedure that will
                never happen. It reduces to one notice plus one place to go. */}
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
                /* The two stacked buttons are **one set** and move together — sending only one to the
                   ramp would split their heights (36 vs 34). Both are `chip`/`lg`, so they come down
                   to 34px side by side. */
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
