import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  BRAND_MARK_ASSET,
  BRAND_MARK_NATIVE_SIZE,
  BrandMark,
  type BrandMarkDetail,
} from '@/shared/ui/brand-mark';
import {
  MASCOT_MASTERS,
  MASCOT_MOTION_ROWS,
  MASCOT_TRAY_TEMPLATES,
  mascotDetailForLogicalSize,
  readMascotMasters,
  readMascotMotionRows,
  readMascotTrayTemplates,
} from '../../scripts/build-brand-assets.mjs';
import { ICON_RASTER_PLAN } from '../../scripts/build-brand-raster.mjs';

const DETAILS: BrandMarkDetail[] = ['full', 'compact', 'micro'];

describe('pixel mascot brand parity', () => {
  it('the runtime component and source contract share the same three-tier ladder', () => {
    expect(Object.keys(MASCOT_MASTERS)).toEqual(DETAILS);
    for (const detail of DETAILS) {
      const { container } = render(createElement(BrandMark, { detail }));
      const image = container.querySelector('img');
      expect(image?.getAttribute('data-brand-native-size')).toBe(
        String(MASCOT_MASTERS[detail].width),
      );
      expect(BRAND_MARK_NATIVE_SIZE[detail]).toBe(MASCOT_MASTERS[detail].width);
      expect(BRAND_MARK_ASSET[detail]).toContain(`mascot-${detail}`);
    }
  });

  it('every canonical master is the declared RGBA pixel grid', () => {
    const masters = readMascotMasters();
    expect(Object.keys(masters)).toEqual(DETAILS);
    for (const detail of DETAILS) {
      expect(masters[detail]).toMatchObject(MASCOT_MASTERS[detail]);
      expect(masters[detail].base64.length).toBeGreaterThan(100);
    }
  });

  it('motion is three finite six-frame rows, not an ambient animation catalogue', () => {
    const rows = readMascotMotionRows();
    expect(Object.keys(rows)).toEqual(['walk', 'read', 'success']);
    for (const [state, row] of Object.entries(rows)) {
      expect(row).toMatchObject(MASCOT_MOTION_ROWS[state as keyof typeof MASCOT_MOTION_ROWS]);
      expect(row.width / row.frames).toBe(64);
      expect(row.height).toBe(64);
    }
  });

  it('macOS menu-bar art is a separate black/clear 1x and 2x template pair', () => {
    const templates = readMascotTrayTemplates();
    expect(templates.oneX).toMatchObject(MASCOT_TRAY_TEMPLATES.oneX);
    expect(templates.twoX).toMatchObject(MASCOT_TRAY_TEMPLATES.twoX);
    expect(templates.twoX.width).toBe(templates.oneX.width * 2);
    expect(templates.twoX.height).toBe(templates.oneX.height * 2);
  });

  it('logical sizes select the authored miniatures before Retina scaling', () => {
    expect(mascotDetailForLogicalSize(16)).toBe('micro');
    expect(mascotDetailForLogicalSize(18)).toBe('micro');
    expect(mascotDetailForLogicalSize(20)).toBe('compact');
    expect(mascotDetailForLogicalSize(48)).toBe('compact');
    expect(mascotDetailForLogicalSize(64)).toBe('full');
  });

  it('OS icon plans keep the same art at one logical size across density', () => {
    const plan = new Map(ICON_RASTER_PLAN.map(([name, detail]) => [name, detail]));
    expect(plan.get('icon-16')).toBe('micro');
    expect(plan.get('micro-32')).toBe('micro');
    expect(plan.get('icon-32')).toBe('compact');
    expect(plan.get('compact-64')).toBe('compact');
    expect(plan.get('icon-64')).toBe('full');
  });
});
