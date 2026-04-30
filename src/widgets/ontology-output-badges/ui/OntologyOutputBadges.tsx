import {
  CONFIDENCE_HIGH_THRESHOLD,
  CONFIDENCE_MEDIUM_THRESHOLD,
  type KnowledgeOutput,
  type KnowledgeOutputGrade,
} from "@/entities/knowledge-output";

/**
 * 검수 카드 위에 표시되는 ontology output 메타 칩들 — provider / grade /
 * confidence cap / token usage / 검증 실패 수 / 추출 시간.
 *
 * 신규 ontology 추출 (provider='anthropic') 만 grade / usage / latency
 * 가 있으므로 정의된 항목만 렌더. legacy Gemini 출력은 provider 칩만 표시.
 */
export interface OntologyOutputBadgesProps {
  output: KnowledgeOutput;
  /**
   * 칩을 한 줄에 한 행으로 깔지 (`row`) 작은 wrap 으로 깔지 (`compact`).
   * 검수 큐 카드의 헤더 / 푸터 어디에 붙여도 깨지지 않게.
   */
  layout?: "row" | "compact";
  /**
   * 칩 자체의 밀도. `default` 는 본문 톤 (text-[11px] / px-2 py-[2px]).
   * `compact` 는 list row · 좁은 inline 표시용으로 한 단계 축소
   * (text-[10px] / px-1.5 py-[1px]). chip 개수가 5+ 인데 가로 폭이
   * 좁은 surface — 검수 list row, 모바일 카드 푸터 — 에서 사용.
   */
  density?: "default" | "compact";
}

/**
 * 칩 표면에 노출하는 한국어 풀라벨 — 호버 title 의존 제거. 모바일에서도
 * 의미 인지 가능. 칸막이 컨테이너가 wrap 이라 길어지면 자연스럽게 줄바꿈.
 */
const GRADE_SURFACE_LABEL: Record<KnowledgeOutputGrade, string> = {
  A: "등급 A · 자동 승인 가능",
  B: "등급 B · 검수 권장",
  C: "등급 C · 자동 반영 금지",
};

const GRADE_HOVER_TITLE: Record<KnowledgeOutputGrade, string> = {
  A: "등급 A — frontmatter 가 완비된 신뢰도 1.0 추출.",
  B: "등급 B — frontmatter 가 일부 누락. confidence cap 0.84 (검수 권장).",
  C: "등급 C — frontmatter 가 부족. confidence cap 0.59 (자동 반영 금지).",
};

const GRADE_TONE: Record<
  KnowledgeOutputGrade,
  { bg: string; text: string; border: string }
> = {
  A: {
    bg: "rgba(94,106,210,0.14)",
    text: "rgba(159,170,235,0.95)",
    border: "rgba(94,106,210,0.35)",
  },
  B: {
    bg: "var(--color-border-soft)",
    text: "var(--color-text-secondary)",
    border: "var(--color-border-strong)",
  },
  C: {
    bg: "rgba(255,179,71,0.10)",
    text: "rgba(238,198,128,0.95)",
    border: "rgba(255,179,71,0.32)",
  },
};

function getGradeConfidenceCap(grade: KnowledgeOutputGrade): number {
  if (grade === "A") return 1.0;
  if (grade === "B") return CONFIDENCE_HIGH_THRESHOLD - 0.01;
  return CONFIDENCE_MEDIUM_THRESHOLD - 0.01;
}

function formatCost(usd: number | undefined): string | null {
  if (usd === undefined) return null;
  if (usd < 0.001) return "<$0.001";
  return `$${usd.toFixed(3)}`;
}

