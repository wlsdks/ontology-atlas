"use client";

import { useLocale, useTranslations } from "next-intl";
import { Check, Link2 } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { getProjectRuntimeDetailUrl } from "@/entities/project";
import { BASE_PATH } from "@/shared/lib/base-path";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { Button, type ButtonProps, useToast } from "@/shared/ui";

interface Props extends Omit<ButtonProps, "onClick"> {
  slug: string;
  testId?: string;
}

export function CopyProjectLinkButton({
  slug,
  testId,
  className,
  variant = "outline",
  size = "sm",
  ...props
}: Props) {
  // Copy state (idle/copied/failed) comes from the shared `useCopyFeedback`; the toast is separate.
  const { state, copy } = useCopyFeedback(2000);
  const toast = useToast();
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
      toast.show(t("toastError"), "error");
      return;
    }
    const copied = await copy(url);
    toast.show(copied ? t("toastSuccess") : t("toastError"), copied ? "success" : "error");
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
