import { useLocale, useTranslations } from "next-intl";
import { FileText, GitBranch, Network } from "lucide-react";
import {
  buildOntologyDeeplinkForDoc,
  buildTopologyDeeplinkForDoc,
  type VaultDoc,
} from "@/entities/docs-vault";
import { Link } from "@/i18n/navigation";
import { estimateReadingMinutes } from "./reading-minutes";

// 후방 호환 — 기존 호출자가 DocMetaBar 모듈에서 직접 import 하던 것을
// 깨지 않도록 re-export. 실제 정의는 ./reading-minutes.ts (test 측이
// `@/i18n/navigation` 같은 React 의존을 끌어오지 않게 분리).
export { estimateReadingMinutes };

const actionLinkClass =
  "inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[color:var(--color-overlay-2)] bg-[color:rgba(255,255,255,0.025)] px-2.5 font-mono text-[11px] text-[color:var(--color-text-tertiary)] underline-offset-2 transition-[background-color,border-color,color,transform] hover:-translate-y-0.5 hover:border-[color:rgba(139,151,255,0.42)] hover:bg-[color:rgba(139,151,255,0.08)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] active:translate-y-px active:border-[color:rgba(139,151,255,0.58)] active:bg-[color:rgba(139,151,255,0.12)] motion-reduce:transform-none";

/**
 * 문서 본문 위 메타 바 — 단어 수 / 읽기 시간 / kind 점프 / 태그 / 갱신일.
 *
 * 호출자: `DocsVaultContent` 안 viewer 영역 헤더.
 */
export function DocMetaBar({ doc }: { doc: VaultDoc }) {
  const t = useTranslations("vaultWidgets.parts.meta");
  const locale = useLocale();
  const numberLocale = locale === "ko" ? "ko-KR" : "en-US";
  const readingMinutes = estimateReadingMinutes(doc.wordCount);
  const updated = new Date(doc.updatedAt);
  const ontologyHref = buildOntologyDeeplinkForDoc(doc);
  const kindValue = ontologyHref
    ? String(doc.frontmatter?.kind ?? "").trim()
    : "";
  // 토폴로지가 전체 ontology 그래프를 렌더하므로 project·domain·capability·element
  // 모두 1:1 노드를 가져 토폴로지로 점프 가능 (buildTopologyDeeplinkForDoc 이 kind 별 처리).
  const topologyHref = buildTopologyDeeplinkForDoc(doc);
  const sourcePath = doc.path || `${doc.slug}.md`;
  const proofBody =
    ontologyHref && kindValue
      ? t("recordProofOntologyBody", { kind: kindValue })
      : t("recordProofBody");

  return (
    <section
      aria-label={t("recordProofAria")}
      className="mx-auto flex max-w-[760px] flex-col gap-2 border-b border-[color:var(--color-overlay-2)] px-6 py-3 text-[11px] text-[color:var(--color-text-quaternary)] md:px-10"
    >
      <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1.5">
        <span className="inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-overlay-2)] bg-[color:rgba(255,255,255,0.025)] px-2.5 font-mono text-[11px] text-[color:var(--color-text-secondary)]">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          {t("recordProofLabel")}
        </span>
        <span className="min-h-7 min-w-0 rounded-md border border-[color:var(--color-overlay-1)] bg-[color:rgba(255,255,255,0.018)] px-2 py-1 font-mono text-[11px] text-[color:var(--color-text-tertiary)]">
          <span className="sr-only">{t("pathLabel")}: </span>
          <span className="break-all">{sourcePath}</span>
        </span>
        <span className="min-h-7 min-w-0 flex-1 py-1 text-[color:var(--color-text-tertiary)]">
          {proofBody}
        </span>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono tabular-nums">
            {t("wordsUnit", { count: doc.wordCount.toLocaleString(numberLocale) })}
          </span>
          <span className="font-mono tabular-nums">
            {t("readingMinutes", { minutes: readingMinutes })}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {ontologyHref ? (
            <Link
              href={ontologyHref}
              title={t("ontologyKindTitle", { kind: kindValue })}
              className={actionLinkClass}
            >
              <GitBranch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t("ontologyKindLabel", { kind: kindValue })}</span>
            </Link>
          ) : null}
          {topologyHref ? (
            <Link
              href={topologyHref}
              title={t("topologyLinkTitle")}
              className={actionLinkClass}
            >
              <Network className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t("topologyLinkLabel")}</span>
            </Link>
          ) : null}
        </div>
        {doc.tags.length > 0 ? (
          <span className="font-mono">
            {doc.tags.map((tag) => `#${tag}`).join(" ")}
          </span>
        ) : null}
        <span
          className="ml-auto font-mono tabular-nums"
          title={updated.toLocaleString(numberLocale)}
        >
          {updated.toLocaleDateString(numberLocale, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          })}
        </span>
      </div>
    </section>
  );
}
