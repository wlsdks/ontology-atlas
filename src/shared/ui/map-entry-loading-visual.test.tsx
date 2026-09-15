import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import { MapEntryLoadingVisual } from './map-entry-loading-visual';

describe('MapEntryLoadingVisual', () => {
  it('server-renders its known full-screen wait ready to move before hydration', () => {
    const html = renderToString(<MapEntryLoadingVisual title="Loading the map" description="Preparing the selected vault" />);
    expect(html).toContain('data-map-wait-motion="running"');
    expect(html).toContain('id="main"');
    expect(html).toContain('Preparing the selected vault');
  });

  it('centers one honest loading status with a decorative light cluster', () => {
    render(
      <MapEntryLoadingVisual
        title="지도를 불러오는 중이에요."
        description="폴더의 개념과 관계를 읽어 화면에 맞추고 있어요."
      />,
    );
    const status = screen.getByRole('status');
    expect(status.closest('[aria-busy="true"]')).toBeNull();
    expect(status).toHaveAttribute('data-map-loading-layout', 'centered');
    const cluster = screen.getByTestId('map-wait-cluster');
    expect(cluster).toHaveAttribute('aria-hidden', 'true');
    expect(cluster.querySelectorAll('.map-wait-point')).toHaveLength(6);
    expect(cluster.querySelector('rect, path')).toBeNull();
    expect(screen.queryByTestId('brand-waiting-mark')).toBeNull();
    expect(status).toHaveTextContent('지도를 불러오는 중이에요.');
  });
});
