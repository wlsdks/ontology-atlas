"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { AgentSkill, SkillInventory } from "@/entities/agent-skill";
import { cn } from "@/shared/lib/cn";
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
  const chainRef = useRef<HTMLDivElement | null>(null);

  /*
   * **「이 스킬은 파일을 돌린다」가 접힘 뒤에 있었다** (2026-08-18 실측).
   *
   * 목록의 행은 `실행 3` 이라고 말하는데, 그 행을 눌러 들어온 상세에는 그 사실이
   * **한 글자도 없다** — 「실행됨」 표시는 3단 사슬 안에 있고 그 사슬은 접혀 있다.
   * 즉 가장 무거운 사실(남의 코드가 내 기계에서 돈다)이 이 화면에서 가장 깊었다.
   *
   * 그래서 머리로 끌어올리되 **누르면 그 근거로 데려간다** — 숫자만 띄우고 어디서
   * 왔는지 못 보게 하면 그건 알림이지 설명이 아니다.
   */
  const runCount = skill.invocation.executables.length;
  const openChain = () => {
    setLoadChainOpen(true);
    requestAnimationFrame(() => {
      chainRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  const rivals = inventory.collisions
    .filter((c) => c.name === skill.name)
    .flatMap((c) => c.skills.filter((s) => s.origin.relativePath !== skill.origin.relativePath));

  /*
   * **이 화면이 여태 말할 수 있던 관계는 「경쟁」뿐이었다** (2026-08-18).
   *
   * 소유자: *"스킬도 그래프처럼 연결되는 걸 보여주고 싶었는데 좀 이상하다"*.
   * 실측이 갈랐다 — 실제 스킬 18개에서 경쟁은 **1개**인데 서로 부르는 관계는
   * **25개**다. 연결이 없어서 안 보인 게 아니라 세는 어휘가 없어서였다.
   *
   * 방향을 둘 다 낸다. 「어디로 넘기나」만으로는 사슬의 절반이고, 사람이
   * 실제로 묻는 것은 *"내가 이걸 고치면 누가 영향받나"* 이기도 하다.
   */
  const handsOffTo = inventory.handoffs.filter(
    (h) => h.from.origin.relativePath === skill.origin.relativePath,
  );
  const handedFrom = inventory.handoffs.filter(
    (h) => h.to.origin.relativePath === skill.origin.relativePath,
  );

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
          data-testid="skill-detail-heading"
          tabIndex={-1}
          className="text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
        >
          {skill.name}
        </h2>
        <p className="text-body text-[color:var(--color-text-tertiary)]">
          {skill.origin.personal ? t("group.mine") : skill.origin.source}
        </p>
        {runCount > 0 ? (
          <button
            type="button"
            data-testid="skill-detail-runs"
            onClick={openChain}
            /*
             * ⚠️ 처음 `size: "sm"` 으로 냈다가 재 보고 고쳤다 — 그 칸은
             * `text-caption`(9.5px) 이라, **누르는 이 표시가 바로 옆의 못 누르는
             * 출처 이름(12.5px)보다 작아졌다.** 이 저장소가 설정 시트에서 두 번
             * 겪은 위계 뒤집힘과 같은 모양이다(2026-08-02 · 08-09 원장).
             * `lg` 는 같은 32px 사다리 칸에 글자만 `text-body` 로 맞춘 자리다.
             */
            className={controlClass({
              shape: "chip",
              size: "lg",
              className: "text-[color:var(--color-text-secondary)]",
            })}
          >
            {t("detail.runsMark", { count: runCount })}
          </button>
        ) : null}
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
                <Jump warn onClick={() => onSelect(rival.origin.relativePath)}>
                  {t("detail.sameName", { source: rival.origin.source })}
                </Jump>
              </li>
            ))}
            {overlaps.map(({ other, shared }) => (
              <li key={other.origin.relativePath}>
                <Jump warn onClick={() => onSelect(other.origin.relativePath)}>
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

      {handsOffTo.length > 0 || handedFrom.length > 0 ? (
        <section
          data-testid="skill-detail-handoffs"
          className="rounded-[var(--radius-card)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5"
        >
          {handsOffTo.length > 0 ? (
            <>
              <p className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                {t("detail.handsOffTitle")}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {handsOffTo.map((h) => (
                  <li key={`to-${h.to.origin.relativePath}`}>
                    <Jump onClick={() => onSelect(h.to.origin.relativePath)}>{h.to.name}</Jump>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {handedFrom.length > 0 ? (
            <>
              <p
                className={cn(
                  "text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]",
                  handsOffTo.length > 0 && "mt-3",
                )}
              >
                {t("detail.handedFromTitle")}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {handedFrom.map((h) => (
                  <li key={`from-${h.from.origin.relativePath}`}>
                    <Jump onClick={() => onSelect(h.from.origin.relativePath)}>{h.from.name}</Jump>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
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
      <div ref={chainRef}>{loadChainOpen ? <SkillInvocationChain skill={skill} /> : null}</div>
      {/* 하단에 경로 한 줄이 더 있었는데 지웠다(2026-08-12 실측) — 2단 「뜨면
          실려요」의 경로와 **바이트 동일**한 문자열이 라벨 없이 136px 아래에 한 번
          더, 그보다 작은 9.5px 로 떠 있었다. 같은 사실을 라벨 없이 두 번 말하는
          것은 정보가 아니다. */}
    </article>
  );
}

/**
 * 다른 스킬로 건너가는 줄.
 *
 * ⚠️ **경고색은 경고에만 쓴다** (2026-08-18, 스크린샷 실측으로 잡음). 이 부품은
 * 「겹쳤어요」 카드에서 태어나 앰버 잉크를 몸에 지니고 있었는데, 넘김 카드가
 * 그대로 가져다 쓰면서 **평범한 이동 링크 7개가 경고 7개로 읽혔다.** 이 화면에서
 * 앰버가 뜻하는 것은 「둘 중 어느 것이 뜰지 모른다」 하나뿐이라, 그 뜻을 이동에
 * 나눠 주면 정작 경고가 눈에 안 들어온다.
 *
 * 그래서 잉크를 **부르는 쪽이 정한다** — 경쟁 카드는 앰버, 넘김 카드는 이 앱의
 * 평범한 글자색. 기본값은 경고가 아닌 쪽이다(기본값이 경고면 같은 사고가 다시 난다).
 */
function Jump({
  onClick,
  warn = false,
  children,
}: {
  onClick: () => void;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid="skill-jump"
      data-tone={warn ? "warn" : "plain"}
      onClick={onClick}
      className={controlClass({
        shape: "link",
        size: "sm",
        hoverInk: "strong",
        className: cn(
          "text-left text-body",
          warn
            ? "text-[color:var(--color-amber-source-text-a80)]"
            : "text-[color:var(--color-text-secondary)]",
        ),
      })}
    >
      {children}
    </button>
  );
}
