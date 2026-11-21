import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { StartingState } from './transcript-states';
import type { ChatT } from '../types';

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect() {}
  });
});

const t = ((key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key)) as unknown as ChatT;

function renderStage(props: Partial<ComponentProps<typeof StartingState>> = {}) {
  return render(
    <StartingState t={t} download={null} suggestions={[]} seatedRequestWaiting={false} openingLead={null} heldLead={null} onTakeBack={() => {}} {...props} />,
  );
}

it('draws a download as its own stage: a sweeping bar, the megabytes on disk, and download as the current step', () => {
  renderStage({ download: { mb: 148 } });
  const stage = screen.getByTestId('acp-starting');
  expect(stage).toHaveAttribute('data-starting-stage', 'download');
  expect(within(stage).getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  expect(screen.getByTestId('acp-first-run-progress')).toHaveTextContent('firstRun.progress:{"mb":148}');
  expect(screen.getByTestId('acp-starting-step-download')).toHaveAttribute('data-step-state', 'current');
  expect(screen.getByTestId('acp-starting-step-connect')).toHaveAttribute('data-step-state', 'ahead');
});

it('makes connecting the current step and draws no bar when nothing downloads', () => {
  renderStage();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.queryByTestId('acp-starting-step-download')).toBeNull();
  expect(screen.getByTestId('acp-starting-step-connect')).toHaveAttribute('data-step-state', 'current');
});

it('names waiting requests under the send step, and only a held one can be taken back', () => {
  const onTakeBack = vi.fn();
  renderStage({ openingLead: 'Build a first map', heldLead: 'Then check the map', onTakeBack });
  const send = screen.getByTestId('acp-starting-step-send');
  expect(within(send).getByTestId('acp-starting-opening')).toHaveTextContent('Build a first map');
  expect(within(send).getByTestId('acp-starting-held')).toHaveTextContent('Then check the map');
  expect(screen.getAllByTestId('acp-starting-take-back')).toHaveLength(1);
  fireEvent.click(screen.getByTestId('acp-starting-take-back'));
  expect(onTakeBack).toHaveBeenCalledOnce();
});
