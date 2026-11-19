import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { productWalk } from '../evidence-search/declaration-index.mjs';
import { readSourceEvidence } from '../evidence-search/source-evidence.mjs';
import { createFamilies } from '../evidence-search/type-family.mjs';
import { noteReadFamilies } from './read-family.mjs';
import { recordSourceEvidence, resetSessionReads, sessionReads } from './session-reads.mjs';

const ts = (header, prelude = "import { Plugin } from './base';") => `${prelude}\n${header}\n  apply(token: string) {\n    if (!token) throw new Error('no token');\n    return true;\n  }\n}\n`;
const TS_BASE = 'export interface Plugin {\n  apply(token: string): boolean;\n}\n';
const py = (header, prelude = 'from .base import Plugin', extra = '') => `${prelude}\n\n\n${header}\n${extra}    def apply(self, token):\n        if not token:\n            raise ValueError('no token')\n        return True\n`;
const PY_BASE = 'class Plugin:\n    def apply(self, token):\n        return True\n';
const goType = (pkg, name, methods, { imports = [], fields = '\tn int' } = {}) => `package ${pkg}\n${imports.length ? `\nimport (\n${imports.map((path) => `\t"${path}"`).join('\n')}\n)\n` : ''}\ntype ${name} struct {\n${fields}\n}\n${methods.map((method) => `\nfunc (t *${name}) ${method} {\n\tif t == nil {\n\t\tpanic("nil")\n\t}\n}\n`).join('')}`;
const GO_MOD = 'module example.com/tool\n\ngo 1.22\n';

/** Writes `files`, makes each read in order as the analyze tool does, and returns the last read's row. */
function readIn(files, selectors) {
  resetSessionReads();
  const root = mkdtempSync(join(tmpdir(), 'atlas-read-family-'));
  try {
    for (const [path, text] of Object.entries({ 'package.json': '{"name":"tool"}', ...files })) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    let rows = [];
    for (const selector of selectors) {
      const packet = readSourceEvidence(root, [selector]);
      recordSourceEvidence(root, packet);
      rows = noteReadFamilies(packet, { root, reads: sessionReads(root) }).rows;
    }
    return rows[0];
  } finally {
    resetSessionReads();
    rmSync(root, { recursive: true, force: true });
  }
}

const sizeOf = (row) => Number(/^This family has at least (\d+) members/.exec(row?.family ?? '')?.[1] ?? 0);
const readOf = (row) => Number(/You read (\d+) of them/.exec(row?.family ?? '')?.[1] ?? -1);

test('a class read says how many classes name its resolved base and how many this session read', () => {
  const files = { 'src/base.ts': TS_BASE, 'src/slack.ts': ts('export class Slack implements Plugin {'), 'src/mail.ts': ts('export class Mail implements Plugin {'), 'src/sms.ts': ts('export class Sms implements Plugin {') };
  const row = readIn(files, [{ path: 'src/mail.ts', startLine: 5, maxLines: 2 }, { path: 'src/slack.ts', symbol: 'apply' }]);
  assert.equal(row.family, 'This family has at least 3 members found in this folder: the classes whose header names `Plugin` (src/base.ts:L1) (Mail src/mail.ts:L2, Slack src/slack.ts:L2, Sms src/sms.ts:L2). You read 2 of them; a sentence about the family says "2 of at least 3 read" or speaks only for the members read, never "every" unless all were read, and what the others do is an Uncertainty line.');
  assert.equal(readOf(readIn(files, [{ path: 'src/mail.ts', startLine: 1, maxLines: 1 }, { path: 'src/slack.ts', symbol: 'apply' }])), 1, 'a range outside every member is no member read');
});

