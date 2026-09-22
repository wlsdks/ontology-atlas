import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OUTLINE_DECLARATION_LIMIT,
  OUTLINE_SIGNATURE_CHARS,
  outlineSource,
} from './source-outline.mjs';

function named(outline, name) {
  return outline.declarations.find((row) => row.name === name);
}

test('lists JavaScript and TypeScript declarations at their exact lines', () => {
  const text = [
    '// a leading comment',                 // 1
    "import { join } from 'node:path';",    // 2
    '',                                     // 3
    'export type Selector = { path: string };', // 4
    '',                                     // 5
    'export interface Reader {',            // 6
    '  read(path: string): string;',        // 7
    '}',                                    // 8
    '',                                     // 9
    'export const LIMIT = 200;',            // 10
    '',                                     // 11
    'export const resolve = (path: string) => join(path);', // 12
    '',                                     // 13
    'export function readOne(path) {',      // 14
    '  if (path) {',                        // 15
    '    return join(path);',               // 16
    '  }',                                  // 17
    '  return null;',                       // 18
    '}',                                    // 19
    '',                                     // 20
    'export class Outline {',               // 21
    '  #hidden = 1;',                       // 22
    '',                                     // 23
    '  constructor(path) {',                // 24
    '    this.path = path;',                // 25
    '  }',                                  // 26
    '',                                     // 27
    '  async declarations(limit) {',        // 28
    '    return limit;',                    // 29
    '  }',                                  // 30
    '}',                                    // 31
    '',                                     // 32
    "export { readOne } from './reader.mjs';", // 33
  ].join('\n');
  const outline = outlineSource(text, 'src/reader.ts');
  assert.equal(outline.language, 'typescript');
  assert.equal(outline.truncated, false);
  assert.deepEqual(
    outline.declarations.map((row) => [row.line, row.kind, row.name]),
    [
      [4, 'type', 'Selector'],
      [6, 'interface', 'Reader'],
      [10, 'const', 'LIMIT'],
      [12, 'function', 'resolve'],
      [14, 'function', 'readOne'],
      [21, 'class', 'Outline'],
      [24, 'method', 'constructor'],
      [28, 'method', 'declarations'],
      [33, 'export', './reader.mjs'],
    ],
  );
  assert.equal(named(outline, 'readOne').signature, 'export function readOne(path) {');
});

test('does not read a call or a control statement as a JavaScript method', () => {
  const text = [
    'class Reader {',
    '  run() {',
    '    if (this.ready) {',
    '      collect(this.rows);',
    '    }',
    '    for (const row of this.rows) {',
    '      this.emit(row);',
    '    }',
    '  }',
    '}',
    'function afterTheClass() {',
    '}',
  ].join('\n');
  const outline = outlineSource(text, 'reader.js');
  assert.deepEqual(
    outline.declarations.map((row) => [row.line, row.kind, row.name]),
    [[1, 'class', 'Reader'], [2, 'method', 'run'], [11, 'function', 'afterTheClass']],
  );
});

test('separates Python module functions from methods by indent', () => {
  const text = [
    '"""Module docstring."""',       // 1
    'import os',                     // 2
    '',                              // 3
    '',                              // 4
    'def parse(text):',              // 5
    '    return text',               // 6
    '',                              // 7
    '',                              // 8
    'class Parser:',                 // 9
    '    """A parser."""',           // 10
    '',                              // 11
    '    def __init__(self, text):', // 12
    '        self.text = text',      // 13
    '',                              // 14
    '    async def parse_all(self):', // 15
    '        return self.text',      // 16
  ].join('\n');
  const outline = outlineSource(text, 'pkg/parser.py');
  assert.equal(outline.language, 'python');
  assert.deepEqual(
    outline.declarations.map((row) => [row.line, row.kind, row.name]),
    [
      [5, 'function', 'parse'],
      [9, 'class', 'Parser'],
      [12, 'method', '__init__'],
      [15, 'method', 'parse_all'],
    ],
  );
});

