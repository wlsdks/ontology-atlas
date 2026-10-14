import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

const CONTRACT_TEST = /^tests\/contract\/(?:vault-format|design-tokens|agent-chat|security|desktop|control-adoption|layout|routes|controls|harness|agent-instructions|mcp|analysis|architecture|brand|vault-data|map|typography|messages|ci-gates|cli|library|copy|motion|settings|release\/)?.+\.test\.ts$/;
const PERF_TEST = /^(?:app|src)\/.+\.perf\.test\.tsx?$/;
const UNIT_TEST = /^(?:app|src)\/.+\.(?:test|spec)\.tsx?$/;
const TEST_DIRECTORIES = ['app', 'src', 'tests/contract'];
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.mjs', '.js', '.cjs', '.jsx', '.json'];
const PACKAGE_DIRECTORY = '(?:app|cli|mcp|scripts|src|tests)/';
const REPOSITORY_FILE = new RegExp(`^${PACKAGE_DIRECTORY}[^?#]+\\.(?:[cm]?[jt]sx?|json)$`);
const PATH_LITERAL = new RegExp(`(['"\`])((?:\\.{1,2}/|@/|${PACKAGE_DIRECTORY})[^'"\`\\s$]*)\\1`, 'g');
const IMPORT_SPECIFIER = /(['"])((?:\.{1,2}\/|@\/)[^'"\s$]*)\1/g;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*).*$/gm;
const TOKEN = /\s+|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])*'|[A-Za-z_$][\w$]*|[^\s]/g;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * O(source bytes + edges), before dependency installation. Contracts retain textual and
 * read/spawn edges; runtime tests omit only unambiguous explicit type-only declarations.
 */
export function createTestReach(root = process.cwd()) {
  const fileCache = new Map();
  const isFile = (path) => {
    if (!fileCache.has(path)) fileCache.set(path, statSync(join(root, path), { throwIfNoEntry: false })?.isFile() === true);
    return fileCache.get(path);
  };
  const aliases = readAliases(root);
  const full = { dependents: new Map(), unresolved: new Map() };
  const runtime = { dependents: new Map(), unresolved: new Map() };
  const tests = TEST_DIRECTORIES.flatMap((directory) => listFiles(root, directory)).filter(testKind);
  const visited = new Set(tests);
  const queue = [...tests];

  while (queue.length > 0) {
    const from = queue.pop();
    if (!CODE_FILE.test(from)) continue;
    const literals = from.startsWith('tests/') ? PATH_LITERAL : IMPORT_SPECIFIER;
    const source = readFileSync(join(root, from), 'utf8');
    const typeOnly = typeOnlySpecifierStarts(source);
    const uncommented = source.replace(COMMENT_LINE, (comment) => ' '.repeat(comment.length));
    for (const match of uncommented.matchAll(literals)) {
      const specifier = match[2];
      const base = specifierBase(from, specifier, aliases);
      if (base === null) continue;
      const target = moduleCandidates(base, specifier).find(isFile);
      const graphs = typeOnly.has(match.index) ? [full] : [full, runtime];
      if (!target) {
        for (const graph of graphs) {
          for (const candidate of moduleCandidates(base, specifier)) addEdge(graph.unresolved, candidate, from);
        }
        continue;
      }
      for (const graph of graphs) addEdge(graph.dependents, target, from);
      if (!visited.has(target)) {
        visited.add(target);
        queue.push(target);
      }
    }
  }

  /**
   * Each graph traverses O(files + edges), then sorts reached paths in O(files log files).
   * A path missing on disk (deleted, or a catalogue built at install) is reached through the
   * imports that would resolve to it.
   */
  function testsReaching(paths) {
    const grouped = { contract: [], unit: [], perf: [] };
    for (const [graph, contracts] of [[full, true], [runtime, false]]) {
      for (const path of reachable(paths, graph)) {
        const kind = testKind(path);
        if (kind && (kind === 'contract') === contracts) grouped[kind].push(path);
      }
    }
    return grouped;
  }

  return { testsReaching };
}

function reachable(paths, { dependents, unresolved }) {
  const reached = new Set(paths.flatMap((path) => [path, ...(unresolved.get(path) ?? [])]));
  const stack = [...reached];
  while (stack.length > 0) {
    for (const dependent of dependents.get(stack.pop()) ?? []) {
      if (reached.has(dependent)) continue;
      reached.add(dependent);
      stack.push(dependent);
    }
  }
  return [...reached].sort();
}

