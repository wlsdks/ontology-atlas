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

const PANEL = 'src/widgets/app-settings-menu/ui/agent-setup/AcpRuntimeSettings.tsx';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Is the code that actually creates the credential link alive? */
function linksCredentials(source: string): boolean {
  // Look at the **call site**, not the declaration — a declaration nobody calls does
  // nothing to disk.
  return /link_credentials\(&source, &link\)/.test(source);
}

describe('a screen that links to credentials says so', () => {
  const acp = readAcpRust(process.cwd());

  it('the check is not idle, since the files to look at and the markers to look for exist', () => {
    expect(acp.length).toBeGreaterThan(1000);
    expect(acp).toContain('fn link_credentials');
  });

  it('when a link is attached, both locales have the notice wording', () => {
    if (!linksCredentials(acp)) return; // No link means nothing to disclose
    for (const [locale, messages] of [
      ['ko', ko],
      ['en', en],
    ] as const) {
      const runtimes = (messages as { nav: { settingsMenu: { runtimes: Record<string, unknown> } } })
        .nav.settingsMenu.runtimes;
      const note = runtimes.diskNote;
      expect(typeof note, `${locale}: diskNote is missing`).toBe('string');
      expect(String(note).trim().length).toBeGreaterThan(30);
    }
  });

  it('the screen really renders that wording, since having it without drawing it is not telling anyone', () => {
    if (!linksCredentials(acp)) return;
    const panel = read(PANEL);
    expect(panel).toContain("t('diskNote')");
    expect(panel).toContain('app-settings-runtimes-disk-note');
  });

  it('when the link code disappears this check is released with it, leaving no dead requirement', () => {
    expect(linksCredentials('fn nothing() {}')).toBe(false);
    expect(linksCredentials(acp)).toBe(true);
  });
});
