//! The fields an error's English text carries, lifted into `structuredContent`, and the code the
//! text implies. The messages are the contract: `mcp/src/server/rpc.mjs` parses them back, and
//! this file parses them the same way. A pattern's `.` is written `LINE` because JavaScript's dot
//! stops at U+2028 and U+2029 and a carriage return, which Rust's does not.

use std::sync::OnceLock;

use regex::{Captures, Regex};

use crate::js_text::js_trim;
use crate::json::{Object, Value};

/// Any character JavaScript's `.` matches.
const LINE: &str = "[^\n\r\u{2028}\u{2029}]";

fn compile(pattern: &str) -> Regex {
    // The patterns are fixed text in this file; a mistake in one fails every test that reaches it.
    match Regex::new(pattern) {
        Ok(regex) => regex,
        Err(error) => unreachable_pattern(pattern, &error),
    }
}

#[cold]
#[allow(
    clippy::panic,
    reason = "a malformed built-in pattern is a programming error found by the first test"
)]
fn unreachable_pattern(pattern: &str, error: &regex::Error) -> ! {
    panic!("built-in pattern {pattern:?} does not compile: {error}");
}

struct Patterns {
    unknown_tool: Regex,
    unknown_argument: Regex,
    unknown_arguments: Regex,
    unknown_field: Regex,
    unknown_fields: Regex,
    allowed_value: Regex,
    missing_slug: Regex,
    unresolved_compiled_slug: Regex,
    existing_doc: Regex,
    existing_target: Regex,
    hint_entry: Regex,
    quoted: Regex,
    code_unknown_tool: Regex,
    code_unknown_argument: Regex,
    code_unknown_field: Regex,
    code_not_found: Regex,
    code_conflict: Regex,
    code_invalid: Regex,
}