test('finds a Go method past line 900 of a long file and names its receiver', () => {
  const head = [
    'package command',                                  // 1
    '',                                                 // 2
    'import "strings"',                                 // 3
    '',                                                 // 4
    'type Command struct {',                            // 5
    '\tName string',                                    // 6
    '}',                                                // 7
    '',                                                 // 8
    'type Runner interface {',                          // 9
    '\tRun() error',                                    // 10
    '}',                                                // 11
    '',                                                 // 12
    'const DefaultDistance = 2',                        // 13
    '',                                                 // 14
    'func New(name string) *Command {',                 // 15
    '\treturn &Command{Name: name}',                    // 16
    '}',                                                // 17
  ];
  const filler = [];
  for (let line = head.length + 1; line <= 920; line += 1) filler.push('// filler');
  const tail = [
    'func (c *Command) SuggestionsFor(typedName string) []string {', // 921
    '\tsuggestions := []string{}',
    '\treturn suggestions',
    '}',
    '',
    'func (c Command) Usage() string {',                             // 926
    '\treturn strings.TrimSpace(c.Name)',
    '}',
  ];
  const text = [...head, ...filler, ...tail].join('\n');
  assert.equal(text.split('\n').length, 928);
  const outline = outlineSource(text, 'command.go');
  assert.equal(outline.language, 'go');
  assert.equal(outline.truncated, false);
  assert.deepEqual(
    outline.declarations.map((row) => [row.line, row.kind, row.name]),
    [
      [5, 'struct', 'Command'],
      [9, 'interface', 'Runner'],
      [13, 'const', 'DefaultDistance'],
      [15, 'function', 'New'],
      [921, 'method', 'Command.SuggestionsFor'],
      [926, 'method', 'Command.Usage'],
    ],
  );
  assert.equal(
    named(outline, 'Command.SuggestionsFor').signature,
    'func (c *Command) SuggestionsFor(typedName string) []string {',
  );
});

test('lists Rust items, impl blocks and methods', () => {
  const text = [
    'use std::fmt;',                      // 1
    '',                                   // 2
    'pub const MAX: usize = 8;',          // 3
    '',                                   // 4
    'pub struct Reader {',                // 5
    '    path: String,',                  // 6
    '}',                                  // 7
    '',                                   // 8
    'pub enum Mode {',                    // 9
    '    Lines,',                         // 10
    '}',                                  // 11
    '',                                   // 12
    'pub trait Outline {',                // 13
    '    fn outline(&self) -> usize;',    // 14
    '}',                                  // 15
    '',                                   // 16
    'pub type Rows = Vec<String>;',       // 17
    '',                                   // 18
    'impl Reader {',                      // 19
    '    pub fn new(path: String) -> Self {', // 20
    '        Self { path }',              // 21
    '    }',                              // 22
    '}',                                  // 23
    '',                                   // 24
    'pub fn read(path: &str) -> Rows {',  // 25
    '    Vec::new()',                     // 26
    '}',                                  // 27
  ].join('\n');
  const outline = outlineSource(text, 'src/lib.rs');
  assert.equal(outline.language, 'rust');
  assert.deepEqual(
    outline.declarations.map((row) => [row.line, row.kind, row.name]),
    [
      [3, 'const', 'MAX'],
      [5, 'struct', 'Reader'],
      [9, 'enum', 'Mode'],
      [13, 'interface', 'Outline'],
      [14, 'method', 'outline'],
      [17, 'type', 'Rows'],
      [19, 'class', 'Reader'],
      [20, 'method', 'new'],
      [25, 'function', 'read'],
    ],
  );
});

test('lists Java types and members and Kotlin functions', () => {
  const java = [
    'package billing;',                            // 1
    '',                                            // 2
    'public interface Invoice {',                  // 3
    '    String number();',                        // 4
    '}',                                           // 5
    '',                                            // 6
    'public class Billing implements Invoice {',   // 7
    '    public Billing(String number) {',         // 8
    '    }',                                       // 9
    '',                                            // 10
    '    public String number() {',                // 11
    '        return "1";',                         // 12
    '    }',                                       // 13
    '}',                                           // 14
  ].join('\n');
  const outline = outlineSource(java, 'src/Billing.java');
  assert.equal(outline.language, 'java');
  assert.deepEqual(
    outline.declarations.map((row) => [row.line, row.kind, row.name]),
    [[3, 'interface', 'Invoice'], [7, 'class', 'Billing'], [8, 'method', 'Billing'], [11, 'method', 'number']],
  );
  const kotlin = [
    'class Reader {',                  // 1
    '    fun read(path: String) {',    // 2
    '    }',                           // 3
    '}',                               // 4
    '',                                // 5
    'fun main() {',                    // 6
    '}',                               // 7
  ].join('\n');
  const kt = outlineSource(kotlin, 'Reader.kt');
  assert.equal(kt.language, 'kotlin');
  assert.deepEqual(
    kt.declarations.map((row) => [row.line, row.kind, row.name]),
    [[1, 'class', 'Reader'], [2, 'method', 'read'], [6, 'function', 'main']],
  );
});

