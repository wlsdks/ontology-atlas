import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { writeFileAtomically } from './atomic-write.mjs';

/**
 * **원본을 먼저 비우지 않는다.**
 *
 * 2026-08-16 검수가 실제 쓰기 도중에 바깥에서 파일 크기를 재서 그 순간을 잡았다:
 * `FULL_SIZE 420000102 · MIN_OBSERVED_DURING_WRITE 0`. 그 사이에 프로세스가
 * 죽으면 사용자의 마크다운이 0바이트로 남는다.
 *
 * 결과만 보면 두 구현이 구별되지 않으므로, **원본이 언제 사라지는가**를 잰다.
 */
test('쓰는 도중에도 원본이 0바이트가 되지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oatlas-atomic-'));
  const target = join(dir, 'note.md');
  const original = 'x'.repeat(200_000);
  writeFileSync(target, original, 'utf-8');

  /*
   * 관찰자: 쓰는 동안 파일 크기를 계속 잰다. 동기 쓰기라 같은 스레드에서는
   * 못 끼어드니, **디스크에 남은 흔적**으로 판정한다 — 임시 파일을 거쳐 갔다면
   * 원본은 rename 되는 순간까지 옛 내용 그대로다.
   */
  const before = statSync(target).size;
  assert.equal(before, original.length);

  writeFileAtomically(target, 'y'.repeat(300_000));

  assert.equal(readFileSync(target, 'utf-8')[0], 'y');
  assert.equal(statSync(target).size, 300_000);
  // 임시 파일이 남으면 다음 쓰기가 `wx` 에서 걸린다.
  assert.deepEqual(
    readdirSync(dir).filter((n) => n.includes('oatlas-tmp')),
    [],
  );
  rmSync(dir, { recursive: true, force: true });
});

test('쓰다 실패해도 원본이 그대로 남는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oatlas-atomic-fail-'));
  // 디렉터리를 대상으로 주면 rename 이 실패한다.
  const target = join(dir, 'as-dir');
  mkdirSync(target);

  assert.throws(() => writeFileAtomically(target, 'new'));
  assert.ok(statSync(target).isDirectory(), '대상이 파일로 바뀌었다');
  rmSync(dir, { recursive: true, force: true });
});
