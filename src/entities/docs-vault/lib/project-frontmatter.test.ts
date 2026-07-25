import { describe, expect, it } from 'vitest';
import {
  buildProjectMarkdown,
  projectToFrontmatter,
} from './project-frontmatter';

describe('projectToFrontmatter', () => {
  const minimal = {
    slug: 'auth-hub',
    name: '인증 허브',
    category: 'platform',
    status: 'active',
    description: '인증 흐름의 단일 진입',
  };

  it('필수 필드 직렬화', () => {
    const fm = projectToFrontmatter(minimal);
    expect(fm.kind).toBe('project');
    expect(fm.slug).toBe('auth-hub');
    expect(fm.name).toBe('인증 허브');
    expect(fm.category).toBe('platform');
    expect(fm.status).toBe('active');
    expect(fm.description).toBe('인증 흐름의 단일 진입');
  });

  it('빈 옵셔널은 omit', () => {
    const fm = projectToFrontmatter({
      ...minimal,
      tags: [],
      stack: [],
      dependencies: [],
      owner: '   ',
      isHub: false,
    });
    expect(fm.tags).toBeUndefined();
    expect(fm.stack).toBeUndefined();
    expect(fm.dependencies).toBeUndefined();
    expect(fm.owner).toBeUndefined();
    expect(fm.isHub).toBeUndefined();
  });

  it('position 은 split 필드 (positionX/Y)', () => {
    const fm = projectToFrontmatter({
      ...minimal,
      position: { x: 120.5, y: -40 },
    });
    expect(fm.positionX).toBe(120.5);
    expect(fm.positionY).toBe(-40);
  });

  it('isHub true 는 직렬화', () => {
    const fm = projectToFrontmatter({ ...minimal, isHub: true });
    expect(fm.isHub).toBe(true);
  });
});

describe('buildProjectMarkdown', () => {
  it('frontmatter + 기본 body 생성', () => {
    const md = buildProjectMarkdown({
      slug: 'iam',
      name: 'IAM',
      category: 'platform',
      status: 'active',
      description: '인증 서비스',
    });
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('kind: project');
    expect(md).toContain('name: IAM');
    expect(md).toContain('slug: iam');
    expect(md).toContain('category: platform');
    expect(md).toContain('# IAM');
  });

  it('사용자 body 가 주어지면 그것 사용', () => {
    const md = buildProjectMarkdown(
      {
        slug: 'iam',
        name: 'IAM',
        category: 'platform',
        status: 'active',
        description: '',
      },
      { body: '# 커스텀 헤더\n\n본문' },
    );
    expect(md).toContain('# 커스텀 헤더');
    expect(md).toContain('본문');
    expect(md).not.toContain('description: ');
  });

  it('배열 필드 inline 직렬화', () => {
    const md = buildProjectMarkdown({
      slug: 'iam',
      name: 'IAM',
      category: 'platform',
      status: 'active',
      description: '',
      tags: ['auth', 'hub'],
      dependencies: ['user', 'session'],
    });
    expect(md).toContain('tags: [auth, hub]');
    expect(md).toContain('dependencies: [user, session]');
  });
});
