"use client";

import { useLocale, useTranslations } from "next-intl";
import { Check, Link2 } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { getProjectRuntimeDetailUrl } from "@/entities/project";
import { BASE_PATH } from "@/shared/lib/base-path";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { Button, type ButtonProps } from "@/shared/ui";

interface Props extends Omit<ButtonProps, "onClick"> {
  slug: string;
  testId?: string;
}

/**
 * **The button says what happened, and nothing else does** (2026-09-26).
 *
 * It also raised a toast repeating its own label — in English the two were the same words,
 * "Link copied" — so the outcome was said twice, once where the press happened and once in a
 * box at the bottom of the window. On a project page that box stood over the page's own text
 * (measured at 1512x949: the Includes and Excludes bullets under it). This is
 * the copy-button pattern the other copy controls already keep (`CopyAgentTextButton`): the label
 * changes where the eye is, and a polite live region reads it out.
 */
export function CopyProjectLinkButton({
  slug,
  testId,
  className,
  variant = "outline",
  size = "sm",
  ...props
}: Props) {
  const { state, copy, fail } = useCopyFeedback(2000);
  const t = useTranslations("copyProjectLink");
  const locale = useLocale();

  const handleClick = async () => {
    let url: string;
    try {
      url = getProjectRuntimeDetailUrl(window.location.origin, slug, {
        locale,
        basePath: BASE_PATH,
      });
    } catch {
      // An address that cannot be built is a copy that failed: the button says so.
      fail();
      return;
    }
    await copy(url);
  };

  const icon = state === "copied" ? <Check size={ICON_SIZE.md} /> : <Link2 size={ICON_SIZE.md} />;
  const label =
    state === "copied"
      ? t("labelCopied")
      : state === "failed"
        ? t("labelError")
        : t("labelIdle");

  return (
    <>
      <Button
        type="button"
        data-testid={testId}
        variant={variant}
        size={size}
        className={className}
        onClick={handleClick}
        {...props}
      >
        {icon}
        {/*
          Every label this button can wear is laid in one grid cell and only the current one is
          visible, so the button is always as wide as its longest word (2026-09-25 sweep): "copy
          link" becoming "link copied" grew it by 12px, and in the right-aligned top bar every
          control to its left jumped. The live region below still announces the change.
        */}
        <span className="inline-grid">
          {[t("labelIdle"), t("labelCopied"), t("labelError")].map((option) => (
            <span
              key={option}
              aria-hidden={option === label ? undefined : true}
              className={option === label ? "col-start-1 row-start-1" : "invisible col-start-1 row-start-1"}
            >
              {option}
            </span>
          ))}
        </span>
      </Button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {state === "idle" ? "" : label}
      </span>
    </>
  );
}
