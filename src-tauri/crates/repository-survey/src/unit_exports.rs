//! The names a unit's main files export, read from their text: what a person opening the unit
//! meets first.

use std::sync::LazyLock;

use regex::Regex;

use crate::js_pattern::js_regex;

/// A unit lists at most this many names.
pub const EXPORTS_PER_UNIT: usize = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Family {
    Script,
    Go,
    Python,
    Rust,
    Ruby,
    Jvm,
}

fn family_of(path: &str) -> Option<Family> {
    let extension = path
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_lowercase())?;
    match extension.as_str() {
        "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "mts" | "cts" | "vue" | "svelte" => {
            Some(Family::Script)
        }
        "go" => Some(Family::Go),
        "py" => Some(Family::Python),
        "rs" => Some(Family::Rust),
        "rb" => Some(Family::Ruby),
        "java" | "kt" | "kts" | "cs" | "scala" => Some(Family::Jvm),
        _ => None,
    }
}

static SCRIPT: LazyLock<[Regex; 3]> = LazyLock::new(|| {
    [
        js_regex(
            r"(?m)^export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|function\*?|enum)\s+([A-Za-z_$][\w$]*)",
        ),
        js_regex(r"(?m)^export\s+(?:declare\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)"),
        js_regex(r"(?m)^export\s+(?:declare\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)"),
    ]
});
static GO: LazyLock<[Regex; 3]> = LazyLock::new(|| {
    [
        js_regex(r"(?m)^type\s+([A-Z]\w*)\s+(?:struct|interface)\b"),
        js_regex(r"(?m)^func\s+([A-Z]\w*)\s*\("),
        js_regex(r"(?m)^type\s+([A-Z]\w*)\b"),
    ]
});
static PYTHON: LazyLock<[Regex; 2]> = LazyLock::new(|| {
    [
        js_regex(r"(?m)^class\s+([A-Za-z]\w*)"),
        js_regex(r"(?m)^def\s+([A-Za-z]\w*)"),
    ]
});
static RUST: LazyLock<[Regex; 2]> = LazyLock::new(|| {
    [
        js_regex(r"(?m)^pub\s+(?:async\s+)?(?:struct|enum|trait)\s+(\w+)"),
        js_regex(r"(?m)^pub\s+(?:async\s+)?fn\s+(\w+)"),
    ]
});
static RUBY: LazyLock<[Regex; 1]> =
    LazyLock::new(|| [js_regex(r"(?m)^\s*(?:class|module)\s+([A-Z]\w*)")]);
static JVM: LazyLock<[Regex; 1]> = LazyLock::new(|| {
    [js_regex(
        r"(?m)^\s*public\s+(?:final\s+|abstract\s+)*(?:class|interface|enum|record)\s+(\w+)",
    )]
});
static PYTHON_ALL_HEAD: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"(?m)^__all__[ \t]*=[ \t]*([\[(])"#));
static PYTHON_ALL_NAME: LazyLock<Regex> = LazyLock::new(|| js_regex(r#"['"]([A-Za-z_]\w*)['"]"#));

/// The names in a Python `__all__ = [...]`, or `None` when the file declares none.
fn python_all(text: &str) -> Option<Vec<String>> {
    let head = PYTHON_ALL_HEAD.captures(text)?;
    let whole = head.get(0)?;
    let opener = head.get(1)?.as_str();
    let start = whole.end();
    let closer = if opener == "[" { ']' } else { ')' };
    let end = start + text.get(start..)?.find(closer)?;
    let list = text.get(start..end)?;
    Some(
        PYTHON_ALL_NAME
            .captures_iter(list)
            .filter_map(|name| name.get(1).map(|name| name.as_str().to_string()))
            .collect(),
    )
}

/// The first public names `text` exports, at most [`EXPORTS_PER_UNIT`], each once, in the order
/// the patterns find them: a name that starts with an underscore is not public.
pub fn exports_of_text(path: &str, text: &str) -> Vec<String> {
    let Some(family) = family_of(path) else {
        return Vec::new();
    };
    let declared = (family == Family::Python)
        .then(|| python_all(text))
        .flatten();
    let found: Vec<String> = match declared {
        Some(names) => names,
        None => {
            let patterns: &[Regex] = match family {
                Family::Script => &*SCRIPT,
                Family::Go => &*GO,
                Family::Python => &*PYTHON,
                Family::Rust => &*RUST,
                Family::Ruby => &*RUBY,
                Family::Jvm => &*JVM,
            };
            patterns
                .iter()
                .flat_map(|pattern| {
                    pattern
                        .captures_iter(text)
                        .filter_map(|found| found.get(1).map(|name| name.as_str().to_string()))
                })
                .collect()
        }
    };
    let mut names: Vec<String> = Vec::new();
    for name in found {
        if name.starts_with('_') || names.contains(&name) {
            continue;
        }
        names.push(name);
        if names.len() == EXPORTS_PER_UNIT {
            break;
        }
    }
    names
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_exports_are_found_by_declaration_kind_in_the_order_of_the_patterns() {
        let text = "export type Id = string;\nexport const RATE = 1;\nexport function issue() {}\nexport default class Invoice {}\n";
        assert_eq!(
            exports_of_text("a.ts", text),
            ["issue", "Invoice", "RATE", "Id"]
        );
    }

    #[test]
    fn python_all_is_the_whole_answer_when_the_file_has_one() {
        let text = "class Hidden: ...\n__all__ = [\n  'Shown',\n  \"_private\",\n]\n";
        assert_eq!(exports_of_text("a.py", text), ["Shown"]);
    }

    #[test]
    fn a_unit_lists_six_names_and_never_a_private_one() {
        let text: String = (0..9).map(|n| format!("pub fn f{n}() {{}}\n")).collect();
        assert_eq!(
            exports_of_text("lib.rs", &format!("pub fn _x() {{}}\n{text}")).len(),
            6
        );
    }

    #[test]
    fn a_file_with_no_known_extension_exports_nothing() {
        assert!(exports_of_text("a.txt", "export class A {}").is_empty());
    }
}
