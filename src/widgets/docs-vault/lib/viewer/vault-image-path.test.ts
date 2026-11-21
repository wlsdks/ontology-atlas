import { describe, expect, it } from 'vitest';
import { vaultPathFromDoc } from './vault-image-path';

describe('vaultPathFromDoc', () => {
  it('resolves a sibling image against the document folder', () => {
    expect(vaultPathFromDoc('wiki/handover', './img/a.png')).toBe('wiki/img/a.png');
    expect(vaultPathFromDoc('wiki/handover', 'img/a.png')).toBe('wiki/img/a.png');
  });

  it('walks up through ..', () => {
    expect(vaultPathFromDoc('wiki/deep/page', '../../assets/a.png')).toBe('assets/a.png');
  });

  it('keeps a root document at the vault root', () => {
    expect(vaultPathFromDoc('README', 'a.png')).toBe('a.png');
  });

  it('cannot climb above the vault root', () => {
    expect(vaultPathFromDoc('wiki/page', '../../../a.png')).toBe('a.png');
  });

  it('keeps an absolute or file: path inside the document folder, never at the disk root', () => {
    expect(vaultPathFromDoc('wiki/page', '/etc/passwd')).toBe('wiki/etc/passwd');
    expect(vaultPathFromDoc('wiki/page', 'file:///etc/passwd')).toBe('wiki/file:/etc/passwd');
  });
});
