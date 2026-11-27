/**
 * One table, two paths to one normalizer: `validate_vault` imports
 * `mcp/src/drift/comparable-code.mjs` and the map imports it through
 * `src/shared/lib/git/comparable-code.mjs`. Each case names two revisions of one
 * cited file and whether they are the same code, which decides whether a concept
 * citing that file stays current. `same: true` hides a change from the owner, so a
 * case only says so when no behaviour can differ.
 */

export const COMPARABLE_CODE_CASES = Object.freeze([
  {
    name: 'a comment-only change is the same code',
    path: 'src/pay.ts',
    before: '// Pays the order.\nexport function pay() {\n  return 1;\n}\n',
    after: '// Pays the order once the cart is locked.\nexport function pay() {\n  return 1; /* one */\n}\n',
    same: true,
  },
  {
    name: 'a block comment rewrapped and a blank line added is the same code',
    path: 'mcp/src/schema.mjs',
    before: '/**\n * Vault kind schema: the shape add_concept applies.\n */\nconst a = 1;\n',
    after: '/** Vault kind schema: the shape add_concepts applies. */\n\nconst a = 1;\n',
    same: true,
  },
  {
    name: 'a changed number is not the same code',
    path: 'src/pay.ts',
    before: 'export const LIMIT = 10;\n',
    after: 'export const LIMIT = 11;\n',
    same: false,
  },
  {
    name: 'a change after // inside a string is not a comment',
    path: 'src/links.ts',
    before: 'const home = "https://example.com/a";\n',
    after: 'const home = "https://example.com/b";\n',
    same: false,
  },
  {
    name: 'a change after # inside a Python string is not a comment',
    path: 'tools/tag.py',
    before: 'TAG = "issue #1"  # first\n',
    after: 'TAG = "issue #2"  # second\n',
    same: false,
  },
  {
    name: 'a Python comment-only change is the same code',
    path: 'tools/tag.py',
    before: '# Tags issues.\nTAG = "issue #1"\n',
    after: '# Tags every issue.\nTAG = "issue #1"  # stable\n',
    same: true,
  },
  {
    name: '/* */ inside a template literal is text, not a comment',
    path: 'src/sql.ts',
    before: 'const q = `select /* hint a */ 1 from ${table}`;\n',
    after: 'const q = `select /* hint b */ 1 from ${table}`;\n',
    same: false,
  },
  {
    name: 'a comment inside a template expression is a comment',
    path: 'src/sql.ts',
    before: 'const q = `a ${x /* old */} b`;\n',
    after: 'const q = `a ${x /* new */} b`;\n',
    same: true,
  },
  {
    name: '// inside a regex literal is text',
    path: 'src/url.js',
    before: 'const scheme = /^https?:\\/\\/a/;\nconst any = /[/*]a/;\n',
    after: 'const scheme = /^https?:\\/\\/b/;\nconst any = /[/*]b/;\n',
    same: false,
  },
  {
    name: 'a JSX comment child is a comment',
    path: 'src/ui/Panel.tsx',
    before: 'export const Panel = () => (\n  <div>\n    {/* why the panel is short */}\n    <p>Don\'t scroll</p>\n  </div>\n);\n',
    after: 'export const Panel = () => (\n  <div>\n    <p>Don\'t scroll</p>\n  </div>\n);\n',
    same: true,
  },
  {
    name: 'a URL in JSX text is text',
    path: 'src/ui/Link.tsx',
    before: 'export const L = () => <p>See http://example.com/a for more</p>;\n',
    after: 'export const L = () => <p>See http://example.com/b for more</p>;\n',
    same: false,
  },
  {
    name: 'a moved import path is the same code',
    path: 'src/ui/Inspector.tsx',
    before: "'use client';\nimport { pick, isRuntime } from '@/shared/lib/vault-fs';\nexport const run = () => pick(isRuntime());\n",
    after:
      "'use client';\nimport { pick } from '@/shared/lib/native/project-source';\nimport {\n  isRuntime, // the app only\n} from '@/shared/lib/native/runtime';\nexport const run = () => pick(isRuntime());\n",
    same: true,
  },
  {
    // Ignored by owner decision (spec Behaviour 2): a path move alone rarely changes
    // behaviour, though a side-effect import pointing elsewhere can.
    name: 'a moved re-export or bare import path is ignored',
    path: 'src/index.ts',
    before: "export * from './a';\nexport { b } from './b';\nimport './side-effect.css';\nexport const c = 1;\n",
    after: "export * from './a2';\nexport type { b } from './b2';\nimport './styles/side-effect.css';\nexport const c = 1;\n",
    same: true,
  },
  {
    name: 'a dynamic import is code',
    path: 'src/load.ts',
    before: "const m = await import('./a');\n",
    after: "const m = await import('./b');\n",
    same: false,
  },
  {
    name: 'a changed export that is not a re-export is code',
    path: 'src/index.ts',
    before: 'export { a };\n',
    after: 'export { a, b };\n',
    same: false,
  },
  {
    name: 'a Rust use reorganized is the same code',
    path: 'src-tauri/src/git/evidence.rs',
    before: 'use std::fs;\nuse super::runner::run_git;\n\nfn a() {}\n',
    after: 'use std::{fs, path::Path};\npub(crate) use super::super::runner::{run_git, validate};\n\nfn a() {}\n',
    same: true,
  },
  {
    name: 'nested Rust block comments close where Rust closes them',
    path: 'src/lib.rs',
    before: '/* outer /* inner */ still comment */ fn a() -> u8 { 1 }\n',
    after: '/* outer /* inner changed */ still a comment */ fn a() -> u8 { 1 }\n',
    same: true,
  },
  {
    name: 'a Rust raw string keeps its // and its quotes',
    path: 'src/lib.rs',
    before: 'const U: &str = r#"say "hi" // a"#;\n',
    after: 'const U: &str = r#"say "hi" // b"#;\n',
    same: false,
  },
  {
    name: 'a Rust lifetime does not open a string',
    path: 'src/lib.rs',
    before: "fn a<'a>(x: &'a str) -> &'a str { x } // old\nconst C: char = '\"';\n",
    after: "fn a<'a>(x: &'a str) -> &'a str { x } // new\nconst C: char = '\"';\n",
    same: true,
  },
  {
    name: 'an unknown extension compares whitespace only',
    path: 'docs/notes.txt',
    before: 'alpha // one\n',
    after: 'alpha   //   one\n\n',
    same: true,
  },
  {
    name: 'an unknown extension keeps its comment-looking text',
    path: 'docs/notes.txt',
    before: 'alpha // one\n',
    after: 'alpha // two\n',
    same: false,
  },
  {
    name: 'plain CSS has no line comment: url(http://...) is a value',
    path: 'app/styles/a.css',
    before: '.a { background: url(http://example.com/a.png); }\n',
    after: '.a { background: url(http://example.com/b.png); }\n',
    same: false,
  },
  {
    name: 'a shell $# is not a comment',
    path: 'scripts/run.sh',
    before: 'if [ $# -gt 1 ]; then echo hi; fi # old\n',
    after: 'if [ $# -gt 2 ]; then echo hi; fi # new\n',
    same: false,
  },
  {
    name: 'a YAML block scalar keeps its # lines',
    path: '.github/workflows/ci.yml',
    before: 'run: |\n  # Title A\n  echo a\nname: x # old\n',
    after: 'run: |\n  # Title B\n  echo a\nname: x # new\n',
    same: false,
  },
  {
    name: 'a YAML trailing comment is a comment',
    path: '.github/workflows/ci.yml',
    before: "name: 'a # b' # old\n",
    after: "name: 'a # b' # new\n",
    same: true,
  },
  {
    name: 'an unterminated string falls back to whitespace only',
    path: 'src/broken.ts',
    before: 'const a = "open // one\n',
    after: 'const a = "open // two\n',
    same: false,
  },
]);
