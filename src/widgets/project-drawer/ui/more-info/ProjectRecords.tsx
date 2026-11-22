"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import type { Project } from "@/entities/project";
import { formatDate } from "@/shared/lib/locale-text/format-date";
import { controlClass } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

const CAPTION_CLASS =
  "font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]";

/** The first screenshot, the start and launch dates and the outbound links, folded under one disclosure. */
export function ProjectRecords({ project }: { project: Project }) {
  const t = useTranslations("vaultWidgets.projectDrawer");
  const { timeline } = project;
  if (
    !project.screenshots[0] &&
    !timeline?.startedAt &&
    !timeline?.launchedAt &&
    project.links.length === 0
  ) {
    return null;
  }

  return (
    <details className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3">
      <summary className=" list-none text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
        {t("moreScreensAndRecords")}
      </summary>
      <div className="mt-4 space-y-5 border-t border-[color:var(--color-border-soft)] pt-4">
        {project.screenshots[0] && (
          <section>
            <h3 className={CAPTION_CLASS}>{t("screenshotsTitle")}</h3>
            <div className="mt-3 overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)]">
              <Image
                src={project.screenshots[0]}
                alt={t("screenshotAlt", { name: project.name })}
                width={1600}
                height={900}
                sizes="(min-width: 768px) 480px, 100vw"
                className="aspect-[16/9] w-full object-cover"
                unoptimized
              />
            </div>
          </section>
        )}

        {(timeline?.startedAt || timeline?.launchedAt) && (
          <section>
            <h3 className={CAPTION_CLASS}>{t("timelineTitle")}</h3>
            <dl className="mt-3 space-y-2 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4 text-body-lg text-[color:var(--color-text-secondary)]">
              {timeline?.startedAt && (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[color:var(--color-text-tertiary)]">{t("timelineStarted")}</dt>
                  <dd className="font-mono">{formatDate(timeline.startedAt)}</dd>
                </div>
              )}
              {timeline?.launchedAt && (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[color:var(--color-text-tertiary)]">{t("timelineLaunched")}</dt>
                  <dd className="font-mono">{formatDate(timeline.launchedAt)}</dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {project.links.length > 0 && (
          <section>
            <h3 className={CAPTION_CLASS}>{t("linksTitle")}</h3>
            <ul className="mt-3 space-y-2 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4">
              {project.links.map((link, index) => (
                <li key={`${link.url}-${index}`}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={controlClass({ shape: "link", tone: "accent", className: "gap-1.5 text-body-lg hover:text-[color:var(--color-indigo-hover)]" })}
                  >
                    <ArrowUpRight size={ICON_SIZE.md} aria-hidden />
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </details>
  );
}
