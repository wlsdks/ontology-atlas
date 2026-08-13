/**
 * 종류 한 글자 글리프 — 무대 본체(위성 행)와 피커·검색 목록이 같은 표식을
 * 쓴다. `StudioCompass.tsx` 분할(2026-08-13)에서 나온 공유 조각.
 */
const KIND_LETTER: Record<string, string> = {
  project: "P",
  domain: "D",
  capability: "C",
  element: "E",
  document: "◦",
  unknown: "•",
};

export function KindGlyph({ kind }: { kind: string }) {
  return (
    <span className="grid h-[18px] w-[18px] flex-none place-items-center rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]">
      {KIND_LETTER[kind] ?? "•"}
    </span>
  );
}
