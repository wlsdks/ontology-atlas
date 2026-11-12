import { afterEach, describe, expect, it, vi } from 'vitest';

import { awayProps, keptAwayRuntimeId, keptPanels } from './kept-panels';
import type { AcpChatPanelProps } from '../ui/chat-panel/types';

const props = (vaultRoot: string, extra: Partial<AcpChatPanelProps> = {}): AcpChatPanelProps => ({
  runtimeId: 'claude',
  runtimeLabel: 'Claude',
  vaultRoot,
  ...extra,
});

const keys = () => keptPanels.read().map((panel) => panel.key);

afterEach(() => {
  keptPanels.reset();
  vi.useRealTimers();
});

describe('kept agent panels', () => {
  it('drops a panel at rest once its screen is left', () => {
    vi.useFakeTimers();
    keptPanels.seat('map:a', props('/a'));
    keptPanels.leave('map:a');
    vi.runAllTimers();
    expect(keys()).toEqual([]);
  });

  it('keeps a panel that was answering when its screen was left, through the end of the answer', () => {
    vi.useFakeTimers();
    keptPanels.seat('map:a', props('/a'));
    keptPanels.busyReporter('map:a')(true);
    keptPanels.leave('map:a');
    vi.runAllTimers();
    expect(keys()).toEqual(['map:a']);
    keptPanels.busyReporter('map:a')(false);
    vi.runAllTimers();
    expect(keys()).toEqual(['map:a']);
  });

  it('hands the same node back when the person returns', () => {
    vi.useFakeTimers();
    const first = keptPanels.seat('map:a', props('/a'));
    keptPanels.busyReporter('map:a')(true);
    keptPanels.leave('map:a');
    vi.runAllTimers();
    expect(keptPanels.seat('map:a', props('/a'))).toBe(first);
    expect(keptPanels.read()[0]).toMatchObject({ seated: true, held: false });
  });

  it('survives an unmount that is followed at once by a mount', () => {
    vi.useFakeTimers();
    const first = keptPanels.seat('map:a', props('/a'));
    keptPanels.leave('map:a');
    expect(keptPanels.seat('map:a', props('/a'))).toBe(first);
    vi.runAllTimers();
    expect(keys()).toEqual(['map:a']);
  });

  it('ends a kept answer when the agent is opened elsewhere for the same folder', () => {
    vi.useFakeTimers();
    keptPanels.seat('map:a', props('/a'));
    keptPanels.busyReporter('map:a')(true);
    keptPanels.leave('map:a');
    vi.runAllTimers();
    keptPanels.seat('library:a', props('/a'));
    expect(keys()).toEqual(['library:a']);
  });

  it('leaves a kept answer alone while the other dock has not started its session', () => {
    vi.useFakeTimers();
    keptPanels.seat('map:a', props('/a'));
    keptPanels.busyReporter('map:a')(true);
    keptPanels.leave('map:a');
    vi.runAllTimers();
    keptPanels.seat('library:a', props('/a', { sessionEnabled: false }));
    expect(keys()).toEqual(['map:a', 'library:a']);
  });

  it('lets an answer for another folder finish, and clears it once it has', () => {
    vi.useFakeTimers();
    keptPanels.seat('map:a', props('/a'));
    keptPanels.busyReporter('map:a')(true);
    keptPanels.leave('map:a');
    vi.runAllTimers();
    keptPanels.seat('map:b', props('/b'));
    expect(keys()).toEqual(['map:a', 'map:b']);
    keptPanels.busyReporter('map:a')(false);
    keptPanels.update('map:b', props('/b'));
    expect(keys()).toEqual(['map:b']);
  });

  it('parks the node of a panel whose screen is gone', () => {
    const parking = document.createElement('div');
    const seat = document.createElement('div');
    keptPanels.park(parking);
    const node = keptPanels.seat('map:a', props('/a'));
    seat.appendChild(node);
    keptPanels.busyReporter('map:a')(true);
    keptPanels.leave('map:a');
    expect(node.parentElement).toBe(parking);
    keptPanels.park(null);
  });

  it('strips what could act on a screen the person is no longer on', () => {
    const onMapIntent = vi.fn();
    const onWorkReceipt = vi.fn();
    const onTurnActivityChange = vi.fn();
    const away = awayProps(props('/a', { onMapIntent, onWorkReceipt, onTurnActivityChange, noticeActions: { openPage: vi.fn(), askNext: vi.fn() } }));
    expect(away.putAway).toBe(true);
    expect(away.onMapIntent).toBeUndefined();
    expect(away.noticeActions).toBeUndefined();
    expect(away.onWorkReceipt).toBe(onWorkReceipt);
    expect(away.onTurnActivityChange).toBe(onTurnActivityChange);
  });

  it('names the tool of the answer left running, so a returning screen reopens that one', () => {
    vi.useFakeTimers();
    expect(keptAwayRuntimeId()).toBeNull();
    keptPanels.seat('map:a:codex', props('/a', { runtimeId: 'codex' }));
    expect(keptAwayRuntimeId()).toBeNull();
    keptPanels.busyReporter('map:a:codex')(true);
    keptPanels.leave('map:a:codex');
    vi.runAllTimers();
    expect(keptAwayRuntimeId()).toBe('codex');
  });
});
