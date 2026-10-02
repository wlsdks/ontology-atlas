import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Choice, SettingsDoorRow, SettingsRow, Slider, ArmedChip } from './settings-primitives';

const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  push.mockReset();
  vi.useRealTimers();
});

describe('settings primitives', () => {
  it('anchors every row kind by its setting id', () => {
    const { container } = render(
      <>
        <SettingsRow label="Row" control={null} settingId="screen-guides" />
        <Slider
          label="Speed"
          value={1}
          range={{ min: 0, max: 2, step: 1 }}
          format={String}
          onChange={() => {}}
          testId="slider"
          settingId="pan-zoom-speed"
        />
        <Choice
          label="Mode"
          value="a"
          options={[{ value: 'a', label: 'A' }]}
          onChange={() => {}}
          testId="choice"
          settingId="view-mode"
        />
        <SettingsDoorRow settingId="door-models" label="Models" href="/agents" onLeave={() => {}} />
      </>,
    );
    const ids = [...container.querySelectorAll('[data-setting-id]')].map((el) =>
      el.getAttribute('data-setting-id'),
    );
    expect(ids).toEqual(['screen-guides', 'pan-zoom-speed', 'view-mode', 'door-models']);
  });

  it('door row leaves the sheet before navigating, and is never indigo', () => {
    const order: string[] = [];
    push.mockImplementation(() => order.push('push'));
    render(
      <SettingsDoorRow
        settingId="door-mcp"
        label="MCP"
        caption="2 connected"
        href="/agents"
        onLeave={() => order.push('leave')}
        testId="door"
      />,
    );
    const door = screen.getByTestId('door');
    expect(door.className.split(/\s+/).filter((c) => !c.startsWith('focus-visible:'))).not.toContainEqual(
      expect.stringMatching(/indigo/),
    );
    expect(door).toHaveTextContent('2 connected');
    fireEvent.click(door);
    expect(order).toEqual(['leave', 'push']);
    expect(push.mock.calls[0]?.[0]).toContain('/agents');
  });

  it('armed chip confirms only on the second press and disarms after a pause', async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(<ArmedChip label="Forget" armedLabel="Press again" onConfirm={onConfirm} testId="chip" />);
    const chip = screen.getByTestId('chip');
    fireEvent.click(chip);
    expect(chip).toHaveTextContent('Press again');
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(chip).toHaveTextContent('Forget');
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(onConfirm, 'a double-click must not confirm').not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.click(chip);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(chip).toHaveTextContent('Forget');
  });
});
