import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import messages from '../../../../messages/en/mapStructure.json';
import kinds from '../../../../messages/en/kinds.json';
import { DomainStructureMap } from './DomainStructureMap';
import type { OntologyMapNode, OntologyMapEdge } from '../ui/OntologyMap';

const node = (id: string, kind: OntologyMapNode['kind']): OntologyMapNode => ({ id, label: id, kind, size: 1, x: 0, y: 0, isHub: false, ownerKey: null, recentlyUpdated: false, fullDegree: 1, descendantCount: 1 });
const edge = (source: string, target: string): OntologyMapEdge => ({ source, target, relationType: 'contains', relationQuality: null, evidenceCount: 0, kind: 'contains', declaredBySlug: null });
const nodes = [node('Project', 'project'), node('Domain', 'domain'), node('Capability', 'capability'), node('Element', 'element')];
const edges = [edge('Project', 'Domain'), edge('Domain', 'Capability'), edge('Domain', 'Element'), edge('Capability', 'Element')];

describe('reading from a structure scope', () => {
  it('leaves the outside scope when an external selection reveals a rooted concept', () => {
    const renderMap = (selectedId: string | null) => <NextIntlClientProvider locale="en" messages={{ mapStructure: messages, kinds }}><DomainStructureMap nodes={[...nodes, node('Orphan', 'element')]} edges={edges} selectedId={selectedId} onRead={() => {}} reducedMotion indexExpanded={false} inspectorOpen={false} /></NextIntlClientProvider>;
    const view = render(renderMap(null));
    Object.defineProperty(screen.getByTestId('domain-structure-map'), 'scrollTo', { value: () => {} });
    fireEvent.click(screen.getByRole('button', { name: /Outside the recorded structure/ }));
    expect(screen.getByTestId('structure-scope-title')).toHaveTextContent('Outside the recorded structure');
    view.rerender(renderMap('Capability'));
    expect(screen.getByTestId('structure-scope-title')).toHaveTextContent('Capability');
    expect(screen.getByRole('button', { name: 'Read Element' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Read Orphan' })).not.toBeInTheDocument();
  });
  it('keeps the chosen parent when reading a child that has another shorter ancestry', () => {
    function Harness() {
      const [selected, setSelected] = useState<string | null>(null);
      return <NextIntlClientProvider locale="en" messages={{ mapStructure: messages, kinds }}><DomainStructureMap nodes={nodes} edges={edges} selectedId={selected} onRead={setSelected} reducedMotion indexExpanded={false} inspectorOpen={false} /></NextIntlClientProvider>;
    }
    render(<Harness />);
    Object.defineProperty(screen.getByTestId("domain-structure-map"), "scrollTo", { value: () => {} });
    fireEvent.click(screen.getByRole('button', { name: 'Open Domain' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Capability' }));
    fireEvent.click(screen.getByRole('button', { name: 'Read Element' }));
    expect(screen.getByTestId('structure-scope-title')).toHaveTextContent('Capability');
    expect(screen.getByRole('navigation', { name: 'Structure path' })).toHaveTextContent('Capability');
  });
});
