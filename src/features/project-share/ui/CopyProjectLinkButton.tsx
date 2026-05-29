"use client";

import { useTranslations } from "next-intl";
import { Check, Link2 } from "lucide-react";
import { getProjectDetailUrl } from "@/entities/project";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { Button, type ButtonProps, useToast } from "@/shared/ui";

interface Props extends Omit<ButtonProps, "onClick"> {
  slug: string;
  testId?: string;
  href?: string;
}

export function CopyProjectLinkButton({
  slug,
  testId,
  href,
  className,
  variant = "outline",
  size = "sm",
  ...props
}: Props) {
  // 복사 상태(idle/copied/failed)는 공용 useCopyFeedback 으로 — toast 는 별도.
  const { state, copy } = useCopyFeedback(2000);
  const toast = useToast();
  const t = useTranslations("copyProjectLink");

  const handleClick = async () => {
    let url: string;
    try {
      url = href
        ? new URL(href, window.location.origin).toString()
        : getProjectDetailUrl(window.location.origin, slug);
    } catch {
      toast.show(t("toastError"), "error");
      return;
    }
    const copied = await copy(url);
    toast.show(copied ? t("toastSuccess") : t("toastError"), copied ? "success" : "error");
  };

  const icon = state === "copied" ? <Check size={14} /> : <Link2 size={14} />;
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
        {label}
      </Button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {state === "idle" ? "" : label}
      </span>
    </>
  );
}
