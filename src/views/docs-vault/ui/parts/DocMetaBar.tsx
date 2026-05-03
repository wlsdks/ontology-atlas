import { useLocale, useTranslations } from "next-intl";
import { buildOntologyDeeplinkForDoc, type VaultDoc } from "@/entities/docs-vault";
import { Link } from "@/i18n/navigation";
import { estimateReadingMinutes } from "./reading-minutes";

// 후방 호환 — 기존 호출자가 DocMetaBar 모듈에서 직접 import 하던 것을
// 깨지 않도록 re-export. 실제 정의는 ./reading-minutes.ts (test 측이
// `@/i18n/navigation` 같은 React 의존을 끌어오지 않게 분리).
export { estimateReadingMinutes };

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
  return (
    <div className="mx-auto flex max-w-[760px] flex-wrap items-center gap-3 border-b border-[color:var(--color-overlay-2)] px-6 py-3 text-[11px] text-[color:var(--color-text-quaternary)] md:px-10">
      <span className="font-mono tabular-nums">
        {t("wordsUnit", { count: doc.wordCount.toLocaleString(numberLocale) })}
      </span>
      <span className="font-mono tabular-nums">
        {t("readingMinutes", { minutes: readingMinutes })}
      </span>
      {ontologyHref ? (
        <Link
          href={ontologyHref}
          title={t("ontologyKindTitle", { kind: kindValue })}
          className="font-mono underline-offset-2 transition-colors hover:text-[color:var(--color-indigo-accent)] hover:underline"
        >
          kind:{kindValue}
        </Link>
      ) : null}
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
  );
}
