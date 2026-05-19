const DEFAULT_IGNORED_PNPM_COMMANDS = new Set([
  "add",
  "audit",
  "config",
  "dlx",
  "exec",
  "install",
  "link",
  "patch",
  "publish",
  "run",
  "setup",
  "...",
  "…",
]);

const PNPM_OPTIONS_WITH_VALUE = new Set([
  "-C",
  "-F",
  "--dir",
  "--filter",
  "--workspace-concurrency",
]);

function nextCommandIndex(args, startIndex = 0) {
  for (let index = startIndex; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith("--") || /^-[A-Za-z]$/.test(arg)) {
      if (!arg.includes("=") && PNPM_OPTIONS_WITH_VALUE.has(arg)) {
        index += 1;
      }
      continue;
    }
    return index;
  }
  return -1;
}

function stripMatchingQuotes(value) {
  const text = String(value);
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function normalizePackageSelector(value) {
  const text = stripMatchingQuotes(value).replace(/\\/g, '/').replace(/\/+$/, '');
  if (!text || text === '.') return null;
  if (text.startsWith('./') || text.startsWith('../') || text.startsWith('/')) return text;
  return `./${text}`;
}

function scriptRefFromPnpmArgs(argsText) {
  const args = String(argsText).trim().split(/\s+/).filter(Boolean);
  let filter = null;
  let dir = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--filter' || arg === '-F') {
      filter = stripMatchingQuotes(args[index + 1] ?? '');
      index += 1;
    } else if (arg.startsWith('--filter=')) {
      filter = stripMatchingQuotes(arg.slice('--filter='.length));
    } else if (arg === '--dir' || arg === '-C') {
      dir = normalizePackageSelector(args[index + 1] ?? '');
      index += 1;
    } else if (arg.startsWith('--dir=')) {
      dir = normalizePackageSelector(arg.slice('--dir='.length));
    }
  }
  const packageSelector = filter || dir;
  const commandIndex = nextCommandIndex(args);
  if (commandIndex < 0) {
    return null;
  }
  if (args[commandIndex] !== "run") {
    return { script: stripMatchingQuotes(args[commandIndex]), filter: packageSelector };
  }
  const scriptIndex = nextCommandIndex(args, commandIndex + 1);
  return scriptIndex < 0 ? null : { script: stripMatchingQuotes(args[scriptIndex]), filter: packageSelector };
}

function collectPnpmCommandCandidates(text) {
  const source = String(text);
  const candidates = [];
  const commandPattern =
    /(?:^|\n|`|&&|\|\||\()\s*(?:[$>]\s*)?(?:[A-Z_][A-Z0-9_]*=\S+\s+)*pnpm\s+([^\n`&|;)]+)/g;
  for (const match of source.matchAll(commandPattern)) {
    const ref = scriptRefFromPnpmArgs(match[1]);
    if (ref?.script) {
      candidates.push(ref);
    }
  }
  return candidates;
}

function isConcretePackageScript(script) {
  return !DEFAULT_IGNORED_PNPM_COMMANDS.has(script) && !script.includes("*") && !script.endsWith(":");
}

export function pnpmScriptRefsFromText(text) {
  const seen = new Set();
  const refs = [];
  for (const ref of collectPnpmCommandCandidates(text)) {
    if (!isConcretePackageScript(ref.script)) continue;
    const key = `${ref.filter ?? ''}\0${ref.script}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}

export function pnpmScriptsFromText(text) {
  return [...new Set(pnpmScriptRefsFromText(text).map((ref) => ref.script))];
}

export function missingPnpmScripts(text, scripts = {}, { filteredScripts = {} } = {}) {
  return pnpmScriptRefsFromText(text)
    .filter((ref) => {
      if (ref.filter && filteredScripts[ref.filter]) {
        return typeof filteredScripts[ref.filter]?.[ref.script] !== "string";
      }
      return typeof scripts?.[ref.script] !== "string";
    })
    .map((ref) => (ref.filter ? `${ref.filter}:${ref.script}` : ref.script));
}

export function assertPnpmScriptsExist(text, scripts = {}, options = {}) {
  const missing = missingPnpmScripts(text, scripts, options);
  if (missing.length > 0) {
    throw new Error(`Missing package.json scripts: ${missing.join(", ")}`);
  }
}