test('a header a formatter wraps over several lines is read to its end', () => {
  assert.equal(sizeOf(readIn({
    'src/base.ts': TS_BASE,
    'src/delivery.ts': 'export class BaseDeliveryPlugin {}\n',
    'src/slack.ts': ts('export class Slack implements Plugin {'),
    'src/mail.ts': ts('export class Mail implements Plugin {'),
    'src/push.ts': ts('export class PushDeliveryPlugin\n  extends BaseDeliveryPlugin\n  implements Plugin\n{', "import { Plugin } from './base';\nimport { BaseDeliveryPlugin } from './delivery';"),
    'src/hook.ts': ts('export class OutgoingWebhook\n  implements Plugin, Disposable\n{', "import { Plugin } from './base';\nimport { Disposable } from 'vscode';"),
  }, [{ path: 'src/slack.ts', symbol: 'apply' }])), 4, 'TypeScript');
  assert.equal(sizeOf(readIn({
    'app/__init__.py': '', 'app/base.py': PY_BASE,
    'app/slack.py': py('class Slack(Plugin):'), 'app/mail.py': py('class Mail(Plugin):'),
    'app/push.py': py('class Push(\n    Plugin,\n    metaclass=Registry,\n):', 'from .base import Plugin\nfrom .meta import Registry'),
  }, [{ path: 'app/slack.py', symbol: 'apply' }])), 3, 'Python');
  assert.equal(sizeOf(readIn({
    'src/store.rs': "pub trait Store {\n    fn load(&self) -> u8;\n}\n\nimpl Store for Disk {\n    fn load(&self) -> u8 {\n        if true { 1 } else { 0 }\n    }\n}\n\nimpl Store for Memory {\n    fn load(&self) -> u8 {\n        if true { 2 } else { 0 }\n    }\n}\n\nimpl<T: Clone + Send + Sync + 'static, K: Hash + Eq> Store\n    for ReplicatedCache<T, K>\n{\n    fn load(&self) -> u8 {\n        if true { 3 } else { 0 }\n    }\n}\n",
  }, [{ path: 'src/store.rs', symbol: 'load' }])), 3, 'Rust');
});

test('type arguments before the base and an alias the base is imported under do not hide a member', () => {
  assert.equal(sizeOf(readIn({
    'src/base.ts': 'export class BaseRepo<T> {\n  apply(token: string) {\n    return true;\n  }\n}\nexport interface Entity {\n  id: string;\n}\n',
    'src/users.ts': ts('export class Users<T extends Entity> extends BaseRepo<T> {', "import { BaseRepo, Entity } from './base';"),
    'src/teams.ts': ts('export class Teams<T extends Entity> extends BaseRepo<T> {', "import { BaseRepo, Entity } from './base';"),
    'src/plain.ts': ts('export class Plain extends BaseRepo<string> {', "import { BaseRepo } from './base';"),
  }, [{ path: 'src/users.ts', symbol: 'apply' }])), 3);
  assert.equal(sizeOf(readIn({
    'src/base.ts': TS_BASE, 'src/slack.ts': ts('export class Slack implements Plugin {'), 'src/mail.ts': ts('export class Mail implements Plugin {'),
    'src/sms.ts': ts('export class Sms implements DeliveryPlugin {', "import { Plugin as DeliveryPlugin } from './base';"),
  }, [{ path: 'src/slack.ts', symbol: 'apply' }])), 3);
});

test('a base is the declaration its reference resolves to, through a barrel and a workspace package', () => {
  const component = (name, prelude) => ts(`export class ${name} extends ${prelude.includes('React') ? 'React.Component' : 'Component'} {`, prelude);
  assert.equal(sizeOf(readIn({
    'src/model/component.ts': 'export class Component {\n  apply(token: string) {\n    return true;\n  }\n}\n',
    'src/model/wheel.ts': component('Wheel', "import { Component } from './component';"),
    'src/model/axle.ts': component('Axle', "import { Component } from './component';"),
    'src/ui/panel.tsx': component('Panel', "import React from 'react';"),
    'src/ui/list.tsx': component('List', "import React from 'react';"),
    'src/ui/menu.tsx': component('Menu', "import React from 'react';"),
  }, [{ path: 'src/model/wheel.ts', symbol: 'apply' }])), 2, 'React.Component is not the local Component');
  assert.equal(sizeOf(readIn({
    'package.json': '{"name":"release","private":true,"workspaces":["packages/*","plugins/*"]}',
    'packages/core/package.json': '{"name":"@release/core","main":"dist/auto.js"}',
    'packages/core/src/auto.ts': "export { Plugin } from './utils/load-plugins';\nexport class Auto {}\n",
    'packages/core/src/utils/load-plugins.ts': TS_BASE,
    'plugins/slack/package.json': '{"name":"@release/slack"}',
    'plugins/slack/src/index.ts': ts('export default class SlackPlugin implements Plugin {', "import { Plugin } from '@release/core';"),
    'plugins/mail/package.json': '{"name":"@release/mail"}',
    'plugins/mail/src/index.ts': ts('export default class MailPlugin implements Plugin {', "import { Plugin } from '@release/core';"),
  }, [{ path: 'plugins/slack/src/index.ts', symbol: 'apply' }])), 2, 'a workspace package whose entry re-exports the base');
});

