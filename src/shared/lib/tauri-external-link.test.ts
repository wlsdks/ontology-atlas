import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installExternalLinkOpener, isExternalHttpUrl } from './tauri-external-link';

/**
 * Do outbound links **actually open**?
 *
 * A defect caught in the 2026-08-20 walkthrough: inside the app, `<a
 * target="_blank">` did nothing. The one next step offered to someone with no tools
 * installed (the install-instructions link) was dead **silently**, raising no error.
 *
 * So what this measures is not "does the function exist" but **"does a click actually
 * leave the app"**.
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
    // The default must be prevented, or the WebView **navigates away** to that URL.
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
