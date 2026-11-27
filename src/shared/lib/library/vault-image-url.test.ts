import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handOverVaultFile, vaultImageUrl } from './open-vault-file';

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

function handoff() {
  return { open: vi.fn(), save: vi.fn() };
}

describe('handing a vault file to the person', () => {
  it.each(['report.html', 'report.HTM', 'diagram.svg', 'page.xhtml', 'feed.xml', 'tool.exe', 'README', 'x.constructor'])(
    'saves %s to downloads instead of opening it in this origin',
    (name) => {
      const how = handoff();
      expect(handOverVaultFile(new File(['<script>alert(1)</script>'], name, { type: 'text/html' }), how)).toBe('saved');
      expect(how.open).not.toHaveBeenCalled();
      expect(how.save).toHaveBeenCalledWith('blob:atlas/1', name);
      expect(created[0]?.type).toBe('application/octet-stream');
    },
  );

  it.each([
    ['paper.PDF', 'application/pdf'],
    ['shot.png', 'image/png'],
    ['photo.jpg', 'image/jpeg'],
    ['notes.md', 'text/plain;charset=utf-8'],
    ['config.yml', 'text/plain;charset=utf-8'],
  ])('opens %s as %s', (name, type) => {
    const how = handoff();
    expect(handOverVaultFile(new File(['x'], name), how)).toBe('opened');
    expect(how.open).toHaveBeenCalledWith('blob:atlas/1');
    expect(created[0]?.type).toBe(type);
  });

  it('shows a file by the type its name allows, not the type it claims', () => {
    handOverVaultFile(new File(['<script>alert(1)</script>'], 'evil.png', { type: 'text/html' }), handoff());
    expect(created[0]?.type).toBe('image/png');
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
