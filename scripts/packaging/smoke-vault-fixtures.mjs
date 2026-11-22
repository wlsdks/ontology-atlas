// Small vaults the packed-CLI smoke points the installed CLI at. Each one is
// broken or sparse in exactly the way a smoke assertion depends on.
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const nodeUidLine = () => `uid: ${randomUUID()}`;

export function writeCycleVault(root) {
  mkdirSync(join(root, 'capabilities'), { recursive: true });
  mkdirSync(join(root, 'domains'), { recursive: true });
  writeFileSync(
    join(root, 'capabilities', 'a.md'),
    [
      '---',
      nodeUidLine(),
      'kind: capability',
      'slug: capabilities/a',
      'title: A',
      'domain: domains/auth',
      'dependencies: [capabilities/b]',
      '---',
      '',
      '# A',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'capabilities', 'b.md'),
    [
      '---',
      nodeUidLine(),
      'kind: capability',
      'slug: capabilities/b',
      'title: B',
      'domain: domains/auth',
      'dependencies: [capabilities/a]',
      '---',
      '',
      '# B',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'domains', 'auth.md'),
    [
      '---',
      nodeUidLine(),
      'kind: domain',
      'slug: domains/auth',
      'title: Auth',
      'capabilities: [capabilities/a, capabilities/b]',
      '---',
      '',
      '# Auth',
      '',
    ].join('\n'),
  );
}

export function writeDanglingVault(root) {
  mkdirSync(join(root, 'capabilities'), { recursive: true });
  writeFileSync(
    join(root, 'capabilities', 'a.md'),
    [
      '---',
      nodeUidLine(),
      'kind: capability',
      'slug: capabilities/a',
      'title: A',
      'dependencies: [capabilities/missing]',
      '---',
      '',
      '# A',
      '',
    ].join('\n'),
  );
}

export function writeDisconnectedVault(root) {
  mkdirSync(join(root, 'capabilities'), { recursive: true });
  for (const slug of ['a', 'b']) {
    writeFileSync(
      join(root, 'capabilities', `${slug}.md`),
      [
        '---',
        nodeUidLine(),
        'kind: capability',
        `slug: capabilities/${slug}`,
        `title: ${slug.toUpperCase()}`,
        '---',
        '',
        `# ${slug.toUpperCase()}`,
        '',
      ].join('\n'),
    );
  }
}

export function writeProjectlessVault(root) {
  mkdirSync(join(root, 'domains'), { recursive: true });
  writeFileSync(
    join(root, 'domains', 'core.md'),
    [
      '---',
      nodeUidLine(),
      'kind: domain',
      'slug: domains/core',
      'title: Core',
      '---',
      '',
      '# Core',
      '',
    ].join('\n'),
  );
}

export function writeMaintenanceResumeVault(root) {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, 'project.md'),
    [
      '---',
      nodeUidLine(),
      'kind: project',
      'slug: project',
      'title: Project',
      'domains:',
      '  - core',
      '---',
      '',
      '# Project',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'core.md'),
    [
      '---',
      nodeUidLine(),
      'kind: domain',
      'slug: core',
      'title: Core',
      '---',
      '',
      '# Core',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'feature.md'),
    [
      '---',
      nodeUidLine(),
      'kind: capability',
      'slug: feature',
      'title: Feature',
      'domain: core',
      'elements: []',
      '---',
      '',
      '# Feature',
      '',
    ].join('\n'),
  );
}
