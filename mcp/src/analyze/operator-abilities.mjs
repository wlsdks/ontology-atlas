/**
 * Abilities an operator or a calling program gets that no route or dispatcher
 * shows: the subcommands a command-line parser registers, the flags that change
 * behaviour (grouped the way the code groups them), the settings a configuration
 * struct turns on, and the background workers and schedulers the product starts.
 * Each row carries the file and line it was found at. Static text scans only:
 * nothing runs, and a name is never read for meaning.
 */

import { basename, dirname, extname } from 'node:path';

const JS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
/** A longer line is data (a minified bundle, an embedded blob), never a declaration; it is read as blank. */
const LINE_LIMIT = 2000;

/** The lines of `text`, each over the line limit blanked so line numbers still hold. */
export function boundedLines(text) {
  return String(text ?? '').split(/\r?\n/).map((line) => (line.length > LINE_LIMIT ? '' : line));
}

function languageOf(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.go') return 'go';
  if (ext === '.py') return 'py';
  if (ext === '.rs') return 'rs';
  if (JS.has(ext)) return 'js';
  return null;
}

/** `metricsCLIFlags`, `add_train_arguments` and `SignedStreams` as lower-case words. */
export function wordsOf(name) {
  return String(name ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

/** The comparable form of a name: `signed-streams`, `SignedStreams` and `signed_streams` agree. */
export function nameKey(name) {
  return wordsOf(name).map((word) => word.replace(/s$/, '')).join('');
}

/* ---------------------------------------------------------------------------
 * The declaration a line sits in
 * ------------------------------------------------------------------------- */

const GO_FUNC = /^func\s+(?:\(\s*\w+\s+\*?([A-Za-z_]\w*)(?:\[[^\]()]*\])?\s*\)\s*)?([A-Za-z_]\w*)/;
const PY_DEF = /^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)/;
const PY_CLASS = /^(\s*)class\s+([A-Za-z_]\w*)/;
const JS_FUNCTION = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/;
const JS_ARROW = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]*)?=>/;
const JS_METHOD_HEAD = /^\s+(?:(?:public|private|protected|static|async|override|readonly)\s+)*([A-Za-z_$][\w$]*)\s*\(/;
const JS_CLASS = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;
const RS_FN = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/;
const RS_IMPL = /^impl(?:<[^>]*>)?\s+(?:[\w:]+\s+for\s+)?([A-Za-z_]\w*)/;
const JS_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'constructor']);

const RS_TOP_ITEM = /^(?:pub\s+)?(?:fn|struct|enum|mod|trait)\b/;
const RS_ATTRIBUTE_OR_COMMENT = /^\s*(?:#\[|\/\/)/;
const RUST_TEST_ATTRIBUTE = /^\s*#\[(?:(?:[\w:]+::)?test\b|cfg\(test\))/;

/**
 * A method head (`  async save(input) {`): a name, a parameter list, a block
 * opening at the line's end, no statement end after the parameters, and no arrow,
 * so `useEffect(() => {` is a call, not a declaration. Tested without a regex
 * over the tail, which stays linear on any line.
 */
function jsMethodName(line) {
  const head = JS_METHOD_HEAD.exec(line);
  if (!head || !line.trimEnd().endsWith('{') || line.includes('=>')) return null;
  const tail = line.slice(head[0].length);
  const close = tail.indexOf(')');
  return close >= 0 && tail.slice(close + 1).includes(';') ? null : head[1];
}

/** `{` minus `}` on a line, as written: a brace inside a string can misjudge a line. */
function braceDelta(line, parens = false) {
  let delta = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line.charCodeAt(index);
    if (char === 123 || (parens && char === 40)) delta += 1;
    else if (char === 125 || (parens && char === 41)) delta -= 1;
  }
  return delta;
}

function indentOf(line) {
  let index = 0;
  while (index < line.length && (line[index] === ' ' || line[index] === '\t')) index += 1;
  return index;
}

