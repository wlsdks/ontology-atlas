"use client";

import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { EGO_BEARINGS, type ConceptEgo, type EgoBearing } from "../model/build-concept-ego";
import { ConceptEgoGraph } from "./ConceptEgoGraph";
import { controlClass } from '@/shared/ui/control-class';

/**
 * 고른 개념의 **성질 + 바로 옆 이웃**. 지도로 나가지 않고 여기서 끝난다.
 *
 * 왼쪽이 읽기, 오른쪽이 그림이다. 관계 이름을 그림에서 빼 왼쪽으로 옮긴 이유:
 * 그림 안에 두면 부채 바깥에 앉아 상자를 넓히고, 상자가 넓어지면 세로에 묶인
 * 그림이 통째로 줄어든다(실측 채움률 24%). 읽기표의 선 견본이 그림의 선과
 * 같은 토큰이라 범례도 따로 필요 없다.
 *
 * ## 무엇을 싣나 (2026-08-02 확장)
 *
 * 종전엔 세 칸(도메인 · 근거 문서 · 이어진 곳 수)뿐이었다. 그런데 그래프
 * 노드는 이미 **한 줄 설명 · 에이전트 이름 · 프로젝트**를 나르고 있었고 화면이
 * 그걸 안 쓰고 있었다 — 아는 것을 안 보여주는 것은 강등이 아니라 누락이다.
 *
 * 순서는 사람이 읽는 순서다: 이름 → **한 줄 설명** → 어디 속하나 → 어디에
 * 적혀 있나 → **에이전트에게 뭐라 부르나** → 무엇과 이어졌나. 마지막 둘이
 * 이 제품의 두 사용자에 각각 대응한다.
 *
 * ⚠️ **없는 필드는 슬롯을 만들지 않는다** — 아무도 안 채우는 칸은 규격이
 * 아니라 오정보다. `summary`/`projectLabels` 는 값이 있을 때만 칸이 생긴다
 * (반복 세트가 아니라 단일 카드라 치수 규칙성 대상이 아니다).
 */
