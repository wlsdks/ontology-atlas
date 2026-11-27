// Compares two recorded runs of one corpus case: per request id the whole answer line (the JSON-RPC
// envelope, text bytes, structured keys in emitted order, number text, `isError`, escapes and
// spacing), then the written folders, the server's own messages, stderr, exit and the repository.
// Nothing is masked except the times of files this run wrote and what a family lists as "equal
// except".
import { Buffer } from 'node:buffer';

import { diffSnapshots } from './folder-snapshot.mjs';
import { firstTreeDifference, parseOrdered } from './ordered-json.mjs';

const NUMBER = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const OWN_TIME = '<own-file-time>';

/**
 * Replaces, in text, each number that is the time of a file this run wrote, wherever it sits: a
 * JSON number, or inside a message such as `currentMtime=1795780090155.0745`.
 */
export function maskOwnTimesInText(text, ownTimes) {
  if (ownTimes.size === 0) return text;
  return text.replace(NUMBER, (token) => (ownTimes.has(Number(token)) ? OWN_TIME : token));
}

function maskOwnTimesInTree(node, ownTimes) {
  if (ownTimes.size === 0) return node;
  const rewrite = (current) => {
    if (current.t === 'num') return ownTimes.has(Number(current.text)) ? { t: 'str', v: OWN_TIME } : current;
    if (current.t === 'str') return { t: 'str', v: maskOwnTimesInText(current.v, ownTimes) };
    if (current.t === 'arr') return { t: 'arr', items: current.items.map(rewrite) };
    if (current.t === 'obj') return { t: 'obj', entries: current.entries.map(([k, v]) => [k, rewrite(v)]) };
    return current;
  };
  return rewrite(node);
}

/** `a.b[].c`: `[]` any array index, `*` any key. Replaces each match by `null`. */
function maskPath(node, pattern) {
  const segments = pattern.match(/[^.[\]]+|\[\]/g) ?? [];
  const apply = (current, depth) => {
    if (depth === segments.length) return { t: 'null' };
    const segment = segments[depth];
    if (segment === '[]') {
      if (current.t !== 'arr') return current;
      return { t: 'arr', items: current.items.map((item) => apply(item, depth + 1)) };
    }
    if (current.t !== 'obj') return current;
    return {
      t: 'obj',
      entries: current.entries.map(([key, value]) => (segment === '*' || key === segment ? [key, apply(value, depth + 1)] : [key, value])),
    };
  };
  return apply(node, 0);
}

function firstDifferingByte(a, b, encoding = 'utf8') {
  const left = Buffer.from(a, encoding);
  const right = Buffer.from(b, encoding);
  const common = Math.min(left.length, right.length);
  for (let i = 0; i < common; i += 1) if (left[i] !== right[i]) return i;
  return left.length === right.length ? -1 : common;
}

function around(text, byteOffset, width = 40, encoding = 'utf8') {
  const bytes = Buffer.from(text, encoding);
  const from = Math.max(0, byteOffset - width);
  return JSON.stringify(bytes.subarray(from, byteOffset + width).toString(encoding));
}

function describeValueDifference(difference) {
  if (difference.kind !== 'value' || !difference.a?.startsWith('"') || !difference.b?.startsWith('"')) return difference;
  const a = JSON.parse(difference.a);
  const b = JSON.parse(difference.b);
  const byte = firstDifferingByte(a, b);
  return { ...difference, byte, aAround: around(a, byte), bAround: around(b, byte) };
}

function parseAnswer(raw) {
  try {
    return parseOrdered(raw);
  } catch {
    return null;
  }
}

/** A line as the bytes it arrived in: Latin-1, one character per byte. */
function bytesOf(text, bytes) {
  return bytes ?? Buffer.from(text, 'utf8').toString('latin1');
}

/**
 * First difference between two raw answer lines for one request, or null. The whole JSON-RPC
 * response is compared, `jsonrpc`, `id` as written and the exclusive `result` or `error` included,
 * and when nothing but the bytes differ (an escape, a space) that is a difference too.
 * `except` are the family's named fields (`{ tool, path }`, the path from the response root).
 */
function compareAnswerLines({ request, a, b, bytesA, bytesB, ownTimesA, ownTimesB, except = [] }) {
  if (a === null || b === null) {
    if (a === b) return null;
    return { kind: 'no-answer', path: '', a: a === null ? 'no answer' : 'answered', b: b === null ? 'no answer' : 'answered' };
  }
  const toolName = request?.params?.name;
  const rules = except.filter((rule) => rule.tool === toolName).map((rule) => rule.path);
  const rawA = maskOwnTimesInText(bytesOf(a, bytesA), ownTimesA);
  const rawB = maskOwnTimesInText(bytesOf(b, bytesB), ownTimesB);
  if (rules.length === 0 && rawA === rawB) return null;
  const treeA = parseAnswer(a);
  const treeB = parseAnswer(b);
  if (!treeA || !treeB) {
    return { kind: 'unparsed', path: '', a, b, byte: firstDifferingByte(rawA, rawB, 'latin1') };
  }
  let left = maskOwnTimesInTree(treeA, ownTimesA);
  let right = maskOwnTimesInTree(treeB, ownTimesB);
  for (const pattern of rules) {
    left = maskPath(left, pattern);
    right = maskPath(right, pattern);
  }
  const found = firstTreeDifference(left, right, '');
  if (found) return describeValueDifference(found);
  if (rules.length > 0 || rawA === rawB) return null;
  const byte = firstDifferingByte(rawA, rawB, 'latin1');
  return {
    kind: 'bytes',
    path: '',
    a: 'same JSON, other bytes',
    b: 'same JSON, other bytes',
    byte,
    aAround: around(rawA, byte, 40, 'latin1'),
    bAround: around(rawB, byte, 40, 'latin1'),
  };
}