/**
 * The declaration each line sits in, `{ owner, name, line }` or null, from one
 * forward pass that carries the open declarations: Go and Rust by the last
 * function head (a Rust one under an `impl` names its type, and says whether a
 * test attribute sits on it), Python by indentation, JavaScript by brace depth,
 * so a helper declared and closed above a line is not that line's function.
 */
function declarationsOf(lines, language) {
  const around = new Array(lines.length).fill(null);
  if (language === 'go') {
    let current = null;
    for (let index = 0; index < lines.length; index += 1) {
      const match = GO_FUNC.exec(lines[index]);
      if (match) current = { owner: match[1] ?? null, name: match[2], line: index + 1 };
      around[index] = current;
    }
  } else if (language === 'rs') {
    let current = null;
    let impl = null;
    let testAttribute = false;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const head = RS_IMPL.exec(line);
      if (head) impl = head[1];
      else if (RS_TOP_ITEM.test(line)) impl = null;
      const fn = RS_FN.exec(line);
      if (fn) current = { owner: impl, name: fn[1], line: index + 1, test: testAttribute };
      around[index] = current;
      testAttribute = RS_ATTRIBUTE_OR_COMMENT.test(line) ? testAttribute || RUST_TEST_ATTRIBUTE.test(line) : false;
    }
  } else if (language === 'py') {
    // Each open block: its indent, the function it is or sits in, and the nearest class.
    const open = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.trim()) { around[index] = open.at(-1)?.def ?? null; continue; }
      const indent = indentOf(line);
      while (open.length > 0 && open.at(-1).indent >= indent) open.pop();
      const top = open.at(-1);
      const def = PY_DEF.exec(line);
      const klass = def ? null : PY_CLASS.exec(line);
      if (def) {
        const declaration = { owner: top?.klass ?? null, name: def[2], line: index + 1 };
        open.push({ indent, def: declaration, klass: top?.klass ?? null });
        around[index] = declaration;
      } else {
        if (klass) open.push({ indent, def: top?.def ?? null, klass: klass[2] });
        around[index] = top?.def ?? null;
      }
    }
  } else if (language === 'js') {
    // Each open block: the depth it opened at, the function it is or sits in, and the nearest class.
    const open = [];
    let depth = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      while (open.length > 0 && open.at(-1).depth >= depth) open.pop();
      const top = open.at(-1);
      const klass = JS_CLASS.exec(line);
      const plain = klass ? null : JS_FUNCTION.exec(line) ?? JS_ARROW.exec(line);
      const method = klass || plain ? null : jsMethodName(line);
      let block = null;
      if (klass) block = { depth, def: top?.def ?? null, klass: klass[1] };
      else if (plain) block = { depth, def: { owner: null, name: plain[1], line: index + 1 }, klass: top?.klass ?? null };
      else if (method && !JS_KEYWORDS.has(method)) {
        block = { depth, def: { owner: top?.klass ?? null, name: method, line: index + 1 }, klass: top?.klass ?? null };
      }
      if (block) open.push(block);
      around[index] = (block ?? top)?.def ?? null;
      depth = Math.max(0, depth + braceDelta(line));
    }
  }
  return around;
}

/* ---------------------------------------------------------------------------
 * Subcommands
 * ------------------------------------------------------------------------- */

