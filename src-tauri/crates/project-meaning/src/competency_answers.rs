//! The `answers` argument of `finalize_project_meaning`: five rows the server renders into the exact
//! `## Competency answers` section, so an agent never copies the fixed questions or the layout.
//! Every refusal names the row and the argument to change, and lists every row to repair, so one
//! corrected call succeeds.

use std::sync::LazyLock;

use answer_format::whitespace::trim;
use project_source::{
    competency_heading_starts, competency_section_end, is_persistable_evidence_reference,
    is_persistable_path_witness, parse_source_range_citation, OrderedJson, COMPETENCY_HEADING,
};
use regex::Regex;

use crate::competency_markdown::{
    is_relation_type, render_competency_markdown, AnswerRow, AnswerStatus, RelationWitness,
    Witnesses,
};
use crate::meaning_questions::question_ids;
use crate::stored_name_shapes::{pattern, safe_vault_slug, SLUG_MAX_UNITS};

const ROW_FIELDS: [&str; 8] = [
    "id", "status", "answer", "concepts", "relations", "evidence", "paths", "gap",
];
/// Witnesses one row may list per field; a row needing more names its family node instead.
pub const COMPETENCY_ROW_WITNESSES_MAX: usize = 50;

/// A line the section parser would read as a witness row or a heading, not as answer prose.
static STRUCTURAL_LINE: LazyLock<Regex> = LazyLock::new(|| pattern(r"^(?:#|- [A-Z][A-Za-z ]*:)"));
static LINE_CITE_SUFFIX: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^([^\n\r\u{2028}\u{2029}]+):L[0-9]+(?:-L?[0-9]+)?$"));

fn json_text(value: &OrderedJson) -> String {
    answer_format::json::to_string(value).unwrap_or_default()
}

/// `JSON.stringify(row.field)`, which is the word `undefined` when the field was not sent.
fn json_or_undefined(value: Option<&OrderedJson>) -> String {
    value.map_or_else(|| "undefined".to_string(), json_text)
}

fn text_of(value: &OrderedJson) -> Option<&str> {
    match value {
        OrderedJson::Text(text) => Some(text),
        _ => None,
    }
}

/// `Object.keys` order: whole-number keys first, ascending, then the others as they were written.
fn keys_in_script_order(members: &indexmap::IndexMap<String, OrderedJson>) -> Vec<&str> {
    let mut numbered: Vec<(u64, &str)> = Vec::new();
    let mut named: Vec<&str> = Vec::new();
    for key in members.keys() {
        let is_index = !key.is_empty()
            && key.bytes().all(|byte| byte.is_ascii_digit())
            && (key == "0" || !key.starts_with('0'))
            && key.parse::<u64>().is_ok_and(|number| number < u64::from(u32::MAX));
        match (is_index, key.parse::<u64>()) {
            (true, Ok(number)) => numbered.push((number, key)),
            _ => named.push(key),
        }
    }
    numbered.sort_unstable();
    numbered
        .into_iter()
        .map(|(_, key)| key)
        .chain(named)
        .collect()
}

fn evidence_problem(value: &OrderedJson) -> Option<String> {
    if let Some(text) = text_of(value) {
        if !text.starts_with("source:") {
            if let Some(cited) = LINE_CITE_SUFFIX.captures(text) {
                return Some(format!(
                    "`{text}` is a line cite; name the file `{}` (cite lines in the answer)",
                    &cited[1]
                ));
            }
        }
        if is_persistable_evidence_reference(text) {
            return None;
        }
        if text.starts_with("source:") && parse_source_range_citation(text).is_none() {
            return Some(format!(
                "`{text}` is not a pinned `source:<path>#L<a>-L<b>@sha256:<64 hex>` citation"
            ));
        }
    }
    Some(format!("{} is not a repository-relative file path", json_text(value)))
}

