"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/shared/ui";

/**
 * 공방 <lg 정직 강등 (2026-07-28 판정 ②).
 *
 * 축소 자체는 의도다 — 나침 무대는 고정 폭 카드 + 위성 기하라 768px 에서
 * 성립하지 않고, 하단 탭바는 공방 탭을 일부러 뺐다(#707). 설치 앱은
 * `minWidth 1040` 이라 이 폭이 아예 존재하지 않으므로 남는 인구는 웹 태블릿과
 * 브라우저 분할창뿐이다.
 *
 * 결함은 그 축소가 **반쪽**이었다는 것이다: 내비에서만 공방을 지웠고 라우트
 * 에는 폭 가드가 없어, 데이터시트의 「관계 편집」·인사이트·문서함 frontmatter
 * 세 갈래 딥링크가 검증된 적 없는 폭의 화면으로 사용자를 그대로 던졌다. 못
 * 가게 막아 놓고 보내는 길은 열어 둔 셈이다.
 *
 * 그래서 이 카드 하나가 두 문제를 함께 닫는다 — 딥링크 착지 세 갈래와 "왜
 * 탭이 없지". 형식은 `.claude/rules/surfaces.md` 의 강등 계약을 그대로 따른다:
 * **왜** 못 오는지와 **어디로** 가면 되는지를 같이 말한다. 이유만 있고 갈 곳이
 * 없으면 그건 강등이 아니라 막다른 길이다.
 *
 * `data-surface-role="degraded-surface"` 는 첫 방문 자동 안내가 이 위로 뜨는
 * 것을 막는 마커다 — 없는 표면을 소개하는 투어는 안내가 아니라 거짓말이다.
 */
export function StudioTooNarrow() {
  const t = useTranslations("ontologyStudio.tooNarrow");

  return (
    <main
      id="main"
      tabIndex={-1}
      data-testid="studio-too-narrow"
      data-surface-role="degraded-surface"
      className="flex min-h-[100dvh] w-full items-center justify-center bg-[color:var(--color-canvas)] p-6 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]"
    >
      <EmptyState
        className="w-full max-w-lg"
        // 이 카드가 이 라우트의 본문 전부다 — 제목이 없으면 heading 0개 화면이 된다.
        titleAs="h1"
        title={t("title")}
        description={
          <>
            {t("body")}
            <span className="mt-2 block text-[color:var(--color-text-quaternary)]">{t("note")}</span>
          </>
        }
        tone="solid"
        align="center"
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/topology/"
              data-testid="studio-too-narrow-map"
              className="rounded-card border border-[color:var(--color-border-strong)] px-3 py-1.5 text-label font-semibold text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              {t("openMap")}
            </Link>
            <Link
              href="/download/"
              data-testid="studio-too-narrow-get-app"
              className="rounded-card border border-[color:var(--color-border-strong)] px-3 py-1.5 text-label font-semibold text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              {t("getApp")}
            </Link>
          </div>
        }
      />
    </main>
  );
}
