import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'use-intl';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { applyFrontmatterUpdates } from '@/entities/docs-vault';
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';

import enMessages from '../../../../messages/en.json';
import koMessages from '../../../../messages/ko.json';
import { MeaningEditorPanel } from './MeaningEditorPanel';

const COPY = enMessages.meaningEditor;

const CANDIDATES = [
  { id: 'capability:mcp-server', slug: 'capabilities/mcp-server', title: 'MCP Server', kind: 'capability', names: ['MCP Server', 'MCP 서버'], domainTitle: 'Agent access' },
  { id: 'element:token-signer', slug: 'elements/token-signer', title: 'Token signer', kind: 'element', names: ['Token signer', '토큰 서명기'], domainTitle: 'Agent access' },
  { id: 'domain:billing', slug: 'domains/billing', title: 'Billing', kind: 'domain', names: ['Billing'] },
];

function renderPanel(overrides: Partial<ComponentProps<typeof MeaningEditorPanel>> = {}, locale: 'en' | 'ko' = 'en') {
  const props: ComponentProps<typeof MeaningEditorPanel> = {
    open: true,
    source: {
      id: 'capability:contextual-editing',
      slug: 'capabilities/contextual-editing',
      title: 'Contextual editing',
      kind: 'capability',
      frontmatter: { kind: 'capability' },
    },
    candidates: CANDIDATES,
    relations: [],
    onPreview: vi.fn(),
    onApply: vi.fn().mockResolvedValue(undefined),
    onEditIncoming: vi.fn(),
    onRemoveIncoming: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
  render(
    <IntlProvider locale={locale} messages={locale === 'en' ? enMessages : koMessages}>
      <MeaningEditorPanel {...props} />
    </IntlProvider>,
  );
  return props;
}

function pickTarget(query: string) {
  const field = screen.getByTestId('meaning-editor-target');
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: query } });
  fireEvent.click(screen.getAllByTestId('meaning-editor-target-option')[0]!);
}

describe('MeaningEditorPanel', () => {
  it('writes a dependency at once on Enter, and only with its reason', async () => {
    const props = renderPanel();
    pickTarget('mcp');
    const why = screen.getByTestId('meaning-editor-why');
    expect(screen.getByTestId('meaning-editor-apply')).toBeDisabled();
    expect(screen.getByText('What breaks in Contextual editing when MCP Server changes?')).toBeInTheDocument();
    fireEvent.change(why, { target: { value: 'Tool calls pass through the server.' } });
    fireEvent.keyDown(why, { key: 'Enter' });
    await waitFor(() => expect(props.onApply).toHaveBeenCalledTimes(1));
    const [plan, what, targetTitle] = vi.mocked(props.onApply).mock.calls[0]!;
    expect([what, targetTitle]).toEqual(['added', 'MCP Server']);
    expect(plan.updates).toMatchObject({
      dependencies: ['capabilities/mcp-server'],
      relation_notes: { 'capabilities/mcp-server': 'Tool calls pass through the server.' },
    });
  });

  it('finds a target by its name in either language and says its kind and domain', () => {
    renderPanel();
    const field = screen.getByTestId('meaning-editor-target');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '서명' } });
    const options = screen.getAllByTestId('meaning-editor-target-option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Token signer');
    expect(options[0]).toHaveTextContent('Element · Agent access');
  });

  it("keeps the field focused while a target is pressed, so WebKit's blur cannot close the list before the click", () => {
    renderPanel();
    const field = screen.getByTestId('meaning-editor-target');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'mcp' } });
    expect(fireEvent.mouseDown(screen.getAllByTestId('meaning-editor-target-option')[0]!)).toBe(false);
  });

  it('offers only the targets a relation allows for the kind', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('meaning-editor-relation-contains'));
    const field = screen.getByTestId('meaning-editor-target');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '' } });
    expect(screen.getAllByTestId('meaning-editor-target-option').map((option) => option.textContent)).toEqual([
      expect.stringContaining('Token signer'),
    ]);
  });

  it('lists declared and incoming relations in plain words, each with edit and remove', async () => {
    const props = renderPanel({
      relations: [
        { relation: 'dependsOn', direction: 'out', otherId: 'capability:mcp-server', otherTitle: 'MCP Server', why: 'Tool calls pass through it.' },
        { relation: 'contains', direction: 'in', otherId: 'domain:billing', otherTitle: 'Billing', why: null },
      ],
    });
    const rows = screen.getAllByTestId('meaning-editor-relation-row');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Depends on MCP Server'),
      expect.stringContaining('Billing contains this'),
    ]);
    fireEvent.click(screen.getAllByTestId('meaning-editor-row-edit')[1]!);
    expect(props.onEditIncoming).toHaveBeenCalledWith(expect.objectContaining({ otherId: 'domain:billing' }));
    fireEvent.click(screen.getAllByTestId('meaning-editor-remove')[1]!);
    await waitFor(() => expect(props.onRemoveIncoming).toHaveBeenCalledTimes(1));
  });

  it('keeps the help lines that name what reads each value', () => {
    renderPanel({}, 'ko');
    expect(screen.getByTestId('meaning-editor-relation-help')).toHaveTextContent(koMessages.meaningEditor.relationHelp);
    expect(screen.getByTestId('meaning-editor-target-help')).toBeInTheDocument();
  });

  it('says so instead of writing when nothing changed', async () => {
    const props = renderPanel({
      source: {
        id: 'capability:contextual-editing',
        slug: 'capabilities/contextual-editing',
        title: 'Contextual editing',
        kind: 'capability',
        frontmatter: { kind: 'capability', relates: ['capabilities/mcp-server'] },
      },
      relations: [{ relation: 'relates', direction: 'out', otherId: 'capability:mcp-server', otherTitle: 'MCP Server', why: null }],
    });
    fireEvent.click(screen.getAllByTestId('meaning-editor-row-edit')[0]!);
    fireEvent.click(screen.getByTestId('meaning-editor-apply'));
    expect(await screen.findByRole('alert')).toHaveTextContent(COPY.noChanges);
    expect(props.onApply).not.toHaveBeenCalled();
  });
});

describe('removing the last relation of a key writes no empty key', () => {
  const WIKI_PAGES = [
    '---',
    'uid: c9f6fc1b-8321-47ce-bd51-78b1f1c1389f',
    'slug: capabilities/wiki-pages',
    'kind: capability',
    'title: Wiki pages',
    'domain: domains/meaning-layer',
    'elements: []',
    'path: mcp/src/library/wiki-schema.mjs',
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
      <IntlProvider locale="en" messages={enMessages}>
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
          relations={[{ relation, direction: 'out', otherId: target.id, otherTitle: target.title, why: null }]}
          onPreview={vi.fn()}
          onApply={onApply}
          onEditIncoming={vi.fn()}
          onRemoveIncoming={vi.fn()}
          onClose={vi.fn()}
        />
      </IntlProvider>,
    );
    fireEvent.click(screen.getByTestId('meaning-editor-remove'));
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
});
