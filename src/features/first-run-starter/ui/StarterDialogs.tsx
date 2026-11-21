"use client";

import { Fragment, useId } from "react";
import { useTranslations } from "next-intl";
import { useCopyFeedback } from "@/shared/lib/clipboard/use-copy-feedback";
import { CompactCopyButton, Dialog, controlClass } from "@/shared/ui";
import { CloseButton } from "@/shared/ui/controls/close-button";

const GLOSSARY_TERMS = ["domain", "capability", "element"] as const;

const CLI_BOOTSTRAP_COMMAND =
  "node cli/src/index.mjs init && node cli/src/index.mjs bootstrap";

const TITLE_CLASS = "text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]";

function DialogHeader({ titleId, title, onClose }: { titleId: string; title: string; onClose: () => void }) {
  const t = useTranslations("firstRunStarter");
  return (
    <div className="flex items-start justify-between gap-3">
      <h2 id={titleId} className={TITLE_CLASS}>{title}</h2>
      <CloseButton label={t("closeLabel")} onClick={onClose} data-testid="first-run-dialog-close" className="-mr-1 -mt-1" />
    </div>
  );
}

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
      <DialogHeader titleId={titleId} title={glossary("title")} onClose={onClose} />
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

export function CliBridgeBody() {
  const t = useTranslations("firstRunStarter");
  const { state, copy } = useCopyFeedback();
  return (
    <div data-testid="first-run-starter-cli-bridge" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 break-keep text-label leading-label text-[color:var(--color-text-secondary)]">
          {t("cliBridgeLabel")}
        </p>
        <CompactCopyButton
          copied={state === "copied"}
          label={state === "copied" ? t("cliBridgeCopied") : t("cliBridgeCopy")}
          ariaLabel={t("cliBridgeCopyAriaLabel")}
          onClick={() => void copy(CLI_BOOTSTRAP_COMMAND)}
          data-testid="first-run-starter-cli-bridge-copy"
          className="-my-1.5 shrink-0"
        />
      </div>
      <code className="block whitespace-pre-wrap break-words rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-2 font-mono text-label leading-label text-[color:var(--color-text-secondary)]">
        {CLI_BOOTSTRAP_COMMAND}
      </code>
      <p
        data-testid="first-run-starter-cli-source-only"
        className="text-caption leading-label text-[color:var(--color-text-tertiary)]"
      >
        {t("cliBridgeSourceOnly")}
      </p>
    </div>
  );
}

export function CliBridgeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("firstRunStarter");
  const titleId = useId();
  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} size="sm" testId="first-run-starter-cli-dialog">
      <DialogHeader titleId={titleId} title={t("cliBridgeToggle")} onClose={onClose} />
      <div className="mt-3">
        <CliBridgeBody />
      </div>
    </Dialog>
  );
}
