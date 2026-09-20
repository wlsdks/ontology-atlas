import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import type { RoundPlaceService, RoundRecord } from '@/entities/library-round';

import en from '../../../../../messages/en.json';
import { NewRoundSheet } from './NewRoundSheet';

const CONNECTORS = [
  { id: 'c1', name: 'slack', enabled: true },
  { id: 'c2', name: 'confluence', enabled: true },
  { id: 'c3', name: 'archived', enabled: false },
];

function open(props: Partial<Parameters<typeof NewRoundSheet>[0]> = {}) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={en}>
      <NewRoundSheet
        open
        onClose={() => {}}
        connectors={[]}
        agentReady
        folders={['sources/planning', 'wiki/releases']}
        onSave={vi.fn(async () => true)}
        existingNames={[]}
        passRunning={false}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return {
    name: () => screen.getByTestId('library-rounds-rename').textContent ?? '',
    readback: () => screen.getByTestId('library-rounds-readback').textContent ?? '',
    cost: () => screen.getByTestId('library-rounds-cost'),
    scope: () => screen.getByTestId('library-rounds-scope').textContent ?? '',
    close: view.unmount,
  };
}

/** Add a service place through the menu, the way a person does. */
function addPlace(connector: string) {
  fireEvent.click(screen.getByTestId('library-rounds-add-place'));
  const menu = screen.getByTestId('library-rounds-add-menu');
  fireEvent.click(within(menu).getByRole('menuitem', { name: new RegExp(connector, 'i') }));
}

function chooseFolder(folder: string) {
  fireEvent.click(screen.getByTestId('library-rounds-folders'));
  const menu = screen.getByTestId('library-rounds-folder-menu');
  fireEvent.click(within(menu).getByText(folder));
}

function switchUnit(unit: string) {
  fireEvent.click(within(screen.getByTestId('library-rounds-cadence-unit')).getByRole('radio', { name: unit }));
}