function typeOnlySpecifierStarts(source) {
  const tokens = [];
  for (const match of source.matchAll(TOKEN)) {
    const value = match[0];
    if (/^\s|^\/\//.test(value) || value.startsWith('/*')) continue;
    // Templates, regex/division and JSX are retained, not partially parsed.
    if (['`', '/', '<', '"', "'"].includes(value)) break;
    tokens.push({ value, start: match.index });
  }
  const starts = new Set();
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const value = tokens[i].value;
    if (depth === 0 && ['import', 'export'].includes(value) && tokens[i + 1]?.value === 'type') {
      const end = typeOnlySpecifierAt(tokens, i);
      if (end !== null) {
        starts.add(tokens[end].start);
        i = end;
        continue;
      }
    }
    if (['{', '(', '['].includes(value)) depth++;
    if (['}', ')', ']'].includes(value)) depth--;
  }
  return starts;
}

function typeOnlySpecifierAt(tokens, start) {
  let i = start + 2;
  const value = () => tokens[i]?.value;
  const identifier = () => IDENTIFIER.test(value() ?? '');
  if (value() === '{') {
    i++;
    while (value() !== '}') {
      if (!identifier()) return null;
      i++;
      if (value() === 'as') {
        i++;
        if (!identifier()) return null;
        i++;
      }
      if (value() === ',') i++;
      else if (value() !== '}') return null;
    }
    i++;
  } else if (value() === '*') {
    i++;
    if (value() === 'as') {
      i++;
      if (!identifier()) return null;
      i++;
    } else if (tokens[start].value === 'import') return null;
  } else if (tokens[start].value === 'import' && identifier() && value() !== 'from') {
    i++;
  } else return null;
  if (value() !== 'from') return null;
  i++;
  return /^["']/.test(value() ?? '') ? i : null;
}

const reachByRoot = new Map();

export function loadTestReach(root = process.cwd()) {
  if (!reachByRoot.has(root)) reachByRoot.set(root, createTestReach(root));
  return reachByRoot.get(root);
}

function addEdge(edges, target, from) {
  if (!edges.has(target)) edges.set(target, new Set());
  edges.get(target).add(from);
}

function testKind(path) {
  if (CONTRACT_TEST.test(path)) return 'contract';
  if (PERF_TEST.test(path)) return 'perf';
  if (UNIT_TEST.test(path)) return 'unit';
  return null;
}

function listFiles(root, directory) {
  let entries;
  try {
    entries = readdirSync(join(root, directory), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? listFiles(root, path) : [path];
  });
}

function readAliases(root) {
  let paths = {};
  try {
    paths = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8')).compilerOptions?.paths ?? {};
  } catch {
    return [];
  }
  return Object.entries(paths)
    .filter(([pattern, [target] = []]) => pattern.endsWith('/*') && target?.endsWith('/*'))
    .map(([pattern, [target]]) => [pattern.slice(0, -1), posix.normalize(target.slice(0, -1))])
    .sort((a, b) => b[0].length - a[0].length);
}

function specifierBase(from, specifier, aliases) {
  const path = specifier.replace(/[?#].*$/, '');
  let base;
  if (path.startsWith('.')) base = posix.join(posix.dirname(from), path);
  else if (path.startsWith('@/')) {
    const alias = aliases.find(([prefix]) => path.startsWith(prefix));
    if (!alias) return null;
    base = posix.join(alias[1], path.slice(alias[0].length));
  } else base = path;
  return base.startsWith('../') || base.includes('node_modules/') ? null : base;
}

/** A repository-rooted name must be an exact file; an import specifier resolves like the bundler. */
function moduleCandidates(base, specifier) {
  if (!/^[.@]/.test(specifier)) return REPOSITORY_FILE.test(base) ? [base] : [];
  const sourceTwin = /\.[cm]?js$/.test(base) ? ['.ts', '.tsx'].map((extension) => base.replace(/\.[cm]?js$/, extension)) : [];
  return [
    base,
    ...EXTENSIONS.map((extension) => `${base}${extension}`),
    ...sourceTwin,
    ...EXTENSIONS.map((extension) => posix.join(base, `index${extension}`)),
  ];
}
