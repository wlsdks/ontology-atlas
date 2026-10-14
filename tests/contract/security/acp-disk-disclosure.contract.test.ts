import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import en from '../../../messages/en.json';
import ko from '../../../messages/ko.json';
import { readAcpRust } from '../../helpers/read-acp-rust';

/**
 * While the app symlinks the user's credential file the screen must say so. Checks the disclosure
 * copy exists in both locales and is rendered, not its wording; releases itself when the link code
 * is gone.
 */

const PANEL = 'src/widgets/app-settings-menu/ui/AcpRuntimeSettings.tsx';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Is the code that actually creates the credential link alive? */
function linksCredentials(source: string): boolean {
  // Look at the **call site**, not the declaration — a declaration nobody calls does
  // nothing to disk.
  return /link_credentials\(&source, &link\)/.test(source);
}

describe('자격증명에 링크를 거는 한 화면이 그것을 말한다', () => {
  const acp = readAcpRust(process.cwd());

  it('검사가 헛돌고 있지 않다 — 볼 파일과 볼 표식이 실재한다', () => {
    expect(acp.length).toBeGreaterThan(1000);
    expect(acp).toContain('fn link_credentials');
  });

  it('링크를 걸면 두 로케일에 알림 문구가 있다', () => {
    if (!linksCredentials(acp)) return; // No link means nothing to disclose
    for (const [locale, messages] of [
      ['ko', ko],
      ['en', en],
    ] as const) {
      const runtimes = (messages as { nav: { settingsMenu: { runtimes: Record<string, unknown> } } })
        .nav.settingsMenu.runtimes;
      const note = runtimes.diskNote;
      expect(typeof note, `${locale}: diskNote 가 없다`).toBe('string');
      expect(String(note).trim().length).toBeGreaterThan(30);
    }
  });

  it('그 문구를 화면이 실제로 그린다 — 있기만 하고 안 그리면 알린 것이 아니다', () => {
    if (!linksCredentials(acp)) return;
    const panel = read(PANEL);
    expect(panel).toContain("t('diskNote')");
    expect(panel).toContain('app-settings-runtimes-disk-note');
  });

  it('링크 코드가 사라지면 이 검사도 같이 풀린다 — 죽은 요구를 남기지 않는다', () => {
    expect(linksCredentials('fn nothing() {}')).toBe(false);
    expect(linksCredentials(acp)).toBe(true);
  });
});
