/**
 * One table, two paths to one normalizer: `validate_vault` imports
 * `mcp/src/drift/comparable-code.mjs` and the map imports it through
 * `src/shared/lib/git/comparable-code.mjs`. Each case names two revisions of one
 * cited file and whether they are the same code, which decides whether a concept
 * citing that file stays current. `same: true` hides a change from the owner, so a
 * case only says so when no behaviour can differ, or when the spec names the miss
 * as accepted (`accepted`).
 */

const exportList = (comment) =>
  `const a = 1;\nexport {\n${Array.from({ length: 30 }, (_, i) => `  name${i}, // ${comment}\n`).join('')}};\n`;

export const COMPARABLE_CODE_CASES = Object.freeze([
  // Comments and layout.
  { name: 'a comment-only change is the same code', path: 'src/pay.ts', before: '// Pays the order.\nexport function pay() {\n  return 1;\n}\n', after: '// Pays the order once the cart is locked.\nexport function pay() {\n  return 1; /* one */\n}\n', same: true },
  { name: 'a block comment rewrapped and a blank line added is the same code', path: 'mcp/src/schema.mjs', before: '/**\n * Vault kind schema: the shape add_concept applies.\n */\nconst a = 1;\n', after: '/** Vault kind schema: the shape add_concepts applies. */\n\nconst a = 1;\n', same: true },
  { name: 'a changed number is not the same code', path: 'src/pay.ts', before: 'export const LIMIT = 10;\n', after: 'export const LIMIT = 11;\n', same: false },
  { name: 'a local export list with a comment per name is code, read in linear time', path: 'src/index.ts', before: exportList('why this one is public'), after: exportList('why it is exported'), same: true },
  { name: 'a JSX comment child is a comment', path: 'src/ui/Panel.tsx', before: "export const Panel = () => (\n  <div>\n    {/* why the panel is short */}\n    <p>Don't scroll</p>\n  </div>\n);\n", after: "export const Panel = () => (\n  <div>\n    <p>Don't scroll</p>\n  </div>\n);\n", same: true },
  { name: 'an empty block holding a comment is still a block', path: 'a.ts', before: 'if (locked) {/* handled above */}\nrefund(order);\n', after: 'if (locked)\nrefund(order);\n', same: false },
  { name: 'a while with a commented empty body is still a loop body', path: 'a.js', before: 'while (busy()) {/* spin */}\ncleanup();\n', after: 'while (busy())\ncleanup();\n', same: false },
  { name: 'an else with a commented empty body is still a block', path: 'a.js', before: 'if (a) x(); else {/* nothing */}\ny();\n', after: 'if (a) x(); else\ny();\n', same: false },
  { name: 'a kept directive comment is code: triple-slash reference', path: 'a.ts', before: '/// <reference types="node" />\nexport const a = 1;\n', after: '/// <reference types="bun" />\nexport const a = 1;\n', same: false },
  { name: 'a kept directive comment is code: test environment', path: 'a.test.ts', before: '// @vitest-environment jsdom\nexport const a = 1;\n', after: '// @vitest-environment node\nexport const a = 1;\n', same: false },
  { name: 'a kept directive comment is code: ts-nocheck', path: 'a.ts', before: '// @ts-nocheck\nexport const a: number = "x";\n', after: 'export const a: number = "x";\n', same: false },
  { name: 'a removed use client directive is code', path: 'a.tsx', before: "'use client';\nexport const a = 1;\n", after: 'export const a = 1;\n', same: false },

  // Whitespace.
  { name: 'whitespace inside a string literal is kept', path: 'a.ts', before: "const parts = text.split(' ');\n", after: "const parts = text.split('');\n", same: false },
  { name: 'a space between two operators is kept', path: 'a.js', before: 'x = a - -b;\n', after: 'x = a-- - b;\n', same: false },
  { name: 'a CSS descendant combinator is kept', path: 'a.css', before: '.card .title { color: red; }\n', after: '.card.title { color: red; }\n', same: false },
  { name: 'Python indentation is kept', path: 'a.py', before: 'if x:\n    a()\n    b()\n', after: 'if x:\n    a()\nb()\n', same: false },
  { name: 'YAML nesting is kept', path: 'ci.yml', before: 'jobs:\n  build:\n    steps: []\nenv:\n  X: 1\n', after: 'jobs:\n  build:\n    steps: []\n    env:\n      X: 1\n', same: false },
  { name: 'YAML key:value is not key: value', path: 'a.yml', before: 'a: b\n', after: 'a:b\n', same: false },
  { name: 'a line break after return is kept in JS', path: 'a.js', before: 'function f() {\n  return\n  x;\n}\n', after: 'function f() {\n  return x;\n}\n', same: false },
  { name: 'a wrapped call is the same code in a free-form language', path: 'a.ts', before: 'pay(order, card);\n', after: 'pay(order,\n    card);\n', same: true },

  // Literals that hold comment syntax.
  { name: 'a change after // inside a string is not a comment', path: 'src/links.ts', before: 'const home = "https://example.com/a";\n', after: 'const home = "https://example.com/b";\n', same: false },
  { name: 'a change after # inside a Python string is not a comment', path: 'tools/tag.py', before: 'TAG = "issue #1"  # first\n', after: 'TAG = "issue #2"  # second\n', same: false },
  { name: 'a Python comment-only change is the same code', path: 'tools/tag.py', before: '# Tags issues.\nTAG = "issue #1"\n', after: '# Tags every issue.\nTAG = "issue #1"  # stable\n', same: true },
  { name: 'a Python type comment is code', path: 'a.py', before: 'x = []  # type: List[int]\n', after: 'x = []  # type: List[str]\n', same: false },
  { name: '/* */ inside a template literal is text, not a comment', path: 'src/sql.ts', before: 'const q = `select /* hint a */ 1 from ${table}`;\n', after: 'const q = `select /* hint b */ 1 from ${table}`;\n', same: false },
  { name: 'a comment inside a template expression is a comment', path: 'src/sql.ts', before: 'const q = `a ${x /* old */} b`;\n', after: 'const q = `a ${x /* new */} b`;\n', same: true },
  { name: 'a nested template keeps its //', path: 'a.ts', before: 'const a = `x ${`y // old ${z}`} w`;\n', after: 'const a = `x ${`y // new ${z}`} w`;\n', same: false },
  { name: '// inside a regex literal is text', path: 'src/url.js', before: 'const scheme = /^https?:\\/\\/a/;\nconst any = /[/*]a/;\n', after: 'const scheme = /^https?:\\/\\/b/;\nconst any = /[/*]b/;\n', same: false },
  { name: 'a regex after an if head keeps its //', path: 'a.js', before: 'if (ok) /[//]old/.test(s) && go();\n', after: 'if (ok) /[//]new/.test(s) && go();\n', same: false },
  { name: 'a string right after return in minified code is a string', path: 'a.js', before: 'function f(){return"a // b"}\n', after: 'function f(){return"a // c"}\n', same: false },
  { name: 'a URL in JSX text is text', path: 'src/ui/Link.tsx', before: 'export const L = () => <p>See http://example.com/a for more</p>;\n', after: 'export const L = () => <p>See http://example.com/b for more</p>;\n', same: false },
  { name: 'JSX text after a spaced // is text', path: 'a.tsx', before: 'export const A = () => <p>run it // then wait 5 minutes</p>;\n', after: 'export const A = () => <p>run it // then delete everything</p>;\n', same: false },
  { name: 'a glob in JSX text does not open a block comment', path: 'a.tsx', before: 'export const A = () => <code>src/*.ts</code>;\nexport const LIMIT = 10;\n/** doc */\nexport const B = 1;\n', after: 'export const A = () => <code>src/*.ts</code>;\nexport const LIMIT = 99999;\n/** doc */\nexport const B = 1;\n', same: false },
  { name: 'a JSX attribute holding // is a string', path: 'a.tsx', before: 'const a = <a href="//old.example">x</a>;\n', after: 'const a = <a href="//new.example">x</a>;\n', same: false },
  { name: 'a JSX attribute after a self-closing tag is a string', path: 'a.tsx', before: 'const a = <><B c={x} /> <a href="/x" title="y // old">t</a></>;\n', after: 'const a = <><B c={x} /> <a href="/x" title="y // new">t</a></>;\n', same: false },

  // Interpolations that nest quotes fall back to exact lines.
  { name: 'Kotlin: a nested string in a template', path: 'a.kt', before: 'val u = "${base ?: "https://old.example"}/path"\n', after: 'val u = "${base ?: "https://new.example"}/path"\n', same: false },
  { name: 'Kotlin: a map lookup with a URL in a template', path: 'a.kt', before: 'val base = "${env["BASE"] ?: "https://old.example"}/v1"\n', after: 'val base = "${env["BASE"] ?: "https://new.example"}/v1"\n', same: false },
  { name: 'Kotlin: a raw string ending in a quote', path: 'a.kt', before: 'val s = """a"""" + "// old"\n', after: 'val s = """a"""" + "// new"\n', same: false },
  { name: 'Kotlin: a char literal holding a quote', path: 'a.kt', before: "val c = '\"'; val s = \"// old\"\n", after: "val c = '\"'; val s = \"// new\"\n", same: false },
  { name: 'Swift: a nested string in an interpolation', path: 'a.swift', before: 'let u = "\\(base ?? "https://old.example")/p"\n', after: 'let u = "\\(base ?? "https://new.example")/p"\n', same: false },
  { name: 'shell: nested quotes in a command substitution', path: 'a.sh', before: 'log="$(git log --format="%h # %s")"\n', after: 'log="$(git log --format="%h # %an %ae")"\n', same: false },
  { name: 'Python: an f-string with nested quotes', path: 'a.py', before: 'x = f"{d["a # b"]}"\n', after: 'x = f"{d["a # c"]}"\n', same: false },
  { name: 'Ruby: an interpolation with nested quotes', path: 'a.rb', before: 'x = "#{h["a # b"]}"\n', after: 'x = "#{h["a # c"]}"\n', same: false },
  { name: 'Ruby: a regex holding a quote', path: 'a.rb', before: 'clean = s.gsub(/"/, "")\nputs "width: 10px # of the card"\nx = "end"\n', after: 'clean = s.gsub(/"/, "")\nputs "width: 10px # of the page, and delete it"\nx = "end"\n', same: false },
  { name: 'C#: an interpolated string with nested quotes', path: 'a.cs', before: 'var u = $"{d["k"] ?? "http://old"}";\n', after: 'var u = $"{d["k"] ?? "http://new"}";\n', same: false },
  { name: 'Dart: an interpolation with nested quotes', path: 'a.dart', before: 'var u = "${m["k"] ?? "http://old"}";\n', after: 'var u = "${m["k"] ?? "http://new"}";\n', same: false },
  { name: 'Scala: an interpolation with nested quotes', path: 'a.scala', before: 'val u = s"${m.getOrElse("k", "http://old")}"\n', after: 'val u = s"${m.getOrElse("k", "http://new")}"\n', same: false },

  // Other languages.
  { name: 'Go: a cgo preamble comment is code', path: 'a.go', before: 'package a\n\n// #define LIMIT 10\nimport "C"\n', after: 'package a\n\n// #define LIMIT 99\nimport "C"\n', same: false },
  { name: 'Java: a text block keeps its //', path: 'a.java', before: 'String s = """\n  // old\n  """;\n', after: 'String s = """\n  // new\n  """;\n', same: false },
  { name: 'Java: a char literal holding a quote', path: 'a.java', before: "char c = '\"'; String s = \"// old\";\n", after: "char c = '\"'; String s = \"// new\";\n", same: false },
  { name: 'nested Rust block comments close where Rust closes them', path: 'src/lib.rs', before: '/* outer /* inner */ still comment */ fn a() -> u8 { 1 }\n', after: '/* outer /* inner changed */ still a comment */ fn a() -> u8 { 1 }\n', same: true },
  { name: 'a Rust raw string keeps its // and its quotes', path: 'src/lib.rs', before: 'const U: &str = r#"say "hi" // a"#;\n', after: 'const U: &str = r#"say "hi" // b"#;\n', same: false },
  { name: 'a Rust lifetime does not open a string', path: 'src/lib.rs', before: "fn a<'a>(x: &'a str) -> &'a str { x } // old\nconst C: char = '\"';\n", after: "fn a<'a>(x: &'a str) -> &'a str { x } // new\nconst C: char = '\"';\n", same: true },
  { name: 'Rust: a lifetime then a char literal', path: 'a.rs', before: "fn f<'a>(x: &'a u8) -> char { '/' } // a\nconst S: &str = \"// old\";\n", after: "fn f<'a>(x: &'a u8) -> char { '/' } // b\nconst S: &str = \"// new\";\n", same: false },
  { name: 'Rust: byte and raw strings', path: 'a.rs', before: 'const A: &[u8] = b"// old";\nconst B: &str = r"// old";\n', after: 'const A: &[u8] = b"// new";\nconst B: &str = r"// new";\n', same: false },
  { name: 'Rust: a doc attribute string', path: 'a.rs', before: '#[doc = "// old"]\nfn a() {}\n', after: '#[doc = "// new"]\nfn a() {}\n', same: false },
  { name: 'TOML: # inside a string', path: 'a.toml', before: 'a = "x # old"\n', after: 'a = "x # new"\n', same: false },
  { name: 'YAML: a trailing comment is a comment', path: '.github/workflows/ci.yml', before: "name: 'a # b' # old\n", after: "name: 'a # b' # new\n", same: true },
  { name: 'YAML: a plain scalar comment is a comment', path: 'a.yml', before: 'run: echo a # old\n', after: 'run: echo a # new\n', same: true },
  { name: 'YAML: a block scalar keeps its # lines', path: '.github/workflows/ci.yml', before: 'run: |\n  # Title A\n  echo a\nname: x # old\n', after: 'run: |\n  # Title B\n  echo a\nname: x # new\n', same: false },
  { name: 'YAML: a URL fragment is text', path: 'a.yml', before: 'url: http://x/#old\n', after: 'url: http://x/#new\n', same: false },
  { name: 'YAML: a double-quoted multi-line scalar keeps its #', path: 'a.yml', before: 'a: "x\n  # old"\n', after: 'a: "x\n  # new"\n', same: false },
  { name: 'YAML: a comment after a folded scalar is a comment', path: 'a.yml', before: 'a: >\n  text\nb: c #x\n', after: 'a: >\n  text\nb: c #y\n', same: true },
  { name: 'shell: ${#x} is not a comment', path: 'a.sh', before: 'n=${#old}\n', after: 'n=${#new}\n', same: false },
  { name: 'shell: $# is not a comment', path: 'scripts/run.sh', before: 'if [ $# -gt 1 ]; then echo hi; fi # old\n', after: 'if [ $# -gt 2 ]; then echo hi; fi # new\n', same: false },
  { name: 'shell: an escaped quote opens no string', path: 'a.sh', before: "echo it\\'s # old\necho 'x # y'\n", after: "echo it\\'s # old\necho 'x # z'\n", same: false },
  { name: 'Python: a triple-quoted string keeps its #', path: 'a.py', before: 's = """\n# old\n"""\n', after: 's = """\n# new\n"""\n', same: false },
  { name: 'Ruby: a frozen string literal magic comment is code', path: 'a.rb', before: '# frozen_string_literal: true\nx = 1\n', after: 'x = 1\n', same: false },
  { name: 'plain CSS has no line comment: url(http://...) is a value', path: 'app/styles/a.css', before: '.a { background: url(http://example.com/a.png); }\n', after: '.a { background: url(http://example.com/b.png); }\n', same: false },
  { name: 'CSS: an unquoted URL in an attribute selector', path: 'a.css', before: 'a[href^=http://old] { c: d }\n', after: 'a[href^=http://new] { c: d }\n', same: false },
  { name: 'SCSS: url(//...) is a value', path: 'a.scss', before: '.a { background: url(//old.example/a.png); }\n', after: '.a { background: url(//new.example/a.png); }\n', same: false },
  { name: 'SCSS: an interpolated variable', path: 'a.scss', before: '$u: "http://old";\n.a { b: #{$u}; }\n', after: '$u: "http://new";\n.a { b: #{$u}; }\n', same: false },
  { name: 'SCSS: an unquoted URL in an attribute selector', path: 'a.scss', before: 'a[href^=http://old] { c: d }\n', after: 'a[href^=http://new] { c: d }\n', same: false },
  { name: 'SCSS: an unquoted @import url', path: 'a.scss', before: '@import url(http://old/a.css);\n', after: '@import url(http://new/a.css);\n', same: false },
  { name: 'C: an include is code', path: 'a.c', before: '#include <old.h>\nint a;\n', after: '#include <new.h>\nint a;\n', same: false },
  { name: 'C: a char literal holding a quote', path: 'a.c', before: "char q = '\"'; const char *s = \"// old\";\n", after: "char q = '\"'; const char *s = \"// new\";\n", same: false },
  { name: 'C: a // comment continued by a backslash', path: 'a.c', before: '// comment \\\nint a = 1;\nint b;\n', after: '// comment \\\nint a = 2;\nint b;\n', same: false },
  { name: 'C: a macro holding a string', path: 'a.c', before: '#define U "http://old"\n', after: '#define U "http://new"\n', same: false },
  { name: 'C++: digit separators', path: 'a.cpp', before: "int a = 1'000; const char *s = \"// old\"; int b = 2'000;\n", after: "int a = 1'000; const char *s = \"// new\"; int b = 2'000;\n", same: false },
  { name: 'C: #if 0 is code', path: 'a.c', before: '#if 0\nold\n#endif\n', after: '#if 0\nnew\n#endif\n', same: false },
  { name: 'C: a name ending in R before a string is not a raw string', path: 'a.c', before: 'puts(STR"x"); // old\n', after: 'puts(STR"x"); // new\n', same: true },
  { name: 'an unknown extension compares its exact lines', path: 'docs/notes.txt', before: 'alpha // one\n', after: 'alpha // one   \n\n', same: true },
  { name: 'an unknown extension keeps its inner whitespace', path: 'docs/notes.txt', before: 'alpha // one\n', after: 'alpha   //   one\n', same: false },
  { name: 'an unknown extension keeps its comment-looking text', path: 'docs/notes.txt', before: 'alpha // one\n', after: 'alpha // two\n', same: false },
  { name: 'an unterminated string falls back to exact lines', path: 'src/broken.ts', before: 'const a = "open // one\n', after: 'const a = "open // two\n', same: false },

  // Imports and re-exports: binding names are code, the module is not.
  { name: 'a moved import path is the same code', path: 'src/ui/Inspector.tsx', before: "'use client';\nimport { pick, isRuntime } from '@/shared/lib/vault-fs';\nexport const run = () => pick(isRuntime());\n", after: "'use client';\nimport { pick } from '@/shared/lib/native/project-source';\nimport {\n  isRuntime, // the app only\n} from '@/shared/lib/native/runtime';\nexport const run = () => pick(isRuntime());\n", same: true },
  { name: 'a named import retargeted to another module', path: 'a.ts', before: "import { parse } from './parser-v1';\nexport const run = (s) => parse(s);\n", after: "import { parse } from './parser-v2';\nexport const run = (s) => parse(s);\n", same: true, accepted: 'same names retargeted to another module' },
  { name: 'an import binding swapped under the same local name', path: 'a.ts', before: "import { strict as check } from './rules';\nexport const run = (s) => check(s);\n", after: "import { loose as check } from './rules';\nexport const run = (s) => check(s);\n", same: false },
  { name: 'a barrel that gains a public export', path: 'src/features/pay/index.ts', before: "export { pay } from './pay';\n", after: "export { pay } from './pay';\nexport { refundEverything } from './refund';\nexport * from './internal';\n", same: false },
  { name: 'a type-only re-export is not a value re-export', path: 'src/index.ts', before: "export { b } from './b';\n", after: "export type { b } from './b';\n", same: false },
  { name: 'a moved re-export or bare import path', path: 'src/index.ts', before: "export * from './a';\nexport { b } from './b';\nimport './side-effect.css';\nexport const c = 1;\n", after: "export * from './a2';\nexport { b } from './b2';\nimport './styles/side-effect.css';\nexport const c = 1;\n", same: true, accepted: 'same names retargeted to another module' },
  { name: 'a dynamic import is code', path: 'src/load.ts', before: "const m = await import('./a');\n", after: "const m = await import('./b');\n", same: false },
  { name: 'a changed export that is not a re-export is code', path: 'src/index.ts', before: 'export { a };\n', after: 'export { a, b };\n', same: false },
  { name: 'a Rust use regrouped is the same code', path: 'src-tauri/src/git/evidence.rs', before: 'use std::fs;\nuse std::path::Path;\n\nfn a() {}\n', after: 'use std::{\n    fs, // files\n    path::Path,\n};\n\nfn a() {}\n', same: true },
  { name: 'a Rust use retargeted', path: 'lib.rs', before: 'use v1::parse;\nfn x() { parse() }\n', after: 'use v2::parse;\nfn x() { parse() }\n', same: true, accepted: 'same names retargeted to another module' },
  { name: 'a Rust pub use adds public surface', path: 'lib.rs', before: 'pub use a::Safe;\nfn x() {}\n', after: 'pub use a::Safe;\npub use internal::Secret;\nfn x() {}\n', same: false },
  { name: 'a Rust use made public', path: 'lib.rs', before: 'use a::Safe;\nfn x() {}\n', after: 'pub(crate) use a::Safe;\nfn x() {}\n', same: false },
]);
