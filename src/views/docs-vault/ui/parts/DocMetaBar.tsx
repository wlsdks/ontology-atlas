import { useLocale, useTranslations } from "next-intl";
import { FileText, Network } from "lucide-react";
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
  "inline-flex min-h-8 items-center gap-1.5 rounded-chip border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2.5 font-mono text-label text-[color:var(--color-text-tertiary)] underline-offset-2 transition-[background-color,border-color,color,transform] hover:-translate-y-0.5 hover:border-[color:var(--color-indigo-line-a42)] hover:bg-[color:var(--color-indigo-line-a06)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a42)] active:translate-y-px active:border-[color:var(--color-indigo-line-a54)] active:bg-[color:var(--color-indigo-line-a13)] motion-reduce:transform-none";

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
  /**
   * **이 문서가 지도에 실재하는가** — 칩·본문·CTA 가 모두 이 하나로 갈린다.
   *
   * 판정을 딥링크 빌더에서 그대로 가져오는 이유(2026-08-04): 종전엔 칩과
   * 본문이 **무조건** 「지도 근거」라고 말했다. 그래서 `kind` 가 없거나 비었거나
   * 알 수 없는 값인 문서 — 즉 그래프에 노드가 **없는** 문서 — 도 자기가 지도를
   * 뒷받침한다고 주장했다. 빌더가 주소를 못 만드는 문서는 지도에 자리가 없는
   * 문서다. 그러니 두 판정이 갈릴 수 없게 **같은 값**을 쓴다 — 칩이 «있다» 고
   * 말하는데 CTA 가 못 가는 상태가 구조적으로 불가능해진다.
   */
  const inGraph = topologyHref != null;
  const proofBody = !inGraph
    ? t("notOnMapBody")
    : ontologyHref && kindValue
      ? t("recordProofOntologyBody", { kind: kindValue })
      : t("recordProofBody");

  return (
    <section
      aria-label={inGraph ? t("recordProofAria") : t("notOnMapAria")}
      className="mx-auto flex max-w-[760px] flex-col gap-2 border-b border-[color:var(--color-overlay-2)] px-6 py-3 text-label text-[color:var(--color-text-quaternary)] md:px-10"
    >
      <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1.5">
        <span
          data-testid="doc-map-evidence"
          data-in-graph={inGraph ? "true" : "false"}
          className={
            inGraph
              ? "inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2.5 font-mono text-label text-[color:var(--color-text-secondary)]"
              : // 지도에 없다는 말은 경보가 아니라 사실이다 — 무채색으로 낮춘다.
                "inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-recessed-a12)] px-2.5 font-mono text-label text-[color:var(--color-text-quaternary)]"
          }
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          {inGraph ? t("recordProofLabel") : t("notOnMapLabel")}
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
          {/*
            지도로 가는 입구는 **하나**다 (2026-07-28).

            종전에는 「의미 지도」(`/ontology/?node=`)와 「지형도」
            (`/topology/?p=`)가 나란히 있었다. 그런데 `/ontology` 는 지도로
            가는 **얇은 리다이렉트**라(AGENTS.md — 구 허브는 은퇴했다) 두 링크가
            같은 화면에 도착한다. 파라미터만 다른 두 입구는 선택지가 아니라
            망설임이다.

            직접 가는 쪽(`/topology` 포커스)만 남긴다 — 리다이렉트 한 홉이
            줄고, 화면이 사용자에게 묻는 것이 하나 줄어든다.
          */}
          {/* **주소를 못 만들면 CTA 를 안 그린다.** 죽은 CTA 0 은 이 저장소의
              계약이다(`.claude/rules/surfaces.md`) — 누를 수 있게 생겼는데 아무
              것도 안 잡히는 링크는 강등이 아니라 함정이다. 위 `inGraph` 와 같은
              값에서 갈리므로 칩과 CTA 가 서로 다른 말을 할 수 없다. */}
          {topologyHref ? (
            <Link
              href={topologyHref}
              title={t("topologyLinkTitle")}
              data-testid="doc-map-open"
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