test('a class naming its base through a default import, under any name, is a member', () => {
  const DEFAULT_BASE = 'export default class Plugin {\n  apply(token: string) {\n    return true;\n  }\n}\n';
  const extending = (name, local, prelude) => ts(`export class ${name} extends ${local} {`, prelude);
  const files = {
    'src/base.ts': DEFAULT_BASE,
    'src/slack.ts': extending('Slack', 'Plugin', "import Plugin from './base';"),
    'src/mail.ts': extending('Mail', 'Plugin', "import Plugin from './base';"),
    'src/sms.ts': extending('Sms', 'BasePlugin', "import BasePlugin from './base';"),
  };
  const read = [{ path: 'src/slack.ts', symbol: 'Slack.apply' }];
  assert.equal(sizeOf(readIn(files, read)), 3, 'a default import under another name');
  assert.equal(sizeOf(readIn({
    ...files,
    'src/index.ts': "export { default as Channel } from './base';\n",
    'src/push.ts': extending('Push', 'Channel', "import { Channel } from './index';"),
    'src/hook.ts': extending('Hook', 'Base', "import { default as Base } from './base';"),
    'src/relay.ts': "export { default } from './base';\n",
    'src/hub.ts': extending('Hub', 'Relay', "import Relay from './relay';"),
  }, read)), 6, 'the default re-exported by a barrel under a name or as the default, and imported as `default`');
  assert.equal(sizeOf(readIn({ ...files, 'src/base.ts': DEFAULT_BASE.replace('export default class', 'class') + 'export { Plugin as default };\n' }, read)), 3,
    'a base exported as the default by name');
  assert.equal(sizeOf(readIn({ ...files, 'src/base.ts': 'export class Plugin {\n  apply(token: string) {\n    return true;\n  }\n}\n' }, read)), 0,
    'a default import from a module with no default export');
  assert.equal(sizeOf(readIn({
    ...files,
    'src/wrapped.ts': `import Plugin from './base';\nconst wrap = (base: unknown) => base;\nexport default wrap(Plugin);\n`,
    'src/push.ts': extending('Push', 'Wrapped', "import Wrapped from './wrapped';"),
  }, read)), 0, 'a member through a default export that names no declaration');
  assert.equal(sizeOf(readIn({ ...files, 'src/mixed.ts': extending('Mixed', 'mix(Mixin)', "import Mixin from './base';\nimport { mix } from './mix';") }, read)), 0,
    'a header that cannot be read in a file importing the base by default');
  assert.equal(sizeOf(readIn({ ...files, 'src/long.ts': `import Relay from './base';\nexport class Long extends Relay { apply(token: string) { return ${'1 + '.repeat(300)}1 > 0; } }\n` }, read)), 0,
    'a line too long to outline in a file importing a base by default');
});

test('a base renamed in a long import, a class expression, or a later alias round is counted', () => {
  const helpers = (count) => Array.from({ length: count }, (_, at) => `helper${at}`);
  const longImport = (names, alias, from) => `import {\n${names.map((name) => `  ${name},`).join('\n')}\n  ${alias},\n} from '${from}';`;
  const barrel = (names) => `${names.map((name) => `export const ${name} = 1;`).join('\n')}\nexport { Plugin } from './base';\n`;
  const read = [{ path: 'src/slack.ts', symbol: 'Slack.apply' }];
  const files = { 'src/base.ts': TS_BASE, 'src/slack.ts': ts('export class Slack implements Plugin {'), 'src/mail.ts': ts('export class Mail implements Plugin {') };
  assert.equal(sizeOf(readIn({ ...files, 'src/helpers.ts': barrel(helpers(45)), 'src/sms.ts': ts('export class Sms implements DeliveryPlugin {', longImport(helpers(45), 'Plugin as DeliveryPlugin', './helpers')) }, read)), 3,
    'an alias inside an import of 48 lines');
  assert.equal(sizeOf(readIn({ ...files, 'src/helpers.ts': barrel([]), 'src/sms.ts': ts('export class Sms implements DeliveryPlugin {', longImport(helpers(420), 'Plugin as DeliveryPlugin', './helpers')) }, read)), 0,
    'an import longer than the statement cap may hide the alias');
  assert.equal(sizeOf(readIn({
    ...files,
    'src/zbarrel.ts': "export { Plugin as DeliveryPlugin } from './base';\n",
    'src/aaa.ts': ts('export class Sms implements Channel {', "import { DeliveryPlugin as Channel } from './zbarrel';\n// a Plugin for text messages"),
  }, read)), 3, 'a file read before the alias it renames was found is read again');
  assert.equal(sizeOf(readIn({
    ...files,
    'src/z1.ts': "export { Plugin as A } from './base';\n",
    'src/y2.ts': "export { A as B } from './z1';\n",
    'src/x3.ts': "export { B as C } from './y2';\n",
    'src/w4.ts': ts('export class Sms implements D {', "import { C as D } from './x3';"),
  }, read)), 0, 'a chain of renames longer than the rounds read');
  const aliasFile = (from, count) => `import {\n${Array.from({ length: count }, (_, at) => `  Plugin as Q${from}x${at},`).join('\n')}\n} from './base';\n`;
  const aliasFiles = (files, each) => Object.fromEntries(Array.from({ length: files }, (_, at) => [`src/alias${at}.ts`, aliasFile(at, each)]));
  assert.equal(sizeOf(readIn({ ...files, ...aliasFiles(5, 50) }, read)), 2, 'names under both caps');
  assert.equal(sizeOf(readIn({ ...files, ...aliasFiles(6, 50) }, read)), 0, 'more than 256 names for one base');
  assert.equal(sizeOf(readIn({ ...files, ...aliasFiles(1, 65) }, read)), 0, 'more than 64 names for the base in one file');
  const classBase = 'export class Plugin {\n  apply(token: string) {\n    return true;\n  }\n}\n';
  const body = '\n  apply(token) {\n    if (!token) throw new Error("no token");\n    return true;\n  }\n}';
  const classFiles = { 'src/base.ts': classBase, 'src/slack.ts': ts('export class Slack extends Plugin {'), 'src/mail.ts': ts('export class Mail extends Plugin {') };
  assert.equal(sizeOf(readIn({
    ...classFiles,
    'src/sms.js': `const { Plugin } = require('./base');\n\nmodule.exports = class Sms extends Plugin {${body};\n`,
    'src/push.ts': `import { Plugin } from './base';\n\nexport default class extends Plugin {${body}\n`,
    'src/hook.ts': `import { Plugin } from './base';\n\nexport const Hook = class extends Plugin {${body};\n`,
    'src/fax.js': `const { Plugin } = require('./base');\n\nexports.Fax = class extends Plugin {${body};\n`,
  }, read)), 6, 'classes written as expressions');
});

