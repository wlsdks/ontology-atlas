import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { buildBreadthMap } from './breadth-map.mjs';

function repository(files) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-abilities-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function abilities(t, files) {
  const root = repository(files);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const map = buildBreadthMap(root, { fit: false });
  return { rows: map.abilities, text: buildBreadthMap(root).text };
}

const find = (rows, kind, name) => rows.find((row) => row.kind === kind && row.name === name);

/** A server whose operator features live in flags, a config struct, a worker and the docs. */
const OPERATOR_SERVER = {
  'go.mod': 'module example.com/server\n',
  'cmd/server/main.go': 'package main\n\nfunc main() {\n\trun()\n}\n',
  'cli/options.go': [
    'package cli',
    '',
    'func NewConfigFromCLI() []cli.Flag {',
    '\tflags := []cli.Flag{',
    '\t\t&cli.BoolFlag{',
    '\t\t\tName: "strict-config",',
    '\t\t},',
    '\t}',
    '\tapp := &cli.Command{',
    '\t\tName: "serve",',
    '\t}',
    '\treturn flags',
    '}',
    '',
    'func metricsCLIFlags(c *Config) []cli.Flag {',
    '\treturn []cli.Flag{',
    '\t\t&cli.BoolFlag{',
    '\t\t\tName: "metrics_log",',
    '\t\t},',
    '\t\t&cli.IntFlag{',
    '\t\t\tName: "metrics_port",',
    '\t\t},',
    '\t}',
    '}',
    '',
  ].join('\n'),
  'config/config.go': [
    'package config',
    '',
    'type Config struct {',
    '\tPort       int',
    '\tPublicMode bool',
    '\tMetrics    metrics.Config `toml:"metrics"`',
    '\tJWT        identity.JWTConfig `toml:"jwt"`',
    '}',
    '',
  ].join('\n'),
  'node/disconnect_queue.go': [
    'package node',
    '',
    'func (d *DisconnectQueue) Run() {',
    '\tthrottle := time.NewTicker(d.rate)',
    '\t<-throttle.C',
    '}',
    '',
  ].join('\n'),
  'mocks/broker.go': 'package mocks\n\nfunc (b *Broker) Loop() {\n\tt := time.NewTicker(1)\n\t<-t.C\n}\n',
  'telemetry/telemetry.go': 'package telemetry\n\nfunc Collect() {}\n',
  'install/install.go': 'package install\n\nfunc Install() {}\n',
  'README.md': '# Server\n\nA real-time server for many clients.\n\n## Installation\n\nRun it.\n',
  'docs/telemetry.md': '# Telemetry\n\nWhat is collected.\n',
};

test('a subcommand a command-line parser registers is an ability with its line', (t) => {
  const { rows } = abilities(t, OPERATOR_SERVER);
  assert.deepEqual(find(rows, 'subcommand', 'serve'), { kind: 'subcommand', name: 'serve', path: 'cli/options.go', line: 9, evidence: 'cli/options.go:L9' });
});

test('flags are grouped the way the code groups them, and a lone behaviour switch stands alone', (t) => {
  const { rows } = abilities(t, OPERATOR_SERVER);
  const metrics = find(rows, 'flags', 'metrics');
  assert.deepEqual(metrics.members, ['--metrics_log', '--metrics_port']);
  assert.equal(metrics.evidence, 'cli/options.go:L17');
  assert.equal(find(rows, 'flag', '--strict-config').evidence, 'cli/options.go:L5');
});

test('a configuration type yields its sections and its switches; a section a flag group already names is not listed twice', (t) => {
  const { rows } = abilities(t, OPERATOR_SERVER);
  assert.equal(find(rows, 'setting', 'PublicMode').evidence, 'config/config.go:L5');
  assert.equal(find(rows, 'setting', 'JWT').symbol, 'Config.JWT');
  assert.equal(find(rows, 'setting', 'Port'), undefined, 'a plain value turns nothing on');
  assert.equal(find(rows, 'setting', 'Metrics'), undefined, 'the metrics flag group already lists it');
});

test('a background worker is named by the type that starts it; a mock is tooling', (t) => {
  const { rows } = abilities(t, OPERATOR_SERVER);
  assert.deepEqual(find(rows, 'worker', 'DisconnectQueue'), {
    kind: 'worker', name: 'DisconnectQueue', path: 'node/disconnect_queue.go', line: 4, symbol: 'DisconnectQueue.Run', evidence: 'node/disconnect_queue.go:L4',
  });
  assert.equal(rows.some((row) => row.path.startsWith('mocks/')), false);
});

