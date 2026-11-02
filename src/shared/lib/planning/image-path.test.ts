import { describe, expect, it } from 'vitest';
import { imageMimeType, resolvePlanningImage } from './image-path';

describe('resolvePlanningImage', () => {
  it('resolves a parent-relative image inside the selected root', () => {
    expect(resolvePlanningImage('specs/plan.md', '../images/한글%20화면.png')).toBe('images/한글 화면.png');
    expect(resolvePlanningImage('plan.md', './images/screen.png#preview')).toBe('images/screen.png');
    expect(resolvePlanningImage('plan.md', '100%25.png')).toBe('100%.png');
  });
  it('rejects traversal, roots, schemes, nulls, backslashes and ambiguous encodings', () => {
    for (const target of ['../../outside.png', '%2e%2e/%2e%2e/outside.png', '/etc/passwd', '//server/x.png', 'https://example.com/x.png', 'file:///tmp/x.png', 'data:image/png,x', '..%2f..%2fx.png', 'x%00.png', '..\\x.png', '%252e%252e/x.png', '%ZZ.png']) {
      expect(resolvePlanningImage('specs/plan.md', target), target).toBeNull();
    }
  });
  it('rejects unsafe document paths and unsupported image types', () => {
    expect(resolvePlanningImage('../secret.md', 'image.png')).toBeNull();
    expect(resolvePlanningImage('specs/plan.md', 'file.svg')).toBeNull();
    expect(resolvePlanningImage('specs/plan.md', 'file.pdf')).toBeNull();
  });
});

describe('imageMimeType', () => {
  it('requires both an allowed extension and a matching byte signature', () => {
    expect(imageMimeType('a.png', new Uint8Array([137,80,78,71,13,10,26,10]))).toBe('image/png');
    expect(imageMimeType('a.jpg', new Uint8Array([255,216,255,224]))).toBe('image/jpeg');
    expect(imageMimeType('a.webp', new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]))).toBe('image/webp');
    expect(imageMimeType('a.png', new Uint8Array([255,216,255,224]))).toBeNull();
    expect(imageMimeType('a.svg', new TextEncoder().encode('<svg onload="x()"/>'))).toBeNull();
    expect(imageMimeType('a.png', new Uint8Array([137,80]))).toBeNull();
  });
});

describe('boundedPlanningImage', () => {
  it('accepts only PNG and JPEG headers with dimensions within the decoding bound', async () => {
    const { boundedPlanningImage } = await import('./image-path');
    const png = new Uint8Array([137,80,78,71,13,10,26,10, 0,0,0,13, 73,72,68,82, 0,0,4,0, 0,0,3,0, 8,6,0,0,0, 0,0,0,0]);
    expect(boundedPlanningImage('a.png', png)).toBe('image/png');
    const huge = png.slice(); huge[16] = 0x7f;
    expect(boundedPlanningImage('huge.png', huge)).toBeNull();
    const jpeg = new Uint8Array([255,216,255,192,0,11,8,0,80,0,100,1,1,17,0,255,217]);
    expect(boundedPlanningImage('a.jpg', jpeg)).toBe('image/jpeg');
    expect(boundedPlanningImage('a.webp', new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]))).toBeNull();
    expect(boundedPlanningImage('bad.png', png.slice(0,20))).toBeNull();
  });
});
