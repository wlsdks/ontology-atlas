//! The module names a source file brings in, in every language a vault describes: JavaScript and
//! TypeScript `import ... from '...'`, `import '...'`, `import('...')` and `require('...')` (the
//! whole text is read, never a line, because a multi-line `import {` ... `} from '...'` is the
//! common shape); Python `import a.b` and `from a.b import c`; Rust `use a::b` and `mod b`; Go's
//! quoted paths inside `import (...)`; C-family `#include`; Ruby `require`.
//!
//! A witness for a declared dependency asks only whether a name is among these, so a name that
//! turns up elsewhere in the file (an identifier, a comment) never keeps an edge green.

use std::sync::LazyLock;

use regex::Regex;

fn pattern(text: &str) -> Regex {
    // The patterns are written here and checked by the tests below; none can fail to compile.
    Regex::new(text).unwrap_or_else(|_| unreachable!("specifier pattern {text}"))
}

static QUOTED_PATTERNS: LazyLock<[Regex; 4]> = LazyLock::new(|| {
    [
        pattern(r#"(?-u:\b)from\s*['"]([^'"\n]+)['"]"#),
        pattern(r#"(?-u:\b)import\s*\(\s*['"]([^'"\n]+)['"]"#),
        pattern(r#"(?-u:\b)import\s+['"]([^'"\n]+)['"]"#),
        pattern(r#"(?-u:\b)require(?:_relative)?\s*(?:\(\s*)?['"]([^'"\n]+)['"]"#),
    ]
});
static RUST_DECLARATION: LazyLock<Regex> = LazyLock::new(|| {
    pattern(r"(?m)^[ \t]*(?:pub(?:\([^)\n]*\))?\s+)?(?:use|mod)\s+([\w:{}\s,]*?[\w:{},])\s*;")
});
static RUST_KEYWORD: LazyLock<Regex> = LazyLock::new(|| pattern(r"(?-u:\b)(?:use|mod)(?-u:\b)"));
static C_INCLUDE: LazyLock<Regex> =
    LazyLock::new(|| pattern(r#"(?m)^[ \t]*#\s*include\s*[<"]([^>"\n]+)[>"]"#));
static PYTHON_IMPORT: LazyLock<Regex> = LazyLock::new(|| {
    pattern(r"(?m)^[ \t]*(?:from\s+([A-Za-z0-9_.]+)\s+import(?-u:\b)|import\s+([A-Za-z0-9_.]+))")
});
static GO_IMPORT_BLOCK: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?m)^[ \t]*import\s*\(([^)]*)\)"));
static GO_NEXT_IMPORT: LazyLock<Regex> = LazyLock::new(|| pattern(r"\n[ \t]*import(?-u:\b)"));
static GO_QUOTED: LazyLock<Regex> = LazyLock::new(|| pattern(r#""([^"\n]+)""#));

/// Every specifier `text` names, in the order the patterns find them.
pub fn module_specifiers(text: &str) -> Vec<String> {
    let mut found = Vec::new();
    for pattern in QUOTED_PATTERNS.iter() {
        for captures in pattern.captures_iter(text) {
            found.extend(
                captures
                    .get(1)
                    .map(|specifier| specifier.as_str().to_string()),
            );
        }
    }
    for captures in RUST_DECLARATION.captures_iter(text) {
        // The captured run may not cross another `use` or `mod`: a statement that opens a second
        // one before its `;` is no declaration.
        if let Some(named) = captures
            .get(1)
            .filter(|named| !RUST_KEYWORD.is_match(named.as_str()))
        {
            found.push(named.as_str().to_string());
        }
    }
    for captures in C_INCLUDE.captures_iter(text) {
        found.extend(captures.get(1).map(|header| header.as_str().to_string()));
    }
    for captures in PYTHON_IMPORT.captures_iter(text) {
        for dotted in captures.iter().skip(1).flatten() {
            found.push(dotted.as_str().replace('.', "/"));
        }
    }
    for block in GO_IMPORT_BLOCK.captures_iter(text) {
        let Some(body) = block.get(1).map(|body| body.as_str()) else {
            continue;
        };
        if GO_NEXT_IMPORT.is_match(body) {
            continue;
        }
        for quoted in GO_QUOTED.captures_iter(body) {
            found.extend(quoted.get(1).map(|path| path.as_str().to_string()));
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_of_every_language_are_found_by_name_and_other_mentions_are_not() {
        let text = "import {\n  a,\n} from './order/placement';\nconst b = require('pkg');\nuse crate::order::{place, cancel};\n#include <stdio.h>\nfrom pkg.data import image\nimport (\n \"fmt\"\n \"net/http\"\n)\n// order/other is only mentioned\n";
        let found = module_specifiers(text);
        for expected in [
            "./order/placement",
            "pkg",
            "crate::order::{place, cancel}",
            "stdio.h",
            "pkg/data",
            "fmt",
            "net/http",
        ] {
            assert!(
                found.iter().any(|name| name == expected),
                "{expected} in {found:?}"
            );
        }
        assert!(
            !found.iter().any(|name| name.contains("other")),
            "{found:?}"
        );
    }
}