/** Drag the rail to a fraction across, as `page.mouse` does in the e2e. */
function dragRailTo(fraction: number) {
  const rail = screen.getByTestId('library-rounds-cadence-rail');
  rail.setPointerCapture = () => {};
  rail.releasePointerCapture = () => {};
  rail.hasPointerCapture = () => true;
  rail.getBoundingClientRect = () => ({ left: 0, width: 400, top: 0, height: 44, right: 400, bottom: 44, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  fireEvent.pointerDown(rail, { button: 0, clientX: 400 * fraction, pointerId: 1 });
  fireEvent.pointerUp(rail, { pointerId: 1 });
}

describe('the new round sheet', () => {
  it('offers a name no sibling is already wearing', () => {
    const first = open();
    expect(first.name()).toContain('Pages still match');
    first.close();

    const second = open({ existingNames: ['Pages still match'] });
    expect(second.name()).toContain('Pages still match 2');
    second.close();

    const third = open({ existingNames: ['Pages still match', 'Pages still match 2'] });
    expect(third.name()).toContain('Pages still match 3');
    third.close();
  });

  it('the title is the name, and clicking it turns into the field', () => {
    const view = open();
    fireEvent.click(screen.getByTestId('library-rounds-rename'));
    const field = screen.getByTestId('library-rounds-name') as HTMLInputElement;
    expect(field.value).toContain('Pages still match');
    fireEvent.change(field, { target: { value: 'Release watch' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(screen.getByTestId('library-rounds-rename').textContent).toContain('Release watch');
    view.close();
  });

  it('promises the immediate first pass only while nothing else is running', () => {
    const idle = open();
    expect(idle.readback()).toContain('It runs once as soon as you save.');
    idle.close();

    const busy = open({ passRunning: true });
    expect(busy.readback()).toContain('starts at its next due time');
    expect(busy.readback()).not.toContain('as soon as you save');
    busy.close();
  });

  it('the kind is derived from the places, and the legacy fields come from the first service', async () => {
    const onSave = vi.fn(async (_round: RoundRecord) => true);
    const view = open({ connectors: CONNECTORS, onSave });

    // No service place: the local check, and the sheet never asked which kind it was.
    addPlace('Slack');
    addPlace('Confluence');
    fireEvent.change(screen.getByTestId('library-rounds-place-0-where'), { target: { value: '#release-room' } });
    fireEvent.change(screen.getByTestId('library-rounds-place-0-query'), { target: { value: 'today' } });
    fireEvent.change(screen.getByTestId('library-rounds-place-1-where'), { target: { value: 'ENG space' } });

    fireEvent.click(screen.getByTestId('library-rounds-allow'));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    const record = onSave.mock.calls[0][0];
    expect(record.kind).toBe('service');
    expect(record.connectorId).toBe('c1');
    expect(record.connectorName).toBe('slack');
    expect(record.query).toBe('today');
    const services = (record.places ?? []).filter((place): place is RoundPlaceService => place.kind === 'service');
    expect(services).toHaveLength(2);
    expect(services[1]).toMatchObject({ connectorName: 'confluence', location: 'ENG space' });
    view.close();
  });

  it('a round with no service place is the local check', async () => {
    const onSave = vi.fn(async (_round: RoundRecord) => true);
    const view = open({ connectors: CONNECTORS, onSave });
    fireEvent.click(screen.getByTestId('library-rounds-allow'));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    const record = onSave.mock.calls[0][0];
    expect(record.kind).toBe('consistency');
    expect(record.connectorId).toBeUndefined();
    view.close();
  });

  it('the readback names every place and the folders, and reads back the drag', () => {
    const view = open({ connectors: CONNECTORS });
    addPlace('Slack');
    fireEvent.change(screen.getByTestId('library-rounds-place-0-where'), { target: { value: '#release-room' } });
    addPlace('Confluence');
    fireEvent.change(screen.getByTestId('library-rounds-place-1-where'), { target: { value: 'ENG space' } });
    chooseFolder('sources/planning');

    // 40% across the five-detent minute rail is ten minutes — the owner's own example.
    switchUnit('Minutes');
    dragRailTo(0.4);

    const sentence = view.readback();
    expect(sentence).toContain('Every 10 minutes');
    expect(sentence).toContain('Slack #release-room, Confluence ENG space');
    expect(sentence).toContain('sources/planning');
    expect(sentence).toContain('redraft');
    expect(sentence).toContain('One agent turn per pass.');
    view.close();
  });

  it('the scope names each service place with its location', () => {
    const view = open({ connectors: CONNECTORS });
    addPlace('Slack');
    fireEvent.change(screen.getByTestId('library-rounds-place-0-where'), { target: { value: '#release-room' } });
    expect(view.scope()).toContain('call Slack to read #release-room, never to write there');
    view.close();
  });

  it('the cost line turns amber once a service round would spend more than 48 turns a day', () => {
    /*
     * Spec §2.3: the same sentence, different ink. 1440 turns a day is a real bill, and the
     * sheet must not let a drag that feels good out-argue the invoice.
     */
    const view = open({ connectors: CONNECTORS });
    addPlace('Slack');
    expect(view.cost()).toHaveAttribute('data-cost-tone', 'quiet');

    switchUnit('Minutes');
    dragRailTo(1); // 30 minutes → 48 a day, still the quiet ink.
    expect(view.cost()).toHaveAttribute('data-cost-tone', 'quiet');
    expect(view.cost().textContent).toContain('48');

    dragRailTo(0.6); // 15 minutes → 96 a day.
    expect(view.cost()).toHaveAttribute('data-cost-tone', 'alarming');
    view.close();
  });

  it('a local check spends no turn, so its cost line never alarms', () => {
    const view = open();
    switchUnit('Minutes');
    dragRailTo(0);
    expect(view.cost()).toHaveAttribute('data-cost-tone', 'quiet');
    view.close();
  });
});
