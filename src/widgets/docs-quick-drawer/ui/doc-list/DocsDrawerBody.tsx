"use client";

import { useTranslations } from "next-intl";
import { BookOpen, Clock, FileText, Link2, Star } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useLatinEyebrow } from "@/shared/lib/locale-text/latin-eyebrow";
import { controlClass } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { describeDocAge } from "../../lib/doc-catalog";
import type {
  DocsQuickDrawerContextProject,
  DocsQuickDrawerModel,
} from "../../model/use-docs-quick-drawer";
import { DocRow } from "./DocRow";
import { DocTreeBranch } from "./DocTreeBranch";

/** Related, pinned, recent and modified sections in normal mode, then the filtered tree or its empty state. */
export function DocsDrawerBody({
  model,
  getDocHref,
  contextProject,
  onClose,
}: {
  model: DocsQuickDrawerModel;
  getDocHref: (slug?: string | null) => string;
  contextProject?: DocsQuickDrawerContextProject | null;
  onClose: () => void;
}) {
  const t = useTranslations("vaultWidgets.docsDrawer");
  // Sans for Korean section labels; folder rows keep mono because they are machine strings.
  const eyebrow14 = useLatinEyebrow("tracking-[var(--tracking-caps-14)]");
  const eyebrow08 = useLatinEyebrow("tracking-[var(--tracking-caps-08)]");
  const {
    query,
    setQuery,
    activeTag,
    setActiveTag,
    searchRef,
    totalDocs,
    relatedDocs,
    pinnedDocs,
    pinnedSet,
    recentViewed,
    modifiedDocs,
    trimmedQuery,
    activeTagSlugs,
    filteredTree,
    focusedSlug,
    togglePin,
  } = model;

  const ageLabel = (updatedAt: string) => {
    const age = describeDocAge(updatedAt);
    return age ? t(age.key, age.values) : "";
  };

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color:var(--color-divider)]">
      {trimmedQuery || activeTag ? null : (
        <>
          {contextProject && relatedDocs.length > 0 && (
            <section className="mb-4 rounded-panel border border-[color:var(--color-indigo-a24)] bg-[color:var(--color-indigo-a06)] p-2">
              <p className={`mb-1.5 flex items-center gap-1 px-1 text-caption text-[color:var(--color-indigo-accent)] ${eyebrow14}`}>
                <Link2 size={ICON_SIZE.sm} />
                {t("relatedSection", { name: contextProject.name, count: relatedDocs.length })}
              </p>
              <div className="space-y-0.5">
                {relatedDocs.map((match) => (
                  <Link
                    key={`rel-${match.doc.slug}`}
                    href={getDocHref(match.doc.slug)}
                    onClick={onClose}
                    className={controlClass({ shape: "row", size: "sm", tone: "secondary", className: "group gap-2 hover:bg-[color:var(--color-indigo-a14)] hover:text-[color:var(--color-text-primary)]" })}
                  >
                    <FileText size={ICON_SIZE.sm} className="shrink-0 text-[color:var(--color-text-quaternary)] group-hover:text-[color:var(--color-indigo-accent)]" />
                    <span className="truncate">{match.doc.title}</span>
                    <span
                      className={`ml-auto shrink-0 text-caption text-[color:var(--color-text-quaternary)] ${eyebrow08}`}
                      title={match.reasons.join(", ")}
                    >
                      {match.reasons[0]}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {pinnedDocs.length > 0 && (
            <section className="mb-4">
              <p className={`mb-1.5 flex items-center gap-1 px-2 text-caption text-[color:var(--color-indigo-accent)] ${eyebrow14}`}>
                <Star size={ICON_SIZE.sm} />
                {t("pinnedSection", { count: pinnedDocs.length })}
              </p>
              <div className="space-y-0.5">
                {pinnedDocs.map((doc) => (
                  <DocRow
                    key={`pin-${doc.slug}`}
                    doc={doc}
                    getDocHref={getDocHref}
                    onClose={onClose}
                    pinned
                    onTogglePin={togglePin}
                  />
                ))}
              </div>
            </section>
          )}

          {recentViewed.length > 0 && (
            <section className="mb-4">
              <p className={`mb-1.5 flex items-center gap-1 px-2 text-caption text-[color:var(--color-text-quaternary)] ${eyebrow14}`}>
                <Clock size={ICON_SIZE.sm} />
                {t("recentSection", { count: recentViewed.length })}
              </p>
              <div className="space-y-0.5">
                {recentViewed.map((doc) => (
                  <DocRow
                    key={`rv-${doc.slug}`}
                    doc={doc}
                    getDocHref={getDocHref}
                    onClose={onClose}
                    pinned={pinnedSet.has(doc.slug)}
                    onTogglePin={togglePin}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="mb-4">
            <p className={`mb-1.5 flex items-center gap-1 px-2 text-caption text-[color:var(--color-text-quaternary)] ${eyebrow14}`}>
              <Clock size={ICON_SIZE.sm} />
              {t("modifiedSection", { count: modifiedDocs.length })}
            </p>
            <div className="space-y-0.5">
              {modifiedDocs.map((doc) => (
                <DocRow
                  key={`mod-${doc.slug}`}
                  doc={doc}
                  getDocHref={getDocHref}
                  onClose={onClose}
                  pinned={pinnedSet.has(doc.slug)}
                  onTogglePin={togglePin}
                  trailingText={ageLabel(doc.updatedAt)}
                />
              ))}
            </div>
          </section>
        </>
      )}

      <section>
        <p className={`mb-1.5 px-2 text-caption text-[color:var(--color-text-quaternary)] ${eyebrow14}`}>
          {trimmedQuery
            ? t("searchHeader", { query })
            : activeTag
              ? t("tagHeader", { tag: activeTag, count: activeTagSlugs?.size ?? 0 })
              : t("folderHeader", { count: totalDocs })}
        </p>
        {filteredTree ? (
          <DocTreeBranch
            node={filteredTree}
            getDocHref={getDocHref}
            onPick={onClose}
            depth={0}
            forceOpen={trimmedQuery.length > 0 || activeTag !== null}
            needle={trimmedQuery}
            focusedSlug={focusedSlug}
          />
        ) : (
          <div className="rounded-card border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 py-5 text-center">
            <p className="text-body text-[color:var(--color-text-tertiary)]">
              {trimmedQuery
                ? t("emptySearch", { query })
                : activeTag
                  ? t("emptyTag", { tag: activeTag })
                  : t("emptyAll")}
            </p>
            <div className="mt-2 flex items-center justify-center gap-2">
              {(trimmedQuery || activeTag) && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setActiveTag(null);
                    searchRef.current?.focus();
                  }}
                  className={controlClass({
                    shape: "pill",
                    className:
                      "gap-1 hover:border-[color:var(--color-indigo-a40)] hover:text-[color:var(--color-text-primary)]",
                  })}
                >
                  {t("clearFilters")}
                </button>
              )}
              <Link
                href={getDocHref()}
                onClick={onClose}
                className={controlClass({ shape: "pill", size: "sm", className: "gap-1 border-[color:var(--color-indigo-a32)] bg-[color:var(--color-indigo-a10)] hover:border-[color:var(--color-indigo-a50)]" })}
              >
                <BookOpen size={ICON_SIZE.sm} />
                {t("openVault")}
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
