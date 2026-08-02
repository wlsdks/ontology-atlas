"use client";

import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { EGO_BEARINGS, type ConceptEgo, type EgoBearing } from "../model/build-concept-ego";
import { ConceptEgoGraph } from "./ConceptEgoGraph";

/**
 * 고른 개념의 **성질 + 바로 옆 이웃**. 지도로 나가지 않고 여기서 끝난다.
 *
 * 왼쪽이 읽기(성질 3칸 + 관계 수), 오른쪽이 그림이다. 관계 이름을 그림에서
 * 빼 왼쪽으로 옮긴 이유: 그림 안에 두면 부채 바깥에 앉아 상자를 넓히고,
 * 상자가 넓어지면 **세로에 묶인 그림이 통째로 줄어든다**(실측 채움률 24%).
 * 읽기표의 선 견본이 그림의 선과 같은 토큰이라 범례도 따로 필요 없다.
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
    { label: t("egoDoc"), value: ego.docSlug, mono: true },
    { label: t("egoLinked"), value: ego.total > 0 ? String(ego.total) : null },
  ];

  const bearings = EGO_BEARINGS.map((bearing) => ({
    bearing,
    count: ego.neighbors[bearing].length,
  })).filter((row) => row.count > 0);

  return (
    <div
      data-testid="atlas-git-concept-ego"
      className="overflow-hidden rounded-[var(--radius-panel)] border border-[color:var(--color-border-soft)]"
    >
      <div className="flex items-center gap-2.5 border-b border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3.5 py-3">
        <TopologyV2KindGlyph kind={ego.kind} size={15} />
        <b className="truncate text-body-lg font-semibold text-[color:var(--color-text-primary)]">
          {ego.label}
        </b>
        <span className="shrink-0 text-label text-[color:var(--color-text-quaternary)]">
          {kindLabel(ego.kind)}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(200px,264px)_minmax(0,1fr)]">
        <dl className="grid content-start border-b border-[color:var(--color-divider)] lg:border-r lg:border-b-0">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="min-w-0 border-b border-[color:var(--color-divider)] px-3.5 py-2.5 last:border-b-0"
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
          {bearings.length > 0 ? (
            <div className="border-t border-[color:var(--color-divider)] px-3.5 py-2.5">
              <dt className="mb-1 text-caption text-[color:var(--color-text-quaternary)]">
                {t("egoLinked")}
              </dt>
              {bearings.map((row) => (
                <div
                  key={row.bearing}
                  className="flex items-center gap-2 py-0.5 text-label text-[color:var(--color-text-secondary)]"
                >
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
                  <span className="truncate">{bearingLabel(t, row.bearing)}</span>
                  <b className="ml-auto shrink-0 font-semibold tabular-nums text-[color:var(--color-text-tertiary)]">
                    {row.count}
                  </b>
                </div>
              ))}
            </div>
          ) : null}
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
