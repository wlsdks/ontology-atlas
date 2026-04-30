import { cn } from "@/shared/lib/cn";

export type ExtractorVersion = "gemini-v1" | "ontology-v1";

/**
 * 추출 엔진 토글 — Gemini (legacy) vs Ontology (T-4 신규).
 *
 * C-1 phase 측정용. 기본값은 `gemini-v1` 으로 두어 무회귀. 디자인 헌장 §11
 * 의 단일 인디고 + 무채색만 사용 (활성 chip = 인디고 alpha bg, 비활성 = 무채색).
 *
 * 호출자: `KnowledgeDocumentDetailPage` 의 추출 액션 영역.
 */
export function ExtractorVersionToggle({
  value,
  onChange,
}: {
  value: ExtractorVersion;
  onChange: (next: ExtractorVersion) => void;
}) {
  const options: ReadonlyArray<{
    id: ExtractorVersion;
    label: string;
    title: string;
  }> = [
    { id: "gemini-v1", label: "Gemini", title: "기존 Gemini 추출 (legacy)" },
    {
      id: "ontology-v1",
      label: "Ontology",
      title: "T-4 ontology TBox 추출 (Anthropic, C-1 측정)",
    },
  ];
  return (
    <div
      className="inline-flex items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] p-0.5 text-[11px]"
      role="radiogroup"
      aria-label="추출 엔진 선택"
      data-testid="extractor-version-toggle"
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.title}
            onClick={() => onChange(opt.id)}
            className={cn(
              "rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.10em] transition-colors",
              active
                ? "bg-[color:rgba(94,106,210,0.18)] text-[color:rgba(159,170,235,0.95)]"
                : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]",
            )}
            data-extractor-version={opt.id}
            data-active={active}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
