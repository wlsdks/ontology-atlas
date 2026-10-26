import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../../messages/en.json';
import type { SourceCandidate } from '@/entities/docs-vault';
import { FindDocumentsDialog, type FindDocumentsDialogProps } from './FindDocumentsDialog';

const candidate = (relativePath: string): SourceCandidate => ({
  rootPath: '/granted', rootLabel: 'Granted', relativePath,
  name: relativePath.split('/').at(-1)!, extension: 'pdf', size: 1024, mtime: 1,
});
const first = candidate('plans/Requirements.pdf');
const second = candidate('reports/Launch.pdf');
const third = candidate('reports/Costs.pdf');

function mount() {
  const props: FindDocumentsDialogProps = {
    open: true, onClose: vi.fn(), declinedCount: 0, onForgetDeclined: vi.fn(),
    busy: false, onAdd: vi.fn(),
    outcome: { candidates: [first, second, third], truncated: false, unreadableRoots: [], projectRootsReachable: true, walkedRoots: [] },
  };
  const view = (value: FindDocumentsDialogProps) => <NextIntlClientProvider locale="en" messages={{ library: messages.library }}><FindDocumentsDialog {...value} /></NextIntlClientProvider>;
  return { props, ...render(view(props)), view };
}

describe('document candidate filtering', () => {
  it('matches metadata without losing selections hidden by another search', () => {
    const { props } = mount();
    const query = screen.getByRole('searchbox');
    fireEvent.change(query, { target: { value: ' REQUIREMENTS ' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(query, { target: { value: 'reports/' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('find-documents-candidate-reports/Launch.pdf'));
    fireEvent.click(screen.getByTestId('find-documents-add'));
    expect(props.onAdd).toHaveBeenCalledWith([first, second], [third]);
  });

  it('does not remember candidates hidden by the filter as declined', () => {
    const { props } = mount();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'requirements' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByTestId('find-documents-add'));
    expect(props.onAdd).toHaveBeenCalledWith([first], []);
  });

  it('clears a no-match query and resets query and selections when reopened', () => {
    const { props, rerender, view } = mount();
    const query = screen.getByRole('searchbox');
    fireEvent.change(query, { target: { value: 'not-present' } });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('find-documents-clear-search'));
    expect(query).toHaveFocus();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    fireEvent.click(screen.getByTestId('find-documents-candidate-plans/Requirements.pdf'));
    fireEvent.change(query, { target: { value: 'reports' } });
    rerender(view({ ...props, open: false }));
    rerender(view(props));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByTestId('find-documents-add')).toBeDisabled();
    expect(screen.getAllByRole('checkbox').every((box) => !(box as HTMLInputElement).checked)).toBe(true);
  });
});
