import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installExternalLinkOpener, isExternalHttpUrl } from './tauri-external-link';

/**
 * 밖으로 나가는 링크가 **실제로 열리는가.**
 *
 * 2026-08-20 워크스루에서 잡힌 결함이다: 앱 안의 `<a target="_blank">` 는 아무
 * 일도 안 했다. 도구가 하나도 없는 사람에게 준 유일한 다음 걸음(「↗ 설치 방법」)
 * 이 **아무 소리 없이** 죽어 있었고, 아무 에러도 안 났다.
 *
 * 그래서 여기서 재는 것은 「함수가 있는가」가 아니라 **「클릭이 실제로 밖으로
 * 나가는가」** 다.
 */

const invoke = vi.fn();
let tauri = true;

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => tauri,
  invoke: (...args: unknown[]) => invoke(...args),
}));

function anchor(href: string, target = '_blank'): HTMLAnchorElement {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  if (target) a.setAttribute('target', target);
  a.textContent = '설치 방법';
  document.body.append(a);
  return a;
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  tauri = true;
  document.body.innerHTML = '';
});

describe('밖으로 나가는 링크', () => {
  it('앱에서는 클릭을 가로채 OS 로 넘긴다', () => {
    const remove = installExternalLinkOpener();
    const link = anchor('https://example.com/install');

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(invoke).toHaveBeenCalledWith('open_external_url', {
      url: 'https://example.com/install',
    });
    // 기본 동작을 막아야 한다 — 안 막으면 WebView 가 그 주소로 **떠나** 버린다.
    expect(event.defaultPrevented).toBe(true);
    remove();
  });

  it('링크 안쪽 글자를 눌러도 열린다', () => {
    const remove = installExternalLinkOpener();
    const link = anchor('https://example.com/x');
    const inner = document.createElement('span');
    link.append(inner);

    inner.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(invoke).toHaveBeenCalledTimes(1);
    remove();
  });

  it('웹에서는 아예 붙지 않는다 — 브라우저가 이미 연다', () => {
    tauri = false;
    const remove = installExternalLinkOpener();
    const link = anchor('https://example.com/x');

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(invoke).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    remove();
  });

  it('앱 안 이동은 건드리지 않는다', () => {
    const remove = installExternalLinkOpener();
    for (const href of ['/ko/topology/', '#section', 'mailto:a@b.c']) {
      const link = anchor(href, '');
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(event);
      expect(event.defaultPrevented, `${href} 를 가로챘다`).toBe(false);
    }
    expect(invoke).not.toHaveBeenCalled();
    remove();
  });

  it('떼면 더는 안 듣는다', () => {
    const remove = installExternalLinkOpener();
    remove();
    anchor('https://example.com/x').dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it('http/https 만 밖으로 나간다 — 허용 목록이지 금지 목록이 아니다', () => {
    expect(isExternalHttpUrl('https://example.com')).toBe(true);
    expect(isExternalHttpUrl('http://example.com')).toBe(true);
    for (const bad of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,x',
      'ftp://example.com',
      '/ko/topology/',
      'https://exa mple.com',
    ]) {
      expect(isExternalHttpUrl(bad), `${bad} 를 열려고 한다`).toBe(false);
    }
  });
});
