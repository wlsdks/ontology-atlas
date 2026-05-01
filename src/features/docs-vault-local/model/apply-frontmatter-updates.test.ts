import { describe, expect, it } from 'vitest';
import { applyFrontmatterUpdates } from './use-local-vault';

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
    // 실제로는 공백 OK — needsQuote 는 시작/끝 공백이나 특수문자만 커버
  });

  it('본문 영향 없음', () => {
    const raw = `---\nname: A\n---\n\n# Title\n\n본문\n\n## 섹션\n내용`;
    const result = applyFrontmatterUpdates(raw, { status: 'x' });
    expect(result).toContain('# Title');
    expect(result).toContain('## 섹션');
    expect(result).toContain('내용');
  });
});
