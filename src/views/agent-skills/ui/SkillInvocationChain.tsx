"use client";

import { useTranslations } from "next-intl";

import type { AgentSkill } from "@/entities/agent-skill";

/**
 * **호출하면 무슨 일이 일어나나** — 이 화면이 존재하는 이유.
 *
 * 스킬 «목록»은 Finder 로도 본다. 볼 수 없던 것은 *발동했을 때 무엇이 어떤
 * 순서로 열리고 그중 무엇이 실행되는가* 이고, 규격이 정한 3단이 그대로 시각
 * 위계가 된다:
 *
 * 1. **항상** — `description` 은 스킬을 한 번도 안 써도 매 세션 실린다.
 * 2. **발동하면** — 본문이 실린다.
 * 3. **필요하면** — 본문이 가리킨 파일이 열리고, 그중 일부는 **돌아간다**.
 *
 * 3단의 「돌아간다」를 따로 세우는 것이 이 컴포넌트의 판단이다. 읽기와 실행은
 * 다른 일인데 규격 문서에서는 같은 「bundled resources」 한 덩어리로 보인다.
 *
 * ⚠️ **위험도를 매기지 않는다.** 빨강/노랑 배지도, 점수도 없다 — 그 축은 보안
 * 스캐너의 것이고 우리가 거기서 이길 것이 없다(2026-08-09 원장). 여기서 하는
 * 일은 판정이 아니라 **보이게 하는 것**이다.
 */
export function SkillInvocationChain({ skill }: { skill: AgentSkill }) {
  const t = useTranslations("agentSkills");
  const [always, onTrigger, onDemand] = skill.invocation.steps;
  const executables = new Set(skill.invocation.executables);
  // 딸린 파일은 **스킬 폴더 기준으로 줄여 보여 준다.**
  // 마켓플레이스 설치본의 전체 경로는 `plugins/cache/<플러그인>/<버전>/skills/<이름>/`
  // 까지가 세 줄 내내 똑같아서, 정작 읽어야 할 `scripts/render.py` 가 그 뒤에
  // 묻힌다. 앞자리는 이미 행 머리의 출처 이름이 말했고, 전체 경로가 필요한
  // 사람에게는 2단이 SKILL.md 의 전체 경로를 그대로 보여 준다.
  const skillDir = skill.origin.relativePath.replace(/\/SKILL\.md$/, "");
  const shorten = (file: string) =>
    file.startsWith(`${skillDir}/`) ? file.slice(skillDir.length + 1) : file;

  return (
    <ol className="flex flex-col gap-2" data-testid="skill-invocation-chain">
      <Rung index={1} title={t("chain.always")} note={t("chain.chars", { count: always.chars })}>
        <p className="text-body leading-prose text-[color:var(--color-text-secondary)]">
          {skill.description}
        </p>
      </Rung>

      <Rung
        index={2}
        title={t("chain.onTrigger")}
        note={t("chain.chars", { count: onTrigger.chars })}
      >
        <p className="text-label leading-prose text-[color:var(--color-text-tertiary)]">
          {onTrigger.files[0]}
        </p>
      </Rung>

      <Rung
        index={3}
        title={t("chain.onDemand")}
        note={t("chain.fileCount", { count: onDemand.files.length })}
      >
        {onDemand.files.length === 0 ? (
          <p className="text-label leading-prose text-[color:var(--color-text-tertiary)]">
            {t("chain.noFiles")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {onDemand.files.map((file) => {
              const runs = executables.has(file);
              const missing = skill.missingBundled.includes(file);
              return (
                <li key={file} className="flex items-baseline gap-2">
                  <span
                    className={
                      missing
                        ? "text-label leading-prose text-[color:var(--color-danger-text)] line-through"
                        : "text-label leading-prose text-[color:var(--color-text-secondary)]"
                    }
                  >
                    {shorten(file)}
                  </span>
                  {runs ? (
                    <span
                      data-testid="skill-executable-mark"
                      // 「돌아간다」는 사실 자체가 정보다 — 경고가 아니라 분류이므로
                      // 위험색이 아니라 강조 없는 라벨로 둔다.
                      className="shrink-0 rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] px-1.5 text-caption text-[color:var(--color-text-tertiary)]"
                    >
                      {t("chain.runs")}
                    </span>
                  ) : null}
                  {missing ? (
                    <span className="shrink-0 text-caption text-[color:var(--color-danger-text)]">
                      {t("chain.missing")}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Rung>
    </ol>
  );
}

function Rung({
  index,
  title,
  note,
  children,
}: {
  index: number;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <li className="rounded-[var(--radius-card)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          <span className="mr-1.5 text-[color:var(--color-text-tertiary)]">{index}</span>
          {title}
        </p>
        <p className="shrink-0 text-caption text-[color:var(--color-text-tertiary)]">{note}</p>
      </div>
      <div className="mt-1.5">{children}</div>
    </li>
  );
}
