//! The `## Competency answers` section of a project's body: written in one exact layout, and read
//! back only in that layout, so a person's edit that leaves it is noticed and not guessed at.
//!
//! ```text
//! ## Competency answers
//!
//! ### scope: answered
//!
//! <the question>
//!
//! <the answer>
//!
//! - Concepts: `a`, `b`
//! - Relations: `a` --depends_on--> `b`
//! - Evidence: `path` or `source:path#L1-L2@sha256:<64 hex>`
//! - Paths: `path`
//! - Gap: one line, on a row that is not answered
//! ```

use std::collections::HashSet;
use std::fmt;
use std::sync::LazyLock;

use answer_format::whitespace::{is_line_terminator, trim};
use project_source::{
    competency_heading_starts, competency_section_end, is_persistable_evidence_reference,
    is_persistable_path_witness, COMPETENCY_HEADING,
};
use regex::Regex;

use crate::meaning_questions::QUESTIONS;
use crate::stored_name_shapes::{pattern, safe_opaque, safe_vault_slug, SLUG_MAX_UNITS};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnswerStatus {
    Answered,
    Partial,
    VisibleGap,
}

impl AnswerStatus {
    pub const fn word(self) -> &'static str {
        match self {
            Self::Answered => "answered",
            Self::Partial => "partial",
            Self::VisibleGap => "visible-gap",
        }
    }

    pub fn from_word(word: &str) -> Option<Self> {
        match word {
            "answered" => Some(Self::Answered),
            "partial" => Some(Self::Partial),
            "visible-gap" => Some(Self::VisibleGap),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RelationWitness {
    pub from: String,
    pub to: String,
    /// The stored relation key: `domains`, `capabilities`, `depends_on`.
    pub kind: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Witnesses {
    pub concepts: Vec<String>,
    pub relations: Vec<RelationWitness>,
    pub evidence: Vec<String>,
    pub paths: Vec<String>,
}

/// One answered question.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnswerRow {
    pub id: &'static str,
    pub status: AnswerStatus,
    pub answer: String,
    pub witnesses: Witnesses,
    /// What is missing, on a row that is not answered.
    pub gap: Option<String>,
}

/// Why a section could not be written or read, in the sentence an agent is given.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarkdownFault(pub String);

impl fmt::Display for MarkdownFault {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

fn fail<T>(message: impl AsRef<str>) -> Result<T, MarkdownFault> {
    Err(MarkdownFault(format!(
        "Invalid project competency Markdown: {}",
        message.as_ref()
    )))
}

static RELATION_TYPE: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^[A-Za-z0-9][A-Za-z0-9._:-]*$"));
static RELATION_ITEM: LazyLock<Regex> = LazyLock::new(|| {
    pattern(r"^`([^`]+)` --([A-Za-z0-9][A-Za-z0-9._:-]*)--> `([^`]+)`$")
});
static WITNESS_START: LazyLock<Regex> = LazyLock::new(|| pattern(r"^- [A-Z][A-Za-z ]*:"));

pub fn is_relation_type(value: &str) -> bool {
    RELATION_TYPE.is_match(value)
}

fn backticked(values: &[String]) -> String {
    values
        .iter()
        .map(|value| format!("`{value}`"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn gap_is_one_clean_line(gap: &str) -> bool {
    !gap.is_empty()
        && !gap
            .chars()
            .any(|character| matches!(character, '\r' | '\n') || character <= '\u{1f}' || character == '\u{7f}')
}

/// A row that breaks one of the rules the layout relies on, as the sentence says it.
fn check_row(row: &AnswerRow) -> Result<(), MarkdownFault> {
    let id = row.id;
    if trim(&row.answer).is_empty() {
        return fail(format!("{id} has an invalid status or answer"));
    }
    if trim(&row.answer) != row.answer {
        return fail(format!("{id} answer has surrounding whitespace"));
    }
    let witnesses = &row.witnesses;
    if !witnesses
        .concepts
        .iter()
        .all(|value| safe_vault_slug(value, SLUG_MAX_UNITS))
    {
        return fail(format!("{id} concept witnesses are malformed"));
    }
    if !witnesses
        .evidence
        .iter()
        .all(|value| is_persistable_evidence_reference(value))
        || !witnesses
            .paths
            .iter()
            .all(|value| is_persistable_path_witness(value))
    {
        return fail(format!("{id} path witnesses are malformed"));
    }
    if !witnesses.relations.iter().all(|relation| {
        safe_vault_slug(&relation.from, SLUG_MAX_UNITS)
            && safe_vault_slug(&relation.to, SLUG_MAX_UNITS)
            && safe_opaque(&relation.kind)
    }) {
        return fail(format!("{id} relation witnesses are malformed"));
    }
    if let Some(gap) = &row.gap {
        if trim(gap).is_empty() || trim(gap) != gap || !gap_is_one_clean_line(gap) {
            return fail(format!("{id} gap is malformed"));
        }
    }
    if row.status == AnswerStatus::Answered && row.gap.is_some() {
        return fail(format!("{id} answered row cannot declare a gap"));
    }
    if row.status != AnswerStatus::Answered && row.gap.is_none() {
        return fail(format!("{id} incomplete row must declare a gap"));
    }
    Ok(())
}

/// The complete section for `rows`, one per question in the order of [`QUESTIONS`].
pub fn render_competency_markdown(rows: &[AnswerRow]) -> Result<String, MarkdownFault> {
    let mut sections: Vec<String> = Vec::with_capacity(QUESTIONS.len());
    for question in &QUESTIONS {
        let Some(row) = rows.iter().find(|row| row.id == question.id) else {
            return fail("answers must contain exactly the five fixed competency ids");
        };
        check_row(row)?;
        let witnesses = &row.witnesses;
        let mut lines: Vec<String> = Vec::new();
        if !witnesses.concepts.is_empty() {
            lines.push(format!("- Concepts: {}", backticked(&witnesses.concepts)));
        }
        if !witnesses.relations.is_empty() {
            let rendered: Vec<String> = witnesses
                .relations
                .iter()
                .map(|relation| format!("`{}` --{}--> `{}`", relation.from, relation.kind, relation.to))
                .collect();
            lines.push(format!("- Relations: {}", rendered.join(", ")));
        }
        if !witnesses.evidence.is_empty() {
            lines.push(format!("- Evidence: {}", backticked(&witnesses.evidence)));
        }
        if !witnesses.paths.is_empty() {
            lines.push(format!("- Paths: {}", backticked(&witnesses.paths)));
        }
        if let Some(gap) = row.gap.as_deref().filter(|gap| !trim(gap).is_empty()) {
            lines.push(format!("- Gap: {gap}"));
        }
        let mut section = format!(
            "### {}: {}\n\n{}\n\n{}",
            question.id,
            row.status.word(),
            question.text,
            row.answer
        );
        if !lines.is_empty() {
            section.push_str("\n\n");
            section.push_str(&lines.join("\n"));
        }
        sections.push(section);
    }
    Ok(format!("{COMPETENCY_HEADING}\n\n{}\n", sections.join("\n\n")))
}

/// The section of the body, trailing space removed; fails unless there is exactly one.
fn competency_section(body: &str) -> Result<&str, MarkdownFault> {
    let starts = competency_heading_starts(body);
    let [start] = starts.as_slice() else {
        return fail("exactly one Competency answers section is required");
    };
    let after_heading = start + COMPETENCY_HEADING.len();
    let end = competency_section_end(body, after_heading);
    Ok(body
        .get(*start..end)
        .unwrap_or("")
        .trim_end_matches(answer_format::whitespace::is_whitespace))
}

/// `### ` headings at the start of a line (any line terminator ends one), each with its text up
/// to the next `\n` and the offsets of its first and last byte.
fn headings(content: &str) -> Vec<(usize, usize, &str)> {
    let mut found = Vec::new();
    let mut at = 0;
    while let Some(relative) = content.get(at..).and_then(|rest| rest.find("### ")) {
        let start = at + relative;
        let at_line_start = content
            .get(..start)
            .and_then(|before| before.chars().next_back())
            .is_none_or(is_line_terminator);
        let line_end = content.get(start..).and_then(|rest| rest.find('\n')).map_or(content.len(), |end| start + end);
        let text = content.get(start + 4..line_end).unwrap_or("");
        if at_line_start && !text.is_empty() {
            found.push((start, line_end, text));
            at = line_end;
        } else {
            at = start + 4;
        }
    }
    found
}

/// `<id>: <status>` or `<id> — <status>`, the status being one line of at least one character.
fn heading_status<'a>(text: &'a str, id: &str) -> Option<&'a str> {
    let rest = text.strip_prefix(id)?;
    let status = rest
        .strip_prefix(": ")
        .or_else(|| rest.strip_prefix(" \u{2014} "))?;
    (!status.is_empty() && !status.chars().any(is_line_terminator)).then_some(status)
}

fn backtick_values(
    value: &str,
    label: &str,
    valid: impl Fn(&str) -> bool,
) -> Result<Vec<String>, MarkdownFault> {
    let mut parsed: Vec<String> = Vec::new();
    for part in value.split(", ") {
        let literal = part
            .strip_prefix('`')
            .and_then(|rest| rest.strip_suffix('`'))
            .filter(|literal| !literal.is_empty() && !literal.contains('`'));
        let Some(literal) = literal.filter(|literal| valid(literal)) else {
            return fail(format!("{label} is malformed"));
        };
        parsed.push(literal.to_string());
    }
    let distinct: HashSet<&String> = parsed.iter().collect();
    if distinct.len() != parsed.len() {
        return fail(format!("{label} contains duplicates"));
    }
    Ok(parsed)
}

fn relation_values(value: &str, label: &str) -> Result<Vec<RelationWitness>, MarkdownFault> {
    let mut parsed: Vec<RelationWitness> = Vec::new();
    for part in value.split(", ") {
        let Some(found) = RELATION_ITEM.captures(part) else {
            return fail(format!("{label} is malformed"));
        };
        let (from, kind, to) = (&found[1], &found[2], &found[3]);
        if !safe_vault_slug(from, SLUG_MAX_UNITS) || !safe_vault_slug(to, SLUG_MAX_UNITS) {
            return fail(format!("{label} is malformed"));
        }
        parsed.push(RelationWitness {
            from: from.to_string(),
            to: to.to_string(),
            kind: kind.to_string(),
        });
    }
    let keys: HashSet<(&str, &str, &str)> = parsed
        .iter()
        .map(|relation| (relation.from.as_str(), relation.kind.as_str(), relation.to.as_str()))
        .collect();
    if keys.len() != parsed.len() {
        return fail(format!("{label} contains duplicates"));
    }
    Ok(parsed)
}

const WITNESS_ROW_ORDER: [&str; 5] = ["Concepts", "Relations", "Evidence", "Paths", "Gap"];

fn parse_row(id: &'static str, question: &str, status: AnswerStatus, block: &str) -> Result<AnswerRow, MarkdownFault> {
    let prefix = format!("\n\n{question}\n\n");
    let Some(answer_and_witnesses) = block.strip_prefix(prefix.as_str()) else {
        return fail(format!("{id} question or spacing is malformed"));
    };
    if answer_and_witnesses.is_empty() {
        return fail(format!("{id} answer is missing"));
    }
    let lines: Vec<&str> = answer_and_witnesses.split('\n').collect();
    let witness_start = (1..lines.len()).find(|&at| {
        lines.get(at - 1) == Some(&"") && lines.get(at).is_some_and(|line| WITNESS_START.is_match(line))
    });
    let answer_lines = lines.get(..witness_start.map_or(lines.len(), |at| at - 1)).unwrap_or(&[]);
    let witness_lines = witness_start.map_or(&[][..], |at| lines.get(at..).unwrap_or(&[]));
    let answer = answer_lines.join("\n");
    if trim(&answer).is_empty() || trim(&answer) != answer {
        return fail(format!("{id} answer is malformed"));
    }

    let mut witnesses = Witnesses::default();
    let mut gap: Option<String> = None;
    let mut seen: HashSet<&str> = HashSet::new();
    let mut previous: Option<usize> = None;
    for line in witness_lines {
        let Some((label, value)) = witness_row(line) else {
            return fail(format!("{id} witness row is malformed"));
        };
        if seen.contains(label) {
            return fail(format!("{id} {label} row is duplicated"));
        }
        let Some(order) = WITNESS_ROW_ORDER.iter().position(|known| *known == label) else {
            return fail(format!("{id} witness row {label} is unknown"));
        };
        if previous.is_some_and(|before| order <= before) {
            return fail(format!("{id} witness rows are out of order"));
        }
        previous = Some(order);
        seen.insert(label);
        match label {
            "Concepts" => {
                witnesses.concepts =
                    backtick_values(value, label, |slug| safe_vault_slug(slug, SLUG_MAX_UNITS))?;
            }
            "Relations" => witnesses.relations = relation_values(value, label)?,
            "Evidence" => {
                witnesses.evidence = backtick_values(value, label, is_persistable_evidence_reference)?;
            }
            "Paths" => witnesses.paths = backtick_values(value, label, is_persistable_path_witness)?,
            _ => {
                if trim(value).is_empty() || trim(value) != value {
                    return fail(format!("{id} Gap is malformed"));
                }
                gap = Some(value.to_string());
            }
        }
    }
    if let Some(gap) = &gap {
        if witness_lines.last().copied() != Some(format!("- Gap: {gap}").as_str()) {
            return fail(format!("{id} Gap must be the final row"));
        }
    }
    if status == AnswerStatus::Answered && gap.is_some() {
        return fail(format!("{id} answered row cannot declare a gap"));
    }
    if status != AnswerStatus::Answered && gap.is_none() {
        return fail(format!("{id} incomplete row must declare a gap"));
    }
    Ok(AnswerRow {
        id,
        status,
        answer,
        witnesses,
        gap,
    })
}

/// `- <Label>: <value>` with a value of at least one character and no line terminator.
fn witness_row(line: &str) -> Option<(&str, &str)> {
    let rest = line.strip_prefix("- ")?;
    let (label, value) = rest.split_once(": ")?;
    let label_ok = !label.is_empty() && label.chars().all(|character| character.is_ascii_alphabetic());
    (label_ok && !value.is_empty() && !value.chars().any(is_line_terminator)).then_some((label, value))
}

/// The five rows of the body's section, in question order; fails unless it is in the exact layout
/// [`render_competency_markdown`] writes.
pub fn parse_competency_markdown(body: &str) -> Result<Vec<AnswerRow>, MarkdownFault> {
    let section = competency_section(body)?;
    let opening = format!("{COMPETENCY_HEADING}\n\n");
    let Some(content) = section.strip_prefix(opening.as_str()) else {
        return fail("section spacing is malformed");
    };
    let found = headings(content);
    if found.len() != QUESTIONS.len() {
        return fail("exactly five competency rows are required");
    }
    let mut rows = Vec::with_capacity(QUESTIONS.len());
    for (index, ((_, heading_end, text), question)) in found.iter().zip(&QUESTIONS).enumerate() {
        let Some(status_word) = heading_status(text, question.id) else {
            return fail("competency ids must be fixed and ordered");
        };
        let Some(status) = AnswerStatus::from_word(status_word) else {
            return fail(format!("{} status is unknown", question.id));
        };
        let block_end = found.get(index + 1).map_or(content.len(), |next| next.0);
        let block = content
            .get(*heading_end..block_end)
            .unwrap_or("")
            .trim_end_matches('\n');
        rows.push(parse_row(question.id, question.text, status, block)?);
    }
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(id: &'static str, status: AnswerStatus, gap: Option<&str>) -> AnswerRow {
        AnswerRow {
            id,
            status,
            answer: format!("The {id} answer."),
            witnesses: Witnesses {
                concepts: vec!["shop".to_string()],
                relations: vec![RelationWitness {
                    from: "shop".to_string(),
                    to: "shop/pay".to_string(),
                    kind: "depends_on".to_string(),
                }],
                evidence: vec!["README.md".to_string()],
                paths: Vec::new(),
            },
            gap: gap.map(str::to_string),
        }
    }

    fn all_rows() -> Vec<AnswerRow> {
        QUESTIONS
            .iter()
            .map(|question| {
                if question.id == "scope" {
                    row(question.id, AnswerStatus::Answered, None)
                } else {
                    row(question.id, AnswerStatus::Partial, Some("not read yet"))
                }
            })
            .collect()
    }

    #[test]
    fn what_is_written_is_read_back_row_for_row_and_nothing_else_is_accepted() {
        let rows = all_rows();
        let text = render_competency_markdown(&rows).expect("renders");
        assert!(text.starts_with("## Competency answers\n\n### scope: answered\n\n"));
        let body = format!("# Shop\n\nIntro.\n\n{text}\n## Uncertainty\n\nNone.\n");
        assert_eq!(parse_competency_markdown(&body).expect("parses"), rows);
        let edited = body.replace("The scope answer.", "The scope answer, edited.\n\n- Note: x");
        assert!(parse_competency_markdown(&edited).is_err());
        let windows = body.replace('\n', "\r\n");
        assert!(parse_competency_markdown(&windows).is_err());
    }

    #[test]
    fn a_row_that_is_not_answered_must_say_its_gap_as_its_last_row() {
        let mut rows = all_rows();
        if let Some(first) = rows.first_mut() {
            first.gap = Some("x".to_string());
        }
        assert_eq!(
            render_competency_markdown(&rows).unwrap_err().0,
            "Invalid project competency Markdown: scope answered row cannot declare a gap"
        );
    }
}