test('a docs heading the code also names is a documented ability; a heading about the document is not', (t) => {
  const { rows, text } = abilities(t, OPERATOR_SERVER);
  assert.deepEqual(find(rows, 'documented', 'Telemetry'), {
    kind: 'documented', name: 'Telemetry', path: 'telemetry/telemetry.go', line: 1, symbol: 'telemetry', doc: 'docs/telemetry.md:L1', evidence: 'telemetry/telemetry.go:L1',
  });
  assert.equal(rows.some((row) => row.kind === 'documented' && row.name === 'Installation'), false);
  assert.match(text, /^documented Telemetry telemetry\/telemetry\.go:L1 telemetry \(docs\/telemetry\.md:L1\)$/m);
  assert.match(text, /floor under that list, not all of it/);
});

/** A Python library whose public names sit behind re-exports and a subpackage. */
const LIBRARY = {
  'pyproject.toml': '[project]\nname = "pkg"\n\n[project.scripts]\npkg = "pkg.cli:main"\n',
  'src/pkg/__init__.py': 'from .ops.inverse import invert\nfrom .batch import Batch\n\n__all__ = ["invert", "Batch"]\n',
  'src/pkg/ops/__init__.py': '',
  'src/pkg/ops/inverse.py': 'def invert(subject):\n    return subject\n',
  'src/pkg/batch.py': 'class Batch:\n    def invert(self):\n        return self\n',
  'src/pkg/data/__init__.py': 'from .backends import LazyReader, register_backend, resolve_backend\n\n__all__ = ["LazyReader", "register_backend", "resolve_backend"]\n',
  'src/pkg/data/backends.py': 'class LazyReader:\n    pass\n\n\ndef register_backend(name):\n    return name\n\n\ndef resolve_backend(name):\n    return name\n',
  'src/pkg/_private/__init__.py': 'from .hidden import secret_helper\n__all__ = ["secret_helper"]\n',
  'src/pkg/_private/hidden.py': 'def secret_helper():\n    return 1\n',
  'src/pkg/cli.py': [
    'import argparse',
    '',
    'def main():',
    '    parser = argparse.ArgumentParser()',
    '    sub = parser.add_subparsers()',
    '    sub.add_parser("convert")',
    '    cache = parser.add_argument_group("cache")',
    '    cache.add_argument("--cache-dir")',
    '    cache.add_argument("--no-cache", action="store_true")',
    '    parser.add_argument("--dry-run", action="store_true")',
    '',
  ].join('\n'),
  'src/pkg/tool.py': [
    'import tyro',
    'from dataclasses import dataclass',
    '',
    '@dataclass',
    'class Plot:',
    '    path: str',
    '',
    '    def run(self) -> None:',
    '        print(self.path)',
    '',
  ].join('\n'),
  'src/pkg/prefetch.py': [
    'import threading',
    '',
    'class Prefetcher:',
    '    def start(self):',
    '        self._thread = threading.Thread(target=self._loop)',
    '',
    '    def _loop(self):',
    '        pass',
    '',
  ].join('\n'),
  'src/pkg/settings.py': [
    'from dataclasses import dataclass',
    '',
    '@dataclass',
    'class LoaderConfig:',
    '    enable_cache: bool = True',
    '    workers: int = 2',
    '',
  ].join('\n'),
};

test('an exported name resolves through the module the entry imports it from, not the first declaration of that name', (t) => {
  const { rows } = abilities(t, LIBRARY);
  assert.equal(find(rows, 'export', 'invert').evidence, 'src/pkg/ops/inverse.py:L1');
});

test('a public subpackage exports abilities too, three or more from one module as one api row', (t) => {
  const { rows } = abilities(t, LIBRARY);
  const backends = find(rows, 'api', 'backends');
  assert.deepEqual(backends.members, ['LazyReader', 'register_backend', 'resolve_backend']);
  assert.equal(backends.evidence, 'src/pkg/data/backends.py:L1');
  assert.equal(rows.some((row) => (row.members ?? [row.name]).includes('secret_helper')), false, 'a private subpackage exports nothing');
});

