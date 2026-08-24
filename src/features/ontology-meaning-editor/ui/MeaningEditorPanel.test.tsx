import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import { MeaningEditorPanel } from './MeaningEditorPanel';

describe('MeaningEditorPanel', () => {
  it('관계 하나의 변경안을 먼저 보여 주고 승인 뒤에만 apply를 부른다', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <MeaningEditorPanel
          open
          source={{
            id: 'capability:contextual-editing',
            slug: 'capabilities/contextual-editing',
            title: 'Contextual Meaning Editing',
            kind: 'capability',
            frontmatter: { relates: ['capabilities/mcp-server'] },
          }}
          candidates={[
            {
              id: 'capability:mcp-server',
              slug: 'capabilities/mcp-server',
              title: 'MCP Server',
              kind: 'capability',
            },
          ]}
          initialRelation="relates"
          initialTargetId="capability:mcp-server"
          initialWhy="도구 요청이 이 서버를 지난다."
          onPreview={vi.fn()}
          onApply={onApply}
          onClose={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('meaning-editor-review'));
    expect(screen.getByTestId('meaning-editor-change-review')).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('meaning-editor-apply'));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply.mock.calls[0]?.[0].changeSet.relation).toMatchObject({
      from: 'capabilities/contextual-editing',
      type: 'related_to',
      to: 'capabilities/mcp-server',
    });
  });

  it('기존 관계 끊기도 변경안을 거친 뒤에만 apply한다', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <MeaningEditorPanel
          open
          source={{
            id: 'capability:contextual-editing',
            slug: 'capabilities/contextual-editing',
            title: 'Contextual Meaning Editing',
            kind: 'capability',
            frontmatter: { dependencies: ['capabilities/mcp-server'] },
          }}
          candidates={[
            {
              id: 'capability:mcp-server',
              slug: 'capabilities/mcp-server',
              title: 'MCP Server',
              kind: 'capability',
            },
          ]}
          initialRelation="dependsOn"
          initialTargetId="capability:mcp-server"
          onPreview={vi.fn()}
          onApply={onApply}
          onClose={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByTestId('meaning-editor-remove'));
    expect(screen.getByTestId('meaning-editor-change-review')).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('meaning-editor-apply'));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply.mock.calls[0]?.[0].changeSet.operation).toBe('remove');
  });

  it('아무것도 바꾸지 않으면 빈 검토 화면 대신 이유를 말한다', () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <MeaningEditorPanel
          open
          source={{
            id: 'capability:contextual-editing',
            slug: 'capabilities/contextual-editing',
            title: 'Contextual Meaning Editing',
            kind: 'capability',
            frontmatter: { relates: ['capabilities/mcp-server'] },
          }}
          candidates={[
            {
              id: 'capability:mcp-server',
              slug: 'capabilities/mcp-server',
              title: 'MCP Server',
              kind: 'capability',
            },
          ]}
          initialRelation="relates"
          initialTargetId="capability:mcp-server"
          onPreview={vi.fn()}
          onApply={vi.fn()}
          onClose={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByTestId('meaning-editor-review'));
    expect(screen.queryByTestId('meaning-editor-change-review')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('변경할 내용이 없습니다');
  });

  it('쓰기를 마친 뒤 다시 열면 처음 단계로 돌아가고 버튼이 풀린다', async () => {
    // The panel outlives `onClose` (exit animation) and HomePage keys it by node
    // id, so a reopen reuses this instance. Before the fix it came back showing
    // the already-written change with the confirm button frozen in its busy state
    // and every control -- including "edit again" -- disabled.
    const onApply = vi.fn().mockResolvedValue(undefined);
    const props = {
      source: {
        id: 'capability:contextual-editing',
        slug: 'capabilities/contextual-editing',
        title: 'Contextual Meaning Editing',
        kind: 'capability',
        frontmatter: { relates: ['capabilities/mcp-server'] },
      },
      candidates: [
        {
          id: 'capability:mcp-server',
          slug: 'capabilities/mcp-server',
          title: 'MCP Server',
          kind: 'capability',
        },
      ],
      initialRelation: 'relates' as const,
      initialTargetId: 'capability:mcp-server',
      initialWhy: '도구 요청이 이 서버를 지난다.',
      onPreview: vi.fn(),
      onApply,
      onClose: vi.fn(),
    };
    const view = (open: boolean) => (
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <MeaningEditorPanel open={open} {...props} />
      </NextIntlClientProvider>
    );

    const { rerender } = render(view(true));
    fireEvent.click(screen.getByTestId('meaning-editor-review'));
    fireEvent.click(screen.getByTestId('meaning-editor-apply'));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));

    // The caller closes; the instance stays mounted for its exit animation.
    rerender(view(false));
    rerender(view(true));

    await waitFor(() =>
      expect(screen.getByTestId('meaning-editor-panel')).toHaveAttribute(
        'data-meaning-editor-step',
        'edit',
      ),
    );
    expect(screen.getByTestId('meaning-editor-review')).not.toBeDisabled();
  });
});
