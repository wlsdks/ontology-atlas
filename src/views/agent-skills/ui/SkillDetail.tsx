"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { AgentSkill, SkillInventory } from "@/entities/agent-skill";
import { controlClass } from "@/shared/ui/control-class";

import { SkillInvocationChain } from "./SkillInvocationChain";
import { SkillProcessRail } from "./SkillProcessRail";

/**
 * 고른 스킬 하나 — **이 화면이 다른 어디서도 못 보여 주는 것.**
 *
 * 스킬 «목록»은 Finder 로도 본다. 못 보던 것은 *발동했을 때 무엇이 어떤 순서로
 * 열리고 그중 무엇이 실행되는가* 이고, 그게 아래 3단이다. 종전에는 43개 중 하나를
 * 눌러야만 나왔다 — 화면의 핵심이 가장 깊이 숨어 있었다.
 *
 * 그리고 **이 스킬과 경쟁하는 것들을 여기서 짚는다.** 종전에는 「겹쳤어요」라고
 * 말해 놓고 그 상대로 **가는 길이 없었다**(실측 0개). 여기서는 눌러서 건너뛴다.
 */
export function SkillDetail({
  skill,
  inventory,
  onSelect,
  onBack,
  onOverview,
  headingRef,
  openStepIds,
  onToggleStep,
}: {
  skill: AgentSkill;
  inventory: SkillInventory;
  onSelect: (relativePath: string) => void;
  onBack?: () => void;
  /**
   * 넓은 화면(split)의 되돌아갈 문 — 선택을 풀어 진단 개요(FindingsPanel)로.
   * 이 문이 없던 동안 개요로 돌아가는 유일한 길이 새로고침이었다(2026-08-13
   * 걷기 실측 — 같은 행 재클릭도 Escape 도 무효).
   */
  onOverview?: () => void;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  openStepIds: ReadonlySet<string>;
  onToggleStep: (stepId: string) => void;
}) {
  const t = useTranslations("agentSkills");
  const [loadChainOpen, setLoadChainOpen] = useState(false);

  const rivals = inventory.collisions
    .filter((c) => c.name === skill.name)
    .flatMap((c) => c.skills.filter((s) => s.origin.relativePath !== skill.origin.relativePath));

  const overlaps = inventory.overlaps
    .filter(
      (o) =>
        o.a.origin.relativePath === skill.origin.relativePath ||
        o.b.origin.relativePath === skill.origin.relativePath,
    )
    .map((o) => ({
      other: o.a.origin.relativePath === skill.origin.relativePath ? o.b : o.a,
      shared: o.shared,
    }));

  return (
    <article className="flex flex-col gap-3" data-testid="skill-detail">
      {onBack ? (
        <button
          type="button"
          data-testid="skills-detail-back"
          onClick={onBack}
          className={controlClass({ shape: "link", size: "lg", tone: "muted", className: "self-start lg:hidden" })}
        >
          {t("detail.back")}
        </button>
      ) : null}
      {onOverview ? (
        <button
          type="button"
          data-testid="skills-detail-overview"
          onClick={onOverview}
          className={controlClass({ shape: "link", size: "lg", tone: "muted", className: "hidden self-start lg:inline-flex" })}
        >
          {t("detail.backOverview")}
        </button>
      ) : null}
      <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
        >
          {skill.name}
        </h2>
        <p className="text-body text-[color:var(--color-text-tertiary)]">
          {skill.origin.personal ? t("group.mine") : skill.origin.source}
        </p>
      </header>

      {rivals.length > 0 || overlaps.length > 0 ? (
        <section
          data-testid="skill-detail-rivals"
          className="rounded-[var(--radius-card)] border border-[color:var(--color-amber-source-a25)] bg-[color:var(--color-amber-source-a06)] px-3 py-2.5"
        >
          <p className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-amber-source-text-a80)]">
            {t("detail.competing")}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {rivals.map((rival) => (
              <li key={rival.origin.relativePath}>
                <Jump onClick={() => onSelect(rival.origin.relativePath)}>
                  {t("detail.sameName", { source: rival.origin.source })}
                </Jump>
              </li>
            ))}
            {overlaps.map(({ other, shared }) => (
              <li key={other.origin.relativePath}>
                <Jump onClick={() => onSelect(other.origin.relativePath)}>
                  {t("detail.sharedTrigger", {
                    name: other.name,
                    words: shared.slice(0, 4).join(" · "),
                  })}
                </Jump>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SkillProcessRail process={skill.process} openStepIds={openStepIds} onToggleStep={onToggleStep} />

      <button
        type="button"
        data-testid="skill-load-chain-toggle"
        aria-expanded={loadChainOpen}
        onClick={() => setLoadChainOpen((open) => !open)}
        className={controlClass({ shape: "link", size: "lg", tone: "muted", className: "self-start" })}
      >
        {loadChainOpen ? t("detail.hideLoadChain") : t("detail.showLoadChain")}
      </button>
      {loadChainOpen ? <SkillInvocationChain skill={skill} /> : null}
      {/* 하단에 경로 한 줄이 더 있었는데 지웠다(2026-08-12 실측) — 2단 「뜨면
          실려요」의 경로와 **바이트 동일**한 문자열이 라벨 없이 136px 아래에 한 번
          더, 그보다 작은 9.5px 로 떠 있었다. 같은 사실을 라벨 없이 두 번 말하는
          것은 정보가 아니다. */}
    </article>
  );
}

function Jump({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      data-testid="skill-jump"
      onClick={onClick}
      className={controlClass({
        shape: "link",
        size: "sm",
        className: "text-left text-body text-[color:var(--color-amber-source-text-a80)]",
      })}
    >
      {children}
    </button>
  );
}
