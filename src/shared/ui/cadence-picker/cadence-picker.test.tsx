import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CadencePicker, type CadenceUnit } from './CadencePicker';
import { HOUR_DETENTS, MINUTE_DETENTS, detentForMinutes, nearestDetent, stepDetent } from './detents';

/**
 * The rail's travel is measured, not assumed (spec §2.2 "Ratchet"). The arithmetic is tested
 * without a screen, and the component is tested for the three things a person does with it
 * that no pixel is needed for: switch the unit, press a detent, and use the keyboard.
 */

const LABELS = {
  legend: 'How often',
  unitMinutes: 'Minutes',
  unitHours: 'Hours',
  unitDay: 'Day',
  detent: (minutes: number) => String(minutes < 60 ? minutes : minutes / 60),
  valueText: (minutes: number) => (minutes < 60 ? `every ${minutes} minutes` : `every ${minutes / 60} hours`),
  railAria: 'Interval',
  daily: 'Daily',
  weekdays: 'Weekdays',
  time: 'At',
  dayAria: 'Which days',
  timeError: 'HH:MM',
};

function Harness({ onMinutes = vi.fn() }: { onMinutes?: (minutes: number) => void }) {
  const [unit, setUnit] = useState<CadenceUnit>('minutes');
  const [minutes, setMinutes] = useState<number | null>(60);
  return (
    <CadencePicker
      unit={unit}
      onUnitChange={setUnit}
      minutes={minutes}
      onMinutesChange={(next) => {
        onMinutes(next);
        setMinutes(next);
      }}
      daily="09:00"
      weekdaysOnly={false}
      onDayChange={() => {}}
      labels={LABELS}
      testId="rail"
    />
  );
}

describe('the rail arithmetic', () => {
  it('reads the nearest detent from a pointer position, clamped at both ends', () => {
    // Five detents across 400px sit at 0, 100, 200, 300, 400.
    expect(nearestDetent(0, 400, MINUTE_DETENTS)).toBe(0);
    expect(nearestDetent(160, 400, MINUTE_DETENTS)).toBe(2);
    expect(nearestDetent(400, 400, MINUTE_DETENTS)).toBe(4);
    // 40% across a five-detent rail is the third detent: ten minutes, the owner's example.
    expect(MINUTE_DETENTS[nearestDetent(0.4 * 400, 400, MINUTE_DETENTS)]).toBe(10);
    // A drag that leaves the rail clamps rather than wrapping to the other end.
    expect(nearestDetent(-90, 400, MINUTE_DETENTS)).toBe(0);
    expect(nearestDetent(900, 400, MINUTE_DETENTS)).toBe(4);
    expect(nearestDetent(10, 0, MINUTE_DETENTS)).toBe(0);
  });

  it('carries the value across a unit switch by the value, not the position', () => {
    expect(HOUR_DETENTS[detentForMinutes(30, HOUR_DETENTS)]).toBe(60);
    expect(MINUTE_DETENTS[detentForMinutes(60, MINUTE_DETENTS)]).toBe(30);
    // Coming from Day there is no interval to carry, so the rail opens at its first detent.
    expect(MINUTE_DETENTS[detentForMinutes(null, MINUTE_DETENTS)]).toBe(1);
    expect(HOUR_DETENTS[detentForMinutes(null, HOUR_DETENTS)]).toBe(60);
  });

  it('steps one detent at a time and stops at the ends', () => {
    expect(stepDetent(2, 1, 5)).toBe(3);
    expect(stepDetent(0, -1, 5)).toBe(0);
    expect(stepDetent(4, 1, 5)).toBe(4);
    expect(stepDetent(2, Infinity, 5)).toBe(4);
    expect(stepDetent(2, -Infinity, 5)).toBe(0);
  });
});

describe('the rail on screen', () => {
  it('switching to hours lands on one hour, and back on thirty minutes', () => {
    const onMinutes = vi.fn();
    render(<Harness onMinutes={onMinutes} />);
    // It opens on minutes with 60 carried in, which the minute rail says as its last detent.
    expect(screen.getByTestId('rail-thumb')).toHaveAttribute('aria-valuetext', 'every 30 minutes');

    fireEvent.click(screen.getByRole('radio', { name: 'Hours' }));
    expect(onMinutes).toHaveBeenLastCalledWith(60);
    expect(screen.getByTestId('rail-thumb')).toHaveAttribute('aria-valuetext', 'every 1 hours');

    fireEvent.click(screen.getByRole('radio', { name: 'Minutes' }));
    expect(onMinutes).toHaveBeenLastCalledWith(30);
  });

  it('answers the arrow keys and the ends, one detent per press', () => {
    const onMinutes = vi.fn();
    render(<Harness onMinutes={onMinutes} />);
    const thumb = screen.getByTestId('rail-thumb');
    fireEvent.keyDown(thumb, { key: 'ArrowLeft' });
    expect(onMinutes).toHaveBeenLastCalledWith(15);
    fireEvent.keyDown(thumb, { key: 'Home' });
    expect(onMinutes).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(thumb, { key: 'End' });
    expect(onMinutes).toHaveBeenLastCalledWith(30);
  });

  it('every detent is a real button, so a person who does not drag still has the chips', () => {
    const onMinutes = vi.fn();
    render(<Harness onMinutes={onMinutes} />);
    fireEvent.click(screen.getByText('10'));
    expect(onMinutes).toHaveBeenLastCalledWith(10);
  });

  it('the thumb carries no transition while the pointer is down, and the spring only after it lifts', () => {
    /*
     * The reduced-motion equivalent is the absence of the transition, not a second animation:
     * `motion-reduce:transition-none` on the same element the spring rides, so a person who
     * asked for less motion finds the thumb already at the detent.
     */
    render(<Harness />);
    const thumb = screen.getByTestId('rail-thumb');
    expect(thumb.className).toContain('motion-reduce:transition-none');
    expect(thumb.style.transitionTimingFunction).toBe('var(--motion-ease-drag-release)');

    const rail = screen.getByTestId('rail-rail');
    rail.setPointerCapture = () => {};
    rail.releasePointerCapture = () => {};
    rail.hasPointerCapture = () => true;
    fireEvent.pointerDown(rail, { button: 0, clientX: 10, pointerId: 1 });
    expect(screen.getByTestId('rail-thumb')).toHaveAttribute('data-cadence-dragging', 'true');
    expect(screen.getByTestId('rail-thumb').style.transitionTimingFunction).toBe('');

    fireEvent.pointerUp(rail, { pointerId: 1 });
    expect(screen.getByTestId('rail-thumb')).not.toHaveAttribute('data-cadence-dragging');
  });
});
