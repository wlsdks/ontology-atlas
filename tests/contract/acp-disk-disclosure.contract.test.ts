import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

/**
 * **As long as the app symlinks the user's credential file**, the screen must say so.
 *
 * **Why** (2026-08-17). Starting a conversation makes Rust create a per-tool config
 * folder inside app data and symlink it to the user's real credential file
 * (`~/.claude/.credentials.json`). That design is correct: isolating it breaks login
 * (measured: `Authentication required`), and **copying** a secret into the app folder
 * is the kind of thing the trust charter forbids, so a symlink is the answer in
 * between.
 *
 * But **no screen said so.** The API-key section right beside it explains in two
 * sentences where the key is kept. Silence from the side that touches the real
 * credential file is inconsistent — the charter promises "nothing happens without the
 * user knowing", not "we do nothing bad".
 *
 * **What is checked**: if the code that creates the link exists, then the disclosure
 * copy exists in both locales and the screen actually renders it — **referential
 * integrity**.
 *
 * **What is not checked**: the **sentences** of that copy. Sentences a human wrote are
 * not pinned (`.claude/rules/documentation.md`) — the wording may be edited or
 * translated freely. What is locked is *whether it says something*, not *what it
 * says*.
 *
 * So this check **releases itself when the link code disappears.** With no link there
 * is nothing to disclose, and then it requires no copy.
 */

const ACP_RS = 'src-tauri/src/acp.rs';
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
  const acp = read(ACP_RS);

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
