import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **낡은 ACP 레지스트리로 릴리스가 나가지 않는가.**
 *
 * ## 왜 생겼나 (2026-08-20 정식 공개 전 검수)
 *
 * `pnpm acp:registry:check` 는 **전부터 있었다.** 그런데 CI 에도 git 훅에도
 * 없어서 **아무도 부르지 않았다.** 그 사이 스냅샷이 조용히 뒤처졌고, 실측하니
 * 상류보다 **9개 패키지**가 낡아 있었다 — 그중 둘이 우리가 실제로 띄우는
 * 어댑터였다(`claude-agent-acp` 0.69.0→0.70.0 · `codex-acp` 1.4.0→1.6.2).
 *
 * **있는데 안 도는 게이트는 없는 것보다 나쁘다** — 헛된 안심을 준다. 이 저장소가
 * 2026-08 에 릴리스를 하나 잃은 것도 같은 모양이었다(마커가 컴포넌트보다 오래
 * 살아남은 스모크 게이트).
 *
 * ## 왜 매 PR 이 아니라 릴리스인가
 *
 * 이 검사는 **상류가 배포할 때** 빨개진다. PR 게이트로 걸면 남의 변경이 우리
 * PR 을 무작위로 막고, 그러면 규칙이 아니라 소음이 된다 — 이 저장소가 lint 룰에
 * 대해 이미 정해 둔 규율과 같다("한 PR 로 다 못 고칠 만큼 많으면 그 룰은 규칙이
 * 아니라 경고 소음이 된다"). 릴리스는 손으로 시작하는 일이라, 거기서 묻는 것이
 * 정확히 「낡은 것을 내보내지 않는다」만 막는다.
 *
 * ## 이 검사가 지키는 것
 *
 * 스냅샷이 최신인지는 **여기서 안 본다**(그건 네트워크가 필요하고, 이 저장소의
 * CI 는 밖으로 안 나간다). 여기서 지키는 것은 **그 질문을 던지는 자리가 릴리스
 * 경로에 실제로 남아 있는가** 하나다.
 */

const repoRoot = path.resolve(__dirname, '..', '..');
const workflow = readFileSync(
  path.join(repoRoot, '.github', 'workflows', 'release-macos.yml'),
  'utf8',
);

/**
 * 실제로 **실행되는** 줄만 남긴다 — 주석(`#`)은 버린다.
 *
 * ⚠️ **첫 판은 가짜 게이트였다** (같은 날, 프로브가 잡았다). 파일 전체에서
 * 문자열을 찾았는데, 이 워크플로의 **주석에도** 그 명령 이름이 적혀 있어서
 * (왜 이 스텝이 있는지 설명하느라) **스텝을 지워도 검사가 통과했다.**
 * 검사가 재는 것은 「어딘가 그 글자가 있는가」가 아니라 「그것이 실행되는가」다.
 */
const executableLines = workflow
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n');
const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
) as { scripts?: Record<string, string> };

describe('릴리스 전 ACP 레지스트리 신선도', () => {
  it('검사 스크립트가 실재한다', () => {
    expect(manifest.scripts?.['acp:registry:check']).toBeDefined();
    // `--check` 없이 등록돼 있으면 검사가 아니라 **덮어쓰기**다 — 릴리스
    // 경로에서 그것을 돌리면 조용히 갱신하고 통과해 버린다.
    expect(manifest.scripts?.['acp:registry:check']).toContain('--check');
  });

  it('릴리스 워크플로가 그 검사를 실제로 부른다', () => {
    expect(
      /run:\s*pnpm acp:registry:check/.test(executableLines),
      '릴리스 경로에서 레지스트리 신선도를 아무도 묻지 않는다 — ' +
        '이 스크립트는 한때 존재만 하고 아무도 안 불렀고, 그 사이 9개가 낡았다',
    ).toBe(true);
  });

  it('빌드보다 **먼저** 묻는다 — 다 만들고 나서 물으면 시간을 버린다', () => {
    const checkAt = executableLines.search(/run:\s*pnpm acp:registry:check/);
    const buildAt = executableLines.indexOf('build-macos:');
    expect(checkAt).toBeGreaterThan(-1);
    expect(buildAt).toBeGreaterThan(-1);
    expect(checkAt, '신선도 검사가 빌드 잡보다 뒤에 있다').toBeLessThan(buildAt);
  });

  it('검사기가 헛돌지 않는다 — 워크플로를 실제로 읽어 왔다', () => {
    // 파일을 못 읽거나 경로가 바뀌면 위 시험들이 전부 조용히 통과할 수 있다.
    expect(executableLines).toContain('admit-release:');
    expect(executableLines.length).toBeGreaterThan(2000);
    // 주석을 걷어내고도 내용이 남아야 한다 — 필터가 과하게 먹으면 위 시험들이
    // 전부 조용히 통과하는 쪽으로 무너진다.
    expect(executableLines).toContain('pnpm desktop:release-tag');
  });
});
