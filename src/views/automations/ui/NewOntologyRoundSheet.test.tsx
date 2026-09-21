import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en.json';
import { NewOntologyRoundSheet } from './NewOntologyRoundSheet';

function open(onSave: Parameters<typeof NewOntologyRoundSheet>[0]['onSave'], onClose = vi.fn()) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={en}>
      <NewOntologyRoundSheet open onClose={onClose} onSave={onSave} />
    </NextIntlClientProvider>,
  );
  return { ...view, onClose, onSave };
}

describe('the new ontology round sheet', () => {
  it('keeps the draft usable when saving rejects', async () => {
    const view = open(vi.fn(async () => {
      throw new Error('disk unavailable');
    }));
    fireEvent.change(screen.getByTestId('ontology-automation-name'), { target: { value: 'Source gaps' } });

    fireEvent.click(screen.getByTestId('ontology-automation-allow'));

    expect(await screen.findByRole('alert')).toHaveTextContent(en.automations.saveFailed);
    expect(screen.getByTestId('ontology-automation-allow')).toBeEnabled();
    expect(screen.getByTestId('ontology-automation-name')).toHaveValue('Source gaps');
    view.unmount();
  });

  it('cannot be dismissed while saving is pending', async () => {
    let finish!: (saved: boolean) => void;
    const view = open(vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; })));

    fireEvent.click(screen.getByTestId('ontology-automation-allow'));
    expect(screen.getByTestId('ontology-automation-allow')).toHaveTextContent('Scheduling…');
    expect(screen.getByTestId('ontology-automation-name')).toBeDisabled();
    fireEvent.click(screen.getByTestId('ontology-automation-allow'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('ontology-automation-sheet').parentElement!);
    expect(view.onClose).not.toHaveBeenCalled();
    expect(view.onSave).toHaveBeenCalledTimes(1);

    finish(true);
    await vi.waitFor(() => expect(view.onClose).toHaveBeenCalledTimes(1));
    view.unmount();
  });
});
