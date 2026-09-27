import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it } from 'vitest';
import enMessages from '../../../../messages/en.json';
import { HeroMacMenu } from './HeroMacMenu';

const renderMenu = () =>
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <HeroMacMenu variant="primary" testId="hero-cta" />
    </NextIntlClientProvider>,
  );

const openMenu = () => {
  const trigger = screen.getByTestId('hero-cta');
  fireEvent.click(trigger);
  return trigger;
};

const rows = () => screen.queryAllByRole('menuitem');

/** Asks `aria-expanded`: a closed surface stays mounted through its exit animation. */
const isOpen = () => screen.getByTestId('hero-cta').getAttribute('aria-expanded') === 'true';

describe('HeroMacMenu — the keyboard', () => {
  beforeEach(() => {
    renderMenu();
  });

  it('moves focus into the menu when it opens, not one frame later', () => {
    openMenu();
    const items = rows();
    expect(items.length, 'the menu has rows to focus').toBeGreaterThan(0);
    expect(document.activeElement).toBe(items[0]);
  });

  it('closes on Escape and gives focus back to the trigger', () => {
    const trigger = openMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape even while focus is still on the trigger', () => {
    const trigger = openMenu();
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(isOpen()).toBe(false);
  });

  it('walks the rows with ArrowDown and ArrowUp, wrapping at both ends', () => {
    openMenu();
    const items = rows();
    expect(items.length, 'wrapping needs at least two rows to be observable').toBeGreaterThan(1);
    const last = items.length - 1;

    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);

    fireEvent.keyDown(items[1]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[0]);

    fireEvent.keyDown(items[0]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[last]);

    fireEvent.keyDown(items[last]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('jumps to the ends with Home and End', () => {
    openMenu();
    const items = rows();
    const last = items.length - 1;
    fireEvent.keyDown(items[0]!, { key: 'End' });
    expect(document.activeElement).toBe(items[last]);
    fireEvent.keyDown(items[last]!, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('opens from the trigger with ArrowDown', () => {
    const trigger = screen.getByTestId('hero-cta');
    expect(isOpen()).toBe(false);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(rows()[0]);
  });
});
