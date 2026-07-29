"use client";

import type { ReactNode } from "react";

/**
 * 인사이트 보드의 **구획 제목** — 눈에 보이던 위계를 문서 구조로도 만든다.
 *
 * ## 왜 만들었나 (2026-07-29 도그푸딩 실측)
 *
 * 이 화면 전체의 heading 요소가 **`<h1>` 하나뿐**이었다. 「에이전트 준비도」·
 * 「수리 큐」·「여러 곳에서 참조돼요」 같은 구획 제목은 전부 `<span>` 에
 * `text-body-lg font-medium` 을 입힌 것이라, 화면에는 위계가 보이는데
 * **문서에는 위계가 없었다.**
 *
 * 그 차이가 실제로 무엇을 막았나: 스크린리더 사용자는 이 보드를 제목으로
 * 훑을 수 없다. 항목 사이를 순서대로 지나가는 것 말고는 「수리 큐」로 바로
 * 갈 방법이 없고, 이 화면은 정확히 **훑어서 다음 할 일을 고르라고** 만든
 * 정비 보드다. 그 화면에서 훑기를 못 하면 화면의 일 자체가 안 된다.
 *
 * ## 왜 컴포넌트인가
 *
 * 같은 클래스 문자열이 다섯 파일에 열두 번 복제돼 있었다. 태그만 바꾸면 그
 * 복제본이 그대로 남아 다음 사람이 열세 번째 `<span>` 을 만든다. 역할에
 * 이름을 주면 다음 사람은 이 문을 지난다.
 *
 * 시각 변화는 없다 — Tailwind preflight 가 heading 의 font-size/weight 를
 * `inherit` 로 리셋하고, 크기·굵기는 여기 명시된 클래스가 그대로 정한다.
 */
export function InsightsSectionTitle({
  level,
  className,
  children,
  ...rest
}: {
  /** 카드 제목은 2, 카드 안의 하위 구획은 3. `<h1>` 은 페이지 제목이 이미 쓴다. */
  level: 2 | 3;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLHeadingElement>, "className" | "children">) {
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <Tag className={className} {...rest}>
      {children}
    </Tag>
  );
}