fn patterns() -> &'static Patterns {
    static PATTERNS: OnceLock<Patterns> = OnceLock::new();
    PATTERNS.get_or_init(|| Patterns {
        unknown_tool: compile(&format!(
            r#"(?i)^Unknown tool: ([^.]+)\.(?: Did you mean "([^"]+)"\?)? Allowed tools: ({LINE}+)\.$"#
        )),
        unknown_argument: compile(&format!(
            r#"(?i)^Unknown argument "([^"]+)" for ([^.]+)\.(?: Did you mean "([^"]+)"\?)? Allowed arguments: ({LINE}+)\. Received arguments: ({LINE}+)\.$"#
        )),
        unknown_arguments: compile(&format!(
            r"(?i)^Unknown arguments for ([^:]+): ({LINE}+)\. Allowed arguments: ({LINE}+)\. Received arguments: ({LINE}+)\.$"
        )),
        unknown_field: compile(&format!(
            r#"(?i)^Unknown field "([^"]+)" in ([^.]+)\.(?: Did you mean "([^"]+)"\?)? Allowed fields: ({LINE}+)\. Received fields: ({LINE}+)\.$"#
        )),
        unknown_fields: compile(&format!(
            r"(?i)^Unknown fields in ([^:]+): ({LINE}+)\. Allowed fields: ({LINE}+)\. Received fields: ({LINE}+)\.$"
        )),
        allowed_value: compile(&format!(
            r#"(?i)^({LINE}+?) must be one of: ({LINE}+)\. Received: ({LINE}+)\.(?: Did you mean "([^"]+)"\?)?$"#
        )),
        missing_slug: compile(&format!(
            r#"(?i)^({LINE}+?): "([^"]+)"\. Use list_concepts\(\) to see all slugs, or find_evidence\(\{{title:"[^"]*"\}}\) to search by title\.(?: If the endpoint is real but absent, create it first with add_concepts\(\{{concepts:\[\{{slug, kind, title\}}\]\}}\)\.)?(?: Similar slugs in this vault: ({LINE}+)\.)?$"#
        )),
        unresolved_compiled_slug: compile(&format!(
            r#"(?i)^({LINE}+?) "([^"]+)" does not resolve to a compiled ontology node\.(?: Did you mean: ({LINE}+)\?)?$"#
        )),
        existing_doc: compile(
            r#"(?i)^Doc already exists at "([^"]+)"\. To update fields, use patch_concept\(slug, frontmatter, body, expected_mtime\)\. To rename, use rename_concept\(oldSlug, newSlug\)\. Never delete-then-add"#,
        ),
        existing_target: compile(
            r#"(?i)^Target slug already exists: "([^"]+)"\. Pass overwrite: true to replace it\.$"#,
        ),
        hint_entry: compile(r#""([^"]+)"(?: \(did you mean "([^"]+)"\?\))?"#),
        quoted: compile(r#""([^"]+)""#),
        code_unknown_tool: compile(r"(?i)^Unknown tool:"),
        code_unknown_argument: compile(r"(?i)^Unknown argument |^Unknown arguments for "),
        code_unknown_field: compile(r"(?i)^Unknown field |^Unknown fields in "),
        code_not_found: compile(
            r"(?i)not found|does not exist|does not resolve to a compiled ontology node",
        ),
        code_conflict: compile(r"(?i)already exists|conflict|identical"),
        code_invalid: compile(
            r"(?i)must be|must not|cannot be|requires exactly one of|At least one|Invalid value|Received:|points outside|Too many",
        ),
    })
}

fn text(captures: &Captures<'_>, group: usize) -> String {
    captures
        .get(group)
        .map(|found| found.as_str().to_string())
        .unwrap_or_default()
}

fn optional(captures: &Captures<'_>, group: usize) -> Option<String> {
    captures.get(group).map(|found| found.as_str().to_string())
}

/// `text.split(',').map(trim).filter(Boolean)`, with the two words that mean none.
fn split_comma_list(source: &str) -> Value {
    if source == "no arguments" || source == "none" {
        return Value::Array(Vec::new());
    }
    Value::array(
        source
            .split(',')
            .map(js_trim)
            .filter(|item| !item.is_empty())
            .map(Value::string),
    )
}

fn extract_quoted_list(source: &str) -> Value {
    Value::array(
        patterns()
            .quoted
            .captures_iter(source)
            .map(|captures| Value::string(text(&captures, 1))),
    )
}

/// The received value as the message printed it: a quoted string loses its quotes.
fn received_value_text(source: &str) -> String {
    let value = js_trim(source);
    match value
        .strip_prefix('"')
        .and_then(|rest| rest.strip_suffix('"'))
    {
        Some(inner) if value.len() >= 2 => inner.to_string(),
        _ => value.to_string(),
    }
}

fn hint(name: String, suggestion: Option<String>) -> Value {
    let mut entry = Object::new();
    entry.insert("name", Value::string(name));
    if let Some(suggestion) = suggestion {
        entry.insert("suggestion", Value::string(suggestion));
    }
    Value::Object(entry)
}

fn extract_unknown_argument_hints(source: &str) -> Value {
    Value::array(
        patterns()
            .hint_entry
            .captures_iter(source)
            .map(|captures| hint(text(&captures, 1), optional(&captures, 2))),
    )
}

fn put(object: &mut Object, key: &str, value: Option<String>) {
    if let Some(value) = value {
        object.insert(key, Value::string(value));
    }
}

fn strings(items: &[&str]) -> Value {
    Value::array(items.iter().map(|item| Value::string(*item)))
}

/// The fields an error message names: what was received, what was allowed, the nearest allowed
/// value. Empty when the message is none of the known shapes.
pub fn structured_error_details(message: &str) -> Object {
    let found = patterns();
    let mut details = Object::new();

    if let Some(captures) = found.unknown_tool.captures(message) {
        put(&mut details, "receivedTool", optional(&captures, 1));
        put(&mut details, "suggestion", optional(&captures, 2));
        details.insert("allowedTools", split_comma_list(&text(&captures, 3)));
        return details;
    }

    if let Some(captures) = found.unknown_argument.captures(message) {
        let argument = text(&captures, 1);
        let suggestion = optional(&captures, 3);
        put(&mut details, "toolName", optional(&captures, 2));
        put(&mut details, "receivedArgument", Some(argument.clone()));
        put(&mut details, "suggestion", suggestion.clone());
        details.insert(
            "unknownArguments",
            Value::array([hint(argument, suggestion)]),
        );
        details.insert("allowedArguments", split_comma_list(&text(&captures, 4)));
        details.insert("receivedArguments", split_comma_list(&text(&captures, 5)));
        return details;
    }

    if let Some(captures) = found.unknown_arguments.captures(message) {
        put(&mut details, "toolName", optional(&captures, 1));
        details.insert("receivedArguments", split_comma_list(&text(&captures, 4)));
        details.insert(
            "unknownArguments",
            extract_unknown_argument_hints(&text(&captures, 2)),
        );
        details.insert("allowedArguments", split_comma_list(&text(&captures, 3)));
        return details;
    }

    if let Some(captures) = found.unknown_field.captures(message) {
        let field = text(&captures, 1);
        let suggestion = optional(&captures, 3);
        put(&mut details, "rowName", optional(&captures, 2));
        put(&mut details, "receivedField", Some(field.clone()));
        put(&mut details, "suggestion", suggestion.clone());
        details.insert("unknownFields", Value::array([hint(field, suggestion)]));
        details.insert("allowedFields", split_comma_list(&text(&captures, 4)));
        details.insert("receivedFields", split_comma_list(&text(&captures, 5)));
        return details;
    }

    if let Some(captures) = found.unknown_fields.captures(message) {
        put(&mut details, "rowName", optional(&captures, 1));
        details.insert(
            "unknownFields",
            extract_unknown_argument_hints(&text(&captures, 2)),
        );
        details.insert("allowedFields", split_comma_list(&text(&captures, 3)));
        details.insert("receivedFields", split_comma_list(&text(&captures, 4)));
        return details;
    }

    if let Some(captures) = found.allowed_value.captures(message) {
        put(&mut details, "valueName", optional(&captures, 1));
        details.insert(
            "receivedValue",
            Value::string(received_value_text(&text(&captures, 3))),
        );
        put(&mut details, "suggestion", optional(&captures, 4));
        details.insert("allowedValues", split_comma_list(&text(&captures, 2)));
        return details;
    }

    if let Some(captures) = found.missing_slug.captures(message) {
        put(&mut details, "missingSubject", optional(&captures, 1));
        put(&mut details, "missingSlug", optional(&captures, 2));
        details.insert(
            "recoveryTools",
            strings(&["list_concepts", "find_evidence"]),
        );
        if message.contains("create it first with add_concepts(") {
            details.insert("createTool", Value::string("add_concepts"));
        }
        details.insert(
            "similarSlugs",
            captures.get(3).map_or_else(
                || Value::Array(Vec::new()),
                |similar| extract_quoted_list(similar.as_str()),
            ),
        );
        return details;
    }

    if let Some(captures) = found.unresolved_compiled_slug.captures(message) {
        put(&mut details, "missingSubject", optional(&captures, 1));
        put(&mut details, "missingSlug", optional(&captures, 2));
        details.insert(
            "recoveryTools",
            strings(&["list_concepts", "find_evidence"]),
        );
        details.insert("createTool", Value::string("add_concepts"));
        details.insert(
            "similarSlugs",
            captures.get(3).map_or_else(
                || Value::Array(Vec::new()),
                |similar| split_comma_list(similar.as_str()),
            ),
        );
        return details;
    }

    if let Some(captures) = found.existing_doc.captures(message) {
        details.insert("conflictSubject", Value::string("Doc already exists"));
        put(&mut details, "conflictSlug", optional(&captures, 1));
        details.insert(
            "recoveryTools",
            strings(&["patch_concept", "rename_concept"]),
        );
        details.insert("avoidTools", strings(&["delete_concept"]));
        return details;
    }

    if let Some(captures) = found.existing_target.captures(message) {
        details.insert(
            "conflictSubject",
            Value::string("Target slug already exists"),
        );
        put(&mut details, "conflictSlug", optional(&captures, 1));
        details.insert("recoveryTools", strings(&["rename_concept"]));
        details.insert("overwriteOption", Value::string("overwrite"));
        return details;
    }

    details
}

/// The code a message implies when its thrower named none.
pub fn classify_error_code(vault_conflict: bool, message: &str) -> &'static str {
    let found = patterns();
    if vault_conflict {
        return "vault_conflict";
    }
    if found.code_unknown_tool.is_match(message) {
        return "unknown_tool";
    }
    if found.code_unknown_argument.is_match(message) {
        return "unknown_argument";
    }
    if found.code_unknown_field.is_match(message) {
        return "invalid_arguments";
    }
    if found.code_not_found.is_match(message) {
        return "not_found";
    }
    if found.code_conflict.is_match(message) {
        return "conflict";
    }
    if found.code_invalid.is_match(message) {
        return "invalid_arguments";
    }
    "tool_error"
}

