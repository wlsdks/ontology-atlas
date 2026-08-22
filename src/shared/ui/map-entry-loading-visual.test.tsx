import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MapEntryLoadingVisual } from './map-entry-loading-visual';

describe('MapEntryLoadingVisual', () => {
  it('centers one honest loading status with a reduced-motion-safe circuit spinner', () => {
    render(
      <MapEntryLoadingVisual
        title="지도를 불러오는 중이에요."
        description="폴더의 개념과 관계를 읽어 화면에 맞추고 있어요."
      />,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveAttribute('data-map-loading-layout', 'centered');
    expect(screen.getByTestId('map-entry-loading-spinner')).toHaveClass(
      'motion-reduce:animate-none',
    );
    expect(status).toHaveTextContent('지도를 불러오는 중이에요.');
  });
});
