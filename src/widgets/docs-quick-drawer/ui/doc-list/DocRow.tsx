"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileText, Star } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useDocumentDetail } from "@/features/document-detail";
import { cn } from "@/shared/lib/cn";
import { IconButton, controlClass } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import type { FlatDoc } from "../../lib/doc-catalog";

export function DocRow({
  doc,
  getDocHref,
  onClose,
  pinned,
  onTogglePin,
  trailingText,
}: {
  doc: FlatDoc;
  getDocHref: (slug?: string | null) => string;
  onClose: () => void;
  pinned: boolean;
  onTogglePin: (slug: string) => void;
  trailingText?: string;
}) {
  const t = useTranslations("vaultWidgets.docsDrawer");
  // The preview is read on a mouse hover only; touch never shows it, so it never reads.
  const [previewing, setPreviewing] = useState(false);
  const excerpt = useDocumentDetail(previewing ? doc.source : null)?.excerpt.trim() ?? "";
  return (
    <div
      className="group flex flex-col rounded-card transition-colors hover:bg-[color:var(--color-indigo-a10)]"
      onPointerEnter={(event) => setPreviewing(event.pointerType === "mouse")}
      onPointerLeave={() => setPreviewing(false)}
    >
      <div className="flex items-center gap-1">
        <Link
          href={getDocHref(doc.slug)}
          onClick={onClose}
          className={controlClass({ hoverInk: 'strong', shape: "row", size: "sm", tone: "secondary", className: "min-w-0 flex-1 gap-2 group-" })}
        >
          <FileText
            size={ICON_SIZE.sm}
            className="shrink-0 text-[color:var(--color-text-quaternary)] group-hover:text-[color:var(--color-indigo-accent)]"
          />
          <span className="truncate">{doc.title}</span>
          {trailingText ? (
            <span className="ml-auto shrink-0 font-mono text-caption text-[color:var(--color-text-quaternary)]">
              {trailingText}
            </span>
          ) : null}
        </Link>
        <IconButton
          size="sm"
          tone="muted"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onTogglePin(doc.slug);
          }}
          label={
            pinned
              ? t("togglePinOff", { title: doc.title })
              : t("togglePinOn", { title: doc.title })
          }
          title={pinned ? t("pinTooltipOn") : t("pinTooltipOff")}
          className={cn(
            "mr-1 transition-opacity",
            pinned
              ? "text-[color:var(--color-indigo-accent)] opacity-100"
              : "[@media(hover:hover)]:opacity-0 hover:text-[color:var(--color-indigo-accent)] group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          <Star size={ICON_SIZE.sm} fill={pinned ? "currentColor" : "none"} />
        </IconButton>
      </div>
      {previewing && excerpt ? (
        // Opens when its text arrives; the hover media query still keeps touch devices out.
        <p
          data-testid="docs-drawer-preview"
          className="motion-swap-in hidden line-clamp-2 px-2 pb-1.5 text-label leading-label text-[color:var(--color-text-quaternary)] [@media(hover:hover)]:group-hover:block"
        >
          {excerpt}
        </p>
      ) : null}
    </div>
  );
}