function Chip({
  label,
  tone,
  title,
  density = "default",
}: {
  label: string;
  tone?: { bg: string; text: string; border: string };
  title?: string;
  density?: "default" | "compact";
}) {
  const t = tone ?? {
    bg: "var(--color-overlay-2)",
    text: "var(--color-text-tertiary)",
    border: "var(--color-divider)",
  };
  // 라벨이 한국어이므로 uppercase 제거 — 한글이 대문자화되지 않아 시각 노이즈만
  // 만들었다. 폰트는 본문 톤, 모바일 가독성 위해 text-[11px] 로 살짝 키움.
  // density=compact 는 검수 list row 처럼 chip 5+ 개를 좁은 폭에 흘려야 할 때.
  const sizeClass =
    density === "compact"
      ? "gap-0.5 px-1.5 py-[1px] text-[10px]"
      : "gap-1 px-2 py-[2px] text-[11px]";
  return (
    <span
      title={title}
      className={`inline-flex items-center break-keep rounded-full border tracking-[0.01em] ${sizeClass}`}
      style={{ backgroundColor: t.bg, color: t.text, borderColor: t.border }}
    >
      {label}
    </span>
  );
}

export function OntologyOutputBadges({
  output,
  layout = "compact",
  density = "default",
}: OntologyOutputBadgesProps) {
  const isOntology = output.provider === "anthropic";
  const cap = output.grade !== undefined ? getGradeConfidenceCap(output.grade) : null;
  const cost = formatCost(output.usage?.estimatedCostUsd);

  // density=compact 일 때 container gap 도 한 단계 축소 — chip 사이 공백이
  // chip 자체보다 두꺼우면 어색하다.
  const containerClass =
    layout === "row"
      ? density === "compact"
        ? "flex flex-wrap items-center gap-1"
        : "flex flex-wrap items-center gap-1.5"
      : density === "compact"
        ? "inline-flex flex-wrap items-center gap-0.5"
        : "inline-flex flex-wrap items-center gap-1";

  return (
    <div
      className={containerClass}
      data-testid="ontology-output-badges"
      data-provider={output.provider || "unknown"}
      data-grade={output.grade ?? ""}
      data-density={density}
    >
      <Chip
        label={output.provider || "unknown"}
        title={
          output.provider
            ? `추출 provider — ${output.provider}`
            : "추출 provider 미상"
        }
        density={density}
      />

      {output.grade ? (
        <Chip
          label={GRADE_SURFACE_LABEL[output.grade]}
          tone={GRADE_TONE[output.grade]}
          title={GRADE_HOVER_TITLE[output.grade]}
          density={density}
        />
      ) : null}

      {cap !== null ? (
        <Chip
          label={`신뢰도 ≤ ${cap.toFixed(2)}`}
          title="confidence 상한 — 등급에 따라 결정 (A 1.0 / B 0.84 / C 0.59)"
          density={density}
        />
      ) : null}

      {output.usage ? (
        <Chip
          label={`토큰 ${output.usage.inputTokens.toLocaleString()}/${output.usage.outputTokens.toLocaleString()}`}
          title="LLM 토큰 사용량 (입력/출력)"
          density={density}
        />
      ) : null}

      {cost ? <Chip label={`비용 ${cost}`} title="추정 비용" density={density} /> : null}

      {typeof output.latencyMs === "number" ? (
        <Chip
          label={`소요 ${(output.latencyMs / 1000).toFixed(1)}초`}
          title="LLM 응답 시간"
          density={density}
        />
      ) : null}

      {typeof output.validationErrorCount === "number" &&
      output.validationErrorCount > 0 ? (
        <Chip
          label={`검증 실패 ${output.validationErrorCount}`}
          tone={{
            bg: "rgba(255,99,99,0.10)",
            text: "rgba(248,180,180,0.95)",
            border: "rgba(255,99,99,0.30)",
          }}
          title="validator 가 drop 한 항목 수 — 검수 시 부분 실패 인지"
          density={density}
        />
      ) : null}

      {!isOntology && !output.provider ? (
        <Chip label="legacy" title="기존 Gemini / stub 추출 출력" density={density} />
      ) : null}
    </div>
  );
}
