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

import { DEFAULT_IGNORE } from '../analyze/analysis-limits-and-tables.mjs';
import { repoText } from '../analyze/repo-text.mjs';
import { calleesOf } from './callees.mjs';
import { productFiles } from './declaration-index.mjs';
import { OUTLINE_DECLARATION_LIMIT, outlineSource } from './source-outline.mjs';
import { SYMBOL_CONTEXT_LIMITS, symbolContext } from './symbol-context.mjs';

const SOURCE_READ_LIMITS = Object.freeze({
  requests: 16,
  pathCharacters: 1024,
  maxLines: 200,
  fileBytes: 256 * 1024,
  rangeBytes: 8 * 1024,
  aggregateTextBytes: 32 * 1024,
  packetBytes: 64 * 1024,
  // An outline is bounded like a text range: the declaration ceiling
  // of `source-outline.mjs`, these bytes, and the same aggregate.
  outlineDeclarations: OUTLINE_DECLARATION_LIMIT,
  outlineBytes: 16 * 1024,
});

const SOURCE_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cs', '.css', '.go', '.h', '.hpp', '.html', '.java',
  '.js', '.jsx', '.kt', '.kts', '.mjs', '.mts', '.php', '.py', '.rb', '.rs',
  '.scss', '.sh', '.swift', '.ts', '.tsx', '.vue', '.zig',
  // Prose shipped beside the code (the README's statement of purpose) under the
  // same byte caps; not a manifest.
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

function isSymbol(selector) {
  return typeof selector.symbol === 'string';
}