fn relation_problem(value: &OrderedJson) -> Option<String> {
    let OrderedJson::Object(members) = value else {
        return Some("must be {from, to, type}".to_string());
    };
    let slug = |key: &str| {
        members
            .get(key)
            .and_then(text_of)
            .is_some_and(|text| safe_vault_slug(text, SLUG_MAX_UNITS))
    };
    if !slug("from") || !slug("to") {
        return Some("`from` and `to` must be vault slugs".to_string());
    }
    let stored = members.get("type").and_then(text_of).is_some_and(is_relation_type);
    (!stored).then(|| {
        "`type` must be the stored relation key, such as `domains`, `capabilities` or `depends_on`"
            .to_string()
    })
}

fn list_problems(
    row: &indexmap::IndexMap<String, OrderedJson>,
    field: &str,
    label: &str,
    value_problem: impl Fn(&OrderedJson) -> Option<String>,
) -> Vec<String> {
    let Some(values) = row.get(field) else {
        return Vec::new();
    };
    let OrderedJson::List(values) = values else {
        return vec![format!("{label}.{field} must be an array")];
    };
    if values.len() > COMPETENCY_ROW_WITNESSES_MAX {
        return vec![format!(
            "{label}.{field} lists {}; keep at most {COMPETENCY_ROW_WITNESSES_MAX}",
            values.len()
        )];
    }
    values
        .iter()
        .enumerate()
        .filter_map(|(index, value)| {
            value_problem(value).map(|problem| format!("{label}.{field}[{index}]: {problem}"))
        })
        .collect()
}

fn answer_problem(answer: Option<&OrderedJson>, label: &str) -> Vec<String> {
    let Some(text) = answer.and_then(text_of).filter(|text| !trim(text).is_empty()) else {
        return vec![format!("{label}.answer is empty")];
    };
    let structural = text
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .any(|line| STRUCTURAL_LINE.is_match(line));
    if structural {
        vec![format!(
            "{label}.answer holds a heading or a \"- Label:\" line; write it as plain sentences"
        )]
    } else {
        Vec::new()
    }
}

fn gap_problems(
    row: &indexmap::IndexMap<String, OrderedJson>,
    label: &str,
    status: &str,
) -> Vec<String> {
    let gap = row.get("gap");
    if status == "answered" {
        return if gap.is_none() {
            Vec::new()
        } else {
            vec![format!("{label} is answered, so drop `gap` or set status \"partial\"")]
        };
    }
    let Some(text) = gap.and_then(text_of).filter(|text| !trim(text).is_empty()) else {
        return vec![format!(
            "{label} is \"{status}\", so `gap` must say in one line what is missing"
        )];
    };
    if trim(text).contains(['\r', '\n']) {
        vec![format!("{label}.gap must be one line")]
    } else {
        Vec::new()
    }
}

fn row_problems(row: &OrderedJson, label: &str) -> Vec<String> {
    let OrderedJson::Object(members) = row else {
        return vec![format!("{label} must be an object")];
    };
    let unknown: Vec<&str> = keys_in_script_order(members)
        .into_iter()
        .filter(|key| !ROW_FIELDS.contains(key))
        .collect();
    if !unknown.is_empty() {
        return vec![format!(
            "{label} has unknown field(s) {}; a row takes {}",
            unknown.join(", "),
            ROW_FIELDS.join(", ")
        )];
    }
    let ids = question_ids();
    if !members
        .get("id")
        .and_then(text_of)
        .is_some_and(|id| ids.contains(&id))
    {
        return vec![format!(
            "{label}.id {} is not one of {}",
            json_or_undefined(members.get("id")),
            ids.join(", ")
        )];
    }
    let Some(status) = members
        .get("status")
        .and_then(text_of)
        .filter(|word| AnswerStatus::from_word(word).is_some())
    else {
        return vec![format!(
            "{label}.status must be one of answered, partial, visible-gap"
        )];
    };
    let mut problems = answer_problem(members.get("answer"), label);
    problems.extend(gap_problems(members, label, status));
    problems.extend(list_problems(members, "concepts", label, |value| {
        text_of(value)
            .is_some_and(|slug| safe_vault_slug(slug, SLUG_MAX_UNITS))
            .then_some(())
            .map_or_else(|| Some(format!("{} is not a vault slug", json_text(value))), |()| None)
    }));
    problems.extend(list_problems(members, "relations", label, relation_problem));
    problems.extend(list_problems(members, "evidence", label, evidence_problem));
    problems.extend(list_problems(members, "paths", label, |value| {
        text_of(value)
            .is_some_and(is_persistable_path_witness)
            .then_some(())
            .map_or_else(
                || Some(format!("{} is not a repository-relative path", json_text(value))),
                |()| None,
            )
    }));
    problems
}

