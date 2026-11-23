import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../../../messages/en.json';
import ko from '../../../../../../messages/ko.json';
import { folderMappingRun, workRuns, type MappingFigures, type MappingRequestEnd, type MappingRun } from '@/features/work-run';

import { MappingRunRow } from './MappingRunRow';

const FOLDER = '/Users/probe/launch';
const KEY = `mapping:${FOLDER}`;
const CATALOGUES = { en, ko } as const;

const figures = (uncovered: number, total = 120): MappingFigures => ({ abilitiesUncovered: uncovered, abilitiesTotal: total });
const end = (uncovered: number | null, at: number, outcome: MappingRequestEnd['outcome'] = { kind: 'completed' }, draft = false): MappingRequestEnd =>
  ({ outcome, figures: uncovered === null ? null : figures(uncovered), draft, at, sessionId: `s-${at}` });

const handlers = () => ({ onStart: vi.fn(), onStop: vi.fn(), onClose: vi.fn(), onCollapse: vi.fn(), onExpand: vi.fn() });

function renderRow(run: MappingRun | null, options: {
  locale?: keyof typeof CATALOGUES;
  autoApprove?: boolean;
  canStart?: boolean;
  resting?: MappingFigures | null;
  collapsed?: boolean;
} = {}) {
  const on = handlers();
  render(
    <NextIntlClientProvider locale={options.locale ?? 'en'} messages={CATALOGUES[options.locale ?? 'en']}>
      <MappingRunRow
        run={run}
        resting={options.resting === undefined ? figures(96) : options.resting}
        autoApprove={options.autoApprove ?? false}
        canStart={options.canStart ?? true}
        collapsed={options.collapsed ?? false}
        {...on}
      />
    </NextIntlClientProvider>,
  );
  return on;
}

const run = () => folderMappingRun(workRuns.read(), FOLDER);
const begin = () => workRuns.beginMapping({ folder: FOLDER, folderName: 'launch', project: 'launch', agent: 'Claude Agent', figures: figures(96), startedAt: 0 });
/** A run on its second request: 48 of 120 on the map after one request of two minutes. */
function secondRequest() {
  begin();
  workRuns.endMappingBatch(FOLDER, end(72, 120_000));
  return run();
}

const action = () => screen.getByTestId('mapping-run-action');
const text = (testId: string) => screen.getByTestId(testId).textContent ?? '';

beforeEach(() => {
  workRuns.leaveFolder('local:launch#1', 0);
  workRuns.enterFolderRoot(FOLDER);
});
afterEach(() => {
  cleanup();
  act(() => workRuns.reset());
});