test('argparse subparsers, argument groups and switches, and tyro dataclass commands are abilities', (t) => {
  const { rows } = abilities(t, LIBRARY);
  assert.equal(find(rows, 'subcommand', 'convert').evidence, 'src/pkg/cli.py:L6');
  assert.equal(find(rows, 'subcommand', 'plot').evidence, 'src/pkg/tool.py:L5');
  assert.deepEqual(find(rows, 'flags', 'cache').members, ['--cache-dir', '--no-cache']);
  assert.equal(find(rows, 'flag', '--dry-run').evidence, 'src/pkg/cli.py:L10');
});

test('a Python thread starter is a worker and a dataclass config switch is a setting', (t) => {
  const { rows } = abilities(t, LIBRARY);
  assert.equal(find(rows, 'worker', 'Prefetcher').symbol, 'Prefetcher.start');
  assert.equal(find(rows, 'setting', 'enable_cache').evidence, 'src/pkg/settings.py:L5');
  assert.equal(find(rows, 'setting', 'workers'), undefined);
});

/** A TypeScript package whose entry re-exports a module wholesale. */
const PACKAGE = {
  'package.json': JSON.stringify({ name: 'tool', main: 'src/index.ts' }),
  'src/index.ts': "export * from './release';\n",
  'src/release.ts': 'export function shipit() {\n  return 1;\n}\n',
  'src/cli.ts': [
    "import { Command } from 'commander';",
    'const program = new Command();',
    "program.command('deploy');",
    "program.option('--dry-run', 'print only');",
    "program.option('--only-publish <label>');",
    "program.option('--only-graduate <label>');",
    '',
  ].join('\n'),
  'src/poller.ts': 'export function startPolling() {\n  setInterval(() => check(), 1000);\n}\nfunction check() {}\n',
  'src/config.ts': 'export interface ReleaseOptions {\n  onlyPublishWithReleaseLabel?: boolean;\n  name: string;\n}\n',
};

test('export * is followed to the module that declares the name', (t) => {
  const { rows } = abilities(t, PACKAGE);
  assert.equal(find(rows, 'export', 'shipit').evidence, 'src/release.ts:L1');
});

test('commander commands and options, a timer loop and an options switch are abilities', (t) => {
  const { rows } = abilities(t, PACKAGE);
  assert.equal(find(rows, 'subcommand', 'deploy').evidence, 'src/cli.ts:L3');
  assert.equal(find(rows, 'flag', '--dry-run').evidence, 'src/cli.ts:L4');
  assert.deepEqual(find(rows, 'flags', '--only-*').members, ['--only-publish', '--only-graduate'], 'a shared prefix groups flags');
  assert.equal(find(rows, 'worker', 'startPolling').evidence, 'src/poller.ts:L2');
  assert.equal(find(rows, 'setting', 'onlyPublishWithReleaseLabel').symbol, 'ReleaseOptions.onlyPublishWithReleaseLabel');
});

test('a heading from the repository is cleaned before it becomes a name', (t) => {
  const { rows, text } = abilities(t, {
    'go.mod': 'module x\n',
    'telemetry/telemetry.go': 'package telemetry\n\nfunc Collect() {}\n',
    'README.md': '# X\n\nA server that does things for people.\n\n## <b>Telemetry</b> `‮`\n',
  });
  assert.equal(find(rows, 'documented', 'Telemetry').doc, 'README.md:L5');
  assert.doesNotMatch(text, /‮/);
});

/*
 * Every detector stays linear on a hostile line: a line at the limit runs the
 * regexes themselves, a longer one is read as blank. Writes and validate_vault
 * build this survey, so a slow line would block them too.
 */
