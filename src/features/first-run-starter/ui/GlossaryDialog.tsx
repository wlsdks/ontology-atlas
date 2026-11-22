"use client";

import { Fragment, useId } from "react";
import { useTranslations } from "next-intl";
import { Dialog, controlClass } from "@/shared/ui";
import { FirstRunDialogHeader } from "./FirstRunDialogHeader";

const GLOSSARY_TERMS = ["domain", "capability", "element"] as const;

export function GlossaryDialog({
  open,
  onClose,
  onEnablePlainMode,
  audiencePlain,
}: {
  open: boolean;
  onClose: () => void;
  onEnablePlainMode?: () => void;
  audiencePlain: boolean;
}) {
  const t = useTranslations("firstRunStarter");
  const glossary = useTranslations("searchWidgets.shortcuts.glossary");
  const titleId = useId();
  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} size="sm" testId="first-run-starter-glossary-dialog">
      <FirstRunDialogHeader titleId={titleId} title={glossary("title")} onClose={onClose} />
      <dl
        data-testid="first-run-starter-glossary"
        style={{ gridTemplateColumns: "auto auto minmax(0, 1fr)" }}
        className="mt-3 grid gap-x-1.5 gap-y-2 text-body leading-body"
      >
        {GLOSSARY_TERMS.map((term) => (
          <Fragment key={term}>
            <dt className="font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
              {glossary(`${term}Term`)}
            </dt>
            <span aria-hidden="true" className="text-[color:var(--color-text-quaternary)]">=</span>
            <dd className="text-[color:var(--color-text-tertiary)]">{glossary(`${term}Definition`)}</dd>
          </Fragment>
        ))}
      </dl>
      {onEnablePlainMode ? (
        audiencePlain ? null : (
          <button
            type="button"
            data-testid="first-run-plain-toggle"
            onClick={() => {
              onEnablePlainMode();
              onClose();
            }}
            className={controlClass({
              shape: "link",
              tone: "accent",
              className: "touch-hit-expand mt-4 underline-offset-2 hover:underline",
            })}
          >
            {t("plainModeCta")}
          </button>
        )
      ) : (
        <p
          data-testid="first-run-starter-plain-mode-hint"
          className="mt-4 text-label leading-label text-[color:var(--color-text-tertiary)]"
        >
          {t("plainModeHint")}
        </p>
      )}
    </Dialog>
  );
}
