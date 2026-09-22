import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { DEFAULT_IGNORE } from './analyze/constants.mjs';
import { OUTLINE_DECLARATION_LIMIT, outlineSource } from './source-outline.mjs';

const SOURCE_READ_LIMITS = Object.freeze({
  requests: 8,
  pathCharacters: 1024,
  maxLines: 200,
  fileBytes: 256 * 1024,
  rangeBytes: 8 * 1024,
  aggregateTextBytes: 32 * 1024,
  packetBytes: 64 * 1024,
  // An outline is a table of contents, so it is bounded like one range of text:
  // it stops at the declaration ceiling `source-outline.mjs` applies and again
  // at these bytes, and what it returns counts against the same aggregate.
  outlineDeclarations: OUTLINE_DECLARATION_LIMIT,
  outlineBytes: 16 * 1024,
});

const SOURCE_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cs', '.css', '.go', '.h', '.hpp', '.html', '.java',
  '.js', '.jsx', '.kt', '.kts', '.mjs', '.mts', '.php', '.py', '.rb', '.rs',
  '.scss', '.sh', '.swift', '.ts', '.tsx', '.vue', '.zig',
  // Prose the project ships beside its code. A headless construction run on an
  // unfamiliar repository (2026-09-21) could cite the README only "by heading
  // name and line number" because this list refused it, so the project's own
  // statement of purpose reached the builder through the package manifest
  // alone. Prose is text under the same byte caps; it is not a manifest.
  '.markdown', '.md', '.rst', '.txt',
]);
const MANIFESTS = new Set([
  'Cargo.toml', 'Gemfile', 'go.mod', 'package.json', 'pyproject.toml',
  'requirements.txt', 'setup.cfg', 'setup.py',
]);
const SENSITIVE = /^(?:credential|credentials|secret|secrets|private[-_]?key|id_rsa|id_ed25519)(?:\.[^.]+)?$|\.(?:pem|key|p12|pfx|jks|keystore)$/i;
const DIGEST = /^[a-f0-9]{64}$/;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isWellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isOutline(selector) {
  return selector.mode === 'outline';
}

function refuse(selector, reason) {
  return {
    status: 'refused',
    path: selector.path,
    ...(isOutline(selector) ? { mode: 'outline' } : {}),
    requestedRange: isOutline(selector)
      ? null
      : { startLine: selector.startLine, maxLines: selector.maxLines },
    reason,
    requestComplete: false,
    next: null,
  };
}

export function validateSourceReadSelectors(selectors) {
  if (!Array.isArray(selectors) || selectors.length < 1 || selectors.length > SOURCE_READ_LIMITS.requests) {
    throw new Error(`sourceReads must contain between 1 and ${SOURCE_READ_LIMITS.requests} selectors.`);
  }
  for (const [index, selector] of selectors.entries()) {
    if (!selector || typeof selector !== 'object' || Array.isArray(selector)) {
      throw new Error(`sourceReads[${index}] must be an object.`);
    }
    const allowed = new Set(['path', 'startLine', 'maxLines', 'expectedSha256', 'mode']);
    const unknown = Object.keys(selector).filter((key) => !allowed.has(key));
    if (unknown.length) throw new Error(`Unknown field "${unknown[0]}" in sourceReads[${index}].`);
    if (selector.mode !== undefined && selector.mode !== 'lines' && selector.mode !== 'outline') {
      throw new Error(`sourceReads[${index}].mode must be "lines" or "outline".`);
    }
    if (typeof selector.path !== 'string' || selector.path.length === 0) {
      throw new Error(`sourceReads[${index}].path must be a non-empty string.`);
    }
    if (!isWellFormedUnicode(selector.path)) {
      throw new Error(`sourceReads[${index}].path must contain well-formed Unicode.`);
    }
    if ([...selector.path].length > SOURCE_READ_LIMITS.pathCharacters) {
      throw new Error(`sourceReads[${index}].path must be at most ${SOURCE_READ_LIMITS.pathCharacters} characters.`);
    }
    if (isOutline(selector)) {
      // An outline has no range: it lists the whole file's declarations. A
      // selector that carries one is asking for two different reads at once,
      // and silently ignoring the range would return lines nobody can see.
      for (const key of ['startLine', 'maxLines']) {
        if (selector[key] !== undefined) {
          throw new Error(`sourceReads[${index}].${key} does not apply to mode "outline".`);
        }
      }
    } else {
      for (const key of ['startLine', 'maxLines']) {
        if (!Number.isSafeInteger(selector[key]) || selector[key] <= 0) {
          throw new Error(`sourceReads[${index}].${key} must be a positive safe integer.`);
        }
      }
      if (selector.maxLines > SOURCE_READ_LIMITS.maxLines) {
        throw new Error(`sourceReads[${index}].maxLines must be <= ${SOURCE_READ_LIMITS.maxLines}.`);
      }
    }
    if (selector.expectedSha256 !== undefined && !DIGEST.test(selector.expectedSha256)) {
      throw new Error(`sourceReads[${index}].expectedSha256 must be 64 lowercase hexadecimal characters.`);
    }
  }
}

