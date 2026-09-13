import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import enMessages from '../../../../messages/en.json';
import { RecentVaultList } from './RecentVaultList';
import { RAIL_LABEL_MAX_CHARS, railLabel } from './VaultSwitchRailTile';

/**
 * **A row must not be a list entry with a name on it.** The owner rejected bare-name lists
 * three times on 2026-09-13 on other screens, and this list is the one place the objection
 * is structural rather than aesthetic: `atlas` and `atlas-old` are indistinguishable by
 * name, and telling them apart is the entire reason the person is looking at this list.
 *
 * The second rule these hold: **a folder that cannot be opened says so before it is
 * pressed.** A stored handle is a claim about the past, and a row that keeps its ordinary
 * look and then fails spends the person's press to report something the probe already knew.
 */

const mocks = vi.hoisted(() => ({
  reachability: vi.fn<() => Record<string, string>>(() => ({})),
}));

vi.mock('../model/use-recent-vault-reachability', () => ({
  useRecentVaultReachability: () => mocks.reachability(),
}));

function record(name: string, extra: Partial<LocalFsHandleRecord> = {}): LocalFsHandleRecord {
  return {
    id: 'current',
    handle: { kind: 'directory', name } as unknown as FileSystemDirectoryHandle,
    desktopRootPath: `/Users/dana/${name}`,
    name,
    createdAt: 1,
    lastAccessedAt: Date.now() - 3 * 60 * 60 * 1000,
    ...extra,
  };
}

function renderList(records: LocalFsHandleRecord[], currentKey: string | null = null) {
  const onOpen = vi.fn();
  const onForget = vi.fn();
  const onLocate = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <RecentVaultList
        records={records}
        currentKey={currentKey}
        busy={false}
        onOpen={onOpen}
        onForget={onForget}
        onLocate={onLocate}
      />
    </NextIntlClientProvider>,
  );
  return { onOpen, onForget, onLocate };
}

describe('RecentVaultList row facts', () => {
  it('states what the folder holds and when it was last open, not only its name', () => {
    mocks.reachability.mockReturnValue({ '/Users/dana/atlas': 'ready' });
    renderList([
      record('atlas', { docCount: 232, conceptCount: 41, countedAt: Date.now() }),
    ]);

    expect(screen.getByText(/232 documents/)).toBeTruthy();
    expect(screen.getByText(/41 concepts/)).toBeTruthy();
    expect(screen.getByText(/opened 3h ago/)).toBeTruthy();
    expect(screen.getByText('/Users/dana/atlas')).toBeTruthy();
  });

  it('says the contents are not counted rather than printing a zero', () => {
    mocks.reachability.mockReturnValue({ '/Users/dana/legacy': 'ready' });
    renderList([record('legacy')]);

    expect(screen.getByText(/Not counted yet/)).toBeTruthy();
    expect(screen.queryByText(/0 documents/)).toBeNull();
  });

  it('carries the same facts in the accessible name', () => {
    // A row whose accessible name is only the folder's name is the bare-name list again for
    // anyone reading by screen reader.
    mocks.reachability.mockReturnValue({ '/Users/dana/atlas': 'ready' });
    renderList([
      record('atlas', { docCount: 232, conceptCount: 41, countedAt: Date.now() }),
    ]);

    const name = screen.getByTestId('recent-vault-open').getAttribute('aria-label') ?? '';
    expect(name).toContain('atlas');
    expect(name).toContain('232 documents');
    expect(name).toContain('opened 3h ago');
  });
});

describe('RecentVaultList reachability', () => {
  it('refuses to make a missing folder pressable, and says why', () => {
    mocks.reachability.mockReturnValue({ '/Users/dana/gone': 'missing' });
    renderList([record('gone')]);

    expect(screen.getByTestId('recent-vault-notice-missing').textContent).toMatch(
      /Not at this path any more/,
    );
    expect(screen.queryByTestId('recent-vault-open')).toBeNull();
    // The action that *is* available on a folder that is gone.
    expect(screen.getByTestId('recent-vault-forget')).toBeTruthy();
  });

  it('refuses a folder whose permission was denied', () => {
    mocks.reachability.mockReturnValue({ '/Users/dana/walled': 'blocked' });
    renderList([record('walled')]);

    expect(screen.getByTestId('recent-vault-notice-blocked')).toBeTruthy();
    expect(screen.queryByTestId('recent-vault-open')).toBeNull();
  });

  it('keeps a folder that will prompt pressable, and warns that it will', () => {
    // The ordinary browser case. Pressing is exactly the gesture that grants permission, so
    // blocking the press would strand the folder - but presenting it as a plain open would
    // hide a dialog the person did not expect.
    mocks.reachability.mockReturnValue({ '/Users/dana/atlas': 'needs-permission' });
    renderList([record('atlas')]);

    expect(screen.getByTestId('recent-vault-open')).toBeTruthy();
    expect(screen.getByTestId('recent-vault-notice-needs-permission').textContent).toMatch(
      /ask for permission/,
    );
  });

  it('says it could not check rather than implying the folder is fine', () => {
    mocks.reachability.mockReturnValue({});
    renderList([record('atlas')]);

    expect(screen.getByTestId('recent-vault-notice-unknown')).toBeTruthy();
    expect(screen.getByTestId('recent-vault-open')).toBeTruthy();
  });

  it('shows no notice at all on a folder that simply opens', () => {
    mocks.reachability.mockReturnValue({ '/Users/dana/atlas': 'ready' });
    renderList([record('atlas')]);

    expect(screen.queryByTestId('recent-vault-notice-ready')).toBeNull();
    expect(screen.getByTestId('recent-vault-open')).toBeTruthy();
  });
});

