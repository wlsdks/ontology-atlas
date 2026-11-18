import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';
import { MemoryVault } from '../../../../../tests/helpers/memory-vault';
import { deriveOntologyFromVault } from '../derive-ontology-from-vault';
import { applyVaultChanges, type LocalVaultSnapshot } from './apply-vault-changes';
import {
  buildLocalManifest,
  buildLocalManifestWithEntries,
  computeLocalVaultFingerprint,
  rebuildLocalManifestIncremental,
} from './build-local-manifest';

/** Fingerprinting must stay below 85% of a build's time, a ratio that survives jsdom noise. */

const FILE_COUNT = 200;

function makeFileHandle(name: string, mtime: number): FileSystemFileHandle {
  // Average-length bodies.
  const body = [
    '---',
    `title: ${name}`,
    `tags: [perf, sample]`,
    '---',
    '',
    `# ${name}`,
    '',
    `이 문서는 perf test 의 ${name}. 본문 한 줄 두 줄 세 줄.`,
    `[[other-${name}]] 같은 wikilink 도 포함.`,
    '',
    `> 인용도 한 줄. ${name}`,
  ].join('\n');
  return {
    kind: 'file',
    name,
    getFile: async () =>
      ({
        text: async () => body,
        lastModified: mtime,
      }) as unknown as File,
  } as unknown as FileSystemFileHandle;
}

