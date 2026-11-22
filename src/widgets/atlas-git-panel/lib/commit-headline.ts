import type { DateTimeFormatOptions } from "next-intl";
import { stripConventionalPrefix } from "./step-title";
import type { CommitConcept } from "./commit-documents";
import type { CopyTranslate } from "./translator";

const HEADLINE_CONCEPTS = 2;

/**
 * What a step's detail says first. The headline is the author's sentence; only an automatic
 * subject (one with a reader's-language `headline`) is named by its concepts, with the headline
 * under it. With a concept title the author's reason is the second line; without one the reason
 * already is the title and is not said twice.
 */
export function commitHeadlineLines({
  t,
  subject,
  headline,
  concepts,
}: {
  t: CopyTranslate;
  subject: string;
  headline: string | null;
  concepts: readonly CommitConcept[];
}): { title: string; byline: string | null } {
  const authored = stripConventionalPrefix(subject);
  const reason = headline ? t("stepAutoSubject", { summary: headline }) : authored;
  const conceptTitle =
    headline && concepts.length > 0
      ? `${concepts
          .slice(0, HEADLINE_CONCEPTS)
          .map((concept) => concept.label)
          .join(", ")}${concepts.length > HEADLINE_CONCEPTS ? ` ${t("moreSlugs", { count: concepts.length - HEADLINE_CONCEPTS })}` : ""}`
      : null;
  return {
    title: conceptTitle ?? headline ?? authored,
    byline: conceptTitle ? reason : null,
  };
}

/** The year is spelled out only when the step is from another year than today. */
export function commitDateOptions(at: Date, now: Date, timeZone: string): DateTimeFormatOptions {
  const sameYear = at.getFullYear() === now.getFullYear();
  return {
    ...(sameYear ? {} : { year: "numeric" }),
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  };
}
