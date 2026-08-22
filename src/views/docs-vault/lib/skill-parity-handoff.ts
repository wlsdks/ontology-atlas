import type { SkillParityRow } from './skill-parity';

/**
 * **The sentence that hands diverged copies to an agent.**
 *
 * **Why not a shell command.** Two reasons, both already learned here by measurement.
 *
 * **① A command that will not run is a lie, not guidance.** The `ontology-atlas <cmd>` dialect is
 * not in the registry and 404s; the live channels are the app bundle and a source checkout only
 * (`.claude/rules/surfaces.md`). But the vault root where the skill trees live and the Atlas CLI
 * checkout are **generally different paths** — we do not know where the CLI is on this machine.
 * Writing an unknown path as if we knew it is exactly the dead guidance that rule exists to stop.
 *
 * **② This job does not end with a command anyway.** Which copy is newer is something the files do
 * not know and **only reading the contents reveals**. Automatic merging can silently erase a
 * discipline learned yesterday, so the council ruled it OUT. What is handed over is work needing
 * judgement, and the side that judges is the agent — the person decides, the agent fixes.
 *
 * **The copied value is attached to the fact the screen stated.** When the screen says "3
 * diverged", the sentence carries **those 3 by name**. Copying only the summary leaves the
 * receiver not knowing what to open, which is a copy detached from the fact.
 *
 * **Paths must be absolute.** Whoever pastes this is usually **an agent session in another
 * window**, and there is no guarantee its working directory is this vault. Given only relative
 * paths, that session opens the wrong place against its own cwd and either reports nothing there
 * or — worse — edits a different file with the same name. We **already know** the absolute path
 * (the desktop bridge read with it). Withholding what we know is laziness, not honesty.
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
