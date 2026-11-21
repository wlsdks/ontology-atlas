import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MiddleCutName } from './middle-cut-name';

const parts = () => [...screen.getByTestId('file').children].map((part) => part.textContent);

describe('a file name whose middle gives way', () => {
  it('keeps the end whole and describes the name by its full path', () => {
    render(<MiddleCutName path="sources/field-notes/2026-04-warehouse-returns-review.md" keepEnd={12} testId="file" />);
    expect(parts()).toEqual(['2026-04-warehouse-retur', 'ns-review.md']);
    expect(screen.getByTestId('file')).toHaveAttribute('title', 'sources/field-notes/2026-04-warehouse-returns-review.md');
    expect(screen.getByTestId('file')).toHaveAccessibleDescription('sources/field-notes/2026-04-warehouse-returns-review.md');
  });

  it('writes a name up to its whole length uncut', () => {
    render(<MiddleCutName path="wiki/architecture.md" keepEnd={8} wholeUpTo={16} testId="file" />);
    expect(parts()).toEqual(['architecture.md']);
  });
});
