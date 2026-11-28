//! Which source lines decide something: a condition, a branch, a throw or a literal default, and
//! the literal constants a file declares at module level. A symbol's context is ranked by them.

use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;
use repository_survey::{is_js_space, js_regex};

/// A decisive line longer than this (in UTF-16 units) is generated or minified; only its head is
/// examined.
const DECIDE_UNITS: usize = 2000;

static CONDITION: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"\b(?:if|elif|else|unless|switch|case|when|match|guard|while|raise|throw|except|catch|default)\b|\b(?:errors\.New|fmt\.Errorf)\(|\?\?|\|\||&&",
    )
});
/// A line that refuses: it throws, raises, panics or builds an error to return.
static REFUSAL: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"\b(?:throw|raise|panic|errors\.New|fmt\.Errorf)\b"));
static DEFAULT_VALUE: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r#"(?:^|[\s(,{])[A-Za-z_$][\w$]*\s*(?::=|=|:)\s*(?:true|false|True|False|None|null|nil|-?\d[\d_.]*|"[^"\n]*"|'[^'\n]*')\s*(?:[,)}]|$)"#,
    )
});
static COMMENT: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*(?:\/\/|#|\*|\/\*)"));
static DECIDING_NAME: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"default|Default|option|Option|config|Config|setting|resolve|Resolve|verif|Verif|valid|Valid|check|Check|allow|Allow|should|mark|guard|policy|filter|select|choose|decide|^new[A-Z]|^New[A-Z]|^__init__$|^constructor$|^can[A-Z]|^is[A-Z]|^_?drain|^_?ensure",
    )
});
static CONSTANT: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r#"^(?:export\s+)?(?:(?:const|let|var|final|static|readonly|pub)\s+){0,3}([A-Za-z_$][\w$]*)(?:\s+[\w$.*]+)?\s*(?::\s*[\w$.]+\s*)?(?::=|=)\s*(?:"[^"\n]*"|'[^'\n]*'|`[^`\n]*`|-?\d[\w.]*|true|false|True|False|None|null|nil)\s*[,;]?\s*(?:(?:\/\/|#).*)?$"#,
    )
});
static CONSTANT_BLOCK: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^(?:const|var)\s*\(\s*$"));

/// A line without its `\n` or `\r\n`, so a default at the end of a served line still reads as one.
pub fn without_terminator(line: &str) -> &str {
    line.trim_end_matches(['\n', '\r'])
}

/// The first 2000 UTF-16 units of `line`.
fn head_of(line: &str) -> &str {
    answer_format::utf16::prefix(line, DECIDE_UNITS)
}

/// `a ? b : c` with spaces around both marks and no colon between them, in one right-to-left pass:
/// each ` ? ` is checked against the nearest colon after it.
fn has_ternary(line: &str) -> bool {
    let characters: Vec<char> = line.chars().collect();
    let space = |index: Option<usize>| {
        index
            .and_then(|index| characters.get(index))
            .is_some_and(|character| is_js_space(*character))
    };
    let mut colon: Option<usize> = None;
    for index in (1..characters.len()).rev() {
        match characters.get(index) {
            Some(':') => colon = Some(index),
            Some('?') => {
                if let Some(colon) = colon {
                    if space(index.checked_sub(1))
                        && space(Some(index + 1))
                        && colon > index + 3
                        && space(colon.checked_sub(1))
                        && space(Some(colon + 1))
                    {
                        return true;
                    }
                }
            }
            _ => {}
        }
    }
    false
}

/// Whether one source line decides: a condition, a branch, a throw or a literal default.
pub fn decides_line(line: &str) -> bool {
    let head = without_terminator(head_of(line));
    if COMMENT.is_match(head) {
        return false;
    }
    CONDITION.is_match(head) || has_ternary(head) || DEFAULT_VALUE.is_match(head)
}

/// The names called on the lines that branch: `if !a.Routes().Empty()` names `Routes`.
pub fn called_in_conditions<'a>(
    lines: impl IntoIterator<Item = &'a String>,
) -> std::collections::HashSet<String> {
    let mut names = std::collections::HashSet::new();
    for line in lines {
        let head = head_of(line);
        if COMMENT.is_match(head) || !(CONDITION.is_match(head) || has_ternary(head)) {
            continue;
        }
        for (name, _) in crate::callees::calls_on_line(head) {
            names.insert(name);
        }
    }
    names
}

/// What makes a callee more likely to hold the rule: a deciding name, a call in a condition, a
/// refusal.
pub fn callee_bonus(
    name: &str,
    lines: &[String],
    condition_names: &std::collections::HashSet<String>,
) -> i64 {
    let refuses = lines
        .iter()
        .any(|line| !COMMENT.is_match(line) && REFUSAL.is_match(head_of(line)));
    i64::from(DECIDING_NAME.is_match(name)) * 3
        + i64::from(condition_names.contains(name)) * 4
        + i64::from(refuses) * 2
}

pub fn deciding_count(lines: &[String]) -> usize {
    lines.iter().filter(|line| decides_line(line)).count()
}

/// name to line of each literal constant a file declares at module level (or in a Go `const (`
/// block): `resumeHeader = "X-RESUME-ID"`, `MAX_RETRIES = 3`. One anchored match per line.
pub fn constants_of(lines: &[String]) -> HashMap<String, usize> {
    let mut constants = HashMap::new();
    let mut block = false;
    for (index, raw) in lines.iter().enumerate() {
        let line = without_terminator(raw);
        if answer_format::utf16::len(line) > 400 {
            continue;
        }
        let indent = line.chars().take_while(|c| matches!(c, '\t' | ' ')).count();
        if indent == 0 && CONSTANT_BLOCK.is_match(line) {
            block = true;
            continue;
        }
        if block && indent == 0 && line.starts_with(')') {
            block = false;
        }
        if indent > 0 && !block {
            continue;
        }
        if let Some(name) = CONSTANT
            .captures(line.trim_matches(is_js_space))
            .and_then(|found| found.get(1))
        {
            constants
                .entry(name.as_str().to_string())
                .or_insert(index + 1);
        }
    }
    constants
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_line_decides_by_its_condition_branch_default_or_ternary() {
        assert!(decides_line("  if (x) {\n"));
        assert!(decides_line("limit = 3,\n"));
        assert!(decides_line("const a = ok ? 1 : 2;"));
        assert!(!decides_line("// if this were code\n"));
        assert!(!decides_line("return value;\n"));
        let lines: Vec<String> = [
            "const HEADER = \"X-ID\";\n",
            "function f() {\n",
            "  const inner = 1;\n",
        ]
        .iter()
        .map(|line| (*line).to_string())
        .collect();
        let constants = constants_of(&lines);
        assert_eq!(constants.get("HEADER"), Some(&1));
        assert!(!constants.contains_key("inner"));
    }
}