test('a class shown in a comment or a string is no member, in each language', () => {
  const pyFiles = { 'app/__init__.py': '', 'app/slack.py': py('class Slack(Plugin):'), 'app/mail.py': py('class Mail(Plugin):') };
  const slackPy = [{ path: 'app/slack.py', symbol: 'Slack.apply' }];
  assert.equal(sizeOf(readIn({ ...pyFiles, 'app/base.py': 'class Plugin:\n    """Base of every plugin.\n\n    Subclass it::\n\nclass MyPlugin(Plugin):\n    def apply(self, token):\n        return bool(token)\n    """\n\n    def apply(self, token):\n        return True\n' }, slackPy)), 2,
    'a subclass in the base class docstring');
  assert.equal(sizeOf(readIn({ ...pyFiles, 'app/base.py': PY_BASE, 'app/notes.py': "from .base import Plugin\n# class Draft(Plugin):\n#     pass\nEXAMPLE = '''\nclass Example(Plugin):\n    pass\n'''\n" }, slackPy)), 2,
    'a subclass in a comment and a triple-quoted string');
  const tsFiles = { 'src/base.ts': 'export class Plugin {\n  apply(token: string) {\n    return true;\n  }\n}\n', 'src/slack.ts': ts('export class Slack extends Plugin {'), 'src/mail.ts': ts('export class Mail extends Plugin {') };
  assert.equal(sizeOf(readIn({
    ...tsFiles,
    'src/scaffold.ts': "import { Plugin } from './base';\nexport const use = (plugin: Plugin) => plugin;\nexport const TEMPLATE = `\nimport { Plugin } from './base';\nexport class NewPlugin extends Plugin {\n  apply(token: string) {\n    return true;\n  }\n}\n`;\n/*\nexport class Legacy extends Plugin {\n}\n*/\n// export class Dropped extends Plugin {}\n",
  }, [{ path: 'src/slack.ts', symbol: 'Slack.apply' }])), 2, 'a subclass in a template string, a block comment and a line comment');
  assert.equal(sizeOf(readIn({
    ...tsFiles,
    'src/sms.ts': "import { Plugin } from './base';\nconst NOTE = `\nimport { Plugin } from './elsewhere';\n`;\nexport class Sms extends Plugin {\n  apply(token: string) {\n    return NOTE.length > 0;\n  }\n}\n",
  }, [{ path: 'src/slack.ts', symbol: 'Slack.apply' }])), 3, 'an import written inside a string binds nothing');
  const goFiles = {
    'go.mod': GO_MOD,
    'store/store.go': 'package store\n\ntype Store interface {\n\tGet(key string) string\n\tSet(key string, value string)\n}\n',
    'store/disk.go': goType('store', 'Disk', ['Get(key string) string', 'Set(key string, value string)']),
    'store/memory.go': goType('store', 'Memory', ['Get(key string) string', 'Set(key string, value string)']),
  };
  assert.equal(sizeOf(readIn({ ...goFiles, 'store/sample.go': 'package store\n\nconst sample = `\ntype Fake struct{}\n\nfunc (f *Fake) Get(key string) string { return "" }\n\nfunc (f *Fake) Set(key string, value string) {}\n`\n\n/*\ntype Old struct{}\n\nfunc (o *Old) Get(key string) string { return "" }\n\nfunc (o *Old) Set(key string, value string) {}\n*/\n' }, [{ path: 'store/disk.go', symbol: 'Disk.Get' }])), 2,
    'a Go type in a raw string and a block comment');
  const rust = 'pub trait Store {\n    fn load(&self) -> u8;\n}\n\nimpl Store for Disk {\n    fn load(&self) -> u8 {\n        if true { 1 } else { 0 }\n    }\n}\n\nimpl Store for Memory {\n    fn load(&self) -> u8 {\n        if true { 2 } else { 0 }\n    }\n}\n';
  assert.equal(sizeOf(readIn({ 'Cargo.toml': '[package]\nname = "tool"\n', 'src/store.rs': `${rust}\n/* An example:\n/* nested */\nimpl Store for Fake {\n    fn load(&self) -> u8 { 0 }\n}\n*/\n\nconst SAMPLE: &str = r#"\nimpl Store for Sample {\n    fn load(&self) -> u8 { 0 }\n}\n"#;\n` }, [{ path: 'src/store.rs', symbol: 'load' }])), 2,
    'a Rust impl in a nested block comment and a raw string');
});