fn texts_once(members: &indexmap::IndexMap<String, OrderedJson>, field: &str) -> Vec<String> {
    let mut kept: Vec<String> = Vec::new();
    if let Some(OrderedJson::List(values)) = members.get(field) {
        for value in values {
            if let Some(text) = text_of(value) {
                if !kept.iter().any(|held| held == text) {
                    kept.push(text.to_string());
                }
            }
        }
    }
    kept
}

fn relations_once(members: &indexmap::IndexMap<String, OrderedJson>) -> Vec<RelationWitness> {
    let mut kept: Vec<RelationWitness> = Vec::new();
    if let Some(OrderedJson::List(values)) = members.get("relations") {
        for value in values {
            let OrderedJson::Object(fields) = value else {
                continue;
            };
            let text = |key: &str| fields.get(key).and_then(text_of).unwrap_or_default().to_string();
            let relation = RelationWitness {
                from: text("from"),
                to: text("to"),
                kind: text("type"),
            };
            if !kept.contains(&relation) {
                kept.push(relation);
            }
        }
    }
    kept
}

fn row_of(members: &indexmap::IndexMap<String, OrderedJson>) -> Option<AnswerRow> {
    let id = *question_ids()
        .iter()
        .find(|id| members.get("id").and_then(text_of) == Some(**id))?;
    let status = AnswerStatus::from_word(members.get("status").and_then(text_of)?)?;
    let answer = members
        .get("answer")
        .and_then(text_of)?
        .replace("\r\n", "\n");
    Some(AnswerRow {
        id,
        status,
        answer: trim(&answer).to_string(),
        witnesses: Witnesses {
            concepts: texts_once(members, "concepts"),
            relations: relations_once(members),
            evidence: texts_once(members, "evidence"),
            paths: texts_once(members, "paths"),
        },
        gap: (status != AnswerStatus::Answered)
            .then(|| members.get("gap").and_then(text_of).map(|gap| trim(gap).to_string()))
            .flatten(),
    })
}

/// The rows as the section will hold them, and the section they render to.
pub struct RenderedAnswers {
    pub rows: Vec<AnswerRow>,
    pub section: String,
}

/// Validates the five rows and renders the section; the error is the one message listing every row
/// to repair.
pub fn render_competency_answers(answers: &OrderedJson) -> Result<RenderedAnswers, String> {
    let ids = question_ids();
    let OrderedJson::List(rows) = answers else {
        return Err(format!(
            "answers must be an array of {} rows, one per id: {}.",
            ids.len(),
            ids.join(", ")
        ));
    };
    let mut problems: Vec<String> = rows
        .iter()
        .enumerate()
        .flat_map(|(index, row)| row_problems(row, &format!("answers[{index}]")))
        .collect();
    let id_of = |row: &OrderedJson| match row {
        OrderedJson::Object(members) => members.get("id").and_then(text_of).map(str::to_string),
        _ => None,
    };
    let held: Vec<Option<String>> = rows.iter().map(id_of).collect();
    let count = |id: &str| held.iter().filter(|value| value.as_deref() == Some(id)).count();
    let repeated: Vec<&str> = ids.iter().copied().filter(|id| count(id) > 1).collect();
    let missing: Vec<&str> = ids.iter().copied().filter(|id| count(id) == 0).collect();
    if !repeated.is_empty() {
        problems.push(format!("answers holds more than one row for {}", repeated.join(", ")));
    }
    if !missing.is_empty() {
        problems.push(format!("answers has no row for {}", missing.join(", ")));
    }
    if !problems.is_empty() {
        let lines: Vec<String> = problems.iter().map(|line| format!("- {line}.")).collect();
        return Err(format!(
            "finalize_project_meaning refused `answers`; nothing was written:\n{}",
            lines.join("\n")
        ));
    }
    let rows: Vec<AnswerRow> = rows
        .iter()
        .filter_map(|row| match row {
            OrderedJson::Object(members) => row_of(members),
            _ => None,
        })
        .collect();
    let section = render_competency_markdown(&rows).map_err(|fault| fault.0)?;
    Ok(RenderedAnswers { rows, section })
}

