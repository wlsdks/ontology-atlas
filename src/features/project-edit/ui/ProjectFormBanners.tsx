import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import type { FailureCopy } from "@/shared/lib/failures/use-failure-sentence";
import { usePrefersReducedMotion } from "@/shared/lib/render-timing/use-prefers-reduced-motion";
import type { ProjectFormBinding } from "./ProjectFormFields";

/*
 * Opens a folder in place: on the web `/` is the gateway, which cannot open one.
 * Degradation grammar: `.claude/rules/surfaces.md`.
 */
export function WriteDisabledBanner({
  writeDisabled,
  openVaultAction,
}: {
  writeDisabled: boolean;
  openVaultAction?: ReactNode;
}) {
  const t = useTranslations("settings.projectForm");
  if (!writeDisabled) return null;
  return (
    <div
      role="status"
      data-testid="project-write-disabled-banner"
      className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-[color:var(--color-amber-source-a34)] bg-[color:var(--color-amber-source-a08)] px-4 py-3 text-body-lg text-[color:var(--color-text-secondary)]"
    >
      <span className="min-w-0">
        {t("validation.demoModeBanner")}{" "}
        <span className="text-[color:var(--color-text-quaternary)]">
          {t("validation.demoModeBannerHint")}
        </span>
      </span>
      {openVaultAction ? <span className="shrink-0">{openVaultAction}</span> : null}
    </div>
  );
}

export function ErrorBanner({
  globalError,
  errors,
}: {
  globalError: FailureCopy | null;
  errors: ProjectFormBinding["errors"];
}) {
  const t = useTranslations("settings.projectForm");
  const reducedMotion = usePrefersReducedMotion();
  /** A failed save has no field to focus, so focus goes to this banner. */
  const errorBannerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!globalError) return;
    const node = errorBannerRef.current;
    if (!node) return;
    // jsdom lacks `scrollIntoView`; focus is what matters.
    node.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    node.focus();
  }, [globalError, reducedMotion]);

  if (!globalError && Object.keys(errors).length === 0) return null;
  return (
    <div
      ref={errorBannerRef}
      role="alert"
      tabIndex={-1}
      data-testid="project-error-banner"
      data-failure-detail={globalError?.detail ?? undefined}
      className="rounded-card border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-3 py-3 text-body-lg text-[color:var(--color-status-danger)]"
    >
      <p className="font-[var(--font-weight-signature)]">
        {globalError?.sentence ?? t("validation.globalErrorBanner")}
      </p>
      {Object.keys(errors).length > 0 ? (
        <>
          <ul className="mt-2 space-y-1 text-body">
            {Object.entries(errors).slice(0, 4).map(([field, message]) => (
              <li key={field}>{message}</li>
            ))}
          </ul>
          {Object.keys(errors).length > 4 ? (
            <p className="mt-2 font-mono text-label uppercase tracking-[var(--tracking-caps-14)]">
              {t("validation.globalErrorMore", { count: Object.keys(errors).length - 4 })}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
