import type { SkillParityRow } from './skill-parity';

/**
 * A sentence handing diverged copies to an agent, not a shell command: the CLI's location on
 * this machine is unknown (`.claude/rules/surfaces.md` forbids dead guidance), and which copy is
 * newer takes reading, so the agent fixes and no automatic merge runs. It names each diverged
 * skill, with absolute paths, because the receiving session's cwd may be another folder and a
 * relative path could edit a different file with the same name.
 */
export function buildSkillParityHandoff(
  rows: SkillParityRow[],
  vaultRootPath: string,
): string {
  if (rows.length === 0) return '';
  const lines = rows.map((row) => {
    const where =
      row.verdict === 'diverged'
        ? row.files.length > 0
          ? row.files.join(', ')
          : 'SKILL.md'
        : `only in ${row.presentIn[0] ?? '?'}`;
    return `- ${row.name} — ${where}`;
  });
  return [
    '.claude/skills 와 .agents/skills 의 사본이 갈렸습니다.',
    '아래 스킬의 두 사본을 열어 비교하고, 내용을 읽어 어느 쪽이 최신인지 판단한 뒤 맞춰 주세요.',
    '어느 쪽을 정본으로 삼을지 확신이 서지 않으면 고치지 말고 먼저 물어봐 주세요.',
    '',
    ...lines,
    '',
    `두 경로: ${vaultRootPath}/.claude/skills/<이름>/ · ${vaultRootPath}/.agents/skills/<이름>/`,
  ].join('\n');
}