/// `{errorCode, ...details}` for one failed row of a batch.
pub fn structured_row_error_details(vault_conflict: bool, message: &str) -> Object {
    let mut row = Object::new();
    row.insert(
        "errorCode",
        Value::string(classify_error_code(vault_conflict, message)),
    );
    for (key, value) in structured_error_details(message).iter() {
        row.insert(key, value.clone());
    }
    row
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::to_json;

    fn details(message: &str) -> String {
        to_json(&Value::Object(structured_error_details(message)))
    }

    #[test]
    fn an_unknown_tool_with_a_suggestion_lists_what_is_allowed() {
        assert_eq!(
            details(
                r#"Unknown tool: list_concept. Did you mean "list_concepts"? Allowed tools: a, b."#
            ),
            r#"{"receivedTool":"list_concept","suggestion":"list_concepts","allowedTools":["a","b"]}"#
        );
    }

    #[test]
    fn a_single_unknown_argument_names_its_tool_and_the_nearest_allowed_one() {
        assert_eq!(
            details(
                r#"Unknown argument "limt" for list_concepts. Did you mean "limit"? Allowed arguments: domain, limit. Received arguments: limt."#
            ),
            concat!(
                r#"{"toolName":"list_concepts","receivedArgument":"limt","suggestion":"limit","#,
                r#""unknownArguments":[{"name":"limt","suggestion":"limit"}],"allowedArguments":["domain","limit"],"#,
                r#""receivedArguments":["limt"]}"#
            )
        );
        assert_eq!(
            details(
                r#"Unknown argument "zz" for git_status. Allowed arguments: no arguments. Received arguments: zz."#
            ),
            concat!(
                r#"{"toolName":"git_status","receivedArgument":"zz","unknownArguments":[{"name":"zz"}],"#,
                r#""allowedArguments":[],"receivedArguments":["zz"]}"#
            )
        );
    }

    #[test]
    fn several_unknown_arguments_each_carry_their_own_hint() {
        assert_eq!(
            details(
                r#"Unknown arguments for list_concepts: "bogus", "limt" (did you mean "limit"?). Allowed arguments: domain, limit. Received arguments: bogus, limt."#
            ),
            concat!(
                r#"{"toolName":"list_concepts","receivedArguments":["bogus","limt"],"#,
                r#""unknownArguments":[{"name":"bogus"},{"name":"limt","suggestion":"limit"}],"allowedArguments":["domain","limit"]}"#
            )
        );
    }

    #[test]
    fn an_allowed_value_error_unquotes_what_was_received() {
        assert_eq!(
            details(
                r#"body must be one of: excerpt, full. Received: "fulll". Did you mean "full"?"#
            ),
            r#"{"valueName":"body","receivedValue":"fulll","suggestion":"full","allowedValues":["excerpt","full"]}"#
        );
        assert_eq!(
            details("kind must be one of: a, b. Received: number."),
            r#"{"valueName":"kind","receivedValue":"number","allowedValues":["a","b"]}"#
        );
    }

    #[test]
    fn a_missing_slug_lists_where_to_look_and_what_is_similar() {
        assert_eq!(
            details(
                r#"from: "domains/pay". Use list_concepts() to see all slugs, or find_evidence({title:"..."}) to search by title. If the endpoint is real but absent, create it first with add_concepts({concepts:[{slug, kind, title}]}). Similar slugs in this vault: "domains/payment", "domains/payout"."#
            ),
            concat!(
                r#"{"missingSubject":"from","missingSlug":"domains/pay","recoveryTools":["list_concepts","find_evidence"],"#,
                r#""createTool":"add_concepts","similarSlugs":["domains/payment","domains/payout"]}"#
            )
        );
    }

    #[test]
    fn a_node_that_does_not_compile_to_a_slug_and_the_two_conflicts_are_recognised() {
        assert_eq!(
            details(
                r#"Node "x" does not resolve to a compiled ontology node. Did you mean: a, b?"#
            ),
            concat!(
                r#"{"missingSubject":"Node","missingSlug":"x","recoveryTools":["list_concepts","find_evidence"],"#,
                r#""createTool":"add_concepts","similarSlugs":["a","b"]}"#
            )
        );
        assert_eq!(
            details(r#"Target slug already exists: "a/b". Pass overwrite: true to replace it."#),
            r#"{"conflictSubject":"Target slug already exists","conflictSlug":"a/b","recoveryTools":["rename_concept"],"overwriteOption":"overwrite"}"#
        );
        assert!(details(r#"Doc already exists at "a/b". To update fields, use patch_concept(slug, frontmatter, body, expected_mtime). To rename, use rename_concept(oldSlug, newSlug). Never delete-then-add."#)
            .contains(r#""avoidTools":["delete_concept"]"#));
    }

    #[test]
    fn a_dot_does_not_cross_a_carriage_return_or_a_line_separator() {
        // JavaScript's `.` stops at these, so the message is no known shape.
        assert_eq!(details("Unknown tool: x. Allowed tools: a\r, b."), "{}");
        assert_eq!(details("Unknown tool: x. Allowed tools: a\u{2028}b."), "{}");
        // `[^.]+` is a class and crosses them.
        assert!(details("Unknown tool: x\ny. Allowed tools: a.").contains("receivedTool"));
    }

    #[test]
    fn codes_are_the_first_rule_that_matches() {
        assert_eq!(
            classify_error_code(false, "Unknown tool: x"),
            "unknown_tool"
        );
        assert_eq!(
            classify_error_code(false, "Unknown arguments for a: b"),
            "unknown_argument"
        );
        assert_eq!(
            classify_error_code(false, "Unknown fields in rows: b"),
            "invalid_arguments"
        );
        assert_eq!(
            classify_error_code(false, "File does not exist"),
            "not_found"
        );
        assert_eq!(
            classify_error_code(false, "Doc already exists at a"),
            "conflict"
        );
        assert_eq!(
            classify_error_code(false, "limit must be an integer"),
            "invalid_arguments"
        );
        assert_eq!(classify_error_code(false, "something broke"), "tool_error");
        assert_eq!(
            classify_error_code(true, "Unknown tool: x"),
            "vault_conflict"
        );
        // A "not found" beats a later "must be".
        assert_eq!(
            classify_error_code(false, "Slug not found; must be listed"),
            "not_found"
        );
    }
}
