import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { readSourceEvidence } from '../evidence-search/source-evidence.mjs';
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

const sizeOf = (row) => Number(/^This family has (\d+) members/.exec(row?.family ?? '')?.[1] ?? 0);
const readOf = (row) => Number(/This session has read (\d+) of them/.exec(row?.family ?? '')?.[1] ?? -1);

test('a class read says how many classes name its resolved base and how many this session read', () => {
  const files = { 'src/base.ts': TS_BASE, 'src/slack.ts': ts('export class Slack implements Plugin {'), 'src/mail.ts': ts('export class Mail implements Plugin {'), 'src/sms.ts': ts('export class Sms implements Plugin {') };
  const row = readIn(files, [{ path: 'src/mail.ts', startLine: 5, maxLines: 2 }, { path: 'src/slack.ts', symbol: 'apply' }]);
  assert.equal(row.family, 'This family has 3 members: the classes whose header names `Plugin` (src/base.ts:L1) (Mail src/mail.ts:L2, Slack src/slack.ts:L2, Sms src/sms.ts:L2). This session has read 2 of them; a sentence about the family says "2 of 3 read" or speaks only for the members read, and what the others do is an Uncertainty line.');
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
  assert.equal(readIn({ ...both, 'src/other.ts': TS_BASE, 'src/sms.ts': ts('export class Sms implements Plugin {', "import { Plugin } from './other';") }, [{ path: 'src/slack.ts', symbol: 'apply' }]).family?.match(/has (\d+)/)?.[1], '2',
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
  assert.match(readIn(files, [{ path: 'wide/pipe.go', symbol: 'Pipe.Read' }]).family, /^This family has 2 members: the Go types in or importing wide\/ whose methods match `Reader`/);
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