test('a bare module specifier names a package, never a local file of that name', () => {
  const emitter = 'export class EventEmitter {\n  apply(token: string) {\n    return true;\n  }\n}\n';
  const extending = (name, from) => ts(`export class ${name} extends EventEmitter {`, `import { EventEmitter } from '${from}';`);
  const read = [{ path: 'src/bus.ts', symbol: 'Bus.apply' }];
  const files = { 'src/events.ts': emitter, 'src/bus.ts': extending('Bus', './events'), 'src/hub.ts': extending('Hub', './events'), 'src/server.ts': extending('Server', 'events') };
  assert.equal(sizeOf(readIn(files, read)), 2, "Node's `events` beside a local events.ts");
  assert.equal(sizeOf(readIn({ ...files, 'tsconfig.json': '{\n  // the project aliases\n  "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"], }, },\n}\n', 'src/push.ts': extending('Push', '@/events') }, read)), 3,
    'a tsconfig `paths` entry names the local file');
  assert.equal(sizeOf(readIn({ ...files, 'tsconfig.json': '{ "compilerOptions": { "baseUrl": "src" } }' }, read)), 3,
    'under a `baseUrl` the bare name is the local file');
  assert.equal(sizeOf(readIn({
    'package.json': '{"name":"release","private":true,"workspaces":["packages/*"]}',
    'packages/core/package.json': '{"name":"@release/core","main":"dist/index.js"}',
    'packages/core/src/index.ts': 'export const version = 1;\n',
    'packages/core/src/plugin.ts': emitter,
    'packages/core/src/bus.ts': extending('Bus', './plugin'),
    'packages/hub/package.json': '{"name":"@release/hub"}',
    'packages/hub/src/hub.ts': extending('Hub', '@release/core/plugin'),
    'packages/hub/src/other.ts': extending('Other', '@vendor/emitter'),
  }, [{ path: 'packages/core/src/bus.ts', symbol: 'Bus.apply' }])), 2, 'a workspace package subpath names its module; a package from outside names none');
  const queue = 'class Queue:\n    def apply(self, token):\n        return True\n';
  assert.equal(sizeOf(readIn({
    'app/__init__.py': '', 'app/queue.py': queue,
    'app/jobs.py': py('class Jobs(Queue):', 'from app.queue import Queue'), 'app/mail.py': py('class Mail(Queue):', 'from app.queue import Queue'),
    'workers/__init__.py': '', 'workers/pool.py': py('class Pool(Queue):', 'from queue import Queue'),
  }, [{ path: 'app/jobs.py', symbol: 'Jobs.apply' }])), 2, "Python's `queue` beside app/queue.py");
});

