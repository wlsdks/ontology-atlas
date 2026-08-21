import { describe, expect, it, vi } from 'vitest';

import {
  drawPreviewEdge,
  isPreviewEndpoint,
  isPreviewEndpointHidden,
} from './preview-edge';

function context() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    setLineDash: vi.fn(),
    globalAlpha: 1,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
  } as unknown as CanvasRenderingContext2D;
}

describe('draft relation preview edge', () => {
  it('temporarily reveals only the two preview endpoints through the density gate', () => {
    const preview = { sourceId: 'capability:a', targetId: 'capability:b' };
    expect(isPreviewEndpoint(preview, 'capability:a')).toBe(true);
    expect(isPreviewEndpoint(preview, 'capability:b')).toBe(true);
    expect(isPreviewEndpoint(preview, 'capability:c')).toBe(false);
    expect(isPreviewEndpointHidden(true, preview, 'capability:b')).toBe(false);
    expect(isPreviewEndpointHidden(true, preview, 'capability:c')).toBe(true);
    expect(isPreviewEndpointHidden(false, preview, 'capability:c')).toBe(false);
  });
  it('draws a dashed directional line for a draft without moving graph geometry', () => {
    const ctx = context();
    drawPreviewEdge(ctx, {
      source: { x: 10, y: 20 },
      target: { x: 110, y: 20 },
      sourceRadius: 10,
      targetRadius: 14,
      alpha: 0.8,
      solid: false,
      color: '#7c83ff',
    });

    expect(ctx.setLineDash).toHaveBeenCalledWith([6, 5]);
    expect(ctx.moveTo).toHaveBeenCalledWith(23, 20);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 93, 20);
    expect(ctx.fill).toHaveBeenCalledTimes(1); // arrowhead = direction, not colour alone
  });

  it('settles to a solid edge on commit', () => {
    const ctx = context();
    drawPreviewEdge(ctx, {
      source: { x: 0, y: 0 },
      target: { x: 50, y: 0 },
      sourceRadius: 0,
      targetRadius: 0,
      alpha: 1,
      solid: true,
      color: '#7c83ff',
    });
    expect(ctx.setLineDash).toHaveBeenCalledWith([]);
    expect(ctx.setLineDash).not.toHaveBeenCalledWith([0.1, 0.1]);
  });
});
