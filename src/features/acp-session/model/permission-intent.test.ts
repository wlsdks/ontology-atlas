import { describe, expect, it } from 'vitest';

import { permissionIntent } from './permission-intent';

/**
 * The permission card must state not only **where** but **what it means to do.**
 *
 * ## Why (measured 2026-08-17)
 *
 * The card showed the path large and in mono, but whether it meant to read, edit, or delete was
 * nowhere. **Reading** `/etc/hosts` and **editing** `/etc/hosts` are entirely different decisions, and
 * the screen looked identical.
 *
 * The value was arriving — `toolKind` comes with the request, and that field's own comment says it is
 * *"the typed fact the screen picks its icon and colour from"*. The screen simply was not using it.
 *
 * ## Unknown is stated as unknown
 *
 * The kind names differ per adapter and may not be sent. Guessing "read" then **errs toward the most
 * dangerous side** — a person allows it with confidence. Unknown is stated as unknown, and the
 * judgement is left to the path and the tool name.
 */

describe('무엇을 하려는지 말한다', () => {
  it('고치는 것과 읽는 것을 가른다', () => {
    expect(permissionIntent('read')).toBe('read');
    expect(permissionIntent('edit')).toBe('edit');
  });

  it('지우는 것은 따로 센다 — 되돌리기가 가장 비싸다', () => {
    expect(permissionIntent('delete')).toBe('delete');
  });

  it('실행은 따로 센다 — 파일을 건드리는 것과 다른 종류의 허락이다', () => {
    expect(permissionIntent('execute')).toBe('execute');
  });

  it('대소문자와 앞뒤 공백에 흔들리지 않는다', () => {
    expect(permissionIntent(' Edit ')).toBe('edit');
    expect(permissionIntent('DELETE')).toBe('delete');
  });

  it('어댑터가 다른 낱말을 써도 같은 뜻이면 같이 읽는다', () => {
    // Variants the ACP adapters actually use. Not invented — the table was widened from measurement.
    expect(permissionIntent('write')).toBe('edit');
    expect(permissionIntent('move')).toBe('edit');
    expect(permissionIntent('fetch')).toBe('read');
    expect(permissionIntent('search')).toBe('read');
  });

  it('모르는 것은 **모른다고 한다** — 읽기로 짐작하면 가장 위험한 쪽으로 틀린다', () => {
    expect(permissionIntent('something-new')).toBe('unknown');
    expect(permissionIntent(null)).toBe('unknown');
    expect(permissionIntent(undefined)).toBe('unknown');
    expect(permissionIntent('')).toBe('unknown');
  });

  it('「기타」 갈래를 읽기로 접지 않는다', () => {
    // The adapter failing to classify is not the same statement as "read".
    expect(permissionIntent('other')).toBe('unknown');
  });
});
