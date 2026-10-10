import type { RefObject } from "react";
import { useTranslations } from "next-intl";
import { Info, PanelLeftClose } from "lucide-react";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Tooltip, TooltipProvider } from "@/shared/ui";

export function LibraryHeader({
  t,
  title,
  titleHidden = false,
  disclosure = null,
  onCollapse,
  collapseRef,
}: {
  t: ReturnType<typeof useTranslations<"library">>;
  title?: string;
  titleHidden?: boolean;
  disclosure?: string | null;
  onCollapse?: () => void;
  collapseRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div data-testid="library-header" className="flex min-w-0 items-center gap-1.5">
      <p className={titleHidden ? "sr-only" : "min-w-0 truncate text-body-lg font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]"}>
        {title ?? t("title")}
      </p>
      <TooltipProvider disableHoverableContent>
        <Tooltip
          withProvider={false}
          side="bottom"
          align="start"
          panelClassName="pointer-events-none"
          content={
            <span className="block max-w-64 [word-break:keep-all]">
              <span className="block">{t("lede")}</span>
              {disclosure ? <span className="mt-1.5 block text-[color:var(--color-text-tertiary)]">{disclosure}</span> : null}
            </span>
          }
        >
          <button
            type="button"
            data-testid="library-lede-info"
            aria-label={t("lede")}
            className={controlClass({
              shape: "icon",
              size: "sm",
              tone: "muted",
              hoverInk: "strong",
              className: "flex-none",
            })}
          >
            <Info size={ICON_SIZE.md} aria-hidden />
          </button>
        </Tooltip>
      </TooltipProvider>
      {onCollapse ? (
        <button
          type="button"
          ref={collapseRef}
          onClick={onCollapse}
          aria-label={t("index.collapse")}
          aria-expanded
          data-testid="library-index-collapse"
          className={controlClass({
            shape: "icon",
            size: "sm",
            tone: "muted",
            hoverInk: "strong",
            className: "ml-auto hidden flex-none lg:inline-flex",
          })}
        >
          <PanelLeftClose size={ICON_SIZE.md} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
