import { describe, expect, it } from 'vitest';
import { MemoryVault } from '../../../../../tests/helpers/memory-vault';
import { deriveOntologyFromVault } from '../derive-ontology-from-vault';
import type { VaultManifest } from '../../model/types';
import { applyVaultChanges, type LocalVaultSnapshot, type VaultChangeResult } from './apply-vault-changes';
import { buildLocalManifestWithEntries, rebuildLocalManifestIncremental } from './build-local-manifest';

/**
 * A path delta must leave exactly what a full build of the same disk produces: the manifest, the
 * fingerprint the focus check compares, the handle maps and the derived ontology. Random edit
 * sequences drive both and compare after every step.
 */

function seeded(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T,>(items: readonly T[]): T => items[int(items.length)];
  return { next, int, pick };
}

type Random = ReturnType<typeof seeded>;

const FOLDERS = ['capabilities', 'elements', 'domains', 'notes', 'notes/deep', 'archive', 'archive/old', 'projects'];
const KINDS = ['capability', 'element', 'domain', 'document', 'project', ''];
const NAMES = ['alpha', 'beta', 'gamma', 'delta', '알파', 'Beta', 'zeta', 'eta', 'theta'];

function markdown(random: Random, vault: MemoryVault, title: string): string {
  const docs = vault.paths().filter((path) => path.endsWith('.md'));
  const ref = () => {
    const roll = random.int(4);
    const path = docs.length ? random.pick(docs).replace(/\.md$/, '') : 'missing/ref';
    if (roll === 0) return path.split('/').pop()!;
    if (roll === 1) return `missing/${random.pick(NAMES)}`;
    return path;
  };
  const kind = random.pick(KINDS);
  const fm = ['---', `title: ${title}`];
  if (kind) fm.push(`kind: ${kind}`);
  if (random.next() < 0.5) fm.push(`domain: ${ref()}`);
  if (random.next() < 0.5) fm.push(`capabilities: [${ref()}, ${ref()}]`);
  if (random.next() < 0.3) fm.push(`relates: [${ref()}]`);
  if (random.next() < 0.3) fm.push(`describes: [${ref()}]`);
  if (random.next() < 0.3) fm.push(`dependencies: [${ref()}, ${ref()}]`);
  if (random.next() < 0.4) fm.push(`tags: [${random.pick(NAMES)}, ${random.pick(NAMES)}]`);
  if (random.next() < 0.2) fm.push('relation_notes:', `  ${random.pick(NAMES)}: because ${random.int(9)}`);
  fm.push('---');
  const links = Array.from({ length: random.int(3) }, () => `[[${ref()}]]`).join(' ');
  return [...fm, '', `# ${title}`, '', `Body ${random.int(1000)} ${links}`].join('\n');
}

function newPath(random: Random, ext = '.md'): string {
  return `${random.pick(FOLDERS)}/${random.pick(NAMES)}${random.int(6)}${ext}`;
}

