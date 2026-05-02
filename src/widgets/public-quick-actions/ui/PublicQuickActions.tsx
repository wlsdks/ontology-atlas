"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CopyPlus, PencilLine } from "lucide-react";
import { Button, InfoHint } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";

interface Props {
  projectSlug?: string | null;
  className?: string;
  /** 섹션의 aria-label override. 미지정 시 i18n default. */
  label?: string;
}

export function PublicQuickActions({
  projectSlug,
  className,
  label,
}: Props) {
  const t = useTranslations("publicQuickActions");
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const returnTo = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const newProjectHref = useMemo(() => {
    const url = new URL(
      "/project/new/",
      "http://local.test",
    );
    url.searchParams.set("returnTo", returnTo);
    return `${url.pathname}?${url.searchParams.toString()}`;
  }, [returnTo]);

  const editProjectHref = useMemo(() => {
    if (!projectSlug) return null;
    const url = new URL(
      `/project/${encodeURIComponent(projectSlug)}/edit/`,
      "http://local.test",
    );
    url.searchParams.set("returnTo", returnTo);
    return `${url.pathname}?${url.searchParams.toString()}`;
  }, [projectSlug, returnTo]);

  const shouldShowCreateAction = !projectSlug;

  return (
    <section
      aria-label={label ?? t("sectionAriaDefault")}
      className={cn(
        "rounded-[18px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 py-3 shadow-[0_22px_44px_rgba(0,0,0,0.22)]",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-[color:var(--color-text-quaternary)]">
          {t("sectionTitle")}
        </p>
        <InfoHint label={t("infoHintLabel")}>
          <div className="space-y-3">
            <p className="text-sm leading-6 text-[color:var(--color-text-secondary)]">
              {t("infoHintBody")}
            </p>
            <dl className="space-y-2 text-sm">
              {shouldShowCreateAction ? (
                <div>
                  <dt className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    {t("infoNewTitle")}
                  </dt>
                  <dd className="mt-1 leading-6 text-[color:var(--color-text-tertiary)]">
                    {t("infoNewBody")}
                  </dd>
                </div>
              ) : null}
              {editProjectHref ? (
                <div>
                  <dt className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    {t("infoEditTitle")}
                  </dt>
                  <dd className="mt-1 leading-6 text-[color:var(--color-text-tertiary)]">
                    {t("infoEditBody")}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </InfoHint>
      </div>
      <div className="flex flex-wrap gap-2">
        {shouldShowCreateAction ? (
          <Link href={newProjectHref} className="inline-flex">
            <Button type="button" size="sm">
              <CopyPlus size={14} aria-hidden="true" />
              {t("buttonNew")}
            </Button>
          </Link>
        ) : null}
        {editProjectHref ? (
          <Link href={editProjectHref} className="inline-flex">
            <Button type="button" variant="ghost" size="sm">
              <PencilLine size={14} aria-hidden="true" />
              {t("buttonEdit")}
            </Button>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