function pathRefusal(path, ignore) {
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('\\\\') || isAbsolute(path)) return 'absolute_path';
  if (/[\u0000-\u001f\u007f]/u.test(path)) return 'control_character';
  if (path.includes('\\')) return 'ambiguous_separator';
  if (path.includes(':')) return 'ambiguous_separator';
  if (path.includes('#') || path.includes('@sha256:')) return 'ambiguous_citation_delimiter';
  const parts = path.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return 'path_traversal';
  if (parts.some((part) => part.startsWith('.'))) return 'sensitive_path';
  if (parts.some((part) => ignore.has(part))) return 'ignored_path';
  if (parts.some((part) => SENSITIVE.test(part))) return 'sensitive_path';
  if (!SOURCE_EXTENSIONS.has(extname(path).toLowerCase()) && !MANIFESTS.has(basename(path))) {
    return 'unsupported_source_type';
  }
  return null;
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function inspectPathComponents(root, literalPath) {
  let cursor = root;
  let finalStat;
  for (const part of literalPath.split('/')) {
    cursor = join(cursor, part);
    try { finalStat = lstatSync(cursor, { bigint: true }); } catch { return { reason: 'not_found' }; }
    if (finalStat.isSymbolicLink()) return { reason: 'symlink_path' };
  }
  return { finalStat };
}

function readStableFile(rootPath, literalPath, { onBeforeOpen, onDescriptorRead } = {}) {
  const root = realpathSync(rootPath);
  const target = resolve(root, literalPath);
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || rel === '' || isAbsolute(rel)) return { reason: 'outside_root' };
  const initialPath = inspectPathComponents(root, literalPath);
  if (initialPath.reason) return initialPath;
  if (!initialPath.finalStat.isFile()) return { reason: 'non_regular_file' };
  let canonical;
  try { canonical = realpathSync(target); } catch { return { reason: 'not_found' }; }
  const canonicalRel = relative(root, canonical);
  if (canonicalRel === '..' || canonicalRel.startsWith(`..${sep}`) || isAbsolute(canonicalRel)) return { reason: 'outside_root' };
  let fd;
  try {
    onBeforeOpen?.({ target });
    fd = openSync(
      target,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
    );
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile()) return { reason: 'non_regular_file' };
    if (before.size > BigInt(SOURCE_READ_LIMITS.fileBytes)) return { reason: 'file_too_large' };
    const buffer = Buffer.alloc(Number(before.size) + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, null);
      if (count === 0) break;
      offset += count;
    }
    onDescriptorRead?.({ target, bytes: buffer.subarray(0, offset) });
    if (offset > SOURCE_READ_LIMITS.fileBytes || offset !== Number(before.size)) return { reason: 'file_changed' };
    const after = fstatSync(fd, { bigint: true });
    let named;
    try { named = lstatSync(target, { bigint: true }); } catch { return { reason: 'file_changed' }; }
    const finalPath = inspectPathComponents(root, literalPath);
    if (
      finalPath.reason ||
      !sameIdentity(before, after) ||
      !sameIdentity(after, named) ||
      named.isSymbolicLink() ||
      realpathSync(target) !== canonical
    ) {
      return { reason: 'file_changed' };
    }
    return { bytes: buffer.subarray(0, offset) };
  } catch {
    return { reason: 'unsafe_read' };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function completeLines(text) {
  if (text.length === 0) return [];
  return text.match(/.*?(?:\r\n|\n|\r|$)/gs).filter((line) => line.length > 0);
}

/**
 * One outline row: the file's declarations with their line numbers, so the next
 * bounded read can name an exact range instead of starting at line 1 again.
 *
 * It returns no source text and mints no citation, because a list of names is
 * not evidence of behaviour. The declarations are trimmed to `outlineBytes` and
 * the row says `truncated` when either that budget or the declaration ceiling
 * cut the list short.
 */
function outlineOne(selector, bytes, text, fileLines, fullFileSha256) {
  const outline = outlineSource(text, selector.path);
  const declarations = [];
  let returnedBytes = 0;
  let truncated = outline.truncated;
  for (const declaration of outline.declarations) {
    const declarationBytes = Buffer.byteLength(JSON.stringify(declaration), 'utf8') + 1;
    if (returnedBytes + declarationBytes > SOURCE_READ_LIMITS.outlineBytes) {
      truncated = true;
      break;
    }
    declarations.push(declaration);
    returnedBytes += declarationBytes;
  }
  return {
    status: 'outlined',
    mode: 'outline',
    path: selector.path,
    requestedRange: null,
    sha256: fullFileSha256,
    fileBytes: bytes.length,
    fileLines,
    language: outline.language,
    declarationCount: declarations.length,
    declarations,
    returnedBytes,
    truncated,
    requestComplete: !truncated,
    next: null,
  };
}

function readOne(rootPath, selector, ignore, hooks) {
  const policyReason = pathRefusal(selector.path, ignore);
  if (policyReason) return refuse(selector, policyReason);
  const stable = readStableFile(rootPath, selector.path, hooks);
  if (stable.reason) return refuse(selector, stable.reason);
  if (stable.bytes.includes(0)) return refuse(selector, 'binary_source');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(stable.bytes); } catch { return refuse(selector, 'invalid_utf8'); }
  const fullFileSha256 = sha256(stable.bytes);
  if (selector.expectedSha256 && selector.expectedSha256 !== fullFileSha256) return refuse(selector, 'hash_mismatch');
  const lines = completeLines(text);
  if (isOutline(selector)) return outlineOne(selector, stable.bytes, text, lines.length, fullFileSha256);
  if (selector.startLine > lines.length) return refuse(selector, 'range_beyond_eof');
  const requested = lines.slice(selector.startLine - 1, selector.startLine - 1 + selector.maxLines);
  const delivered = [];
  let returnedBytes = 0;
  for (const line of requested) {
    const lineBytes = Buffer.byteLength(line, 'utf8');
    if (lineBytes > SOURCE_READ_LIMITS.rangeBytes && delivered.length === 0) return refuse(selector, 'line_too_large');
    if (returnedBytes + lineBytes > SOURCE_READ_LIMITS.rangeBytes) break;
    delivered.push(line);
    returnedBytes += lineBytes;
  }
  const endLine = selector.startLine + delivered.length - 1;
  const hasMore = endLine < lines.length;
  const truncated = delivered.length < requested.length || hasMore;
  return {
    status: 'read',
    path: selector.path,
    fullFileSha256,
    fileBytes: stable.bytes.length,
    fileLines: lines.length,
    requestedRange: { startLine: selector.startLine, maxLines: selector.maxLines },
    actualRange: { startLine: selector.startLine, endLine },
    text: delivered.join(''),
    returnedBytes,
    truncated,
    requestComplete: delivered.length === requested.length,
    fileComplete: selector.startLine === 1 && endLine === lines.length,
    citation: `source:${selector.path}#L${selector.startLine}-L${endLine}@sha256:${fullFileSha256}`,
    next: hasMore ? { path: selector.path, startLine: endLine + 1, maxLines: selector.maxLines, expectedSha256: fullFileSha256 } : null,
  };
}

