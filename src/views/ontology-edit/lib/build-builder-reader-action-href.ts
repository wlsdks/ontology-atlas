import type { OntologyReaderIntent } from "@/shared/lib/ontology-reader-intent";

/**
 * reader-intent 진입(`?reader=`) 의 CTA 목적지 — agent/marketing/leadership
 * 은 인사이트 화면으로, 그 외는 온톨로지 허브로(OntologyEditPage.tsx A4 분해).
 */
export function buildBuilderReaderActionHref(intent: OntologyReaderIntent): string {
  if (intent === "agent" || intent === "marketing" || intent === "leadership") {
    return `/ontology/insights/?reader=${intent}`;
  }
  return "/ontology/";
}