/** One edit, and the paths a watcher reports for it. */
function edit(random: Random, vault: MemoryVault): string[] {
  const docs = vault.paths().filter((path) => path.endsWith('.md'));
  const any = vault.paths();
  const roll = random.int(13);
  if (roll <= 2 && docs.length) {
    const path = random.pick(docs);
    vault.write(path, markdown(random, vault, random.pick(NAMES)));
    return [path];
  }
  if (roll === 3 || docs.length < 4) {
    const path = newPath(random);
    if (vault.isDir(path)) return [];
    vault.write(path, markdown(random, vault, random.pick(NAMES)));
    return [path];
  }
  if (roll === 4 && any.length) {
    const path = random.pick(any);
    vault.remove(path);
    return [path];
  }
  if (roll === 5 && docs.length) {
    const from = random.pick(docs);
    const to = newPath(random);
    if (vault.has(to) || vault.isDir(to)) return [];
    vault.rename(from, to);
    return [from, to];
  }
  if (roll === 6) {
    // An editor that writes a temporary file and renames it over the original.
    if (!docs.length) return [];
    const path = random.pick(docs);
    const temp = `${path}.tmp${random.int(99)}`;
    vault.write(temp, markdown(random, vault, 'saved'));
    vault.rename(temp, path);
    return [temp, path];
  }
  if (roll === 7) {
    const from = random.pick(FOLDERS);
    const to = `${random.pick(['moved', 'notes', 'archive'])}/${random.pick(NAMES)}${random.int(3)}`;
    if (!vault.isDir(from) || vault.isDir(to) || vault.has(to) || to.startsWith(`${from}/`) || from.startsWith(`${to}/`)) return [];
    vault.renameDir(from, to);
    return [from, to];
  }
  if (roll === 8) {
    const dir = random.pick(FOLDERS);
    if (!vault.isDir(dir)) return [];
    vault.removeDir(dir);
    return [dir];
  }
  if (roll === 9) {
    const path = random.next() < 0.5 ? newPath(random, '.png') : `sources/${random.pick(NAMES)}${random.int(4)}.pdf`;
    if (vault.isDir(path)) return [];
    vault.write(path, `bytes ${random.int(1e6)}`);
    return [path];
  }
  if (roll === 10) {
    // Hidden files and agent sidecars are not walked.
    const path = random.pick(['.ontology-atlas/activity.jsonl', '.obsidian/workspace.md', 'notes/.draft.md']);
    vault.write(path, `x ${random.int(99)}`);
    return [path];
  }
  if (roll === 11 && docs.length) {
    // A retitle only: the tree and the node change, nothing else does.
    const path = random.pick(docs);
    vault.write(path, vault.read(path)!.text.replace(/^title: .*$/m, `title: ${random.pick(NAMES)} ${random.int(9)}`));
    return [path];
  }
  // A folder arriving whole; macOS reports only the folder.
  const dir = `incoming/${random.pick(NAMES)}${random.int(9)}`;
  if (vault.isDir(dir) || vault.has(dir)) return [];
  for (let at = 0; at < 1 + random.int(3); at += 1) vault.write(`${dir}/${random.pick(NAMES)}${at}.md`, markdown(random, vault, `In ${at}`));
  return [dir];
}

function comparable(manifest: VaultManifest) {
  const { generatedAt: _generatedAt, ...rest } = manifest;
  void _generatedAt;
  return rest;
}

/** A derivation from copies: no cached document facts and no previous run to patch from. */
function freshDerivation(manifest: VaultManifest) {
  deriveOntologyFromVault({ ...manifest, docs: [] });
  return deriveOntologyFromVault(structuredClone(manifest));
}

async function expectSameAsFullBuild(vault: MemoryVault, snapshot: LocalVaultSnapshot) {
  const full = await buildLocalManifestWithEntries(vault.root());
  expect(comparable(snapshot.build.manifest)).toEqual(comparable(full.build.manifest));
  expect(snapshot.build.fingerprint).toBe(full.build.fingerprint);
  for (const key of ['fileHandles', 'imageHandles', 'sourceHandles'] as const) {
    expect([...snapshot.build[key].keys()].sort()).toEqual([...full.build[key].keys()].sort());
  }
  expect(snapshot.entries.map((entry) => entry.relativePath).sort()).toEqual(
    full.entries.map((entry) => entry.relativePath).sort(),
  );
  expect(deriveOntologyFromVault(snapshot.build.manifest)).toEqual(freshDerivation(full.build.manifest));
}

async function applied(result: VaultChangeResult): Promise<LocalVaultSnapshot> {
  if (result.kind !== 'applied') throw new Error(`expected applied, got ${result.kind}`);
  return result.snapshot;
}

function seedVault(random: Random): MemoryVault {
  const vault = new MemoryVault();
  for (let at = 0; at < 24; at += 1) {
    const path = newPath(random);
    if (!vault.has(path)) vault.write(path, markdown(random, vault, `${random.pick(NAMES)} ${at}`));
  }
  vault.write('img/logo.png', 'png');
  vault.write('sources/brief.pdf', 'pdf');
  return vault;
}

