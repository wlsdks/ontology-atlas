// The captured source folder a confined reader gets on inherited descriptor 198 (what the desktop
// app writes before it starts the server with `OATLAS_CONFINED_SOURCE_READS=1`). The harness builds
// one for a case from the case's own repository folder, then pads it so a case can sit exactly on
// or just over each limit the server enforces:
//   12,000 entries · 512 KiB of text in one file · 32 MiB of text in all · 64 MiB for the descriptor.
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const SNAPSHOT_LIMITS = Object.freeze({
  entries: 12_000,
  fileTextBytes: 512 * 1024,
  totalTextBytes: 32 * 1024 * 1024,
  descriptorBytes: 64 * 1024 * 1024,
});

const SENSITIVE = /^(?:credential|credentials|secret|secrets|private[-_]?key|id_rsa|id_ed25519)(?:\.[^.]+)?$|\.(?:pem|key|p12|pfx|jks|keystore)$/i;

function walk(root, relative, entries) {
  const full = path.join(root, relative);
  const names = readdirSync(full)
    .filter((name) => !name.startsWith('.') && !SENSITIVE.test(name))
    .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  entries.push({ path: relative === '' ? '.' : relative.split(path.sep).join('/'), kind: 'directory', size: 0, identity: '0:0', children: names });
  for (const name of names) {
    const child = path.join(relative, name);
    const info = lstatSync(path.join(root, child));
    const posix = child.split(path.sep).join('/');
    if (info.isSymbolicLink()) entries.push({ path: posix, kind: 'symlink', size: 0, identity: '0:0' });
    else if (info.isDirectory()) walk(root, child, entries);
    else if (info.isFile()) {
      const bytes = readFileSync(path.join(root, child));
      const text = bytes.length <= SNAPSHOT_LIMITS.fileTextBytes ? bytes.toString('utf8') : undefined;
      const valid = text !== undefined && Buffer.from(text, 'utf8').equals(bytes);
      entries.push({ path: posix, kind: 'file', size: bytes.length, identity: '0:0', ...(valid ? { text } : {}) });
    } else entries.push({ path: posix, kind: 'other', size: 0, identity: '0:0' });
  }
}

/**
 * @param {string} rootPath the folder the server will be asked about
 * @param {{ totalEntries?: number, extraEntries?: number, fileTextBytes?: number, totalTextBytes?: number, descriptorBytes?: number, truncated?: boolean, contract?: string }} [spec]
 * @returns {string} the descriptor's contents
 */
export function buildSourceSnapshot(rootPath, spec = {}) {
  const entries = [];
  walk(rootPath, '', entries);
  const extra = [];
  const children = [];
  const addFile = (name, text) => {
    children.push(name);
    extra.push({ path: `pad/${name}`, kind: 'file', size: Buffer.byteLength(text ?? ''), identity: '0:0', ...(text === undefined ? {} : { text }) });
  };
  // One entry for the `pad` folder itself; `totalEntries` pads the snapshot to exactly that many.
  const extraEntries = spec.totalEntries === undefined ? spec.extraEntries ?? 0 : spec.totalEntries - entries.length - 1;
  for (let index = 0; index < extraEntries; index += 1) addFile(`f${index}`);
  if (spec.fileTextBytes) addFile('one-file.txt', 'x'.repeat(spec.fileTextBytes));
  if (spec.totalTextBytes) {
    const piece = SNAPSHOT_LIMITS.fileTextBytes;
    for (let index = 0; index * piece < spec.totalTextBytes; index += 1) addFile(`t${index}.txt`, 'y'.repeat(Math.min(piece, spec.totalTextBytes - index * piece)));
  }
  if (children.length > 0) {
    const top = entries[0];
    top.children = [...top.children, 'pad'].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    entries.push({ path: 'pad', kind: 'directory', size: 0, identity: '0:0', children });
    entries.push(...extra);
  }
  const body = JSON.stringify({
    contract: spec.contract ?? 'confinedSourceSnapshot:v1',
    rootPath,
    truncated: spec.truncated ?? false,
    entries,
    excluded: [],
  });
  if (spec.descriptorBytes && body.length < spec.descriptorBytes) return body + ' '.repeat(spec.descriptorBytes - body.length);
  return body;
}
