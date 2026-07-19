/**
 * 헤더 유틸 버튼의 aria-label/title 조합 — `라벨 · 힌트` 로 접근성 이름을,
 * 힌트만 title 로 노출한다(OntologyEditPage.tsx A4 분해).
 */
export function resolveBuilderHeaderActionLabel({
  label,
  hint,
}: {
  label: string;
  hint: string;
}): { ariaLabel: string; title: string } {
  return {
    ariaLabel: `${label} · ${hint}`,
    title: hint,
  };
}