test('a hostile line costs every detector under 100 ms', async () => {
  const { operatorAbilities } = await import('./operator-abilities.mjs');
  const { documentedAbilities } = await import('./documented-abilities.mjs');
  const near = 1990;
  const hostile = (n) => [
    '# a' + ' '.repeat(n) + 'x', 'title: a' + ' '.repeat(n) + 'x', '## ' + '<'.repeat(n), '## ' + '!['.repeat(n / 2),
    '## ' + '{#'.repeat(n / 2), '## ' + '[a]('.repeat(n / 4), 'a'.repeat(n), 'x = y.add_argument_group(' + 'a'.repeat(n),
    ' '.repeat(n) + 'x', '  name: ' + ' '.repeat(n) + 'x', ' a(' + '{x'.repeat(n / 2), 'func (a ' + 'b'.repeat(n),
    'interface A' + 'a'.repeat(n), '  a: ' + ' '.repeat(n) + 'x', 'from' + ' '.repeat(n), 'typer.Option('.repeat(n / 13),
    '#[arg(' + 'x'.repeat(n), 'const X = 5' + ' '.repeat(n) + 'x', '  setInterval(a, ' + ' '.repeat(n) + 'x', '0123456789abcdef'.repeat(n / 16),
  ];
  const preludes = {
    'a.go': 'package a\n\ntype Config struct {\n',
    'a.py': 'import tyro\nimport argparse\n@dataclass\nclass Config:\n',
    'a.ts': "import { Command } from 'commander';\nexport interface Config {\n",
    'a.rs': '#[derive(Subcommand)]\npub struct Config {\n',
  };
  for (const n of [near, 200_000]) {
    for (const [index, line] of hostile(n).entries()) {
      for (const [path, prelude] of Object.entries(preludes)) {
        const text = `${prelude}${line}\n${'\n'.repeat(n === near ? 2000 : 0)}`;
        const started = performance.now();
        operatorAbilities([{ path }], () => text);
        const operatorMs = performance.now() - started;
        assert.ok(operatorMs < 100, `operator detectors on hostile line ${index} (${n} chars) in ${path}: ${operatorMs.toFixed(0)} ms`);
      }
      const page = `${line}\n`;
      const started = performance.now();
      documentedAbilities(() => page, { readme: 'README.md', pages: ['docs/a.md'] }, [{ path: 'telemetry/telemetry.go' }], null);
      const documentedMs = performance.now() - started;
      assert.ok(documentedMs < 100, `heading detector on hostile line ${index} (${n} chars): ${documentedMs.toFixed(0)} ms`);
    }
  }
});

test('a long file costs every detector one pass, not one pass per line', async () => {
  const { operatorAbilities } = await import('./operator-abilities.mjs');
  const body = Array.from({ length: 10_000 }, (_, index) => `const value${index} = compute(${index}); // ${'x'.repeat(10)}`).join('\n');
  for (const path of ['a.ts', 'a.py', 'a.go', 'a.rs']) {
    const started = performance.now();
    operatorAbilities([{ path }], () => body);
    const ms = performance.now() - started;
    assert.ok(ms < 100, `${path} of 10,000 lines: ${ms.toFixed(0)} ms`);
  }
});

test('only a switch name turns a boolean into a setting', (t) => {
  const { rows } = abilities(t, {
    'go.mod': 'module x\n',
    'config/config.go': 'package config\n\ntype Config struct {\n\tVerbose bool\n\tPublicMode bool\n\tEnableCache bool\n\tCacheEnabled bool\n}\n',
  });
  assert.deepEqual(rows.filter((row) => row.kind === 'setting').map((row) => row.name), ['PublicMode', 'EnableCache', 'CacheEnabled']);
});

test('a hook\'s options, a one-line type, an indexed type and a nested field are not settings', (t) => {
  const { rows } = abilities(t, {
    'package.json': '{"name":"app"}\n',
    'src/use-shortcut.ts': 'export interface ShortcutOptions {\n  disabled?: boolean;\n}\n',
    'src/select.ts': [
      "type SelectConfig = { preserveImpact?: boolean };",
      'type Context = {',
      "  setRoute: Options['setRoute'];",
      '};',
      'export interface PanelConfig {',
      "  section: Options['panelConfig'];",
      '  live: RefObject<{',
      '    sessionEnabled: boolean;',
      '  }>;',
      '  strictMode: boolean;',
      '}',
    ].join('\n'),
    'src/release.ts': 'export interface ReleaseOptions {\n  onlyPublishWithReleaseLabel?: boolean;\n}\n',
  });
  assert.deepEqual(rows.filter((row) => row.kind === 'setting').map((row) => row.symbol).sort(), ['PanelConfig.strictMode', 'ReleaseOptions.onlyPublishWithReleaseLabel']);
});

