import { describe, expect, it } from 'vitest';

import { analyzeAgentFiles as analyzeWeb } from '@/views/docs-vault/lib/agent-files';
import { buildSkillParityModel } from '@/views/docs-vault/lib/skill-parity';
import { analyzeAgentFiles as analyzeCli } from '../../cli/src/lib/agent-files.mjs';
import { CASES as FIXTURE_CASES } from '../fixtures/agent-files-cases.mjs';

/**
 * **화면의 스킬 사본 판정이 CLI 와 같은 사실을 말하는가.**
 *
 * `tests/contract/agent-files.contract.test.ts` 는 두 구현이 같은 **파일 단위
 * finding** 을 내는지 지킨다. 이 파일은 그 위층이다 — 화면이 사람에게 보여
 * 주려고 **스킬 단위로 접은** 결과가 CLI 의 집계와 어긋나지 않는지.
 *
 * 왜 따로 필요한가: 접기는 화면에만 있는 단계라 기존 계약의 사정거리 밖이다.
 * 그런데 사용자가 읽는 숫자는 접힌 쪽이다. "CLI 는 3건이라는데 화면은 2건"
 * 이면 둘 중 하나는 거짓말이고, 그때 신뢰를 잃는 것은 **화면**이다.
 *
 * 스킬 트리가 없는 케이스(`not-applicable`)에서 모델이 **비어야** 한다는 것도
 * 같은 이유로 잠근다 — 없는 것을 0건 일치로 그리면 확인한 적 없는 것을
 * 확인했다고 주장하게 된다.
 */

interface FixtureCase {
  name: string;
  input: Parameters<typeof analyzeWeb>[0];
}

const CASES = FIXTURE_CASES as unknown as FixtureCase[];

describe('스킬 사본 — 화면의 접기가 CLI 집계와 같은 사실을 말한다', () => {
  it.each(CASES.map((c) => [c.name, c] as const))('%s', (_name, testCase) => {
    const web = analyzeWeb(testCase.input);
    // CLI 는 타입 선언 없는 순수 JS 패키지라 시그니처가 추론으로 좁게 잡힌다.
    const cli = (analyzeCli as unknown as typeof analyzeWeb)(testCase.input);

    // 전제: 두 분석이 같은 사실을 낸다(기존 계약이 지키는 것 — 여기서 재확인).
    expect(web.checks.skillCopy.status).toBe(cli.checks.skillCopy.status);

    const model = buildSkillParityModel(web);

    if (web.checks.skillCopy.status === 'not-applicable') {
      // 스킬 트리가 없으면 보여 줄 줄도 없다.
      expect(model.rows).toEqual([]);
      expect(model.disagreeing).toBe(0);
      return;
    }

    // 접힌 줄 수는 CLI 가 본 스킬 전체(공유 + 한쪽만)와 같아야 한다.
    const cliSkillCount =
      cli.checks.skillCopy.sharedSkills.length +
      cli.checks.skillCopy.claudeOnlySkills.length +
      cli.checks.skillCopy.agentsOnlySkills.length;
    expect(model.rows).toHaveLength(cliSkillCount);

    // 어긋남이 있으면 화면도 어긋남이라 말해야 한다 — 부호가 같아야 한다.
    expect(model.disagreeing > 0).toBe(cli.checks.skillCopy.status === 'drift');

    // 한쪽에만 있는 스킬은 반드시 one-sided 로 접힌다.
    for (const name of [
      ...cli.checks.skillCopy.claudeOnlySkills,
      ...cli.checks.skillCopy.agentsOnlySkills,
    ]) {
      expect(model.rows.find((row) => row.name === name)?.verdict).toBe('one-sided');
    }
  });
});
