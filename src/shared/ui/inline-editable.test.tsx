import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InlineEditable } from './inline-editable';

describe('InlineEditable — readonly', () => {
  it('renders value without click handler when editable=false', () => {
    render(<InlineEditable value="고정 값" editable={false} onSave={() => {}} />);
    expect(screen.getByText('고정 값')).toBeInTheDocument();
  });

  it('readonly does not enter edit mode on click', () => {
    const onSave = vi.fn();
    const { container } = render(
      <InlineEditable value="x" editable={false} onSave={onSave} />,
    );
    const span = container.firstElementChild as HTMLElement;
    fireEvent.click(span);
    // input/textarea 가 나타나지 않아야 함
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('readonly empty value uses placeholder', () => {
    render(
      <InlineEditable value="" editable={false} onSave={() => {}} placeholder="클릭해서 추가" />,
    );
    expect(screen.getByText('클릭해서 추가')).toBeInTheDocument();
  });
});

describe('InlineEditable — editable', () => {
  it('clicking enters edit mode (single-line input)', () => {
    const { container } = render(
      <InlineEditable value="원본" editable onSave={() => {}} />,
    );
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(container.querySelector('input')).not.toBeNull();
  });

  it('multiline=true uses textarea instead of input', () => {
    const { container } = render(
      <InlineEditable value="원본" editable multiline onSave={() => {}} />,
    );
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(container.querySelector('textarea')).not.toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });

  it('Enter commits new value via onSave', async () => {
    const onSave = vi.fn();
    const { container } = render(
      <InlineEditable value="원본" editable onSave={onSave} />,
    );
    fireEvent.click(container.firstElementChild as HTMLElement);
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '바뀐 값' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('바뀐 값'));
  });

  it('Enter with same value skips onSave', async () => {
    const onSave = vi.fn();
    const { container } = render(
      <InlineEditable value="동일" editable onSave={onSave} />,
    );
    fireEvent.click(container.firstElementChild as HTMLElement);
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Escape cancels without onSave', async () => {
    const onSave = vi.fn();
    const { container } = render(
      <InlineEditable value="원본" editable onSave={onSave} />,
    );
    fireEvent.click(container.firstElementChild as HTMLElement);
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '취소될 값' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSave).not.toHaveBeenCalled();
    // edit 모드 종료 → input 사라짐
    expect(container.querySelector('input')).toBeNull();
  });

  it('empty value with allowEmpty=false cancels (no onSave)', async () => {
    const onSave = vi.fn();
    const { container } = render(
      <InlineEditable value="원본" editable onSave={onSave} />,
    );
    fireEvent.click(container.firstElementChild as HTMLElement);
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } }); // whitespace
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('empty value with allowEmpty=true commits empty string', async () => {
    const onSave = vi.fn();
    const { container } = render(
      <InlineEditable value="원본" editable allowEmpty onSave={onSave} />,
    );
    fireEvent.click(container.firstElementChild as HTMLElement);
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(''));
  });
});

describe('InlineEditable — multiline behavior', () => {
  it('multiline Enter without modifier does NOT commit (for newline)', () => {
    const onSave = vi.fn();
    const { container } = render(
      <InlineEditable value="원본" editable multiline onSave={onSave} />,
    );
    fireEvent.click(container.firstElementChild as HTMLElement);
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '한 줄\n두 줄' } });
    fireEvent.keyDown(ta, { key: 'Enter' });
    // multiline 은 Cmd/Ctrl+Enter 만 commit
    expect(onSave).not.toHaveBeenCalled();
  });

  it('multiline Cmd+Enter commits', async () => {
    const onSave = vi.fn();
    const { container } = render(
      <InlineEditable value="원본" editable multiline onSave={onSave} />,
    );
    fireEvent.click(container.firstElementChild as HTMLElement);
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '신규' } });
    fireEvent.keyDown(ta, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('신규'));
  });
});
