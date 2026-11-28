import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/shared/ui/controls/button';
import { WaitStage } from '@/shared/ui/status/wait-stage';
import { adoptBodyLabelFont, bodyLabelFontSettled, OntologyMap } from '@/widgets/ontology-map';
import type { SampleMapGraph } from '../lib/sample-map-graph';
import { useSampleMap } from '../model/use-sample-map';
import { SampleConceptPanel } from './SampleConceptPanel';

/** Longest the map waits for its label font: names size the layout, but a slow font must not hold the sample. */
const LABEL_FONT_WAIT_MS = 1_000;

/**
 * The map's room on `/sample`: the wait stage, the failure with its retry, or the map with the compact
 * panel. The room has a floor of its own height, so a short heading still leaves a map to press.
 */
export function SampleMapStage() {
  const sample = useSampleMap();
  return (
    <div
      data-testid="sample-map-stage"
      className="relative min-h-[max(28rem,calc(100dvh-22rem))] flex-1 overflow-hidden border-t border-[color:var(--color-divider)] bg-[color:var(--color-canvas)]"
    >
      {sample.status === 'ready' ? <SampleMap graph={sample.graph} /> : null}
      {sample.status === 'loading' ? <MapWait /> : null}
      {sample.status === 'failed' ? <MapFailed onRetry={sample.retry} /> : null}
    </div>
  );
}

function MapWait() {
  const t = useTranslations('mapEntry');
  return <WaitStage mark="orbit" title={t('mapComing')} detail={t('loadingDetail')} delayed data-testid="sample-map-wait" />;
}

function MapFailed({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('sampleMap');
  return (
    <WaitStage
      title={t('loadFailed')}
      data-testid="sample-map-failed"
      action={
        <Button type="button" variant="outline" className="mt-5" onClick={onRetry} data-testid="sample-map-retry">
          {t('retry')}
        </Button>
      }
    />
  );
}

function SampleMap({ graph }: { graph: SampleMapGraph }) {
  const tCanvas = useTranslations('topology.canvas');
  const tWalk = useTranslations('topologyWidgets.keyboardWalk');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fontReady = useLabelFontReady(graph);
  const select = useCallback((id: string) => setSelectedId(id), []);
  const clear = useCallback(() => setSelectedId(null), []);
  const facts = selectedId ? (graph.conceptById.get(selectedId) ?? null) : null;

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || selectedId === null) return;
    event.stopPropagation();
    clear();
  };

  if (!fontReady) return <MapWait />;
  return (
    // The map is a canvas with its own key walk; this only listens for the key that closes the panel.
    <div className="absolute inset-0" onKeyDown={closeOnEscape}>
      <OntologyMap
        nodes={graph.nodes}
        edges={graph.edges}
        focus={{ selectedSlug: facts ? facts.id : null }}
        dataSourceKey="sample:storefront"
        fitViewToken={0}
        relayoutToken={0}
        onSelect={select}
        onPaneClick={clear}
        canvasLabel={tCanvas('ariaLabel')}
        walkNoticeLabel={tWalk('deadEnd')}
      />
      <SampleConceptPanel facts={facts} onSelect={select} onClose={clear} />
    </div>
  );
}

/**
 * Holds the map until the label font settles: names size the layout, and a layout measured in another
 * face is laid out again, so a map drawn early would move every mark after its first frame.
 */
function useLabelFontReady(graph: SampleMapGraph): boolean {
  const labels = useMemo(() => graph.nodes.map((node) => node.label).join(' '), [graph]);
  const [ready, setReady] = useState(bodyLabelFontSettled);
  useEffect(() => {
    if (ready) return;
    let live = true;
    const giveUp = setTimeout(() => live && setReady(true), LABEL_FONT_WAIT_MS);
    void adoptBodyLabelFont(labels).then(() => {
      clearTimeout(giveUp);
      if (live) setReady(true);
    });
    return () => {
      live = false;
      clearTimeout(giveUp);
    };
  }, [labels, ready]);
  return ready;
}
