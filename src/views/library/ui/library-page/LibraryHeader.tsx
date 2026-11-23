import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

export function LibraryHeader({
  t,
  title,
  titleHidden = false,
  doors = null,
}: {
  t: ReturnType<typeof useTranslations<"library">>;
  title?: string;
  titleHidden?: boolean;
  /** The Library-wide doors, the only controls at the header's end. */
  doors?: ReactNode;
}) {
  return (
    <div data-testid="library-header" className="flex min-w-0 items-center gap-1.5">
      {doors}
      <p className={titleHidden ? "sr-only" : "min-w-0 truncate text-body-lg font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]"}>
        {title ?? t("title")}
      </p>
    </div>
  );
}
