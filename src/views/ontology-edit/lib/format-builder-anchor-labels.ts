/**
 * 저장된 개념 앵커(BuilderCanvasEntryRail·앵커 더보기 다이얼로그)의 소형
 * 라벨 포매터 — 두 곳 모두 순수 문자열 조립이라 (OntologyEditPage.tsx A4
 * 분해) 한 파일에 묶는다.
 */
export function formatBuilderAnchorDegreeBadge(label: string, degree: number): string {
  return `${label} ${degree}`;
}

export function formatBuilderActiveFocusLabel(label: string, slug: string): string {
  return `${label} ${slug}`;
}