describe('before a press the row offers Start', () => {
  it('states the count, the estimate and, with Auto-approve off, that each change waits', () => {
    const on = renderRow(null);
    expect(text('mapping-run-title')).toBe('Map the rest of the code');
    expect(text('mapping-run-body')).toBe('24 of the 120 abilities found in the code are on the map (20%). About 8 requests to your agent, about 24 minutes.');
    expect(text('mapping-run-approval')).toBe('Each change waits for your answer. With Auto-approve on, it runs by itself.');
    expect(screen.getByRole('button', { name: 'Start' })).toBe(action());
    fireEvent.click(screen.getByTestId('mapping-run-title'));
    expect(on.onStart).not.toHaveBeenCalled();
    fireEvent.click(action());
    expect(on.onStart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(on.onCollapse).toHaveBeenCalledTimes(1);
    expect(on.onStart).toHaveBeenCalledTimes(1);
  });

  it('says what goes through by itself while Auto-approve answers', () => {
    renderRow(null, { autoApprove: true });
    expect(text('mapping-run-approval')).toBe('Adding and changing go through by themselves. Deleting, merging and overwriting wait for your answer.');
  });

  it('shortened, keeps its title, its share on the map, what waits for an answer and Start on one line', () => {
    const on = renderRow(null, { collapsed: true });
    expect(screen.getByTestId('mapping-run-row')).toHaveAttribute('data-collapsed', 'true');
    expect(text('mapping-run-title')).toBe('Map the rest of the code');
    expect(text('mapping-run-body')).toBe('20% mapped');
    expect(text('mapping-run-approval')).toBe('Asks first');
    expect(screen.getByTestId('mapping-run-approval')).toHaveAttribute('title', 'Each change waits for your answer. With Auto-approve on, it runs by itself.');
    expect(screen.queryByTestId('mapping-run-collapse')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(on.onStart).toHaveBeenCalledTimes(1);
  });

  it('shortened, still says what goes through by itself while Auto-approve is kept on', () => {
    renderRow(null, { collapsed: true, autoApprove: true });
    expect(text('mapping-run-approval')).toBe('Adds and edits alone');
  });

  it('shortened, opens the full row again from its title, and focus crosses to the control that swaps back', () => {
    function SwappingRow() {
      const [collapsed, setCollapsed] = useState(true);
      return (
        <NextIntlClientProvider locale="en" messages={en}>
          <MappingRunRow
            run={null}
            resting={figures(96)}
            autoApprove={false}
            canStart
            collapsed={collapsed}
            {...handlers()}
            onCollapse={() => setCollapsed(true)}
            onExpand={() => setCollapsed(false)}
          />
        </NextIntlClientProvider>
      );
    }
    render(<SwappingRow />);
    const title = screen.getByTestId('mapping-run-title');
    expect(title).toHaveAttribute('aria-expanded', 'false');
    title.focus();
    fireEvent.click(title);
    expect(screen.getByTestId('mapping-run-row')).not.toHaveAttribute('data-collapsed');
    expect(text('mapping-run-approval')).toBe('Each change waits for your answer. With Auto-approve on, it runs by itself.');
    expect(document.activeElement).toBe(screen.getByTestId('mapping-run-collapse'));
    fireEvent.click(screen.getByTestId('mapping-run-collapse'));
    expect(document.activeElement).toBe(screen.getByTestId('mapping-run-title'));
  });

  it('shortened, still shows a run in full once one starts', () => {
    renderRow(secondRequest(), { collapsed: true });
    expect(screen.getByTestId('mapping-run-row')).not.toHaveAttribute('data-collapsed');
    expect(text('mapping-run-title')).toBe('Mapping the rest of the code');
  });

  it('cannot be pressed while a turn of this conversation runs', () => {
    const on = renderRow(null, { canStart: false });
    expect(action()).toBeDisabled();
    fireEvent.click(action());
    expect(on.onStart).not.toHaveBeenCalled();
  });

  it('speaks Korean', () => {
    renderRow(null, { locale: 'ko' });
    expect(text('mapping-run-title')).toBe('코드의 나머지를 지도에 올리기');
    expect(text('mapping-run-body')).toBe('코드에서 찾은 기능 120개 중 24개(20%)가 지도에 있어요. 에이전트 요청 약\u00a08번, 24분 정도 걸려요.');
    expect(text('mapping-run-approval')).toBe('바꿀 때마다 답을 기다려요. 자동 승인을 켜면 혼자 진행해요.');
    expect(text('mapping-run-action')).toBe('시작');
    expect(screen.getByRole('button', { name: '간단히 보기' })).toBeInTheDocument();
  });

  it('speaks Korean about what goes through by itself', () => {
    renderRow(null, { locale: 'ko', autoApprove: true });
    expect(text('mapping-run-approval')).toBe('추가와 수정은 혼자 진행해요. 삭제, 합치기, 덮어쓰기는 답을 기다려요.');
  });
});

describe('a run shows how far it has come, and the same control stops it', () => {
  it('names the request, the count on the map and the time left, with its bar', () => {
    const on = renderRow(secondRequest());
    expect(screen.getByTestId('mapping-run-row')).toHaveAttribute('data-mapping-state', 'running');
    expect(text('mapping-run-title')).toBe('Mapping the rest of the code');
    expect(text('mapping-run-body')).toBe('Request 2' + '48 of 120 abilities on the map (40%)' + 'about 6 minutes left');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(screen.queryByTestId('mapping-run-collapse')).toBeNull();
    expect(text('mapping-run-action')).toBe('Stop');
    fireEvent.click(action());
    expect(on.onStop).toHaveBeenCalledTimes(1);
  });

  it('says it waits for the person while a permission card is open, and still stops', () => {
    begin();
    workRuns.observeMappingWork(FOLDER, { kind: 'writing', label: null, target: 'wiki/a.md', asking: true }, 1_000);
    const on = renderRow(run());
    expect(text('mapping-run-title')).toBe('Waiting for your answer');
    expect(text('mapping-run-body')).toBe('Claude Agent asked before changing something. Mapping goes on when you answer.');
    fireEvent.click(action());
    expect(on.onStop).toHaveBeenCalledTimes(1);
  });

  it('offers nothing while it stops', () => {
    begin();
    workRuns.stopRun(KEY);
    renderRow(run());
    expect(text('mapping-run-title')).toBe('Stopping Claude Agent');
    expect(action()).toBeDisabled();
  });

  it('speaks Korean while running', () => {
    renderRow(secondRequest(), { locale: 'ko' });
    expect(text('mapping-run-title')).toBe('코드의 나머지를 지도에 올리는 중');
    expect(text('mapping-run-body')).toBe('요청 2번째' + '기능 120개 중 48개(40%)' + '약 6분 남음');
    expect(text('mapping-run-action')).toBe('중지');
  });
});

describe('each end says why and what comes next', () => {
  const cases: Array<{ name: string; reach: () => void; title: string; body: string; word: 'Continue' | 'Close' }> = [
    { name: 'the person\'s Stop', reach: () => { workRuns.stopRun(KEY); workRuns.endMappingBatch(FOLDER, end(72, 60_000, { kind: 'cancelled' })); }, title: 'Stopped at 40%', body: 'What is already on the map stays. Continue picks up from here.', word: 'Continue' },
    { name: 'a cancel nobody pressed', reach: () => { workRuns.endMappingBatch(FOLDER, end(72, 60_000, { kind: 'cancelled' })); }, title: 'Stopped: the request was cancelled before it finished', body: 'What is already on the map stays. Continue picks up from here.', word: 'Continue' },
    { name: 'a message', reach: () => { workRuns.endMappingBatch(FOLDER, end(72, 60_000, { kind: 'completed' }, true)); }, title: 'Stopped at 40%', body: 'Stopped so you can ask. Continue picks up from here.', word: 'Continue' },
    { name: 'no progress', reach: () => { workRuns.endMappingBatch(FOLDER, end(96, 60_000)); }, title: 'Stopped: the last request put nothing new on the map', body: 'It stays at 24 of 120. The conversation shows what the agent did.', word: 'Continue' },
    { name: 'an agent error', reach: () => { workRuns.endMappingBatch(FOLDER, end(96, 60_000, { kind: 'failed', usageLimit: false })); }, title: 'Claude Agent ended early', body: '24 of 120 are on the map. What was already written stays.', word: 'Continue' },
    { name: 'a usage limit', reach: () => { workRuns.endMappingBatch(FOLDER, end(96, 60_000, { kind: 'failed', usageLimit: true })); }, title: en.acpChat.trouble.limit.title, body: '24 of 120 are on the map. Continue when the limit resets, or pick another agent and continue.', word: 'Continue' },
    { name: 'the end of the code', reach: () => { workRuns.endMappingBatch(FOLDER, end(0, 60_000)); }, title: 'Every ability found in the code is on the map', body: '120 abilities, 1 request, 1 minute.', word: 'Close' },
    { name: 'a lost line', reach: () => { workRuns.endMappingBatch(FOLDER, end(null, 60_000)); }, title: 'Stopped: the project note no longer says what is left', body: 'It last said 24 of 120. Continue reads the code again.', word: 'Continue' },
    { name: 'a folder switch', reach: () => { workRuns.enterFolderRoot('/Users/probe/other'); workRuns.endMappingBatch(FOLDER, end(96, 60_000, { kind: 'cancelled' })); }, title: 'Ended when you switched folders', body: 'Claude Agent was mapping launch. 24 of 120 are on the map there.', word: 'Close' },
  ];
  for (const { name, reach, title, body, word } of cases) {
    it(`after ${name}`, () => {
      begin();
      reach();
      const on = renderRow(run());
      expect(text('mapping-run-title')).toBe(title);
      expect(text('mapping-run-body')).toBe(body);
      expect(text('mapping-run-action')).toBe(word);
      expect(screen.queryByRole('progressbar')).toBeNull();
      fireEvent.click(action());
      expect(word === 'Continue' ? on.onStart : on.onClose).toHaveBeenCalledTimes(1);
    });
  }

  it('after more requests than estimated', () => {
    workRuns.beginMapping({ folder: FOLDER, folderName: 'launch', project: 'launch', agent: 'Claude Agent', figures: figures(5), startedAt: 0 });
    for (const [index, left] of [4, 3, 2, 1].entries()) workRuns.endMappingBatch(FOLDER, end(left, (index + 1) * 60_000));
    renderRow(run());
    expect(text('mapping-run-title')).toBe('Stopped: this is taking more requests than estimated');
    expect(text('mapping-run-body')).toBe('4 requests sent, 119 of 120 on the map.');
    expect(text('mapping-run-action')).toBe('Continue');
  });

  it('speaks Korean when stopped for a message', () => {
    begin();
    workRuns.endMappingBatch(FOLDER, end(72, 60_000, { kind: 'completed' }, true));
    renderRow(run(), { locale: 'ko' });
    expect(text('mapping-run-title')).toBe('40%에서 멈췄어요');
    expect(text('mapping-run-body')).toBe('물어볼 수 있게 멈췄어요. 이어서 하면 여기서부터 진행해요.');
    expect(text('mapping-run-action')).toBe('이어서 하기');
  });

  it('speaks Korean when the line is lost', () => {
    begin();
    workRuns.endMappingBatch(FOLDER, end(null, 60_000));
    renderRow(run(), { locale: 'ko' });
    expect(text('mapping-run-title')).toBe('멈춤: 프로젝트 노트에 남은 양이 적혀 있지 않아요');
    expect(text('mapping-run-body')).toBe('마지막으로 120개 중 24개였어요. 이어서 하면 코드를 다시 읽어요.');
  });
});
