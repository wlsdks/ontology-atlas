import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../../../../messages/en.json';
import type { LibrarySourceRow } from '@/entities/docs-vault';

import { DeskReport } from './DeskReport';

function row(path: string): LibrarySourceRow {
  return { path, name: path.split('/').pop()!, format: 'md', bytes: 10, mtime: 1, state: 'compiled', citedBy: [] };
}

function renderReport(text: string, paths: readonly string[]) {
  const onOpenSource = vi.fn();
  render(<NextIntlClientProvider locale="en" messages={en}>
    <DeskReport report={{ question: 'Where is it written?', searchId: 1, listingVersion: 'v', vaultScope: 'folder', text,
      coverage: 'Wiki 1/1', limits: '', generatedAt: '2026-11-20T09:00:00Z' }}
    coverageCompact="" coverageInfo={null} sources={paths.map(row)} dockOpen={false} reducedMotion
    onOpenSource={onOpenSource} onFileReport={null} filingReport={false} fileReportNote={null} />
  </NextIntlClientProvider>);
  return { report: screen.getByTestId('question-desk-report-markdown'), onOpenSource };
}

function presses(report: HTMLElement) {
  return [...report.querySelectorAll<HTMLButtonElement>('button[data-source-path]')];
}

function place(press: HTMLElement) {
  return press.querySelector('[data-citation-place]')!.textContent;
}

describe('Question desk report citations', () => {
  it('names same-named files by the shortest trailing path that tells them apart, and opens the one named', () => {
    const { report, onOpenSource } = renderReport(
      'One [[src:sources/a/notes.md#l3]]. Two [[src:sources/b/notes.md#l9]]. Three [[src:sources/old/a/notes.md#l4]]. Four [[src:sources/plan.md#l1]].',
      ['sources/a/notes.md', 'sources/b/notes.md', 'sources/old/a/notes.md', 'sources/plan.md'],
    );
    const shown = presses(report);
    expect(shown.map(place)).toEqual(['sources/a/notes.md · line 3', 'b/notes.md · line 9', 'old/a/notes.md · line 4', 'plan.md · line 1']);
    expect(shown.map((press) => press.title)).toEqual(['sources/a/notes.md#l3', 'sources/b/notes.md#l9', 'sources/old/a/notes.md#l4', 'sources/plan.md#l1']);
    fireEvent.click(shown[1]!);
    expect(onOpenSource).toHaveBeenLastCalledWith('sources/b/notes.md', 'l9');
    fireEvent.click(shown[2]!);
    expect(onOpenSource).toHaveBeenLastCalledWith('sources/old/a/notes.md', 'l4');
  });

  it('keeps the true place beside a label that names another file', () => {
    const { report, onOpenSource } = renderReport('Read [[src:sources/b/notes.md#l9|a/notes.md line 3]].',
      ['sources/a/notes.md', 'sources/b/notes.md']);
    const [press] = presses(report);
    expect(press!.firstChild).toHaveTextContent('a/notes.md line 3');
    expect(place(press!)).toBe('b/notes.md · line 9');
    expect(press).toHaveAttribute('title', 'sources/b/notes.md#l9');
    expect(press).toHaveAccessibleDescription('sources/b/notes.md#l9');
    fireEvent.click(press!);
    expect(onOpenSource).toHaveBeenCalledWith('sources/b/notes.md', 'l9');
  });

  it('shortens only a canonical line of at most seven digits and leaves a doubled anchor inert', () => {
    const twenty = 'l12345678901234567890';
    const { report, onOpenSource } = renderReport([
      'Upper [[src:sources/plan.md#L17]].',
      'Padded [[src:sources/plan.md#l017]].',
      `Long [[src:sources/plan.md#${twenty}]].`,
      'Eight [[src:sources/plan.md#l12345678]].',
      'Seven [[src:sources/plan.md#l1234567]].',
      'Doubled [[src:sources/plan.md#l5#l9]].',
      'Doubled and labelled [[src:sources/plan.md#l5#l9|line five]].',
    ].join('\n\n'), ['sources/plan.md']);
    const shown = presses(report);
    expect(shown.map((press) => press.dataset.sourceAnchor)).toEqual(['l017', twenty, 'l12345678', 'l1234567']);
    expect(shown.slice(0, 3).map(place)).toEqual(['sources/plan.md#l017', `sources/plan.md#${twenty}`, 'sources/plan.md#l12345678']);
    expect(place(shown[3]!)).toBe('plan.md · line 1234567');
    fireEvent.click(shown[0]!);
    expect(onOpenSource).toHaveBeenLastCalledWith('sources/plan.md', 'l017');
    const inert = within(report).getAllByTestId('question-desk-report-citation-unavailable');
    expect(inert.map((span) => span.textContent!.trim())).toEqual([
      'sources/plan.md#L17 (unavailable)',
      'sources/plan.md#l5#l9 (unavailable)',
      'line five sources/plan.md#l5#l9 (unavailable)',
    ]);
    for (const span of inert) expect(span.closest('button')).toBeNull();
  });

  it('drops raw HTML instead of rendering it as elements or as text', () => {
    const { report } = renderReport([
      'Before <iframe src="https://example.com/frame"></iframe> and <b onclick="alert(1)">bold</b> after.',
      '',
      '<script>alert(1)</script>',
      '',
      '<iframe src="https://example.com/block"></iframe>',
    ].join('\n'), ['sources/plan.md']);
    expect(report.querySelector('iframe, script, b, [onclick]')).toBeNull();
    expect(report.textContent).not.toMatch(/<|onclick|alert|example\.com/u);
    expect(report).toHaveTextContent('Before and bold after.');
  });
});