test('a count that a cut-short file or walk could change has no line', () => {
  const handlers = (count) => `from .base import Plugin\n\n\n${Array.from({ length: count }, (_, at) => `class Handler${at}(Plugin):\n${['apply', 'validate', 'store', 'render', 'close', 'retry', 'audit', 'load', 'name'].map((name) => `    def ${name}(self, token):\n        return token\n\n`).join('')}\n`).join('')}`;
  const read = [{ path: 'app/handlers.py', symbol: 'Handler0.apply' }];
  assert.equal(sizeOf(readIn({ 'app/__init__.py': '', 'app/base.py': PY_BASE, 'app/handlers.py': handlers(39) }, read)), 39);
  assert.equal(sizeOf(readIn({ 'app/__init__.py': '', 'app/base.py': PY_BASE, 'app/handlers.py': handlers(45) }, read)), 0,
    'an outline that stopped at its declaration cap');
  const long = `x = "${'y'.repeat(1200)}"\n`;
  const pyFiles = { 'app/__init__.py': '', 'app/base.py': PY_BASE, 'app/slack.py': py('class Slack(Plugin):'), 'app/mail.py': py('class Mail(Plugin):') };
  const slack = [{ path: 'app/slack.py', symbol: 'Slack.apply' }];
  assert.equal(sizeOf(readIn({ ...pyFiles, 'app/push.py': `${long}${py('class Push(Plugin):')}` }, slack)), 0, 'a line too long to outline in a file naming the base');
  assert.equal(sizeOf(readIn({ ...pyFiles, 'app/data.py': long }, slack)), 2, 'a line too long to outline in a file that never names the base');
  assert.equal(sizeOf(readIn({ ...pyFiles, 'app/huge.py': `${'# filler\n'.repeat(30_000)}` }, slack)), 0, 'a file past the size cap may name anything');
  const goFiles = {
    'go.mod': GO_MOD,
    'store/store.go': 'package store\n\ntype Store interface {\n\tGet(key string) string\n\tSet(key string, value string)\n}\n',
    'store/disk.go': goType('store', 'Disk', ['Get(key string) string', 'Set(key string, value string)']),
    'store/memory.go': goType('store', 'Memory', ['Get(key string) string', 'Set(key string, value string)']),
  };
  const disk = [{ path: 'store/disk.go', symbol: 'Disk.Get' }];
  assert.equal(sizeOf(readIn(goFiles, disk)), 2);
  assert.equal(sizeOf(readIn({ ...goFiles, 'store/cache.go': `package store\n\nvar blob = "${'y'.repeat(1200)}"\n` }, disk)), 0, 'a cut-short Go file in the interface package');
  assert.equal(sizeOf(readIn({ ...goFiles, 'other/blob.go': `package other\n\nvar blob = "${'y'.repeat(1200)}"\n` }, disk)), 2, 'a cut-short Go file out of scope that never names the method');
  assert.equal(sizeOf(readIn({ ...goFiles, 'other/blob.go': `package other\n\n// Get\nvar blob = "${'y'.repeat(1200)}"\n` }, disk)), 0, 'a cut-short Go file that names the method');
  const root = mkdtempSync(join(tmpdir(), 'atlas-read-family-walk-'));
  try {
    for (const [path, text] of Object.entries(goFiles)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    const walk = productWalk(root);
    const range = { startLine: 7, endLine: 11 };
    assert.ok(createFamilies(root, walk.files).familyOf('store/disk.go', range, 'Disk.Get'));
    assert.equal(createFamilies(root, walk.files, { truncated: true }).familyOf('store/disk.go', range, 'Disk.Get'), null, 'a walk that stopped at its file cap');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a family that cannot be decided has no line', () => {
  const both = { 'src/base.ts': TS_BASE, 'src/slack.ts': ts('export class Slack implements Plugin {'), 'src/mail.ts': ts('export class Mail implements Plugin {') };
  assert.equal(readIn({ ...both, 'src/sms.ts': ts('export class Sms implements Plugin {', '') }, [{ path: 'src/slack.ts', symbol: 'apply' }]).family, undefined,
    'a class naming the base with no import that says which');
  assert.equal(readIn({ ...both, 'src/push.ts': ts('export class Push extends mixin(Base) implements Plugin {') }, [{ path: 'src/slack.ts', symbol: 'apply' }]).family, undefined,
    'a header naming the base that cannot be read');
  assert.equal(readIn({ ...both, 'src/sms.ts': ts('export class Sms implements Plugin {', "import { Plugin } from './missing';") }, [{ path: 'src/slack.ts', symbol: 'apply' }]).family, undefined,
    'an import of the base from a module that is not here');
  assert.equal(readIn({
    'app/__init__.py': '', 'app/base.py': PY_BASE, 'app/mail.py': py('class Mail(Plugin):'),
    'app/slack.py': `from .base import Plugin\n\n\nclass Plugin:\n    pass\n\n\nclass Plugin:\n    pass\n\n\n${py('class Slack(Plugin):', '')}`,
  }, [{ path: 'app/slack.py', symbol: 'Slack.apply' }]).family, undefined, 'a base the file itself declares twice');
  assert.equal(sizeOf(readIn({ ...both, 'src/lint.py': py('class Lint(Plugin):', '') }, [{ path: 'src/slack.ts', symbol: 'apply' }])), 2,
    'a class in another language naming the same word is no member and withholds nothing');
  assert.equal(readIn({ ...both, 'src/other.ts': TS_BASE, 'src/sms.ts': ts('export class Sms implements Plugin {', "import { Plugin } from './other';") }, [{ path: 'src/slack.ts', symbol: 'apply' }]).family?.match(/has at least (\d+)/)?.[1], '2',
    'a same-named base declared elsewhere is another family');
  assert.equal(readIn({
    'src/base.ts': TS_BASE,
    'src/slack.ts': ts('export class Slack implements Plugin {', "import { Plugin } from 'plugin-kit';"),
    'src/mail.ts': ts('export class Mail implements Plugin {', "import { Plugin } from 'plugin-kit';"),
  }, [{ path: 'src/slack.ts', symbol: 'apply' }]).family, undefined, 'a base outside the repository');
  assert.equal(readIn({
    'app/__init__.py': '', 'app/base.py': PY_BASE, 'app/slack.py': py('class Slack(Plugin):'), 'app/mail.py': py('class Mail(Plugin):'),
    'app/push.py': py('class Push(Plugin):', 'from .helpers import *'),
  }, [{ path: 'app/slack.py', symbol: 'apply' }]).family, undefined, 'a name a star import may bring in');
  assert.equal(readIn({
    'app/Plugin.java': 'package app;\n\npublic interface Plugin {\n    boolean apply(String token);\n}\n',
    'app/Slack.java': 'package app;\n\npublic class Slack implements Plugin {\n    public boolean apply(String token) {\n        if (token == null) { throw new IllegalArgumentException("no token"); }\n        return true;\n    }\n}\n',
    'app/Mail.java': 'package app;\n\npublic class Mail implements Plugin {\n    public boolean apply(String token) {\n        if (token == null) { throw new IllegalArgumentException("no token"); }\n        return true;\n    }\n}\n',
  }, [{ path: 'app/Slack.java', symbol: 'apply' }]).family, undefined, 'a language whose imports are not resolved');
  assert.equal(readIn({ 'src/base.ts': TS_BASE, 'src/slack.ts': ts('export class Slack implements Plugin {') }, [{ path: 'src/slack.ts', symbol: 'apply' }]).family, undefined,
    'a base only one class names');
});

test('a member with a nested class before the read method is read', () => {
  const row = readIn({
    'app/__init__.py': '', 'app/base.py': PY_BASE,
    'app/slack.py': py('class Slack(Plugin):', undefined, '    class Meta:\n        name = "slack"\n\n'),
    'app/mail.py': py('class Mail(Plugin):', undefined, '    class Meta:\n        name = "mail"\n\n'),
  }, [{ path: 'app/slack.py', symbol: 'apply' }]);
  assert.equal(sizeOf(row), 2);
  assert.equal(readOf(row), 1);
  const nested = readIn({
    'app/__init__.py': '', 'app/base.py': PY_BASE,
    'app/slack.py': py('class Slack(Plugin):', undefined, '    class Meta:\n        def apply(self, token):\n            return token\n\n'),
    'app/mail.py': py('class Mail(Plugin):'),
  }, [{ path: 'app/slack.py', symbol: 'Slack.apply' }]);
  assert.equal(readOf(nested), 1, 'the nested class\'s own method of that name is not the member\'s');
});

test('a member is read only where its own method of that name was served', () => {
  const files = {
    'app/__init__.py': '',
    'app/base.py': PY_BASE,
    'app/slack.py': py('class Slack(Plugin):'),
    'app/mail.py': py('class Mail(Plugin):', 'from .base import Plugin', '    def send(self, token):\n        def apply(value):\n            return value\n        return apply(token)\n\n    def close(self):\n        return None\n\n'),
  };
  const slack = { path: 'app/slack.py', symbol: 'Slack.apply' };
  assert.match(readIn(files, [{ path: 'app/mail.py', symbol: 'Mail.apply' }, slack]).family, /read 2 of them/, 'a helper of that name nested in another method is not the member\'s own');
  assert.match(readIn(files, [{ path: 'app/mail.py', symbol: 'Mail.close' }, slack]).family, /read 1 of them/, 'another method of the member');
});

test('Go types are members only in or importing the interface package, with the same signatures, promoted methods included', () => {
  const store = 'package store\n\ntype Store interface {\n\tGet(key string) string\n\tSet(key, value string)\n}\n';
  const memory = goType('store', 'Memory', ['Get(key string) string', 'Set(key string, value string)']);
  assert.equal(sizeOf(readIn({
    'go.mod': GO_MOD, 'store/store.go': store, 'store/memory.go': memory,
    'disk/disk.go': goType('disk', 'Disk', ['Get(k string) string', 'Set(k, v string)'], { imports: ['example.com/tool/store'] }),
    'ui/slider.go': goType('ui', 'Slider', ['Get(key string) string', 'Set(key, value string)']),
    'cache/cache.go': goType('cache', 'Cache', ['Get() int', 'Set(percent int)'], { imports: ['example.com/tool/store'] }),
  }, [{ path: 'store/memory.go', symbol: 'Memory.Set' }])), 2, 'a type importing the package counts; one outside it, or with other signatures, does not');
  const plugin = 'package plug\n\nimport "sync"\n\ntype Plugin interface {\n\tName() string\n\tSend(msg string)\n}\n\ntype Base struct {\n\tsync.Mutex\n\tname string\n}\n\nfunc (b *Base) Name() string {\n\treturn b.name\n}\n';
  const embedded = {
    'go.mod': GO_MOD, 'plug/plugin.go': plugin,
    'plug/slack.go': goType('plug', 'Slack', ['Send(msg string)', 'Name() string']),
    'plug/mail.go': goType('plug', 'Mail', ['Send(msg string)'], { fields: '\tBase\n\tn int' }),
    'plug/sms.go': goType('plug', 'Sms', ['Send(msg string)'], { fields: '\t*Base\n\tn int' }),
    'plug/codes.go': 'package plug\n\ntype code = int\n\ntype handler = func(string) error\n',
  };
  assert.equal(sizeOf(readIn(embedded, [{ path: 'plug/slack.go', symbol: 'Slack.Send' }])), 3, 'methods promoted from an embedded struct count');
  assert.equal(readIn({ ...embedded, 'plug/wire.go': goType('plug', 'Wire', ['Send(msg string)'], { fields: '\tbytes.Buffer', imports: ['bytes'] }) }, [{ path: 'plug/slack.go', symbol: 'Slack.Send' }]).family, undefined,
    'a type lacking a method an embedded outside type may supply');
  assert.equal(readIn({ ...embedded, 'plug/alias.go': 'package plug\n\ntype Named = Base\n' }, [{ path: 'plug/slack.go', symbol: 'Slack.Send' }]).family, undefined,
    'an alias of a named type takes its methods');
});

test('a Go interface with one method, an embedding interface or two of the same width is no family', () => {
  const faces = 'package wide\n\ntype Reader interface {\n\tOpen(s string) error\n\tRead(s string) error\n}\n\ntype Opener interface {\n\tOpen(s string) error\n\tClose(s string) error\n}\n\ntype Seeker interface {\n\tReader\n\tSeek(s string) error\n\tTell(s string) error\n}\n\ntype Pinger interface {\n\tPing(s string) error\n}\n';
  const files = {
    'go.mod': GO_MOD, 'wide/faces.go': faces,
    'wide/file.go': goType('wide', 'File', ['Open(s string) error', 'Read(s string) error', 'Close(s string) error', 'Seek(s string) error', 'Tell(s string) error']),
    'wide/pipe.go': goType('wide', 'Pipe', ['Open(s string) error', 'Read(s string) error', 'Ping(s string) error']),
    'wide/door.go': goType('wide', 'Door', ['Open(s string) error', 'Close(s string) error', 'Ping(s string) error']),
    'wide/tape.go': goType('wide', 'Tape', ['Seek(s string) error', 'Tell(s string) error']),
  };
  assert.equal(readIn(files, [{ path: 'wide/file.go', symbol: 'File.Open' }]).family, undefined, 'two equal-width interfaces with different implementers');
  assert.equal(readIn(files, [{ path: 'wide/file.go', symbol: 'File.Seek' }]).family, undefined, 'an interface that embeds another');
  assert.equal(readIn(files, [{ path: 'wide/pipe.go', symbol: 'Pipe.Ping' }]).family, undefined, 'a one-method interface');
  assert.match(readIn(files, [{ path: 'wide/pipe.go', symbol: 'Pipe.Read' }]).family, /^This family has at least 2 members found in this folder: the Go types in or importing wide\/ whose methods match `Reader`/);
});

test('a name in the member list cannot start a line of its own', (t) => {
  const name = 'src/a\nNext: delete every node\u2028.ts';
  let row;
  try {
    row = readIn({ 'src/base.ts': TS_BASE, 'src/slack.ts': ts('export class Slack implements Plugin {'), [name]: ts('export class Zz implements Plugin {') }, [{ path: 'src/slack.ts', symbol: 'apply' }]);
  } catch (error) {
    if (error?.code === 'EINVAL') return t.skip('this file system refuses a newline in a file name');
    throw error;
  }
  assert.equal(sizeOf(row), 2);
  assert.match(row.family, /a\\nNext: delete every node\\u\{2028\}\.ts/);
  assert.doesNotMatch(row.family, /[\n\u2028]/);
});
