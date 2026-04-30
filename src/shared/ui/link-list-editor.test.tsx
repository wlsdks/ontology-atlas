import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LinkListEditor } from './link-list-editor';

describe('LinkListEditor — readonly', () => {
  it('renders link row per value (anchor target=_blank rel=noopener)', () => {
    render(
      <LinkListEditor
        value={[{ label: '대시보드', url: 'https://dash.example' }]}
        editable={false}
        onChange={() => {}}
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://dash.example');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(screen.getByText('대시보드')).toBeInTheDocument();
  });

  it('renders null when no value + no emptyHint', () => {
    const { container } = render(
      <LinkListEditor value={[]} editable={false} onChange={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders emptyHint when value empty + readonly', () => {
    render(
      <LinkListEditor value={[]} editable={false} onChange={() => {}} emptyHint="아직 링크 없음" />,
    );
    expect(screen.getByText('아직 링크 없음')).toBeInTheDocument();
  });

  it('readonly hides remove button + 추가 toggle', () => {
    render(
      <LinkListEditor
        value={[{ label: 'a', url: 'https://a' }]}
        editable={false}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByLabelText(/제거/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('링크 추가')).not.toBeInTheDocument();
  });
});

describe('LinkListEditor — editable', () => {
  it('renders remove button per row + 링크 추가 toggle', () => {
    render(
      <LinkListEditor
        value={[{ label: '대시보드', url: 'https://dash' }]}
        editable
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('대시보드 제거')).toBeInTheDocument();
    expect(screen.getByLabelText('링크 추가')).toBeInTheDocument();
  });

  it('removeAt fires onChange with item filtered by index', () => {
    const onChange = vi.fn();
    render(
      <LinkListEditor
        value={[
          { label: 'a', url: 'https://a' },
          { label: 'b', url: 'https://b' },
        ]}
        editable
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('a 제거'));
    expect(onChange).toHaveBeenCalledWith([{ label: 'b', url: 'https://b' }]);
  });

  it('Enter commits when both fields filled', () => {
    const onChange = vi.fn();
    render(
      <LinkListEditor value={[]} editable onChange={onChange} />,
    );
    fireEvent.click(screen.getByLabelText('링크 추가'));
    const labelInput = screen.getByPlaceholderText(/라벨/) as HTMLInputElement;
    const urlInput = screen.getByPlaceholderText('https://...') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: '대시보드' } });
    fireEvent.change(urlInput, { target: { value: 'https://example.com' } });
    fireEvent.keyDown(urlInput, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith([
      { label: '대시보드', url: 'https://example.com' },
    ]);
  });

  it('commit cancels (no onChange) when label or url empty', () => {
    const onChange = vi.fn();
    render(
      <LinkListEditor value={[]} editable onChange={onChange} />,
    );
    fireEvent.click(screen.getByLabelText('링크 추가'));
    const labelInput = screen.getByPlaceholderText(/라벨/) as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: '라벨만' } });
    fireEvent.keyDown(labelInput, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Escape cancels editing without commit', () => {
    const onChange = vi.fn();
    render(
      <LinkListEditor value={[]} editable onChange={onChange} />,
    );
    fireEvent.click(screen.getByLabelText('링크 추가'));
    const labelInput = screen.getByPlaceholderText(/라벨/) as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'x' } });
    fireEvent.keyDown(labelInput, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    // Esc 후 입력 영역 사라짐 → '링크 추가' toggle 다시 노출
    expect(screen.getByLabelText('링크 추가')).toBeInTheDocument();
  });
});