export function ConceptEgoCard({
  ego,
  t,
  kindLabel,
  onSelect,
}: {
  ego: ConceptEgo | null;
  t: (key: string, values?: Record<string, string | number>) => string;
  /**
   * 종류 이름 — 이미 있는 `kinds` 네임스페이스가 진실원이다. 여기서 새 키를
   * 만들면 같은 사실이 두 곳에 적히고 그 순간부터 드리프트가 시작된다.
   */
  kindLabel: (kind: string) => string;
  onSelect?: (nodeId: string) => void;
}) {
  if (!ego) return null;

  const facts: { label: string; value: string | null; mono?: boolean }[] = [
    { label: t("egoDomain"), value: ego.domainLabel },
    ...(ego.projectLabels.length > 0
      ? [{ label: t("egoProject"), value: ego.projectLabels.join(", ") }]
      : []),
    { label: t("egoDoc"), value: ego.docSlug, mono: true },
    { label: t("egoAgentName"), value: ego.agentSlug, mono: true },
  ];

  const bearings = EGO_BEARINGS.map((bearing) => ({
    bearing,
    neighbors: ego.neighbors[bearing],
  })).filter((row) => row.neighbors.length > 0);

  return (
    <div
      data-testid="atlas-git-concept-ego"
      className="flex flex-col overflow-hidden rounded-[var(--radius-panel)] border border-[color:var(--color-border-soft)]"
    >
      <div className="flex flex-col gap-1.5 border-b border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <TopologyV2KindGlyph kind={ego.kind} size={15} />
          <b className="truncate text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
            {ego.label}
          </b>
          <span className="shrink-0 text-label text-[color:var(--color-text-quaternary)]">
            {kindLabel(ego.kind)}
          </span>
          <span className="ml-auto shrink-0 text-label tabular-nums text-[color:var(--color-text-tertiary)]">
            {t("egoLinkedCount", { count: ego.total })}
          </span>
        </div>
        {/* 사람이 쓴 한 줄. 이 카드에서 사람이 가장 먼저 읽는 사실이다. */}
        {ego.summary ? (
          <p className="line-clamp-2 text-label leading-prose text-[color:var(--color-text-secondary)]">
            {ego.summary}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,var(--git-ego-facts-w))_minmax(0,1fr)]">
        <dl className="grid content-start border-b border-[color:var(--color-divider)] lg:border-r lg:border-b-0">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="min-w-0 border-b border-[color:var(--color-divider)] px-4 py-2.5"
            >
              <dt className="mb-0.5 text-caption text-[color:var(--color-text-quaternary)]">
                {fact.label}
              </dt>
              <dd
                className={
                  fact.value
                    ? "truncate text-label text-[color:var(--color-text-secondary)]"
                    : "truncate text-label text-[color:var(--color-text-quaternary)]"
                }
                title={fact.value ?? undefined}
              >
                {fact.value ? (
                  fact.mono ? (
                    <code className="font-mono">{fact.value}</code>
                  ) : (
                    fact.value
                  )
                ) : (
                  t("egoNone")
                )}
              </dd>
            </div>
          ))}
          {/*
            관계는 **수가 아니라 이름**을 보여준다. 「담고 있는 것 3」은 3이
            무엇인지 물으면 답을 못 하고, 그 답을 얻으려면 그림에서 눈으로
            세어야 했다. 이름이 있으면 이 칸만으로 끝나고, 누르면 그쪽으로
            넘어가므로 그림의 클릭과 같은 문을 하나 더 여는 셈이다.
          */}
          {bearings.map((row) => (
            <div
              key={row.bearing}
              className="px-4 py-2.5 not-last:border-b not-last:border-[color:var(--color-divider)]"
            >
              <dt className="mb-1 flex items-center gap-2 text-caption text-[color:var(--color-text-quaternary)]">
                {/* 선 견본 — 그림의 실선/점선과 같은 토큰이라 범례가 따로 필요 없다. */}
                <i
                  aria-hidden
                  className="h-0 w-3.5 shrink-0 border-t"
                  style={
                    row.bearing === "dependsOn" || row.bearing === "usedBy"
                      ? {
                          borderTopStyle: "dashed",
                          borderTopColor: "var(--topology-v2-edge-depends)",
                        }
                      : { borderTopColor: "var(--topology-v2-edge-contains)" }
                  }
                />
                {bearingLabel(t, row.bearing)}
                <b className="ml-auto font-normal tabular-nums">{row.neighbors.length}</b>
              </dt>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {row.neighbors.map((neighbor) => (
                  <button
                    key={neighbor.id}
                    type="button"
                    data-testid="atlas-git-ego-neighbor"
                    onClick={onSelect ? () => onSelect(neighbor.id) : undefined}
                    disabled={!onSelect}
                    className={controlClass({ shape: "link", tone: "secondary", className: "min-w-0 gap-1.5 text-label enabled:hover:text-[color:var(--color-text-primary)] disabled:cursor-default" })}
                  >
                    <TopologyV2KindGlyph kind={neighbor.kind} size={11} />
                    <span className="truncate">{neighbor.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </dl>

        {ego.total > 0 ? (
          <ConceptEgoGraph
            ego={ego}
            bearingLabel={(bearing) => bearingLabel(t, bearing)}
            moreLabel={(count) => t("moreSlugs", { count })}
            onSelect={onSelect}
          />
        ) : (
          <div className="grid place-items-center px-4 py-10 text-label text-[color:var(--color-text-quaternary)]">
            {t("egoEmpty")}
          </div>
        )}
      </div>
    </div>
  );
}

function bearingLabel(
  t: (key: string, values?: Record<string, string | number>) => string,
  bearing: EgoBearing,
): string {
  switch (bearing) {
    case "belongsTo":
      return t("bearingBelongsTo");
    case "contains":
      return t("bearingContains");
    case "dependsOn":
      return t("bearingDependsOn");
    default:
      return t("bearingUsedBy");
  }
}
