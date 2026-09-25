import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { applyFrontmatterUpdates } from '@/entities/docs-vault';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';

import enMessages from '../../../../messages/en.json';
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
    expect(screen.getByRole('alert')).toHaveTextContent('변경할 내용이 없어요');
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

/**
 * **The bytes a removal writes** (owner inspection, 2026-09-26). Removing the only `relates` entry of
 * `capabilities/wiki-pages` from the map's edge panel left `relates: []` in the file; removing a
 * relation that carried the only reason left `relation_notes: {  }`. The panel's plan is applied
 * exactly as the vault session applies it (`applyFrontmatterUpdates`), and the file must read as if
 * the relation had never been written.
 */
describe('removing the last relation of a key writes no empty key', () => {
  const WIKI_PAGES = [
    '---',
    'uid: c9f6fc1b-8321-47ce-bd51-78b1f1c1389f',
    'slug: capabilities/wiki-pages',
    'kind: capability',
    'title: Wiki pages',
    'domain: domains/meaning-layer',
    'elements: []',
    'path: mcp/src/wiki-schema.mjs',
    'dependencies: [elements/frontmatter-parser]',
    'relation_notes: { elements/frontmatter-parser: "wiki-schema.mjs imports parseFrontmatter from parser.mjs." }',
    '---',
    '',
    'A second page format in the same folder for prose that must cite its sources.',
    '',
  ].join('\n');

  async function removeThroughPanel(
    raw: string,
    relation: 'relates' | 'dependsOn',
    target: { id: string; slug: string; title: string; kind: string },
  ): Promise<string> {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <MeaningEditorPanel
          open
          source={{
            id: 'capability:wiki-pages',
            slug: 'capabilities/wiki-pages',
            title: 'Wiki pages',
            kind: 'capability',
            frontmatter: parseFrontmatter(raw).frontmatter,
          }}
          candidates={[target]}
          initialRelation={relation}
          initialTargetId={target.id}
          onPreview={vi.fn()}
          onApply={onApply}
          onClose={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId('meaning-editor-remove'));
    fireEvent.click(screen.getByTestId('meaning-editor-apply'));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    return applyFrontmatterUpdates(raw, onApply.mock.calls[0]?.[0].updates);
  }

  it('deletes `relates:` with its only entry', async () => {
    const raw = WIKI_PAGES.replace(
      'relation_notes: {',
      'relates: [capabilities/library-workspace]\nrelation_notes: {',
    );
    const written = await removeThroughPanel(raw, 'relates', {
      id: 'capability:library-workspace',
      slug: 'capabilities/library-workspace',
      title: 'Library workspace',
      kind: 'capability',
    });

    expect(written).toBe(WIKI_PAGES);
    expect(written).not.toMatch(/^relates:/m);
  });

  it('deletes `dependencies:` and `relation_notes:` when the only dependency carried the only reason', async () => {
    const written = await removeThroughPanel(WIKI_PAGES, 'dependsOn', {
      id: 'element:frontmatter-parser',
      slug: 'elements/frontmatter-parser',
      title: 'Frontmatter parser',
      kind: 'element',
    });

    expect(written).toBe(
      WIKI_PAGES.replace(/^dependencies: .*\n/m, '').replace(/^relation_notes: .*\n/m, ''),
    );
    expect(written).not.toMatch(/^dependencies:/m);
    expect(written).not.toMatch(/^relation_notes:/m);
    // The kind's own scaffold list is not a relation this edit touched.
    expect(written).toMatch(/^elements: \[\]$/m);
  });

  it('says in the review that nothing is left, instead of printing `[]`', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <MeaningEditorPanel
          open
          source={{
            id: 'capability:wiki-pages',
            slug: 'capabilities/wiki-pages',
            title: 'Wiki pages',
            kind: 'capability',
            frontmatter: { relates: ['capabilities/library-workspace'] },
          }}
          candidates={[
            {
              id: 'capability:library-workspace',
              slug: 'capabilities/library-workspace',
              title: 'Library workspace',
              kind: 'capability',
            },
          ]}
          initialRelation="relates"
          initialTargetId="capability:library-workspace"
          onPreview={vi.fn()}
          onApply={vi.fn()}
          onClose={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId('meaning-editor-remove'));

    const value = screen.getByTestId('ontology-change-review-field-value');
    expect(value).toHaveTextContent('capabilities/library-workspace');
    expect(value).toHaveTextContent(enMessages.ontologyChangeReview.noValue);
    expect(value.textContent).not.toContain('[]');
  });
});
