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

    expect(screen.queryByTestId('recent-vault-open')).toBeNull();
    fireEvent.click(screen.getByTestId('recent-vault-missing-toggle'));
    expect(screen.getByTestId('recent-vault-missing-review').textContent).toMatch(
      /no longer at the path Atlas remembers/,
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

    fireEvent.click(screen.getByTestId('recent-vault-missing-toggle'));
    const locate = screen.getByTestId('recent-vault-locate');
    fireEvent.click(locate);
    expect(onLocate).toHaveBeenCalledTimes(1);
  });

  it('keeps its own picker on a folder the browser refused, which is still there', () => {
    mocks.reachability.mockReturnValue({ '/Users/dana/walled': 'blocked' });
    const { onLocate } = renderList([record('walled')]);

    expect(screen.queryByTestId('recent-vault-missing-group')).toBeNull();
    fireEvent.click(screen.getByTestId('recent-vault-locate'));
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

    fireEvent.click(screen.getByTestId('recent-vault-missing-toggle'));
    expect(screen.getByTestId('recent-vault-forget')).toBeTruthy();
    expect(screen.getByTestId('recent-vault-locate')).toBeTruthy();
  });
});

/**
 * **Folders that are gone are one quiet line at the end, not rows above the live ones**
 * (owner inspection, 2026-09-26). After a few QA runs the launch chooser opened on five dead rows,
 * each with a warning and two buttons, above the folders that still exist — the deleted temporary
 * folders were the most recently opened. Nothing is removed unless the person presses for it.
 */
describe('RecentVaultList gathers missing folders at the end', () => {
  const now = Date.now();
  const deadThenLive = [
    record('qa-run-a', { lastAccessedAt: now - 1 * 3600_000 }),
    record('qa-run-b', { lastAccessedAt: now - 2 * 3600_000 }),
    record('qa-run-c', { lastAccessedAt: now - 3 * 3600_000 }),
    record('atlas', { lastAccessedAt: now - 5 * 3600_000 }),
    record('atlas-notes', { lastAccessedAt: now - 30 * 3600_000 }),
  ];
  const reachability = {
    '/Users/dana/qa-run-a': 'missing',
    '/Users/dana/qa-run-b': 'missing',
    '/Users/dana/qa-run-c': 'missing',
    '/Users/dana/atlas': 'ready',
    '/Users/dana/atlas-notes': 'ready',
  };

  function renderGathered(
    onForgetAll?: (records: readonly LocalFsHandleRecord[]) => void,
    missingReview?: 'dialog' | 'inline',
  ) {
    const onForget = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <RecentVaultList
          records={deadThenLive}
          currentKey="/Users/dana/atlas"
          busy={false}
          onOpen={vi.fn()}
          onForget={onForget}
          onForgetAll={onForgetAll}
          onLocate={vi.fn()}
          missingReview={missingReview}
          footnote={<p data-testid="release-valve">release valve</p>}
        />
      </NextIntlClientProvider>,
    );
    return { onForget };
  }

  it('draws the live folders first and one line for the missing ones after them', () => {
    mocks.reachability.mockReturnValue(reachability);
    renderGathered();

    const list = screen.getByTestId('recent-vault-list');
    const rows = screen.getAllByTestId('recent-vault-row');
    expect(rows.map((row) => row.querySelector('[data-testid="recent-vault-name"]')?.textContent)).toEqual([
      'atlas',
      'atlas-notes',
    ]);
    const group = screen.getByTestId('recent-vault-missing-group');
    expect(group.getAttribute('data-count')).toBe('3');
    expect(group.textContent).toMatch(/3 folders not found/);
    // The line is the list's last child: nothing live sits below it.
    expect(list.lastElementChild).toBe(group);
    // Closed, it offers one action and no removals.
    expect(screen.queryAllByTestId('recent-vault-forget')).toHaveLength(1); // atlas-notes, a live row
    expect(screen.queryByTestId('recent-vault-missing-review')).toBeNull();
  });

  it('reviews them in a dialog on a page, where each stays removable on its own', () => {
    mocks.reachability.mockReturnValue(reachability);
    const { onForget } = renderGathered(vi.fn());

    const toggle = screen.getByTestId('recent-vault-missing-toggle');
    expect(toggle.getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.click(toggle);
    const review = screen.getByTestId('recent-vault-missing-review');
    expect(review.getAttribute('role')).toBe('dialog');
    const missingRows = review.querySelectorAll('[data-testid="recent-vault-row"]');
    expect([...missingRows].map((row) => row.getAttribute('data-reachability'))).toEqual([
      'missing',
      'missing',
      'missing',
    ]);
    expect(review.textContent).toContain('/Users/dana/qa-run-b');
    expect(onForget).not.toHaveBeenCalled();

    const forgetB = [...review.querySelectorAll<HTMLButtonElement>('[data-testid="recent-vault-forget"]')].find(
      (button) => button.getAttribute('aria-label')?.includes('qa-run-b'),
    );
    fireEvent.click(forgetB!);
    expect(onForget).toHaveBeenCalledTimes(1);
    expect(onForget.mock.calls[0]?.[0].desktopRootPath).toBe('/Users/dana/qa-run-b');
  });

  it('opens in place in the rail popover, which grows downward', () => {
    mocks.reachability.mockReturnValue(reachability);
    renderGathered(vi.fn(), 'inline');

    const toggle = screen.getByTestId('recent-vault-missing-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const group = screen.getByTestId('recent-vault-missing-group');
    expect(group.getAttribute('data-state')).toBe('open');
    expect(group.querySelectorAll('[data-testid="recent-vault-row"]')).toHaveLength(3);
    expect(screen.queryByTestId('recent-vault-missing-review')).toBeNull();
  });

  it('forgets all of them in one call, only when that is pressed', () => {
    mocks.reachability.mockReturnValue(reachability);
    const onForgetAll = vi.fn();
    const { onForget } = renderGathered(onForgetAll);

    fireEvent.click(screen.getByTestId('recent-vault-missing-toggle'));
    expect(onForgetAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('recent-vault-forget-missing'));
    expect(onForget).not.toHaveBeenCalled();
    expect(onForgetAll).toHaveBeenCalledTimes(1);
    expect(onForgetAll.mock.calls[0]?.[0].map((entry: LocalFsHandleRecord) => entry.desktopRootPath)).toEqual([
      '/Users/dana/qa-run-a',
      '/Users/dana/qa-run-b',
      '/Users/dana/qa-run-c',
    ]);
  });

  it('forgets them one by one when the seat has no bulk forget', () => {
    mocks.reachability.mockReturnValue(reachability);
    const { onForget } = renderGathered();

    fireEvent.click(screen.getByTestId('recent-vault-missing-toggle'));
    fireEvent.click(screen.getByTestId('recent-vault-forget-missing'));
    expect(onForget).toHaveBeenCalledTimes(3);
  });

  it('draws nothing, footnote included, until the probe has answered', () => {
    mocks.reachability.mockReturnValue(null as unknown as Record<string, string>);
    renderGathered();

    expect(screen.queryByTestId('recent-vault-list')).toBeNull();
    expect(screen.queryByTestId('release-valve')).toBeNull();
  });

  it('draws the footnote under the list once it is drawn', () => {
    mocks.reachability.mockReturnValue(reachability);
    renderGathered();

    const list = screen.getByTestId('recent-vault-list');
    expect(list.nextElementSibling).toBe(screen.getByTestId('release-valve'));
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
