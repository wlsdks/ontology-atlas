import { beforeEach, describe, expect, it } from 'vitest';

import { vaultImageUrl } from './vault-image-url';

const created: Blob[] = [];

beforeEach(() => {
  created.length = 0;
  Object.assign(URL, {
    createObjectURL: (blob: Blob) => {
      created.push(blob);
      return `blob:atlas/${created.length}`;
    },
    revokeObjectURL: () => {},
  });
});

describe('an image source for the reader', () => {
  it('gives an SVG as a data: URL, so opening it in a tab leaves this origin', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const url = await vaultImageUrl(new File([svg], 'diagram.svg', { type: 'image/svg+xml' }));
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(atob(url.slice('data:image/svg+xml;base64,'.length))).toBe(svg);
    expect(created).toHaveLength(0);
  });

  it('keeps a raster image as a blob URL', async () => {
    expect(await vaultImageUrl(new File(['x'], 'shot.png', { type: 'image/png' }))).toBe('blob:atlas/1');
  });
});
