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

const GO_FUNC = /^func\s+(?:\(\s*\w+\s+\*?([A-Za-z_]\w*)[^)]*\)\s*)?([A-Za-z_]\w*)/;
const PY_DEF = /^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)/;
const PY_CLASS = /^(\s*)class\s+([A-Za-z_]\w*)/;
const JS_FUNCTION = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/;
const JS_ARROW = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]*)?=>/;
const JS_METHOD = /^\s+(?:(?:public|private|protected|static|async|override|readonly)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)?[^;]*\{\s*$/;
const JS_CLASS = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;
const RS_FN = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/;
const RS_IMPL = /^impl(?:<[^>]*>)?\s+(?:[\w:]+\s+for\s+)?([A-Za-z_]\w*)/;
const JS_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'constructor']);

/** `{ owner, name }` of the function the line at `index` is inside, or null. */
export function enclosingDeclaration(lines, index, language) {
  if (language === 'go') {
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      const match = GO_FUNC.exec(lines[cursor]);
      if (match) return { owner: match[1] ?? null, name: match[2], line: cursor + 1 };
    }
    return null;
  }
  if (language === 'py') {
    const indent = /^\s*/.exec(lines[index])[0].length;
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      const def = PY_DEF.exec(lines[cursor]);
      if (!def || (cursor !== index && def[1].length >= indent)) continue;
      for (let up = cursor - 1; up >= 0; up -= 1) {
        const klass = PY_CLASS.exec(lines[up]);
        if (klass && klass[1].length < def[1].length) return { owner: klass[2], name: def[2], line: cursor + 1 };
        if (/^\S/.test(lines[up]) && !klass) break;
      }
      return { owner: null, name: def[2], line: cursor + 1 };
    }
    return null;
  }
  if (language === 'rs') {
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      const fn = RS_FN.exec(lines[cursor]);
      if (!fn) continue;
      for (let up = cursor - 1; up >= 0; up -= 1) {
        const impl = RS_IMPL.exec(lines[up]);
        if (impl) return { owner: impl[1], name: fn[1], line: cursor + 1 };
        if (/^(?:pub\s+)?(?:fn|struct|enum|mod|trait)\b/.test(lines[up])) break;
      }
      return { owner: null, name: fn[1], line: cursor + 1 };
    }
    return null;
  }
  if (language === 'js') {
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      const line = lines[cursor];
      const plain = JS_FUNCTION.exec(line) ?? JS_ARROW.exec(line);
      if (plain) return { owner: null, name: plain[1], line: cursor + 1 };
      const method = JS_METHOD.exec(line);
      if (method && !JS_KEYWORDS.has(method[1])) {
        for (let up = cursor - 1; up >= 0; up -= 1) {
          const klass = JS_CLASS.exec(lines[up]);
          if (klass) return { owner: klass[1], name: method[1], line: cursor + 1 };
          if (/^\S/.test(lines[up]) && !/^[}/*]/.test(lines[up])) break;
        }
        return { owner: null, name: method[1], line: cursor + 1 };
      }
    }
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * Subcommands
 * ------------------------------------------------------------------------- */

const JS_CLI_LIBRARY = /(?:from\s+|require\()\s*['"](?:commander|yargs|cac|sade|clipanion|@oclif\/core|meow|citty)['"]/;

/** Subcommands a command-line parser registers: cobra, urfave/cli, argparse, click, typer, commander, yargs, clap. */
function subcommandsIn(path, text, language) {
  const lines = text.split(/\r?\n/);
  const rows = [];
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
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (language === 'go') {
      if (/&cobra\.Command\{/.test(line)) push(nameWithin(index, /\bUse:\s*"([\w:-]+)/), index);
      else if (/&cli\.Command\{|\bcli\.Command\{/.test(line)) push(nameWithin(index, /\bName:\s*"([\w:-]+)"/), index);
    } else if (language === 'py') {
      // tyro and simple-parsing build a subcommand from each dataclass that has a run method.
      const dataclass = /^@dataclass\b/.test(line) && /^\s*import tyro\b|^\s*from tyro\b|simple_parsing/m.test(text)
        ? /^class\s+([A-Z]\w*)/.exec(lines[index + 1] ?? '') : null;
      if (dataclass) {
        let cursor = index + 2;
        while (cursor < lines.length && !/^\S/.test(lines[cursor])) {
          if (/^\s+def run\(/.test(lines[cursor])) { push(wordsOf(dataclass[1]).join('-'), index + 1); break; }
          cursor += 1;
        }
      }
      const parser = /\.add_parser\(\s*["']([\w:-]+)["']/.exec(line);
      if (parser) push(parser[1], index);
      const decorated = /^\s*@\w+\.command\(\s*(?:(?:name\s*=\s*)?["']([\w:-]+)["'])?/.exec(line);
      if (decorated && !/^\s*@click\.command\b/.test(line)) {
        const def = lines.slice(index + 1, index + 6).map((next) => /^\s*(?:async\s+)?def\s+(\w+)/.exec(next)).find(Boolean);
        push(decorated[1] ?? def?.[1]?.replace(/_/g, '-'), index);
      }
    } else if (language === 'js') {
      if (!JS_CLI_LIBRARY.test(text)) continue;
      const command = /\.command\(\s*["'`]([\w:-]+)/.exec(line);
      if (command) push(command[1], index);
    } else if (language === 'rs') {
      if (/#\[derive\([^)]*\bSubcommand\b/.test(line)) {
        let cursor = index + 1;
        while (cursor < lines.length && !/\benum\s+\w+/.test(lines[cursor])) cursor += 1;
        for (cursor += 1; cursor < lines.length && !/^\}/.test(lines[cursor]); cursor += 1) {
          const variant = /^\s{4}([A-Z]\w*)\s*(?:[{(,]|$)/.exec(lines[cursor]);
          if (variant) push(wordsOf(variant[1]).join('-'), cursor);
        }
      }
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
function flagsIn(text, language) {
  const lines = text.split(/\r?\n/);
  const flags = [];
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
      const group = /(\w+)\s*=\s*\w+\.add_argument_group\(\s*(?:title\s*=\s*)?["']([^"']+)["']/.exec(line);
      if (group) argumentGroups.set(group[1], group[2]);
      const argument = /(\w+)\.add_argument\(\s*(?:["']-\w["']\s*,\s*)?["']--([\w-]+)["']/.exec(line);
      if (argument) {
        const block = within(index, 4);
        found = { name: argument[2], boolean: /action\s*=\s*["']store_(?:true|false)["']|BooleanOptionalAction/.test(block), group: argumentGroups.get(argument[1]) ?? null };
      }
      const option = /@(?:click|\w+)\.option\(\s*(?:["']-\w["']\s*,\s*)?["']--([\w-]+)/.exec(line) ?? /typer\.Option\([^)]*["']--([\w-]+)["']/.exec(line);
      if (option) found = { name: option[1].split('/')[0], boolean: /is_flag\s*=\s*True/.test(within(index, 4)), group: null };
    } else if (language === 'js') {
      const commander = /\.(?:requiredOption|option)\(\s*["'`](?:-\w\s*,\s*)?--([\w-]+)([^"'`]*)["'`]/.exec(line);
      if (commander) found = { name: commander[1], boolean: !/[<[]/.test(commander[2]), group: null };
      const described = /^\s*\{?\s*name:\s*['"]([\w-]+)['"]\s*,?\s*$/.exec(line) ?? /\{\s*name:\s*['"]([\w-]+)['"]\s*,\s*type:/.exec(line);
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
      const owner = enclosingDeclaration(lines, index, language);
      const grouped = owner ? FLAG_GROUP_FUNCTION.exec(owner.name) : null;
      if (grouped && !GENERIC_GROUPS.has(grouped[1].toLowerCase())) found.group = grouped[1];
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
const SECTION_TYPE = /(?:^|\.)\w*(?:Config|Configuration|Options|Settings)$/;
const TOGGLE_CAMEL = /^(?:enable|disable|allow|use|skip|no|only|force|strict|public)[A-Z_]|^(?:Enable|Disable|Allow|Use|Skip|No|Only|Force|Strict|Public)[A-Z]|(?:Enabled|Disabled|Mode)$/;
const TOGGLE_SNAKE = /^(?:enable|disable|allow|use|skip|no|only|force|strict|public)_|_(?:enabled|disabled|mode)$/;
const BARE_TOGGLE = /^(?:enabled?|disabled?)$/i;

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
function settingsIn(path, text, language) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    let struct = null;
    let indent = 0;
    if (language === 'go') struct = /^type\s+([A-Z]\w*)\s+struct\s*\{/.exec(lines[index])?.[1];
    else if (language === 'py') {
      const klass = /^(\s*)class\s+([A-Za-z]\w*)\b/.exec(lines[index]);
      if (klass) { struct = klass[2]; indent = klass[1].length; }
    } else if (language === 'js') struct = /^\s*(?:export\s+)?(?:declare\s+)?(?:interface\s+([A-Za-z]\w*)[^{=]*\{|type\s+([A-Za-z]\w*)\s*=\s*\{)/.exec(lines[index])?.slice(1).find(Boolean);
    else if (language === 'rs') struct = /^\s*(?:pub\s+)?struct\s+([A-Z]\w*)\s*\{/.exec(lines[index])?.[1];
    if (!struct || !SETTINGS_TYPE.test(struct)) continue;
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 400); cursor += 1) {
      const line = lines[cursor];
      if (language === 'py') {
        if (line.trim() && /^\s*/.exec(line)[0].length <= indent) break;
      } else if (/^\s*\}/.test(line) && /^\s*/.exec(line)[0].length <= /^\s*/.exec(lines[index])[0].length) break;
      let field = null;
      let type = null;
      if (language === 'go') [, field, type] = /^\s+([A-Z]\w*)\s+(\*?[\w.]+)/.exec(line) ?? [];
      else if (language === 'py') [, field, type] = /^\s+([a-z]\w*)\s*:\s*([\w.[\]| ]+?)\s*(?:=|$)/.exec(line) ?? [];
      else if (language === 'js') [, field, type] = /^\s+(?:readonly\s+)?([A-Za-z_]\w*)\??\s*:\s*([\w.]+)/.exec(line) ?? [];
      else if (language === 'rs') [, field, type] = /^\s+(?:pub\s+)?([a-z]\w*)\s*:\s*([\w:<>]+)/.exec(line) ?? [];
      if (!field || field.startsWith('_')) continue;
      const boolean = /^(?:bool|boolean|Optional\[bool\]|bool \| None|Option<bool>)$/.test(String(type).trim());
      const toggle = boolean && (TOGGLE_CAMEL.test(field) || TOGGLE_SNAKE.test(field) || BARE_TOGGLE.test(field));
      const section = !boolean && SECTION_TYPE.test(String(type).replace(/^\*/, ''));
      if (toggle || section) rows.push({ kind: 'setting', name: settingName(struct, field, path), path, line: cursor + 1, symbol: `${struct}.${field}` });
    }
  }
  return rows;
}

/* ---------------------------------------------------------------------------
 * Background workers and schedulers
 * ------------------------------------------------------------------------- */

const WORKER_PATTERNS = {
  go: /\btime\.(?:NewTicker|Tick|AfterFunc)\(|\bcron\.New\(|\bgocron\.|\.Every\(\s*\d/,
  py: /\bthreading\.(?:Thread|Timer)\(|\b(?:asyncio\.create_task|loop\.call_later|loop\.call_at)\(|^\s*@(?:\w+\.)?(?:task|periodic_task|shared_task)\b|\bschedule\.every\(|\b(?:Background|AsyncIO|Blocking)Scheduler\(|\.add_job\(|\bmultiprocessing\.Process\(/,
  js: /\bsetInterval\(|\bcron\.schedule\(|\bnew\s+CronJob\(|\bschedule\.scheduleJob\(|\bnew\s+Worker\(/,
  rs: /\btokio::time::interval\(|\binterval\(\s*Duration::|\bthread::spawn\(/,
};

/** A function that starts a ticker, timer loop, thread or scheduled job, named by its owner type or itself. */
function workersIn(path, text, language) {
  const pattern = WORKER_PATTERNS[language];
  if (!pattern || !pattern.test(text)) return [];
  const lines = text.split(/\r?\n/);
  const rows = [];
  const seen = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    if (!pattern.test(lines[index]) || /^\s*(?:\/\/|#)/.test(lines[index])) continue;
    let owner = enclosingDeclaration(lines, index, language);
    if (language === 'py' && /^\s*@/.test(lines[index])) {
      const def = lines.slice(index + 1, index + 6).map((next) => /^\s*(?:async\s+)?def\s+(\w+)/.exec(next)).find(Boolean);
      owner = def ? { owner: null, name: def[1] } : owner;
    }
    if (!owner || owner.name === 'main' || /^(?:test|Test|bench|Benchmark)/.test(owner.name)) continue;
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
 * Subcommand, flag, setting and worker rows over the product files, in that order.
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
    const text = readText(file.path);
    if (!text) continue;
    subcommands.push(...subcommandsIn(file.path, text, language));
    const defined = flagsIn(text, language);
    if (defined.length > 0) flags.push(...flagAbilities(file.path, defined));
    settings.push(...settingsIn(file.path, text, language));
    workers.push(...workersIn(file.path, text, language));
  }
  return { subcommands, flags, settings, workers };
}
