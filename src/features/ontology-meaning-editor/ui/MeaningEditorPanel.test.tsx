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
});
