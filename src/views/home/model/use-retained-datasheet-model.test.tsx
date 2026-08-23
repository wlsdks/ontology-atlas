import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRetainedDatasheetModel } from './use-retained-datasheet-model';

type Datasheet = { nodeId: string; title: string };
type HarnessProps = { live: Datasheet | null; selectedNodeId: string | null };

describe('useRetainedDatasheetModel', () => {
  it('keeps the newest live model through the panel exit window', () => {
    const { result, rerender } = renderHook<Datasheet | null, HarnessProps>(
      ({ live, selectedNodeId }: HarnessProps) =>
        useRetainedDatasheetModel(live, selectedNodeId),
      {
        initialProps: {
          live: { nodeId: 'capability:a', title: 'first' },
          selectedNodeId: 'capability:a',
        } satisfies HarnessProps,
      },
    );

    rerender({ live: { nodeId: 'capability:a', title: 'latest' }, selectedNodeId: 'capability:a' });
    expect(result.current).toEqual({ nodeId: 'capability:a', title: 'latest' });

    rerender({ live: null, selectedNodeId: null });
    expect(result.current).toEqual({ nodeId: 'capability:a', title: 'latest' });
  });

  it('does not bleed an exiting node into a new selection before its model arrives', () => {
    const { result, rerender } = renderHook<Datasheet | null, HarnessProps>(
      ({ live, selectedNodeId }: HarnessProps) =>
        useRetainedDatasheetModel(live, selectedNodeId),
      {
        initialProps: {
          live: { nodeId: 'capability:a', title: 'A' },
          selectedNodeId: 'capability:a',
        } satisfies HarnessProps,
      },
    );

    rerender({ live: null, selectedNodeId: 'capability:b' });
    expect(result.current).toBeNull();

    rerender({ live: { nodeId: 'capability:b', title: 'B' }, selectedNodeId: 'capability:b' });
    expect(result.current).toEqual({ nodeId: 'capability:b', title: 'B' });

    rerender({ live: null, selectedNodeId: null });
    expect(result.current).toEqual({ nodeId: 'capability:b', title: 'B' });
  });
});
