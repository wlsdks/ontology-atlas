import { describe, expect, it } from 'vitest';
import { buildTopologyFromVault } from './build-topology-from-vault';

function loader(map: Record<string, string>) {
  return async (slug: string) => {
    if (!(slug in map)) throw new Error(`no such slug: ${slug}`);
    return map[slug];
  };
}

describe('buildTopologyFromVault', () => {
  it('projects/*.md 를 Project[] 로 변환', async () => {
    const raws: Record<string, string> = {
      'projects/reactor': `---\nname: Arc Reactor\ncategory: iam-platform\nisHub: true\ndependencies: [iam, aslan-maps]\ntags: [infra, auth]\n---\n\n# Arc Reactor\n\nIAM 허브.`,
      'projects/iam': `---\nname: IAM\ncategory: iam-platform\n---\n\n인증·권한 관리.`,
      'projects/aslan-maps': `---\nname: Aslan Maps\ncategory: aslan-maps\n---`,
    };
    const result = await buildTopologyFromVault({
      projectSlugs: Object.keys(raws),
      loadRaw: loader(raws),
    });
    expect(result.projects).toHaveLength(3);
    const reactor = result.projects.find((p) => p.slug === 'reactor')!;
    expect(reactor.isHub).toBe(true);
    expect(reactor.dependencies).toEqual(['iam', 'aslan-maps']);
    expect(reactor.tags).toContain('infra');
    expect(reactor.name).toBe('Arc Reactor');
    expect(reactor.description).toContain('IAM 허브');
    // 카테고리 auto-synth
    expect(result.categories.map((c) => c.slug).sort()).toEqual([
      'aslan-maps',
      'iam-platform',
    ]);
    expect(result.danglingRefs).toEqual([]);
  });

  it('dangling dependency 경고', async () => {
    const raws = {
      'projects/reactor': `---\nname: Reactor\ncategory: iam\ndependencies: [iam, missing-dep]\n---`,
      'projects/iam': `---\nname: IAM\ncategory: iam\n---`,
    };
    const result = await buildTopologyFromVault({
      projectSlugs: Object.keys(raws),
      loadRaw: loader(raws),
    });
    expect(result.danglingRefs).toEqual([
      { from: 'reactor', to: 'missing-dep' },
    ]);
  });

  it('categories.md 로 명시적 메타 적용 (h2 섹션 포맷)', async () => {
    const raws = {
      'projects/a': `---\nname: A\ncategory: platform\n---`,
    };
    const categoriesRaw = `# Categories\n\n## platform\nname: 플랫폼\ntone: indigo\n\n## product\nname: 제품\ntone: amber\n`;
    const result = await buildTopologyFromVault({
      projectSlugs: Object.keys(raws),
      loadRaw: loader(raws),
      categoriesRaw,
    });
    expect(result.categories).toHaveLength(2);
    expect(result.categories[0]).toEqual({
      slug: 'platform',
      name: '플랫폼',
      tone: 'indigo',
    });
    expect(result.categories[1]).toEqual({
      slug: 'product',
      name: '제품',
      tone: 'amber',
    });
  });

  it('statuses.md 없으면 기본 4개', async () => {
    const result = await buildTopologyFromVault({
      projectSlugs: [],
      loadRaw: async () => '',
    });
    expect(result.statuses.map((s) => s.slug)).toEqual([
      'draft',
      'active',
      'launched',
      'archived',
    ]);
  });

  it('position inline object 는 파서 제약으로 fallback', async () => {
    const raws = {
      'projects/a': `---\nname: A\ncategory: x\nposition: { x: 12, y: -5 }\n---`,
    };
    const result = await buildTopologyFromVault({
      projectSlugs: Object.keys(raws),
      loadRaw: loader(raws),
    });
    expect(result.projects[0].position).toEqual({ x: 0, y: 0 });
  });

  it('positionX/Y split 필드 파싱 (드래그 persist 포맷)', async () => {
    const raws = {
      'projects/a': `---\nname: A\ncategory: x\npositionX: 120\npositionY: -42.5\n---`,
    };
    const result = await buildTopologyFromVault({
      projectSlugs: Object.keys(raws),
      loadRaw: loader(raws),
    });
    expect(result.projects[0].position).toEqual({ x: 120, y: -42.5 });
  });

  it('description 미지정 시 본문 첫 문단', async () => {
    const raws = {
      'projects/a': `---\nname: A\ncategory: x\n---\n\n# A\n\n본문 첫 문단입니다.\n\n두번째 문단.`,
    };
    const result = await buildTopologyFromVault({
      projectSlugs: Object.keys(raws),
      loadRaw: loader(raws),
    });
    expect(result.projects[0].description).toContain('본문 첫 문단');
  });
});
