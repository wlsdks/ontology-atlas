"use client";

import { useState } from "react";
import type { useTranslations } from "next-intl";

import { dismissSourceCopy, stopSourceCopy } from "@/features/library";
import { CloseButton } from "@/shared/ui";

import { SkippedFilesDialog } from "./SourceCopyDialogs";
import { SourceCopyLine } from "./SourceCopyLine";
import { useSourceCopy } from "../../../model/sources/use-source-drop";

/**
 * The copy's line once the stage has handed over to the Sources home: the first landed file turns
 * the empty Library into the home, so progress, Stop and what was skipped follow the person here.
 */
export function SourceCopyStrip({ scope, t }: { scope: string; t: ReturnType<typeof useTranslations<"library">> }) {
  const job = useSourceCopy(scope);
  const [skippedOpen, setSkippedOpen] = useState(false);
  if (!job) return null;
  const finished = job.phase !== "copying";
  const quiet = finished && job.failed.length === 0 && job.skipped.length === 0 && job.truncatedAt === null && job.phase === "done";
  if (quiet) return null;
  return (
    <>
      <div
        data-testid="library-copy-strip"
        className="motion-stagger-fade pointer-events-auto absolute inset-x-0 bottom-5 z-10 mx-auto flex w-[min(36rem,calc(100%-2.5rem))] items-start gap-2 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-3 shadow-[var(--shadow-elevation-2)]"
      >
        <SourceCopyLine job={job} onStop={() => stopSourceCopy(scope)} onShowSkipped={() => setSkippedOpen(true)} t={t} />
        {finished ? <CloseButton label={t("find.close")} onClick={() => dismissSourceCopy(scope)} data-testid="library-copy-strip-close" /> : null}
      </div>
      <SkippedFilesDialog job={job} open={skippedOpen} onClose={() => setSkippedOpen(false)} t={t} />
    </>
  );
}