function makeLargeRoot(count: number): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name: 'PerfVault',
    entries: async function* () {
      for (let i = 0; i < count; i += 1) {
        const name = `doc-${String(i).padStart(4, '0')}.md`;
        yield [name, makeFileHandle(name, 1700000000000 + i)] as const;
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}

function ms(): number {
  return performance.now();
}

describe('large vault perf', () => {
  it(`${FILE_COUNT} files: fingerprint < build * 0.85`, async () => {
    const root = makeLargeRoot(FILE_COUNT);

    const t0 = ms();
    const built = await buildLocalManifest(root);
    const buildMs = ms() - t0;

    const t1 = ms();
    const fp = await computeLocalVaultFingerprint(root);
    const fingerprintMs = ms() - t1;

    expect(built.manifest.docs.length).toBe(FILE_COUNT);
    expect(fp).toBe(built.fingerprint);

    console.log(
      `[perf] ${FILE_COUNT} files — build: ${buildMs.toFixed(1)}ms, fingerprint: ${fingerprintMs.toFixed(1)}ms, ratio: ${(fingerprintMs / buildMs).toFixed(2)}`,
    );

    expect(fingerprintMs).toBeLessThan(buildMs * 0.85);
  });
});

/** A flat folder handle; `read` builds each body on demand so the handle holds no text. */
function makeFlatRoot(
  count: number,
  read: (i: number) => string,
  wait?: () => Promise<void>,
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name: 'FlatVault',
    entries: async function* () {
      for (let i = 0; i < count; i += 1) {
        const name = `n-${i}.md`;
        yield [
          name,
          {
            kind: 'file',
            name,
            getFile: async () => {
              if (wait) await wait();
              return {
                text: async () => read(i),
                lastModified: 1_700_000_000_000 + i,
              } as unknown as File;
            },
          },
        ] as const;
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe('manifest build at scale', () => {
  it('reads through a pool at least four times faster than one read at a time when each read waits', async () => {
    const count = 400;
    // measurement window: each read waits 0.5 ms, standing in for one bridge or FSA round trip.
    const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 0.5));
    const read = (i: number) => `---\ntitle: N ${i}\n---\n\n# N ${i}\n`;

    const t0 = ms();
    const serial = await buildLocalManifest(makeFlatRoot(count, read, wait), 1);
    const serialMs = ms() - t0;

    const t1 = ms();
    const pooled = await buildLocalManifest(makeFlatRoot(count, read, wait));
    const pooledMs = ms() - t1;

    expect(pooled.manifest.docs).toEqual(serial.manifest.docs);
    console.log(
      `[perf] ${count} waiting reads — serial: ${serialMs.toFixed(0)}ms, pooled: ${pooledMs.toFixed(0)}ms, ratio: ${(serialMs / pooledMs).toFixed(1)}`,
    );
    expect(pooledMs * 4).toBeLessThanOrEqual(serialMs);
  });

  it('does not keep whole file texts alive through the kept fields', async () => {
    setFlagsFromString('--expose-gc');
    const gc = runInNewContext('gc') as () => void;
    const count = 400;
    const shortPad = 1024;
    const longPad = 16 * 1024;
    /* Every kept field is cut from the text: a Hangul title, display name, link text with context,
     * and the excerpt. The pad is one body line past the excerpt and adds no heading or link. */
    const read = (pad: number) => (i: number) =>
      [
        '---',
        `title: 문서 제목 번호 ${i} 입니다`,
        `created_by: 작성자 이름 ${i} 입니다`,
        `display_ko: 표시 이름 번호 ${i} 입니다`,
        '---',
        '',
        `# 문서 제목 번호 ${i} 입니다`,
        '',
        `첫 문단이 [[other-${i}|다른 문서 ${i} 로 가는 링크]] 를 담고 있습니다.`,
        '',
        `x${String(i).padStart(6, '0')}${'.'.repeat(pad)}`,
      ].join('\n');

    const heldBytes = async (pad: number) => {
      gc();
      const before = process.memoryUsage().heapUsed;
      const built = await buildLocalManifest(makeFlatRoot(count, read(pad)));
      expect(built.manifest.docs.length).toBe(count);
      for (const doc of built.manifest.docs) {
        const i = Number(doc.slug.replace('n-', ''));
        expect(doc.definitionPreview).toBe(`첫 문단이 [[other-${i}|다른 문서 ${i} 로 가는 링크]] 를 담고 있습니다.`);
      }
      gc();
      const after = process.memoryUsage().heapUsed;
      return after - before;
    };

    // measurement window: the heap after a forced collection, holding only each build's manifest.
    await heldBytes(shortPad);
    const shortHeld = await heldBytes(shortPad);
    const longHeld = await heldBytes(longPad);
    const extraBodyBytes = count * (longPad - shortPad);
    console.log(
      `[perf] retention — 1 KB bodies: ${(shortHeld / 1e6).toFixed(2)} MB, 16 KB bodies: ${(longHeld / 1e6).toFixed(2)} MB, extra body bytes: ${(extraBodyBytes / 1e6).toFixed(2)} MB`,
    );
    expect(longHeld - shortHeld).toBeLessThan(extraBodyBytes / 10);
  });
});

/** Kind, relations and body links like a constructed ontology; 50,000 Markdown files. */
function ontologyVault(total: number, notesPerFolder = 1000): MemoryVault {
  const vault = new MemoryVault();
  const body = (title: string, link: string) =>
    [`# ${title}`, '', `${title} 는 이 저장소에서 한 가지 역할을 맡는다. [[${link}]] 를 참고한다.`, '', '## Includes', '- 하나', '', '## Uncertainty', '- 읽지 않은 곳이 있다.'].join('\n');
  const doc = (path: string, frontmatter: string[], title: string, link: string) =>
    vault.write(path, ['---', ...frontmatter, `title: ${title}`, '---', body(title, link)].join('\n'));
  const domains = 50;
  const capabilities = 2000;
  const elements = 30_000;
  doc('projects/app.md', ['kind: project'], 'App', 'domains/d0');
  for (let d = 0; d < domains; d += 1) doc(`domains/d${d}.md`, ['kind: domain'], `Domain ${d}`, `capabilities/c${d}`);
  for (let c = 0; c < capabilities; c += 1) {
    doc(`capabilities/c${c}.md`, ['kind: capability', `domain: d${c % domains}`, `dependencies: [capabilities/c${(c + 1) % capabilities}]`], `Capability ${c}`, `elements/e${c * 15}`);
  }
  for (let e = 0; e < elements; e += 1) {
    const owner = `capabilities/c${Math.floor(e / 15) % capabilities}`;
    doc(`elements/e${e}.md`, ['kind: element', `domain: d${e % domains}`, `capabilities: [${owner}]`], `Element ${e}`, owner);
  }
  for (let n = 0; n < total - 1 - domains - capabilities - elements; n += 1) {
    doc(`documents/n${Math.floor(n / notesPerFolder)}/n${n}.md`, ['kind: document', `tags: [note, t${n % 20}]`, `describes: [capabilities/c${n % capabilities}]`], `Note ${n}`, `elements/e${n % elements}`);
  }
  return vault;
}

function cpuMs(): number {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1000;
}

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

describe('one changed file in a 50,000-file vault', () => {
  it('costs at most 60 ms of CPU for the manifest and the ontology together', async () => {
    const vault = ontologyVault(50_000);
    const first = await buildLocalManifestWithEntries(vault.root());
    deriveOntologyFromVault(first.build.manifest);
    const edit = (round: number) => {
      const path = round % 2 ? 'elements/e123.md' : 'documents/n3/n3456.md';
      vault.write(path, `${vault.read(path)!.text}\n\nEdited in round ${round}.`);
      return path;
    };

    // Before: the walk-based rebuild the focus check runs.
    const walked: number[] = [];
    for (let round = 0; round < 3; round += 1) {
      edit(round);
      const start = cpuMs();
      const next = await rebuildLocalManifestIncremental(vault.root(), first.entries);
      deriveOntologyFromVault(next.build.manifest);
      walked.push(cpuMs() - start);
    }

    // After: the watcher's path delta. The first call indexes the snapshot once.
    let snapshot: LocalVaultSnapshot = first;
    const delta: number[] = [];
    for (let round = 0; round < 7; round += 1) {
      const path = edit(round);
      const start = cpuMs();
      const result = await applyVaultChanges(vault.root(), snapshot, [vault.change(path)]);
      if (result.kind !== 'applied') throw new Error(`expected a delta, got ${result.kind}`);
      snapshot = result.snapshot;
      deriveOntologyFromVault(snapshot.build.manifest);
      delta.push(cpuMs() - start);
    }
    const steady = median(delta.slice(1));
    console.log(
      `[perf] 50,000 files, one edit — walk rebuild + derive: ${median(walked).toFixed(0)} ms CPU, path delta + derive: ${steady.toFixed(1)} ms (first delta ${delta[0].toFixed(1)} ms)`,
    );
    expect(snapshot.build.manifest.docs).toHaveLength(50_000);
    /*
     * Product budget 60 ms (community plan, "a change costs the change"). Measured 2026-11-19 on
     * an M-series Mac: 5–6 ms steady, 30 ms for the first delta, against 360–470 ms before.
     */
    expect(steady).toBeLessThanOrEqual(60);
  });
});

/** CPU for one burst: the walk the focus check runs, against the path delta (and its walk, when it asks for one). */
async function burstCosts(vault: MemoryVault, first: LocalVaultSnapshot, paths: readonly string[]) {
  const changes = paths.map((path) => vault.change(path));
  let start = cpuMs();
  const walked = await rebuildLocalManifestIncremental(vault.root(), first.entries);
  deriveOntologyFromVault(walked.build.manifest);
  const walkMs = cpuMs() - start;
  start = cpuMs();
  const result = await applyVaultChanges(vault.root(), first, changes);
  const next = result.kind === 'applied' ? result.snapshot : result.kind === 'rescan' ? await rebuildLocalManifestIncremental(vault.root(), first.entries) : first;
  deriveOntologyFromVault(next.build.manifest);
  const deltaMs = cpuMs() - start;
  expect(next.build.fingerprint).toBe(walked.build.fingerprint);
  return { walkMs, deltaMs, kind: result.kind };
}

/*
 * Product budgets: a burst never freezes the window for seconds, as the per-ref tail loop once did
 * (1.5 s for 500 creates, 14.7 s for 5,000, 38.7 s for 2,000 removed folders). Measured 2026-11-19
 * on an M-series Mac, delta + derive against walk + derive: 500 created 195 vs 429 ms, 5,000
 * created 559 vs 818 ms, 2,000 folders (10,000 files) removed 231 vs 294 ms. Each bound is 5x.
 */
const BURST_BUDGET_MS: Record<string, number> = { 500: 1_000, 5000: 2_800, folders: 1_200 };

describe('a burst of changes in a 50,000-file vault, as a branch checkout makes', () => {
  it.each([500, 5_000])('applies %i created documents within its CPU budget', async (count) => {
    const vault = ontologyVault(50_000);
    const first = await buildLocalManifestWithEntries(vault.root());
    deriveOntologyFromVault(first.build.manifest);
    const paths: string[] = [];
    for (let at = 0; at < count; at += 1) {
      // Each new tail is one other documents' refs may now resolve to.
      const path = `branch/f${Math.floor(at / 100)}/c${50_000 + at}.md`;
      vault.write(path, `---\nkind: element\ntitle: New ${at}\ndomain: d${at % 50}\ncapabilities: [c${at % 2000}]\n---\n# New ${at}\n\n[[e${at}]]`);
      paths.push(path);
    }
    const { walkMs, deltaMs, kind } = await burstCosts(vault, first, paths);
    console.log(`[perf] 50,000 files, ${count} created — walk + derive ${walkMs.toFixed(0)} ms CPU, delta + derive ${deltaMs.toFixed(0)} ms (${kind})`);
    expect(kind).toBe('applied');
    expect(deltaMs).toBeLessThanOrEqual(BURST_BUDGET_MS[count]);
  });

  it('applies 2,000 removed folders within its CPU budget', async () => {
    const vault = ontologyVault(50_000, 5);
    const first = await buildLocalManifestWithEntries(vault.root());
    deriveOntologyFromVault(first.build.manifest);
    const paths: string[] = [];
    for (let at = 0; at < 2_000; at += 1) {
      vault.removeDir(`documents/n${at}`);
      paths.push(`documents/n${at}`);
    }
    const { walkMs, deltaMs, kind } = await burstCosts(vault, first, paths);
    console.log(`[perf] 50,000 files, 2,000 folders removed — walk + derive ${walkMs.toFixed(0)} ms CPU, delta + derive ${deltaMs.toFixed(0)} ms (${kind})`);
    expect(kind).toBe('applied');
    expect(deltaMs).toBeLessThanOrEqual(BURST_BUDGET_MS.folders);
  });
});
