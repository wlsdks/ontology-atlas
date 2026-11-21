// Names the functions that fill a window of a V8 CPU profile (CDP `Profiler.stop`), by self and by
// inclusive time, and finds where each is declared under src/. The perf export is built with
// `next build --no-mangling`, so profile names are source names.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SYNTHETIC = new Set(['(root)', '(program)', '(idle)']);

/** Per-window self and inclusive milliseconds by function. O(samples × stack depth). */
export function profileWindows(profile, windows) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const keyOf = (node) => {
    const f = node.callFrame;
    return `${f.functionName || '(anonymous)'}\t${f.url.replace(/^.*\/_next\//, '_next/')}:${f.lineNumber + 1}:${f.columnNumber + 1}`;
  };
  const results = windows.map((window) => ({ ...window, sampledMs: 0, gcMs: 0, self: new Map(), inclusive: new Map(), callers: new Map() }));
  let t = profile.startTime;
  for (let i = 0; i < profile.samples.length; i += 1) {
    t += profile.timeDeltas[i];
    const dt = (profile.timeDeltas[i + 1] ?? 0) / 1000;
    const node = byId.get(profile.samples[i]);
    for (const result of results) {
      if (t < result.startUs || t > result.endUs) continue;
      const name = node.callFrame.functionName;
      if (name === '(idle)') continue;
      result.sampledMs += dt;
      if (name === '(garbage collector)') result.gcMs += dt;
      if (!SYNTHETIC.has(name)) result.self.set(keyOf(node), (result.self.get(keyOf(node)) ?? 0) + dt);
      const seen = new Set();
      for (let id = node.id; id !== undefined; id = parent.get(id)) {
        const frame = byId.get(id);
        if (SYNTHETIC.has(frame.callFrame.functionName) || frame.callFrame.functionName === '(garbage collector)') continue;
        const key = keyOf(frame);
        if (seen.has(key)) continue;
        seen.add(key);
        result.inclusive.set(key, (result.inclusive.get(key) ?? 0) + dt);
        const caller = parent.get(id) === undefined ? null : byId.get(parent.get(id));
        if (caller && !SYNTHETIC.has(caller.callFrame.functionName)) {
          const byCaller = result.callers.get(key) ?? new Map();
          byCaller.set(keyOf(caller), (byCaller.get(keyOf(caller)) ?? 0) + dt);
          result.callers.set(key, byCaller);
        }
      }
    }
  }
  return results;
}

let declarations = null;
/** Every `function name`, `const name =` and method-like declaration under src/, by name. */
function declarationIndex(root) {
  if (declarations) return declarations;
  declarations = new Map();
  const pattern = /(?:function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[(<])|(?:(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function|\(|[A-Za-z_$][\w$]*\s*=>|use[A-Z]))|(?:^\s*(?:async\s+|static\s+|private\s+|public\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{]+)?\{)/gm;
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(ts|tsx|mjs|js)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
        const text = readFileSync(path, 'utf8');
        for (const match of text.matchAll(pattern)) {
          const name = match[1] ?? match[2] ?? match[3];
          if (!name || ['if', 'for', 'while', 'switch', 'catch', 'return'].includes(name)) continue;
          const line = text.slice(0, match.index).split('\n').length + (match[0].startsWith('\n') ? 1 : 0);
          const list = declarations.get(name) ?? [];
          list.push(`${relative(root, path)}:${line}`);
          declarations.set(name, list);
        }
      }
    }
  };
  for (const folder of ['src', 'mcp/src']) {
    try {
      visit(join(root, folder));
    } catch {}
  }
  return declarations;
}

/** Narrows a name declared in several files to those its heaviest caller is declared in. */
function declaredAt(key, callers, index, depth = 0) {
  const found = index.get(key.split('\t')[0]);
  if (!found || found.length === 1 || depth > 6) return found;
  const heaviestOf = (k) => [...(callers.get(k) ?? new Map())].sort((a, b) => b[1] - a[1])[0]?.[0];
  let heaviest = heaviestOf(key);
  // An arrow passed to `.some` or `.map` has no name; its own caller places it.
  for (let hop = 0; heaviest && !index.has(heaviest.split('\t')[0]) && hop < 4; hop += 1) heaviest = heaviestOf(heaviest);
  if (!heaviest) return found;
  const callerFiles = new Set((declaredAt(heaviest, callers, index, depth + 1) ?? []).map((at) => at.replace(/:\d+$/, '')));
  const narrowed = found.filter((at) => callerFiles.has(at.replace(/:\d+$/, '')));
  return narrowed.length ? narrowed : found;
}

/** `source` is where the name is declared under src/, or the chunk when no declaration matches. */
function topFunctions(map, root, limit = 5, { srcOnly = false, callers = new Map() } = {}) {
  const index = declarationIndex(root);
  return [...map.entries()]
    .filter(([key]) => !srcOnly || index.has(key.split('\t')[0]))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, ms]) => {
      const [name, chunk] = key.split('\t');
      const found = declaredAt(key, callers, index);
      return { name, ms: Math.round(ms), source: found ? found.slice(0, 4).join(', ') : `${chunk} (not under src/)` };
    });
}

/** Markdown lines naming the five largest functions of each window. */
export function describeWindows(results, root) {
  const lines = [];
  for (const result of results) {
    lines.push(`\n${result.label}: ${Math.round((result.endUs - result.startUs) / 1000)} ms, ${Math.round(result.sampledMs)} ms sampled busy, ${Math.round(result.gcMs)} ms GC`);
    lines.push('  self time:');
    for (const profiledFunction of topFunctions(result.self, root, 5, { callers: result.callers })) lines.push(`    ${String(profiledFunction.ms).padStart(7)} ms  ${profiledFunction.name}  ${profiledFunction.source}`);
    lines.push('  inclusive time:');
    for (const profiledFunction of topFunctions(result.inclusive, root, 5, { callers: result.callers })) lines.push(`    ${String(profiledFunction.ms).padStart(7)} ms  ${profiledFunction.name}  ${profiledFunction.source}`);
    lines.push('  inclusive time, declared under src/:');
    for (const profiledFunction of topFunctions(result.inclusive, root, 8, { srcOnly: true, callers: result.callers })) lines.push(`    ${String(profiledFunction.ms).padStart(7)} ms  ${profiledFunction.name}  ${profiledFunction.source}`);
  }
  return lines;
}