function packetBytes(packet) {
  return Buffer.byteLength(JSON.stringify(packet), 'utf8');
}

function setSerializedBytes(packet) {
  let previous = -1;
  while (packet.serializedBytes !== previous) {
    previous = packet.serializedBytes;
    packet.serializedBytes = packetBytes(packet);
  }
}

export function readSourceEvidence(
  rootPath,
  selectors,
  { ignore: extraIgnore = [], onBeforeOpen, onDescriptorRead } = {},
) {
  validateSourceReadSelectors(selectors);
  const ignore = new Set([...DEFAULT_IGNORE, ...extraIgnore]);
  const packet = {
    contract: 'sourceEvidence:v1',
    trust: 'untrusted-source-data',
    limits: { ...SOURCE_READ_LIMITS },
    coverage: 'requested-ranges-only',
    repositoryComplete: false,
    rows: [],
    totalReturnedBytes: 0,
    serializedBytes: 0,
  };
  for (const selector of selectors) {
    let row = readOne(rootPath, selector, ignore, { onBeforeOpen, onDescriptorRead });
    // An outline row is bounded like a text row and spends the same aggregate.
    const delivered = row.status === 'read' || row.status === 'outlined';
    if (delivered && packet.totalReturnedBytes + row.returnedBytes > SOURCE_READ_LIMITS.aggregateTextBytes) {
      row = { ...refuse(selector, 'aggregate_text_budget'), status: 'omitted' };
    }
    const candidate = { ...packet, rows: [...packet.rows, row] };
    if (row.status === 'read' || row.status === 'outlined') candidate.totalReturnedBytes += row.returnedBytes;
    candidate.serializedBytes = 0;
    setSerializedBytes(candidate);
    if (candidate.serializedBytes > SOURCE_READ_LIMITS.packetBytes) {
      row = { ...refuse(selector, 'serialized_budget'), status: 'omitted' };
      packet.rows.push(row);
    } else {
      packet.rows.push(row);
      packet.totalReturnedBytes = candidate.totalReturnedBytes;
    }
  }
  setSerializedBytes(packet);
  return packet;
}

export function composeSourceDigest(repositoryFingerprint, sourceEvidence) {
  if (!sourceEvidence) return repositoryFingerprint;
  const manifest = sourceEvidence.rows.map((row) => ({
    status: row.status,
    path: row.path,
    requestedRange: row.requestedRange,
    ...(row.status === 'read' ? {
      actualRange: row.actualRange,
      fullFileSha256: row.fullFileSha256,
      citation: row.citation,
    } : row.status === 'outlined' ? {
      mode: 'outline',
      fullFileSha256: row.sha256,
      declarationCount: row.declarationCount,
      truncated: row.truncated,
    } : { reason: row.reason }),
  }));
  return `sha256:${sha256(Buffer.from(JSON.stringify({ repositoryFingerprint, manifest })) )}`;
}
