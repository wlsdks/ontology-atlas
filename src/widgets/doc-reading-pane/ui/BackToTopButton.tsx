import { ArrowUp } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";

/**
 * The floating "back to top" pill at the bottom left of the article scroll container.
 *
 * When the outline rail (`DocReadingOutlineRail`) moved to the right in 2026-07 to follow the
 * GitHub "on this page" convention, this button moved left so the two do not collide in the same
 * bottom-right corner — both surfaces share the `bottom-6` line, so they split left and right.
 *
 * It reuses the existing floating chrome tile language (`--chrome-tile-size`, `--chrome-surface`,
 * `--chrome-shadow`, `--chrome-border`, the same surface as the topology minimap) rather than
 * inventing a new visual language. The visibility threshold is decided by `use-back-to-top.ts`.
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
      // `--motion-base` is explicit: this is the **appearance and departure** of a floating control,
      // not a colour confirmation, so the ramp's "movement" step is right. Left to the default
      // (`--motion-fast`) it arrives in 120ms, which reads as a blink rather than a fade.
      className={`absolute bottom-6 left-7 z-10 inline-flex h-[var(--chrome-tile-size)] items-center gap-2 rounded-full border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] px-4 font-mono text-body text-[color:var(--color-text-secondary)] shadow-[var(--chrome-shadow)] transition-opacity duration-[var(--motion-base)] ${
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
