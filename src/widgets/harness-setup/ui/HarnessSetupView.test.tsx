import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import { scanHarness, type HarnessReport, type HarnessScanPort } from '@/entities/agent-files';

import { HarnessSetupView } from './HarnessSetupView';

const FILES: Record<string, string> = {
  'AGENTS.md': '# repo\n',
  '.claude/rules/api.md': '# api\n',
  '.claude/settings.json': JSON.stringify({
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '.claude/hooks/gone.sh' }] }] },
  }),
};

function port(): HarnessScanPort {
  const paths = Object.keys(FILES);
  return {
    async listDir(dir) {
      const prefix = dir ? `${dir}/` : '';
      const names = new Map<string, 'file' | 'directory'>();
      for (const path of paths) {
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        const slash = rest.indexOf('/');
        names.set(slash === -1 ? rest : rest.slice(0, slash), slash === -1 ? 'file' : 'directory');
      }
      return names.size > 0 ? [...names].map(([name, kind]) => ({ name, kind })) : null;
    },
    async readText(path) {
      const text = FILES[path];
      return text === undefined ? null : { text, lastModified: null };
    },
  };
}

let report: HarnessReport;
const scrolled = vi.fn();
const originalMatchMedia = window.matchMedia;

beforeEach(async () => {
  report = await scanHarness(port());
  scrolled.mockClear();
  Element.prototype.scrollIntoView = scrolled;
  /* A desktop-wide slot, so the view lays out three panes and takes its reveal branches. */
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
  window.matchMedia = ((query: string) => ({ ...originalMatchMedia(query), matches: true })) as typeof window.matchMedia;
});

afterEach(() => {
  vi.restoreAllMocks();
  window.matchMedia = originalMatchMedia;
});

const itemsTitle = () => document.getElementById('harness-items-title')?.textContent ?? '';

function renderView(props: { initialCategory?: string; reveal?: boolean }) {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <HarnessSetupView report={report} sourceRoot="~/repo" {...props} />
    </NextIntlClientProvider>,
  );
}

describe('HarnessSetupView', () => {
  it('opens on the problem by default, and on the named category when one is given', () => {
    const { unmount } = renderView({});
    expect(itemsTitle()).toContain(koMessages.harness.groups.blockingHooks);
    unmount();
    renderView({ initialCategory: 'context:instructions' });
    expect(itemsTitle()).toContain(koMessages.harness.groups.instructions);
  });

  it('scrolls the chosen row into view and focuses the problem row it shows', async () => {
    renderView({ initialCategory: 'context:instructions' });
    expect(screen.getByTestId('harness-setup').dataset.harnessLayout).toBe('three');
    expect(scrolled).toHaveBeenCalled();
    fireEvent.click(document.querySelector('[data-harness-problem]')!);
    await act(() => new Promise((done) => requestAnimationFrame(() => done(undefined))));
    expect(document.activeElement?.getAttribute('data-option-key')).toBeTruthy();
  });

  it('with reveal off, neither scrolls its host page nor moves focus', async () => {
    renderView({ initialCategory: 'context:instructions', reveal: false });
    const before = document.activeElement;
    fireEvent.click(document.querySelector('[data-harness-problem]')!);
    await act(() => new Promise((done) => requestAnimationFrame(() => done(undefined))));
    expect(scrolled).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(before);
    expect(itemsTitle()).toContain(koMessages.harness.groups.blockingHooks);
  });
});