/** A declared name, or `Owner.member` for a method inside a class or type. */
const SYMBOL_NAME = /^[A-Za-z_$#][\w$#]*(?:\.[A-Za-z_$#][\w$#]*)?$/u;

function refuse(selector, reason) {
  return {
    status: 'refused',
    path: selector.path,
    ...(isOutline(selector) ? { mode: 'outline' } : {}),
    ...(isSymbol(selector) ? { symbol: selector.symbol } : {}),
    requestedRange: isOutline(selector) || isSymbol(selector)
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
    const allowed = new Set(['path', 'startLine', 'maxLines', 'expectedSha256', 'mode', 'symbol']);
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
    if (selector.symbol !== undefined) {
      if (typeof selector.symbol !== 'string' || !SYMBOL_NAME.test(selector.symbol) || selector.symbol.length > 200) {
        throw new Error(`sourceReads[${index}].symbol must be one declared name such as "issueInvoice" or "Invoice.total".`);
      }
      if (isOutline(selector)) throw new Error(`sourceReads[${index}].symbol does not apply to mode "outline".`);
      if (selector.startLine !== undefined) throw new Error(`sourceReads[${index}].startLine does not apply with symbol; the declaration decides where the read starts.`);
      if (selector.maxLines !== undefined && (!Number.isSafeInteger(selector.maxLines) || selector.maxLines <= 0)) {
        throw new Error(`sourceReads[${index}].maxLines must be a positive safe integer.`);
      }
      if (selector.maxLines > SOURCE_READ_LIMITS.maxLines) {
        throw new Error(`sourceReads[${index}].maxLines must be <= ${SOURCE_READ_LIMITS.maxLines}.`);
      }
    } else if (isOutline(selector)) {
      // An outline lists the whole file; a range with it asks for two reads, and
      // ignoring the range would return lines nobody sees.
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

/** Whether any segment of a `/` path is hidden (leading `.`) or named like a credential, so it is never read. */
export function namesHiddenOrCredentialFile(path) {
  return path.split('/').some((part) => part.startsWith('.') || SENSITIVE.test(part));
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

/** One regular file under `rootPath`, read without following a link and re-checked after: `{ bytes }` or `{ reason }`. */
export function readStableFile(
  rootPath,
  literalPath,
  { onBeforeOpen, onDescriptorRead, maxBytes = SOURCE_READ_LIMITS.fileBytes } = {},
) {
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
    if (before.size > BigInt(maxBytes)) return { reason: 'file_too_large' };
    const buffer = Buffer.alloc(Number(before.size) + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, null);
      if (count === 0) break;
      offset += count;
    }
    onDescriptorRead?.({ target, bytes: buffer.subarray(0, offset) });
    if (offset > maxBytes || offset !== Number(before.size)) return { reason: 'file_changed' };
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

/** A declaration as the text answer sends it: `L115 def name(...)`. */
export function outlineLine(declaration) {
  const signature = String(declaration.signature ?? '').trim();
  return signature.includes(declaration.name)
    ? `L${declaration.line} ${repoText(signature, 240)}`
    : `L${declaration.line} ${declaration.kind} ${repoText(declaration.name, 120)}${signature ? ` ${repoText(signature, 240)}` : ''}`;
}

/**
 * One outline row: declarations with line numbers so the next read names an
 * exact range. No source text and no citation, since names are no evidence of
 * behaviour; `truncated` when `outlineBytes` or the declaration ceiling cut it.
 * A declaration costs the bytes of the line that is sent for it.
 */
function outlineOne(selector, bytes, text, fileLines, fullFileSha256) {
  const outline = outlineSource(text, selector.path);
  const declarations = [];
  let returnedBytes = 0;
  let truncated = outline.truncated;
  for (const declaration of outline.declarations) {
    const declarationBytes = Buffer.byteLength(outlineLine(declaration), 'utf8') + 1;
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

/**
 * Another file a symbol read draws context from, under the same path policy and
 * stable-read checks as the selector itself; null when either refuses it.
 */
function contextOpener(rootPath, ignore, hooks) {
  const cache = new Map();
  return (path) => {
    if (cache.has(path)) return cache.get(path);
    let file = null;
    if (!pathRefusal(path, ignore)) {
      const stable = readStableFile(rootPath, path, hooks);
      if (!stable.reason && !stable.bytes.includes(0)) {
        try {
          const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(stable.bytes);
          file = { path, lines: completeLines(text), declarations: outlineSource(text, path).declarations, sha256: sha256(stable.bytes) };
        } catch {
          file = null;
        }
      }
    }
    cache.set(path, file);
    return file;
  };
}

/**
 * The context bytes one symbol read may add: an even share of what the call has
 * left (so the last of eight reads is not starved), at least 1.5 KiB for the
 * best part when the call can afford it, at most `SYMBOL_CONTEXT_LIMITS.bytes`.
 */
function contextBudget(hooks, bodyBytes) {
  const remaining = (hooks?.remainingBytes ?? SOURCE_READ_LIMITS.aggregateTextBytes) - bodyBytes;
  const share = Math.floor((hooks?.remainingBytes ?? SOURCE_READ_LIMITS.aggregateTextBytes) / Math.max(1, hooks?.readsLeft ?? 1)) - bodyBytes;
  return Math.max(0, Math.min(SYMBOL_CONTEXT_LIMITS.bytes, remaining, Math.max(1536, share)));
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
  let startLine = selector.startLine;
  let maxLines = selector.maxLines;
  let declaration = null;
  let outline = null;
  if (isSymbol(selector)) {
    outline = outlineSource(text, selector.path);
    declaration = findDeclaration(lines, outline.declarations, selector.symbol);
    if (!declaration) return refuse(selector, 'symbol_not_found');
    startLine = declaration.line;
    const end = declarationEnd(lines, outline.declarations, declaration);
    maxLines = Math.min(selector.maxLines ?? SOURCE_READ_LIMITS.maxLines, end - startLine + 1, SOURCE_READ_LIMITS.maxLines);
  }
  if (startLine > lines.length) return refuse(selector, 'range_beyond_eof');
  const requested = lines.slice(startLine - 1, startLine - 1 + maxLines);
  const delivered = [];
  let returnedBytes = 0;
  for (const line of requested) {
    const lineBytes = Buffer.byteLength(line, 'utf8');
    if (lineBytes > SOURCE_READ_LIMITS.rangeBytes && delivered.length === 0) return refuse(selector, 'line_too_large');
    if (returnedBytes + lineBytes > SOURCE_READ_LIMITS.rangeBytes) break;
    delivered.push(line);
    returnedBytes += lineBytes;
  }
  const endLine = startLine + delivered.length - 1;
  const hasMore = endLine < lines.length;
  const truncated = delivered.length < requested.length || hasMore;
  const symbolEnd = declaration ? declarationEnd(lines, outline.declarations, declaration) : null;
  const open = declaration ? hooks?.open ?? contextOpener(rootPath, ignore, hooks ?? {}) : null;
  const file = declaration ? { path: selector.path, lines, declarations: outline.declarations } : null;
  const callees = declaration
    ? calleesOf({ text: delivered.join(''), file, declaration, rootPath: hooks?.rootPath, ignore: hooks?.ignore ?? [], files: hooks?.files, open })
    : null;
  const context = declaration && hooks?.rootPath
    ? symbolContext({
      rootPath: hooks.rootPath,
      ignore: hooks.ignore ?? [],
      path: selector.path,
      lines,
      declarations: outline.declarations,
      declaration,
      bodyEnd: endLine,
      callees,
      open,
      files: hooks.files,
      budget: contextBudget(hooks, returnedBytes),
    })
    : null;
  return {
    status: 'read',
    path: selector.path,
    ...(declaration ? { symbol: selector.symbol } : {}),
    fullFileSha256,
    fileBytes: stable.bytes.length,
    fileLines: lines.length,
    requestedRange: { startLine, maxLines },
    actualRange: { startLine, endLine },
    text: delivered.join(''),
    ...(declaration ? { cite: `${selector.path}:L${startLine}-L${endLine}` } : {}),
    returnedBytes: returnedBytes + (context?.bytes ?? 0),
    truncated,
    requestComplete: delivered.length === requested.length,
    fileComplete: startLine === 1 && endLine === lines.length,
    citation: `source:${selector.path}#L${startLine}-L${endLine}@sha256:${fullFileSha256}`,
    ...(declaration ? { callees } : {}),
    ...(context ? {
      context: context.parts,
      ...(context.omitted.length > 0 ? { contextOmitted: context.omitted } : {}),
      ...(context.callers.length > 0 ? { callers: context.callers } : {}),
      ...(context.deciding ? { deciding: context.deciding } : {}),
    } : {}),
    // A symbol read continues inside its own declaration only; past it is another symbol.
    next: declaration
      ? (endLine < symbolEnd ? { path: selector.path, startLine: endLine + 1, maxLines: Math.min(SOURCE_READ_LIMITS.maxLines, symbolEnd - endLine), expectedSha256: fullFileSha256 } : null)
      : (hasMore ? { path: selector.path, startLine: endLine + 1, maxLines: selector.maxLines, expectedSha256: fullFileSha256 } : null),
  };
}

/** Whether a declaration answers to `name`: exactly, or as `Receiver.name` (Go methods). */
function declares(declaration, name) {
  return declaration.name === name || declaration.name.endsWith(`.${name}`);
}

function isCode(declaration) {
  return declaration.kind !== 'export' && declaration.kind !== 'section';
}

/**
 * The declaration a symbol names. An exact name wins (Go outlines `Node.Subscribe`);
 * `Owner.member` otherwise finds the member inside its owner (Python, TypeScript); a
 * bare name also finds a Go method declared on any receiver. Among several (typing
 * overloads before the implementation), the one with the longest body.
 */
function findDeclaration(lines, declarations, symbol) {
  const code = declarations.filter(isCode);
  const longest = (candidates) => candidates.reduce((best, candidate) => (
    !best || declarationEnd(lines, declarations, candidate) - candidate.line > declarationEnd(lines, declarations, best) - best.line
      ? candidate : best), null);
  const exact = code.filter((declaration) => declaration.name === symbol);
  if (exact.length > 0) return longest(exact);
  if (symbol.includes('.')) {
    const [owner, member] = symbol.split('.');
    const ownerDeclaration = longest(code.filter((declaration) => declaration.name === owner));
    if (!ownerDeclaration) return null;
    const ownerEnd = declarationEnd(lines, declarations, ownerDeclaration);
    return longest(code.filter((declaration) => declaration.name === member
      && declaration.line > ownerDeclaration.line && declaration.line <= ownerEnd));
  }
  const methods = code.filter((declaration) => declares(declaration, symbol));
  return methods.length === 1 ? methods[0] : null;
}

function indentAt(lines, line) {
  return /^[\t ]*/u.exec(lines[line - 1] ?? '')[0].length;
}

/** The last line of a declaration: before the next declaration at its indent or shallower. */
function declarationEnd(lines, declarations, declaration) {
  const indent = indentAt(lines, declaration.line);
  const next = declarations.find((candidate) => candidate.line > declaration.line && indentAt(lines, candidate.line) <= indent);
  let end = next ? next.line - 1 : lines.length;
  while (end > declaration.line && (lines[end - 1] ?? '').trim() === '') end -= 1;
  return end;
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

/**
 * The rows `selectors` ask for. A packet sent as JSON is held to the aggregate
 * and serialized budgets; one sent as text (`sentAsText`) is bounded by the
 * caller on the characters it sends, so outlines draw on no shared budget and
 * the JSON size is not counted.
 */
export function readSourceEvidence(
  rootPath,
  selectors,
  { ignore: extraIgnore = [], onBeforeOpen, onDescriptorRead, sentAsText = false } = {},
) {
  validateSourceReadSelectors(selectors);
  const ignore = new Set([...DEFAULT_IGNORE, ...extraIgnore]);
  const packet = {
    contract: 'sourceEvidence:v1',
    trust: 'untrusted-source-data',
    coverage: 'requested-ranges-only',
    repositoryComplete: false,
    rows: [],
    totalReturnedBytes: 0,
    serializedBytes: 0,
  };
  const open = contextOpener(rootPath, ignore, {});
  const drawsOnAggregate = (row) => row.status === 'read' || (row.status === 'outlined' && !sentAsText);
  // One walk of the repository serves every selector in this call.
  let walked = null;
  const files = () => (walked ??= productFiles(rootPath, extraIgnore));
  for (const [index, selector] of selectors.entries()) {
    let row = readOne(rootPath, selector, ignore, {
      onBeforeOpen, onDescriptorRead, rootPath, ignore: extraIgnore, open, files,
      remainingBytes: SOURCE_READ_LIMITS.aggregateTextBytes - packet.totalReturnedBytes,
      readsLeft: selectors.slice(index).filter((candidate) => !isOutline(candidate)).length,
    });
    if (drawsOnAggregate(row) && packet.totalReturnedBytes + row.returnedBytes > SOURCE_READ_LIMITS.aggregateTextBytes) {
      row = { ...refuse(selector, 'aggregate_text_budget'), status: 'omitted' };
    }
    const candidate = { ...packet, rows: [...packet.rows, row] };
    if (drawsOnAggregate(row)) candidate.totalReturnedBytes += row.returnedBytes;
    candidate.serializedBytes = 0;
    if (!sentAsText) setSerializedBytes(candidate);
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
