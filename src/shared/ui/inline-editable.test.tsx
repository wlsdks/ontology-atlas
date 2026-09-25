import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    // No input/textarea should appear.
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('readonly heading keeps its content as the accessible name; the field label is not a name', () => {
    render(
      <InlineEditable as="h1" value="Online Store" editable={false} onSave={() => {}} ariaLabel="프로젝트 이름" />,
    );
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveAccessibleName('Online Store');
    expect(heading).not.toHaveAttribute('aria-label');
    expect(heading).not.toHaveAttribute('aria-description');
  });

  it('editable view names the button by its content and describes it by the field', () => {
    render(
      <InlineEditable as="h1" value="Online Store" editable onSave={() => {}} ariaLabel="프로젝트 이름" />,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAccessibleName('Online Store');
    expect(button).toHaveAttribute('aria-description', '프로젝트 이름');
    expect(button).not.toHaveAttribute('aria-label');
  });

  // 2026-09-25 sweep: the button role sat on the `h1` and replaced it, so an editable page title
  // was no heading at all. The heading keeps its role; the press is a block inside it.
  it('an editable heading stays a heading of its level, with the press inside it', () => {
    render(
      <InlineEditable as="h1" value="Online Store" editable onSave={() => {}} ariaLabel="프로젝트 이름" />,
    );
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveAccessibleName('Online Store');
    expect(heading).not.toHaveAttribute('role');
    expect(heading).not.toHaveAttribute('tabindex');
    const button = within(heading).getByRole('button', { name: 'Online Store' });
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: '프로젝트 이름' })).toHaveValue('Online Store');
  });

  it('a non-heading host is the button itself, as before', () => {
    render(<InlineEditable as="p" value="A description" editable onSave={() => {}} />);
    expect(screen.getByRole('button', { name: 'A description' }).tagName).toBe('P');
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
    // Leaving edit mode removes the input.
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
    // In multiline, only Cmd/Ctrl+Enter commits.
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
