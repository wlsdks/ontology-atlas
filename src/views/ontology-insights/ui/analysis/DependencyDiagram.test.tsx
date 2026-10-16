import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import kinds from '../../../../../messages/en/kinds.json';
import pages from '../../../../../messages/en/ontologyPages.json';
import type { AnalysisPair } from '../../lib/analysis-model';
import { DependencyDiagram } from './DependencyDiagram';

const node = (id: string): KnowledgeGraphNode => ({ id, title: id, kind: 'capability' }) as KnowledgeGraphNode;
const edge = (from: string, to: string): KnowledgeGraphEdge => ({ id: `${from}>${to}`, from, to, type: 'depends_on', projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: '' });
const edges = [edge('a1', 'b1'), edge('a1', 'b2'), edge('a2', 'b1'), edge('a2', 'b3'), edge('a3', 'b4'), edge('a3', 'b5'), edge('a4', 'b4')];
const byId = new Map(['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4', 'b5', 'A', 'B'].map(id => [id, node(id)]));
const pair: AnalysisPair = { id: 'A\0B', from: byId.get('A')!, to: byId.get('B')!, edges };

function Harness() {
  const [selected, setSelected] = useState(edges[0]);
  return <DependencyDiagram pair={pair} selected={selected} byId={byId} onSelect={setSelected} />;
}

describe('dependency diagram', () => {
  it('pages while a card is hovered without losing the drawing', () => {
    render(<NextIntlClientProvider locale="en" messages={{ kinds, ontologyPages: pages }}><Harness /></NextIntlClientProvider>);
    fireEvent.pointerEnter(document.querySelector('[data-dependency-node="from:a1"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Next declarations' }));
    const steps = screen.getAllByTestId('analysis-witness');
    expect(steps[0]).toHaveTextContent('05');
    expect(steps[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('analysis-dependency-diagram')).toBeInTheDocument();
  });
});
