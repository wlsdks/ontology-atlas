"use client";

import { useTranslations } from "next-intl";

import type { SkillInventory } from "@/entities/agent-skill";
import { controlClass } from "@/shared/ui/control-class";

/**
 * 진단 — **아무것도 안 골랐을 때 오른쪽이 답하는 것.**
 *
 * 2열로 가면서 예상한 실패는 하나였다: *"오른쪽 절반이 대부분 비어 있으면 화면의
 * 반을 아무도 안 보는 것에 준 셈"*. 그래서 빈 자리에 안내 문구를 넣는 대신 **세
 * 질문의 답을 넣는다** — 매 세션 드는 비용 · 서로 경쟁하는 것 · 실제로 돌 수 있는
 * 파일. 셋 다 이미 계산돼 있는데 화면에 없던 값이다.
 *
 * 그리고 각 항목은 **누르면 그 스킬로 간다.** 종전에는 「겹쳤어요」라고 말해 놓고
 * 상대로 가는 길이 0개였다.
 */
export function FindingsPanel({
  inventory,
  onSelect,
}: {
  inventory: SkillInventory;
  onSelect: (relativePath: string) => void;
}) {
  const t = useTranslations("agentSkills");
  const heaviest = [...inventory.skills]
    .sort((a, b) => b.invocation.steps[0].chars - a.invocation.steps[0].chars)
    .slice(0, 5);
  const runners = inventory.skills.filter((s) => s.invocation.executables.length > 0);

  return (
    <div className="flex flex-col gap-3" data-testid="skills-findings">
      <Block
        title={t("findings.alwaysTitle")}
        note={t("findings.alwaysNote", { chars: inventory.totals.alwaysLoadedChars })}
      >
        <ul className="flex flex-col">
          {heaviest.map((skill) => (
            <li key={skill.origin.relativePath}>
              <Row onClick={() => onSelect(skill.origin.relativePath)}>
                <span className="truncate">{skill.name}</span>
                <span className="shrink-0 tabular-nums text-[color:var(--color-text-tertiary)]">
                  {t("chain.chars", { count: skill.invocation.steps[0].chars })}
                </span>
              </Row>
            </li>
          ))}
        </ul>
      </Block>

      <Block
        title={t("findings.competingTitle")}
        note={t("findings.competingNote", {
          names: inventory.collisions.length,
          pairs: inventory.overlaps.length,
        })}
      >
        {inventory.collisions.length === 0 && inventory.overlaps.length === 0 ? (
          <p className="px-2 py-1 text-label leading-prose text-[color:var(--color-text-tertiary)]">
            {t("findings.noneCompeting")}
          </p>
        ) : (
          <ul className="flex flex-col">
            {inventory.collisions.map((collision) => (
              <li key={collision.name}>
                <Row onClick={() => onSelect(collision.skills[0].origin.relativePath)}>
                  <span className="truncate">{collision.name}</span>
                  <span className="shrink-0 text-[color:var(--color-text-tertiary)]">
                    {t("findings.sameNameCount", { count: collision.skills.length })}
                  </span>
                </Row>
              </li>
            ))}
            {inventory.overlaps.slice(0, 8).map((overlap) => (
              <li key={`${overlap.a.origin.relativePath}|${overlap.b.origin.relativePath}`}>
                <Row onClick={() => onSelect(overlap.a.origin.relativePath)}>
                  <span className="truncate">
                    {overlap.a.name} ↔ {overlap.b.name}
                  </span>
                  <span className="shrink-0 truncate text-[color:var(--color-text-tertiary)]">
                    {overlap.shared.slice(0, 3).join(" · ")}
                  </span>
                </Row>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block
        title={t("findings.runsTitle")}
        note={t("findings.runsNote", { count: inventory.totals.executables })}
      >
        {runners.length === 0 ? (
          <p className="px-2 py-1 text-label leading-prose text-[color:var(--color-text-tertiary)]">
            {t("findings.noneRun")}
          </p>
        ) : (
          <ul className="flex flex-col">
            {runners.slice(0, 8).map((skill) => (
              <li key={skill.origin.relativePath}>
                <Row onClick={() => onSelect(skill.origin.relativePath)}>
                  <span className="truncate">{skill.name}</span>
                  <span className="shrink-0 tabular-nums text-[color:var(--color-text-tertiary)]">
                    {t("row.runs", { count: skill.invocation.executables.length })}
                  </span>
                </Row>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-1">
        {/* 분석 화면의 같은 카드(제목 + 우측 mono 수치)가 14/11 인데 여기만
            11/9.5 였다(2026-08-12 실측·처방). 같은 역할 = 같은 단. */}
        <h3 className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {title}
        </h3>
        <p className="font-mono text-label text-[color:var(--color-text-tertiary)]">{note}</p>
      </div>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function Row({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      data-testid="skill-jump"
      onClick={onClick}
      /*
        `size: "sm"` 행은 값 층에서 `min-h-7 py-1.5 text-label` 이다 — 작은
        글자를 전제한 높이다. 여기서 `text-body-lg`(14px)로 덮으면 안쪽이
        22px 가 되어 6+22+6 = 34px 로 밀린다(2026-08-03 에 높이 사다리에서
        지워진 값). 행이 전제한 크기로 되돌린다 — 실측 32px, 사다리 위.
      */
      className={controlClass({
        shape: "row",
        size: "sm",
        className: "justify-between gap-2 text-body",
      })}
    >
      {children}
    </button>
  );
}
