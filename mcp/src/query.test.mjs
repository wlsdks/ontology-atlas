// Smoke tests for the filter DSL — runs as a plain node script via
// `node mcp/src/query.test.mjs`. Pattern matches the existing
// parser.test.mjs in this folder.

import { parseFilter } from './query.mjs';

const docs = [
  { slug: 'auth', frontmatter: { kind: 'domain', title: 'Auth', capabilities: ['login'] } },
  { slug: 'login', frontmatter: { kind: 'capability', domain: 'auth', elements: ['jwt'] } },
  { slug: 'signup', frontmatter: { kind: 'capability', domain: 'auth' } },
  { slug: 'jwt', frontmatter: { kind: 'element', domain: 'auth' } },
  { slug: 'README', frontmatter: { kind: 'vault-readme', title: 'README' } },
];

let pass = 0;
let fail = 0;
function test(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    fail += 1;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

console.log('parseFilter — equality');
test('kind=capability matches login + signup', () => {
  const { match } = parseFilter('kind=capability');
  const matched = docs.filter(match).map((d) => d.slug);
  if (JSON.stringify(matched) !== JSON.stringify(['login', 'signup'])) {
    throw new Error(`got ${matched.join(',')}`);
  }
});

test('slug=auth picks one', () => {
  const { match } = parseFilter('slug=auth');
  const matched = docs.filter(match).map((d) => d.slug);
  if (JSON.stringify(matched) !== JSON.stringify(['auth'])) {
    throw new Error(`got ${matched.join(',')}`);
  }
});

test('kind!=vault-readme excludes README', () => {
  const { match } = parseFilter('kind!=vault-readme');
  const matched = docs.filter(match).map((d) => d.slug);
  if (matched.includes('README')) throw new Error(`README leaked: ${matched.join(',')}`);
});

console.log('parseFilter — has() arrays');
test('has(elements) matches login (only one with elements)', () => {
  const { match } = parseFilter('has(elements)');
  const matched = docs.filter(match).map((d) => d.slug);
  if (JSON.stringify(matched) !== JSON.stringify(['login'])) {
    throw new Error(`got ${matched.join(',')}`);
  }
});

test('NOT has(elements) matches everything else', () => {
  const { match } = parseFilter('NOT has(elements)');
  const matched = docs.filter(match).map((d) => d.slug);
  if (JSON.stringify(matched) !== JSON.stringify(['auth', 'signup', 'jwt', 'README'])) {
    throw new Error(`got ${matched.join(',')}`);
  }
});

console.log('parseFilter — AND / OR composition');
test('kind=capability AND domain=auth picks both auth caps', () => {
  const { match } = parseFilter('kind=capability AND domain=auth');
  const matched = docs.filter(match).map((d) => d.slug);
  if (JSON.stringify(matched) !== JSON.stringify(['login', 'signup'])) {
    throw new Error(`got ${matched.join(',')}`);
  }
});

test('kind=capability AND NOT has(elements) flags signup as the gap', () => {
  const { match } = parseFilter('kind=capability AND NOT has(elements)');
  const matched = docs.filter(match).map((d) => d.slug);
  if (JSON.stringify(matched) !== JSON.stringify(['signup'])) {
    throw new Error(`got ${matched.join(',')}`);
  }
});

test('OR widens the result', () => {
  const { match } = parseFilter('kind=domain OR kind=element');
  const matched = docs.filter(match).map((d) => d.slug);
  if (JSON.stringify(matched) !== JSON.stringify(['auth', 'jwt'])) {
    throw new Error(`got ${matched.join(',')}`);
  }
});

console.log('parseFilter — quoted values');
test('title="Auth" works with quotes', () => {
  const { match } = parseFilter('title="Auth"');
  const matched = docs.filter(match).map((d) => d.slug);
  if (JSON.stringify(matched) !== JSON.stringify(['auth'])) {
    throw new Error(`got ${matched.join(',')}`);
  }
});

console.log('parseFilter — error cases');
test('empty filter throws', () => {
  try {
    parseFilter('');
    throw new Error('should have thrown');
  } catch (err) {
    if (!err.message.includes('empty')) throw err;
  }
});

test('invalid key throws', () => {
  try {
    parseFilter('1bad=value');
    throw new Error('should have thrown');
  } catch (err) {
    if (!err.message.includes('invalid key')) throw err;
  }
});

test('unterminated string throws', () => {
  try {
    parseFilter('title="Auth');
    throw new Error('should have thrown');
  } catch (err) {
    if (!err.message.includes('unterminated')) throw err;
  }
});

console.log('parseFilter — repr (debug)');
test('AST repr is human-readable', () => {
  const { repr } = parseFilter('kind=capability AND NOT has(elements)');
  if (repr !== '(kind = capability AND NOT has(elements))') {
    throw new Error(`got: ${repr}`);
  }
});

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
