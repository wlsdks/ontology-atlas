"use client";

import { useTranslations } from "next-intl";
import { BookOpen, Hash, Search, X } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useLatinEyebrow } from "@/shared/lib/locale-text/latin-eyebrow";
import { IconButton, controlClass } from "@/shared/ui";
import { fieldClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { cycleSlug } from "../../lib/doc-catalog";
import { firstDocSlug } from "../../lib/doc-tree";
import type { DocsQuickDrawerModel } from "../../model/use-docs-quick-drawer";

/** Title and total, the open-all and close buttons, the search field with arrow-key focus, and the tag chips. */
export function DocsDrawerHeader({
  model,
  getDocHref,
  onClose,
}: {
  model: DocsQuickDrawerModel;
  getDocHref: (slug?: string | null) => string;
  onClose: () => void;
}) {
  const t = useTranslations("vaultWidgets.docsDrawer");
  const eyebrow14 = useLatinEyebrow("tracking-[var(--tracking-caps-14)]");
  const router = useRouter();
  const {
    query,
    setQuery,
    activeTag,
    setActiveTag,
    searchRef,
    totalDocs,
    topTags,
    filteredTree,
    flatTreeSlugs,
    focusedSlug,
    setFocusedSlug,
  } = model;

  return (
    <header className="shrink-0 border-b border-[color:var(--color-border-soft)] px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-caption text-[color:var(--color-indigo-accent)] ${eyebrow14}`}>
            {t("eyebrow")}
          </p>
          <p className="mt-1 text-body text-[color:var(--color-text-secondary)]">
            {t("totalLine", { count: totalDocs })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={getDocHref()}
            onClick={onClose}
            className={controlClass({ shape: "pill", size: "sm", tone: "secondary", className: "gap-1 border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] hover:border-[color:var(--color-indigo-a40)] hover:text-[color:var(--color-text-primary)]" })}
            aria-label={t("openAllAriaLabel")}
          >
            <BookOpen size={ICON_SIZE.sm} />
            {t("openAllLabel")}
          </Link>
          <IconButton
            label={t("closeAriaLabel")}
            size="lg"
            onClick={onClose}
            className="hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]"
          >
            <X size={ICON_SIZE.md} />
          </IconButton>
        </div>
      </div>

      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const slug = focusedSlug ?? firstDocSlug(filteredTree);
          if (!slug) return;
          router.push(getDocHref(slug));
          onClose();
        }}
        onKeyDown={(event) => {
          if (flatTreeSlugs.length === 0) return;
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setFocusedSlug(cycleSlug(flatTreeSlugs, focusedSlug, event.key === "ArrowDown" ? 1 : -1));
        }}
        className="mt-3 flex items-center gap-2 rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-2 transition-[border-color,box-shadow] focus-within:border-[color:var(--color-indigo-focus-ring)] focus-within:ring-2 focus-within:ring-[color:var(--color-indigo-focus-ring)]"
      >
        <Search size={ICON_SIZE.sm} className="text-[color:var(--color-text-quaternary)]" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("filterPlaceholder")}
          name="docsQuickFilter"
          autoComplete="off"
          className={fieldClass({ frame: "bare", className: "flex-1" })}
          aria-label={t("filterAriaLabel")}
        />
        {query ? (
          <IconButton
            label={t("filterClearAriaLabel")}
            size="sm"
            tone="muted"
            onClick={() => setQuery("")}
            className="hover:text-[color:var(--color-text-primary)]"
          >
            <X size={ICON_SIZE.sm} aria-hidden />
          </IconButton>
        ) : null}
      </form>

      {topTags.length > 0 && (
        <div
          className="-mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 py-0.5 [&::-webkit-scrollbar]:h-0"
          role="toolbar"
          aria-label={t("tagToolbarAriaLabel")}
        >
          {activeTag && (
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className={controlClass({ hoverInk: 'strong', hoverBorder: 'strong',
                shape: "pill",
                size: "sm",
                className: "shrink-0 gap-1",
              })}
              aria-label={t("tagClearAriaLabel")}
            >
              <X size={ICON_SIZE.sm} />
              {t("tagClearLabel")}
            </button>
          )}
          {topTags.map(({ tag, count }) => {
            const selected = activeTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setActiveTag((current) => (current === tag ? null : tag))
                }
                aria-pressed={selected}
                className={controlClass({
                  shape: "pill",
                  size: "sm",
                  active: selected,
                  /*
                   * Hover border only on unselected chips, so hover never weakens the
                   * selection border.
                   */
                  className: selected
                    ? "shrink-0 gap-1"
                    : "shrink-0 gap-1 hover:border-[color:var(--color-indigo-a34)] hover:text-[color:var(--color-text-primary)]",
                })}
              >
                <Hash size={ICON_SIZE.sm} />
                <span className="max-w-[96px] truncate">{tag}</span>
                <span className="font-mono text-caption text-[color:var(--color-text-quaternary)]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