test('a test, a pipe reader and a screen timer are not workers; a file watcher is', (t) => {
  const { rows } = abilities(t, {
    'go.mod': 'module x\n',
    'node/ticker.go': 'package node\n\nfunc TestTicker(t *testing.T) {\n\ttime.NewTicker(1)\n}\n\nfunc (q *Queue) Run() {\n\ttime.NewTicker(1)\n}\n',
    'src/watch.rs': [
      'pub async fn start_vault_watch() {',
      '    let watcher = builder.watcher();',
      '}',
      'fn read_child() {',
      '    std::thread::spawn(move || {',
      '        let _ = pipe.read_to_end(&mut bytes);',
      '    });',
      '}',
      '#[test]',
      'fn spawns_in_a_test() {',
      '    std::thread::spawn(move || loop {});',
      '}',
      '#[cfg(test)]',
      'mod tests {',
      '    fn helper() {',
      '        std::thread::spawn(move || loop {});',
      '    }',
      '}',
    ].join('\n'),
    'src/tests.rs': 'fn every_test() {\n    std::thread::spawn(move || loop {});\n}\n',
    'web/Banner.tsx': 'export function Banner() {\n  useEffect(() => {\n    const id = setInterval(() => step(), 80);\n  });\n}\n',
    'web/use-clock.ts': 'const TICK_MS = 30_000;\nexport function useClock() {\n  useEffect(() => {\n    const id = setInterval(() => setNow(Date.now()), TICK_MS);\n  });\n}\n',
    'web/use-poll.ts': 'function helper() {\n  return 1;\n}\nexport function usePoll() {\n  useEffect(() => {\n    const id = setInterval(() => check(), 5_000);\n  });\n}\n',
  });
  assert.deepEqual(rows.filter((row) => row.kind === 'worker').map((row) => row.name).sort(), ['Queue', 'start_vault_watch', 'usePoll']);
});

test('a heading about the document, a section deep in a page, a history page and a test file match no code', (t) => {
  const { rows } = abilities(t, {
    'go.mod': 'module x\n',
    'installation/installation.go': 'package installation\n\nfunc Run() {}\n',
    'scope/scope.go': 'package scope\n\nfunc Run() {}\n',
    'evidence/evidence_test.go': 'package evidence\n\nfunc TestIt() {}\n',
    'billing/billing.go': 'package billing\n\nfunc Run() {}\n',
    'ledger/ledger.go': 'package ledger\n\nfunc Run() {}\n',
    'README.md': '# X\n\nA server that does things for people.\n\n## Installation\n\n## Out of scope\n\n## Evidence\n',
    'docs/guide.md': '# Guide\n\n## Billing\n',
    'docs/specs/2026-01-01-ledger.md': '# Ledger\n',
    'docs/ledger.md': '# Ledger\n',
  });
  assert.deepEqual(rows.filter((row) => row.kind === 'documented').map((row) => `${row.name} ${row.doc}`), ['Ledger docs/ledger.md:L1']);
});

test('the vault\'s own pages document nothing', (t) => {
  const root = repository({
    'go.mod': 'module x\n',
    'ledger/ledger.go': 'package ledger\n\nfunc Run() {}\n',
    'docs/ontology/capabilities/ledger.md': '---\nkind: capability\ntitle: Ledger\n---\n# Ledger\n',
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const map = buildBreadthMap(root, { fit: false, vaultRoot: join(root, 'docs/ontology') });
  assert.equal(map.abilities.some((row) => row.kind === 'documented'), false);
});

test('120 rows are shared fairly between kinds, and what each kind leaves out is counted', (t) => {
  const cases = Array.from({ length: 130 }, (_, index) => `\tcase "op${index}":\n\t\thandle${index}()`).join('\n');
  const commands = Array.from({ length: 45 }, (_, index) => `\tc${index} := &cobra.Command{\n\t\tUse: "cmd${index}",\n\t}`).join('\n');
  const { rows, text } = abilities(t, {
    'go.mod': 'module x\n',
    'cmd/x/main.go': 'package main\n\nfunc main() {}\n',
    'dispatch/dispatch.go': `package dispatch\n\nfunc Route(command string) {\n\tswitch command {\n${cases}\n\t}\n}\n`,
    'cli/commands.go': `package cli\n\nfunc Commands() {\n${commands}\n}\n`,
    'node/queue.go': 'package node\n\nfunc (q *Queue) Run() {\n\ttime.NewTicker(1)\n}\n',
  });
  const count = (kind) => rows.filter((row) => row.kind === kind).length;
  assert.equal(rows.length, 120);
  assert.deepEqual([count('executable'), count('worker'), count('subcommand'), count('operation')], [1, 1, 45, 73]);
  assert.match(text, /^\+27 more not listed \(operation 27\): each kind keeps an equal share of 120 rows/m, 'the dispatcher scan reads 200 lines, so 100 operations');
});
