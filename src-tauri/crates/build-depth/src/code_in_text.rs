//! Whether a source file holds code at all, or only comments, a docstring, imports and re-exports.
//! A node whose `path:` lands on such a file points "where does this live" at nothing.

use std::sync::LazyLock;

use regex::Regex;

use crate::line_cites::pattern;

static TRIPLE_QUOTE: LazyLock<Regex> = LazyLock::new(|| pattern(r#"("""|''')"#));
static PYTHON_IMPORT_LIST: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?m)^[ \t]*from[ \t]+[A-Za-z0-9_.]+[ \t]+import[ \t]*\("));
static PYTHON_ALL: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?m)^__all__[ \t]*\+?=[ \t]*([\[(])"));
static HASH_COMMENT: LazyLock<Regex> = LazyLock::new(|| pattern(r"(?m)#.*$"));
static BLOCK_COMMENT: LazyLock<Regex> = LazyLock::new(|| pattern(r"/\*"));
static LINE_COMMENT: LazyLock<Regex> = LazyLock::new(|| pattern(r"(?m)(^|[^:])//.*$"));
static BRACED_IMPORT: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"(?m)^[ \t]*(?:import|export)[ \t]+(?:type[ \t]+)?\{"));
static FROM_CLAUSE: LazyLock<Regex> =
    LazyLock::new(|| pattern(r#"^[ \t]*from[ \t]*['"][^'"\n]+['"];?"#));
static CALLED_IMPORT: LazyLock<Regex> = LazyLock::new(|| pattern(r"(?m)^[ \t]*import[ \t]*\("));
static DECLARATIVE: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r#"^(?:import\s|from\s+[A-Za-z0-9_.]+\s+import\s|export\s+\*|export\s+(?:type\s+)?\{[^}]*\}\s*from\s|package\s+[A-Za-z0-9_]+|use\s+[A-Za-z0-9_:{}, *]+;|(?:pub\s+)?mod\s+[A-Za-z0-9_]+;|['"]use strict['"];?|module\.exports\s*=\s*require\(|[)\]};,]+$)"#,
    )
});

/// How a span closes: with fixed text, or with the text its opener chose.
enum Closer<'a> {
    Text(&'a str),
    ByOpener(fn(&regex::Captures<'_>) -> &'static str),
}

/// `text` without each span that starts at a match of `opener` and ends at the first closer after
/// it; when `after` is given, the span counts only if it matches right behind the closer, and
/// takes that match too. An opener without a closer stays as written. Each span is found in one
/// forward pass, so an unclosed opener never rescans the file.
fn without_spans(text: &str, opener: &Regex, closer: &Closer<'_>, after: Option<&Regex>) -> String {
    let mut output = String::new();
    let mut kept = 0;
    let mut from = 0;
    let mut refused: Vec<usize> = Vec::new();
    while let Some(captures) = opener.captures_at(text, from) {
        let Some(whole) = captures.get(0) else { break };
        if whole.is_empty() {
            from = whole.end() + 1;
            if from > text.len() {
                break;
            }
            continue;
        }
        from = whole.end();
        let close = match closer {
            Closer::Text(close) => *close,
            Closer::ByOpener(choose) => choose(&captures),
        };
        let Some(found) = text.get(whole.end()..).and_then(|rest| rest.find(close)) else {
            continue;
        };
        let mut end = whole.end() + found + close.len();
        if let Some(after) = after {
            if refused.contains(&end) {
                continue;
            }
            match after.find_at(text, end).filter(|tail| tail.start() == end) {
                Some(tail) => end = tail.end(),
                None => {
                    refused.push(end);
                    continue;
                }
            }
        }
        output.push_str(text.get(kept..whole.start()).unwrap_or(""));
        kept = end;
        from = end;
    }
    output.push_str(text.get(kept..).unwrap_or(""));
    output
}

fn triple_quote_closer(captures: &regex::Captures<'_>) -> &'static str {
    if captures.get(1).is_some_and(|quote| quote.as_str() == "'''") {
        "'''"
    } else {
        "\"\"\""
    }
}

fn bracket_closer(captures: &regex::Captures<'_>) -> &'static str {
    if captures.get(1).is_some_and(|open| open.as_str() == "[") {
        "]"
    } else {
        ")"
    }
}

/// Comments, docstrings, imports and re-exports removed; what is left is code.
pub(crate) fn has_code(text: &str, path: &str) -> bool {
    let extension = path
        .rsplit_once('.')
        .map_or(String::new(), |(_, extension)| extension.to_ascii_lowercase());
    let rest = if extension == "py" || extension == "rb" {
        let rest = without_spans(
            text,
            &TRIPLE_QUOTE,
            &Closer::ByOpener(triple_quote_closer),
            None,
        );
        let rest = without_spans(&rest, &PYTHON_IMPORT_LIST, &Closer::Text(")"), None);
        let rest = without_spans(&rest, &PYTHON_ALL, &Closer::ByOpener(bracket_closer), None);
        HASH_COMMENT.replace_all(&rest, "").into_owned()
    } else {
        let rest = without_spans(text, &BLOCK_COMMENT, &Closer::Text("*/"), None);
        let rest = LINE_COMMENT.replace_all(&rest, "$1").into_owned();
        let rest = without_spans(&rest, &BRACED_IMPORT, &Closer::Text("}"), Some(&FROM_CLAUSE));
        without_spans(&rest, &CALLED_IMPORT, &Closer::Text(")"), None)
    };
    rest.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .any(|line| !DECLARATIVE.is_match(line))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_file_of_comments_imports_and_re_exports_holds_no_code() {
        let barrel = "// public surface\nimport { a } from './a';\nexport { a, b } from './b';\nexport * from './c';\n/* block\n comment */\n";
        assert!(!has_code(barrel, "src/index.ts"));
        assert!(has_code("import { a } from './a';\nexport const b = a + 1;\n", "src/b.ts"));
        let package = "\"\"\"Docs.\"\"\"\nfrom .a import (\n    x,\n    y,\n)\n__all__ = [\n  'x',\n]\n# done\n";
        assert!(!has_code(package, "pkg/__init__.py"));
        assert!(has_code("\"\"\"Docs.\"\"\"\ndef run():\n    pass\n", "pkg/run.py"));
    }
}
