import type { SkillParityRow } from './skill-parity';

/**
 * 어긋난 사본을 **에이전트에게 넘기는 문장.**
 *
 * ## 왜 셸 명령이 아닌가
 *
 * 두 가지 이유가 있고 둘 다 이 저장소가 이미 실측으로 배운 것이다.
 *
 * **① 실행되지 않는 명령은 안내가 아니라 거짓말이다.** `ontology-atlas <cmd>`
 * 방언은 레지스트리에 없어 404 이고, 살아있는 채널은 앱 번들과 소스 체크아웃
 * 둘뿐이다(`surfaces.md` 「배포 채널은 둘뿐이다」). 그런데 스킬 트리가 사는
 * 볼트 루트와 Atlas CLI 체크아웃은 **일반적으로 다른 경로**다 — 우리는 이
 * 컴퓨터의 CLI 가 어디 있는지 모른다. 모르는 경로를 아는 척 적으면 그게 정확히
 * 그 규칙이 막으려던 죽은 안내가 된다.
 *
 * **② 이 일은 애초에 명령으로 안 끝난다.** 어느 사본이 최신인지는 파일이
 * 모르고 **내용을 읽어야 안다.** 자동 병합은 어제 배운 규율을 조용히 지울 수
 * 있어 카운슬이 OUT 으로 잘랐다. 그래서 넘기는 것은 판단이 필요한 일이고,
 * 판단하는 쪽은 에이전트다 — 사람은 판정하고 에이전트가 고친다.
 *
 * ## 복사되는 값은 화면이 말한 사실과 붙어 있다
 *
 * 화면이 "3건 어긋남" 이라 말하면 문장도 **그 3건을 이름으로** 싣는다. 요약만
 * 복사하면 받는 쪽이 어디를 열어야 할지 모르고, 그건 사실과 분리된 복사다.
 *
 * ## 경로는 절대 경로여야 한다
 *
 * 붙여넣는 쪽은 대개 **다른 창의 에이전트 세션**이고, 그 세션의 작업 디렉터리가
 * 이 볼트라는 보장이 없다. 상대 경로만 주면 그 세션은 자기 cwd 기준으로 엉뚱한
 * 곳을 열고, 없다고 답하거나 — 더 나쁘게 — 같은 이름의 다른 파일을 고친다.
 * 우리는 절대 경로를 **이미 알고 있다**(데스크톱 브리지가 그것으로 읽었다).
 * 아는 것을 안 싣는 것은 정직의 문제가 아니라 게으름이다.
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
