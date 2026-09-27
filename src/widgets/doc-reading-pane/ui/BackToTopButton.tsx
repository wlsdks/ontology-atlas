import { ArrowUp } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";

/**
 * Floating back-to-top pill at the bottom left of the article scroller, opposite the outline rail.
 * Its bottom inset is a token because the pane's scroll-end reserve and the below-lg tab-bar
 * clearance derive from it (`app/globals.css`).
 */
export function BackToTopButton({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("docsVault.readingAids");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("backToTopAria")}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      data-testid="back-to-top-button"
      // `--motion-base`: an appearance and departure, not a colour change; the fast step reads as a
      // blink.
      className={`absolute bottom-[var(--doc-reading-back-to-top-inset)] left-7 z-10 inline-flex h-[var(--chrome-tile-size)] items-center gap-2 rounded-full border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] px-4 font-mono text-body text-[color:var(--color-text-secondary)] shadow-[var(--chrome-shadow)] transition-opacity duration-[var(--motion-base)] ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <ArrowUp
        size={ICON_SIZE.md}
        className="text-[color:var(--color-indigo-accent)]"
        aria-hidden
      />
      {t("backToTop")}
    </button>
  );
}