describe('RecentVaultList current folder', () => {
  it('marks the folder the last session had open', () => {
    mocks.reachability.mockReturnValue({ '/Users/dana/atlas': 'ready' });
    renderList([record('atlas-old'), record('atlas')], '/Users/dana/atlas');

    const rows = screen.getAllByTestId('recent-vault-row');
    expect(rows.map((row) => row.getAttribute('data-current'))).toEqual(['false', 'true']);
  });

  it('does not offer to forget the folder you were last in', () => {
    // Forget is the release valve for the launch rule - drop back to one folder and the next
    // launch resumes directly. Pointing it at the current folder would make the most obvious
    // use of it the one that throws away where you were.
    mocks.reachability.mockReturnValue({ '/Users/dana/atlas': 'ready' });
    renderList([record('atlas')], '/Users/dana/atlas');

    expect(screen.queryByTestId('recent-vault-forget')).toBeNull();
  });
});

describe('RecentVaultList leaves no dead ends', () => {
  it('offers the picker on a folder that cannot be opened', () => {
    // A row that states a problem and offers only "throw this folder out of the list" is a
    // dead end. The recovery is the same picker the screen offers elsewhere, labelled for
    // the folder in front of the person rather than for one Atlas has never seen.
    mocks.reachability.mockReturnValue({ '/Users/dana/gone': 'missing' });
    const { onLocate } = renderList([record('gone')]);

    const locate = screen.getByTestId('recent-vault-locate');
    fireEvent.click(locate);
    expect(onLocate).toHaveBeenCalledTimes(1);
  });

  it('offers no picker on a folder that opens perfectly well', () => {
    mocks.reachability.mockReturnValue({ '/Users/dana/atlas': 'ready' });
    renderList([record('atlas')]);

    expect(screen.queryByTestId('recent-vault-locate')).toBeNull();
  });

  it('offers forget on the folder you were last in when it cannot be opened', () => {
    // Forget is normally withheld from the current folder so the obvious use of it is not
    // the one that throws away where you were. That reason lapses once the folder cannot be
    // opened at all: the person is not in it, and clearing it is the way forward.
    mocks.reachability.mockReturnValue({ '/Users/dana/gone': 'missing' });
    renderList([record('gone')], '/Users/dana/gone');

    expect(screen.getByTestId('recent-vault-forget')).toBeTruthy();
    expect(screen.getByTestId('recent-vault-locate')).toBeTruthy();
  });
});

describe('the rail label keeps the end of the name', () => {
  it('leaves a short name whole', () => {
    expect(railLabel('atlas')).toBe('atlas');
  });

  it('trims the head, because sibling folders differ in the tail', () => {
    // `ontology-atlas` and `ontology-atlas-old` share every character a head truncation
    // would have left on the 64px rail, so the label answered "which folder" with the one
    // part that does not distinguish them.
    const a = railLabel('ontology-atlas');
    const b = railLabel('ontology-atlas-old');
    // The two must not render identically - that is the defect being prevented.
    expect(a).not.toBe(b);
    // Each keeps its own tail, so what is on screen is the distinguishing end.
    expect('ontology-atlas'.endsWith(a.replace(/^\u2026/, ''))).toBe(true);
    expect('ontology-atlas-old'.endsWith(b.replace(/^\u2026/, ''))).toBe(true);
    expect(a.length).toBeLessThanOrEqual(RAIL_LABEL_MAX_CHARS);
    expect(b.length).toBeLessThanOrEqual(RAIL_LABEL_MAX_CHARS);
    // The budget must stay small enough that CSS does not truncate on top of it; the
    // rendered check lives in `tests/e2e/vault-launch-chooser.spec.ts`.
    expect(RAIL_LABEL_MAX_CHARS).toBeLessThanOrEqual(9);
  });
});

describe('RecentVaultList labels the count with the count\'s own age', () => {
  it('names how old the numbers are when that differs from the opening', () => {
    /*
     * The case that made this necessary: `openRecent` writes `lastAccessedAt: now` before it
     * loads the folder, and the counts are written only after a load that succeeds. A folder
     * opened and then refused therefore carried weeks-old numbers beside "opened just now",
     * while the type comment and the decision record both claimed the age was labelled.
     */
    mocks.reachability.mockReturnValue({ '/Users/dana/atlas': 'ready' });
    const now = Date.now();
    renderList([
      record('atlas', {
        lastAccessedAt: now - 60 * 1000,
        docCount: 184,
        conceptCount: 121,
        countedAt: now - 9 * 24 * 60 * 60 * 1000,
      }),
    ]);

    expect(screen.getByText(/opened 1m ago/)).toBeTruthy();
    expect(screen.getByText(/counted 1w ago/)).toBeTruthy();
    // And the same fact reaches a screen reader.
    const name = screen.getByTestId('recent-vault-open').getAttribute('aria-label') ?? '';
    expect(name).toContain('counted 1w ago');
  });

  it('says it once when the numbers are as old as the opening', () => {
    // The ordinary path: the counts were taken by the load this opening triggered. Printing
    // the same age twice would be noise, so the row stays one line.
    mocks.reachability.mockReturnValue({ '/Users/dana/atlas': 'ready' });
    const now = Date.now();
    renderList([
      record('atlas', {
        lastAccessedAt: now - 60 * 1000,
        docCount: 12,
        conceptCount: 3,
        countedAt: now - 62 * 1000,
      }),
    ]);

    expect(screen.queryByText(/counted /)).toBeNull();
    expect(screen.getByText(/opened 1m ago/)).toBeTruthy();
  });
});
