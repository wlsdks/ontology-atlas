"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { AgentSkill } from "@/entities/agent-skill";
import { useSkillFolder } from "@/features/agent-skills-local";
import { Button } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";

import { SkillInvocationChain } from "./SkillInvocationChain";

/**
 * 스킬 — **에이전트가 가진 스킬을 사람이 읽는 자리** (2026-08-09 소유자 확정).
 *
 * ## 왜 문서함이 아니라 별도 목적지인가
 *
 * 스킬 파일도 마크다운이라 문서함에 넣고 싶어진다. 그런데 문서함이 답하는 질문은
 * 「이 문서가 지도의 어디에 붙나」이고, 스킬이 답해야 하는 질문은 **「이게 언제
 * 뜨고, 뜨면 무슨 일이 일어나나」** 다. 후자에는 노드도 관계도 없다 — 대신
 * 3단 로드 사슬과 트리거 경쟁이 있다. 같은 화면에 두면 둘 다 흐려진다.
 *
 * ## 이 화면이 하지 않는 것 (전부 의도된 것이다)
 *
 * - **볼트에 쓰지 않는다.** 스킬 파일의 주인은 런타임과 마켓플레이스이고 그
 *   폴더는 대개 git 체크아웃이라 업데이트가 우리 글씨를 덮는다. 남의 `SKILL.md`
 *   에 쓰던 경로는 #1006 에서 이미 막았다.
 * - **`kind:` 를 붙여 온톨로지로 올리지 않는다.** 그러면 진실원이 둘이 된다.
 * - **위험 점수·배지를 내지 않는다.** 그 축은 전용 스캐너의 것이다.
 * - **기억하지 않는다.** 다시 보려면 다시 고른다 — 남의 폴더를 몰래 들고 있지
 *   않는 편이 이 화면에서는 맞다.
 */
