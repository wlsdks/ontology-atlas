"use client";

import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { getProjectDetailUrl } from "@/entities/project";
import { copyText } from "@/shared/lib/copy-text";
import { Button, type ButtonProps, useToast } from "@/shared/ui";

interface Props extends Omit<ButtonProps, "onClick"> {
  slug: string;
  testId?: string;
  href?: string;
}

type CopyState = "idle" | "copied" | "error";

export function CopyProjectLinkButton({
  slug,
  testId,
  href,
  className,
  variant = "outline",
  size = "sm",
  ...props
}: Props) {
  const [state, setState] = useState<CopyState>("idle");
  const toast = useToast();

  useEffect(() => {
    if (state === "idle") return;
    const timeout = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timeout);
  }, [state]);

  const handleClick = async () => {
    try {
      const url = href
        ? new URL(href, window.location.origin).toString()
        : getProjectDetailUrl(window.location.origin, slug);
      const copied = await copyText(url);
      if (copied) {
        setState("copied");
        toast.show("링크가 복사됐습니다", "success");
      } else {
        setState("error");
        toast.show("복사에 실패했습니다", "error");
      }
    } catch {
      setState("error");
      toast.show("복사에 실패했습니다", "error");
    }
  };

  const icon = state === "copied" ? <Check size={14} /> : <Link2 size={14} />;
  const label =
    state === "copied"
      ? "링크 복사됨"
      : state === "error"
        ? "복사 실패"
        : "링크 복사";

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
