//! Operations a dispatcher routes by name: a `switch` (or Python `match`) on a command-like
//! subject with three or more string cases that each call a handler (`case "whisper":
//! n.Whisper(...)`).

use std::sync::LazyLock;

use regex::Regex;

use crate::ability_row::{AbilityKind, AbilityRow};
use crate::js_pattern::js_regex;

const SUBJECT_WORDS: [&str; 8] = [
    "command",
    "cmd",
    "action",
    "op",
    "operation",
    "event",
    "method",
    "verb",
];
const NOT_A_HANDLER: [&str; 24] = [
    "if", "for", "switch", "return", "await", "fmt", "log", "Debug", "debug", "Info", "info",
    "Errorf", "Error", "error", "warn", "Warn", "print", "println", "Printf", "console", "String",
    "string", "len", "append",
];
const MORE_NOT_A_HANDLER: [&str; 2] = ["make", "new"];
/// A dispatcher is read this many lines below its head.
const WINDOW_LINES: usize = 200;
/// A case's handler is looked for on this many lines.
const HANDLER_LINES: usize = 4;

static HEAD: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"^\s*(?:switch\s*\(?\s*([\w.]+)\s*\)?\s*\{|match\s+([\w.]+)\s*:)\s*$")
});
static CASE: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r#"^\s*case\s+["'`]([\w:/.-]+)["'`]\s*(?:,\s*["'`][\w:/.-]+["'`]\s*)*:"#)
});
static NEXT_SWITCH: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*(?:switch|match)\b"));
static CLOSING_BRACE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*\}\s*$"));
static NEXT_CASE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*(?:case\b|default\b)"));
static CALL: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?:[\w$]+\.)*([\w$]+)\s*\("));

fn subject_is_command_like(subject: &str) -> bool {
    let last = subject
        .rsplit('.')
        .next()
        .unwrap_or(subject)
        .to_ascii_lowercase();
    SUBJECT_WORDS.contains(&last.as_str())
}

fn is_not_a_handler(name: &str) -> bool {
    NOT_A_HANDLER.contains(&name) || MORE_NOT_A_HANDLER.contains(&name)
}

fn indent(line: &str) -> usize {
    line.chars()
        .take_while(|character| character.is_whitespace())
        .count()
}

fn first_handler(text: &str) -> Option<String> {
    CALL.captures_iter(text)
        .filter_map(|found| found.get(1).map(|name| name.as_str()))
        .find(|name| !is_not_a_handler(name))
        .map(str::to_string)
}

fn is_dispatching_file(path: &str) -> bool {
    [".go", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".py"]
        .iter()
        .any(|extension| path.ends_with(extension))
}

/// The operations the file at `path` routes by a command name, one row per case.
pub fn dispatched_operations(path: &str, text: &str) -> Vec<AbilityRow> {
    if !is_dispatching_file(path) || !(text.contains("switch") || text.contains("match")) {
        return Vec::new();
    }
    let lines: Vec<&str> = text
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .collect();
    let mut rows = Vec::new();
    for (index, head_line) in lines.iter().enumerate() {
        let Some(head) = HEAD.captures(head_line) else {
            continue;
        };
        let subject = head
            .get(1)
            .or_else(|| head.get(2))
            .map_or("", |m| m.as_str());
        if !subject_is_command_like(subject) {
            continue;
        }
        let mut found: Vec<AbilityRow> = Vec::new();
        let window_end = lines.len().min(index + WINDOW_LINES);
        for cursor in (index + 1)..window_end {
            let line = lines.get(cursor).copied().unwrap_or("");
            if NEXT_SWITCH.is_match(line) {
                break;
            }
            let Some(case) = CASE.captures(line) else {
                if CLOSING_BRACE.is_match(line) && indent(line) <= indent(head_line) {
                    break;
                }
                continue;
            };
            let (Some(whole), Some(name)) = (case.get(0), case.get(1)) else {
                continue;
            };
            let look_end = lines.len().min(cursor + HANDLER_LINES);
            for look in cursor..look_end {
                let current = lines.get(look).copied().unwrap_or("");
                if look > cursor && NEXT_CASE.is_match(current) {
                    break;
                }
                let rest = if look == cursor {
                    current.get(whole.end()..).unwrap_or("")
                } else {
                    current
                };
                if let Some(call) = first_handler(rest) {
                    found.push(
                        AbilityRow::at(AbilityKind::Operation, name.as_str(), path, cursor + 1)
                            .with_symbol(&call),
                    );
                    break;
                }
            }
        }
        if found.len() >= 3 {
            rows.extend(found);
        }
    }
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    const GO: &str = "\
switch cmd {
case \"whisper\":
\tn.Whisper(args)
case \"shout\":
\tn.Shout(args)
case \"list\":
\tfmt.Printf(\"x\")
\tn.List()
}
";

    #[test]
    fn three_cases_on_a_command_that_each_call_a_handler_are_three_operations() {
        let rows = dispatched_operations("cmd/main.go", GO);
        let named: Vec<(&str, Option<&str>, usize)> = rows
            .iter()
            .map(|row| (row.name.as_str(), row.symbol.as_deref(), row.line))
            .collect();
        assert_eq!(
            named,
            [
                ("whisper", Some("Whisper"), 2),
                ("shout", Some("Shout"), 4),
                ("list", Some("List"), 6)
            ]
        );
    }

    #[test]
    fn two_cases_are_a_branch_not_a_dispatcher_and_a_plain_subject_is_not_a_command() {
        let two = GO.replace("case \"list\":\n\tfmt.Printf(\"x\")\n\tn.List()\n", "");
        assert!(dispatched_operations("a.go", &two).is_empty());
        assert!(
            dispatched_operations("a.go", &GO.replace("switch cmd", "switch color")).is_empty()
        );
    }
}
