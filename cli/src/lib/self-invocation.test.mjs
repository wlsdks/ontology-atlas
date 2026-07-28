// `init` 이 화면에 찍는 명령은 **붙여 넣으면 실제로 돌아야 한다**.
//
// 2026-07-28 도그푸딩 실측: 「Next steps」가 `ontology-atlas list` 를 안내했고,
// 그대로 실행하면 `command not found` (exit 127) 였다. 그 이름은 레지스트리에
// 없고 앞으로도 없다(`docs/DECISIONS.md` 2026-07-27). 더 이상한 것은 **같은
// `init` 이 만드는 README 는 옳게 적혀 있었다**는 점이다 — 생성물과 생성 도구
// 자신의 안내가 서로 다른 규칙을 따르고 있었다.
//
// 왜 여기서 잡나: 기존 `npm-channel-retired` 계약은 마크다운·YAML 같은 **파일**
// 을 훑는다. 이 위반은 파일이 아니라 **런타임 stdout** 에 살아서 그 게이트의
// 사정거리 밖이었다. 그래서 실제로 프로세스를 돌려 나온 글자를 본다.

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cliCommand, cliInvocation, shellQuoteIfNeeded } from './self-invocation.mjs';

const CLI_ENTRY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'index.mjs',
);

/** ANSI 색을 벗겨 순수 글자만 본다 — 판정은 색이 아니라 명령이다. */
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\[[0-9;]*m/g, '');
}

test('cliInvocation 은 실행 가능한 자기 호출을 절대 경로로 준다', () => {
  const invocation = cliInvocation({ argv: ['/usr/bin/node', '/abs/cli/src/index.mjs'] });
  assert.equal(invocation, 'node /abs/cli/src/index.mjs');
});

test('공백 든 경로만 따옴표로 감싼다', () => {
  assert.equal(shellQuoteIfNeeded('/plain/path.mjs'), '/plain/path.mjs');
  assert.equal(shellQuoteIfNeeded('/with space/path.mjs'), "'/with space/path.mjs'");
});

test('argv 가 없으면 체크아웃 상대 경로로 물러선다', () => {
  assert.equal(cliInvocation({ argv: ['node'] }), 'node cli/src/index.mjs');
});

test('cliCommand 는 자기 호출 뒤에 하위 명령을 이어 붙인다', () => {
  // 실행 주체가 무엇이든(테스트 러너면 그 파일) 접두사는 `cliInvocation` 이고
  // 뒤에 인자가 붙는다 — 그 결합만 본다.
  assert.equal(cliCommand('list'), `${cliInvocation()} list`);
  assert.equal(cliCommand('add', 'capability'), `${cliInvocation()} add capability`);
});

// 이것이 결함의 정확한 재현이다 — 안내된 줄을 **그대로 실행**해서 성공하는지 본다.
test('init 이 안내하는 명령을 그대로 실행하면 실제로 돈다', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'oatlas-init-'));
  try {
    const stdout = stripAnsi(
      execFileSync(process.execPath, [CLI_ENTRY, 'init', dir], { encoding: 'utf8' }),
    );

    // 「Next steps」 블록의 실행용 줄에는 죽은 이름이 없어야 한다.
    const nextSteps = stdout.slice(stdout.indexOf('Next steps:'));
    assert.equal(
      /(^|\s)ontology-atlas (list|validate|mcp-verify|add|find|analyze|bootstrap)/.test(nextSteps),
      false,
      `죽은 명령이 Next steps 에 남아 있다:\n${nextSteps}`,
    );

    // 안내된 첫 명령을 문자열에서 뽑아 그대로 실행한다.
    const listLine = nextSteps
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.endsWith('list') || line.includes('index.mjs list'));
    assert.ok(listLine, `안내에서 list 명령 줄을 못 찾았다:\n${nextSteps}`);

    const command = listLine.split('#')[0].trim();
    const args = command.split(/\s+/).slice(1); // `node` 를 뺀 나머지
    const listed = execFileSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
    assert.match(stripAnsi(listed), /example-capability/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