/// The body with `section` in place of every existing competency section, or appended.
pub fn with_competency_section(body: &str, section: &str) -> String {
    let spans: Vec<(usize, usize)> = competency_heading_starts(body)
        .into_iter()
        .map(|start| {
            let after_heading = start + COMPETENCY_HEADING.len();
            let end = competency_section_end(body, after_heading);
            // The span runs to the start of the next heading, past the line break before it.
            (start, if end < body.len() { end + 1 } else { end })
        })
        .collect();
    if spans.is_empty() {
        let kept = body.trim_end_matches(answer_format::whitespace::is_whitespace);
        return if kept.is_empty() {
            section.to_string()
        } else {
            format!("{kept}\n\n{section}")
        };
    }
    let mut pieces = String::with_capacity(body.len() + section.len());
    let mut cursor = 0;
    for (index, (start, end)) in spans.iter().enumerate() {
        pieces.push_str(body.get(cursor..*start).unwrap_or(""));
        if index == 0 {
            pieces.push_str(section);
            if *end < body.len() {
                pieces.push('\n');
            }
        }
        cursor = *end;
    }
    pieces.push_str(body.get(cursor..).unwrap_or(""));
    pieces
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rows(json: &str) -> OrderedJson {
        serde_json::from_str(json).expect("json")
    }

    #[test]
    fn every_row_to_repair_is_listed_with_the_argument_to_change() {
        let refused = render_competency_answers(&rows(
            r#"[{"id":"scope","status":"answered","answer":"x","evidence":["src/a.ts:L1-L9"],"extra":1},
                {"id":"scope","status":"partial","answer":"y"}]"#,
        ))
        .err()
        .expect("refused");
        assert!(refused.starts_with("finalize_project_meaning refused `answers`; nothing was written:\n- answers[0] has unknown field(s) extra; a row takes id, status, answer"));
        assert!(refused.contains("- answers[1] is \"partial\", so `gap` must say in one line what is missing."));
        assert!(refused.contains("- answers holds more than one row for scope."));
        assert!(refused.ends_with("- answers has no row for domains, abilities, evidence, impact."));
    }

    #[test]
    fn a_line_cite_is_refused_with_the_file_to_name() {
        let refused = render_competency_answers(&rows(
            r#"[{"id":"scope","status":"answered","answer":"x","evidence":["src/a.ts:L1-L9"]},
                {"id":"domains","status":"visible-gap","answer":"-","gap":"g"},
                {"id":"abilities","status":"visible-gap","answer":"-","gap":"g"},
                {"id":"evidence","status":"visible-gap","answer":"-","gap":"g"},
                {"id":"impact","status":"visible-gap","answer":"-","gap":"g"}]"#,
        ))
        .err()
        .expect("refused");
        assert_eq!(
            refused.lines().nth(1),
            Some("- answers[0].evidence[0]: `src/a.ts:L1-L9` is a line cite; name the file `src/a.ts` (cite lines in the answer).")
        );
    }

    #[test]
    fn the_section_replaces_every_old_one_and_is_appended_when_there_is_none() {
        let section = "## Competency answers\n\nnew\n";
        let old = "# P\n\n## Competency answers\n\nold\n\n## Uncertainty\n\nu\n";
        assert_eq!(
            with_competency_section(old, section),
            "# P\n\n## Competency answers\n\nnew\n\n## Uncertainty\n\nu\n"
        );
        assert_eq!(with_competency_section("# P\n\n", section), "# P\n\n## Competency answers\n\nnew\n");
        assert_eq!(with_competency_section("", section), section);
    }
}