export function AgentSkillsPage() {
  const t = useTranslations("agentSkills");
  const { status, inventory, folderName, scan, error, openFolder } = useSkillFolder();
  const [openSkill, setOpenSkill] = useState<string | null>(null);

  return (
    <main
      data-testid="agent-skills-page"
      // 셸이 `h-dvh` 로 뷰포트를 소유하므로 페이지는 `h-full` 로 받고 스크롤은
      // 안에서 처리한다 — 지도·문서함·기록과 같은 문법이다.
      className="flex h-full flex-col overflow-hidden bg-[color:var(--color-canvas)]"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[1100px] flex-1 flex-col gap-4 overflow-y-auto px-4 pt-5 pb-8 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-display text-[color:var(--color-text-primary)]">{t("title")}</h1>
            <p className="mt-1 text-body leading-prose text-[color:var(--color-text-secondary)]">
              {t("subtitle")}
            </p>
          </div>
          <Button
            size="sm"
            variant={inventory ? "outline" : "primary"}
            onClick={() => void openFolder(t("pickerTitle"))}
            data-testid="skills-open-folder"
          >
            {inventory ? t("openAnother") : t("openFolder")}
          </Button>
        </header>

        {status === "unsupported" ? (
          <Notice tone="muted">{t("unsupported")}</Notice>
        ) : null}
        {status === "error" ? <Notice tone="danger">{t("readError", { error: error ?? "" })}</Notice> : null}
        {status === "loading" ? <Notice tone="muted">{t("reading")}</Notice> : null}

        {status === "idle" ? (
          <section className="flex flex-col gap-5 rounded-[var(--radius-panel)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-5 py-6">
            <p className="text-body leading-prose text-[color:var(--color-text-secondary)]">
              {t("emptyBody")}
            </p>

            {/* **이 화면이 왜 필요한지를 먼저 말한다.** 처음 온 사람은 「스킬 목록」
                이라는 말만 듣고는 Finder 로도 되는 일이라고 읽는다 — 여기서만
                답하는 셋을 세워야 열어 볼 이유가 생긴다. */}
            <div>
              <h2 className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                {t("answersTitle")}
              </h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {["answer1", "answer2", "answer3"].map((key) => (
                  <li
                    key={key}
                    className="text-label leading-prose text-[color:var(--color-text-secondary)]"
                  >
                    {t(key)}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                {t("whereTitle")}
              </h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {["emptyHint1", "emptyHint2"].map((key) => (
                  <li
                    key={key}
                    className="text-label leading-prose text-[color:var(--color-text-tertiary)]"
                  >
                    {t(key)}
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-label leading-prose text-[color:var(--color-text-tertiary)]">
              {t("emptyHint3")}
            </p>
          </section>
        ) : null}

        {inventory ? (
          <>
            <section
              data-testid="skills-summary"
              className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-[var(--radius-card)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3"
            >
              <Stat label={t("stat.skills")} value={inventory.totals.skills} />
              <Stat label={t("stat.bundled")} value={inventory.totals.bundledFiles} />
              <Stat label={t("stat.executables")} value={inventory.totals.executables} />
              <p className="text-label text-[color:var(--color-text-tertiary)]">
                {t("stat.folder", { folder: folderName ?? "" })}
              </p>
            </section>

            {/* 상한에 걸렸으면 말한다 — 조용히 자르면 「0건」이 「다 괜찮다」로 읽힌다. */}
            {scan?.truncated ? (
              <Notice tone="muted">{t("truncated", { count: scan.scannedFiles })}</Notice>
            ) : null}

            {inventory.collisions.length > 0 ? (
              <Findings title={t("collisions.title")} hint={t("collisions.hint")}>
                {inventory.collisions.map((collision) => (
                  <li key={collision.name} className="flex flex-col gap-0.5">
                    <p className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                      {collision.name}
                      {collision.descriptionsDiffer ? (
                        <span className="ml-2 text-caption font-normal text-[color:var(--color-text-tertiary)]">
                          {t("collisions.competing")}
                        </span>
                      ) : null}
                    </p>
                    {collision.skills.map((s) => (
                      <p
                        key={s.origin.relativePath}
                        className="text-caption leading-prose text-[color:var(--color-text-tertiary)]"
                      >
                        {s.origin.source} — {s.description}
                      </p>
                    ))}
                  </li>
                ))}
              </Findings>
            ) : null}

            {inventory.overlaps.length > 0 ? (
              <Findings title={t("overlaps.title")} hint={t("overlaps.hint")}>
                {inventory.overlaps.slice(0, 12).map((overlap) => (
                  <li
                    key={`${overlap.a.origin.relativePath}|${overlap.b.origin.relativePath}`}
                    className="text-label leading-prose text-[color:var(--color-text-secondary)]"
                  >
                    <span className="font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                      {overlap.a.name}
                    </span>
                    {" ↔ "}
                    <span className="font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                      {overlap.b.name}
                    </span>
                    <span className="ml-2 text-caption text-[color:var(--color-text-tertiary)]">
                      {overlap.shared.slice(0, 5).join(" · ")}
                    </span>
                  </li>
                ))}
              </Findings>
            ) : null}

            <section className="flex flex-col gap-2">
              <h2 className="text-title text-[color:var(--color-text-primary)]">
                {t("list.title")}
              </h2>
              <ul className="flex flex-col gap-2" data-testid="skills-list">
                {inventory.skills.map((skill) => (
                  <SkillRow
                    key={skill.origin.relativePath}
                    skill={skill}
                    open={openSkill === skill.origin.relativePath}
                    onToggle={() =>
                      setOpenSkill((current) =>
                        current === skill.origin.relativePath ? null : skill.origin.relativePath,
                      )
                    }
                  />
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function SkillRow({
  skill,
  open,
  onToggle,
}: {
  skill: AgentSkill;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("agentSkills");
  return (
    <li className="rounded-[var(--radius-card)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        data-testid="skill-row-toggle"
        // `stacked: true` — 이 행은 카드 안쪽에 통째로 들어앉으므로 자기 모서리를
        // 갖지 않는다(가지면 호버 배경이 카드 안에서 조각조각 둥글어진다).
        className={controlClass({
          shape: "row",
          size: "lg",
          stacked: true,
          className: "flex-col items-start gap-0.5 py-3",
        })}
      >
        <span className="flex w-full flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            {skill.name}
          </span>
          <span className="text-caption text-[color:var(--color-text-tertiary)]">
            {skill.origin.source}
          </span>
          {skill.invocation.executables.length > 0 ? (
            <span className="text-caption text-[color:var(--color-text-tertiary)]">
              {t("list.runsCount", { count: skill.invocation.executables.length })}
            </span>
          ) : null}
        </span>
        <span className="line-clamp-2 text-label leading-prose text-[color:var(--color-text-secondary)]">
          {skill.description}
        </span>
      </button>
      {open ? (
        <div className="border-t border-[color:var(--color-border-soft)] px-4 py-3">
          <SkillInvocationChain skill={skill} />
        </div>
      ) : null}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span className="text-title text-[color:var(--color-text-primary)]">{value}</span>
      <span className="text-label text-[color:var(--color-text-tertiary)]">{label}</span>
    </p>
  );
}

function Findings({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3">
      <h2 className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{title}</h2>
      <p className="mt-0.5 text-caption leading-prose text-[color:var(--color-text-tertiary)]">
        {hint}
      </p>
      <ul className="mt-2.5 flex flex-col gap-2">{children}</ul>
    </section>
  );
}

function Notice({ tone, children }: { tone: "muted" | "danger"; children: React.ReactNode }) {
  return (
    <p
      className={
        tone === "danger"
          ? "rounded-[var(--radius-chip)] border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-3 py-2 text-label leading-prose text-[color:var(--color-danger-text)]"
          : "rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] px-3 py-2 text-label leading-prose text-[color:var(--color-text-tertiary)]"
      }
    >
      {children}
    </p>
  );
}