const JS_CLI_LIBRARY = /(?:\bfrom[ \t]+|\brequire\([ \t]*)['"](?:commander|yargs|cac|sade|clipanion|@oclif\/core|meow|citty)['"]/;

/** Subcommands a command-line parser registers: cobra, urfave/cli, argparse, click, typer, commander, yargs, clap. */
function subcommandsIn(path, text, lines, language) {
  const rows = [];
  const dataclassCli = language === 'py' && /^[ \t]*(?:import|from)[ \t]+tyro\b|simple_parsing/m.test(text);
  if (language === 'js' && !JS_CLI_LIBRARY.test(text)) return rows;
  const push = (name, index) => {
    if (name && /^[\w][\w:-]*$/.test(name) && !['help', 'version', 'completion'].includes(name)) {
      rows.push({ kind: 'subcommand', name, path, line: index + 1 });
    }
  };
  const nameWithin = (index, pattern) => {
    for (let look = index; look < Math.min(lines.length, index + 6); look += 1) {
      const match = pattern.exec(lines[look]);
      if (match) return match[1];
    }
    return null;
  };
  // The dataclass whose body is being read, and whether a Rust Subcommand derive waits for its enum or is inside it.
  let dataclass = null;
  let subcommandEnum = 'none';
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (language === 'go') {
      if (/&cobra\.Command\{/.test(line)) push(nameWithin(index, /\bUse:\s*"([\w:-]+)/), index);
      else if (/&cli\.Command\{|\bcli\.Command\{/.test(line)) push(nameWithin(index, /\bName:\s*"([\w:-]+)"/), index);
    } else if (language === 'py') {
      // tyro and simple-parsing build a subcommand from each dataclass that has a run method.
      if (dataclass && index > dataclass.line && /^\S/.test(line)) dataclass = null;
      if (dataclass && /^\s+def run\(/.test(line)) {
        push(wordsOf(dataclass.name).join('-'), dataclass.line);
        dataclass = null;
      }
      if (dataclassCli && /^@dataclass\b/.test(line)) {
        const klass = /^class\s+([A-Z]\w*)/.exec(lines[index + 1] ?? '');
        if (klass) dataclass = { name: klass[1], line: index + 1 };
      }
      const parser = /\.add_parser\(\s*["']([\w:-]+)["']/.exec(line);
      if (parser) push(parser[1], index);
      const decorated = /^\s*@\w+\.command\(\s*(?:(?:name\s*=\s*)?["']([\w:-]+)["'])?/.exec(line);
      if (decorated && !/^\s*@click\.command\b/.test(line)) {
        const def = lines.slice(index + 1, index + 6).map((next) => /^\s*(?:async\s+)?def\s+(\w+)/.exec(next)).find(Boolean);
        push(decorated[1] ?? def?.[1]?.replace(/_/g, '-'), index);
      }
    } else if (language === 'js') {
      const command = /\.command\(\s*["'`]([\w:-]+)/.exec(line);
      if (command) push(command[1], index);
    } else if (language === 'rs') {
      if (subcommandEnum === 'inside') {
        if (/^\}/.test(line)) subcommandEnum = 'none';
        else {
          const variant = /^\s{4}([A-Z]\w*)\s*(?:[{(,]|$)/.exec(line);
          if (variant) push(wordsOf(variant[1]).join('-'), index);
        }
      } else if (/#\[derive\([^)]*\bSubcommand\b/.test(line)) subcommandEnum = 'waiting';
      else if (subcommandEnum === 'waiting' && /\benum\s+\w+/.test(line)) subcommandEnum = 'inside';
    }
  }
  return rows;
}

/* ---------------------------------------------------------------------------
 * Flags
 * ------------------------------------------------------------------------- */

const GENERIC_FLAGS = new Set([
  'help', 'version', 'verbose', 'quiet', 'silent', 'debug', 'color', 'no-color', 'colour', 'json', 'yes', 'h', 'v',
  'log-level', 'loglevel', 'log', 'config', 'config-path', 'config-file', 'print-config',
]);
const FLAG_GROUP_FUNCTION = /^(?:add|register|define|build|get|new|make|setup|with|parse)?_?([A-Za-z0-9]+?(?:_[A-Za-z0-9]+?)*)_?(?:CLI|Cli|cli)?_?(?:Flags?|flags?|Options|options|Opts|opts|Args|args|Arguments|arguments|Params|params)$/;
const GENERIC_GROUPS = new Set(['', 'cli', 'cmd', 'command', 'global', 'common', 'default', 'root', 'main', 'app', 'all', 'base', 'misc', 'other', 'parser', 'new', 'config']);

/** One flag a parser defines: `{ name, line, boolean, group }`, the group from its parser call when the code names one. */
function flagsIn(lines, language) {
  const flags = [];
  let around = null;
  const groupOf = new Map();
  const argumentGroups = new Map();
  const within = (index, count) => lines.slice(index, Math.min(lines.length, index + count)).join('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    let found = null;
    if (language === 'go') {
      const urfave = /&cli\.(\w+?)Flag\{/.exec(line);
      if (urfave) {
        const block = within(index, 8);
        const name = /\bName:\s*"([\w.-]+)"/.exec(block);
        const category = /\bCategory:\s*"([^"]+)"/.exec(block);
        if (name) found = { name: name[1], boolean: urfave[1] === 'Bool', group: category?.[1] ?? null };
      }
      const std = /\b(?:flag|pflag|\w+\.(?:Persistent)?Flags\(\))\.(Bool|String|Int|Int64|Uint|Duration|Float64|StringSlice|StringArray)(?:Var)?P?\(\s*(?:&[\w.[\]]+\s*,\s*)?"([\w.-]+)"/.exec(line);
      if (std) found = { name: std[2], boolean: std[1] === 'Bool', group: null };
    } else if (language === 'py') {
      const group = line.includes('add_argument_group(')
        ? /\b(\w+)[ \t]*=[ \t]*\w+\.add_argument_group\([ \t]*(?:title[ \t]*=[ \t]*)?["']([^"']+)["']/.exec(line) : null;
      if (group) argumentGroups.set(group[1], group[2]);
      const argument = line.includes('.add_argument(')
        ? /\b(\w+)\.add_argument\([ \t]*(?:["']-\w["'][ \t]*,[ \t]*)?["']--([\w-]+)["']/.exec(line) : null;
      if (argument) {
        const block = within(index, 4);
        found = { name: argument[2], boolean: /action\s*=\s*["']store_(?:true|false)["']|BooleanOptionalAction/.test(block), group: argumentGroups.get(argument[1]) ?? null };
      }
      const option = /@(?:click|\w+)\.option\(\s*(?:["']-\w["']\s*,\s*)?["']--([\w-]+)/.exec(line) ?? /typer\.Option\([^)]*["']--([\w-]+)["']/.exec(line);
      if (option) found = { name: option[1].split('/')[0], boolean: /is_flag\s*=\s*True/.test(within(index, 4)), group: null };
    } else if (language === 'js') {
      const commander = /\.(?:requiredOption|option)\(\s*["'`](?:-\w\s*,\s*)?--([\w-]+)([^"'`]*)["'`]/.exec(line);
      if (commander) found = { name: commander[1], boolean: !/[<[]/.test(commander[2]), group: null };
      const described = /^\s*(?:\{\s*)?name:[ \t]*['"]([\w-]+)['"][ \t]*(?:,[ \t]*)?$/.exec(line) ?? /\{[ \t]*name:[ \t]*['"]([\w-]+)['"][ \t]*,[ \t]*type:/.exec(line);
      if (!found && described) {
        const type = /\btype:\s*(Boolean|String|Number)\b/.exec(within(index, 4));
        if (type) found = { name: described[1], boolean: type[1] === 'Boolean', group: null };
      }
    } else if (language === 'rs') {
      if (/#\[(?:arg|clap)\([^)]*\blong\b/.test(line)) {
        const field = lines.slice(index + 1, index + 4).map((next) => /^\s*(?:pub\s+)?(\w+)\s*:\s*([\w<>]+)/.exec(next)).find(Boolean);
        if (field) found = { name: field[1].replace(/_/g, '-'), boolean: field[2] === 'bool', group: null };
      }
    }
    if (!found) continue;
    if (!found.group && language) {
      around ??= declarationsOf(lines, language);
      const owner = around[index];
      if (owner && !groupOf.has(owner)) {
        const grouped = FLAG_GROUP_FUNCTION.exec(owner.name);
        groupOf.set(owner, grouped && !GENERIC_GROUPS.has(grouped[1].toLowerCase()) ? grouped[1] : null);
      }
      if (owner && groupOf.get(owner)) found.group = groupOf.get(owner);
    }
    flags.push({ ...found, line: index + 1 });
  }
  return flags;
}

/** A category label such as "SIGNED STREAMS:" as the words a person says. */
function groupName(group) {
  const words = wordsOf(group);
  return words.join(' ');
}

/**
 * Flags as abilities: the groups the code makes (a function per group, a
 * category, an argparse group), then flags that share a first word, then a
 * boolean flag on its own when it is not a generic switch.
 */
function flagAbilities(path, flags) {
  const rows = [];
  const byGroup = new Map();
  const loose = [];
  const unique = new Map();
  for (const flag of flags) if (!unique.has(flag.name)) unique.set(flag.name, flag);
  for (const flag of unique.values()) {
    if (flag.group) byGroup.set(groupName(flag.group), [...(byGroup.get(groupName(flag.group)) ?? []), flag]);
    else loose.push(flag);
  }
  const byPrefix = new Map();
  for (const flag of loose) {
    const prefix = flag.name.split(/[-_.]/)[0].toLowerCase();
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), flag]);
  }
  for (const [prefix, members] of byPrefix) {
    if (members.length >= 2 && prefix.length >= 3 && !['no', 'max', 'min', 'use', 'enable', 'disable', 'allow', 'skip', 'with', 'without'].includes(prefix)) {
      byGroup.set(`--${prefix}-*`, [...(byGroup.get(`--${prefix}-*`) ?? []), ...members]);
    } else {
      for (const flag of members) {
        if (flag.boolean && !GENERIC_FLAGS.has(flag.name.toLowerCase())) rows.push({ kind: 'flag', name: `--${flag.name}`, path, line: flag.line });
      }
    }
  }
  for (const [name, members] of byGroup) {
    if (!name || GENERIC_GROUPS.has(name)) continue;
    rows.push({ kind: 'flags', name, path, line: members[0].line, members: members.map((flag) => `--${flag.name}`) });
  }
  return rows.sort((a, b) => a.line - b.line);
}

/* ---------------------------------------------------------------------------
 * Settings
 * ------------------------------------------------------------------------- */

const SETTINGS_TYPE = /(?:Config|Configuration|Options|Settings|Opts|Rc)$/;
/** In a React hook or component file an `Options` type is the hook's parameters, so only a configuration or settings type counts there. */
const HOOK_SETTINGS_TYPE = /(?:Config|Configuration|Settings)$/;
const HOOK_FILE = /(?:^|\/)use[A-Z-][^/]*$|\.[jt]sx$/;
const SECTION_TYPE = /(?:^|\.)\w*(?:Config|Configuration|Options|Settings)$/;
const TOGGLE_CAMEL = /^(?:enable|disable|allow|use|skip|no|only|force|strict|public)[A-Z_]|^(?:Enable|Disable|Allow|Use|Skip|No|Only|Force|Strict|Public)[A-Z]|(?:Enabled|Disabled|Mode)$/;
const TOGGLE_SNAKE = /^(?:enable|disable|allow|use|skip|no|only|force|strict|public)_|_(?:enabled|disabled|mode)$/;
const BARE_TOGGLE = /^(?:enabled?|disabled?)$/i;

/** A configuration type's fields are read this far below its header. */
const TYPE_LINES = 400;
const TYPE_HEADER = {
  go: /^type\s+([A-Z]\w*)\s+struct\s*\{/,
  js: /^\s*(?:export\s+)?(?:declare\s+)?(?:interface\s+([A-Za-z]\w*)\b[^{=]*\{|type\s+([A-Za-z]\w*)\s*=\s*\{)/,
  rs: /^\s*(?:pub\s+)?struct\s+([A-Z]\w*)\s*\{/,
};
/**
 * A field and its type, read from a line with its trailing blanks cut. In
 * JavaScript the whole type is one name: `Options['x']`, a union or a callback
 * is not a section.
 */
const TYPE_FIELD = {
  go: /^\s+([A-Z]\w*)\s+(\*?[\w.]+)/,
  js: /^\s+(?:readonly\s+)?([A-Za-z_]\w*)\??[ \t]*:[ \t]*([\w.]+)[ \t]*[;,]?$/,
  rs: /^\s+(?:pub\s+)?([a-z]\w*)\s*:\s*([\w:<>]+)/,
};
const PY_FIELD = /^\s+([a-z]\w*)[ \t]*:[ \t]*([\w.[\]|][\w.[\]| ]*)?(?:=|$)/;

function settingName(struct, field, path) {
  if (!BARE_TOGGLE.test(field)) return field;
  const prefix = struct.replace(SETTINGS_TYPE, '').replace(/^I(?=[A-Z])/, '');
  return prefix || basename(dirname(path));
}

/**
 * Settings a configuration type turns on: a field that is another configuration
 * section (`Metrics metrics.Config`), and a boolean whose name says it switches
 * something (`PublicMode`, `enable_cache`, `onlyPublishWithReleaseLabel`).
 */
function settingsIn(path, lines, language) {
  const rows = [];
  const settingsType = language === 'js' && HOOK_FILE.test(path) ? HOOK_SETTINGS_TYPE : SETTINGS_TYPE;
  const record = (struct, match, index) => {
    const [, field, type] = match ?? [];
    if (!field || field.startsWith('_')) return;
    const boolean = /^(?:bool|boolean|Optional\[bool\]|bool \| None|Option<bool>)$/.test(String(type).trim());
    const toggle = boolean && (TOGGLE_CAMEL.test(field) || TOGGLE_SNAKE.test(field) || BARE_TOGGLE.test(field));
    const section = !boolean && SECTION_TYPE.test(String(type).replace(/^\*/, ''));
    if (toggle || section) rows.push({ kind: 'setting', name: settingName(struct, field, path), path, line: index + 1, symbol: `${struct}.${field}` });
  };
  if (language === 'py') {
    // The open classes and functions by indent; a field counts for the configuration class it sits directly in.
    const open = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trimEnd();
      if (!line) continue;
      const indent = indentOf(line);
      while (open.length > 0 && open.at(-1).indent >= indent) open.pop();
      const klass = PY_CLASS.exec(line);
      if (klass) { open.push({ indent, struct: settingsType.test(klass[2]) ? klass[2] : null }); continue; }
      if (PY_DEF.test(line)) { open.push({ indent, struct: null }); continue; }
      const struct = open.at(-1)?.struct;
      if (struct) record(struct, PY_FIELD.exec(line), index);
    }
    return rows;
  }
  const header = TYPE_HEADER[language];
  const field = TYPE_FIELD[language];
  // The configuration type being read: its name, the line it opened at, and the
  // braces its fields opened so far (a field of a nested object type is not its own).
  let type = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trimEnd();
    if (type) {
      const nested = type.depth > 0;
      type.depth += braceDelta(line, true);
      if (type.depth < 0 || index - type.line >= TYPE_LINES) type = null;
      else {
        if (!nested) record(type.struct, field.exec(line), index);
        continue;
      }
    }
    const struct = header.exec(line)?.slice(1).find(Boolean);
    if (!struct || !settingsType.test(struct)) continue;
    // A type written on one line (`type X = { a: boolean };`) has no field lines below it.
    if (line.lastIndexOf('}') > line.indexOf('{')) continue;
    type = { struct, line: index, depth: 0 };
  }
  return rows;
}

/* ---------------------------------------------------------------------------
 * Background workers and schedulers
 * ------------------------------------------------------------------------- */

const WORKER_PATTERNS = {
  go: /\btime\.(?:NewTicker|Tick|AfterFunc)\(|\bcron\.New\(|\bgocron\.|\.Every\(\s*\d|\bfsnotify\.NewWatcher\(/,
  py: /\bthreading\.(?:Thread|Timer)\(|\b(?:asyncio\.create_task|loop\.call_later|loop\.call_at)\(|^\s*@(?:\w+\.)?(?:task|periodic_task|shared_task)\b|\bschedule\.every\(|\b(?:Background|AsyncIO|Blocking)Scheduler\(|\.add_job\(|\bmultiprocessing\.Process\(|\bObserver\(\)/,
  js: /\bsetInterval\(|\bcron\.schedule\(|\bnew\s+CronJob\(|\bschedule\.scheduleJob\(|\bnew\s+Worker\(|\bchokidar\.watch\(|\bfs\.watch\(/,
  rs: /\btokio::time::interval\(|\binterval\(\s*Duration::|\bthread::spawn\(|\.watcher\(\)|\bnotify::recommended_watcher\(|\bnew_debouncer\(/,
};
/** A test function by its name in Go, Python and JavaScript; Rust tests are found by attribute and module. */
const TEST_NAME = /^(?:test|Test|bench|Benchmark)/;
/** A timer at a second or faster beside a clock read is a screen repainting a time, not work. */
const REPAINT_MS = 1000;

/** The lines of a Rust file inside a `#[cfg(test)] mod`, in one pass that carries the module's brace depth. */
function rustTestLines(lines) {
  const inside = new Array(lines.length).fill(false);
  // A `#[cfg(test)]` waiting for the item it marks, and the depth a test module opened at (-1 outside one).
  let pending = false;
  let floor = -1;
  let depth = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (floor < 0) {
      if (/^\s*#\[cfg\(test\)\]/.test(line)) pending = true;
      else if (pending && !/^\s*(?:#\[|\/\/|$)/.test(line)) {
        pending = false;
        if (/^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+\w+\s*\{/.test(line)) floor = depth;
      }
    }
    depth = Math.max(0, depth + braceDelta(line));
    if (floor >= 0) {
      inside[index] = true;
      if (depth <= floor) floor = -1;
    }
  }
  return inside;
}

const CONSTANT_NUMBER = /\bconst[ \t]+([A-Za-z_$][\w$]*)[ \t]*=[ \t]*(\d[\d_]*)[ \t]*;?$/;

/** Each number a file declares as a constant (`const TICK_MS = 30_000;`), the first declaration of a name winning. */
function declaredNumbers(lines) {
  const numbers = new Map();
  for (const line of lines) {
    if (!line.includes('const')) continue;
    const declared = CONSTANT_NUMBER.exec(line.trimEnd());
    if (declared && !numbers.has(declared[1])) numbers.set(declared[1], Number(declared[2].replace(/_/g, '')));
  }
  return numbers;
}

const CLOCK_READ = /\b(?:Date\.now|performance\.now)\(\)|\bnew Date\(\)/;

/**
 * A JavaScript `setInterval` that keeps a shown time current: its own line reads
 * the clock (`setInterval(() => setNow(Date.now()), 30_000)`), or it ticks at a
 * second or faster beside a clock read. A fast timer that calls work is a poller.
 */
function repaintTimer(numbers, lines, index) {
  if (!/\bsetInterval\(/.test(lines[index])) return false;
  if (CLOCK_READ.test(lines[index])) return true;
  if (!lines.slice(Math.max(0, index - 3), index + 6).some((line) => CLOCK_READ.test(line))) return false;
  for (let cursor = index; cursor < Math.min(lines.length, index + 16); cursor += 1) {
    const every = /,\s*([A-Za-z_$][\w$]*|\d[\d_]*)\)\s*;?$/.exec(lines[cursor].trimEnd());
    if (!every) continue;
    const ms = /^\d[\d_]*$/.test(every[1]) ? Number(every[1].replace(/_/g, '')) : numbers().get(every[1]) ?? null;
    return ms !== null && ms <= REPAINT_MS;
  }
  return false;
}

/** A Rust thread that reads, writes or waits on a child process's pipes is plumbing for that call, not a worker. */
function pipeThread(lines, index) {
  if (!/\bthread::spawn\(/.test(lines[index])) return false;
  return /\b(?:read_to_end|read_to_string|read_line|read_bounded_line|read_pipe|lines\(\)|BufReader::new|write_all|wait\(\)|stdin|stdout|stderr)(?!\w)/
    .test(lines.slice(index, index + 8).join('\n'));
}

/** A function that starts a ticker, timer loop, thread, file watcher or scheduled job, named by its owner type or itself. */
function workersIn(path, text, lines, language) {
  const pattern = WORKER_PATTERNS[language];
  if (!pattern || !pattern.test(text)) return [];
  if (language === 'rs' && (basename(path) === 'tests.rs' || /(?:^|\/)tests\//.test(path))) return [];
  // A timer in a component file runs while that screen is shown: the screen's behaviour, not a background worker.
  if (language === 'js' && /\.[jt]sx$/.test(path)) return [];
  const testLines = language === 'rs' ? rustTestLines(lines) : null;
  const around = declarationsOf(lines, language);
  let numbers = null;
  const constants = () => (numbers ??= declaredNumbers(lines));
  const rows = [];
  const seen = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    if (!pattern.test(lines[index]) || /^\s*(?:\/\/|#)/.test(lines[index]) || testLines?.[index]) continue;
    if ((language === 'js' && repaintTimer(constants, lines, index)) || (language === 'rs' && pipeThread(lines, index))) continue;
    let owner = around[index];
    if (language === 'py' && /^\s*@/.test(lines[index])) {
      const def = lines.slice(index + 1, index + 6).map((next) => /^\s*(?:async\s+)?def\s+(\w+)/.exec(next)).find(Boolean);
      owner = def ? { owner: null, name: def[1] } : owner;
    }
    if (!owner || owner.name === 'main' || TEST_NAME.test(owner.name) || owner.test) continue;
    const name = owner.owner ?? owner.name;
    if (seen.has(name)) continue;
    seen.add(name);
    rows.push({ kind: 'worker', name, path, line: index + 1, symbol: owner.owner ? `${owner.owner}.${owner.name}` : owner.name });
  }
  return rows;
}

/* ---------------------------------------------------------------------------
 * All of them
 * ------------------------------------------------------------------------- */

/**
 * Subcommand, flag, setting and worker rows over the product files, in that
 * order. Every detector reads a file's lines once, forward, carrying what it
 * needs to know (the declaration a line sits in, a type being read, a test
 * module), so a survey costs time in proportion to the bytes it reads.
 *
 * @param {{ path: string }[]} files product files
 * @param {(path: string) => string} readText
 */
export function operatorAbilities(files, readText) {
  const subcommands = [];
  const flags = [];
  const settings = [];
  const workers = [];
  for (const file of files) {
    const language = languageOf(file.path);
    if (!language) continue;
    const raw = readText(file.path);
    if (!raw) continue;
    const lines = boundedLines(raw);
    const text = lines.join('\n');
    subcommands.push(...subcommandsIn(file.path, text, lines, language));
    const defined = flagsIn(lines, language);
    if (defined.length > 0) flags.push(...flagAbilities(file.path, defined));
    settings.push(...settingsIn(file.path, lines, language));
    workers.push(...workersIn(file.path, text, lines, language));
  }
  return { subcommands, flags, settings, workers };
}