test('lists Ruby modules, classes and methods', () => {
  const text = [
    '# frozen_string_literal: true',   // 1
    '',                                // 2
    'module Billing',                  // 3
    '  class Invoice',                 // 4
    '    def initialize(number)',      // 5
    '      @number = number',          // 6
    '    end',                         // 7
    '',                                // 8
    '    def valid?',                  // 9
    '      true',                      // 10
    '    end',                         // 11
    '  end',                           // 12
    'end',                             // 13
    '',                                // 14
    'def standalone',                  // 15
    'end',                             // 16
  ].join('\n');
  const outline = outlineSource(text, 'lib/billing.rb');
  assert.deepEqual(
    outline.declarations.map((row) => [row.line, row.kind, row.name]),
    [
      [3, 'class', 'Billing'],
      [4, 'class', 'Invoice'],
      [5, 'method', 'initialize'],
      [9, 'method', 'valid?'],
      [15, 'function', 'standalone'],
    ],
  );
});

test('lists Markdown headings as sections and ignores fenced code', () => {
  const text = [
    '# Tool',            // 1
    '',                  // 2
    'Prose.',            // 3
    '',                  // 4
    '## Usage',          // 5
    '',                  // 6
    '```sh',             // 7
    '# not a heading',   // 8
    '```',               // 9
    '',                  // 10
    '### Options',       // 11
  ].join('\n');
  const outline = outlineSource(text, 'README.md');
  assert.equal(outline.language, 'markdown');
  assert.deepEqual(
    outline.declarations.map((row) => [row.line, row.kind, row.name]),
    [[1, 'section', 'Tool'], [5, 'section', 'Usage'], [11, 'section', 'Options']],
  );
});

test('reports an unscanned language as empty rather than as no declarations', () => {
  const outline = outlineSource('body { color: red; }\n', 'app/globals.css');
  assert.deepEqual(outline, { language: 'unknown', declarations: [], truncated: false });
  assert.deepEqual(outlineSource('{}', 'package.json').declarations, []);
});

test('numbers lines from one across CRLF, CR and a missing final newline', () => {
  const crlf = outlineSource('# one\r\n\r\n## two\r\n', 'a.md');
  assert.deepEqual(crlf.declarations.map((row) => row.line), [1, 3]);
  const cr = outlineSource('# one\r\r## two', 'a.md');
  assert.deepEqual(cr.declarations.map((row) => row.line), [1, 3]);
  const noTrailing = outlineSource('def a():\n    pass\ndef b():\n    pass', 'a.py');
  assert.deepEqual(noTrailing.declarations.map((row) => row.line), [1, 3]);
  assert.deepEqual(outlineSource('', 'a.py'), { language: 'python', declarations: [], truncated: false });
});

test('caps the declaration list and the kept signature', () => {
  const lines = [];
  for (let index = 0; index < OUTLINE_DECLARATION_LIMIT + 20; index += 1) {
    lines.push(`def f${index}():`, '    pass');
  }
  const outline = outlineSource(lines.join('\n'), 'many.py');
  assert.equal(outline.declarations.length, OUTLINE_DECLARATION_LIMIT);
  assert.equal(outline.truncated, true);
  assert.equal(outline.declarations.at(-1).line, OUTLINE_DECLARATION_LIMIT * 2 - 1);
  const long = outlineSource(`def wide(${'a'.repeat(400)}):\n    pass\n`, 'wide.py');
  assert.equal(long.declarations[0].signature.length, OUTLINE_SIGNATURE_CHARS);
});

test('is deterministic for the same text and path', () => {
  const text = 'func (c *Command) Run() error {\n\treturn nil\n}\n';
  assert.deepEqual(outlineSource(text, 'a.go'), outlineSource(text, 'a.go'));
});
