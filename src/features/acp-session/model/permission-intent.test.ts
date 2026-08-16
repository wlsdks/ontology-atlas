import { describe, expect, it } from 'vitest';

import { permissionIntent } from './permission-intent';

/**
 * 권한 카드는 **어디**만이 아니라 **무엇을 하려는지**도 말해야 한다.
 *
 * ## 왜 (2026-08-17 실측)
 *
 * 카드가 경로를 mono 로 크게 보여 주는데, 읽으려는 건지 고치려는 건지 지우려는
 * 건지는 어디에도 없었다. `/etc/hosts` **를 읽겠다**와 `/etc/hosts` **를
 * 고치겠다**는 완전히 다른 결정인데 화면이 똑같았다.
 *
 * 값은 오고 있었다 — `toolKind` 가 요청에 실려 오고, 그 필드 주석이 직접
 * *"화면이 아이콘/색을 고르는 타입 있는 사실"* 이라고 적어 뒀다. 화면이 안
 * 쓰고 있었을 뿐이다.
 *
 * ## 모르면 모른다고 한다
 *
 * 어댑터마다 종류 이름이 다르고 안 줄 수도 있다. 그때 「읽기」라고 짐작하면
 * **가장 위험한 쪽으로 틀린다** — 사람이 안심하고 허용한다. 모르면 모른다고
 * 하고, 판단은 경로와 도구 이름에 맡긴다.
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
    // ACP 어댑터들이 실제로 쓰는 변종. 지어낸 게 아니라 표를 넓힌 것이다.
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
    // 어댑터가 분류를 못 한 것과 「읽기」는 다른 말이다.
    expect(permissionIntent('other')).toBe('unknown');
  });
});
