"use client";

import type { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button, Dialog, DialogBody, DialogFooter } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";

type Translate = ReturnType<typeof useTranslations<"library">>;

/**
 * A quiet "Show check codes" press that opens the validator's own lines in a centred dialog.
 * The lines stay whole and deliberately not localised: readers compare them with a terminal or an
 * agent transcript, and a translated synonym would have to be mapped back.
 */
export function CheckCodesButton({
  lines,
  file,
  testId,
  fileTestId,
  codeTestId,
  t,
}: {
  /** One validator line per finding, as `wiki-validate` prints it. */
  lines: readonly string[];
  /** The file the findings are about, when the lines themselves do not name it. */
  file?: string;
  /** The button's test id; the dialog takes `${testId}-dialog`. */
  testId: string;
  fileTestId?: string;
  codeTestId: string;
  t: Translate;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  return (
    <>
      <button
        type="button"
        data-testid={testId}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={controlClass({ shape: "link", size: "md", tone: "default", hoverInk: "strong", className: "-my-0.5 shrink-0 whitespace-nowrap" })}
      >
        {t("wiki.technicalOpen")}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} size="md" labelledBy={titleId} testId={`${testId}-dialog`}>
        <div className="flex max-h-[min(70vh,36rem)] flex-col gap-4">
          <h2 id={titleId} className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            {t("wiki.technical")}
          </h2>
          <DialogBody className="flex flex-col gap-2 pr-1">
            <p className="text-label leading-label text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
              {t("wiki.technicalNote")}
            </p>
            {file ? (
              <p data-testid={fileTestId} className="font-mono text-label leading-label text-[color:var(--color-text-secondary)]">
                {t("wiki.technicalFile", { path: file })}
              </p>
            ) : null}
            <ul className="flex flex-col gap-1">
              {lines.map((line, index) => (
                <li
                  key={`${index}-${line}`}
                  data-testid={codeTestId}
                  className="font-mono text-label leading-label text-[color:var(--color-text-secondary)] [overflow-wrap:anywhere]"
                >
                  {line}
                </li>
              ))}
            </ul>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>{t("find.close")}</Button>
          </DialogFooter>
        </div>
      </Dialog>
    </>
  );
}
