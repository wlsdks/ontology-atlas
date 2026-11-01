import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ChangeBriefing } from '@/shared/lib/git/tauri-change-briefing';
import { writeArrivalMemory } from '@/shared/lib/navigation/route-arrival-memory-store';

const mocks = vi.hoisted(() => ({ repositories: vi.fn(), saved: vi.fn(), pulls: vi.fn(), narrative: vi.fn() }));
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
vi.mock('@/i18n/navigation', () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/shared/lib/git/tauri-change-briefing', () => ({ gitBriefingRepositories: mocks.repositories, gitBriefingSavedPullDescriptions: mocks.saved, gitBriefingPullDescriptions: mocks.pulls }));
vi.mock('@/shared/lib/llm-connection/local-endpoint', () => ({ readLocalEndpoint: () => ({ baseUrl: '', model: '' }), subscribeLocalEndpointChange: () => () => {}, isLocalEndpointReady: () => false }));
vi.mock('../model/use-period-narrative', () => ({ usePeriodNarrative: mocks.narrative }));
vi.mock('./PeriodPlanDialog', () => ({ PeriodPlanDialog: () => null }));
vi.mock('./OriginalSourceBody', () => ({ OriginalSourceBody: () => null }));
vi.mock('./PeriodRunStatus', () => ({ PeriodRunStatus: () => null, PeriodRunDetails: () => null }));
import { BriefingNarrative } from './BriefingNarrative';

it('does not load, show, or send old PR copies in the commit-only explanation', () => {
  mocks.repositories.mockReset(); mocks.saved.mockReset(); mocks.pulls.mockReset(); mocks.narrative.mockReset();
  mocks.narrative.mockReturnValue({ current: null, busy: null, failure: null, run: null, stale: false, coverage: null });
  const data = { sourceRoot: '/repo', head: 'head', snapshot: 'receipt', base: null, tip: 'tip', commits: [{ hash: 'a'.repeat(40), subject: 'Commit original', message: 'commit body', messageComplete: true, committedAt: '2026-01-01', paths: [] }] } as unknown as ChangeBriefing;
  const memory = JSON.stringify(['source-narrative', '/repo', 'receipt', 'period', 'commit-only']);
  writeArrivalMemory(`${memory}:pulls`, { repository: 'a/b', descriptions: [{ number: 1, title: 'Old PR', body: 'private PR text', integration: 'a'.repeat(40), digest: 'd' }], status: 'measured', unchecked: 0, uncheckedCommits: [], unlinked: 0 });
  render(<BriefingNarrative data={data} period="period" onReadCode={vi.fn()} clearedAt={0} mode="summary" onMode={vi.fn()} repository="a/b" setRepository={vi.fn()} coverageSeat={null} commitOnly />);
  expect(screen.getByRole('button', { name: /Commit original/ })).toBeVisible();
  expect(screen.queryByText('Old PR')).toBeNull();
  expect(mocks.repositories).not.toHaveBeenCalled();
  expect(mocks.saved).not.toHaveBeenCalled();
  expect(mocks.pulls).not.toHaveBeenCalled();
  expect(mocks.narrative.mock.calls.at(-1)?.[0].sources.map((source: { kind: string }) => source.kind)).toEqual(['commit']);
  expect(mocks.narrative.mock.calls.at(-1)?.[0].lookup.unchecked).toBe(0);
});

it('exposes the active commit explanation stop action to other tabs', async () => {
  const stop = vi.fn();
  mocks.narrative.mockReturnValue({ current: null, busy: 'running', failure: null, run: null, stale: false, coverage: null, stop });
  const activity = vi.fn();
  const data = { sourceRoot: '/repo', head: 'head', snapshot: 'receipt', base: null, tip: 'tip', commits: [{ hash: 'a'.repeat(40), subject: 'Commit original', message: 'commit body', messageComplete: true, committedAt: '2026-01-01', paths: [] }] } as unknown as ChangeBriefing;
  const view = render(<BriefingNarrative data={data} period="period" onReadCode={vi.fn()} clearedAt={0} mode="summary" onMode={vi.fn()} repository="" setRepository={vi.fn()} coverageSeat={null} commitOnly onActivity={activity} />);
  await waitFor(() => expect(activity).toHaveBeenCalledWith(expect.objectContaining({ busy: 'running', stop: expect.any(Function) })));
  const active = activity.mock.calls.find(([value]) => value)?.[0] as { stop: () => void };
  active.stop();
  expect(stop).toHaveBeenCalled();
  view.unmount();
  expect(activity).toHaveBeenLastCalledWith(null);
});

it('does not steal focus when the person acts before the original-reader frame runs', () => {
  mocks.narrative.mockReturnValue({ current: null, busy: null, failure: null, run: null, stale: false, coverage: null });
  const frames: FrameRequestCallback[] = [];
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.push(callback); return frames.length; });
  const previousScroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  try {
    const data = { sourceRoot: '/focus-repo', head: 'head', snapshot: 'focus-receipt', base: null, tip: 'tip', commits: [{ hash: 'a'.repeat(40), subject: 'Commit original', message: 'commit body', messageComplete: true, committedAt: '2026-01-01', paths: [] }] } as unknown as ChangeBriefing;
    render(<main><BriefingNarrative data={data} period="focus-period" onReadCode={vi.fn()} clearedAt={0} mode="sources" onMode={vi.fn()} repository="" setRepository={vi.fn()} coverageSeat={null} commitOnly /></main>);
    fireEvent.click(screen.getByRole('button', { name: /Commit original/ }));
    const opener = screen.getByRole('button', { name: 'readPeriodCode' });
    opener.focus();
    expect(opener).toHaveFocus();
    expect(frames.length).toBeGreaterThan(0);
    act(() => { for (const frame of frames.splice(0)) frame(performance.now()); });
    expect(opener).toHaveFocus();
  } finally {
    raf.mockRestore();
    HTMLElement.prototype.scrollIntoView = previousScroll;
  }
});
