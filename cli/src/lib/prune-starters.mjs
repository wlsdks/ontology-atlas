import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const STARTER_FILES = [
  {
    slug: 'project',
    path: 'project.md',
    markers: ['title: My project', 'Write a one- or two-line summary of your project here'],
  },
  {
    slug: 'domains/example-domain',
    path: join('domains', 'example-domain.md'),
    markers: ['title: Example domain', 'A *domain* is a large area of your project'],
  },
  {
    slug: 'capabilities/example-capability',
    path: join('capabilities', 'example-capability.md'),
    markers: ['title: Example capability', 'A *capability* is one user-visible feature'],
  },
  {
    slug: 'elements/example-element',
    path: join('elements', 'example-element.md'),
    markers: ['title: Example element', 'An *element* is a smaller unit a capability uses'],
  },
];

export function pruneUntouchedStarterNodes(vaultRoot) {
  const removed = [];
  const preserved = [];
  const snapshots = [];

  for (const starter of STARTER_FILES) {
    const file = join(vaultRoot, starter.path);
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, 'utf-8');
    if (starter.markers.every((marker) => raw.includes(marker))) {
      rmSync(file);
      removed.push(starter.slug);
      snapshots.push({ path: starter.path, content: raw });
    } else {
      preserved.push(starter.slug);
    }
  }

  return { removed, preserved, snapshots };
}

export function restorePrunedStarterNodes(vaultRoot, prunedStarters) {
  for (const snapshot of prunedStarters?.snapshots ?? []) {
    const file = join(vaultRoot, snapshot.path);
    if (existsSync(file)) continue;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, snapshot.content, 'utf-8');
  }
}

export function summarizePrunedStarterNodes(prunedStarters) {
  if (!prunedStarters) return null;
  return {
    removed: prunedStarters.removed,
    preserved: prunedStarters.preserved,
  };
}
