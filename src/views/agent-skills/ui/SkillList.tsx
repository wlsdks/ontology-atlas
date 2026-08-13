"use client";

import { useTranslations } from "next-intl";

import type { AgentSkill, SkillInventory } from "@/entities/agent-skill";
import { controlClass } from "@/shared/ui/control-class";

/**
 * 한 줄 행 목록 — **출처로 묶고, 내 것을 맨 위에.**
 *
 * 종전 목록은 행마다 이름·출처·설명 두 줄(≈92px)이라 43개가 5.3화면이었다. 그리고
 * 알파벳 한 줄로 늘어놓으니 **내가 만든 1개가 남의 42개 사이에 묻혔다.**
 *
 * 한 줄로 줄이면 설명이 행에서 사라진다 — 그 대가는 알고 치른다. 대신 행이 나르는
 * 것은 **셋 다 숫자**다: 매 세션 실리는 글자 수 · 여는 파일 · 실행되는 파일.
 * 「이 스킬이 언제 뜨나」의 *비용* 쪽이 목록에서 바로 읽힌다.
 */

export interface SkillGroup {
  readonly source: string;
  readonly personal: boolean;
  readonly skills: readonly AgentSkill[];
}

/** 출처로 묶는다. **내 것이 먼저**, 나머지는 개수 많은 순. */
export function groupBySource(skills: readonly AgentSkill[]): SkillGroup[] {
  const map = new Map<string, AgentSkill[]>();
  for (const skill of skills) {
    const bucket = map.get(skill.origin.source);
    if (bucket) bucket.push(skill);
    else map.set(skill.origin.source, [skill]);
  }
  return [...map.entries()]
    .map(([source, group]) => ({ source, personal: group[0].origin.personal, skills: group }))
    .sort((a, b) => {
      if (a.personal !== b.personal) return a.personal ? -1 : 1;
      return b.skills.length - a.skills.length;
    });
}

/** 이름과 변별 낱말로 거른다 — 이미 갖고 있는 사실만 쓴다. */
export function filterSkills(skills: readonly AgentSkill[], query: string): AgentSkill[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...skills];
  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.origin.source.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q),
  );
}

export function SkillList({
  inventory,
  groups,
  selected,
  onSelect,
}: {
  inventory: SkillInventory;
  groups: readonly SkillGroup[];
  selected: string | null;
  onSelect: (relativePath: string) => void;
}) {
  const t = useTranslations("agentSkills");
  const collided = new Set(inventory.collisions.flatMap((c) => c.skills.map((s) => s.name)));

  return (
    <div className="flex flex-col gap-3" data-testid="skills-list">
      {groups.map((group) => (
        <section key={group.source}>
          {/* 소유자: *"스킬쪽 뭔가 내부 너무작지않음?"* (2026-08-12). 실측:
              뭉치 머리·행 메타·경고 배지가 **전부 9.5px** 라 세 역할이 크기로
              구분되지 않았다. 머리와 메타는 label(11)로 — 문서함 트리 카운트와
              같은 단이다. 배지(「이름겹침」)만 caption 에 남는다(규격이 배지에
              caption 을 허용한 자리). */}
          <h3 className="px-1 pb-1 text-body text-[color:var(--color-text-tertiary)]">
            {group.personal ? t("group.mine") : group.source}
            <span className="ml-1.5">({group.skills.length})</span>
          </h3>
          <ul className="flex flex-col">
            {group.skills.map((skill) => {
              const active = selected === skill.origin.relativePath;
              return (
                <li key={skill.origin.relativePath}>
                  <button
                    type="button"
                    data-testid="skill-row-toggle"
                    data-skill-path={skill.origin.relativePath}
                    data-active={active ? "true" : "false"}
                    aria-current={active ? "true" : undefined}
                    onClick={() => onSelect(skill.origin.relativePath)}
                    className={controlClass({
                      shape: "row",
                      size: "sm",
                      stacked: true,
                      active,
                      className: "justify-between gap-2",
                    })}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-body-lg text-[color:var(--color-text-primary)]">
                        {skill.name}
                      </span>
                      {collided.has(skill.name) ? (
                        <span
                          data-testid="skill-row-collision-mark"
                          title={t("collisions.title")}
                          className="shrink-0 text-label text-[color:var(--color-amber-source-text-a80)]"
                        >
                          {t("row.collides")}
                        </span>
                      ) : null}
                    </span>
                    {/* 숫자 셋은 오른쪽 끝에 붙여 **세로로 줄이 맞게** 둔다 —
                        행마다 들쭉날쭉하면 훑을 때 눈이 그 줄을 못 잡는다. */}
                    <span className="shrink-0 tabular-nums text-body text-[color:var(--color-text-tertiary)]">
                      {t("row.metrics", {
                        chars: skill.invocation.steps[0].chars,
                        files: skill.invocation.steps[2].files.length,
                        runs: skill.invocation.executables.length,
                      })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {groups.length === 0 ? (
        <p className="px-1 text-body leading-prose text-[color:var(--color-text-tertiary)]">
          {t("noMatch")}
        </p>
      ) : null}
    </div>
  );
}