describe('applyVaultChanges', () => {
  it.each([1, 2, 3, 4, 5, 6])('equals a full build after every step of random edit sequence %i', async (seed) => {
    const random = seeded(seed);
    const vault = seedVault(random);
    let snapshot: LocalVaultSnapshot = await buildLocalManifestWithEntries(vault.root());
    deriveOntologyFromVault(snapshot.build.manifest);
    const outcomes: Record<string, number> = {};
    for (let step = 0; step < 60; step += 1) {
      // Up to three edits reach the app in one debounced batch.
      const paths = Array.from({ length: 1 + random.int(3) }, () => edit(random, vault)).flat();
      const result = await applyVaultChanges(vault.root(), snapshot, [...new Set(paths)].map((path) => vault.change(path)));
      outcomes[result.kind] = (outcomes[result.kind] ?? 0) + 1;
      if (result.kind === 'applied') snapshot = result.snapshot;
      await expectSameAsFullBuild(vault, snapshot);
    }
    // Every edit above is one the delta handles itself; none falls back to a walk.
    expect(outcomes.rescan ?? 0).toBe(0);
    expect(outcomes.applied).toBeGreaterThan(40);
  });

  it('converges after a burst of 5,000 changed files, as a branch checkout makes', async () => {
    const vault = new MemoryVault();
    for (let at = 0; at < 6000; at += 1) {
      vault.write(`notes/n${at % 40}/doc${at}.md`, `---\ntitle: Doc ${at}\nkind: element\ndomain: d${at % 7}\ntags: [t${at % 5}]\n---\n\n# Doc ${at}\n\n[[doc${(at + 1) % 6000}]]`);
    }
    let snapshot: LocalVaultSnapshot = await buildLocalManifestWithEntries(vault.root());
    const paths: string[] = [];
    for (let at = 0; at < 5000; at += 1) {
      const path = `notes/n${at % 40}/doc${at}.md`;
      if (at % 5 === 0) vault.remove(path);
      else vault.write(path, `---\ntitle: Branch ${at}\nkind: capability\ndomain: d${at % 3}\n---\n\n# Branch ${at}\n\n[[doc${at + 7}]]`);
      paths.push(path);
    }
    for (let at = 0; at < 400; at += 1) {
      vault.write(`branch/b${at}.md`, `---\ntitle: New ${at}\nkind: domain\n---\n\n# New ${at}`);
      paths.push(`branch/b${at}.md`);
    }
    vault.opens.clear();
    snapshot = await applied(await applyVaultChanges(vault.root(), snapshot, paths.map((path) => vault.change(path))));
    // Only the files that changed are opened.
    expect(vault.opens.size).toBe(4400);
    await expectSameAsFullBuild(vault, snapshot);
  });

  it('removes a file deleted while open and drops its handle', async () => {
    const vault = new MemoryVault({ 'notes/open.md': '# Open\n\n[[notes/other]]', 'notes/other.md': '# Other' });
    const snapshot = await buildLocalManifestWithEntries(vault.root());
    vault.remove('notes/open.md');
    const next = await applied(await applyVaultChanges(vault.root(), snapshot, [vault.change('notes/open.md')]));
    expect(next.build.fileHandles.has('notes/open')).toBe(false);
    expect(next.build.manifest.backlinksDetail['notes/other']).toBeUndefined();
    await expectSameAsFullBuild(vault, next);
  });

  it('keeps every unchanged collection and reads only the edited file', async () => {
    // The edit sits past the 120 characters a backlink quotes around its link.
    const text = `---\ntags: [x]\n---\n# A\n\n[[b]]\n\n${'Filler words. '.repeat(20)}`;
    const vault = new MemoryVault({ 'a.md': text, 'b.md': '# B', 'img/i.png': 'png' });
    const snapshot = await buildLocalManifestWithEntries(vault.root());
    vault.write('a.md', `${text}\n\nMore words.`);
    vault.opens.clear();
    const next = await applied(await applyVaultChanges(vault.root(), snapshot, [vault.change('a.md')]));
    expect([...vault.opens.keys()]).toEqual(['a.md']);
    const before = snapshot.build;
    expect(next.build.manifest.tree).toBe(before.manifest.tree);
    expect(next.build.manifest.tags).toBe(before.manifest.tags);
    expect(next.build.manifest.backlinksDetail).toBe(before.manifest.backlinksDetail);
    expect(next.build.fileHandles).toBe(before.fileHandles);
    expect(next.build.imageHandles).toBe(before.imageHandles);
    expect(next.build.fingerprint).not.toBe(before.fingerprint);
    // The earlier snapshot is left as it was.
    expect(before.manifest.docs.find((doc) => doc.slug === 'a')!.wordCount).toBeLessThan(
      next.build.manifest.docs.find((doc) => doc.slug === 'a')!.wordCount,
    );
  });

  it('asks for a walk instead of reading a path that leaves the vault or names no file', async () => {
    const vault = new MemoryVault({ 'a.md': '# A' });
    const snapshot = await buildLocalManifestWithEntries(vault.root());
    for (const path of ['../outside.md', '/etc/passwd.md', 'a\\..\\b.md', 'notes//a.md', '']) {
      vault.opens.clear();
      expect(await applyVaultChanges(vault.root(), snapshot, [{ path, kind: 'file', lastModified: 1 }])).toEqual({ kind: 'rescan' });
      expect(vault.opens.size).toBe(0);
    }
  });

  it('asks for a walk for what only a walk can count: source code, a case-only rename, a pruned folder', async () => {
    const vault = new MemoryVault({ 'a.md': '# A', 'src/main.ts': 'x' });
    const snapshot = await buildLocalManifestWithEntries(vault.root());
    vault.write('src/other.ts', 'y');
    expect((await applyVaultChanges(vault.root(), snapshot, [vault.change('src/other.ts')])).kind).toBe('rescan');
    vault.rename('a.md', 'A.md');
    expect((await applyVaultChanges(vault.root(), snapshot, [vault.change('a.md'), vault.change('A.md')])).kind).toBe('rescan');
    vault.mkdir('lib/node_modules');
    expect((await applyVaultChanges(vault.root(), snapshot, [vault.change('lib/node_modules')])).kind).toBe('rescan');
  });

  it('reports a hidden-folder change as a sidecar change and leaves the manifest alone', async () => {
    const vault = new MemoryVault({ 'a.md': '# A' });
    const snapshot = await buildLocalManifestWithEntries(vault.root());
    vault.write('.ontology-atlas/activity.jsonl', '{}');
    expect(await applyVaultChanges(vault.root(), snapshot, [vault.change('.ontology-atlas/activity.jsonl')])).toEqual({
      kind: 'unchanged',
      sidecarsTouched: true,
    });
  });

  it('leaves a fingerprint the disk disagrees with when an event is dropped, so the focus check rebuilds', async () => {
    const vault = new MemoryVault({ 'a.md': '# A', 'b.md': '# B' });
    let snapshot: LocalVaultSnapshot = await buildLocalManifestWithEntries(vault.root());
    vault.write('a.md', '# A2');
    vault.write('b.md', '# B2');
    snapshot = await applied(await applyVaultChanges(vault.root(), snapshot, [vault.change('a.md')]));
    const disk = await buildLocalManifestWithEntries(vault.root());
    expect(snapshot.build.fingerprint).not.toBe(disk.build.fingerprint);
    // The focus check's rebuild then lands exactly on the disk.
    const rebuilt = await rebuildLocalManifestIncremental(vault.root(), snapshot.entries);
    expect(comparable(rebuilt.build.manifest)).toEqual(comparable(disk.build.manifest));
    // And a later delta starts from the rebuilt entries.
    vault.write('b.md', '# B3');
    await expectSameAsFullBuild(vault, await applied(await applyVaultChanges(vault.root(), rebuilt, [vault.change('b.md')])));
  });
});
