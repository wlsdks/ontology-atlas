import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChipListEditor } from './chip-list-editor';

describe('ChipListEditor — readonly', () => {
  it('renders chip per value (no remove button)', () => {
    render(
      <ChipListEditor value={['react', 'typescript']} editable={false} onChange={() => {}} />,
    );
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('typescript')).toBeInTheDocument();
    expect(screen.queryByLabelText(/제거/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('새 항목 추가')).not.toBeInTheDocument();
  });

  it('renders null when no value + no emptyHint', () => {
    const { container } = render(
      <ChipListEditor value={[]} editable={false} onChange={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders emptyHint when value empty + readonly', () => {
    render(
      <ChipListEditor value={[]} editable={false} onChange={() => {}} emptyHint="아직 비어 있어요" />,
    );
    expect(screen.getByText('아직 비어 있어요')).toBeInTheDocument();
  });
});

describe('ChipListEditor — editable', () => {
  it('renders remove button per chip + 추가 toggle', () => {
    render(
      <ChipListEditor value={['react']} editable onChange={() => {}} />,
    );
    expect(screen.getByLabelText('react 제거')).toBeInTheDocument();
    expect(screen.getByLabelText('새 항목 추가')).toBeInTheDocument();
  });

  it('removeAt fires onChange with item filtered', () => {
    const onChange = vi.fn();
    render(
      <ChipListEditor value={['a', 'b', 'c']} editable onChange={onChange} />,
    );
    fireEvent.click(screen.getByLabelText('b 제거'));
    expect(onChange).toHaveBeenCalledWith(['a', 'c']);
  });

  it('Enter commits new draft (skipping duplicates + empty)', () => {
    const onChange = vi.fn();
    render(
      <ChipListEditor value={['react']} editable onChange={onChange} />,
    );
    fireEvent.click(screen.getByLabelText('새 항목 추가'));
    const input = screen.getByPlaceholderText('추가') as HTMLInputElement;
    // 중복 — 무시
    fireEvent.change(input, { target: { value: 'react' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    // 새 값 — 추가
    fireEvent.click(screen.getByLabelText('새 항목 추가'));
    const input2 = screen.getByPlaceholderText('추가') as HTMLInputElement;
    fireEvent.change(input2, { target: { value: 'typescript' } });
    fireEvent.keyDown(input2, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['react', 'typescript']);
  });
});

describe('ChipListEditor — variant', () => {
  it('default variant uses neutral colors (헌장 §11)', () => {
    const { container } = render(
      <ChipListEditor value={['x']} editable={false} onChange={() => {}} />,
    );
    const chip = container.querySelector('.flex span') as HTMLElement;
    expect(chip.className).toContain('var(--color-divider)');
  });

  it('indigo variant applies indigo alpha (헌장 §11 — 단일 인디고)', () => {
    const { container } = render(
      <ChipListEditor value={['x']} editable={false} onChange={() => {}} variant="indigo" />,
    );
    const chip = container.querySelector('.flex span') as HTMLElement;
    expect(chip.className).toContain('rgba(94,106,210,0.08)');
  });
});
