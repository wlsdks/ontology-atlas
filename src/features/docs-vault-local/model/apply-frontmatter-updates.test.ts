import { describe, expect, it } from 'vitest';
import {
  VaultConflictError,
  applyFrontmatterUpdates,
  assertExpectedMtime,
} from './use-local-vault';

describe('applyFrontmatterUpdates', () => {
  it('기존 key 교체', () => {
    const raw = `---\nname: Old\ncategory: foo\n---\n\n# Title\n본문`;
    const result = applyFrontmatterUpdates(raw, { name: 'New' });
    expect(result).toBe(
      `---\nname: New\ncategory: foo\n---\n\n# Title\n본문`,
    );
  });

  it('없는 key append', () => {
    const raw = `---\nname: A\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, { status: 'active' });
    expect(result).toContain('status: active');
    expect(result).toContain('name: A');
    expect(result).toContain('\n\n본문');
  });

  it('null 은 key 제거', () => {
    const raw = `---\nname: A\ntmp: xxx\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, { tmp: null });
    expect(result).not.toContain('tmp:');
    expect(result).toContain('name: A');
  });

  // Follow-up to the 2026-07-26 walkthrough — the starter writes arrays in block style
  // (`capabilities:` + `  - …`), and the old implementation, which replaced only the key line, left
  // the previous item lines in the file and produced a document unreadable as standard YAML.
  it('블록 스타일 배열을 교체하면 옛 항목 줄이 남지 않는다', () => {
    const raw = `---\nkind: domain\ncapabilities:\n  - capabilities/a\n  - capabilities/b\ntitle: T\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, {
      capabilities: ['capabilities/a', 'capabilities/c'],
    });
    expect(result).toBe(
      `---\nkind: domain\ncapabilities: [capabilities/a, capabilities/c]\ntitle: T\n---\n\n본문`,
    );
  });

  it('블록 스타일 배열을 지우면 항목 줄까지 사라진다', () => {
    const raw = `---\nkind: domain\ncapabilities:\n  - capabilities/a\ntitle: T\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, { capabilities: null });
    expect(result).toBe(`---\nkind: domain\ntitle: T\n---\n\n본문`);
  });

  it('건드리지 않은 키의 블록 값은 그대로 둔다', () => {
    const raw = `---\nkind: domain\ncapabilities:\n  - capabilities/a\ntitle: Old\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, { title: 'New' });
    expect(result).toBe(
      `---\nkind: domain\ncapabilities:\n  - capabilities/a\ntitle: New\n---\n\n본문`,
    );
  });

  it('블록 객체의 자식 키를 최상위 키로 오인하지 않는다', () => {
    const raw = `---\nkind: domain\nmeta:\n  title: nested\ntitle: Old\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, { title: 'New' });
    expect(result).toBe(
      `---\nkind: domain\nmeta:\n  title: nested\ntitle: New\n---\n\n본문`,
    );
  });

  it('배열 serialize', () => {
    const raw = `---\nname: A\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, {
      tags: ['alpha', 'beta'],
    });
    expect(result).toContain('tags: [alpha, beta]');
  });

  it('숫자 / 불리언', () => {
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

  it('inline 1-depth 객체 (canvasPosition 등)', () => {
    const raw = `---\nname: A\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, {
      canvasPosition: { x: 100, y: 200 },
    });
    expect(result).toContain('canvasPosition: { x: 100, y: 200 }');
    expect(result).toContain('name: A');
  });

  it('객체 갱신 — 기존 inline 객체 교체', () => {
    const raw = `---\nname: A\ncanvasPosition: { x: 1, y: 2 }\n---\n\n본문`;
    const result = applyFrontmatterUpdates(raw, {
      canvasPosition: { x: 50, y: 60 },
    });
    expect(result).toContain('canvasPosition: { x: 50, y: 60 }');
    expect(result).not.toContain('x: 1, y: 2');
  });

  it('frontmatter 없던 문서에 새로 추가', () => {
    const raw = `# Title\n\n본문`;
    const result = applyFrontmatterUpdates(raw, {
      name: 'Added',
    });
    expect(result.startsWith('---\n')).toBe(true);
    expect(result).toContain('name: Added');
    expect(result).toContain('# Title');
  });

  it('공백 포함 문자열은 따옴표', () => {
    const raw = `---\nname: A\n---`;
    const result = applyFrontmatterUpdates(raw, {
      description: '줄띄우기 있는 문장',
    });
    expect(result).toContain('description: 줄띄우기 있는 문장');
    // In practice a space is fine — `needsQuote` covers only leading/trailing spaces and special characters.
  });

  it('본문 영향 없음', () => {
    const raw = `---\nname: A\n---\n\n# Title\n\n본문\n\n## 섹션\n내용`;
    const result = applyFrontmatterUpdates(raw, { status: 'x' });
    expect(result).toContain('# Title');
    expect(result).toContain('## 섹션');
    expect(result).toContain('내용');
  });
});

describe('assertExpectedMtime', () => {
  it('expectedMtime 이 없으면 기존 호출자 호환을 위해 검증을 건너뛴다', () => {
    expect(() => assertExpectedMtime('doc', undefined, 2000)).not.toThrow();
  });

  it('mtime 이 같으면 통과한다', () => {
    expect(() => assertExpectedMtime('doc', 2000, 2000)).not.toThrow();
  });

  it('mtime 이 다르면 VaultConflictError 로 silent overwrite 를 막는다', () => {
    expect(() => assertExpectedMtime('doc', 1000, 2000)).toThrow(
      VaultConflictError,
    );

    try {
      assertExpectedMtime('doc', 1000, 2000);
    } catch (err) {
      expect(err).toBeInstanceOf(VaultConflictError);
      expect((err as VaultConflictError).slug).toBe('doc');
      expect((err as VaultConflictError).expectedMtime).toBe(1000);
      expect((err as VaultConflictError).currentMtime).toBe(2000);
    }
  });
});
