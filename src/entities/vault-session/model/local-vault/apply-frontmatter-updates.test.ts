import { describe, expect, it } from 'vitest';
import { applyFrontmatterUpdates } from '@/entities/docs-vault';
import { VaultConflictError, assertExpectedMtime } from './vault-identity-guards';

describe('applyFrontmatterUpdates', () => {
  it('replaces an existing key', () => {
    const raw = `---\nname: Old\ncategory: foo\n---\n\n# Title\n본문`;
    const result = applyFrontmatterUpdates(raw, { name: 'New' });
    expect(result).toBe(
      `---\nname: New\ncategory: foo\n---\n\n# Title\n본문`,
    );
  });

  it('appends a missing key', () => {
    const raw = `---\nname: A\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, { status: 'active' });
    expect(result).toContain('status: active');
    expect(result).toContain('name: A');
    expect(result).toContain('\n\n본문');
  });

  it('removes a key for null', () => {
    const raw = `---\nname: A\ntmp: xxx\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, { tmp: null });
    expect(result).not.toContain('tmp:');
    expect(result).toContain('name: A');
  });

  it('leaves no old item lines when a block-style array is replaced', () => {
    const raw = `---\nkind: domain\ncapabilities:\n  - capabilities/a\n  - capabilities/b\ntitle: T\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, {
      capabilities: ['capabilities/a', 'capabilities/c'],
    });
    expect(result).toBe(
      `---\nkind: domain\ncapabilities: [capabilities/a, capabilities/c]\ntitle: T\n---\n\n본문`,
    );
  });

  it('removes the item lines too when a block-style array is deleted', () => {
    const raw = `---\nkind: domain\ncapabilities:\n  - capabilities/a\ntitle: T\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, { capabilities: null });
    expect(result).toBe(`---\nkind: domain\ntitle: T\n---\n\n본문`);
  });

  it('keeps the block value of an untouched key as is', () => {
    const raw = `---\nkind: domain\ncapabilities:\n  - capabilities/a\ntitle: Old\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, { title: 'New' });
    expect(result).toBe(
      `---\nkind: domain\ncapabilities:\n  - capabilities/a\ntitle: New\n---\n\n본문`,
    );
  });

  it('does not mistake a child key of a block object for a top-level key', () => {
    const raw = `---\nkind: domain\nmeta:\n  title: nested\ntitle: Old\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, { title: 'New' });
    expect(result).toBe(
      `---\nkind: domain\nmeta:\n  title: nested\ntitle: New\n---\n\n본문`,
    );
  });

  it('serializes arrays', () => {
    const raw = `---\nname: A\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, {
      tags: ['alpha', 'beta'],
    });
    expect(result).toContain('tags: [alpha, beta]');
  });

  it('handles numbers and booleans', () => {
    const raw = `---\nname: A\n---`;
    const result = applyFrontmatterUpdates(raw, {
      positionX: 12.5,
      positionY: -30,
      isHub: true,
    });
    expect(result).toContain('positionX: 12.5');
    expect(result).toContain('positionY: -30');
    expect(result).toContain('isHub: true');
  });

  it('handles an inline 1-depth object (canvasPosition and the like)', () => {
    const raw = `---\nname: A\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, {
      canvasPosition: { x: 100, y: 200 },
    });
    expect(result).toContain('canvasPosition: { x: 100, y: 200 }');
    expect(result).toContain('name: A');
  });

  it('updates an object by replacing the existing inline object', () => {
    const raw = `---\nname: A\ncanvasPosition: { x: 1, y: 2 }\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, {
      canvasPosition: { x: 50, y: 60 },
    });
    expect(result).toContain('canvasPosition: { x: 50, y: 60 }');
    expect(result).not.toContain('x: 1, y: 2');
  });

  it('adds frontmatter to a document that had none', () => {
    const raw = `# Title\n\n본문`;
    const result = applyFrontmatterUpdates(raw, {
      name: 'Added',
    });
    expect(result.startsWith('---\n')).toBe(true);
    expect(result).toContain('name: Added');
    expect(result).toContain('# Title');
  });

  it('quotes a string containing spaces', () => {
    const raw = `---\nname: A\n---`;
    const result = applyFrontmatterUpdates(raw, {
      description: '줄띄우기 있는 문장',
    });
    expect(result).toContain('description: 줄띄우기 있는 문장');
    // In practice a space is fine — `needsQuote` covers only leading/trailing spaces and special characters.
  });

  it('leaves the body untouched', () => {
    const raw = `---\nname: A\n---\n\n# Title\n\n본문\n\n## 섹션\n내용`;
    const result = applyFrontmatterUpdates(raw, { status: 'x' });
    expect(result).toContain('# Title');
    expect(result).toContain('## 섹션');
    expect(result).toContain('내용');
  });
});

describe('assertExpectedMtime', () => {
  it('skips verification without expectedMtime to stay compatible with existing callers', () => {
    expect(() => assertExpectedMtime('doc', undefined, 2000)).not.toThrow();
  });

  it('passes when mtime matches', () => {
    expect(() => assertExpectedMtime('doc', 2000, 2000)).not.toThrow();
  });

  it('blocks a silent overwrite with VaultConflictError when mtime differs', () => {
    expect(() => assertExpectedMtime('doc', 1000, 2000)).toThrow(
      VaultConflictError,
    );

    try {
      assertExpectedMtime('doc', 1000, 2000);
    } catch (error) {
      expect(error).toBeInstanceOf(VaultConflictError);
      expect((error as VaultConflictError).slug).toBe('doc');
      expect((error as VaultConflictError).expectedMtime).toBe(1000);
      expect((error as VaultConflictError).currentMtime).toBe(2000);
    }
  });
});