function messageList(run) {
  return run.serverMessages.map((message) => bytesOf(message.raw, message.bytes));
}

/**
 * Every difference between two runs of one case, answers first. Each carries `where`.
 * @returns {object[]}
 */
export function compareRuns(a, b, { except = [], folderIgnore = () => false } = {}) {
  const differences = [];
  const stepsA = new Map(a.answers.filter((x) => x.request).map((x) => [x.step, x]));
  const stepsB = new Map(b.answers.filter((x) => x.request).map((x) => [x.step, x]));
  for (const step of [...new Set([...stepsA.keys(), ...stepsB.keys()])].sort((x, y) => x - y)) {
    const left = stepsA.get(step);
    const right = stepsB.get(step);
    const request = (left ?? right).request;
    const found = compareAnswerLines({
      request,
      a: left ? left.response : null,
      b: right ? right.response : null,
      bytesA: left?.responseBytes,
      bytesB: right?.responseBytes,
      ownTimesA: a.ownTimes,
      ownTimesB: b.ownTimes,
      except,
    });
    if (found) {
      differences.push({
        where: 'answer',
        step,
        id: request.id,
        request,
        answerA: left?.response ?? null,
        answerB: right?.response ?? null,
        ...found,
      });
    }
  }
  const ownA = a.ownTimes;
  const ownB = b.ownTimes;
  const listA = messageList(a).map((line) => maskOwnTimesInText(line, ownA));
  const listB = messageList(b).map((line) => maskOwnTimesInText(line, ownB));
  if (JSON.stringify(listA) !== JSON.stringify(listB)) {
    const index = listA.findIndex((line, i) => line !== listB[i]);
    const at = index === -1 ? Math.min(listA.length, listB.length) : index;
    differences.push({
      where: 'server-message',
      kind: 'value',
      path: `message ${at}`,
      answerA: listA[at] ?? null,
      answerB: listB[at] ?? null,
      byte: firstDifferingByte(listA[at] ?? '', listB[at] ?? '', 'latin1'),
    });
  }
  for (const difference of diffSnapshots(a.folder, b.folder)) {
    if (folderIgnore(difference.path)) continue;
    differences.push({ where: 'folder', kind: difference.change, path: difference.path, folderA: difference.a, folderB: difference.b });
  }
  if (a.git?.head !== b.git?.head || a.git?.status !== b.git?.status) {
    differences.push({ where: 'git', kind: 'value', path: 'repository state', answerA: JSON.stringify(a.git), answerB: JSON.stringify(b.git) });
  }
  if (a.stderr !== b.stderr) {
    differences.push({ where: 'stderr', kind: 'value', path: 'stderr', answerA: a.stderr, answerB: b.stderr, byte: firstDifferingByte(a.stderr, b.stderr) });
  }
  if (a.exit.code !== b.exit.code || a.exit.signal !== b.exit.signal || a.exit.spawnError !== b.exit.spawnError) {
    differences.push({ where: 'exit', kind: 'value', path: 'exit', answerA: JSON.stringify(a.exit), answerB: JSON.stringify(b.exit) });
  }
  for (const [label, run] of [['a', a], ['b', b]]) {
    for (const problem of run.problems ?? []) {
      differences.push({
        where: problem.kind,
        kind: problem.kind,
        path: problem.path,
        answerA: label === 'a' ? problem.detail : null,
        answerB: label === 'b' ? problem.detail : null,
      });
    }
  }
  return differences;
}

function clip(text, length = 700) {
  if (text === null || text === undefined) return String(text);
  return text.length > length ? `${text.slice(0, length)} ... (${text.length} chars)` : text;
}

/** Text a person reads for one difference. */
export function formatDifference(difference, { family, caseName, labelA, labelB }) {
  const lines = [`DIFFERENCE  ${family}/${caseName}  ${difference.where}  ${difference.kind}  ${difference.path ?? ''}`];
  if (difference.where === 'answer') {
    lines.push(`  request id ${JSON.stringify(difference.id)}: ${clip(JSON.stringify(difference.request), 400)}`);
    lines.push(`  ${labelA}: ${clip(difference.answerA)}`);
    lines.push(`  ${labelB}: ${clip(difference.answerB)}`);
    if (difference.byte !== undefined && difference.byte >= 0) {
      lines.push(`  first differing byte ${difference.byte}: ${labelA} ${difference.aAround}  ${labelB} ${difference.bAround}`);
    } else {
      lines.push(`  ${labelA} ${clip(String(difference.a), 200)}  |  ${labelB} ${clip(String(difference.b), 200)}`);
    }
  } else if (difference.where === 'folder') {
    lines.push(`  ${labelA}: ${difference.folderA ? clip(difference.folderA.text ?? JSON.stringify(difference.folderA), 300) : 'absent'}`);
    lines.push(`  ${labelB}: ${difference.folderB ? clip(difference.folderB.text ?? JSON.stringify(difference.folderB), 300) : 'absent'}`);
    if (difference.folderA?.text !== undefined && difference.folderB?.text !== undefined) {
      const byte = firstDifferingByte(difference.folderA.text, difference.folderB.text, 'latin1');
      lines.push(`  first differing byte ${byte}: ${labelA} ${around(difference.folderA.text, byte, 40, 'latin1')}  ${labelB} ${around(difference.folderB.text, byte, 40, 'latin1')}`);
    }
  } else {
    lines.push(`  ${labelA}: ${clip(difference.answerA)}`);
    lines.push(`  ${labelB}: ${clip(difference.answerB)}`);
    if (difference.byte !== undefined && difference.byte >= 0) lines.push(`  first differing byte ${difference.byte}`);
  }
  return lines.join('\n');
}
