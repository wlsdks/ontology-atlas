import { act, render, screen, waitFor } from '@testing-library/react';
import { useCallback } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workRuns } from '../model/work-run-store';
import { useLiftClearOfWorkCard, WORK_CARD_ATTRIBUTE } from './use-clear-of-work-card';

const FOLDER = '/Users/probe/Ontology Atlas/launch';

/** Boxes as a 1040×720 window lays them out: the start stack's foot runs 45px past the card's head. */
const STACK = { left: 312, right: 792, top: 396, bottom: 606 };
const CARD = { left: 624, right: 1024, top: 560, bottom: 704 };

/** Draws the element at its laid-out box moved by the translate on it and its ancestors, as a browser does. */
function placeAt(element: HTMLElement, box: typeof STACK) {
  element.getBoundingClientRect = () => {
    let shift = 0;
    for (let node: HTMLElement | null = element; node; node = node.parentElement) shift += Number.parseFloat(node.style.translate.split(' ')[1] ?? '0') || 0;
    return { ...box, top: box.top + shift, bottom: box.bottom + shift, x: box.left, y: box.top + shift, width: box.right - box.left, height: box.bottom - box.top, toJSON: () => ({}) };
  };
}

function Stack() {
  const stackOf = useCallback(() => document.querySelector<HTMLElement>('[data-testid="stack"]'), []);
  const liftPx = useLiftClearOfWorkCard(stackOf);
  return <div data-testid="layer" data-lift-px={liftPx}><div data-testid="stack" ref={(element) => { if (element) placeAt(element, STACK); }} /></div>;
}

function addCard(translate = '') {
  const card = document.createElement('div');
  card.setAttribute(WORK_CARD_ATTRIBUTE, '');
  card.dataset.state = 'open';
  card.style.translate = translate;
  placeAt(card, CARD);
  document.body.append(card);
  return card;
}

const lift = () => Number(screen.getByTestId('layer').dataset.liftPx);

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
  workRuns.enterFolderRoot(FOLDER);
});
afterEach(() => {
  workRuns.reset();
  document.querySelectorAll(`[${WORK_CARD_ATTRIBUTE}]`).forEach((card) => card.remove());
  vi.unstubAllGlobals();
});

const beginRun = () => act(() => {
  workRuns.beginMapping({ folder: FOLDER, folderName: 'launch', project: 'launch', agent: 'Claude Agent', figures: null, startedAt: 0 });
});

describe('a centred stack beside the open work card', () => {
  it('rises clear of a card drawn only after its seat opened', async () => {
    render(<Stack />);
    beginRun();
    await act(() => new Promise((resolve) => window.requestAnimationFrame(resolve)));
    expect(lift()).toBe(0);
    addCard();
    await waitFor(() => expect(lift()).toBe(STACK.bottom - CARD.top + 16));
  });

  it('measures where the card lands and where the stack stands, not where their motion draws them now', async () => {
    addCard('0px 8px');
    render(<Stack />);
    screen.getByTestId('layer').style.translate = '0px -30px';
    beginRun();
    await waitFor(() => expect(lift()).toBe(STACK.bottom - CARD.top + 16));
  });
});
