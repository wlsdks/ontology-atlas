"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CopyPlus, PencilLine } from "lucide-react";
import { Button, InfoHint } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";

interface Props {
  projectSlug?: string | null;
  className?: string;
  label?: string;
}

export function PublicQuickActions({
  projectSlug,
  className,
  label = "프로젝트 관리",
}: Props) {
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
      aria-label={label}
      className={cn(
        "rounded-[18px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 py-3 shadow-[0_22px_44px_rgba(0,0,0,0.22)]",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-[color:var(--color-text-quaternary)]">
          프로젝트 관리
        </p>
        <InfoHint label="프로젝트 관리 도움말">
          <div className="space-y-3">
            <p className="text-sm leading-6 text-[color:var(--color-text-secondary)]">
              이 프로젝트를 설명하는 문서를 붙이거나, 프로젝트 정보를 자세히 바꾸는 곳입니다.
            </p>
            <dl className="space-y-2 text-sm">
              {shouldShowCreateAction ? (
                <div>
                  <dt className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    새 프로젝트
                  </dt>
                  <dd className="mt-1 leading-6 text-[color:var(--color-text-tertiary)]">
                    지금 작업 중인 공간에 새 프로젝트를 만듭니다.
                  </dd>
                </div>
              ) : null}
              {editProjectHref ? (
                <div>
                  <dt className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    전체 편집
                  </dt>
                  <dd className="mt-1 leading-6 text-[color:var(--color-text-tertiary)]">
                    상태, 태그, 링크처럼 프로젝트 정보를 자세히 바꿉니다.
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
              새 프로젝트
            </Button>
          </Link>
        ) : null}
        {editProjectHref ? (
          <Link href={editProjectHref} className="inline-flex">
            <Button type="button" variant="ghost" size="sm">
              <PencilLine size={14} aria-hidden="true" />
              전체 편집
            </Button>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
